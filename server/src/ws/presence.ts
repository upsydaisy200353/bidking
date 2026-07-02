/** 队长 WebSocket 在线计数（支持同一队长多标签页） */
const onlineCounts = new Map<string, number>();

export function captainConnected(captainId: string): void {
  onlineCounts.set(captainId, (onlineCounts.get(captainId) ?? 0) + 1);
}

export function captainDisconnected(captainId: string): void {
  const next = (onlineCounts.get(captainId) ?? 1) - 1;
  if (next <= 0) onlineCounts.delete(captainId);
  else onlineCounts.set(captainId, next);
}

export function getOnlineCaptainIds(): string[] {
  return [...onlineCounts.keys()];
}

export function isCaptainOnline(captainId: string): boolean {
  return onlineCounts.has(captainId);
}
