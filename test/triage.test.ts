import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { TriageRouter, DropAuditLogger } from '../src/index.js';

describe('Triage Router Rules & Keywords', () => {
  let tmpDir: string;
  let auditLogger: DropAuditLogger;
  let router: TriageRouter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-test-'));
    auditLogger = new DropAuditLogger({
      logFilePath: path.join(tmpDir, 'drop-audit.jsonl')
    });
    router = new TriageRouter({ auditLogger });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('P0 ALERT Rules (Immediate Bypass, Never Batched)', () => {
    const alertTestCases = [
      {
        name: 'strike',
        text: 'Airstrike reported targeting radar installation near border',
        expectedTier: 'ALERT',
        expectedSeverity: '🔴'
      },
      {
        name: 'missile',
        text: 'Ballistic missile launch detected from western launch pad',
        expectedTier: 'ALERT',
        expectedSeverity: '🔴'
      },
      {
        name: 'drone intercept',
        text: 'Shahed drone intercepted and shot down over desert sector',
        expectedTier: 'ALERT',
        expectedSeverity: '🔴'
      },
      {
        name: 'mobilization',
        text: 'Full combat readiness and emergency mobilization declared',
        expectedTier: 'ALERT',
        expectedSeverity: '🔴'
      },
      {
        name: 'force movement',
        text: 'Carrier strike group deployed towards Arabian Sea',
        expectedTier: 'ALERT',
        expectedSeverity: '🟠'
      },
      {
        name: 'GPS jamming spike',
        text: 'Severe GPS jamming spike reported across eastern flight corridor',
        expectedTier: 'ALERT',
        expectedSeverity: '🟠'
      },
      {
        name: 'ADS-B dark clusters',
        text: 'ADS-B dark cluster observed with military transponders off',
        expectedTier: 'ALERT',
        expectedSeverity: '🟠'
      },
      {
        name: 'airspace close',
        text: 'Emergency NOTAM issued: airspace closed for civil flights',
        expectedTier: 'ALERT',
        expectedSeverity: '🔴'
      },
      {
        name: 'Kuwait AD/sirens',
        text: 'Sirens sounding in Kuwait City following Patriot engagement',
        expectedTier: 'ALERT',
        expectedSeverity: '🔴'
      },
      {
        name: 'Hormuz tanker hit/seizure',
        text: 'Commercial oil tanker boarded and seized in Strait of Hormuz by IRGC',
        expectedTier: 'ALERT',
        expectedSeverity: '🔴'
      }
    ];

    for (const tc of alertTestCases) {
      test(`properly triages ${tc.name} as ALERT (${tc.expectedSeverity})`, async () => {
        const result = await router.triage({ text: tc.text, desk: 'test-desk' });
        assert.strictEqual(result.action, 'ALERT');
        assert.strictEqual(result.severity_tier, 'ALERT');
        assert.strictEqual(result.severity, tc.expectedSeverity);
        assert.strictEqual(result.requiresImmediateBypass, true);
      });
    }
  });

  describe('P0 BATCH Rules', () => {
    test('routes diplomatic statements and official advisories to BATCH (🟡)', async () => {
      const result = await router.triage({
        text: 'Foreign ministry warns citizens against non-essential travel',
        desk: 'kuwait'
      });
      assert.strictEqual(result.action, 'BATCH');
      assert.strictEqual(result.severity, '🟡');
      assert.strictEqual(result.requiresImmediateBypass, false);
    });

    test('routes scheduled military exercises to BATCH (🟡)', async () => {
      const result = await router.triage({
        text: 'Scheduled joint maneuvers and live fire drill announced for next week',
        desk: 'gcc'
      });
      assert.strictEqual(result.action, 'BATCH');
      assert.strictEqual(result.severity, '🟡');
    });
  });

  describe('P0 DROP Rules & Audit Logging', () => {
    test('drops rhetoric cheerleading and logs for audit', async () => {
      const result = await router.triage({
        text: 'We will crush them! Glory to the resistance and victory is near!',
        desk: 'iran',
        postId: 'post_cheer_123'
      });

      assert.strictEqual(result.action, 'DROP');
      assert.strictEqual(result.severity, '🟢');

      const drops = await auditLogger.readRecentDrops();
      assert.strictEqual(drops.length, 1);
      assert.strictEqual(drops[0].postId, 'post_cheer_123');
      assert.ok(drops[0].matchedRules.includes('drop_propaganda_cheerleading'));
    });

    test('drops crypto spam and non-security lifestyle chatter', async () => {
      const result = await router.triage({
        text: 'Check out this new Bitcoin airdrop and 100x pump giveaway!',
        desk: 'general'
      });
      assert.strictEqual(result.action, 'DROP');
    });
  });

  describe('Ambiguity Escalation Protocol', () => {
    test('escalates ambiguous text containing security signals to BATCH (never DROP)', async () => {
      // Opinion thread mentioning an unconfirmed explosion
      const result = await router.triage({
        text: 'In my opinion something unusual happened, unconfirmed report of smoke and blast near warehouse',
        desk: 'levant'
      });

      // Should escalate to BATCH because of blast / smoke / unconfirmed report
      assert.strictEqual(result.action, 'BATCH');
      assert.strictEqual(result.escalated, true);
    });

    test('escalates conflicts between BATCH and DROP to BATCH', async () => {
      const result = await router.triage({
        text: 'Foreign ministry warns travelers while crypto bots spam replies',
        desk: 'gcc'
      });
      assert.strictEqual(result.action, 'BATCH');
      assert.strictEqual(result.escalated, true);
    });
  });

  describe('Cheap Classifier Hook', () => {
    test('uses cheap classifier fallback when injected', async () => {
      const routerWithClassifier = new TriageRouter({
        auditLogger,
        cheapClassifier: async (input) => {
          if (input.text.includes('custom_secret_keyword')) {
            return { action: 'ALERT', severity: '🔴', reason: 'Classifier flagged emergency' };
          }
          return null;
        }
      });

      const result = await routerWithClassifier.triage({
        text: 'Something is happening custom_secret_keyword here'
      });
      assert.strictEqual(result.action, 'ALERT');
      assert.strictEqual(result.severity, '🔴');
      assert.strictEqual(result.escalated, true);
    });
  });
});
