import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Incident, IncidentFilter, SeenPost, Cluster } from '../types/incident.js';
import { hashPostId, isClaimDuplicate, computeClaimFingerprint } from './dedupe.js';
import { clusterIncidents, isWithin6HourWindow } from './cluster.js';

export interface IncidentStoreOptions {
  baseDir?: string;
  incidentsFilename?: string;
  seenPostsFilename?: string;
}

export class IncidentStore {
  private baseDir: string;
  private incidentsPath: string;
  private seenPostsPath: string;
  private seenPostIdCache: Set<string> = new Set();
  private initialized: boolean = false;

  constructor(options: IncidentStoreOptions = {}) {
    this.baseDir = options.baseDir || path.join(process.cwd(), 'data');
    this.incidentsPath = path.join(this.baseDir, options.incidentsFilename || 'incidents.jsonl');
    this.seenPostsPath = path.join(this.baseDir, options.seenPostsFilename || 'seen_posts.jsonl');
  }

  /**
   * Ensures base directory exists and loads in-memory dedupe caches.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(this.baseDir, { recursive: true });

    // Load seen posts into memory cache
    try {
      const data = await fs.readFile(this.seenPostsPath, 'utf-8');
      const lines = data.split('\n').filter((line) => line.trim().length > 0);
      for (const line of lines) {
        try {
          const record: SeenPost = JSON.parse(line);
          if (record.id) this.seenPostIdCache.add(record.id);
          if (record.post_id) {
            this.seenPostIdCache.add(record.post_id);
            this.seenPostIdCache.add(hashPostId(record.post_id));
          }
        } catch {
          // ignore corrupted lines
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    this.initialized = true;
  }

  /**
   * Appends an incident to the append-only JSONL file.
   */
  public async appendIncident(incident: Incident): Promise<void> {
    await this.init();
    const line = JSON.stringify(incident) + '\n';
    await fs.appendFile(this.incidentsPath, line, 'utf-8');

    // Also mark post IDs as seen
    if (incident.post_ids && incident.post_ids.length > 0) {
      for (const postId of incident.post_ids) {
        await this.recordSeenPost({
          id: hashPostId(postId),
          post_id: postId,
          desk: incident.desks[0] || 'unknown',
          seen_at: incident.last_seen || new Date().toISOString(),
          claim_hash: incident.claim_fingerprint,
          raw_text_snippet: incident.summary?.substring(0, 280)
        });
      }
    }
  }

  /**
   * Appends multiple incidents in a batch.
   */
  public async appendIncidents(incidents: Incident[]): Promise<void> {
    for (const inc of incidents) {
      await this.appendIncident(inc);
    }
  }

  /**
   * Checks if an X post ID has already been seen across any watch desk.
   */
  public async isPostSeen(postId: string): Promise<boolean> {
    await this.init();
    const hash = hashPostId(postId);
    return this.seenPostIdCache.has(hash) || this.seenPostIdCache.has(postId);
  }

  /**
   * Records a seen post to the seen_posts.jsonl index.
   */
  public async recordSeenPost(post: SeenPost): Promise<void> {
    await this.init();
    const hash = post.id || hashPostId(post.post_id);
    if (this.seenPostIdCache.has(hash) && this.seenPostIdCache.has(post.post_id)) {
      return;
    }

    this.seenPostIdCache.add(hash);
    this.seenPostIdCache.add(post.post_id);
    const line = JSON.stringify(post) + '\n';
    await fs.appendFile(this.seenPostsPath, line, 'utf-8');
  }

  /**
   * Reads all incidents from the JSONL log.
   */
  public async readAllIncidents(): Promise<Incident[]> {
    await this.init();
    try {
      const data = await fs.readFile(this.incidentsPath, 'utf-8');
      const lines = data.split('\n').filter((line) => line.trim().length > 0);
      const incidents: Incident[] = [];

      for (const line of lines) {
        try {
          incidents.push(JSON.parse(line));
        } catch {
          // ignore corrupted lines
        }
      }

      return incidents;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * Finds a duplicate or near-duplicate incident within the last 6-hour window.
   */
  public async findDuplicateIncident(
    claimText: string,
    geo: string,
    type: string,
    timestamp: string = new Date().toISOString()
  ): Promise<Incident | null> {
    const all = await this.readAllIncidents();
    const normalizedClaim = computeClaimFingerprint(claimText);

    for (let i = all.length - 1; i >= 0; i--) {
      const inc = all[i];

      // Check time window (within 6h)
      if (!isWithin6HourWindow(inc.last_seen || inc.first_seen, timestamp)) {
        continue;
      }

      // Check exact claim fingerprint match
      if (inc.claim_fingerprint && inc.claim_fingerprint === normalizedClaim) {
        return inc;
      }

      // Check geo + type match with text similarity
      const sameGeo = inc.geo.trim().toLowerCase() === geo.trim().toLowerCase();
      const sameType = inc.type.trim().toLowerCase() === type.trim().toLowerCase();

      if (sameGeo && sameType) {
        if (inc.summary && isClaimDuplicate(inc.summary, claimText)) {
          return inc;
        }
      }
    }

    return null;
  }

  /**
   * Queries incidents matching specified filter criteria.
   */
  public async queryIncidents(filter: IncidentFilter): Promise<Incident[]> {
    const incidents = await this.readAllIncidents();

    return incidents.filter((inc) => {
      if (filter.geo && inc.geo.toLowerCase() !== filter.geo.toLowerCase()) {
        return false;
      }
      if (filter.type && inc.type.toLowerCase() !== filter.type.toLowerCase()) {
        return false;
      }
      if (filter.desk && !inc.desks.some((d) => d.toLowerCase() === filter.desk!.toLowerCase())) {
        return false;
      }
      if (filter.status && inc.status !== filter.status) {
        return false;
      }
      if (filter.since) {
        const incTime = new Date(inc.last_seen || inc.first_seen).getTime();
        const sinceTime = new Date(filter.since).getTime();
        if (incTime < sinceTime) return false;
      }
      return true;
    });
  }

  /**
   * Gets incident clusters for active incidents.
   */
  public async getClusters(): Promise<Cluster[]> {
    const incidents = await this.readAllIncidents();
    return clusterIncidents(incidents);
  }

  public getIncidentsPath(): string {
    return this.incidentsPath;
  }

  public getSeenPostsPath(): string {
    return this.seenPostsPath;
  }
}
