import { Incident } from '../types/incident.js';
import { DeskState, DeltaDigest } from '../types/state.js';

/**
 * Produces a compact delta digest comparing current active incidents against the desk's last run state.
 * This replaces full chat history / full historical replay with a token-efficient delta.
 */
export function produceDeltaDigest(
  deskState: DeskState,
  currentIncidents: Incident[],
  currentTimestamp: string = new Date().toISOString()
): DeltaDigest {
  const lastRunTime = new Date(deskState.last_run_at).getTime();
  const previouslyOpenSet = new Set(deskState.open_incidents);

  const newIncidents: Incident[] = [];
  const updatedIncidents: Incident[] = [];
  const activeIds = new Set<string>();

  for (const inc of currentIncidents) {
    if (inc.status === 'RESOLVED') continue;

    activeIds.add(inc.id);
    const incFirstSeen = new Date(inc.first_seen).getTime();
    const incLastSeen = new Date(inc.last_seen).getTime();

    if (!previouslyOpenSet.has(inc.id) || incFirstSeen >= lastRunTime) {
      // Brand new incident
      newIncidents.push(inc);
    } else if (incLastSeen > lastRunTime) {
      // Existing incident with new developments / reports since last run
      updatedIncidents.push(inc);
    }
  }

  // Find resolved incidents
  const resolvedIncidentIds = deskState.open_incidents.filter(
    (id) => !activeIds.has(id) || currentIncidents.find((i) => i.id === id)?.status === 'RESOLVED'
  );

  const isQuiet = newIncidents.length === 0 && updatedIncidents.length === 0;
  const promptInput = formatDeltaForPromptInput(
    deskState,
    newIncidents,
    updatedIncidents,
    resolvedIncidentIds,
    isQuiet,
    currentTimestamp
  );

  return {
    desk: deskState.desk,
    generated_at: currentTimestamp,
    last_run_at: deskState.last_run_at,
    silence_streak: isQuiet ? deskState.silence_streak + 1 : 0,
    new_incidents: newIncidents,
    updated_incidents: updatedIncidents,
    resolved_incident_ids: resolvedIncidentIds,
    open_incidents_count: activeIds.size,
    is_quiet: isQuiet,
    prompt_input: promptInput
  };
}

/**
 * Formats the delta digest into a concise, token-efficient string for Grok Bot prompt input.
 */
export function formatDeltaForPromptInput(
  deskState: DeskState,
  newIncidents: Incident[],
  updatedIncidents: Incident[],
  resolvedIncidentIds: string[],
  isQuiet: boolean,
  currentTimestamp: string
): string {
  if (isQuiet) {
    return [
      `[DESK DELTA: ${deskState.desk.toUpperCase()}]`,
      `Time: ${currentTimestamp}`,
      `Since Last Run: ${deskState.last_run_at}`,
      `Status: QUIET (Silence streak: ${deskState.silence_streak + 1})`,
      `Active Tracked Incidents: ${deskState.open_incidents.length}`,
      `Delta: No new material developments detected since last run.`,
      `Policy: Emit empty items or silence flag.`
    ].join('\n');
  }

  const lines: string[] = [
    `[DESK DELTA: ${deskState.desk.toUpperCase()}]`,
    `Time: ${currentTimestamp}`,
    `Since Last Run: ${deskState.last_run_at}`,
    `New Incidents: ${newIncidents.length} | Updated: ${updatedIncidents.length} | Resolved: ${resolvedIncidentIds.length}`
  ];

  if (newIncidents.length > 0) {
    lines.push('\n--- NEW INCIDENTS SINCE LAST RUN ---');
    for (const inc of newIncidents) {
      lines.push(
        `- [${inc.severity_level || '🟡'} ${inc.type}] (${inc.geo}) ID: ${inc.id}`
      );
      if (inc.summary) lines.push(`  Summary: ${inc.summary}`);
      if (inc.sources.length > 0) lines.push(`  Sources: ${inc.sources.join(', ')}`);
      if (inc.confidence) lines.push(`  Confidence: ${inc.confidence}`);
    }
  }

  if (updatedIncidents.length > 0) {
    lines.push('\n--- UPDATES ON EXISTING INCIDENTS ---');
    for (const inc of updatedIncidents) {
      lines.push(
        `- [UPDATE ${inc.severity_level || '🟡'} ${inc.type}] (${inc.geo}) ID: ${inc.id}`
      );
      if (inc.summary) lines.push(`  Latest: ${inc.summary}`);
      if (inc.sources.length > 0) lines.push(`  Sources: ${inc.sources.join(', ')}`);
    }
  }

  if (resolvedIncidentIds.length > 0) {
    lines.push(`\n--- RESOLVED INCIDENT IDS: ${resolvedIncidentIds.join(', ')} ---`);
  }

  return lines.join('\n');
}
