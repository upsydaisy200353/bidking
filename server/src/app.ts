import type { Server, Socket } from 'socket.io';
import { AuctionEngine, createDefaultEvent } from './auction/engine.js';
import { loadPersistedState, savePersistedState } from './storage/store.js';
import { parseCsvPlayers } from './seed.js';
import { broadcastSnapshot } from './ws/broadcast.js';
import { captainConnected, captainDisconnected } from './ws/presence.js';
import { enrichAdminSnapshot } from './ws/snapshot.js';
import { config } from './config.js';

let io: Server | null = null;
let engine: AuctionEngine | null = null;

function broadcast(): void {
  if (io) broadcastSnapshot(io);
}

function persist(state: ReturnType<AuctionEngine['getState']>): void {
  savePersistedState(state).catch((err) => {
    console.error('Failed to persist state:', err);
  });
}

export async function bootstrapEngine(): Promise<AuctionEngine> {
  const saved = await loadPersistedState();
  const initial = saved ?? createDefaultEvent();
  if (!saved) await savePersistedState(initial);
  engine = new AuctionEngine(initial, broadcast, persist);
  return engine;
}

export function setSocketServer(server: Server): void {
  io = server;
}

export function getEngine(): AuctionEngine {
  if (!engine) throw new Error('Engine not initialized — call bootstrapEngine() first');
  return engine;
}

export async function resetEngine(): Promise<AuctionEngine> {
  getEngine().resetAuction();
  return getEngine();
}

export function handleSocketConnection(socket: Socket): void {
  const eng = getEngine();
  const captainId = socket.handshake.query.captainId as string | undefined;
  const isAdmin = socket.handshake.query.admin === 'true';

  if (isAdmin) {
    socket.join('admin');
    socket.emit('auction:update', enrichAdminSnapshot(eng.getSnapshot(undefined, true)));
  } else if (captainId) {
    socket.join(`captain:${captainId}`);
    captainConnected(captainId);
    socket.emit('auction:update', eng.getSnapshot(captainId));
    broadcast();
    socket.on('disconnect', () => {
      captainDisconnected(captainId);
      broadcast();
    });
  } else {
    socket.join('spectator');
    socket.emit('auction:update', eng.getSnapshot());
  }

  socket.on('bid', (payload: unknown) => {
    const { captainId: cid, amount } = payload as { captainId: string; amount: number };
    try {
      eng.placeBid(cid, amount);
    } catch (e) {
      socket.emit('error', { message: (e as Error).message });
    }
  });
}

export { parseCsvPlayers, config };
