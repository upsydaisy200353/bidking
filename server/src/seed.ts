import { v4 as uuid } from 'uuid';
import type { Captain, Grade, Player, Position } from './auction/types.js';

export function createSeedCaptains(): Captain[] {
  return [
    { id: 'c1', name: '队长A', position: '上', budget: 10000 },
    { id: 'c2', name: '队长B', position: '野', budget: 10000 },
    { id: 'c3', name: '队长C', position: '中', budget: 10000 },
    { id: 'c4', name: '队长D', position: '下', budget: 10000 },
    { id: 'c5', name: '队长E', position: '辅', budget: 10000 },
  ];
}

export function createSeedPlayers(): Player[] {
  return [
    { id: 'p1', name: '选手一号', position: '上', grade: 'UR', protectionPrice: 3000, status: 'pending' },
    { id: 'p2', name: '选手二号', position: '野', grade: 'SR', protectionPrice: 2000, status: 'pending' },
    { id: 'p3', name: '选手三号', position: '中', grade: 'R', protectionPrice: 1500, status: 'pending' },
    { id: 'p4', name: '选手四号', position: '下', grade: 'SR', protectionPrice: 2200, status: 'pending' },
    { id: 'p5', name: '选手五号', position: '辅', grade: 'N', protectionPrice: 800, status: 'pending' },
    { id: 'p6', name: '选手六号', position: '野', grade: 'UR', protectionPrice: 3500, status: 'pending' },
  ];
}

export function parseCsvPlayers(csv: string): Omit<Player, 'status'>[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  const players: Omit<Player, 'status'>[] = [];
  for (const line of lines) {
    if (line.toLowerCase().includes('name') && line.includes('position')) continue;
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length < 5) continue;
    const [id, name, position, grade, protectionPrice] = parts;
    players.push({
      id,
      name,
      position: position as Position,
      grade: grade as Grade,
      protectionPrice: Number(protectionPrice),
    });
  }
  return players;
}

export function newPlayerId(): string {
  return `p_${uuid().slice(0, 8)}`;
}

export function newCaptainId(): string {
  return `c_${uuid().slice(0, 8)}`;
}

/** 兼容旧版 state.json 中带 token 字段的队长数据 */
export function migrateCaptains(captains: Captain[]): Captain[] {
  return captains.map(({ id, name, position, budget }) => ({ id, name, position, budget }));
}
