import { Link, Route, Routes } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import CaptainPage from './pages/CaptainPage';
import HomePage from './pages/HomePage';
import SpectatorPage from './pages/SpectatorPage';
import { getSelectedCaptainId } from './types';

export default function App() {
  const lastCaptainId = getSelectedCaptainId();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-amber-400">
            白菜杯—竞猜之王
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/admin" className="text-slate-300 hover:text-white">
              管理端
            </Link>
            <Link
              to={lastCaptainId ? `/captain/${lastCaptainId}` : '/'}
              className="text-slate-300 hover:text-white"
            >
              队长端
            </Link>
            <Link to="/spectator" className="text-slate-300 hover:text-white">
              观战大屏
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/spectator" element={<SpectatorPage />} />
          <Route path="/captain/:captainId" element={<CaptainPage />} />
        </Routes>
      </main>
    </div>
  );
}
