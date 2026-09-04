import { DeskItem } from '../types/output.js';
import { TriageResult } from '../types/triage.js';

export interface BatcherOptions {
  flushIntervalMinutes?: number; // 15 to 30 min (default: 20 min)
  maxBatchSize?: number; // max items to accumulate before auto-flush (default: 15)
  onAlertBypass?: (item: DeskItem, triage: TriageResult) => void | Promise<void>;
  onFlush?: (items: DeskItem[]) => void | Promise<void>;
}

export interface QueuedItem {
  item: DeskItem;
  triage: TriageResult;
  enqueuedAt: number;
}

export interface EnqueueResult {
  action: 'ALERT_BYPASSED' | 'BATCH_QUEUED' | 'DROPPED';
  bypassedItem?: DeskItem;
  queuedCount: number;
  flushTriggered: boolean;
  flushResult?: BatchFlushResult | null;
}

export interface BatchFlushResult {
  flushedCount: number;
  items: DeskItem[];
  flushedAt: string;
  durationInQueueMs: number;
}

export class NonUrgentBatcher {
  private flushIntervalMs: number;
  private maxBatchSize: number;
  private queue: QueuedItem[] = [];
  private lastFlushTime: number = Date.now();
  private onAlertBypass?: (item: DeskItem, triage: TriageResult) => void | Promise<void>;
  private onFlush?: (items: DeskItem[]) => void | Promise<void>;

  constructor(options: BatcherOptions = {}) {
    const minutes = options.flushIntervalMinutes ?? 20;
    // Bound between 1 and 60 minutes
    this.flushIntervalMs = Math.max(1, Math.min(60, minutes)) * 60 * 1000;
    this.maxBatchSize = options.maxBatchSize ?? 15;
    this.onAlertBypass = options.onAlertBypass;
    this.onFlush = options.onFlush;
  }

  /**
   * Enqueues an item based on its triage classification.
   * ALERT items bypass the queue immediately.
   * BATCH items are queued until the next flush window.
   * DROP items are discarded.
   */
  public async enqueue(item: DeskItem, triage: TriageResult): Promise<EnqueueResult> {
    // 1. Critical ALERT: Bypasses queue immediately
    if (triage.action === 'ALERT' || triage.requiresImmediateBypass) {
      if (this.onAlertBypass) {
        await this.onAlertBypass(item, triage);
      }
      return {
        action: 'ALERT_BYPASSED',
        bypassedItem: item,
        queuedCount: this.queue.length,
        flushTriggered: false,
        flushResult: null
      };
    }

    // 2. DROP: Discard without queueing
    if (triage.action === 'DROP') {
      return {
        action: 'DROPPED',
        queuedCount: this.queue.length,
        flushTriggered: false,
        flushResult: null
      };
    }

    // 3. BATCH: Enqueue
    this.queue.push({
      item,
      triage,
      enqueuedAt: Date.now()
    });

    // Check if max size trigger hit
    if (this.queue.length >= this.maxBatchSize) {
      const flushResult = await this.flush();
      return {
        action: 'BATCH_QUEUED',
        queuedCount: this.queue.length,
        flushTriggered: true,
        flushResult
      };
    }

    return {
      action: 'BATCH_QUEUED',
      queuedCount: this.queue.length,
      flushTriggered: false,
      flushResult: null
    };
  }

  /**
   * Flushes all accumulated BATCH items from the queue.
   */
  public async flush(): Promise<BatchFlushResult> {
    const now = Date.now();
    const itemsToFlush = this.queue.map((q) => q.item);
    const oldestTimestamp = this.queue.length > 0 ? this.queue[0].enqueuedAt : now;
    const durationInQueueMs = now - oldestTimestamp;

    this.queue = [];
    this.lastFlushTime = now;

    if (itemsToFlush.length > 0 && this.onFlush) {
      await this.onFlush(itemsToFlush);
    }

    return {
      flushedCount: itemsToFlush.length,
      items: itemsToFlush,
      flushedAt: new Date(now).toISOString(),
      durationInQueueMs
    };
  }

  /**
   * Checks if the flush interval has elapsed, and flushes if due.
   */
  public async checkAndFlushIfDue(now: number = Date.now()): Promise<BatchFlushResult | null> {
    if (this.queue.length === 0) {
      this.lastFlushTime = now;
      return null;
    }

    if (now - this.lastFlushTime >= this.flushIntervalMs) {
      return await this.flush();
    }

    return null;
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public getPendingItems(): DeskItem[] {
    return this.queue.map((q) => q.item);
  }

  public getLastFlushTime(): number {
    return this.lastFlushTime;
  }

  public getFlushIntervalMinutes(): number {
    return this.flushIntervalMs / (60 * 1000);
  }

  public clear(): void {
    this.queue = [];
  }
}
