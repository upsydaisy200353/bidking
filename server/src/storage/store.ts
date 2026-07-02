import type { EventState } from '../auction/types.js';
import { config } from '../config.js';
import * as fileStore from './fileStore.js';

export type StorageBackend = 'postgres' | 'file';

let backend: StorageBackend = 'file';
let pgLoad: (() => Promise<EventState | null>) | null = null;
let pgSave: ((state: EventState) => Promise<void>) | null = null;

export async function initStorage(): Promise<StorageBackend> {
  if (config.databaseUrl) {
    const pg = await import('./pgStore.js');
    await pg.initPgStore();
    pgLoad = pg.loadPersistedState;
    pgSave = pg.savePersistedState;
    backend = 'postgres';
    console.log('Storage: PostgreSQL (DATABASE_URL)');
    return backend;
  }
  backend = 'file';
  console.log(`Storage: local file (${fileStore.getStatePath()})`);
  return backend;
}

export function getStorageBackend(): StorageBackend {
  return backend;
}

export async function loadPersistedState(): Promise<EventState | null> {
  if (pgLoad) return pgLoad();
  return fileStore.loadPersistedState();
}

export async function savePersistedState(state: EventState): Promise<void> {
  if (pgSave) {
    await pgSave(state);
    return;
  }
  fileStore.savePersistedState(state);
}

export { getStatePath } from './fileStore.js';
