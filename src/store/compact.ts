import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Incident, SeenPost } from '../types/incident.js';

export interface CompactOptions {
  retentionDays?: number;
  archiveDir?: string;
  archiveOldRecords?: boolean;
}

export interface CompactResult {
  originalIncidents: number;
  compactedIncidents: number;
  mergedIncidents: number;
  archivedIncidents: number;
  originalSeenPosts: number;
  compactedSeenPosts: number;
  incidentsFileSizeBefore: number;
  incidentsFileSizeAfter: number;
  timestamp: string;
}

/**
 * Compacts the append-only incident and seen-post JSONL files.
 * Deduplicates and consolidates incremental updates into canonical records.
 */
export async function compactIncidentStore(
  incidentsPath: string,
  seenPostsPath: string,
  options: CompactOptions = {}
): Promise<CompactResult> {
  const retentionDays = options.retentionDays ?? 14;
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const timestamp = new Date().toISOString();

  // 1. Process Incidents
  let originalIncidents = 0;
  let incidentsFileSizeBefore = 0;
  const incidentMap = new Map<string, Incident>();
  const archivedIncidentsList: Incident[] = [];

  try {
    const stat = await fs.stat(incidentsPath);
    incidentsFileSizeBefore = stat.size;

    const content = await fs.readFile(incidentsPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    originalIncidents = lines.length;

    for (const line of lines) {
      try {
        const record: Incident = JSON.parse(line);
        if (!record.id) continue;

        if (incidentMap.has(record.id)) {
          // Merge updates into canonical record
          const existing = incidentMap.get(record.id)!;
          const merged: Incident = {
            ...existing,
            ...record,
            first_seen: new Date(
              Math.min(new Date(existing.first_seen).getTime(), new Date(record.first_seen).getTime())
            ).toISOString(),
            last_seen: new Date(
              Math.max(new Date(existing.last_seen).getTime(), new Date(record.last_seen).getTime())
            ).toISOString(),
            sources: Array.from(new Set([...existing.sources, ...record.sources])),
            desks: Array.from(new Set([...existing.desks, ...record.desks])),
            post_ids: Array.from(new Set([...existing.post_ids, ...record.post_ids])),
            claim_fingerprint: record.claim_fingerprint || existing.claim_fingerprint,
            summary: record.summary || existing.summary,
            status: record.status || existing.status
          };
          incidentMap.set(record.id, merged);
        } else {
          incidentMap.set(record.id, record);
        }
      } catch {
        // Skip corrupted line
      }
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }

  // Filter archived vs active
  const activeIncidents: Incident[] = [];
  for (const inc of incidentMap.values()) {
    const incTime = new Date(inc.last_seen || inc.first_seen).getTime();
    if (options.archiveOldRecords && incTime < cutoffTime) {
      archivedIncidentsList.push(inc);
    } else {
      activeIncidents.push(inc);
    }
  }

  // Write compacted active incidents atomically
  const tempIncidentsPath = `${incidentsPath}.tmp.${Date.now()}`;
  const compactedIncidentsContent = activeIncidents.map((inc) => JSON.stringify(inc)).join('\n') + (activeIncidents.length > 0 ? '\n' : '');
  await fs.writeFile(tempIncidentsPath, compactedIncidentsContent, 'utf-8');
  await fs.rename(tempIncidentsPath, incidentsPath);

  // Write archived records if requested
  if (options.archiveOldRecords && archivedIncidentsList.length > 0) {
    const archiveDir = options.archiveDir || path.dirname(incidentsPath);
    await fs.mkdir(archiveDir, { recursive: true });
    const archivePath = path.join(archiveDir, 'incidents.archive.jsonl');
    const archiveContent = archivedIncidentsList.map((inc) => JSON.stringify(inc)).join('\n') + '\n';
    await fs.appendFile(archivePath, archiveContent, 'utf-8');
  }

  const statAfter = await fs.stat(incidentsPath);
  const incidentsFileSizeAfter = statAfter.size;

  // 2. Process Seen Posts
  let originalSeenPosts = 0;
  let compactedSeenPosts = 0;
  const seenPostMap = new Map<string, SeenPost>();

  try {
    const content = await fs.readFile(seenPostsPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    originalSeenPosts = lines.length;

    for (const line of lines) {
      try {
        const record: SeenPost = JSON.parse(line);
        const key = record.id || record.post_id;
        if (!key) continue;

        const postTime = new Date(record.seen_at).getTime();
        // Prune older than retention window if cutoff enabled
        if (!options.archiveOldRecords || postTime >= cutoffTime) {
          seenPostMap.set(key, record);
        }
      } catch {
        // Skip corrupted line
      }
    }

    const tempSeenPostsPath = `${seenPostsPath}.tmp.${Date.now()}`;
    const compactedSeenPostsContent = Array.from(seenPostMap.values())
      .map((p) => JSON.stringify(p))
      .join('\n') + (seenPostMap.size > 0 ? '\n' : '');

    await fs.writeFile(tempSeenPostsPath, compactedSeenPostsContent, 'utf-8');
    await fs.rename(tempSeenPostsPath, seenPostsPath);
    compactedSeenPosts = seenPostMap.size;
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }

  return {
    originalIncidents,
    compactedIncidents: activeIncidents.length,
    mergedIncidents: originalIncidents - incidentMap.size,
    archivedIncidents: archivedIncidentsList.length,
    originalSeenPosts,
    compactedSeenPosts,
    incidentsFileSizeBefore,
    incidentsFileSizeAfter,
    timestamp
  };
}
