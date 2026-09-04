import { Incident } from './incident.js';

export interface DeskState {
  desk: string;
  last_run_at: string;
  open_incidents: string[];
  silence_streak: number;
  last_alert_at: string | null;
  since_cursor: string | null;
  updated_at?: string;
}

export interface DeltaDigest {
  desk: string;
  generated_at: string;
  last_run_at: string;
  silence_streak: number;
  new_incidents: Incident[];
  updated_incidents: Incident[];
  resolved_incident_ids: string[];
  open_incidents_count: number;
  is_quiet: boolean;
  prompt_input: string;
}
