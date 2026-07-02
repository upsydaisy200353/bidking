import { useState, type ReactNode } from 'react';
import { useAuction, useCountdown, type S5Preview } from '../hooks/useAuction';
import {
  GRADES,
  POSITIONS,
  type Grade,
  type Position,
} from '../types';

const phaseLabel: Record<string, string> = {
  setup: '准备中',
  main: '正赛',
  failed_pool: '流拍池补拍',
  ended: '已结束',
};

type Tab = 'console' | 'players' | 'captains' | 'stats' | 'rules' | 'history';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('console');
  const api = useAuction({ mode: 'admin' });
  const { snapshot, error } = api;
  const session = snapshot?.currentSession;
  const countdown = useCountdown(session?.phaseEndsAt);
  const isSetup = snapshot?.event.phase === 'setup';

  if (!snapshot) return <div className="text-slate-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">管理控制台</h1>
          <span className="px-2 py-1 rounded bg-slate-800 text-sm">{phaseLabel[snapshot.event.phase]}</span>
          {snapshot.event.paused && (
            <span className="px-2 py-1 rounded bg-red-900 text-red-200 text-sm">已暂停</span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-2 text-red-200 text-sm">{error}</div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {(
          [
            ['console', '竞拍控制'],
            ['players', '选手管理'],
            ['captains', '队长管理'],
            ['stats', '位置统计'],
            ['rules', '规则配置'],
            ['history', '历史记录'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'console' && (
        <ConsoleTab snapshot={snapshot} session={session ?? null} countdown={countdown} api={api} />
      )}
      {tab === 'players' && isSetup && <PlayersTab snapshot={snapshot} api={api} />}
      {tab === 'players' && !isSetup && <p className="text-slate-400 text-sm">赛事进行中无法编辑选手，请先重置或等待结束。</p>}
      {tab === 'captains' && isSetup && <CaptainsTab snapshot={snapshot} api={api} />}
      {tab === 'captains' && !isSetup && <p className="text-slate-400 text-sm">赛事进行中无法编辑队长。</p>}
      {tab === 'stats' && <StatsTab snapshot={snapshot} />}
      {tab === 'rules' && isSetup && <RulesTab snapshot={snapshot} api={api} />}
      {tab === 'rules' && !isSetup && <p className="text-slate-400 text-sm">赛事进行中无法修改规则。</p>}
      {tab === 'history' && <HistoryTab snapshot={snapshot} />}
    </div>
  );
}

function ConsoleTab({
  snapshot,
  session,
  countdown,
  api,
}: {
  snapshot: NonNullable<ReturnType<typeof useAuction>['snapshot']>;
  session: NonNullable<ReturnType<typeof useAuction>['snapshot']>['currentSession'] | null;
  countdown: number;
  api: ReturnType<typeof useAuction>;
}) {
  const run = (fn: () => Promise<unknown>) => fn().catch((e) => alert((e as Error).message));

  return (
  <>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => run(api.startEvent)} color="amber">开始赛事</Btn>
        <Btn onClick={() => run(api.drawNext)} color="emerald">抽选选手</Btn>
        <Btn onClick={() => run(api.skipTimer)}>跳过倒计时</Btn>
        {snapshot.event.paused ? (
          <Btn onClick={() => run(api.resumeEvent)} color="emerald">恢复</Btn>
        ) : (
          <Btn onClick={() => run(api.pauseEvent)} color="red">暂停</Btn>
        )}
        <Btn onClick={() => run(api.reset)}>重置拍卖</Btn>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Stat label="主池待拍" value={snapshot.pendingMainCount} />
        <Stat label="流拍池" value={snapshot.failedPoolCount} />
        <Stat label="队长数" value={snapshot.captains.length} />
        <Stat label="已完成场次" value={snapshot.history.length} />
      </div>

      <OnlineCaptainsPanel
        captains={snapshot.captains}
        onlineCaptainIds={snapshot.onlineCaptainIds}
      />

      {session && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-semibold">
                当前场次 · R{session.round} ·{' '}
                {session.phase === 'reveal' ? '揭晓' : session.phase === 'bidding' ? '竞价' : '加时'}
              </h2>
              <p className="text-sm text-slate-400">
                {session.eventPhase === 'failed_pool' ? '流拍池补拍' : '正赛'} · {session.player.name ?? session.player.id}
              </p>
            </div>
            {session.phaseEndsAt && !snapshot.event.paused && (
              <div className="text-2xl font-mono text-amber-400">⏱ {countdown}s</div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <Info label="评级" value={session.player.grade ?? '未揭晓'} />
            <Info label="位置" value={session.player.position ?? '未揭晓'} />
            <Info label="保护价" value={session.player.protectionPrice ?? '—'} />
            <Info label="倍率" value={session.multiplierHint ? `×${session.multiplierHint}` : 'R4 最高价'} />
            <Info label="秒杀线" value={session.instantKillThreshold ?? '—'} />
            <Info label="第二高价" value={session.secondPlaceAmount ?? '—'} />
          </div>

          <div className="space-y-1">
            {session.captainBids.map((b) => (
              <div key={b.captainId} className="flex justify-between items-center text-sm bg-slate-950 rounded px-3 py-2">
                <span className="flex items-center gap-2">
                  <OnlineDot online={isCaptainOnline(snapshot.onlineCaptainIds, b.captainId)} />
                  {b.captainName}
                  {session.bannedCaptainIds.includes(b.captainId) && (
                    <span className="text-red-400">禁拍</span>
                  )}
                </span>
                <span>{b.hasBid ? b.amount : '未出价'}</span>
              </div>
            ))}
          </div>

          <LogList logs={session.logs} />
        </section>
      )}

      <PlayersTable players={snapshot.players} full />
    </>
  );
}

function PlayersTab({
  snapshot,
  api,
}: {
  snapshot: NonNullable<ReturnType<typeof useAuction>['snapshot']>;
  api: ReturnType<typeof useAuction>;
}) {
  const [form, setForm] = useState({
    id: '',
    name: '',
    position: '上' as Position,
    grade: 'SR' as Grade,
    protectionPrice: 1000,
  });
  const [csv, setCsv] = useState(
    'p7,选手七号,中,UR,4000\np8,选手八号,辅,R,1200',
  );

  const run = (fn: () => Promise<unknown>) => fn().catch((e) => alert((e as Error).message));

  return (
    <div className="space-y-6">
      <form
        className="grid md:grid-cols-6 gap-2 items-end rounded-xl border border-slate-800 bg-slate-900 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api.addPlayer(form));
        }}
      >
        <Field label="ID" value={form.id} onChange={(v) => setForm({ ...form, id: v })} />
        <Field label="姓名" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Select label="位置" value={form.position} options={POSITIONS} onChange={(v) => setForm({ ...form, position: v as Position })} />
        <Select label="评级" value={form.grade} options={GRADES} onChange={(v) => setForm({ ...form, grade: v as Grade })} />
        <Field label="保护价" type="number" value={String(form.protectionPrice)} onChange={(v) => setForm({ ...form, protectionPrice: Number(v) })} />
        <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 h-10">添加</button>
      </form>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
        <h3 className="font-medium">CSV 批量导入</h3>
        <p className="text-xs text-slate-500">格式：id,name,position,grade,protectionPrice</p>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-2 text-sm font-mono"
        />
        <Btn onClick={() => run(() => api.importPlayers(csv))} color="emerald">导入</Btn>
      </div>

      <S5ImportPanel api={api} />

      <PlayersTable
        players={snapshot.players}
        full
        onDelete={(id) => run(() => api.deletePlayer(id))}
        onUpdate={(id, patch) => run(() => api.updatePlayer(id, patch))}
      />
    </div>
  );
}

function CaptainsTab({
  snapshot,
  api,
}: {
  snapshot: NonNullable<ReturnType<typeof useAuction>['snapshot']>;
  api: ReturnType<typeof useAuction>;
}) {
  const [form, setForm] = useState({ id: '', name: '', position: '上' as Position, budget: 10000 });
  const run = (fn: () => Promise<unknown>) => fn().catch((e) => alert((e as Error).message));

  return (
    <div className="space-y-4">
      <form
        className="grid md:grid-cols-5 gap-2 items-end rounded-xl border border-slate-800 bg-slate-900 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api.addCaptain(form));
        }}
      >
        <Field label="ID" value={form.id} onChange={(v) => setForm({ ...form, id: v })} />
        <Field label="名称" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Select label="位置" value={form.position} options={POSITIONS} onChange={(v) => setForm({ ...form, position: v as Position })} />
        <Field label="预算" type="number" value={String(form.budget)} onChange={(v) => setForm({ ...form, budget: Number(v) })} />
        <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 h-10">添加队长</button>
      </form>

      <CaptainsTable
        captains={snapshot.captains}
        onlineCaptainIds={snapshot.onlineCaptainIds}
        onUpdate={(id, patch) => run(() => api.updateCaptain(id, patch))}
        onDelete={(id) => run(() => api.deleteCaptain(id))}
      />
    </div>
  );
}

function RulesTab({
  snapshot,
  api,
}: {
  snapshot: NonNullable<ReturnType<typeof useAuction>['snapshot']>;
  api: ReturnType<typeof useAuction>;
}) {
  const [name, setName] = useState(snapshot.event.name);
  const [rules, setRules] = useState(snapshot.event.rules);
  const run = (fn: () => Promise<unknown>) => fn().catch((e) => alert((e as Error).message));

  return (
    <form
      className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4 max-w-lg"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api.updateEvent({ name, rules }));
      }}
    >
      <Field label="赛事名称" value={name} onChange={setName} />
      <Field label="R1 倍率" type="number" value={String(rules.multipliers[1])} onChange={(v) => setRules({ ...rules, multipliers: { ...rules.multipliers, 1: Number(v) } })} />
      <Field label="R2 倍率" type="number" value={String(rules.multipliers[2])} onChange={(v) => setRules({ ...rules, multipliers: { ...rules.multipliers, 2: Number(v) } })} />
      <Field label="R3 倍率" type="number" value={String(rules.multipliers[3])} onChange={(v) => setRules({ ...rules, multipliers: { ...rules.multipliers, 3: Number(v) } })} />
      <Field label="竞价时长(秒)" type="number" value={String(rules.bidDurationSec)} onChange={(v) => setRules({ ...rules, bidDurationSec: Number(v) })} />
      <Field label="揭晓时长(秒)" type="number" value={String(rules.revealDurationSec)} onChange={(v) => setRules({ ...rules, revealDurationSec: Number(v) })} />
      <Field label="加时时长(秒)" type="number" value={String(rules.overtimeDurationSec)} onChange={(v) => setRules({ ...rules, overtimeDurationSec: Number(v) })} />
      <button type="submit" className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 font-medium">保存配置</button>
    </form>
  );
}

function HistoryTab({ snapshot }: { snapshot: NonNullable<ReturnType<typeof useAuction>['snapshot']> }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-medium mb-2">竞拍历史</h3>
        <table className="w-full text-sm rounded-xl border border-slate-800 overflow-hidden">
          <thead className="bg-slate-950 text-slate-400">
            <tr>
              <th className="p-3 text-left">选手</th>
              <th className="p-3 text-left">阶段</th>
              <th className="p-3 text-left">结果</th>
              <th className="p-3 text-left">成交价</th>
              <th className="p-3 text-left">出价次数</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.history.map((h) => (
              <tr key={h.sessionId} className="border-t border-slate-800 bg-slate-900">
                <td className="p-3">{h.playerName}</td>
                <td className="p-3">{h.eventPhase === 'main' ? '正赛' : '流拍池'}</td>
                <td className="p-3">
                  {h.status === 'sold' ? `成交 → ${h.winnerName}` : `流拍：${h.failReason}`}
                </td>
                <td className="p-3">{h.winningPrice ?? '—'}</td>
                <td className="p-3">{h.bidCount}</td>
              </tr>
            ))}
            {snapshot.history.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-slate-500">暂无记录</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-medium mb-2">审计日志</h3>
        <div className="max-h-60 overflow-y-auto text-xs font-mono space-y-1 bg-slate-900 border border-slate-800 rounded-xl p-3">
          {snapshot.auditLogs.map((log) => (
            <div key={log.id} className="text-slate-400">
              [{new Date(log.at).toLocaleString()}] {log.actor} · {log.action}
              {log.detail ? ` · ${log.detail}` : ''}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function S5ImportPanel({ api }: { api: ReturnType<typeof useAuction> }) {
  const [preview, setPreview] = useState<S5Preview | null>(null);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [includeCaptains, setIncludeCaptains] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      setLoading(true);
      await fn();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = () =>
    run(async () => {
      const data = await api.previewS5Roster();
      setPreview(data);
      const initial: Record<string, Grade> = {};
      for (const p of data.players) initial[p.id] = p.grade;
      setGrades(initial);
    });

  const doImport = () =>
    run(async () => {
      const result = await api.importS5Roster({ includeCaptains, gradeOverrides: grades });
      setPreview(null);
      const skipped = result.skippedCaptains.length
        ? `\n未导入队长：${result.skippedCaptains.join('；')}`
        : '';
      alert(`已导入 ${result.importedPlayers} 名选手${result.importedCaptains ? `、${result.importedCaptains} 名队长` : ''}${skipped}`);
    });

  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-medium text-amber-200">S5 白菜杯名单导入</h3>
        <span className="text-xs text-slate-500">起拍价 → 保护价；评级可预览后调整</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={loadPreview} color="amber">{loading ? '加载中…' : '预览 bundled 名单'}</Btn>
        {preview && (
          <>
            <label className="flex items-center gap-2 text-sm text-slate-300 px-2">
              <input
                type="checkbox"
                checked={includeCaptains}
                onChange={(e) => setIncludeCaptains(e.target.checked)}
              />
              同时导入全部队长（8 位，允许多名同位置）
            </label>
            <Btn onClick={doImport} color="emerald">确认导入（替换现有选手）</Btn>
          </>
        )}
      </div>
      {preview && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            来源 {preview.source} · {preview.playerCount} 选手
            {preview.captainCount > 0 && ` · ${preview.captainCount} 队长候选`}
          </p>
          <div className="max-h-64 overflow-auto rounded border border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="p-2 text-left">ID</th>
                  <th className="p-2 text-left">姓名</th>
                  <th className="p-2 text-left">位置</th>
                  <th className="p-2 text-left">保护价</th>
                  <th className="p-2 text-left">评级</th>
                </tr>
              </thead>
              <tbody>
                {preview.players.map((p) => (
                  <tr key={p.id} className="border-t border-slate-800">
                    <td className="p-2 font-mono">{p.id}</td>
                    <td className="p-2">{p.name}</td>
                    <td className="p-2">{p.position}</td>
                    <td className="p-2">{p.protectionPrice}</td>
                    <td className="p-2">
                      <select
                        value={grades[p.id] ?? p.grade}
                        onChange={(e) => setGrades({ ...grades, [p.id]: e.target.value as Grade })}
                        className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5"
                      >
                        {GRADES.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsTab({ snapshot }: { snapshot: NonNullable<ReturnType<typeof useAuction>['snapshot']> }) {
  const onlineCount = snapshot.onlineCaptainIds?.length ?? 0;
  const rows = POSITIONS.map((position) => {
    const captains = snapshot.captains.filter((c) => c.position === position).length;
    const online = snapshot.captains.filter(
      (c) => c.position === position && isCaptainOnline(snapshot.onlineCaptainIds, c.id),
    ).length;
    const players = snapshot.players.filter((p) => p.position === position).length;
    return { position, captains, online, players, total: captains + players };
  });
  const sumCaptains = rows.reduce((n, r) => n + r.captains, 0);
  const sumPlayers = rows.reduce((n, r) => n + r.players, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        统计当前名单内队长与选手在各位置的分布（队长 {sumCaptains} 人 + 选手 {sumPlayers} 人 = 合计 {sumCaptains + sumPlayers} 人）
        {' · '}
        <span className="text-emerald-400">{onlineCount}</span>/{sumCaptains} 队长在线
      </p>
      <table className="w-full text-sm rounded-xl border border-slate-800 overflow-hidden">
        <thead className="bg-slate-950 text-slate-400">
          <tr>
            <th className="p-3 text-left">位置</th>
            <th className="p-3 text-right">队长</th>
            <th className="p-3 text-right">在线</th>
            <th className="p-3 text-right">选手</th>
            <th className="p-3 text-right">合计</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.position} className="border-t border-slate-800 bg-slate-900">
              <td className="p-3 font-medium">{r.position}</td>
              <td className="p-3 text-right">{r.captains}</td>
              <td className="p-3 text-right">
                <span className={r.online > 0 ? 'text-emerald-400' : 'text-slate-500'}>{r.online}</span>
              </td>
              <td className="p-3 text-right">{r.players}</td>
              <td className="p-3 text-right font-semibold text-amber-400">{r.total}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-700 bg-slate-950 font-medium">
            <td className="p-3">总计</td>
            <td className="p-3 text-right">{sumCaptains}</td>
            <td className="p-3 text-right text-emerald-400">{onlineCount}</td>
            <td className="p-3 text-right">{sumPlayers}</td>
            <td className="p-3 text-right text-amber-400">{sumCaptains + sumPlayers}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function isCaptainOnline(onlineCaptainIds: string[] | undefined, captainId: string): boolean {
  return onlineCaptainIds?.includes(captainId) ?? false;
}

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${online ? 'bg-emerald-400' : 'bg-red-500'}`}
      title={online ? '在线' : '离线'}
    />
  );
}

function OnlineIndicator({ online }: { online: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <OnlineDot online={online} />
      <span className={online ? 'text-emerald-400' : 'text-slate-500'}>{online ? '在线' : '离线'}</span>
    </span>
  );
}

function OnlineCaptainsPanel({
  captains,
  onlineCaptainIds,
}: {
  captains: NonNullable<ReturnType<typeof useAuction>['snapshot']>['captains'];
  onlineCaptainIds?: string[];
}) {
  const onlineCount = onlineCaptainIds?.length ?? 0;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-medium">队长在线状态</h3>
        <span className="text-sm text-slate-400">
          <span className="text-emerald-400 font-medium">{onlineCount}</span>/{captains.length} 在线
        </span>
      </div>
      {captains.length === 0 ? (
        <p className="text-sm text-slate-500">暂无队长</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {captains.map((c) => {
            const online = isCaptainOnline(onlineCaptainIds, c.id);
            return (
              <span
                key={c.id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm border ${
                  online
                    ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-200'
                    : 'border-slate-700 bg-slate-950 text-slate-400'
                }`}
              >
                <OnlineDot online={online} />
                {c.name}
                <span className="text-xs opacity-70">{c.position}</span>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CaptainsTable({
  captains,
  onlineCaptainIds,
  onUpdate,
  onDelete,
}: {
  captains: NonNullable<ReturnType<typeof useAuction>['snapshot']>['captains'];
  onlineCaptainIds?: string[];
  onUpdate: (id: string, patch: { name?: string; position?: Position; budget?: number }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', position: '上' as Position, budget: 0 });

  const startEdit = (c: (typeof captains)[0]) => {
    setEditingId(c.id);
    setDraft({ name: c.name, position: c.position, budget: c.budget });
  };

  const saveEdit = async (id: string) => {
    await onUpdate(id, draft);
    setEditingId(null);
  };

  return (
    <table className="w-full text-sm rounded-xl border border-slate-800 overflow-hidden">
      <thead className="bg-slate-950 text-slate-400">
        <tr>
          <th className="p-3 text-left">ID</th>
          <th className="p-3 text-left">名称</th>
          <th className="p-3 text-left">位置</th>
          <th className="p-3 text-left">预算</th>
          <th className="p-3 text-left">在线</th>
          <th className="p-3 text-right">操作</th>
        </tr>
      </thead>
      <tbody>
        {captains.map((c) => {
          const editing = editingId === c.id;
          return (
            <tr key={c.id} className="border-t border-slate-800 bg-slate-900">
              <td className="p-3 font-mono text-xs">{c.id}</td>
              <td className="p-3">
                {editing ? (
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1"
                  />
                ) : (
                  c.name
                )}
              </td>
              <td className="p-3">
                {editing ? (
                  <select
                    value={draft.position}
                    onChange={(e) => setDraft({ ...draft, position: e.target.value as Position })}
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1"
                  >
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                ) : (
                  c.position
                )}
              </td>
              <td className="p-3">
                {editing ? (
                  <input
                    type="number"
                    value={draft.budget}
                    onChange={(e) => setDraft({ ...draft, budget: Number(e.target.value) })}
                    className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1"
                  />
                ) : (
                  c.budget
                )}
              </td>
              <td className="p-3">
                <OnlineIndicator online={isCaptainOnline(onlineCaptainIds, c.id)} />
              </td>
              <td className="p-3 text-right space-x-2 whitespace-nowrap">
                {editing ? (
                  <>
                    <button onClick={() => saveEdit(c.id).catch((e) => alert((e as Error).message))} className="text-emerald-400 text-xs">保存</button>
                    <button onClick={() => setEditingId(null)} className="text-slate-400 text-xs">取消</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(c)} className="text-amber-400 text-xs">修改</button>
                    <button onClick={() => onDelete(c.id).catch((e) => alert((e as Error).message))} className="text-red-400 text-xs">删除</button>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PlayersTable({
  players,
  full,
  onDelete,
  onUpdate,
}: {
  players: NonNullable<ReturnType<typeof useAuction>['snapshot']>['players'];
  full?: boolean;
  onDelete?: (id: string) => Promise<unknown>;
  onUpdate?: (
    id: string,
    patch: { name?: string; position?: Position; grade?: Grade; protectionPrice?: number },
  ) => Promise<unknown>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    position: '上' as Position,
    grade: 'SR' as Grade,
    protectionPrice: 0,
  });

  const startEdit = (p: (typeof players)[0]) => {
    setEditingId(p.id);
    setDraft({
      name: p.name ?? '',
      position: (p.position ?? '上') as Position,
      grade: (p.grade ?? 'SR') as Grade,
      protectionPrice: p.protectionPrice ?? 0,
    });
  };

  const saveEdit = async (id: string) => {
    if (onUpdate) await onUpdate(id, draft);
    setEditingId(null);
  };

  return (
    <table className="w-full text-sm rounded-xl border border-slate-800 overflow-hidden">
      <thead className="bg-slate-950 text-slate-400">
        <tr>
          <th className="p-3 text-left">ID</th>
          {full && <th className="p-3 text-left">姓名</th>}
          <th className="p-3 text-left">评级</th>
          <th className="p-3 text-left">位置</th>
          <th className="p-3 text-left">保护价</th>
          <th className="p-3 text-left">状态</th>
          {(onDelete || onUpdate) && <th className="p-3 text-right">操作</th>}
        </tr>
      </thead>
      <tbody>
        {players.map((p) => {
          const editing = editingId === p.id;
          return (
            <tr key={p.id} className="border-t border-slate-800 bg-slate-900">
              <td className="p-3 font-mono text-xs">{p.id}</td>
              {full && (
                <td className="p-3">
                  {editing ? (
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1"
                    />
                  ) : (
                    p.name ?? '—'
                  )}
                </td>
              )}
              <td className="p-3">
                {editing ? (
                  <select
                    value={draft.grade}
                    onChange={(e) => setDraft({ ...draft, grade: e.target.value as Grade })}
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                ) : (
                  p.grade ?? '—'
                )}
              </td>
              <td className="p-3">
                {editing ? (
                  <select
                    value={draft.position}
                    onChange={(e) => setDraft({ ...draft, position: e.target.value as Position })}
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1"
                  >
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                ) : (
                  p.position ?? '—'
                )}
              </td>
              <td className="p-3">
                {editing ? (
                  <input
                    type="number"
                    value={draft.protectionPrice}
                    onChange={(e) => setDraft({ ...draft, protectionPrice: Number(e.target.value) })}
                    className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1"
                  />
                ) : (
                  p.protectionPrice ?? '—'
                )}
              </td>
              <td className="p-3">{p.status}</td>
              {(onDelete || onUpdate) && (
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  {editing ? (
                    <>
                      <button onClick={() => saveEdit(p.id).catch((e) => alert((e as Error).message))} className="text-emerald-400 text-xs">保存</button>
                      <button onClick={() => setEditingId(null)} className="text-slate-400 text-xs">取消</button>
                    </>
                  ) : (
                    <>
                      {onUpdate && (
                        <button onClick={() => startEdit(p)} className="text-amber-400 text-xs">修改</button>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(p.id).catch((e) => alert((e as Error).message))} className="text-red-400 text-xs">删除</button>
                      )}
                    </>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Btn({
  children,
  onClick,
  color = 'slate',
}: {
  children: ReactNode;
  onClick: () => void;
  color?: 'amber' | 'emerald' | 'red' | 'slate';
}) {
  const colors = {
    amber: 'bg-amber-500 text-slate-950 hover:bg-amber-400',
    emerald: 'bg-emerald-600 hover:bg-emerald-500',
    red: 'bg-red-800 hover:bg-red-700',
    slate: 'bg-slate-700 hover:bg-slate-600',
  };
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-lg text-sm font-medium ${colors[color]}`}>
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-slate-400 text-sm">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-950 rounded-lg p-3">
      <div className="text-slate-500 text-xs">{label}</div>
      <div className="font-medium mt-1">{value}</div>
    </div>
  );
}

function LogList({ logs }: { logs: string[] }) {
  return (
    <div className="max-h-40 overflow-y-auto text-xs text-slate-400 space-y-1 font-mono">
      {logs.map((log, i) => (
        <div key={i}>{log}</div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-400 text-xs">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5"
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-400 text-xs">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
