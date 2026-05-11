/**
 * In-memory editor presence (cursor + selection ranges) per session.
 * Lives next to the WebSocket layer so it can be broadcast at high
 * frequency without hitting Postgres. Survives the process lifetime
 * — explicit eviction on disconnect happens in registerSocket.
 */
export type CursorState = {
  playerId: string;
  name: string;
  color: string;
  anchor: number;
  head: number;
  updatedAt: number;
};

const cursors = new Map<string, Map<string, CursorState>>();

export function setCursor(sessionId: string, state: CursorState) {
  let bucket = cursors.get(sessionId);
  if (!bucket) {
    bucket = new Map();
    cursors.set(sessionId, bucket);
  }
  bucket.set(state.playerId, { ...state, updatedAt: Date.now() });
}

export function clearCursor(sessionId: string, playerId: string) {
  const bucket = cursors.get(sessionId);
  if (!bucket) return;
  bucket.delete(playerId);
  if (bucket.size === 0) cursors.delete(sessionId);
}

export function getCursors(sessionId: string): CursorState[] {
  const bucket = cursors.get(sessionId);
  if (!bucket) return [];
  // drop stale entries (>30s without update)
  const cutoff = Date.now() - 30_000;
  const fresh: CursorState[] = [];
  for (const [pid, c] of bucket) {
    if (c.updatedAt < cutoff) bucket.delete(pid);
    else fresh.push(c);
  }
  return fresh;
}
