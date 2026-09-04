import { Incident, Cluster } from '../types/incident.js';
import { isClaimDuplicate } from './dedupe.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Checks if two timestamps fall within a 6-hour window.
 */
export function isWithin6HourWindow(time1Iso: string, time2Iso: string): boolean {
  const t1 = new Date(time1Iso).getTime();
  const t2 = new Date(time2Iso).getTime();
  if (isNaN(t1) || isNaN(t2)) return false;
  return Math.abs(t1 - t2) <= SIX_HOURS_MS;
}

/**
 * Generates a deterministic cluster ID from geo, type, and window start.
 */
export function generateClusterId(geo: string, type: string, windowStartIso: string): string {
  const cleanGeo = geo.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const cleanType = type.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const windowTime = new Date(windowStartIso).getTime();
  // Round to nearest 6 hour bucket
  const bucketIndex = Math.floor(windowTime / SIX_HOURS_MS);
  return `clus_${cleanGeo}_${cleanType}_${bucketIndex}`;
}

/**
 * Checks whether an incident matches an existing cluster.
 * Match criteria:
 * 1. Matching geo (case-insensitive) AND matching type (case-insensitive)
 * 2. Incident timestamp falls within the cluster's 6-hour window (or within 6h of last_seen)
 * 3. OR matching claim fingerprint / near-duplicate claim summary
 */
export function incidentMatchesCluster(incident: Incident, cluster: Cluster): boolean {
  const geoMatch = incident.geo.trim().toLowerCase() === cluster.geo.trim().toLowerCase();
  const typeMatch = incident.type.trim().toLowerCase() === cluster.type.trim().toLowerCase();

  const incTime = new Date(incident.first_seen || incident.last_seen).getTime();
  const clusterStart = new Date(cluster.window_start).getTime();
  const clusterEnd = new Date(cluster.window_end).getTime();

  const timeMatch = incTime >= clusterStart - 1000 && incTime <= clusterEnd + 1000;
  const rollingWindowMatch = Math.abs(incTime - new Date(cluster.last_seen).getTime()) <= SIX_HOURS_MS;

  if (geoMatch && typeMatch && (timeMatch || rollingWindowMatch)) {
    return true;
  }

  // Cross-geo or slightly different type match if claim is near-duplicate
  if (incident.summary && cluster.claim_fingerprint) {
    if (incident.claim_fingerprint === cluster.claim_fingerprint) {
      return timeMatch || rollingWindowMatch;
    }
  }

  return false;
}

/**
 * Merges an incident into a cluster.
 */
export function mergeIncidentIntoCluster(cluster: Cluster, incident: Incident): Cluster {
  const incFirstSeen = new Date(incident.first_seen).getTime();
  const incLastSeen = new Date(incident.last_seen).getTime();
  const clusterFirstSeen = new Date(cluster.first_seen).getTime();
  const clusterLastSeen = new Date(cluster.last_seen).getTime();

  const earliestSeen = Math.min(incFirstSeen, clusterFirstSeen);
  const latestSeen = Math.max(incLastSeen, clusterLastSeen);

  const incidentIds = Array.from(new Set([...cluster.incident_ids, incident.id]));
  const postIds = Array.from(new Set([...cluster.post_ids, ...incident.post_ids]));
  const desks = Array.from(new Set([...cluster.desks, ...incident.desks]));

  const windowStart = new Date(earliestSeen).toISOString();
  const windowEnd = new Date(earliestSeen + SIX_HOURS_MS).toISOString();

  return {
    ...cluster,
    incident_ids: incidentIds,
    post_ids: postIds,
    desks,
    first_seen: new Date(earliestSeen).toISOString(),
    last_seen: new Date(latestSeen).toISOString(),
    window_start: windowStart,
    window_end: windowEnd,
    incident_count: incidentIds.length
  };
}

/**
 * Creates a new cluster from a single incident.
 */
export function createClusterFromIncident(incident: Incident): Cluster {
  const firstSeenDate = new Date(incident.first_seen || new Date().toISOString());
  const lastSeenDate = new Date(incident.last_seen || firstSeenDate.toISOString());

  const windowStart = firstSeenDate.toISOString();
  const windowEnd = new Date(firstSeenDate.getTime() + SIX_HOURS_MS).toISOString();
  const clusterId = generateClusterId(incident.geo, incident.type, windowStart);

  return {
    id: clusterId,
    geo: incident.geo,
    type: incident.type,
    window_start: windowStart,
    window_end: windowEnd,
    claim_fingerprint: incident.claim_fingerprint,
    incident_ids: [incident.id],
    post_ids: [...incident.post_ids],
    desks: [...incident.desks],
    first_seen: firstSeenDate.toISOString(),
    last_seen: lastSeenDate.toISOString(),
    incident_count: 1
  };
}

/**
 * Clusters an array of incidents by place + type + 6h window.
 */
export function clusterIncidents(incidents: Incident[]): Cluster[] {
  const clusters: Cluster[] = [];

  // Sort chronologically
  const sorted = [...incidents].sort(
    (a, b) => new Date(a.first_seen).getTime() - new Date(b.first_seen).getTime()
  );

  for (const incident of sorted) {
    let matched = false;
    for (let i = 0; i < clusters.length; i++) {
      if (incidentMatchesCluster(incident, clusters[i])) {
        clusters[i] = mergeIncidentIntoCluster(clusters[i], incident);
        matched = true;
        break;
      }
    }

    if (!matched) {
      clusters.push(createClusterFromIncident(incident));
    }
  }

  return clusters;
}
