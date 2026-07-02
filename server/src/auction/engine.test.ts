import { describe, expect, it } from 'vitest';
import { AuctionEngine, createDefaultEvent, createSoftResetState } from './engine.js';
import type { EventState } from './types.js';

function noop(): void {}

function runMidAuction(state: EventState): EventState {
  const engine = new AuctionEngine(state, noop, noop);
  engine.startEvent();
  engine.drawNext();
  return engine.getState();
}

describe('createSoftResetState', () => {
  it('preserves rosters and rules while clearing auction progress', () => {
    const base = createDefaultEvent('测试赛');
    base.captains = [{ id: 'c1', name: '队长甲', position: '上', budget: 8000 }];
    base.players = [
      { id: 'p1', name: '选手A', position: '上', grade: 'UR', protectionPrice: 3000, status: 'pending' },
      { id: 'p2', name: '选手B', position: '野', grade: 'SR', protectionPrice: 2000, status: 'pending' },
    ];
    base.rules.bidDurationSec = 45;

    const mid = runMidAuction(base);
    const reset = createSoftResetState(mid);

    expect(reset.name).toBe('测试赛');
    expect(reset.rules.bidDurationSec).toBe(45);
    expect(reset.captains).toEqual([{ id: 'c1', name: '队长甲', position: '上', budget: 8000 }]);
    expect(reset.players).toEqual([
      { id: 'p1', name: '选手A', position: '上', grade: 'UR', protectionPrice: 3000, status: 'pending' },
      { id: 'p2', name: '选手B', position: '野', grade: 'SR', protectionPrice: 2000, status: 'pending' },
    ]);
    expect(reset.phase).toBe('setup');
    expect(reset.paused).toBe(false);
    expect(reset.currentSession).toBeNull();
    expect(reset.history).toEqual([]);
    expect(reset.auditLogs).toEqual([]);
  });

  it('restores captain budgets from completed deals in history', () => {
    const base = createDefaultEvent();
    base.captains = [{ id: 'c1', name: '队长甲', position: '上', budget: 7000 }];
    base.players = [
      { id: 'p1', name: '选手A', position: '上', grade: 'UR', protectionPrice: 3000, status: 'sold', winningCaptainId: 'c1', winningPrice: 3000 },
    ];
    base.phase = 'main';
    base.history = [
      {
        id: 's1',
        playerId: 'p1',
        eventPhase: 'main',
        round: 1,
        phase: 'bidding',
        status: 'sold',
        overtimeIndex: 0,
        overtimeCaptainIds: [],
        bannedCaptainIds: [],
        bids: [],
        winnerCaptainId: 'c1',
        winningPrice: 3000,
        logs: [],
      },
    ];

    const reset = createSoftResetState(base);

    expect(reset.captains[0].budget).toBe(10000);
    expect(reset.players[0].status).toBe('pending');
    expect(reset.players[0].winningCaptainId).toBeUndefined();
  });
});

describe('AuctionEngine.resetAuction', () => {
  it('persists rosters via emit callback', () => {
    const base = createDefaultEvent('持久化测试');
    base.captains = [{ id: 'c1', name: '队长', position: '中', budget: 5000 }];
    base.players = [{ id: 'p1', name: '选手', position: '中', grade: 'R', protectionPrice: 1000, status: 'pending' }];

    let persisted: EventState | undefined;
    const engine = new AuctionEngine(base, noop, (s) => {
      persisted = s;
    });

    engine.startEvent();
    engine.resetAuction();

    expect(persisted).toBeDefined();
    expect(persisted!.captains).toEqual(base.captains);
    expect(persisted!.players.every((p) => p.status === 'pending')).toBe(true);
    expect(persisted!.phase).toBe('setup');
    expect(persisted!.auditLogs.some((l) => l.action === 'reset_auction')).toBe(true);
  });
});
