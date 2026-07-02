import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getEngine, resetEngine, parseCsvPlayers, config } from '../app.js';
import type { AuctionRules, Captain, Grade, Player } from '../auction/types.js';
import {
  convertS5Roster,
  inferGradeFromStartPrice,
  type S5RosterRow,
} from '../import/s5Auction.js';
import { getStorageBackend } from '../storage/store.js';
import { enrichAdminSnapshot } from '../ws/snapshot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const S5_ROSTER_PATH = join(__dirname, '../../../data/s5-roster.json');

function adminSnapshot() {
  return enrichAdminSnapshot(getEngine().getSnapshot(undefined, true));
}

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    env: config.nodeEnv,
    storage: getStorageBackend(),
    dataDir: config.dataDir,
  });
});

apiRouter.get('/snapshot', (req, res) => {
  const captainId = req.query.captainId as string | undefined;
  const isAdmin = req.query.admin === 'true';
  const snapshot = getEngine().getSnapshot(captainId, isAdmin);
  res.json(isAdmin ? enrichAdminSnapshot(snapshot) : snapshot);
});

apiRouter.post('/event/start', (_req, res) => {
  try {
    getEngine().startEvent();
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/event/pause', (_req, res) => {
  try {
    getEngine().pauseEvent();
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/event/resume', (_req, res) => {
  try {
    getEngine().resumeEvent();
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.patch('/event', (req, res) => {
  try {
    const { name, rules } = req.body as { name?: string; rules?: Partial<AuctionRules> };
    const eng = getEngine();
    if (name) eng.updateEventName(name);
    if (rules) eng.updateRules(rules);
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/auction/draw', (_req, res) => {
  try {
    getEngine().drawNext();
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/auction/bid', (req, res) => {
  try {
    const { captainId, amount } = req.body as { captainId: string; amount: number };
    getEngine().placeBid(captainId, amount);
    res.json(getEngine().getSnapshot(captainId));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/auction/skip-timer', (_req, res) => {
  try {
    getEngine().skipTimer();
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/reset', async (_req, res) => {
  try {
    await resetEngine();
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/players', (req, res) => {
  try {
    const body = req.body as Omit<Player, 'status'>;
    getEngine().addPlayer(body);
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.patch('/players/:id', (req, res) => {
  try {
    getEngine().updatePlayer(String(req.params.id), req.body);
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.delete('/players/:id', (req, res) => {
  try {
    getEngine().deletePlayer(String(req.params.id));
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/players/import', (req, res) => {
  try {
    const { csv } = req.body as { csv: string };
    const players = parseCsvPlayers(csv);
    getEngine().importPlayers(players);
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

function loadBundledS5Roster(): S5RosterRow[] {
  if (!existsSync(S5_ROSTER_PATH)) {
    throw new Error('未找到 data/s5-roster.json，请先在本地运行 scripts/export-s5-roster.mjs');
  }
  return JSON.parse(readFileSync(S5_ROSTER_PATH, 'utf8')) as S5RosterRow[];
}

apiRouter.get('/import/s5-roster/preview', (_req, res) => {
  try {
    const rows = loadBundledS5Roster();
    const { players, captains, skippedCaptains } = convertS5Roster(rows, { includeCaptains: true });
    res.json({
      source: 'data/s5-roster.json',
      playerCount: players.length,
      captainCount: captains.length,
      players: players.map((p) => ({
        ...p,
        inferredGrade: inferGradeFromStartPrice(p.protectionPrice),
      })),
      captains,
      skippedCaptains,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/import/s5-roster', (req, res) => {
  try {
    const body = req.body as {
      roster?: S5RosterRow[];
      useBundled?: boolean;
      includeCaptains?: boolean;
      gradeOverrides?: Record<string, Grade>;
    };
    const rows = body.useBundled ? loadBundledS5Roster() : body.roster;
    if (!rows?.length) {
      res.status(400).json({ error: '请提供 roster 数组或设置 useBundled: true' });
      return;
    }
    const { players, captains, skippedCaptains } = convertS5Roster(rows, {
      includeCaptains: body.includeCaptains ?? false,
      gradeOverrides: body.gradeOverrides,
    });
    const engine = getEngine();
    engine.replacePlayers(players);
    if (body.includeCaptains && captains.length > 0) {
      engine.replaceCaptains(captains);
    }
    res.json({
      importedPlayers: players.length,
      importedCaptains: body.includeCaptains ? captains.length : 0,
      skippedCaptains,
      snapshot: adminSnapshot(),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.post('/captains', (req, res) => {
  try {
    const body = req.body as Captain;
    getEngine().addCaptain(body);
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.patch('/captains/:id', (req, res) => {
  try {
    getEngine().updateCaptain(String(req.params.id), req.body);
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

apiRouter.delete('/captains/:id', (req, res) => {
  try {
    getEngine().deleteCaptain(String(req.params.id));
    res.json(adminSnapshot());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
