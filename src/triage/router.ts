import { TriageInput, TriageResult, TriageAction } from '../types/triage.js';
import { ALERT_RULES, BATCH_RULES, DROP_RULES, RulePattern } from './keywords.js';
import { DropAuditLogger } from './audit-logger.js';
import { computeClaimFingerprint } from '../store/dedupe.js';

export type CheapClassifier = (input: TriageInput) => Promise<Partial<TriageResult> | null>;

export interface TriageRouterOptions {
  auditLogger?: DropAuditLogger;
  cheapClassifier?: CheapClassifier;
  customAlertRules?: RulePattern[];
  customBatchRules?: RulePattern[];
  customDropRules?: RulePattern[];
}

/**
 * Ambiguity indicator patterns: words that signal possible kinetic activity,
 * rumors, or breaking events that prevent a safe DROP decision.
 */
const AMBIGUITY_ESCALATION_PATTERNS = [
  /\b(blast|explosion|smoke|gunfire|clashes|unconfirmed\s+report|breaking|alert|fireball|interception|drone|siren|missile|tanker|oil\s+field|radar|squawk|blackout)\b/i
];

export class TriageRouter {
  private auditLogger: DropAuditLogger;
  private cheapClassifier?: CheapClassifier;
  private alertRules: RulePattern[];
  private batchRules: RulePattern[];
  private dropRules: RulePattern[];

  constructor(options: TriageRouterOptions = {}) {
    this.auditLogger = options.auditLogger || new DropAuditLogger();
    this.cheapClassifier = options.cheapClassifier;
    this.alertRules = options.customAlertRules || ALERT_RULES;
    this.batchRules = options.customBatchRules || BATCH_RULES;
    this.dropRules = options.customDropRules || DROP_RULES;
  }

  /**
   * Triages an incoming post/claim text into DROP | BATCH | ALERT.
   * Enforces that ALERT is never batched and ambiguous items always escalate.
   */
  public async triage(input: TriageInput): Promise<TriageResult> {
    const text = input.text.trim();
    if (!text) {
      return this.handleDrop(input, 'Empty input text', 1.0, ['drop_empty']);
    }

    // 1. Check ALERT rules (highest priority, immediate bypass)
    const matchedAlerts = this.alertRules.filter((r) => r.pattern.test(text));
    if (matchedAlerts.length > 0) {
      // Pick highest severity/weight alert
      const topAlert = matchedAlerts.reduce((prev, curr) =>
        curr.weight > prev.weight ? curr : prev
      );

      return {
        action: 'ALERT',
        severity: topAlert.severity,
        severity_tier: 'ALERT',
        reason: `Matched critical alert rule: ${topAlert.description}`,
        confidence: topAlert.weight,
        matchedRules: matchedAlerts.map((r) => r.id),
        escalated: false,
        requiresImmediateBypass: true
      };
    }

    // 2. Check BATCH rules
    const matchedBatches = this.batchRules.filter((r) => r.pattern.test(text));

    // 3. Check DROP rules
    const matchedDrops = this.dropRules.filter((r) => r.pattern.test(text));

    // 4. Check for ambiguous signals
    const hasAmbiguousKeywords = AMBIGUITY_ESCALATION_PATTERNS.some((p) => p.test(text));

    // Check if classifier should be called for borderline cases
    if (
      this.cheapClassifier &&
      ((matchedBatches.length > 0 && matchedDrops.length > 0) ||
        (matchedBatches.length === 0 && matchedDrops.length === 0))
    ) {
      try {
        const classified = await this.cheapClassifier(input);
        if (classified && classified.action) {
          if (classified.action === 'ALERT') {
            return {
              action: 'ALERT',
              severity: classified.severity || '🔴',
              severity_tier: 'ALERT',
              reason: classified.reason || 'Escalated by cheap classifier to ALERT',
              confidence: classified.confidence ?? 0.85,
              matchedRules: ['cheap_classifier_alert'],
              escalated: true,
              requiresImmediateBypass: true
            };
          }
          if (classified.action === 'BATCH') {
            return {
              action: 'BATCH',
              severity: classified.severity || '🟡',
              severity_tier: 'BATCH',
              reason: classified.reason || 'Categorized by cheap classifier as BATCH',
              confidence: classified.confidence ?? 0.75,
              matchedRules: ['cheap_classifier_batch'],
              escalated: false,
              requiresImmediateBypass: false
            };
          }
        }
      } catch {
        // Fallback to rules on classifier failure
      }
    }

    // 5. Conflict Resolution: If both BATCH and DROP match -> ESCALATE TO BATCH (never DROP)
    if (matchedBatches.length > 0 && matchedDrops.length > 0) {
      const topBatch = matchedBatches[0];
      return {
        action: 'BATCH',
        severity: topBatch.severity,
        severity_tier: 'BATCH',
        reason: `Ambiguity detected (matched both BATCH and DROP rules). Escalated to BATCH for safety.`,
        confidence: 0.7,
        matchedRules: [...matchedBatches.map((r) => r.id), ...matchedDrops.map((r) => r.id)],
        escalated: true,
        requiresImmediateBypass: false
      };
    }

    // 6. If only BATCH matches
    if (matchedBatches.length > 0) {
      const topBatch = matchedBatches[0];
      return {
        action: 'BATCH',
        severity: topBatch.severity,
        severity_tier: 'BATCH',
        reason: `Matched monitoring rule: ${topBatch.description}`,
        confidence: topBatch.weight,
        matchedRules: matchedBatches.map((r) => r.id),
        escalated: false,
        requiresImmediateBypass: false
      };
    }

    // 7. If DROP matches, check if ambiguity escalation applies
    if (matchedDrops.length > 0) {
      const topDrop = matchedDrops[0];

      // If text contains breaking/security keywords, escalate to BATCH instead of dropping
      if (hasAmbiguousKeywords) {
        return {
          action: 'BATCH',
          severity: '🟡',
          severity_tier: 'BATCH',
          reason: `Matched drop rule (${topDrop.id}) but contains unverified security keywords. Escalated to BATCH.`,
          confidence: 0.6,
          matchedRules: matchedDrops.map((r) => r.id),
          escalated: true,
          requiresImmediateBypass: false
        };
      }

      // Safe DROP decision
      return this.handleDrop(
        input,
        `Matched drop filter: ${topDrop.description}`,
        topDrop.weight,
        matchedDrops.map((r) => r.id)
      );
    }

    // 8. No rules matched at all -> AMBIGUOUS CASE: ESCALATE TO BATCH (Never silently DROP unknown events)
    if (hasAmbiguousKeywords) {
      return {
        action: 'BATCH',
        severity: '🟡',
        severity_tier: 'BATCH',
        reason: 'Unclassified text containing security/kinetic indicators. Escalated to BATCH.',
        confidence: 0.65,
        matchedRules: ['ambiguity_keyword_escalation'],
        escalated: true,
        requiresImmediateBypass: false
      };
    }

    // Default unclassified chatter without security signals: Drop with audit log
    return this.handleDrop(
      input,
      'No security relevance or watch desk keyword detected',
      0.6,
      ['drop_unclassified']
    );
  }

  private async handleDrop(
    input: TriageInput,
    reason: string,
    confidence: number,
    matchedRules: string[]
  ): Promise<TriageResult> {
    const claimFp = computeClaimFingerprint(input.text);

    // Record drop to audit logger
    await this.auditLogger.logDrop({
      timestamp: new Date().toISOString(),
      desk: input.desk || 'general',
      postId: input.postId,
      textSnippet: input.text.substring(0, 280),
      reason,
      confidence,
      claimFingerprint: claimFp,
      matchedRules
    });

    return {
      action: 'DROP',
      severity: '🟢',
      severity_tier: 'DROP',
      reason,
      confidence,
      matchedRules,
      escalated: false,
      requiresImmediateBypass: false
    };
  }
}
