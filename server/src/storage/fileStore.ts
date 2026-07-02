import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import type { EventState } from '../auction/types.js';
import { config } from '../config.js';
import { migrateCaptains } from '../seed.js';

const STATE_FILE = join(config.dataDir, 'state.json');

export function getStatePath(): string {
  return STATE_FILE;
}

export function loadPersistedState(): EventState | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8');
    return normalizeState(JSON.parse(raw) as EventState);
  } catch {
    return null;
  }
}

export function savePersistedState(state: EventState): void {
  mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tmp, STATE_FILE);
}

export function normalizeState(state: EventState): EventState {
  if (!state.auditLogs) state.auditLogs = [];
  if (state.paused === undefined) state.paused = false;
  state.captains = migrateCaptains(state.captains);
  return state;
}
