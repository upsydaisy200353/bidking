import type { Captain, Grade, Player, Position } from '../auction/types.js';
import { newPlayerId } from '../seed.js';

/** S5 白菜杯 roster 表导出行（来自 auction.db） */
export interface S5RosterRow {
  sort_order: number;
  identity: 'player' | 'captain';
  serial: string | null;
  name: string;
  pool_letter: 'A' | 'B' | 'C' | 'D' | 'E';
  start_price: number;
  buyout_price: number | null;
  funds: number | null;
  avatar?: string | null;
}

const POOL_TO_POSITION: Record<S5RosterRow['pool_letter'], Position> = {
  A: '上',
  B: '野',
  C: '中',
  D: '下',
  E: '辅',
};

/** 根据起拍价推断默认评级（导入后可在管理端调整） */
export function inferGradeFromStartPrice(startPrice: number): Grade {
  if (startPrice >= 600) return 'UR';
  if (startPrice >= 400) return 'SR';
  if (startPrice >= 250) return 'R';
  return 'N';
}

export interface S5ImportOptions {
  /** 按选手 ID（serial 或生成 id）覆盖评级 */
  gradeOverrides?: Record<string, Grade>;
  /** 是否同时导入全部队长 */
  includeCaptains?: boolean;
}

export interface S5ImportResult {
  players: Player[];
  captains: Captain[];
  skippedCaptains: string[];
}

function playerIdFromRow(row: S5RosterRow): string {
  return row.serial?.trim() || newPlayerId();
}

export function convertS5Players(
  rows: S5RosterRow[],
  options: S5ImportOptions = {},
): Player[] {
  const overrides = options.gradeOverrides ?? {};
  return rows
    .filter((r) => r.identity === 'player')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => {
      const id = playerIdFromRow(row);
      return {
        id,
        name: row.name,
        position: POOL_TO_POSITION[row.pool_letter],
        grade: overrides[id] ?? inferGradeFromStartPrice(row.start_price),
        protectionPrice: row.start_price,
        status: 'pending' as const,
      };
    });
}

/** 导入全部队长（允许多名队长同位置） */
export function convertS5Captains(rows: S5RosterRow[]): { captains: Captain[]; skipped: string[] } {
  const captains = rows
    .filter((r) => r.identity === 'captain')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      id: `cap-${row.sort_order}`,
      name: row.name,
      position: POOL_TO_POSITION[row.pool_letter],
      budget: row.funds ?? 10000,
    }));
  return { captains, skipped: [] };
}

export function convertS5Roster(
  rows: S5RosterRow[],
  options: S5ImportOptions = {},
): S5ImportResult {
  const players = convertS5Players(rows, options);
  const skippedCaptains: string[] = [];
  let captains: Captain[] = [];

  if (options.includeCaptains) {
    const result = convertS5Captains(rows);
    captains = result.captains;
    skippedCaptains.push(...result.skipped);
  }

  return { players, captains, skippedCaptains };
}
