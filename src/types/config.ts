export interface SpendCapsConfig {
  cost_mode: 'optimized' | 'legacy';
  daily_grok_weekly_pct_soft: number;
  daily_grok_weekly_pct_hard: number;
  daily_x_usd_soft: number;
  daily_x_usd_hard: number;
  pause_non_alert_on_hard: boolean;
  accounts_audit: {
    schedule: string[];
    timezone: string;
    action_on_soft_breach: string;
    action_on_hard_breach: string;
  };
}

export interface StaggerScheduleEntry {
  desk: string;
  minute_offset: number;
  cron_expression: string;
  brief_type: 'full' | 'flash' | 'cheap_stub';
  enabled_days: string[];
  description: string;
}

export interface CronStaggerConfig {
  timezone: string;
  stagger_plan: StaggerScheduleEntry[];
  reporter_packs: {
    times: string[];
    description: string;
  };
  accounts_spend_watch: {
    times: string[];
    description: string;
  };
}
