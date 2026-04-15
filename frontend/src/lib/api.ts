import type { GameSnapshot, LeaderboardSnapshot, LobbySnapshot } from "@/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";
const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws").replace(/\/api$/, "");

type ApiErrorPayload = {
  message?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    throw new Error(payload?.message ?? "Request gagal.");
  }

  return response.json() as Promise<T>;
}

export function createLobby(payload: {
  hostName: string;
  mode: string;
  maxPlayers: number;
}) {
  return request<{ playerId: string; lobby: { code: string } }>("/lobbies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function joinLobby(code: string, payload: { playerName: string }) {
  return request<{ playerId: string }>(`/lobbies/${code}/join`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getLobby(code: string) {
  return request<LobbySnapshot>(`/lobbies/${code}`);
}

export function toggleReady(code: string, playerId: string) {
  return request<LobbySnapshot>(`/lobbies/${code}/players/${playerId}/ready`, {
    method: "POST",
  });
}

export function startLobby(code: string, playerId: string) {
  return request<{ sessionId: string }>(`/lobbies/${code}/start`, {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });
}

export function getSession(sessionId: string, playerId?: string) {
  const params = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
  return request<GameSnapshot>(`/sessions/${sessionId}${params}`);
}

export function getLeaderboard() {
  return request<LeaderboardSnapshot>("/leaderboard");
}

export function getLobbyWebSocketUrl(code: string) {
  return `${WS_BASE_URL}/ws/lobbies/${code.toUpperCase()}`;
}

export function getSessionWebSocketUrl(sessionId: string, playerId?: string) {
  const url = new URL(`${WS_BASE_URL}/ws/sessions/${sessionId}`);
  if (playerId) {
    url.searchParams.set("playerId", playerId);
  }
  return url.toString();
}
