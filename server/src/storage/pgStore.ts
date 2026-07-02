import pg from 'pg';
import type { Captain, EventState, Player } from '../auction/types.js';
import { config } from '../config.js';
import { normalizeState } from './fileStore.js';
import {
  captainToRow,
  DEFAULT_EVENT_ID,
  playerToRow,
  rowToCaptain,
  rowToPlayer,
  type CaptainRow,
  type PlayerRow,
} from './pgRoster.js';

const STATE_ID = 'default';
let pool: pg.Pool | null = null;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS bidking_state (
    id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS bidking_captains (
    event_id TEXT NOT NULL DEFAULT 'default',
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    budget INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, id)
  );

  CREATE TABLE IF NOT EXISTS bidking_players (
    event_id TEXT NOT NULL DEFAULT 'default',
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    grade TEXT NOT NULL,
    protection_price INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    winning_captain_id TEXT,
    winning_price INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, id)
  );

  CREATE INDEX IF NOT EXISTS idx_bidking_players_event ON bidking_players (event_id);
  CREATE INDEX IF NOT EXISTS idx_bidking_captains_event ON bidking_captains (event_id);
`;

function slimPayload(state: EventState): EventState {
  return { ...state, players: [], captains: [] };
}

async function loadPlayers(client: pg.Pool | pg.PoolClient, eventId = DEFAULT_EVENT_ID): Promise<Player[]> {
  const result = await client.query<PlayerRow>(
    `SELECT id, name, position, grade, protection_price, status, winning_captain_id, winning_price
     FROM bidking_players
     WHERE event_id = $1
     ORDER BY id`,
    [eventId],
  );
  return result.rows.map(rowToPlayer);
}

async function loadCaptains(client: pg.Pool | pg.PoolClient, eventId = DEFAULT_EVENT_ID): Promise<Captain[]> {
  const result = await client.query<CaptainRow>(
    `SELECT id, name, position, budget
     FROM bidking_captains
     WHERE event_id = $1
     ORDER BY id`,
    [eventId],
  );
  return result.rows.map(rowToCaptain);
}

async function saveRosters(
  client: pg.PoolClient,
  players: Player[],
  captains: Captain[],
  eventId = DEFAULT_EVENT_ID,
): Promise<void> {
  const playerIds = players.map((p) => p.id);
  const captainIds = captains.map((c) => c.id);

  if (playerIds.length === 0) {
    await client.query('DELETE FROM bidking_players WHERE event_id = $1', [eventId]);
  } else {
    await client.query(
      'DELETE FROM bidking_players WHERE event_id = $1 AND NOT (id = ANY($2::text[]))',
      [eventId, playerIds],
    );
  }

  if (captainIds.length === 0) {
    await client.query('DELETE FROM bidking_captains WHERE event_id = $1', [eventId]);
  } else {
    await client.query(
      'DELETE FROM bidking_captains WHERE event_id = $1 AND NOT (id = ANY($2::text[]))',
      [eventId, captainIds],
    );
  }

  for (const player of players) {
    const row = playerToRow(player, eventId);
    await client.query(
      `INSERT INTO bidking_players (
         event_id, id, name, position, grade, protection_price, status,
         winning_captain_id, winning_price, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (event_id, id) DO UPDATE SET
         name = EXCLUDED.name,
         position = EXCLUDED.position,
         grade = EXCLUDED.grade,
         protection_price = EXCLUDED.protection_price,
         status = EXCLUDED.status,
         winning_captain_id = EXCLUDED.winning_captain_id,
         winning_price = EXCLUDED.winning_price,
         updated_at = NOW()`,
      [
        row.eventId,
        row.id,
        row.name,
        row.position,
        row.grade,
        row.protectionPrice,
        row.status,
        row.winningCaptainId,
        row.winningPrice,
      ],
    );
  }

  for (const captain of captains) {
    const row = captainToRow(captain, eventId);
    await client.query(
      `INSERT INTO bidking_captains (event_id, id, name, position, budget, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (event_id, id) DO UPDATE SET
         name = EXCLUDED.name,
         position = EXCLUDED.position,
         budget = EXCLUDED.budget,
         updated_at = NOW()`,
      [row.eventId, row.id, row.name, row.position, row.budget],
    );
  }
}

export async function initPgStore(): Promise<void> {
  if (!config.databaseUrl) return;
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseUrl.includes('localhost') ? undefined : { rejectUnauthorized: false },
    max: 3,
  });
  await pool.query(SCHEMA_SQL);
}

export async function loadPersistedState(): Promise<EventState | null> {
  if (!pool) return null;

  const result = await pool.query<{ payload: EventState }>(
    'SELECT payload FROM bidking_state WHERE id = $1',
    [STATE_ID],
  );
  if (result.rowCount === 0) return null;

  const state = normalizeState(result.rows[0].payload);
  const players = await loadPlayers(pool);
  const captains = await loadCaptains(pool);

  const needsLegacyMigration =
    players.length === 0 &&
    captains.length === 0 &&
    (state.players.length > 0 || state.captains.length > 0);

  if (needsLegacyMigration) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await saveRosters(client, state.players, state.captains);
      await client.query(
        `INSERT INTO bidking_state (id, payload, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [STATE_ID, JSON.stringify(slimPayload(state))],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    state.players = players;
    state.captains = captains;
  }

  return state;
}

export async function savePersistedState(state: EventState): Promise<void> {
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await saveRosters(client, state.players, state.captains);
    await client.query(
      `INSERT INTO bidking_state (id, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [STATE_ID, JSON.stringify(slimPayload(state))],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePgStore(): Promise<void> {
  await pool?.end();
  pool = null;
}
