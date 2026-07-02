export type Grade = 'UR' | 'SR' | 'R' | 'N';
export type Position = '上' | '野' | '中' | '下' | '辅';
export type EventPhase = 'setup' | 'main' | 'failed_pool' | 'ended';

export interface AuctionRules {
  multipliers: Record<1 | 2 | 3, number>;
  bidDurationSec: number;
  revealDurationSec: number;
  overtimeDurationSec: number;
}

export interface HistoryItem {
  sessionId: string;
  playerId: string;
  playerName: string;
  eventPhase: 'main' | 'failed_pool';
  status: string;
  winnerCaptainId?: string;
  winnerName?: string;
  winningPrice?: number;
  failReason?: string;
  endedAt: string;
  bidCount: number;
}

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail?: string;
}

export interface AuctionSnapshot {
  event: {
    id: string;
    name: string;
    phase: EventPhase;
    paused: boolean;
    rules: AuctionRules;
  };
  captains: { id: string; name: string; position: Position; budget: number }[];
  players: {
    id: string;
    name?: string;
    position?: Position;
    grade?: Grade;
    protectionPrice?: number;
    status: string;
    winningCaptainId?: string;
    winningPrice?: number;
  }[];
  failedPoolCount: number;
  pendingMainCount: number;
  history: HistoryItem[];
  auditLogs: AuditLog[];
  /** 管理端：当前在线队长 ID */
  onlineCaptainIds?: string[];
  currentSession: {
    id: string;
    eventPhase: 'main' | 'failed_pool';
    round: number;
    phase: 'reveal' | 'bidding' | 'overtime';
    status: string;
    overtimeIndex: number;
    overtimeCaptainIds: string[];
    bannedCaptainIds: string[];
    phaseEndsAt?: number;
    player: AuctionSnapshot['players'][0];
    revealed: { grade: boolean; position: boolean; id: boolean };
    multiplierHint: number | null;
    secondPlaceAmount: number | null;
    instantKillThreshold: number | null;
    captainBids: { captainId: string; captainName: string; hasBid: boolean; amount?: number }[];
    logs: string[];
    winnerCaptainId?: string;
    winningPrice?: number;
    failReason?: string;
  } | null;
}

export const GRADES: Grade[] = ['UR', 'SR', 'R', 'N'];
export const POSITIONS: Position[] = ['上', '野', '中', '下', '辅'];

const CAPTAIN_ID_KEY = 'bidking_captain_id';

export function getSelectedCaptainId(): string {
  return localStorage.getItem(CAPTAIN_ID_KEY) ?? '';
}

export function setSelectedCaptainId(captainId: string): void {
  localStorage.setItem(CAPTAIN_ID_KEY, captainId);
}
