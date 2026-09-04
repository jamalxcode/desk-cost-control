import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DropAuditRecord } from '../types/triage.js';

export interface AuditLoggerOptions {
  logFilePath?: string;
  samplingRate?: number; // 0.0 to 1.0 (default 1.0 = log all drops for audit sampling)
}

export class DropAuditLogger {
  private logFilePath: string;
  private samplingRate: number;
  private initialized: boolean = false;

  constructor(options: AuditLoggerOptions = {}) {
    this.logFilePath =
      options.logFilePath || path.join(process.cwd(), 'data', 'drop-audit.jsonl');
    this.samplingRate = options.samplingRate ?? 1.0;
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    const dir = path.dirname(this.logFilePath);
    await fs.mkdir(dir, { recursive: true });
    this.initialized = true;
  }

  /**
   * Records a DROP decision to the audit log for sampling and false-negative review.
   */
  public async logDrop(record: DropAuditRecord): Promise<boolean> {
    if (this.samplingRate < 1.0 && Math.random() > this.samplingRate) {
      return false;
    }

    await this.init();
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(this.logFilePath, line, 'utf-8');
    return true;
  }

  /**
   * Reads recent DROP audit records for review.
   */
  public async readRecentDrops(limit: number = 100): Promise<DropAuditRecord[]> {
    await this.init();
    try {
      const data = await fs.readFile(this.logFilePath, 'utf-8');
      const lines = data.split('\n').filter((l) => l.trim().length > 0);
      const records: DropAuditRecord[] = [];

      for (let i = Math.max(0, lines.length - limit); i < lines.length; i++) {
        try {
          records.push(JSON.parse(lines[i]));
        } catch {
          // ignore corrupted lines
        }
      }

      return records;
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }
}
