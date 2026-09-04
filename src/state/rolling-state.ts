import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DeskState } from '../types/state.js';

export interface StateManagerOptions {
  stateDir?: string;
}

export class DeskStateManager {
  private stateDir: string;

  constructor(options: StateManagerOptions = {}) {
    this.stateDir = options.stateDir || path.join(process.cwd(), 'data', 'states');
  }

  private getStateFilePath(desk: string): string {
    const cleanDesk = desk.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return path.join(this.stateDir, `${cleanDesk}.state.json`);
  }

  /**
   * Initializes a default clean state for a desk.
   */
  public createInitialState(desk: string): DeskState {
    return {
      desk: desk.toLowerCase(),
      last_run_at: new Date(0).toISOString(),
      open_incidents: [],
      silence_streak: 0,
      last_alert_at: null,
      since_cursor: null,
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Loads the rolling state for a specific desk. Creates and saves initial state if missing.
   */
  public async loadState(desk: string): Promise<DeskState> {
    await fs.mkdir(this.stateDir, { recursive: true });
    const filePath = this.getStateFilePath(desk);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const state: DeskState = JSON.parse(data);
      return state;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        const initialState = this.createInitialState(desk);
        await this.saveState(initialState);
        return initialState;
      }
      throw err;
    }
  }

  /**
   * Saves desk state atomically to disk.
   */
  public async saveState(state: DeskState): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
    const filePath = this.getStateFilePath(state.desk);
    const updatedState: DeskState = {
      ...state,
      updated_at: new Date().toISOString()
    };

    const tempPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(updatedState, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  /**
   * Updates desk state after a run completion.
   */
  public recordRunCompletion(
    currentState: DeskState,
    params: {
      hasMaterialEvents: boolean;
      hadAlert: boolean;
      activeIncidentIds: string[];
      newCursor?: string | null;
      runTimestamp?: string;
    }
  ): DeskState {
    const timestamp = params.runTimestamp || new Date().toISOString();
    const newSilenceStreak = params.hasMaterialEvents ? 0 : currentState.silence_streak + 1;
    const lastAlertAt = params.hadAlert ? timestamp : currentState.last_alert_at;

    return {
      desk: currentState.desk,
      last_run_at: timestamp,
      open_incidents: Array.from(new Set(params.activeIncidentIds)),
      silence_streak: newSilenceStreak,
      last_alert_at: lastAlertAt,
      since_cursor: params.newCursor !== undefined ? params.newCursor : currentState.since_cursor,
      updated_at: timestamp
    };
  }
}
