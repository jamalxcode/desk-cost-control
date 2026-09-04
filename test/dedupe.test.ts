import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  hashPostId,
  normalizeClaimText,
  computeClaimFingerprint,
  isClaimDuplicate,
  IncidentStore
} from '../src/index.js';

describe('Deduplication & Normalization', () => {
  test('hashPostId computes deterministic lowercase SHA-256 hash', () => {
    const id1 = '189384729103847582';
    const id2 = ' 189384729103847582 ';
    assert.strictEqual(hashPostId(id1), hashPostId(id2));
    assert.strictEqual(hashPostId(id1).length, 64);
  });

  test('normalizeClaimText strips URLs, handles, emojis, and normalizes spaces', () => {
    const raw = '🚨 BREAKING: Missile intercepted over Kuwait! Check https://t.co/xyz123 via @KuwaitNews #Kuwait #Breaking';
    const normalized = normalizeClaimText(raw);
    assert.strictEqual(normalized, 'breaking missile intercepted over kuwait check via kuwait breaking');
  });

  test('isClaimDuplicate detects identical and near-duplicate reports', () => {
    const claim1 = 'Three drones intercepted by air defense over Bubiyan Island Kuwait';
    const claim2 = 'Air defense intercepted 3 drones over Bubiyan Island in Kuwait';
    const claim3 = 'Crude oil prices steady at 82 dollars per barrel in Asian trading';

    assert.strictEqual(isClaimDuplicate(claim1, claim1), true);
    assert.strictEqual(isClaimDuplicate(claim1, claim2), true);
    assert.strictEqual(isClaimDuplicate(claim1, claim3), false);
  });

  test('computeClaimFingerprint generates stable composite fingerprints', () => {
    const text = 'IRGC fast boats sighted near Strait of Hormuz TSS';
    const fp1 = computeClaimFingerprint(text);
    const fp2 = computeClaimFingerprint(text);
    assert.strictEqual(fp1, fp2);
    assert.ok(fp1.startsWith('fp_'));
  });
});

describe('IncidentStore & SeenPost Indexing', () => {
  let tmpDir: string;
  let store: IncidentStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'incident-store-test-'));
    store = new IncidentStore({ baseDir: tmpDir });
    await store.init();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('records seen posts and avoids duplicate X post ingestion', async () => {
    const postId = '189384729103847582';
    assert.strictEqual(await store.isPostSeen(postId), false);

    await store.recordSeenPost({
      id: hashPostId(postId),
      post_id: postId,
      desk: 'kuwait',
      seen_at: new Date().toISOString(),
      claim_hash: 'fp_test123'
    });

    assert.strictEqual(await store.isPostSeen(postId), true);
  });

  test('appends and reads back incidents', async () => {
    const now = new Date().toISOString();
    const inc = {
      id: 'inc_test_1',
      geo: 'KW',
      type: 'drone_intercept',
      severity: 'alert' as const,
      severity_tier: 'ALERT' as const,
      severity_level: '🔴' as const,
      first_seen: now,
      last_seen: now,
      sources: ['@KuwaitMOD'],
      desks: ['kuwait'],
      claim_fingerprint: 'fp_abc123',
      post_ids: ['post_999'],
      summary: 'Patriot battery intercepted drone north of Kuwait'
    };

    await store.appendIncident(inc);
    const all = await store.readAllIncidents();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, 'inc_test_1');
    assert.strictEqual(all[0].geo, 'KW');

    // Post ID should be automatically recorded as seen
    assert.strictEqual(await store.isPostSeen('post_999'), true);
  });

  test('findDuplicateIncident identifies matching reports within 6h window', async () => {
    const now = new Date().toISOString();
    const inc = {
      id: 'inc_hormuz_1',
      geo: 'Hormuz',
      type: 'tanker_seizure',
      severity: 'alert' as const,
      first_seen: now,
      last_seen: now,
      sources: ['@UK_MTO'],
      desks: ['hormuz'],
      claim_fingerprint: computeClaimFingerprint('Tanker boarded by armed men in Strait of Hormuz'),
      post_ids: ['post_101'],
      summary: 'Tanker boarded by armed men in Strait of Hormuz'
    };

    await store.appendIncident(inc);

    const dup = await store.findDuplicateIncident(
      'Armed men boarded commercial tanker in Strait of Hormuz',
      'Hormuz',
      'tanker_seizure',
      now
    );

    assert.ok(dup !== null);
    assert.strictEqual(dup?.id, 'inc_hormuz_1');
  });
});
