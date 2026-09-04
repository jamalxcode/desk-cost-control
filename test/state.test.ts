import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DeskStateManager,
  produceDeltaDigest,
  Incident
} from '../src/index.js';

describe('DeskStateManager & Rolling State', () => {
  let tmpDir: string;
  let stateManager: DeskStateManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'state-test-'));
    stateManager = new DeskStateManager({ stateDir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('creates and persists initial state on first load', async () => {
    const state = await stateManager.loadState('kuwait');
    assert.strictEqual(state.desk, 'kuwait');
    assert.strictEqual(state.silence_streak, 0);
    assert.strictEqual(state.open_incidents.length, 0);
    assert.strictEqual(state.last_alert_at, null);
  });

  test('updates silence streak on quiet run vs active run', async () => {
    let state = await stateManager.loadState('iran');

    // Run 1: Quiet run -> silence_streak = 1
    state = stateManager.recordRunCompletion(state, {
      hasMaterialEvents: false,
      hadAlert: false,
      activeIncidentIds: []
    });
    assert.strictEqual(state.silence_streak, 1);

    // Run 2: Another quiet run -> silence_streak = 2
    state = stateManager.recordRunCompletion(state, {
      hasMaterialEvents: false,
      hadAlert: false,
      activeIncidentIds: []
    });
    assert.strictEqual(state.silence_streak, 2);

    // Run 3: Active event -> silence_streak resets to 0, last_alert_at updated
    state = stateManager.recordRunCompletion(state, {
      hasMaterialEvents: true,
      hadAlert: true,
      activeIncidentIds: ['inc_iran_1']
    });
    assert.strictEqual(state.silence_streak, 0);
    assert.ok(state.last_alert_at !== null);
    assert.deepStrictEqual(state.open_incidents, ['inc_iran_1']);

    await stateManager.saveState(state);

    // Reload from disk and verify persistence
    const reloaded = await stateManager.loadState('iran');
    assert.strictEqual(reloaded.silence_streak, 0);
    assert.deepStrictEqual(reloaded.open_incidents, ['inc_iran_1']);
  });
});

describe('Delta Digest Generation (Anti Full-History Replay)', () => {
  test('generates delta for new incidents and suppresses replaying full history', () => {
    const deskState = {
      desk: 'kuwait',
      last_run_at: '2026-09-04T08:00:00Z',
      open_incidents: ['inc_old_1'],
      silence_streak: 0,
      last_alert_at: null,
      since_cursor: 'cursor_100'
    };

    const currentIncidents: Incident[] = [
      // Old incident that has no new updates
      {
        id: 'inc_old_1',
        geo: 'KW',
        type: 'diplomatic_warning',
        severity: 'batch',
        first_seen: '2026-09-04T07:30:00Z',
        last_seen: '2026-09-04T07:30:00Z',
        sources: ['@KUNA'],
        desks: ['kuwait'],
        claim_fingerprint: 'fp_old',
        post_ids: ['p_old']
      },
      // Brand new incident observed after last_run_at
      {
        id: 'inc_new_2',
        geo: 'KW',
        type: 'drone_intercept',
        severity: 'alert',
        severity_tier: 'ALERT',
        severity_level: '🔴',
        first_seen: '2026-09-04T08:10:00Z',
        last_seen: '2026-09-04T08:10:00Z',
        sources: ['@KuwaitMOD'],
        desks: ['kuwait'],
        claim_fingerprint: 'fp_new',
        post_ids: ['p_new'],
        summary: 'Drone intercepted over Bubiyan'
      }
    ];

    const digest = produceDeltaDigest(deskState, currentIncidents, '2026-09-04T08:15:00Z');

    assert.strictEqual(digest.is_quiet, false);
    assert.strictEqual(digest.new_incidents.length, 1);
    assert.strictEqual(digest.new_incidents[0].id, 'inc_new_2');
    assert.strictEqual(digest.updated_incidents.length, 0);
    assert.ok(digest.prompt_input.includes('Drone intercepted over Bubiyan'));
    assert.ok(digest.prompt_input.includes('--- NEW INCIDENTS SINCE LAST RUN ---'));
    // The prompt should NOT re-include the unchanged old incident summary
    assert.ok(!digest.prompt_input.includes('inc_old_1'));
  });

  test('declares silence when zero delta occurs', () => {
    const deskState = {
      desk: 'qatar',
      last_run_at: '2026-09-04T08:00:00Z',
      open_incidents: [],
      silence_streak: 3,
      last_alert_at: null,
      since_cursor: null
    };

    const digest = produceDeltaDigest(deskState, [], '2026-09-04T08:05:00Z');

    assert.strictEqual(digest.is_quiet, true);
    assert.strictEqual(digest.silence_streak, 4);
    assert.ok(digest.prompt_input.includes('Status: QUIET'));
    assert.ok(digest.prompt_input.includes('Policy: Emit empty items or silence flag.'));
  });
});
