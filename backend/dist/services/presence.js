const cursors = new Map();
export function setCursor(sessionId, state) {
    let bucket = cursors.get(sessionId);
    if (!bucket) {
        bucket = new Map();
        cursors.set(sessionId, bucket);
    }
    bucket.set(state.playerId, { ...state, updatedAt: Date.now() });
}
export function clearCursor(sessionId, playerId) {
    const bucket = cursors.get(sessionId);
    if (!bucket)
        return;
    bucket.delete(playerId);
    if (bucket.size === 0)
        cursors.delete(sessionId);
}
export function getCursors(sessionId) {
    const bucket = cursors.get(sessionId);
    if (!bucket)
        return [];
    // drop stale entries (>30s without update)
    const cutoff = Date.now() - 30_000;
    const fresh = [];
    for (const [pid, c] of bucket) {
        if (c.updatedAt < cutoff)
            bucket.delete(pid);
        else
            fresh.push(c);
    }
    return fresh;
}
