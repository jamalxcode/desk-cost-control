import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  evaluateIngestGate,
  loadIncidentsFromStore,
  parseArgs,
  appendDropAuditLog
} from '../bin/ingest_gate.js';
import { Incident } from '../src/types/incident.js';

describe('Pre-LLM Ingest Gate CLI & Engine', () => {
  let tmpDir: string;
  let storePath: string;
  let sampleIncidents: Incident[];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gate-test-'));
    storePath = path.join(tmpDir, 'incidents.jsonl');

    sampleIncidents = [
      {
        id: 'inc_kw_001',
        geo: 'Kuwait',
        type: 'air_defense',
        severity: 'alert',
        severity_tier: 'ALERT',
        severity_level: '🔴',
        first_seen: '2026-09-07T08:00:00Z',
        last_seen: '2026-09-07T08:00:00Z',
        sources: ['@KuwaitMOD'],
        desks: ['kuwait'],
        claim_fingerprint: 'fp_air_def_kw',
        post_ids: ['1001', '1002'],
        summary: 'Patriot air defense battery engaged unidentified target over Bubiyan Island'
      },
      {
        id: 'inc_hormuz_002',
        geo: 'Hormuz',
        type: 'maritime_advisory',
        severity: 'batch',
        severity_tier: 'BATCH',
        severity_level: '🟡',
        first_seen: '2026-09-07T07:30:00Z',
        last_seen: '2026-09-07T07:30:00Z',
        sources: ['@UK_MTO'],
        desks: ['hormuz'],
        claim_fingerprint: 'fp_ukmto_adv',
        post_ids: ['2001'],
        summary: 'Commercial vessel reported routine regional maritime security update'
      }
    ];

    const lines = sampleIncidents.map((inc) => JSON.stringify(inc)).join('\n') + '\n';
    await fs.writeFile(storePath, lines, 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('loadIncidentsFromStore loads JSONL correctly', () => {
    const loaded = loadIncidentsFromStore(storePath);
    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[0].id, 'inc_kw_001');
    assert.strictEqual(loaded[1].id, 'inc_hormuz_002');
  });

  test('parseArgs correctly parses CLI flags', () => {
    const args = [
      '--post-ids', '1001,1002',
      '--claim', 'Patriot missile fired',
      '--text', 'Explosion heard in Kuwait',
      '--fingerprint', 'fp_custom_1',
      '--store', 'custom/store.jsonl'
    ];
    const parsed = parseArgs(args);
    assert.ok(!('help' in parsed));
    assert.deepStrictEqual(parsed.postIds, ['1001', '1002']);
    assert.strictEqual(parsed.claim, 'Patriot missile fired');
    assert.strictEqual(parsed.text, 'Explosion heard in Kuwait');
    assert.strictEqual(parsed.fingerprint, 'fp_custom_1');
    assert.strictEqual(parsed.storePath, 'custom/store.jsonl');
  });

  describe('Duplicate Post ID Handling', () => {
    test('drops candidate with duplicate post ID when no alert keywords present', () => {
      const result = evaluateIngestGate(
        {
          postIds: ['1001'],
          text: 'Routine traffic update on Arabian Gulf road'
        },
        sampleIncidents
      );

      assert.strictEqual(result.decision, 'DROP');
      assert.strictEqual(result.sim, 1.0);
      assert.ok(result.matched_ids.includes('inc_kw_001'));
      assert.ok(result.reason.includes('Duplicate post_id'));
    });

    test('promotes duplicate post ID to ALERT if alert keywords are present in text/claim', () => {
      const result = evaluateIngestGate(
        {
          postIds: ['1001'],
          text: 'New ballistic missile impact reported near northern border'
        },
        sampleIncidents
      );

      assert.strictEqual(result.decision, 'ALERT');
      assert.strictEqual(result.sim, 1.0);
      assert.ok(result.matched_ids.includes('inc_kw_001'));
      assert.ok(result.reason.includes('alert keywords'));
    });
  });

  describe('Claim Jaccard Similarity Handling', () => {
    test('drops candidate with Jaccard similarity >= 0.72 vs existing summary', () => {
      // Summary: 'Patriot air defense battery engaged unidentified target over Bubiyan Island'
      const candidateClaim = 'Patriot air defense battery engaged unidentified target over Bubiyan Island Kuwait';
      const result = evaluateIngestGate(
        {
          claim: candidateClaim,
          text: 'Local channel reports patriot air defense battery engaged unidentified target over Bubiyan Island'
        },
        sampleIncidents
      );

      // Note: text contains "patriot air defense" which does not trigger ALERT keywords if alert regex is:
      // missile|asbm|strike|siren|intercept|sunk|seizure|kinetic|explosion|ballistic|ukmto|centcom|kuwait ad
      // Wait, let's check: "patriot air defense" has neither missile/strike/siren/intercept/etc unless specified
      // If sim >= 0.72 and no alert keywords -> DROP
      assert.strictEqual(result.decision, 'DROP');
      assert.ok(result.sim >= 0.72);
      assert.ok(result.matched_ids.includes('inc_kw_001'));
    });

    test('drops candidate with exact fingerprint match if no alert keyword', () => {
      const result = evaluateIngestGate(
        {
          fingerprint: 'fp_air_def_kw',
          text: 'General news update'
        },
        sampleIncidents
      );

      assert.strictEqual(result.decision, 'DROP');
      assert.strictEqual(result.sim, 1.0);
      assert.ok(result.matched_ids.includes('inc_kw_001'));
    });
  });

  describe('Alert Keyword Detection', () => {
    const keywords = [
      'missile',
      'asbm',
      'strike',
      'siren',
      'intercept',
      'sunk',
      'seizure',
      'kinetic',
      'explosion',
      'ballistic',
      'ukmto',
      'centcom',
      'kuwait ad'
    ];

    for (const kw of keywords) {
      test(`flags new candidate containing alert keyword "${kw}" as ALERT`, () => {
        const result = evaluateIngestGate(
          {
            postIds: ['9999'],
            claim: `Breaking report regarding ${kw} in the region`,
            text: `Breaking report regarding ${kw} in the region`
          },
          sampleIncidents
        );

        assert.strictEqual(result.decision, 'ALERT');
        assert.ok(result.reason.includes('Matched priority alert keyword'));
      });
    }
  });

  describe('Default BATCH Handling', () => {
    test('routes novel candidate without alert keywords to BATCH', () => {
      const result = evaluateIngestGate(
        {
          postIds: ['8888'],
          claim: 'Foreign ministry issued standard diplomatic communique regarding bilateral trade',
          text: 'Foreign ministry issued standard diplomatic communique regarding bilateral trade'
        },
        sampleIncidents
      );

      assert.strictEqual(result.decision, 'BATCH');
      assert.ok(result.sim < 0.72);
      assert.strictEqual(result.reason, 'Novel non-alert candidate queued for batch ingest');
    });
  });

  describe('Audit Logging', () => {
    test('appends audit log next to store path', async () => {
      appendDropAuditLog(storePath, {
        timestamp: new Date().toISOString(),
        decision: 'DROP',
        reason: 'Duplicate post id',
        matched_ids: ['inc_kw_001'],
        sim: 1.0,
        post_ids: ['1001']
      });

      const auditPath = path.join(tmpDir, 'drop-audit.jsonl');
      const data = await fs.readFile(auditPath, 'utf-8');
      const record = JSON.parse(data.trim());
      assert.strictEqual(record.decision, 'DROP');
      assert.strictEqual(record.matched_ids[0], 'inc_kw_001');
    });
  });
});
