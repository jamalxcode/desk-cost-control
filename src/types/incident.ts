export type SeverityTier = 'DROP' | 'BATCH' | 'ALERT' | 'drop' | 'batch' | 'alert';
export type SeverityLevel = '🟢' | '🟡' | '🟠' | '🔴';
export type Severity = SeverityTier | SeverityLevel;

export type Confidence = 'CONFIRMED' | 'HIGH' | 'MEDIUM' | 'UNVERIFIED';
export type IncidentStatus = 'OPEN' | 'MONITORING' | 'RESOLVED';

export interface Incident {
  id: string;
  geo: string;
  type: string;
  severity: Severity;
  severity_tier?: 'DROP' | 'BATCH' | 'ALERT';
  severity_level?: SeverityLevel;
  first_seen: string;
  last_seen: string;
  sources: string[];
  desks: string[];
  claim_fingerprint: string;
  post_ids: string[];
  summary?: string;
  confidence?: Confidence;
  status?: IncidentStatus;
}

export interface Cluster {
  id: string;
  geo: string;
  type: string;
  window_start: string;
  window_end: string;
  claim_fingerprint: string;
  incident_ids: string[];
  post_ids: string[];
  desks: string[];
  first_seen: string;
  last_seen: string;
  incident_count: number;
}

export interface SeenPost {
  id: string;
  post_id: string;
  desk: string;
  seen_at: string;
  claim_hash: string;
  raw_text_snippet?: string;
}

export interface IncidentFilter {
  geo?: string;
  type?: string;
  severity_tier?: 'DROP' | 'BATCH' | 'ALERT';
  desk?: string;
  since?: string;
  status?: IncidentStatus;
}
