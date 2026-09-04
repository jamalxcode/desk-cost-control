import { test, describe } from 'node:test';
import assert from 'node:assert';
import { NonUrgentBatcher, DeskItem, TriageResult } from '../src/index.js';

describe('Non-Urgent Batcher & Immediate Alert Bypass', () => {
  const dummyItem: DeskItem = {
    item_id: 'item_1',
    geo: 'KW',
    type: 'diplomatic_warning',
    severity_tier: 'BATCH',
    severity_level: '🟡',
    headline: 'Kuwait Ministry issued travel caution',
    facts: ['Travel caution issued for regional travelers'],
    sources: ['@KuwaitKUNA'],
    confidence: 'HIGH'
  };

  const batchTriage: TriageResult = {
    action: 'BATCH',
    severity: '🟡',
    severity_tier: 'BATCH',
    reason: 'Diplomatic caution',
    confidence: 0.8,
    matchedRules: ['batch_diplomatic_warning'],
    escalated: false,
    requiresImmediateBypass: false
  };

  const alertTriage: TriageResult = {
    action: 'ALERT',
    severity: '🔴',
    severity_tier: 'ALERT',
    reason: 'Patriot engagement',
    confidence: 1.0,
    matchedRules: ['alert_missile'],
    escalated: false,
    requiresImmediateBypass: true
  };

  const dropTriage: TriageResult = {
    action: 'DROP',
    severity: '🟢',
    severity_tier: 'DROP',
    reason: 'Spam',
    confidence: 0.9,
    matchedRules: ['drop_spam_crypto'],
    escalated: false,
    requiresImmediateBypass: false
  };

  test('ALERT items bypass queue immediately and trigger callback', async () => {
    let bypassCalledWith: DeskItem | null = null;
    const batcher = new NonUrgentBatcher({
      onAlertBypass: (item) => {
        bypassCalledWith = item;
      }
    });

    const alertItem: DeskItem = {
      ...dummyItem,
      item_id: 'item_alert_1',
      severity_tier: 'ALERT',
      severity_level: '🔴',
      headline: 'Missile intercepted over border'
    };

    const res = await batcher.enqueue(alertItem, alertTriage);
    assert.strictEqual(res.action, 'ALERT_BYPASSED');
    assert.strictEqual(res.bypassedItem?.item_id, 'item_alert_1');
    assert.strictEqual(batcher.getPendingCount(), 0);
    assert.strictEqual(bypassCalledWith?.item_id, 'item_alert_1');
  });

  test('BATCH items are accumulated and flushed upon manual or timer trigger', async () => {
    let flushedItems: DeskItem[] = [];
    const batcher = new NonUrgentBatcher({
      flushIntervalMinutes: 20,
      onFlush: (items) => {
        flushedItems = items;
      }
    });

    const res1 = await batcher.enqueue(dummyItem, batchTriage);
    assert.strictEqual(res1.action, 'BATCH_QUEUED');
    assert.strictEqual(batcher.getPendingCount(), 1);

    const res2 = await batcher.enqueue(
      { ...dummyItem, item_id: 'item_2' },
      batchTriage
    );
    assert.strictEqual(res2.action, 'BATCH_QUEUED');
    assert.strictEqual(batcher.getPendingCount(), 2);

    // Manual flush
    const flushResult = await batcher.flush();
    assert.strictEqual(flushResult.flushedCount, 2);
    assert.strictEqual(batcher.getPendingCount(), 0);
    assert.strictEqual(flushedItems.length, 2);
  });

  test('BATCH auto-flushes when maxBatchSize limit is reached', async () => {
    const batcher = new NonUrgentBatcher({
      maxBatchSize: 3
    });

    await batcher.enqueue({ ...dummyItem, item_id: 'b1' }, batchTriage);
    await batcher.enqueue({ ...dummyItem, item_id: 'b2' }, batchTriage);
    assert.strictEqual(batcher.getPendingCount(), 2);

    const res3 = await batcher.enqueue({ ...dummyItem, item_id: 'b3' }, batchTriage);
    assert.strictEqual(res3.flushTriggered, true);
    assert.strictEqual(res3.flushResult?.flushedCount, 3);
    assert.strictEqual(batcher.getPendingCount(), 0);
  });

  test('DROP items are not queued', async () => {
    const batcher = new NonUrgentBatcher();
    const res = await batcher.enqueue(dummyItem, dropTriage);
    assert.strictEqual(res.action, 'DROPPED');
    assert.strictEqual(batcher.getPendingCount(), 0);
  });
});
