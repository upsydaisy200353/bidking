import type { Server } from 'socket.io';
import { getEngine } from '../app.js';
import { enrichAdminSnapshot } from './snapshot.js';

export function broadcastSnapshot(io: Server): void {
  const eng = getEngine();
  io.to('admin').emit('auction:update', enrichAdminSnapshot(eng.getSnapshot(undefined, true)));
  io.to('spectator').emit('auction:update', eng.getSnapshot());

  for (const captain of eng.getState().captains) {
    io.to(`captain:${captain.id}`).emit('auction:update', eng.getSnapshot(captain.id));
  }
}
