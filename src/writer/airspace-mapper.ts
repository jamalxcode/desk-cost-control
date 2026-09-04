import { DeskOutput, DeskItem, BudgetConfig } from '../types/output.js';

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  max_items: 5,
  max_chars_per_item: 280,
  max_summary_chars: 140,
  max_facts_per_item: 4
};

export interface AirspaceCardOptions {
  includeTimestamp?: boolean;
  includeSources?: boolean;
  includeConfidence?: boolean;
  suppressQuietCards?: boolean;
}

/**
 * Validates that a DeskOutput object strictly complies with schema and budget limits.
 */
export function validateDeskOutputBudget(
  output: DeskOutput,
  budget: BudgetConfig = DEFAULT_BUDGET_CONFIG
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!output.desk) errors.push('Missing desk identifier');
  if (!output.run_timestamp) errors.push('Missing run_timestamp');
  if (output.items && output.items.length > budget.max_items) {
    errors.push(
      `Item count (${output.items.length}) exceeds maximum budget limit of ${budget.max_items}`
    );
  }

  if (output.items) {
    for (let i = 0; i < output.items.length; i++) {
      const item = output.items[i];
      if (!item.item_id) errors.push(`Item #${i} missing item_id`);
      if (!item.geo) errors.push(`Item #${i} missing geo`);
      if (!item.headline) errors.push(`Item #${i} missing headline`);
      if (item.headline && item.headline.length > budget.max_summary_chars) {
        errors.push(
          `Item #${i} headline length (${item.headline.length}) exceeds budget max of ${budget.max_summary_chars}`
        );
      }
      if (item.facts) {
        for (let j = 0; j < item.facts.length; j++) {
          if (item.facts[j].length > budget.max_chars_per_item) {
            errors.push(
              `Item #${i} fact #${j} length (${item.facts[j].length}) exceeds budget max of ${budget.max_chars_per_item}`
            );
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Writer mapper: Transforms strict desk JSON output into the official house-style
 * emoji airspace / watch card outline.
 *
 * NOTE: The Writer agent strictly maps provided facts without inventing or hallucinatory live events.
 */
export function mapDeskOutputToAirspaceCard(
  output: DeskOutput,
  options: AirspaceCardOptions = {}
): string | null {
  const suppressQuiet = options.suppressQuietCards ?? true;

  // Enforce quiet policy: no output when quiet
  if (output.silence_declared || !output.items || output.items.length === 0) {
    if (suppressQuiet) {
      return null;
    }
    return `🟰 ${output.desk.toUpperCase()} WATCH DESK: NOMINAL 🟢 🟰\nStatus: Silence declared. Zero material developments.`;
  }

  const lines: string[] = [];
  const deskName = output.desk.toUpperCase();
  const highestSeverity = determineHighestSeverity(output.items);

  // House style 🟰 banner
  lines.push(`🟰 ${deskName} WATCH DESK ${highestSeverity} 🟰`);

  if (options.includeTimestamp !== false) {
    const timeFormatted = formatTimeUtc(output.run_timestamp);
    lines.push(`⏱️ ${timeFormatted} UTC`);
  }

  lines.push('');

  for (const item of output.items) {
    const emoji = item.severity_level || (item.severity_tier === 'ALERT' ? '🔴' : '🟡');
    lines.push(`${emoji} [${item.geo.toUpperCase()}] ${item.headline}`);

    if (item.facts && item.facts.length > 0) {
      for (const fact of item.facts) {
        lines.push(`  ▫️ ${fact}`);
      }
    }

    const metadataParts: string[] = [];
    if (options.includeConfidence !== false && item.confidence) {
      metadataParts.push(`Confidence: ${item.confidence}`);
    }
    if (options.includeSources !== false && item.sources && item.sources.length > 0) {
      metadataParts.push(`Sources: ${item.sources.join(', ')}`);
    }

    if (metadataParts.length > 0) {
      lines.push(`  ℹ️ ${metadataParts.join(' | ')}`);
    }

    lines.push('');
  }

  if (output.delta_summary) {
    lines.push(`📋 Delta: ${output.delta_summary}`);
  }

  return lines.join('\n').trim();
}

function determineHighestSeverity(items: DeskItem[]): string {
  if (items.some((i) => i.severity_tier === 'ALERT' || i.severity_level === '🔴')) return '🔴';
  if (items.some((i) => i.severity_level === '🟠')) return '🟠';
  if (items.some((i) => i.severity_tier === 'BATCH' || i.severity_level === '🟡')) return '🟡';
  return '🟢';
}

function formatTimeUtc(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toISOString().replace('T', ' ').substring(0, 16);
  } catch {
    return isoString;
  }
}
