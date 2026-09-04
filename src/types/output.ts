import { Confidence, SeverityLevel } from './incident.js';
import { TriageAction } from './triage.js';

export interface DeskItem {
  item_id: string;
  geo: string;
  type: string;
  severity_tier: TriageAction;
  severity_level: SeverityLevel;
  headline: string;
  facts: string[];
  sources: string[];
  confidence: Confidence;
  post_ids?: string[];
}

export interface DeskOutput {
  desk: string;
  run_timestamp: string;
  status: 'QUIET' | 'ACTIVE' | 'ALERT';
  silence_declared: boolean;
  items: DeskItem[];
  delta_summary?: string;
}

export interface BudgetConfig {
  max_items: number;
  max_chars_per_item: number;
  max_summary_chars: number;
  max_facts_per_item: number;
}
