import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublicSnapshot } from '../hooks/useAuction';
import type { AuctionSnapshot } from '../types';
import { setSelectedCaptainId } from '../types';

export default function HomePage() {
  const [snapshot, setSnapshot] = useState<AuctionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicSnapshot()
      .then(setSnapshot)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-8">
        <h1 className="text-3xl font-bold mb-3">白菜杯—竞猜之王</h1>
        <p className="text-slate-400 max-w-2xl leading-relaxed">
          选择身份进入系统：管理员控制赛事流程，队长参与盲拍出价，观众可在大屏观战。
        </p>
      </section>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-2 text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Link
          to="/admin"
          className="block rounded-xl border border-slate-800 bg-slate-900 p-6 hover:border-amber-500/50 transition"
        >
          <h2 className="text-lg font-semibold text-amber-400 mb-2">管理端</h2>
          <p className="text-sm text-slate-400">开始赛事、抽选选手、导入名单、监控全场</p>
          <p className="text-xs text-slate-500 mt-3">点击进入，无需 Token</p>
        </Link>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-emerald-400 mb-2">队长端</h2>
          <p className="text-sm text-slate-400 mb-4">选择你的队长身份进入竞拍大厅</p>
          {!snapshot ? (
            <p className="text-sm text-slate-500">加载队长列表…</p>
          ) : snapshot.captains.length === 0 ? (
            <p className="text-sm text-slate-500">暂无队长，请先在管理端添加或导入</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {snapshot.captains.map((c) => (
                <Link
                  key={c.id}
                  to={`/captain/${c.id}`}
                  onClick={() => setSelectedCaptainId(c.id)}
                  className="px-3 py-2 rounded-lg bg-slate-800 text-sm hover:bg-emerald-900/50 hover:border-emerald-700 border border-transparent transition"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-slate-400 ml-2">{c.position}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <Link
        to="/spectator"
        className="block rounded-xl border border-slate-800 bg-slate-900 p-6 hover:border-blue-500/40 transition text-center"
      >
        <h2 className="text-lg font-semibold text-blue-400 mb-1">观战大屏</h2>
        <p className="text-sm text-slate-400">全场公开信息，适合投影展示</p>
      </Link>
    </div>
  );
}
