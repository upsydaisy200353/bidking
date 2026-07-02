import type {
  AuctionEventPhase,
  AuctionRules,
  AuctionSession,
  BidRecord,
  Captain,
  Player,
  Round,
  SettlementAction,
} from './types.js';
import { DEFAULT_RULES } from './types.js';

export function getEffectiveBidsForRound(
  session: AuctionSession,
  round: Round,
  overtimeIndex?: number,
): BidRecord[] {
  if (overtimeIndex !== undefined) {
    return session.bids.filter(
      (b) => b.round === round && b.isOvertime && b.overtimeIndex === overtimeIndex,
    );
  }
  return session.bids.filter((b) => b.round === round && !b.isOvertime);
}

export function getLatestBidPerCaptain(bids: BidRecord[]): Map<string, BidRecord> {
  const map = new Map<string, BidRecord>();
  for (const bid of bids) {
    map.set(bid.captainId, bid);
  }
  return map;
}

export function countUniqueBidders(bids: BidRecord[]): number {
  return getLatestBidPerCaptain(bids).size;
}

export function countUniqueBiddersEver(session: AuctionSession): number {
  return new Set(session.bids.map((b) => b.captainId)).size;
}

export function getSortedBids(bids: BidRecord[]): { captainId: string; amount: number }[] {
  const latest = getLatestBidPerCaptain(bids);
  return [...latest.values()]
    .map((b) => ({ captainId: b.captainId, amount: b.amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function checkInstantKill(
  bids: BidRecord[],
  multiplier: number,
): { killed: boolean; winnerId?: string; price?: number; tiedTop?: boolean } {
  const sorted = getSortedBids(bids);
  if (sorted.length < 2) return { killed: false };

  const [first, second] = sorted;
  if (first.amount === second.amount) return { killed: false, tiedTop: true };
  if (first.amount >= second.amount * multiplier) {
    return { killed: true, winnerId: first.captainId, price: first.amount };
  }
  return { killed: false };
}

export function getTopTiedCaptainIds(bids: BidRecord[]): string[] {
  const sorted = getSortedBids(bids);
  if (sorted.length === 0) return [];
  const top = sorted[0].amount;
  return sorted.filter((b) => b.amount === top).map((b) => b.captainId);
}

export function getSecondPlaceAmount(bids: BidRecord[]): number | null {
  const sorted = getSortedBids(bids);
  if (sorted.length < 2) return null;
  return sorted[1].amount;
}

export function getInstantKillThreshold(
  round: Round,
  bids: BidRecord[],
  rules: AuctionRules = DEFAULT_RULES,
): number | null {
  if (round === 4) return null;
  const second = getSecondPlaceAmount(bids);
  if (second === null) return null;
  return Math.ceil(second * rules.multipliers[round]);
}

export function settleRound(params: {
  session: AuctionSession;
  player: Player;
  captains: Captain[];
  rules?: AuctionRules;
}): SettlementAction {
  const { session, player, captains, rules = DEFAULT_RULES } = params;
  const round = session.round;
  const isFailedPool = session.eventPhase === 'failed_pool';
  const isOvertime = session.phase === 'overtime';
  const bids = isOvertime
    ? getEffectiveBidsForRound(session, round, session.overtimeIndex)
    : getEffectiveBidsForRound(session, round);

  const bidderCount = countUniqueBidders(bids);

  if (bidderCount === 0) {
    if (round === 4) {
      return { type: 'failed', reason: '四轮结束仍无有效出价' };
    }
    return { type: 'next_round', round: (round + 1) as Round, reason: '本轮无人出价，进入下一轮' };
  }

  if (bidderCount === 1) {
    const only = getSortedBids(bids)[0];
    if (isFailedPool) {
      return {
        type: 'deal',
        captainId: only.captainId,
        price: only.amount,
        reason: '流拍池单人出价成交',
      };
    }
    if (only.amount >= player.protectionPrice) {
      return {
        type: 'deal',
        captainId: only.captainId,
        price: only.amount,
        reason: '单人出价达到保护价成交',
      };
    }
    return { type: 'failed', reason: '单人出价低于保护价，流拍' };
  }

  if (round <= 3) {
    const multiplier = rules.multipliers[round as 1 | 2 | 3];
    const kill = checkInstantKill(bids, multiplier);
    if (kill.killed && kill.winnerId && kill.price !== undefined) {
      if (round === 1) {
        const winner = captains.find((c) => c.id === kill.winnerId);
        if (winner && winner.position === player.position) {
          return {
            type: 'next_round',
            round: 2,
            reason: 'R1 秒杀成功但位置冲突，进入 R2',
          };
        }
      }
      if (session.bannedCaptainIds.includes(kill.winnerId)) {
        return {
          type: 'next_round',
          round: (round + 1) as Round,
          reason: '胜出者位置冲突出价无效',
        };
      }
      return {
        type: 'deal',
        captainId: kill.winnerId,
        price: kill.price,
        reason: `R${round} 倍率秒杀成交`,
      };
    }
    return {
      type: 'next_round',
      round: (round + 1) as Round,
      reason: '未达秒杀条件，进入下一轮',
    };
  }

  const topIds = getTopTiedCaptainIds(bids);
  if (topIds.length === 1) {
    const winner = getSortedBids(bids)[0];
    const everOnlyOne = countUniqueBiddersEver(session) === 1;
    if (!isFailedPool && everOnlyOne) {
      if (winner.amount >= player.protectionPrice) {
        return {
          type: 'deal',
          captainId: winner.captainId,
          price: winner.amount,
          reason: 'R4 唯一出价者达到保护价成交',
        };
      }
      return { type: 'failed', reason: 'R4 唯一出价者低于保护价，流拍' };
    }
    return {
      type: 'deal',
      captainId: winner.captainId,
      price: winner.amount,
      reason: 'R4 最高价成交',
    };
  }

  return {
    type: 'overtime',
    captainIds: topIds,
    reason: `R4 同价加时（${topIds.length} 人并列）`,
  };
}

export function getBannedCaptainsAfterReveal(
  player: Player,
  captains: Captain[],
  eventPhase: AuctionEventPhase,
  round: Round,
): string[] {
  if (round < 2 && eventPhase === 'main') return [];
  return captains.filter((c) => c.position === player.position).map((c) => c.id);
}

export function canCaptainBid(
  session: AuctionSession,
  captainId: string,
): { allowed: boolean; reason?: string } {
  if (session.status !== 'active') return { allowed: false, reason: '当前无进行中的竞拍' };
  if (session.phase !== 'bidding' && session.phase !== 'overtime') {
    return { allowed: false, reason: '当前不在竞价阶段' };
  }
  if (session.bannedCaptainIds.includes(captainId)) {
    return { allowed: false, reason: '位置冲突，不可竞价' };
  }
  if (session.phase === 'overtime' && !session.overtimeCaptainIds.includes(captainId)) {
    return { allowed: false, reason: '仅并列最高价队长可参与加时' };
  }
  return { allowed: true };
}

export function buildPlayerPublicView(
  player: Player,
  session: AuctionSession | null,
  eventPhase: AuctionEventPhase | null,
) {
  if (!session || session.playerId !== player.id) {
    return {
      id: player.id,
      status: player.status,
      winningCaptainId: player.winningCaptainId,
      winningPrice: player.winningPrice,
    };
  }

  const fullReveal = eventPhase === 'failed_pool';
  const revealed = {
    grade: fullReveal || session.round >= 1,
    position: fullReveal || session.round >= 2,
    id: fullReveal || session.round >= 3,
  };

  return {
    id: player.id,
    name: revealed.id ? player.name : undefined,
    position: revealed.position ? player.position : undefined,
    grade: revealed.grade ? player.grade : undefined,
    protectionPrice: eventPhase === 'main' ? player.protectionPrice : undefined,
    status: player.status,
    winningCaptainId: player.winningCaptainId,
    winningPrice: player.winningPrice,
  };
}
