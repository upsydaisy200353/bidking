import { describe, expect, it } from 'vitest';
import { convertS5Players, convertS5Captains, inferGradeFromStartPrice } from './s5Auction.js';

const sampleRows = [
  {
    sort_order: 1,
    identity: 'player' as const,
    serial: 'A1',
    name: '蒜头王八',
    pool_letter: 'A' as const,
    start_price: 500,
    buyout_price: 1600,
    funds: null,
  },
  {
    sort_order: 2,
    identity: 'captain' as const,
    serial: null,
    name: '吴彦祖',
    pool_letter: 'A' as const,
    start_price: 350,
    buyout_price: null,
    funds: 2900,
  },
  {
    sort_order: 3,
    identity: 'captain' as const,
    serial: null,
    name: '亚子',
    pool_letter: 'A' as const,
    start_price: 100,
    buyout_price: null,
    funds: 3200,
  },
];

describe('s5Auction import', () => {
  it('maps start_price to protectionPrice and pool to position', () => {
    const players = convertS5Players(sampleRows);
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({
      id: 'A1',
      name: '蒜头王八',
      position: '上',
      protectionPrice: 500,
      status: 'pending',
    });
  });

  it('allows grade override', () => {
    const players = convertS5Players(sampleRows, { gradeOverrides: { A1: 'UR' } });
    expect(players[0].grade).toBe('UR');
  });

  it('infers grade from start price', () => {
    expect(inferGradeFromStartPrice(650)).toBe('UR');
    expect(inferGradeFromStartPrice(450)).toBe('SR');
    expect(inferGradeFromStartPrice(300)).toBe('R');
    expect(inferGradeFromStartPrice(100)).toBe('N');
  });

  it('imports all captains including same position', () => {
    const { captains, skipped } = convertS5Captains(sampleRows);
    expect(captains).toHaveLength(2);
    expect(captains.map((c) => c.name)).toEqual(['吴彦祖', '亚子']);
    expect(captains.every((c) => c.position === '上')).toBe(true);
    expect(skipped).toHaveLength(0);
  });
});
