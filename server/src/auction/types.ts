export type Grade = 'UR' | 'SR' | 'R' | 'N';
export type Position = '上' | '野' | '中' | '下' | '辅';
export type PlayerStatus = 'pending' | 'sold' | 'failed_pool';
export type EventPhase = 'setup' | 'main' | 'failed_pool' | 'ended';
export type AuctionEventPhase = 'main' | 'failed_pool';
export type Round = 1 | 2 | 3 | 4;
export type SessionPhase = 'reveal' | 'bidding' | 'overtime';
export type SessionStatus = 'active' | 'sold' | 'failed';

export interface AuctionRules {
  multipliers: Record<1 | 2 | 3, number>;
  bidDurationSec: number;
  revealDurationSec: number;
  overtimeDurationSec: number;
}

export const DEFAULT_RULES: AuctionRules = {
  multipliers: { 1: 2.0, 2: 1.6, 3: 1.3 },
  bidDurationSec: 60,
  revealDurationSec: 5,
  overtimeDurationSec: 60,
};

export interface Captain {
  id: string;
  name: string;
  position: Position;
  budget: number;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  grade: Grade;
  protectionPrice: number;
  status: PlayerStatus;
  winningCaptainId?: string;
  winningPrice?: number;
}

export interface BidRecord {
  captainId: string;
  amount: number;
  round: Round;
  isOvertime: boolean;
  overtimeIndex: number;
  createdAt: string;
}

export interface AuctionSession {
  id: string;
  playerId: string;
  eventPhase: AuctionEventPhase;
  round: Round;
  phase: SessionPhase;
  status: SessionStatus;
  overtimeIndex: number;
  overtimeCaptainIds: string[];
  bannedCaptainIds: string[];
  bids: BidRecord[];
  winnerCaptainId?: string;
  winningPrice?: number;
  failReason?: string;
  phaseEndsAt?: number;
  logs: string[];
}

export interface EventState {
  id: string;
  name: string;
  phase: EventPhase;
  paused: boolean;
  rules: AuctionRules;
  captains: Captain[];
  players: Player[];
  currentSession: AuctionSession | null;
  history: AuctionSession[];
  auditLogs: AuditLog[];
}

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail?: string;
}

export type SettlementAction =
  | { type: 'deal'; captainId: string; price: number; reason: string }
  | { type: 'failed'; reason: string }
  | { type: 'next_round'; round: Round; reason: string }
  | { type: 'overtime'; captainIds: string[]; reason: string }
  | { type: 'continue' };

export interface PublicPlayerView {
  id: string;
  name?: string;
  position?: Position;
  grade?: Grade;
  protectionPrice?: number;
  status: PlayerStatus;
  winningCaptainId?: string;
  winningPrice?: number;
}

export interface CaptainBidView {
  captainId: string;
  captainName: string;
  hasBid: boolean;
  amount?: number;
}

export interface AuctionSnapshot {
  event: {
    id: string;
    name: string;
    phase: EventPhase;
    paused: boolean;
    rules: AuctionRules;
  };
  captains: Captain[];
  players: PublicPlayerView[];
  failedPoolCount: number;
  pendingMainCount: number;
  history: HistoryItem[];
  auditLogs: AuditLog[];
  /** 管理端可见：当前在线的队长 ID 列表 */
  onlineCaptainIds?: string[];
  currentSession: {
    id: string;
    eventPhase: AuctionEventPhase;
    round: Round;
    phase: SessionPhase;
    status: SessionStatus;
    overtimeIndex: number;
    overtimeCaptainIds: string[];
    bannedCaptainIds: string[];
    phaseEndsAt?: number;
    player: PublicPlayerView;
    revealed: { grade: boolean; position: boolean; id: boolean };
    multiplierHint: number | null;
    secondPlaceAmount: number | null;
    instantKillThreshold: number | null;
    captainBids: CaptainBidView[];
    logs: string[];
    winnerCaptainId?: string;
    winningPrice?: number;
    failReason?: string;
  } | null;
}

export interface HistoryItem {
  sessionId: string;
  playerId: string;
  playerName: string;
  eventPhase: AuctionEventPhase;
  status: SessionStatus;
  winnerCaptainId?: string;
  winnerName?: string;
  winningPrice?: number;
  failReason?: string;
  endedAt: string;
  bidCount: number;
}
