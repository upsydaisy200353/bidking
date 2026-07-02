import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuction, useCountdown } from '../hooks/useAuction';

export default function CaptainPage() {
  const { captainId = '' } = useParams();
  const { snapshot, error, placeBid } = useAuction({ captainId });
  const [amount, setAmount] = useState('');
  const session = snapshot?.currentSession;
  const countdown = useCountdown(session?.phaseEndsAt);

  const captain = snapshot?.captains.find((c) => c.id === captainId);

  if (error && !snapshot) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-red-200">
          {error}
        </div>
        <Link to="/" className="text-amber-400 hover:underline text-sm">
          ← 返回首页选择队长
        </Link>
      </div>
    );
  }

  if (!snapshot) {
    return <div className="text-slate-400">加载中...</div>;
  }

  if (!captain) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-950 border border-amber-800 px-4 py-3 text-amber-200">
          未找到队长「{captainId}」。请从首页选择正确的队长身份。
        </div>
        <div className="flex flex-wrap gap-2">
          {snapshot.captains.map((c) => (
            <Link
              key={c.id}
              to={`/captain/${c.id}`}
              className="px-3 py-2 rounded bg-slate-800 text-sm hover:bg-slate-700"
            >
              {c.name}（{c.position}）
            </Link>
          ))}
        </div>
        <Link to="/" className="text-amber-400 hover:underline text-sm block">
          ← 返回首页
        </Link>
      </div>
    );
  }

  const banned = session?.bannedCaptainIds.includes(captainId) ?? false;
  const inOvertime = session?.phase === 'overtime';
  const canBidInOvertime =
    !inOvertime || (session?.overtimeCaptainIds.includes(captainId) ?? false);
  const canBid =
    session?.status === 'active' &&
    (session.phase === 'bidding' || session.phase === 'overtime') &&
    !banned &&
    canBidInOvertime;

  const handleBid = async () => {
    const val = Number(amount);
    if (!val || !captainId) return;
    try {
      await placeBid(captainId, val);
      setAmount('');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const myBid = session?.captainBids.find((b) => b.captainId === captainId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">竞拍大厅</h1>
          <p className="text-slate-400 mt-1">
            {captain.name} · 位置 {captain.position} · 预算 {captain.budget}
          </p>
        </div>
        {session?.eventPhase === 'failed_pool' && (
          <span className="px-3 py-1 rounded-full bg-purple-900 text-purple-200 text-sm">
            流拍池补拍
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-2 text-red-200 text-sm">
          {error}
        </div>
      )}

      {!session ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
          {snapshot.event.paused ? '赛事已暂停' : '等待管理员抽选选手...'}
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">
                R{session.round} ·{' '}
                {session.phase === 'reveal' ? '信息揭晓中' : session.phase === 'bidding' ? '竞价中' : '加时竞价'}
              </h2>
              {session.phaseEndsAt && (
                <span className="text-xl font-mono text-amber-400">⏱ {countdown}s</span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <RevealCard label="评级" value={session.player.grade} revealed={session.revealed.grade} />
              <RevealCard label="位置" value={session.player.position} revealed={session.revealed.position} />
              <RevealCard
                label="选手"
                value={session.player.name ?? session.player.id}
                revealed={session.revealed.id}
              />
              {session.eventPhase === 'main' && session.player.protectionPrice !== undefined && (
                <RevealCard label="保护价" value={String(session.player.protectionPrice)} revealed />
              )}
            </div>

            {session.phase !== 'reveal' && session.multiplierHint && (
              <div className="rounded-lg bg-amber-950/40 border border-amber-800/50 px-4 py-3 text-sm">
                <p>
                  💡 若你的出价高于第二名 <strong>{session.multiplierHint}</strong> 倍，则本轮回直接竞拍成功。
                </p>
                {session.secondPlaceAmount !== null && session.instantKillThreshold !== null && (
                  <p className="text-slate-400 mt-1">
                    当前第二名：{session.secondPlaceAmount} → 秒杀需 ≥ {session.instantKillThreshold}
                  </p>
                )}
              </div>
            )}

            {session.phase !== 'reveal' && !session.multiplierHint && (
              <div className="rounded-lg bg-amber-950/40 border border-amber-800/50 px-4 py-3 text-sm">
                本轮回出价最高者成交；若与最高价相同，将进入加时。
              </div>
            )}

            {session.eventPhase === 'main' && session.player.protectionPrice !== undefined && (
              <div className="rounded-lg bg-blue-950/40 border border-blue-800/50 px-4 py-3 text-sm">
                🛡 若仅你一人出价，须 ≥ {session.player.protectionPrice} 方可成交，否则流拍。
              </div>
            )}

            {banned && (
              <div className="rounded-lg bg-red-950/50 border border-red-800 px-4 py-3 text-red-200 text-sm">
                ❌ 位置冲突，不可竞价
              </div>
            )}

            {inOvertime && !canBidInOvertime && (
              <div className="rounded-lg bg-slate-800 px-4 py-3 text-slate-300 text-sm">
                仅并列最高价队长可参与加时
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="font-medium mb-3">我的出价</h3>
            {myBid?.hasBid && (
              <p className="text-sm text-slate-400 mb-3">本轮已出价：{myBid.amount}</p>
            )}
            <div className="flex gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!canBid}
                placeholder="输入出价金额"
                className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-4 py-2 disabled:opacity-50"
              />
              <button
                onClick={handleBid}
                disabled={!canBid}
                className="px-6 py-2 rounded-lg bg-emerald-600 font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                提交
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="font-medium mb-3">其他队长状态</h3>
            <div className="space-y-2">
              {session.captainBids
                .filter((b) => b.captainId !== captainId)
                .map((b) => (
                  <div
                    key={b.captainId}
                    className="flex justify-between text-sm bg-slate-950 rounded px-3 py-2"
                  >
                    <span>{b.captainName}</span>
                    <span className="text-slate-400">{b.hasBid ? '已出价' : '未出价'}</span>
                  </div>
                ))}
            </div>
          </section>

          {session.status !== 'active' && (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-5">
              {session.status === 'sold' ? (
                <p>
                  ✅ 成交！队长 {session.winnerCaptainId} 以 {session.winningPrice} 拿下选手
                </p>
              ) : (
                <p>❌ 流拍：{session.failReason}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RevealCard({
  label,
  value,
  revealed,
}: {
  label: string;
  value?: string;
  revealed: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-950 p-3 border border-slate-800">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold mt-1">{revealed ? (value ?? '—') : '???'}</div>
    </div>
  );
}
