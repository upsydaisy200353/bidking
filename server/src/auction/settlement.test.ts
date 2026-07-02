import { describe, expect, it } from 'vitest';
import type { AuctionSession, Captain, Player } from './types.js';
import { DEFAULT_RULES } from './types.js';
import { settleRound } from './settlement.js';

const captains: Captain[] = [
  { id: 'c1', name: 'A', position: '野', budget: 10000 },
  { id: 'c2', name: 'B', position: '中', budget: 10000 },
];

const player: Player = {
  id: 'p1',
  name: 'P1',
  position: '野',
  grade: 'UR',
  protectionPrice: 2000,
  status: 'pending',
};

function session(partial: Partial<AuctionSession>): AuctionSession {
  return {
    id: 's1',
    playerId: 'p1',
    eventPhase: 'main',
    round: 1,
    phase: 'bidding',
    status: 'active',
    overtimeIndex: 0,
    overtimeCaptainIds: [],
    bannedCaptainIds: [],
    bids: [],
    logs: [],
    ...partial,
  };
}

describe('settleRound', () => {
  it('单人出价达到保护价则成交', () => {
    const result = settleRound({
      session: session({
        bids: [{ captainId: 'c2', amount: 2500, round: 1, isOvertime: false, overtimeIndex: 0, createdAt: '' }],
      }),
      player,
      captains,
    });
    expect(result).toEqual({
      type: 'deal',
      captainId: 'c2',
      price: 2500,
      reason: '单人出价达到保护价成交',
    });
  });

  it('单人出价低于保护价则流拍', () => {
    const result = settleRound({
      session: session({
        bids: [{ captainId: 'c2', amount: 1000, round: 1, isOvertime: false, overtimeIndex: 0, createdAt: '' }],
      }),
      player,
      captains,
    });
    expect(result.type).toBe('failed');
  });

  it('R1 双倍秒杀但位置冲突进入 R2', () => {
    const result = settleRound({
      session: session({
        bids: [
          { captainId: 'c1', amount: 4000, round: 1, isOvertime: false, overtimeIndex: 0, createdAt: '' },
          { captainId: 'c2', amount: 1500, round: 1, isOvertime: false, overtimeIndex: 0, createdAt: '' },
        ],
      }),
      player,
      captains,
    });
    expect(result).toEqual({
      type: 'next_round',
      round: 2,
      reason: 'R1 秒杀成功但位置冲突，进入 R2',
    });
  });

  it('R1 双倍秒杀无冲突直接成交', () => {
    const junglePlayer = { ...player, position: '中' as const };
    const result = settleRound({
      session: session({
        bids: [
          { captainId: 'c1', amount: 4000, round: 1, isOvertime: false, overtimeIndex: 0, createdAt: '' },
          { captainId: 'c2', amount: 1500, round: 1, isOvertime: false, overtimeIndex: 0, createdAt: '' },
        ],
      }),
      player: junglePlayer,
      captains,
    });
    expect(result.type).toBe('deal');
    if (result.type === 'deal') {
      expect(result.captainId).toBe('c1');
      expect(result.price).toBe(4000);
    }
  });

  it('R4 同价进入加时', () => {
    const result = settleRound({
      session: session({
        round: 4,
        bids: [
          { captainId: 'c1', amount: 3000, round: 4, isOvertime: false, overtimeIndex: 0, createdAt: '' },
          { captainId: 'c2', amount: 3000, round: 4, isOvertime: false, overtimeIndex: 0, createdAt: '' },
        ],
      }),
      player,
      captains,
      rules: DEFAULT_RULES,
    });
    expect(result.type).toBe('overtime');
    if (result.type === 'overtime') {
      expect(result.captainIds).toHaveLength(2);
    }
  });

  it('流拍池单人出价不校验保护价', () => {
    const result = settleRound({
      session: session({
        eventPhase: 'failed_pool',
        bids: [{ captainId: 'c2', amount: 100, round: 1, isOvertime: false, overtimeIndex: 0, createdAt: '' }],
      }),
      player,
      captains,
    });
    expect(result.type).toBe('deal');
  });
});
