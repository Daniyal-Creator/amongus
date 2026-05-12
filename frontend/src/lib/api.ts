import type {
  AiPoisoningResponse,
  AiSabotageSuggestResponse,
  CategoryLeaderboardResponse,
  CursorPresence,
  GameReviewResponse,
  GameSnapshot,
  LeaderboardSnapshot,
  LobbySnapshot,
  SandboxRunResponse,
  SecurityScanReport,
  TournamentEntry,
} from "@/types";
import {
  createMockLobby,
  executeMockSandbox,
  getMockLeaderboard,
  getMockLobby,
  getMockSession,
  joinMockLobby,
  requestMockSabotageSuggestion,
  runMockSecurityScan,
  sendMockSessionMessage,
  startMockLobby,
  subscribeMockLobby,
  subscribeMockSession,
  toggleMockReady,
} from "@/lib/mock-api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";
const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws").replace(/\/api$/, "");
const MOCK_MODE = parseMockMode(process.env.NEXT_PUBLIC_MOCK_MODE ?? process.env.MOCK_MODE);

type ApiErrorPayload = {
  message?: string;
};

export type SessionRealtimeMessage =
  | { type: "chat.send"; message: string }
  | { type: "editor.update"; content: string }
  | { type: "editor.cursor"; anchor: number; head: number }
  | { type: "category.vote"; categorySlug: string }
  | { type: "meeting.start" }
  | { type: "meeting.vote"; targetPlayerId: string }
  | { type: "sabotage.use" };

export type SessionRealtimePush =
  | { type: "session.updated"; payload: GameSnapshot | null }
  | { type: "session.cursors"; payload: CursorPresence[] };

type SubscriptionOptions<T> = {
  onSnapshot: (snapshot: T) => void;
  onError?: () => void;
};

type SessionSubscriptionOptions = SubscriptionOptions<GameSnapshot> & {
  onCursors?: (cursors: CursorPresence[]) => void;
};

export type SessionConnection = {
  close: () => void;
  send: (payload: SessionRealtimeMessage) => void;
};

function parseMockMode(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on", "enable", "enabled"].includes(value.toLowerCase());
}

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
  if (MOCK_MODE) {
    return createMockLobby(payload);
  }

  return request<{ playerId: string; lobby: { code: string } }>("/lobbies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function joinLobby(code: string, payload: { playerName: string }) {
  if (MOCK_MODE) {
    return joinMockLobby(code, payload);
  }

  return request<{ playerId: string }>(`/lobbies/${code}/join`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getLobby(code: string) {
  if (MOCK_MODE) {
    return getMockLobby(code);
  }

  return request<LobbySnapshot>(`/lobbies/${code}`);
}

export function toggleReady(code: string, playerId: string) {
  if (MOCK_MODE) {
    return toggleMockReady(code, playerId);
  }

  return request<LobbySnapshot>(`/lobbies/${code}/players/${playerId}/ready`, {
    method: "POST",
  });
}

export function startLobby(code: string, playerId: string) {
  if (MOCK_MODE) {
    return startMockLobby(code, playerId);
  }

  return request<{ sessionId: string }>(`/lobbies/${code}/start`, {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });
}

export function getSession(sessionId: string, playerId?: string) {
  if (MOCK_MODE) {
    return getMockSession(sessionId, playerId);
  }

  const params = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
  return request<GameSnapshot>(`/sessions/${sessionId}${params}`);
}

export function getLeaderboard() {
  if (MOCK_MODE) {
    return getMockLeaderboard();
  }

  return request<LeaderboardSnapshot>("/leaderboard");
}

export function getCategoryLeaderboard(category: string) {
  return request<CategoryLeaderboardResponse>(`/leaderboard/${encodeURIComponent(category)}`);
}

export function getTournamentLeaderboard() {
  return request<{ entries: TournamentEntry[] }>("/leaderboard/tournament");
}

export function requestSabotageSuggestion(sessionId: string, playerId: string) {
  if (MOCK_MODE) {
    return requestMockSabotageSuggestion(sessionId, playerId);
  }

  return request<AiSabotageSuggestResponse>("/ai/sabotage-suggest", {
    method: "POST",
    body: JSON.stringify({ sessionId, playerId }),
  });
}

export function activateCopilotPoisoning(sessionId: string, playerId: string) {
  return request<AiPoisoningResponse>("/ai/activate-poisoning", {
    method: "POST",
    body: JSON.stringify({ sessionId, playerId }),
  });
}

export function getGameReview(sessionId: string) {
  return request<GameReviewResponse>(`/game/${sessionId}/review`);
}

export function runSecurityScan(sessionId: string, playerId: string) {
  if (MOCK_MODE) {
    return runMockSecurityScan(sessionId, playerId);
  }

  return request<SecurityScanReport>(`/sessions/${sessionId}/security-scan`, {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });
}

export function executeSandbox(sessionId: string, playerId: string, stdin?: string) {
  if (MOCK_MODE) {
    return executeMockSandbox(sessionId, playerId);
  }

  return request<SandboxRunResponse>(`/sessions/${sessionId}/execute`, {
    method: "POST",
    body: JSON.stringify({ playerId, stdin }),
  });
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

export function subscribeLobby(
  code: string,
  options: SubscriptionOptions<LobbySnapshot>,
) {
  if (MOCK_MODE) {
    return subscribeMockLobby(code, options.onSnapshot);
  }

  let websocket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let closed = false;

  const connect = () => {
    websocket = new window.WebSocket(getLobbyWebSocketUrl(code));
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data) as {
        type: "lobby.updated";
        payload: LobbySnapshot | null;
      };

      if (message.type === "lobby.updated" && message.payload) {
        options.onSnapshot(message.payload);
      }
    };
    websocket.onerror = () => {
      options.onError?.();
    };
    websocket.onclose = () => {
      if (!closed) {
        reconnectTimer = window.setTimeout(connect, 1500);
      }
    };
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
    }
    websocket?.close();
  };
}

export function connectSession(
  sessionId: string,
  playerId: string | undefined,
  options: SessionSubscriptionOptions,
): SessionConnection {
  if (MOCK_MODE) {
    const unsubscribe = subscribeMockSession(sessionId, playerId, options.onSnapshot);

    return {
      close: unsubscribe,
      send: (payload) => {
        void sendMockSessionMessage(sessionId, playerId, payload).catch(() => {
          options.onError?.();
        });
      },
    };
  }

  let websocket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let closed = false;

  const connect = () => {
    websocket = new window.WebSocket(getSessionWebSocketUrl(sessionId, playerId));
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data) as SessionRealtimePush;

      if (message.type === "session.updated" && message.payload) {
        options.onSnapshot(message.payload);
      } else if (message.type === "session.cursors") {
        options.onCursors?.(message.payload);
      }
    };
    websocket.onerror = () => {
      options.onError?.();
    };
    websocket.onclose = () => {
      if (!closed) {
        reconnectTimer = window.setTimeout(connect, 1500);
      }
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      websocket?.close();
    },
    send: (payload) => {
      if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
      }

      websocket.send(JSON.stringify(payload));
    },
  };
}
