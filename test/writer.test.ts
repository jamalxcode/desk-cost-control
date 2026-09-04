import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  mapDeskOutputToAirspaceCard,
  validateDeskOutputBudget,
  DeskOutput,
  DEFAULT_BUDGET_CONFIG
} from '../src/index.js';

describe('Writer Mapper Stub & Budget Enforcement', () => {
  test('validates output conforming to token budget limits', () => {
    const validOutput: DeskOutput = {
      desk: 'kuwait',
      run_timestamp: '2026-09-04T08:00:00Z',
      status: 'ALERT',
      silence_declared: false,
      items: [
        {
          item_id: 'item_1',
          geo: 'KW',
          type: 'missile_strike',
          severity_tier: 'ALERT',
          severity_level: '🔴',
          headline: 'Patriot battery intercepted target over northern sector',
          facts: [
            'Kuwait MOD confirmed air defense engagement at 07:55 UTC',
            'No ground damage reported in residential zones'
          ],
          sources: ['@KuwaitMOD', '@KUNA'],
          confidence: 'CONFIRMED'
        }
      ]
    };

    const res = validateDeskOutputBudget(validOutput);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.errors.length, 0);
  });

  test('flags budget breaches when items or lengths exceed limits', () => {
    const invalidOutput: DeskOutput = {
      desk: 'kuwait',
      run_timestamp: '2026-09-04T08:00:00Z',
      status: 'ACTIVE',
      silence_declared: false,
      items: [
        {
          item_id: 'item_1',
          geo: 'KW',
          type: 'statement',
          severity_tier: 'BATCH',
          severity_level: '🟡',
          headline: 'A'.repeat(200), // Exceeds max 140
          facts: ['B'.repeat(350)], // Exceeds max 280
          sources: ['@Source'],
          confidence: 'MEDIUM'
        }
      ]
    };

    const res = validateDeskOutputBudget(invalidOutput, DEFAULT_BUDGET_CONFIG);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('headline length')));
    assert.ok(res.errors.some((e) => e.includes('fact #0 length')));
  });

  test('maps desk JSON to emoji airspace card outline with 🟰 headers', () => {
    const output: DeskOutput = {
      desk: 'kuwait',
      run_timestamp: '2026-09-04T08:00:00Z',
      status: 'ALERT',
      silence_declared: false,
      items: [
        {
          item_id: 'kw_01',
          geo: 'KW',
          type: 'drone_intercept',
          severity_tier: 'ALERT',
          severity_level: '🔴',
          headline: 'Drone intercepted over Bubiyan Island',
          facts: ['Kuwait Air Defense engaged inbound UAV.'],
          sources: ['@KuwaitMOD'],
          confidence: 'CONFIRMED'
        }
      ]
    };

    const card = mapDeskOutputToAirspaceCard(output);
    assert.ok(card !== null);
    assert.ok(card?.includes('🟰 KUWAIT WATCH DESK 🔴 🟰'));
    assert.ok(card?.includes('🔴 [KW] Drone intercepted over Bubiyan Island'));
    assert.ok(card?.includes('▫️ Kuwait Air Defense engaged inbound UAV.'));
    assert.ok(card?.includes('Confidence: CONFIRMED | Sources: @KuwaitMOD'));
  });

  test('suppresses card output on quiet runs', () => {
    const quietOutput: DeskOutput = {
      desk: 'qatar',
      run_timestamp: '2026-09-04T08:05:00Z',
      status: 'QUIET',
      silence_declared: true,
      items: []
    };

    const card = mapDeskOutputToAirspaceCard(quietOutput, { suppressQuietCards: true });
    assert.strictEqual(card, null);
  });
});
