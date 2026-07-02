import { v4 as uuid } from 'uuid';
import type {
  AuctionEventPhase,
  AuctionRules,
  AuctionSession,
  AuctionSnapshot,
  Captain,
  CaptainBidView,
  EventState,
  Grade,
  HistoryItem,
  Player,
  Position,
  Round,
  SettlementAction,
} from './types.js';
import { DEFAULT_RULES } from './types.js';
import {
  buildPlayerPublicView,
  canCaptainBid,
  getBannedCaptainsAfterReveal,
  getEffectiveBidsForRound,
  getInstantKillThreshold,
  getSecondPlaceAmount,
  settleRound,
} from './settlement.js';
import { createSeedCaptains, createSeedPlayers, migrateCaptains } from '../seed.js';

type BroadcastFn = (snapshot: AuctionSnapshot) => void;
type PersistFn = (state: EventState) => void;

export class AuctionEngine {
  private state: EventState;
  private timer: NodeJS.Timeout | null = null;
  private broadcast: BroadcastFn;
  private persist: PersistFn;

  constructor(initial: EventState, broadcast: BroadcastFn, persist: PersistFn) {
    this.state = initial;
    this.broadcast = broadcast;
    this.persist = persist;
    this.restoreTimerIfNeeded();
  }

  getState(): EventState {
    return this.state;
  }

  replaceState(state: EventState): void {
    this.clearTimer();
    this.state = state;
    if (!this.state.auditLogs) this.state.auditLogs = [];
    if (this.state.paused === undefined) this.state.paused = false;
    this.restoreTimerIfNeeded();
    this.emit();
  }

  private audit(actor: string, action: string, detail?: string): void {
    this.state.auditLogs.unshift({
      id: uuid(),
      at: new Date().toISOString(),
      actor,
      action,
      detail,
    });
    if (this.state.auditLogs.length > 200) {
      this.state.auditLogs = this.state.auditLogs.slice(0, 200);
    }
  }

  private ensureSetup(): void {
    if (this.state.phase !== 'setup') {
      throw new Error('仅准备阶段可修改配置');
    }
    if (this.state.currentSession?.status === 'active') {
      throw new Error('当前场次进行中，无法修改');
    }
  }

  updateEventName(name: string): void {
    this.ensureSetup();
    this.state.name = name;
    this.audit('admin', 'update_event_name', name);
    this.emit();
  }

  updateRules(rules: Partial<AuctionRules>): void {
    this.ensureSetup();
    this.state.rules = { ...this.state.rules, ...rules };
    if (rules.multipliers) {
      this.state.rules.multipliers = { ...this.state.rules.multipliers, ...rules.multipliers };
    }
    this.audit('admin', 'update_rules', JSON.stringify(rules));
    this.emit();
  }

  addPlayer(input: Omit<Player, 'status'>): Player {
    this.ensureSetup();
    if (this.state.players.some((p) => p.id === input.id)) {
      throw new Error('选手 ID 已存在');
    }
    const player: Player = { ...input, status: 'pending' };
    this.state.players.push(player);
    this.audit('admin', 'add_player', player.id);
    this.emit();
    return player;
  }

  updatePlayer(id: string, patch: Partial<Omit<Player, 'id'>>): void {
    this.ensureSetup();
    const player = this.state.players.find((p) => p.id === id);
    if (!player) throw new Error('选手不存在');
    Object.assign(player, patch);
    this.audit('admin', 'update_player', id);
    this.emit();
  }

  deletePlayer(id: string): void {
    this.ensureSetup();
    const idx = this.state.players.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error('选手不存在');
    this.state.players.splice(idx, 1);
    this.audit('admin', 'delete_player', id);
    this.emit();
  }

  importPlayers(players: Omit<Player, 'status'>[]): void {
    this.ensureSetup();
    for (const p of players) {
      if (!this.state.players.some((x) => x.id === p.id)) {
        this.state.players.push({ ...p, status: 'pending' });
      }
    }
    this.audit('admin', 'import_players', String(players.length));
    this.emit();
  }

  /** 替换全部选手（用于 S5 名单导入） */
  replacePlayers(players: Omit<Player, 'status'>[]): void {
    this.ensureSetup();
    this.state.players = players.map((p) => ({ ...p, status: 'pending' }));
    this.audit('admin', 'replace_players', String(players.length));
    this.emit();
  }

  /** 替换全部队长（用于 S5 名单导入；允许多名队长同位置） */
  replaceCaptains(captains: Captain[]): void {
    this.ensureSetup();
    this.state.captains = captains.map((c) => ({ ...c }));
    this.audit('admin', 'replace_captains', String(captains.length));
    this.emit();
  }

  addCaptain(input: Captain): Captain {
    this.ensureSetup();
    if (this.state.captains.some((c) => c.id === input.id)) {
      throw new Error('队长 ID 已存在');
    }
    const captain: Captain = { ...input };
    this.state.captains.push(captain);
    this.audit('admin', 'add_captain', captain.id);
    this.emit();
    return captain;
  }

  updateCaptain(id: string, patch: Partial<Omit<Captain, 'id'>>): void {
    this.ensureSetup();
    const captain = this.state.captains.find((c) => c.id === id);
    if (!captain) throw new Error('队长不存在');
    Object.assign(captain, patch);
    this.audit('admin', 'update_captain', id);
    this.emit();
  }

  deleteCaptain(id: string): void {
    this.ensureSetup();
    const idx = this.state.captains.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error('队长不存在');
    this.state.captains.splice(idx, 1);
    this.audit('admin', 'delete_captain', id);
    this.emit();
  }

  /** 重置拍卖进度，保留选手/队长名单及规则配置 */
  resetAuction(): void {
    this.clearTimer();
    this.state = createSoftResetState(this.state);
    this.audit('admin', 'reset_auction', '保留名单，重置拍卖状态');
    this.emit();
  }

  pauseEvent(): void {
    if (this.state.phase === 'ended' || this.state.phase === 'setup') {
      throw new Error('当前状态不可暂停');
    }
    this.state.paused = true;
    this.clearTimer();
    this.audit('admin', 'pause');
    this.emit();
  }

  resumeEvent(): void {
    if (!this.state.paused) throw new Error('赛事未暂停');
    this.state.paused = false;
    const session = this.state.currentSession;
    if (session?.status === 'active' && session.phaseEndsAt) {
      const remaining = session.phaseEndsAt - Date.now();
      if (remaining > 0) {
        this.schedulePhaseEnd(remaining);
      } else {
        this.onPhaseTimeout();
      }
    }
    this.audit('admin', 'resume');
    this.emit();
  }

  startEvent(): void {
    if (this.state.phase !== 'setup') {
      throw new Error('赛事已开始或已结束');
    }
    if (this.state.players.filter((p) => p.status === 'pending').length === 0) {
      throw new Error('主选手池为空，无法开始');
    }
    this.state.phase = 'main';
    this.state.paused = false;
    this.audit('admin', 'start_event');
    this.emit();
  }

  drawNext(): AuctionSession {
    if (this.state.paused) throw new Error('赛事已暂停');
    if (this.state.currentSession?.status === 'active') {
      throw new Error('当前场次尚未结束');
    }

    const poolPhase: AuctionEventPhase =
      this.state.phase === 'failed_pool' ? 'failed_pool' : 'main';

    const pool = this.state.players.filter((p) =>
      poolPhase === 'main' ? p.status === 'pending' : p.status === 'failed_pool',
    );

    if (pool.length === 0) {
      if (this.state.phase === 'main') {
        const failed = this.state.players.filter((p) => p.status === 'failed_pool');
        if (failed.length > 0) {
          this.state.phase = 'failed_pool';
          this.audit('system', 'enter_failed_pool');
          this.emit();
          return this.drawNext();
        }
        this.state.phase = 'ended';
        this.audit('system', 'event_ended');
        this.emit();
        throw new Error('赛事已结束，无更多选手');
      }
      this.state.phase = 'ended';
      this.audit('system', 'event_ended');
      this.emit();
      throw new Error('流拍池已空，赛事结束');
    }

    const player = pool[Math.floor(Math.random() * pool.length)];
    const banned =
      poolPhase === 'failed_pool'
        ? getBannedCaptainsAfterReveal(player, this.state.captains, poolPhase, 1)
        : [];

    const session: AuctionSession = {
      id: uuid(),
      playerId: player.id,
      eventPhase: poolPhase,
      round: 1,
      phase: poolPhase === 'failed_pool' ? 'bidding' : 'reveal',
      status: 'active',
      overtimeIndex: 0,
      overtimeCaptainIds: [],
      bannedCaptainIds: banned,
      bids: [],
      logs: [`抽选选手 ${player.name}（${player.id}），${poolPhase === 'main' ? '正赛' : '流拍池补拍'}`],
    };

    if (poolPhase === 'failed_pool') {
      session.logs.push('流拍池场次：全信息公开，无保护价');
      this.schedulePhaseEnd(this.state.rules.bidDurationSec * 1000);
    } else {
      session.logs.push('R1 揭晓：评级');
      this.schedulePhaseEnd(this.state.rules.revealDurationSec * 1000);
    }

    this.state.currentSession = session;
    this.audit('admin', 'draw_player', player.id);
    this.emit();
    return session;
  }

  placeBid(captainId: string, amount: number): void {
    if (this.state.paused) throw new Error('赛事已暂停');
    const session = this.state.currentSession;
    if (!session) throw new Error('无进行中的竞拍');

    const captain = this.state.captains.find((c) => c.id === captainId);
    if (!captain) throw new Error('队长不存在');

    const check = canCaptainBid(session, captainId);
    if (!check.allowed) throw new Error(check.reason ?? '不可出价');

    if (amount <= 0) throw new Error('出价须大于 0');
    if (amount > captain.budget) throw new Error('超出剩余预算');

    const bid = {
      captainId,
      amount,
      round: session.round,
      isOvertime: session.phase === 'overtime',
      overtimeIndex: session.overtimeIndex,
      createdAt: new Date().toISOString(),
    };

    const existingIdx = session.bids.findIndex(
      (b) =>
        b.captainId === captainId &&
        b.round === session.round &&
        b.isOvertime === bid.isOvertime &&
        b.overtimeIndex === bid.overtimeIndex,
    );
    if (existingIdx >= 0) session.bids[existingIdx] = bid;
    else session.bids.push(bid);

    session.logs.push(`队长 ${captain.name} 出价 ${amount}`);
    this.emit();
  }

  skipTimer(): void {
    if (this.state.paused) throw new Error('赛事已暂停');
    this.clearTimer();
    this.onPhaseTimeout();
  }

  getSnapshot(viewerCaptainId?: string, includeAdmin = false): AuctionSnapshot {
    const s = this.state;
    const session = s.currentSession;
    const player = session ? s.players.find((p) => p.id === session.playerId) : null;

    let currentSessionSnapshot: AuctionSnapshot['currentSession'] = null;
    if (session && player) {
      const isOvertime = session.phase === 'overtime';
      const roundBids = isOvertime
        ? getEffectiveBidsForRound(session, session.round, session.overtimeIndex)
        : getEffectiveBidsForRound(session, session.round);

      const showAllAmounts = includeAdmin || !viewerCaptainId;
      const captainBids: CaptainBidView[] = s.captains.map((c) => {
        const bid = roundBids.find((b) => b.captainId === c.id);
        const showAmount = showAllAmounts || viewerCaptainId === c.id;
        return {
          captainId: c.id,
          captainName: c.name,
          hasBid: !!bid,
          amount: showAmount ? bid?.amount : undefined,
        };
      });

      const fullReveal = session.eventPhase === 'failed_pool';
      const revealed = {
        grade: fullReveal || session.round >= 1,
        position: fullReveal || session.round >= 2,
        id: fullReveal || session.round >= 3,
      };

      currentSessionSnapshot = {
        id: session.id,
        eventPhase: session.eventPhase,
        round: session.round,
        phase: session.phase,
        status: session.status,
        overtimeIndex: session.overtimeIndex,
        overtimeCaptainIds: session.overtimeCaptainIds,
        bannedCaptainIds: session.bannedCaptainIds,
        phaseEndsAt: session.phaseEndsAt,
        player: buildPlayerPublicView(player, session, session.eventPhase),
        revealed,
        multiplierHint:
          session.round <= 3 ? s.rules.multipliers[session.round as 1 | 2 | 3] : null,
        secondPlaceAmount: getSecondPlaceAmount(roundBids),
        instantKillThreshold: getInstantKillThreshold(session.round, roundBids, s.rules),
        captainBids,
        logs: session.logs,
        winnerCaptainId: session.winnerCaptainId,
        winningPrice: session.winningPrice,
        failReason: session.failReason,
      };
    }

    const history = this.buildHistory();

    return {
      event: {
        id: s.id,
        name: s.name,
        phase: s.phase,
        paused: s.paused,
        rules: s.rules,
      },
      captains: s.captains,
      players: s.players.map((p) =>
        includeAdmin || s.phase === 'ended'
          ? {
              id: p.id,
              name: p.name,
              position: p.position,
              grade: p.grade,
              protectionPrice: p.protectionPrice,
              status: p.status,
              winningCaptainId: p.winningCaptainId,
              winningPrice: p.winningPrice,
            }
          : buildPlayerPublicView(
              p,
              session && session.playerId === p.id ? session : null,
              session?.eventPhase ?? null,
            ),
      ),
      failedPoolCount: s.players.filter((p) => p.status === 'failed_pool').length,
      pendingMainCount: s.players.filter((p) => p.status === 'pending').length,
      history,
      auditLogs: includeAdmin ? s.auditLogs : [],
      currentSession: currentSessionSnapshot,
    };
  }

  private buildHistory(): HistoryItem[] {
    return this.state.history.map((session) => {
      const player = this.state.players.find((p) => p.id === session.playerId);
      const winner = session.winnerCaptainId
        ? this.state.captains.find((c) => c.id === session.winnerCaptainId)
        : undefined;
      const lastBid = session.bids[session.bids.length - 1];
      return {
        sessionId: session.id,
        playerId: session.playerId,
        playerName: player?.name ?? session.playerId,
        eventPhase: session.eventPhase,
        status: session.status,
        winnerCaptainId: session.winnerCaptainId,
        winnerName: winner?.name,
        winningPrice: session.winningPrice,
        failReason: session.failReason,
        endedAt: lastBid?.createdAt ?? new Date().toISOString(),
        bidCount: session.bids.length,
      };
    });
  }

  private restoreTimerIfNeeded(): void {
    if (this.state.paused) return;
    const session = this.state.currentSession;
    if (!session || session.status !== 'active' || !session.phaseEndsAt) return;
    const remaining = session.phaseEndsAt - Date.now();
    if (remaining > 0) {
      this.schedulePhaseEnd(remaining);
    } else {
      setTimeout(() => this.onPhaseTimeout(), 0);
    }
  }

  private onPhaseTimeout(): void {
    if (this.state.paused) return;
    const session = this.state.currentSession;
    if (!session || session.status !== 'active') return;

    if (session.phase === 'reveal') {
      session.phase = 'bidding';
      session.logs.push(`R${session.round} 竞价开始`);
      this.schedulePhaseEnd(this.state.rules.bidDurationSec * 1000);
      this.emit();
      return;
    }

    if (session.phase === 'bidding' || session.phase === 'overtime') {
      this.applySettlement();
    }
  }

  private applySettlement(): void {
    const session = this.state.currentSession;
    if (!session) return;

    const player = this.state.players.find((p) => p.id === session.playerId);
    if (!player) return;

    const action = settleRound({
      session,
      player,
      captains: this.state.captains,
      rules: this.state.rules,
    });

    this.handleSettlement(action, player);
  }

  private handleSettlement(action: SettlementAction, player: Player): void {
    const session = this.state.currentSession;
    if (!session) return;

    session.logs.push(`结算：${action.type} — ${'reason' in action ? action.reason : ''}`);

    switch (action.type) {
      case 'deal':
        this.finalizeDeal(session, player, action.captainId, action.price, action.reason);
        break;
      case 'failed':
        this.finalizeFailed(session, player, action.reason);
        break;
      case 'next_round':
        this.advanceRound(session, action.round);
        break;
      case 'overtime':
        this.startOvertime(session, action.captainIds);
        break;
      default:
        break;
    }

    this.emit();
  }

  private finalizeDeal(
    session: AuctionSession,
    player: Player,
    captainId: string,
    price: number,
    reason: string,
  ): void {
    session.status = 'sold';
    session.winnerCaptainId = captainId;
    session.winningPrice = price;
    session.logs.push(reason);

    player.status = 'sold';
    player.winningCaptainId = captainId;
    player.winningPrice = price;

    const captain = this.state.captains.find((c) => c.id === captainId);
    if (captain) captain.budget -= price;

    this.state.history.unshift({ ...session, bids: [...session.bids] });
    this.state.currentSession = null;
    this.clearTimer();
    this.audit('system', 'deal', `${player.id} -> ${captainId} @ ${price}`);
  }

  private finalizeFailed(session: AuctionSession, player: Player, reason: string): void {
    session.status = 'failed';
    session.failReason = reason;
    session.logs.push(reason);

    player.status = 'failed_pool';
    this.state.history.unshift({ ...session, bids: [...session.bids] });
    this.state.currentSession = null;
    this.clearTimer();
    this.audit('system', 'failed', `${player.id}: ${reason}`);
  }

  private advanceRound(session: AuctionSession, round: Round): void {
    session.round = round;
    session.phase = 'reveal';
    session.overtimeCaptainIds = [];

    const player = this.state.players.find((p) => p.id === session.playerId)!;
    const banned = getBannedCaptainsAfterReveal(
      player,
      this.state.captains,
      session.eventPhase,
      round,
    );
    session.bannedCaptainIds = [...new Set([...session.bannedCaptainIds, ...banned])];

    const revealLabels: Record<Round, string> = {
      1: '评级',
      2: '位置',
      3: '选手 ID',
      4: '无新信息',
    };
    session.logs.push(`R${round} 揭晓：${revealLabels[round]}`);

    if (session.eventPhase === 'failed_pool') {
      session.phase = 'bidding';
      session.logs.push(`R${round} 竞价开始`);
      this.schedulePhaseEnd(this.state.rules.bidDurationSec * 1000);
    } else {
      this.schedulePhaseEnd(this.state.rules.revealDurationSec * 1000);
    }
  }

  private startOvertime(session: AuctionSession, captainIds: string[]): void {
    session.phase = 'overtime';
    session.overtimeIndex += 1;
    session.overtimeCaptainIds = captainIds;
    const names = captainIds
      .map((id) => this.state.captains.find((c) => c.id === id)?.name ?? id)
      .join('、');
    session.logs.push(`加时第 ${session.overtimeIndex} 轮，参与者：${names}`);
    this.schedulePhaseEnd(this.state.rules.overtimeDurationSec * 1000);
  }

  private schedulePhaseEnd(ms: number): void {
    this.clearTimer();
    const session = this.state.currentSession;
    if (session) {
      session.phaseEndsAt = Date.now() + ms;
    }
    this.timer = setTimeout(() => this.onPhaseTimeout(), ms);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    this.persist(this.state);
    this.broadcast(this.getSnapshot());
  }
}

export function createDefaultEvent(name = '选秀大赛'): EventState {
  return {
    id: uuid(),
    name,
    phase: 'setup',
    paused: false,
    rules: { ...DEFAULT_RULES, bidDurationSec: 30, revealDurationSec: 3, overtimeDurationSec: 30 },
    captains: createSeedCaptains(),
    players: createSeedPlayers(),
    currentSession: null,
    history: [],
    auditLogs: [],
  };
}

/** 从当前状态生成软重置状态：保留名单与规则，清空拍卖进度 */
export function createSoftResetState(current: EventState): EventState {
  const spentByCaptain = new Map<string, number>();
  for (const session of current.history) {
    if (session.status === 'sold' && session.winnerCaptainId && session.winningPrice != null) {
      const id = session.winnerCaptainId;
      spentByCaptain.set(id, (spentByCaptain.get(id) ?? 0) + session.winningPrice);
    }
  }

  return {
    id: current.id,
    name: current.name,
    phase: 'setup',
    paused: false,
    rules: {
      ...current.rules,
      multipliers: { ...current.rules.multipliers },
    },
    captains: current.captains.map((c) => ({
      ...c,
      budget: c.budget + (spentByCaptain.get(c.id) ?? 0),
    })),
    players: current.players.map(({ id, name, position, grade, protectionPrice }) => ({
      id,
      name,
      position,
      grade,
      protectionPrice,
      status: 'pending' as const,
    })),
    currentSession: null,
    history: [],
    auditLogs: [],
  };
}

export type { Grade, Position };
