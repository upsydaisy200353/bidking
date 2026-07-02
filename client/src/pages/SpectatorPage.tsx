import { useAuction, useCountdown } from '../hooks/useAuction';

const phaseLabel: Record<string, string> = {
  setup: '准备中',
  main: '正赛',
  failed_pool: '流拍池补拍',
  ended: '已结束',
};

export default function SpectatorPage() {
  const { snapshot } = useAuction({ mode: 'spectator' });
  const session = snapshot?.currentSession;
  const countdown = useCountdown(session?.phaseEndsAt);

  if (!snapshot) return <div className="text-slate-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 py-6">
        <h1 className="text-4xl font-bold text-amber-400">{snapshot.event.name}</h1>
        <p className="text-slate-400 text-lg">
          {phaseLabel[snapshot.event.phase]}
          {snapshot.event.paused && ' · 已暂停'}
        </p>
      </div>

      {!session ? (
        <div className="text-center text-slate-500 py-20 text-xl">等待下一场竞拍...</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900 p-8 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm text-slate-400">
                  {session.eventPhase === 'failed_pool' ? '流拍池补拍' : '正赛'} · R{session.round}
                </span>
                <h2 className="text-3xl font-bold mt-1">
                  {session.phase === 'reveal' ? '信息揭晓' : session.phase === 'bidding' ? '竞价中' : '加时赛'}
                </h2>
              </div>
              {session.phaseEndsAt && !snapshot.event.paused && (
                <div className="text-5xl font-mono text-amber-400 tabular-nums">{countdown}</div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <BigCard label="评级" value={session.player.grade} hidden={!session.revealed.grade} />
              <BigCard label="位置" value={session.player.position} hidden={!session.revealed.position} />
              <BigCard label="选手" value={session.player.name ?? session.player.id} hidden={!session.revealed.id} />
            </div>

            {session.multiplierHint && session.phase !== 'reveal' && (
              <p className="text-center text-amber-200/80">
                本轮回出价达第二名的 {session.multiplierHint} 倍即可秒杀
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
            <h3 className="font-semibold text-slate-300">队长状态</h3>
            {session.captainBids.map((b) => (
              <div
                key={b.captainId}
                className="flex justify-between items-center bg-slate-950 rounded-lg px-4 py-3"
              >
                <span>
                  {b.captainName}
                  {session.bannedCaptainIds.includes(b.captainId) && (
                    <span className="ml-2 text-xs text-red-400">禁拍</span>
                  )}
                </span>
                <span className={b.hasBid ? 'text-emerald-400' : 'text-slate-500'}>
                  {b.hasBid ? '已出价' : '—'}
                </span>
              </div>
            ))}
          </section>
        </div>
      )}

      {snapshot.history.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-medium mb-3">最近成交</h3>
          <div className="flex flex-wrap gap-2">
            {snapshot.history.slice(0, 8).map((h) => (
              <span
                key={h.sessionId}
                className="px-3 py-1 rounded-full bg-slate-800 text-sm text-slate-300"
              >
                {h.playerName}: {h.status === 'sold' ? `${h.winnerName} @ ${h.winningPrice}` : '流拍'}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BigCard({ label, value, hidden }: { label: string; value?: string; hidden: boolean }) {
  return (
    <div className="rounded-xl bg-slate-950 border border-slate-800 p-6 text-center">
      <div className="text-sm text-slate-500 mb-2">{label}</div>
      <div className="text-3xl font-bold">{hidden ? '???' : (value ?? '—')}</div>
    </div>
  );
}
