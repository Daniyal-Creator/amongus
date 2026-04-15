const LOBBY_PREFIX = "code-mafia:lobby:";
const SESSION_PREFIX = "code-mafia:session:";

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getLobbyPlayerId(code: string) {
  return readJson<{ playerId: string }>(`${LOBBY_PREFIX}${code.toUpperCase()}`)?.playerId ?? null;
}

export function setLobbyPlayerId(code: string, playerId: string) {
  writeJson(`${LOBBY_PREFIX}${code.toUpperCase()}`, { playerId });
}

export function getSessionPlayerId(sessionId: string) {
  return (
    readJson<{ playerId: string }>(`${SESSION_PREFIX}${sessionId}`)?.playerId ?? null
  );
}

export function setSessionPlayerId(sessionId: string, playerId: string) {
  writeJson(`${SESSION_PREFIX}${sessionId}`, { playerId });
}
