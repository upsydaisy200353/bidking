import { describe, expect, it } from 'vitest';
import { captainToRow, playerToRow, rowToCaptain, rowToPlayer } from './pgRoster.js';

describe('pgRoster mapping', () => {
  it('round-trips player with optional winning fields', () => {
    const player = {
      id: 'p1',
      name: '选手A',
      position: '上' as const,
      grade: 'UR' as const,
      protectionPrice: 3000,
      status: 'sold' as const,
      winningCaptainId: 'c1',
      winningPrice: 3500,
    };
    const row = playerToRow(player);
    expect(rowToPlayer({
      id: row.id,
      name: row.name,
      position: row.position,
      grade: row.grade,
      protection_price: row.protectionPrice,
      status: row.status,
      winning_captain_id: row.winningCaptainId,
      winning_price: row.winningPrice,
    })).toEqual(player);
  });

  it('round-trips captain', () => {
    const captain = { id: 'c1', name: '队长甲', position: '野' as const, budget: 8000 };
    const row = captainToRow(captain);
    expect(rowToCaptain({
      id: row.id,
      name: row.name,
      position: row.position,
      budget: row.budget,
    })).toEqual(captain);
  });
});
