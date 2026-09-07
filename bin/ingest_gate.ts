#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Incident } from '../src/types/incident.js';
import { tokenJaccardSimilarity, computeClaimFingerprint } from '../src/store/dedupe.js';

export interface GateDecisionResult {
  decision: 'DROP' | 'BATCH' | 'ALERT';
  reason: string;
  matched_ids: string[];
  sim: number;
}

export interface GateOptions {
  postIds?: string[];
  claim?: string;
  text?: string;
  fingerprint?: string;
  storePath?: string;
}

export const ALERT_KEYWORD_REGEX =
  /(missile|asbm|strike|siren|intercept|sunk|seizure|kinetic|explosion|ballistic|ukmto|centcom|kuwait\s+ad)/i;

export const DEFAULT_STORE_PATH = '/home/box/agent-data/shared/desk-cost-control/store/incidents.jsonl';
export const FALLBACK_RELATIVE_STORE_PATH = 'store/incidents.jsonl';

export function resolveStorePath(customStorePath?: string): string {
  if (customStorePath) {
    return path.resolve(process.cwd(), customStorePath);
  }

  // Check if default production store path exists
  if (fs.existsSync(DEFAULT_STORE_PATH)) {
    return DEFAULT_STORE_PATH;
  }

  // Check relative path in current working directory
  const relativeStore = path.resolve(process.cwd(), FALLBACK_RELATIVE_STORE_PATH);
  if (fs.existsSync(relativeStore)) {
    return relativeStore;
  }

  // Also check data/incidents.jsonl if present
  const dataIncidents = path.resolve(process.cwd(), 'data/incidents.jsonl');
  if (fs.existsSync(dataIncidents)) {
    return dataIncidents;
  }

  // Fallback to DEFAULT_STORE_PATH
  return DEFAULT_STORE_PATH;
}

export function loadIncidentsFromStore(storeFilePath: string): Incident[] {
  if (!fs.existsSync(storeFilePath)) {
    return [];
  }

  try {
    const fileContent = fs.readFileSync(storeFilePath, 'utf-8');
    const lines = fileContent.split('\n').filter((line) => line.trim().length > 0);
    const incidents: Incident[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        incidents.push(parsed);
      } catch {
        // Skip corrupted lines
      }
    }

    return incidents;
  } catch {
    return [];
  }
}

export function appendDropAuditLog(
  storeFilePath: string,
  record: {
    timestamp: string;
    decision: 'DROP' | 'BATCH';
    reason: string;
    matched_ids: string[];
    sim: number;
    post_ids?: string[];
    claim?: string;
    text?: string;
    fingerprint?: string;
  }
): void {
  try {
    const dir = path.dirname(storeFilePath);
    const auditPath = path.join(dir, 'drop-audit.jsonl');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(auditPath, JSON.stringify(record) + '\n', 'utf-8');
  } catch {
    // Audit logging should not crash the gate
  }
}

export function evaluateIngestGate(
  options: GateOptions,
  incidents: Incident[]
): GateDecisionResult {
  const postIds = options.postIds || [];
  const claim = options.claim || '';
  const text = options.text || '';
  const candidateFp = options.fingerprint || (claim ? computeClaimFingerprint(claim) : (text ? computeClaimFingerprint(text) : ''));

  // Content to check for alert keywords (text, claim)
  const fullText = [text, claim].filter(Boolean).join(' ');
  const hasAlertKeyword = ALERT_KEYWORD_REGEX.test(fullText);

  // 1. Check for duplicate post_ids in store
  const matchedPostIds: string[] = [];
  const matchedIncidentIdsFromPost: string[] = [];

  if (postIds.length > 0) {
    const postIdsSet = new Set(postIds.map((id) => String(id).trim().toLowerCase()));

    for (const inc of incidents) {
      if (inc.post_ids && Array.isArray(inc.post_ids)) {
        for (const pid of inc.post_ids) {
          if (postIdsSet.has(String(pid).trim().toLowerCase())) {
            if (!matchedPostIds.includes(pid)) {
              matchedPostIds.push(pid);
            }
            if (inc.id && !matchedIncidentIdsFromPost.includes(inc.id)) {
              matchedIncidentIdsFromPost.push(inc.id);
            }
          }
        }
      }
    }
  }

  const isDuplicatePost = matchedPostIds.length > 0;

  if (isDuplicatePost) {
    if (hasAlertKeyword) {
      return {
        decision: 'ALERT',
        reason: `Duplicate post_id [${matchedPostIds.join(', ')}] matched incident [${matchedIncidentIdsFromPost.join(', ')}], but contains alert keywords`,
        matched_ids: matchedIncidentIdsFromPost.length > 0 ? matchedIncidentIdsFromPost : matchedPostIds,
        sim: 1.0
      };
    }

    return {
      decision: 'DROP',
      reason: `Duplicate post_id [${matchedPostIds.join(', ')}] already indexed in incident store`,
      matched_ids: matchedIncidentIdsFromPost.length > 0 ? matchedIncidentIdsFromPost : matchedPostIds,
      sim: 1.0
    };
  }

  // 2. Check claim Jaccard similarity vs existing summary/fingerprint
  let maxSim = 0.0;
  let bestMatchedIncidentId: string | null = null;
  let exactFpMatchIncidentId: string | null = null;

  const claimToCheck = claim || text;

  for (const inc of incidents) {
    // Check fingerprint match
    if (candidateFp && inc.claim_fingerprint && candidateFp === inc.claim_fingerprint) {
      exactFpMatchIncidentId = inc.id;
      maxSim = 1.0;
      break;
    }

    // Check Jaccard similarity against incident summary and claim_fingerprint text
    if (claimToCheck && inc.summary) {
      const sim = tokenJaccardSimilarity(claimToCheck, inc.summary);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatchedIncidentId = inc.id;
      }
    }
  }

  // Round maxSim to 4 decimal places for precision display
  const roundedSim = Math.round(maxSim * 10000) / 10000;

  if (exactFpMatchIncidentId) {
    if (hasAlertKeyword) {
      return {
        decision: 'ALERT',
        reason: `Exact claim fingerprint match with incident ${exactFpMatchIncidentId}, but contains alert keywords`,
        matched_ids: [exactFpMatchIncidentId],
        sim: 1.0
      };
    }

    return {
      decision: 'DROP',
      reason: `Exact claim fingerprint match with incident ${exactFpMatchIncidentId}`,
      matched_ids: [exactFpMatchIncidentId],
      sim: 1.0
    };
  }

  if (roundedSim >= 0.72 && bestMatchedIncidentId) {
    if (hasAlertKeyword) {
      return {
        decision: 'ALERT',
        reason: `High claim similarity (${roundedSim} >= 0.72) to incident ${bestMatchedIncidentId}, but contains alert keywords`,
        matched_ids: [bestMatchedIncidentId],
        sim: roundedSim
      };
    }

    return {
      decision: 'DROP',
      reason: `Duplicate claim similarity (${roundedSim} >= 0.72) vs incident ${bestMatchedIncidentId}`,
      matched_ids: [bestMatchedIncidentId],
      sim: roundedSim
    };
  }

  // 3. Check for ALERT keywords
  if (hasAlertKeyword) {
    const matched = fullText.match(ALERT_KEYWORD_REGEX);
    const kw = matched ? matched[0] : 'alert_keyword';
    return {
      decision: 'ALERT',
      reason: `Matched priority alert keyword: "${kw}"`,
      matched_ids: bestMatchedIncidentId ? [bestMatchedIncidentId] : [],
      sim: roundedSim
    };
  }

  // 4. Default to BATCH
  return {
    decision: 'BATCH',
    reason: 'Novel non-alert candidate queued for batch ingest',
    matched_ids: bestMatchedIncidentId && roundedSim > 0 ? [bestMatchedIncidentId] : [],
    sim: roundedSim
  };
}

export function parseArgs(args: string[]): GateOptions | { help: true } {
  const options: GateOptions = {};
  const postIds: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }

    if (arg === '--post-ids' || arg === '--post-id' || arg === '--post_ids' || arg === '--post_id') {
      const val = args[++i];
      if (val) {
        // Support comma-separated or space-separated post IDs
        const ids = val.split(',').map((s) => s.trim()).filter(Boolean);
        postIds.push(...ids);
      }
    } else if (arg.startsWith('--post-ids=') || arg.startsWith('--post_ids=')) {
      const val = arg.split('=')[1];
      if (val) {
        const ids = val.split(',').map((s) => s.trim()).filter(Boolean);
        postIds.push(...ids);
      }
    } else if (arg === '--claim') {
      options.claim = args[++i] || '';
    } else if (arg.startsWith('--claim=')) {
      options.claim = arg.slice('--claim='.length);
    } else if (arg === '--text') {
      options.text = args[++i] || '';
    } else if (arg.startsWith('--text=')) {
      options.text = arg.slice('--text='.length);
    } else if (arg === '--fingerprint') {
      options.fingerprint = args[++i] || '';
    } else if (arg.startsWith('--fingerprint=')) {
      options.fingerprint = arg.slice('--fingerprint='.length);
    } else if (arg === '--store') {
      options.storePath = args[++i] || '';
    } else if (arg.startsWith('--store=')) {
      options.storePath = arg.slice('--store='.length);
    }
  }

  if (postIds.length > 0) {
    options.postIds = postIds;
  }

  return options;
}

export function printHelp(): void {
  console.log(`Usage: npx tsx bin/ingest_gate.ts [OPTIONS]

Pre-LLM ingest gate for Middle East watch desk cost control & deduplication.
Evaluates candidate posts/claims against the shared incidents store before expensive LLM/X deep pulls.

Options:
  --post-ids <ids>       Comma-separated post IDs to check against seen index
  --claim <text>         Extracted claim text for Jaccard similarity comparison
  --text <text>          Full raw text of candidate post / report
  --fingerprint <fp>     Optional claim fingerprint override (fp_...)
  --store <path>         Path to incidents.jsonl store (default: /home/box/agent-data/shared/desk-cost-control/store/incidents.jsonl or store/incidents.jsonl)
  -h, --help             Show this help message

Output:
  Prints a single JSON line to stdout and exits 0:
  {"decision":"DROP"|"BATCH"|"ALERT","reason":"...","matched_ids":[...],"sim":0.0}

Decisions:
  DROP   - Duplicate post_id or claim Jaccard >= 0.72 vs existing incident (unless alert keywords present)
  BATCH  - Non-urgent or novel event queued for cadence batching
  ALERT  - Critical kinetic/alert keywords detected (missile|asbm|strike|siren|intercept|sunk|seizure|kinetic|explosion|ballistic|ukmto|centcom|kuwait ad)
`);
}

export function runCli(argv: string[]): void {
  const parsed = parseArgs(argv);

  if ('help' in parsed) {
    printHelp();
    process.exit(0);
  }

  const storePath = resolveStorePath(parsed.storePath);
  const incidents = loadIncidentsFromStore(storePath);
  const result = evaluateIngestGate(parsed, incidents);

  // Append DROP / BATCH-known to audit log beside store
  if (result.decision === 'DROP' || (result.decision === 'BATCH' && result.matched_ids.length > 0)) {
    appendDropAuditLog(storePath, {
      timestamp: new Date().toISOString(),
      decision: result.decision,
      reason: result.reason,
      matched_ids: result.matched_ids,
      sim: result.sim,
      post_ids: parsed.postIds,
      claim: parsed.claim,
      text: parsed.text,
      fingerprint: parsed.fingerprint
    });
  }

  console.log(JSON.stringify(result));
  process.exit(0);
}

// Only invoke CLI when executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ingest_gate.ts')) {
  runCli(process.argv.slice(2));
}
