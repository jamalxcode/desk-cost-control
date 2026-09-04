import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  clusterIncidents,
  isWithin6HourWindow,
  compactIncidentStore,
  IncidentStore,
  Incident
} from '../src/index.js';

describe('Incident Clustering (Geo + Type + 6h Window)', () => {
  test('isWithin6HourWindow correctly identifies 6h range', () => {
    const t0 = new Date('2026-09-04T08:00:00Z').toISOString();
    const tPlus3h = new Date('2026-09-04T11:00:00Z').toISOString();
    const tPlus7h = new Date('2026-09-04T15:00:00Z').toISOString();

    assert.strictEqual(isWithin6HourWindow(t0, tPlus3h), true);
    assert.strictEqual(isWithin6HourWindow(t0, tPlus7h), false);
  });

  test('clusters multiple incidents with same place and type within 6h', () => {
    const t0 = new Date('2026-09-04T08:00:00Z').toISOString();
    const t1 = new Date('2026-09-04T09:30:00Z').toISOString();
    const t2 = new Date('2026-09-04T18:00:00Z').toISOString(); // 10h later -> separate cluster

    const inc1: Incident = {
      id: 'inc_1',
      geo: 'IR',
      type: 'gps_jamming',
      severity: 'alert',
      first_seen: t0,
      last_seen: t0,
      sources: ['@FlightRadar24'],
      desks: ['iran'],
      claim_fingerprint: 'fp_1',
      post_ids: ['p1']
    };

    const inc2: Incident = {
      id: 'inc_2',
      geo: 'IR',
      type: 'gps_jamming',
      severity: 'alert',
      first_seen: t1,
      last_seen: t1,
      sources: ['@OSINT_Gulf'],
      desks: ['iran', 'gcc'],
      claim_fingerprint: 'fp_1',
      post_ids: ['p2']
    };

    const inc3: Incident = {
      id: 'inc_3',
      geo: 'IR',
      type: 'gps_jamming',
      severity: 'alert',
      first_seen: t2,
      last_seen: t2,
      sources: ['@MiddleEastOps'],
      desks: ['iran'],
      claim_fingerprint: 'fp_2',
      post_ids: ['p3']
    };

    const clusters = clusterIncidents([inc1, inc2, inc3]);
    assert.strictEqual(clusters.length, 2);

    const firstCluster = clusters[0];
    assert.strictEqual(firstCluster.incident_count, 2);
    assert.deepStrictEqual(firstCluster.incident_ids.sort(), ['inc_1', 'inc_2'].sort());
    assert.deepStrictEqual(firstCluster.post_ids.sort(), ['p1', 'p2'].sort());
    assert.deepStrictEqual(firstCluster.desks.sort(), ['gcc', 'iran'].sort());
    assert.strictEqual(firstCluster.first_seen, t0);
    assert.strictEqual(firstCluster.last_seen, t1);
  });
});

describe('Store Compaction Helper', () => {
  let tmpDir: string;
  let store: IncidentStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compact-test-'));
    store = new IncidentStore({ baseDir: tmpDir });
    await store.init();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('compacts duplicate updates of the same incident into single canonical record', async () => {
    const t0 = new Date('2026-09-04T08:00:00Z').toISOString();
    const t1 = new Date('2026-09-04T08:15:00Z').toISOString();

    const incOriginal: Incident = {
      id: 'inc_kw_patriot',
      geo: 'KW',
      type: 'missile_strike',
      severity: 'alert',
      first_seen: t0,
      last_seen: t0,
      sources: ['@KuwaitMOD'],
      desks: ['kuwait'],
      claim_fingerprint: 'fp_kw1',
      post_ids: ['p1'],
      summary: 'Patriot engagement over northern border'
    };

    const incUpdate: Incident = {
      id: 'inc_kw_patriot',
      geo: 'KW',
      type: 'missile_strike',
      severity: 'alert',
      first_seen: t0,
      last_seen: t1,
      sources: ['@KuwaitMOD', '@AlArabiya'],
      desks: ['kuwait', 'gcc'],
      claim_fingerprint: 'fp_kw1',
      post_ids: ['p1', 'p2'],
      summary: 'Patriot engagement confirmed 2 missiles intercepted over northern border'
    };

    await store.appendIncident(incOriginal);
    await store.appendIncident(incUpdate);

    const beforeCompact = await store.readAllIncidents();
    assert.strictEqual(beforeCompact.length, 2);

    const result = await compactIncidentStore(
      store.getIncidentsPath(),
      store.getSeenPostsPath()
    );

    assert.strictEqual(result.originalIncidents, 2);
    assert.strictEqual(result.compactedIncidents, 1);
    assert.strictEqual(result.mergedIncidents, 1);

    const afterCompact = await store.readAllIncidents();
    assert.strictEqual(afterCompact.length, 1);
    assert.strictEqual(afterCompact[0].id, 'inc_kw_patriot');
    assert.strictEqual(afterCompact[0].last_seen, t1);
    assert.strictEqual(afterCompact[0].sources.length, 2);
    assert.strictEqual(afterCompact[0].post_ids.length, 2);
  });
});
