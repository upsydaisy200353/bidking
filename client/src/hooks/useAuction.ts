import { useCallback, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { AuctionRules, AuctionSnapshot, Grade } from '../types';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

type SocketMode = 'captain' | 'admin' | 'spectator';

async function fetchSnapshot(opts?: {
  captainId?: string;
  admin?: boolean;
}): Promise<AuctionSnapshot> {
  const params = new URLSearchParams();
  if (opts?.captainId) params.set('captainId', opts.captainId);
  if (opts?.admin) params.set('admin', 'true');
  const q = params.toString() ? `?${params}` : '';
  const res = await fetch(`${API}/snapshot${q}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? '加载失败');
  }
  return res.json();
}

export function useAuction(opts?: { captainId?: string; mode?: SocketMode }) {
  const captainId = opts?.captainId;
  const mode = opts?.mode ?? (captainId ? 'captain' : 'spectator');
  const isAdmin = mode === 'admin';

  const [snapshot, setSnapshot] = useState<AuctionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    fetchSnapshot({ captainId, admin: isAdmin })
      .then(setSnapshot)
      .catch((e) => setError(e.message));

    const query: Record<string, string> = {};
    if (isAdmin) query.admin = 'true';
    else if (captainId) query.captainId = captainId;

    const s = io({ query, transports: ['websocket', 'polling'] });
    s.on('auction:update', (data: AuctionSnapshot) => setSnapshot(data));
    s.on('error', (payload: { message: string }) => setError(payload.message));
    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, [captainId, isAdmin]);

  const action = useCallback(async (path: string, body?: object) => {
    setError(null);
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '请求失败');
    setSnapshot(data);
    return data as AuctionSnapshot;
  }, []);

  const patch = useCallback(async (path: string, body: object) => {
    setError(null);
    const res = await fetch(`${API}${path}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '请求失败');
    setSnapshot(data);
    return data as AuctionSnapshot;
  }, []);

  const del = useCallback(async (path: string) => {
    setError(null);
    const res = await fetch(`${API}${path}`, { method: 'DELETE', headers: JSON_HEADERS });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '请求失败');
    setSnapshot(data);
    return data as AuctionSnapshot;
  }, []);

  return {
    snapshot,
    error,
    setError,
    startEvent: () => action('/event/start'),
    pauseEvent: () => action('/event/pause'),
    resumeEvent: () => action('/event/resume'),
    updateEvent: (body: { name?: string; rules?: Partial<AuctionRules> }) =>
      fetch(`${API}/event`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) }).then(
        async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setSnapshot(data);
        },
      ),
    drawNext: () => action('/auction/draw'),
    placeBid: (cid: string, amount: number) => {
      socket?.emit('bid', { captainId: cid, amount });
      return action('/auction/bid', { captainId: cid, amount });
    },
    skipTimer: () => action('/auction/skip-timer'),
    reset: (name?: string) => action('/reset', { name }),
    addPlayer: (body: object) => action('/players', body),
    updatePlayer: (id: string, body: object) => patch(`/players/${id}`, body),
    deletePlayer: (id: string) => del(`/players/${id}`),
    importPlayers: (csv: string) => action('/players/import', { csv }),
    previewS5Roster: async () => {
      setError(null);
      const res = await fetch(`${API}/import/s5-roster/preview`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '预览失败');
      return data as S5Preview;
    },
    importS5Roster: async (body: {
      useBundled?: boolean;
      includeCaptains?: boolean;
      gradeOverrides?: Record<string, Grade>;
    }) => {
      setError(null);
      const res = await fetch(`${API}/import/s5-roster`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ useBundled: true, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '导入失败');
      setSnapshot(data.snapshot);
      return data as S5ImportResponse;
    },
    addCaptain: (body: object) => action('/captains', body),
    updateCaptain: (id: string, body: object) => patch(`/captains/${id}`, body),
    deleteCaptain: (id: string) => del(`/captains/${id}`),
  };
}

export function useCountdown(endsAt?: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}

export interface S5PreviewPlayer {
  id: string;
  name: string;
  position: string;
  grade: Grade;
  protectionPrice: number;
  status: string;
  inferredGrade: Grade;
}

export interface S5Preview {
  source: string;
  playerCount: number;
  captainCount: number;
  players: S5PreviewPlayer[];
  captains: { id: string; name: string; position: string; budget: number }[];
  skippedCaptains: string[];
}

export interface S5ImportResponse {
  importedPlayers: number;
  importedCaptains: number;
  skippedCaptains: string[];
  snapshot: AuctionSnapshot;
}

/** 首页加载队长列表 */
export async function fetchPublicSnapshot(): Promise<AuctionSnapshot> {
  return fetchSnapshot();
}
