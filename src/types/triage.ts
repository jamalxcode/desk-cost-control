import { SeverityLevel } from './incident.js';

export type TriageAction = 'DROP' | 'BATCH' | 'ALERT';

export interface TriageResult {
  action: TriageAction;
  severity: SeverityLevel;
  severity_tier: TriageAction;
  reason: string;
  confidence: number;
  matchedRules: string[];
  escalated: boolean;
  requiresImmediateBypass: boolean;
}

export interface TriageInput {
  text: string;
  geo?: string;
  desk?: string;
  source?: string;
  postId?: string;
  metadata?: Record<string, unknown>;
}

export interface DropAuditRecord {
  timestamp: string;
  desk: string;
  postId?: string;
  textSnippet: string;
  reason: string;
  confidence: number;
  claimFingerprint: string;
  matchedRules: string[];
}
