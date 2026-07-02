import type { Captain, Grade, Player, Position, PlayerStatus } from '../auction/types.js';

export const DEFAULT_EVENT_ID = 'default';

export interface PlayerRow {
  id: string;
  name: string;
  position: string;
  grade: string;
  protection_price: number;
  status: string;
  winning_captain_id: string | null;
  winning_price: number | null;
}

export interface CaptainRow {
  id: string;
  name: string;
  position: string;
  budget: number;
}

export function playerToRow(player: Player, eventId = DEFAULT_EVENT_ID) {
  return {
    eventId,
    id: player.id,
    name: player.name,
    position: player.position,
    grade: player.grade,
    protectionPrice: player.protectionPrice,
    status: player.status,
    winningCaptainId: player.winningCaptainId ?? null,
    winningPrice: player.winningPrice ?? null,
  };
}

export function rowToPlayer(row: PlayerRow): Player {
  const player: Player = {
    id: row.id,
    name: row.name,
    position: row.position as Position,
    grade: row.grade as Grade,
    protectionPrice: row.protection_price,
    status: row.status as PlayerStatus,
  };
  if (row.winning_captain_id) player.winningCaptainId = row.winning_captain_id;
  if (row.winning_price != null) player.winningPrice = row.winning_price;
  return player;
}

export function captainToRow(captain: Captain, eventId = DEFAULT_EVENT_ID) {
  return {
    eventId,
    id: captain.id,
    name: captain.name,
    position: captain.position,
    budget: captain.budget,
  };
}

export function rowToCaptain(row: CaptainRow): Captain {
  return {
    id: row.id,
    name: row.name,
    position: row.position as Position,
    budget: row.budget,
  };
}
