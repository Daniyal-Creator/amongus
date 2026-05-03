import { randomInt } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { createId, initDatabase, inTransaction, pool, query } from "./db.js";

/* ────────────── Constants ────────────── */

const COLOR_PALETTE = ["#14f59b", "#ffd95a", "#6da8ff", "#ff688b", "#ff9f43"] as const;
const PLAYER_TITLES = [
  "Host / Frontend Fixer",
  "Debugger",
  "Bug Hunter",
  "Quiet Contributor",
  "Night Reviewer",
] as const;

const ROUND_DURATION_SECONDS = 120;
const CHAT_RATE_LIMIT_WINDOW_MS = 10_000;
const CHAT_RATE_LIMIT_MAX = 10;

/* ────────────── Sabotage mutations ────────────── */

const SABOTAGE_MUTATIONS: Array<{
  name: string;
  description: string;
  apply: (code: string) => string;
}> = [
  {
    name: "strict_to_loose",
    description: "Changed === to == (strict → loose equality)",
    apply: (code) => code.replace(/===/, "=="),
  },
  {
    name: "loose_to_strict",
    description: "Changed == to === (loose → strict equality)",
    apply: (code) => code.replace(/([^!=<>])={2}([^=])/, "$1===$2"),
  },
  {
    name: "less_to_leq",
    description: "Changed < to <= (off-by-one in loop)",
    apply: (code) => {
      const match = code.match(/(\w+)\s*<\s*(\w+)\.(length|size|count)/);
      if (match) {
        return code.replace(match[0], match[0].replace("<", "<="));
      }
      return code.replace(/([^<])< /, "$1<= ");
    },
  },
  {
    name: "greater_to_geq",
    description: "Changed > to >= (boundary condition shift)",
    apply: (code) => {
      const match = code.match(/([^>])> /);
      if (match) {
        return code.replace(match[0], match[0].replace("> ", ">= "));
      }
      return code;
    },
  },
  {
    name: "plus_to_minus",
    description: "Changed += to -= (accumulator direction reversed)",
    apply: (code) => {
      const lines = code.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes("+=") && !lines[i].includes("self.length") && !lines[i].includes("size")) {
          lines[i] = lines[i].replace("+=", "-=");
          break;
        }
      }
      return lines.join("\n");
    },
  },
  {
    name: "swap_return",
    description: "Changed return value to return None/null",
    apply: (code) => {
      const lines = code.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        if (/return\s+\w/.test(lines[i]) && !lines[i].includes("return None") && !lines[i].includes("return null") && !lines[i].includes("return False")) {
          if (code.includes("def ")) {
            lines[i] = lines[i].replace(/return\s+.+/, "return None");
          } else {
            lines[i] = lines[i].replace(/return\s+.+/, "return null;");
          }
          break;
        }
      }
      return lines.join("\n");
    },
  },
  {
    name: "swap_increment",
    description: "Changed i++ to i-- (loop direction reversed)",
    apply: (code) => {
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("++") && lines[i].includes("i") && !lines[i].includes("//")) {
          lines[i] = lines[i].replace("++", "--");
          break;
        }
      }
      return lines.join("\n");
    },
  },
  {
    name: "comment_out_line",
    description: "Commented out a critical line",
    apply: (code) => {
      const lines = code.split("\n");
      const candidates = lines
        .map((line, index) => ({ line: line.trim(), index }))
        .filter((item) =>
          item.line.length > 5 &&
          !item.line.startsWith("//") &&
          !item.line.startsWith("#") &&
          !item.line.startsWith("class ") &&
          !item.line.startsWith("def ") &&
          !item.line.startsWith("function ") &&
          !item.line.startsWith("export ") &&
          !item.line.startsWith("{") &&
          !item.line.startsWith("}") &&
          (item.line.includes("return") || item.line.includes("self.") || item.line.includes("result") || item.line.includes("push")),
        );
      if (candidates.length > 0) {
        const target = candidates[randomInt(0, candidates.length)];
        const prefix = code.includes("def ") ? "# " : "// ";
        const indent = lines[target.index].match(/^(\s*)/)?.[1] ?? "";
        lines[target.index] = `${indent}${prefix}${lines[target.index].trim()}`;
      }
      return lines.join("\n");
    },
  },
];

function applySabotage(code: string): { mutatedCode: string; mutation: (typeof SABOTAGE_MUTATIONS)[number] } {
  const shuffled = [...SABOTAGE_MUTATIONS].sort(() => Math.random() - 0.5);

  for (const mutation of shuffled) {
    const result = mutation.apply(code);
    if (result !== code) {
      return { mutatedCode: result, mutation };
    }
  }

  return { mutatedCode: code, mutation: shuffled[0] };
}

/* ────────────── Chat rate limiter ────────────── */

const chatRateMap = new Map<string, number[]>();

function checkChatRateLimit(playerId: string): boolean {
  const now = Date.now();
  const timestamps = chatRateMap.get(playerId) ?? [];
  const recent = timestamps.filter((t) => now - t < CHAT_RATE_LIMIT_WINDOW_MS);

  if (recent.length >= CHAT_RATE_LIMIT_MAX) {
    return false;
  }

  recent.push(now);
  chatRateMap.set(playerId, recent);
  return true;
}

/* ────────────── Types ────────────── */

type CategoryRow = {
  slug: string;
  name: string;
  description: string;
  round_estimate: string;
};

type PlayerRow = {
  id: string;
  name: string;
  title: string;
  color: string;
  is_ready: boolean;
  is_host: boolean;
};

type ChallengeRow = {
  id: string;
  title: string;
  description: string;
  language: string;
  difficulty: string;
  round_number: number;
  tests: unknown[];
  objectives: unknown[];
  imposter_objectives: unknown[];
  chat_messages: unknown[];
  imposter_feed: unknown[];
  editor_lines: unknown[];
};

type ChatRow = {
  user_name: string;
  color: string;
  message: string;
  created_at: Date;
};

type CategoryVoteRow = {
  player_id: string;
  category_slug: string;
};

type MeetingVoteRow = {
  voter_player_id: string;
  target_player_id: string;
};

/* ────────────── Server setup ────────────── */

const app = Fastify({
  logger: true,
});

type RealtimeSocket = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  on: (event: "close" | "message", listener: (payload?: Buffer) => void) => void;
  OPEN: number;
  playerId?: string;
};

const lobbySubscribers = new Map<string, Set<RealtimeSocket>>();
const sessionSubscribers = new Map<string, Set<RealtimeSocket>>();
let sessionTickInterval: NodeJS.Timeout | null = null;

/* ────────────── Helpers ────────────── */

function createCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]).join("");
}

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function editorLinesToContent(lines: unknown[]) {
  return lines
    .map((line) => {
      const item = line as { content?: string };
      return item.content ?? "";
    })
    .join("\n");
}

function contentToEditorLines(content: string) {
  return content.split("\n").map((line, index) => ({
    number: index + 1,
    content: line,
  }));
}

function normalizePlayer(player: PlayerRow) {
  return {
    id: player.id,
    name: player.name,
    title: player.title,
    color: player.color,
    isReady: player.is_ready,
    isHost: player.is_host,
  };
}

/* ────────────── Data access ────────────── */

async function getCategories() {
  const result = await query<CategoryRow>(
    `
      SELECT slug, name, description, round_estimate
      FROM categories
      ORDER BY name
    `,
  );

  return result.rows.map((category) => ({
    slug: category.slug,
    name: category.name,
    description: category.description,
    votes: 0,
    roundEstimate: category.round_estimate,
  }));
}

async function getLobbyByCode(code: string) {
  const lobbyResult = await query<{
    id: string;
    code: string;
    mode: string;
    max_players: number;
    status: string;
    host_player_id: string;
  }>(
    `
      SELECT id, code, mode, max_players, status, host_player_id
      FROM lobbies
      WHERE code = $1
    `,
    [code.toUpperCase()],
  );

  const lobby = lobbyResult.rows[0];
  if (!lobby) {
    return null;
  }

  const playersResult = await query<PlayerRow>(
    `
      SELECT id, name, title, color, is_ready, is_host
      FROM lobby_players
      WHERE lobby_id = $1
      ORDER BY created_at ASC
    `,
    [lobby.id],
  );

  return {
    id: lobby.id,
    code: lobby.code,
    mode: lobby.mode,
    maxPlayers: lobby.max_players,
    status: lobby.status,
    hostPlayerId: lobby.host_player_id,
    players: playersResult.rows.map(normalizePlayer),
  };
}

async function getLobbySnapshot(code: string) {
  const lobby = await getLobbyByCode(code);
  if (!lobby) {
    return null;
  }

  const categories = await getCategories();
  const activeSessionId =
    lobby.status === "in_game"
      ? (
          await query<{ id: string }>(
            `
              SELECT id
              FROM sessions
              WHERE lobby_id = $1
            `,
            [lobby.id],
          )
        ).rows[0]?.id ?? null
      : null;

  return {
    host: lobby.players.find((player) => player.isHost)?.name ?? "-",
    status: lobby.status,
    maxPlayers: lobby.maxPlayers,
    players: lobby.players,
    categories,
    activeSessionId,
  };
}

async function getSessionSnapshot(sessionId: string, playerId?: string) {
  const sessionResult = await query<{
    id: string;
    challenge_id: string;
    category_slug: string;
    phase: "category" | "playing" | "meeting" | "game_over";
    round: number;
    max_rounds: number;
    sabotage_charges: number;
    time_remaining_seconds: number;
    editor_content: string;
    meeting_started_by: string | null;
    meeting_snippet: string;
    winner_team: "civilian" | "imposter" | null;
    end_reason: string | null;
  }>(
    `
      SELECT
        id, challenge_id, category_slug, phase, round, max_rounds,
        sabotage_charges, time_remaining_seconds, editor_content,
        meeting_started_by, meeting_snippet, winner_team, end_reason
      FROM sessions
      WHERE id = $1
    `,
    [sessionId],
  );

  const session = sessionResult.rows[0];
  if (!session) {
    return null;
  }

  const [playersResult, categories, challengeResult, chatMessagesResult, categoryVotesResult, meetingVotesResult] = await Promise.all([
    query<{
      id: string;
      name: string;
      color: string;
      role: "civilian" | "imposter";
      status: string;
    }>(
      `
        SELECT lp.id, lp.name, lp.color, sp.role, sp.status
        FROM session_players sp
        JOIN lobby_players lp ON lp.id = sp.player_id
        WHERE sp.session_id = $1
        ORDER BY lp.created_at ASC
      `,
      [session.id],
    ),
    getCategories(),
    query<ChallengeRow>(
      `
        SELECT id, title, description, language, difficulty, round_number,
               tests, objectives, imposter_objectives, chat_messages,
               imposter_feed, editor_lines
        FROM challenges
        WHERE id = $1
      `,
      [session.challenge_id],
    ),
    query<ChatRow>(
      `
        SELECT user_name, color, message, created_at
        FROM session_chat_messages
        WHERE session_id = $1
        ORDER BY created_at ASC
      `,
      [session.id],
    ),
    query<CategoryVoteRow>(
      `
        SELECT player_id, category_slug
        FROM session_category_votes
        WHERE session_id = $1
      `,
      [session.id],
    ),
    query<MeetingVoteRow>(
      `
        SELECT voter_player_id, target_player_id
        FROM session_meeting_votes
        WHERE session_id = $1
      `,
      [session.id],
    ),
  ]);

  const challenge = challengeResult.rows[0];
  const players = playersResult.rows;
  const currentPlayer = players.find((player) => player.id === playerId) ?? players[0];
  const isCivilian = currentPlayer?.role !== "imposter";
  const categoryVotes = categoryVotesResult.rows;
  const meetingVotes = meetingVotesResult.rows;
  const categoryVoteCount = new Map<string, number>();
  const meetingVoteCount = new Map<string, number>();

  for (const vote of categoryVotes) {
    categoryVoteCount.set(
      vote.category_slug,
      (categoryVoteCount.get(vote.category_slug) ?? 0) + 1,
    );
  }

  for (const vote of meetingVotes) {
    meetingVoteCount.set(
      vote.target_player_id,
      (meetingVoteCount.get(vote.target_player_id) ?? 0) + 1,
    );
  }

  return {
    phase: session.phase,
    round: session.round,
    maxRounds: session.max_rounds,
    category:
      categories.find((category) => category.slug === session.category_slug)?.name ?? "Unknown",
    timeRemaining: `${session.time_remaining_seconds}s`,
    sabotageCharges: session.sabotage_charges,
    currentUser: {
      id: currentPlayer?.id ?? "",
      role: currentPlayer?.role ?? "civilian",
      roleDescription: isCivilian
        ? "Fix the bugs, clear the tests, and identify the impostor before round 4 ends."
        : "Blend in, inject subtle bugs, poison hints, and keep your sabotage hidden.",
    },
    challenge: {
      title: challenge.title,
      description: challenge.description,
      language: challenge.language,
      difficulty: challenge.difficulty,
      tests: challenge.tests,
    },
    categoryVoteOptions: categories.map((category) => ({
      ...category,
      votes: categoryVoteCount.get(category.slug) ?? 0,
    })),
    players: players.map((player) => ({
      ...player,
      meetingVotes: meetingVoteCount.get(player.id) ?? 0,
    })),
    objectives: challenge.objectives,
    imposterObjectives: challenge.imposter_objectives,
    chatMessages: chatMessagesResult.rows.map((message) => ({
      user: message.user_name,
      color: message.color,
      timestamp: formatTimestamp(message.created_at),
      message: message.message,
    })),
    imposterFeed: challenge.imposter_feed,
    editorContent: session.editor_content,
    editorLines: contentToEditorLines(session.editor_content),
    currentCategoryVote:
      categoryVotes.find((vote) => vote.player_id === currentPlayer?.id)?.category_slug ?? null,
    meeting: {
      startedBy:
        players.find((player) => player.id === session.meeting_started_by)?.name ?? null,
      snippet: session.meeting_snippet,
      currentVoteTargetId:
        meetingVotes.find((vote) => vote.voter_player_id === currentPlayer?.id)?.target_player_id ??
        null,
    },
    result: {
      winnerTeam: session.winner_team,
      reason: session.end_reason,
    },
  };
}

async function getSessionPlayerIdentity(sessionId: string, playerId?: string) {
  if (!playerId) {
    return null;
  }

  const result = await query<{
    player_id: string;
    user_name: string;
    color: string;
  }>(
    `
      SELECT lp.id AS player_id, lp.name AS user_name, lp.color
      FROM session_players sp
      JOIN lobby_players lp ON lp.id = sp.player_id
      WHERE sp.session_id = $1 AND sp.player_id = $2
    `,
    [sessionId, playerId],
  );

  return result.rows[0] ?? null;
}

async function resolveChallengeForCategory(categorySlug: string, roundNumber: number) {
  const result = await query<ChallengeRow>(
    `
      SELECT id, title, description, language, difficulty, round_number,
             tests, objectives, imposter_objectives, chat_messages,
             imposter_feed, editor_lines
      FROM challenges
      WHERE category_slug = $1 AND round_number = $2
      LIMIT 1
    `,
    [categorySlug, roundNumber],
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  // Fallback: get any challenge for this category
  const fallback = await query<ChallengeRow>(
    `
      SELECT id, title, description, language, difficulty, round_number,
             tests, objectives, imposter_objectives, chat_messages,
             imposter_feed, editor_lines
      FROM challenges
      WHERE category_slug = $1
      ORDER BY round_number ASC
      LIMIT 1
    `,
    [categorySlug],
  );

  return fallback.rows[0] ?? null;
}

/* ────────────── Realtime ────────────── */

function registerSocket(
  collection: Map<string, Set<RealtimeSocket>>,
  key: string,
  socket: RealtimeSocket,
) {
  const current = collection.get(key) ?? new Set<RealtimeSocket>();
  current.add(socket);
  collection.set(key, current);

  socket.on("close", () => {
    const next = collection.get(key);
    if (!next) {
      return;
    }

    next.delete(socket);
    if (next.size === 0) {
      collection.delete(key);
    }
  });
}

function broadcast<T>(collection: Map<string, Set<RealtimeSocket>>, key: string, payload: T) {
  const sockets = collection.get(key);
  if (!sockets) {
    return;
  }

  const message = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  }
}

async function publishLobby(code: string) {
  const snapshot = await getLobbySnapshot(code);
  if (!snapshot) {
    return;
  }

  broadcast(lobbySubscribers, code.toUpperCase(), {
    type: "lobby.updated",
    payload: snapshot,
  });
}

async function publishSession(sessionId: string) {
  const subscribers = sessionSubscribers.get(sessionId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  for (const socket of subscribers) {
    if (socket.readyState !== socket.OPEN) {
      continue;
    }

    const playerId = socket.playerId;
    const snapshot = await getSessionSnapshot(sessionId, playerId);
    if (!snapshot) {
      continue;
    }

    socket.send(
      JSON.stringify({
        type: "session.updated",
        payload: snapshot,
      }),
    );
  }
}

async function appendSystemMessage(sessionId: string, message: string) {
  await query(
    `
      INSERT INTO session_chat_messages (id, session_id, player_id, user_name, color, message)
      VALUES ($1, $2, NULL, 'system', '#f0a92e', $3)
    `,
    [createId(), sessionId, message],
  );
}

/* ────────────── Game logic ────────────── */

async function finishGame(
  sessionId: string,
  winnerTeam: "civilian" | "imposter",
  reason: string,
) {
  const lobbyResult = await query<{ code: string; lobby_id: string }>(
    `
      SELECT l.code, s.lobby_id
      FROM sessions s
      JOIN lobbies l ON l.id = s.lobby_id
      WHERE s.id = $1
    `,
    [sessionId],
  );

  await query(
    `
      UPDATE sessions
      SET phase = 'game_over',
          winner_team = $2,
          end_reason = $3,
          ended_at = NOW(),
          meeting_started_by = NULL,
          meeting_snippet = ''
      WHERE id = $1
    `,
    [sessionId, winnerTeam, reason],
  );
  await query(`DELETE FROM session_meeting_votes WHERE session_id = $1`, [sessionId]);
  await appendSystemMessage(sessionId, reason);

  const lobby = lobbyResult.rows[0];
  if (lobby) {
    await query(`UPDATE lobbies SET status = 'finished' WHERE id = $1`, [lobby.lobby_id]);
    await publishLobby(lobby.code);
  }

  await publishSession(sessionId);
}

async function advanceToNextRound(sessionId: string) {
  const sessionResult = await query<{
    round: number;
    max_rounds: number;
    lobby_id: string;
    category_slug: string;
  }>(
    `
      SELECT round, max_rounds, lobby_id, category_slug
      FROM sessions
      WHERE id = $1
    `,
    [sessionId],
  );
  const session = sessionResult.rows[0];
  if (!session) {
    return;
  }

  if (session.round >= session.max_rounds) {
    await finishGame(
      sessionId,
      "civilian",
      "Civilian survived until the final round and secured the win.",
    );
    return;
  }

  const nextRound = session.round + 1;

  await query(
    `
      UPDATE sessions
      SET phase = 'category',
          round = $2,
          time_remaining_seconds = $3,
          meeting_started_by = NULL,
          meeting_snippet = ''
      WHERE id = $1
    `,
    [sessionId, nextRound, ROUND_DURATION_SECONDS],
  );
  await query(`DELETE FROM session_category_votes WHERE session_id = $1`, [sessionId]);
  await query(`DELETE FROM session_meeting_votes WHERE session_id = $1`, [sessionId]);
  await appendSystemMessage(
    sessionId,
    `Round ${nextRound} is starting. Vote the next category.`,
  );
  await publishSession(sessionId);
}

async function tickPlayingSessions() {
  const sessionsResult = await query<{
    id: string;
    time_remaining_seconds: number;
  }>(
    `
      SELECT id, time_remaining_seconds
      FROM sessions
      WHERE phase = 'playing'
    `,
  );

  for (const session of sessionsResult.rows) {
    const nextTime = Math.max(0, session.time_remaining_seconds - 1);
    await query(
      `
        UPDATE sessions
        SET time_remaining_seconds = $2
        WHERE id = $1
      `,
      [session.id, nextTime],
    );

    if (nextTime === 0) {
      await advanceToNextRound(session.id);
      continue;
    }

    await publishSession(session.id);
  }
}

/* ────────────── App ────────────── */

await app.register(cors, {
  origin: config.corsOrigin,
});
await app.register(websocket);

app.get("/health", async () => ({ ok: true }));

app.get("/api/categories", async () => {
  return getCategories();
});

/* ────────── WebSocket: Lobby ────────── */

app.get<{
  Params: { code: string };
}>(
  "/ws/lobbies/:code",
  { websocket: true },
  async (socket, request) => {
    const code = request.params.code.toUpperCase();
    registerSocket(lobbySubscribers, code, socket as RealtimeSocket);

    const snapshot = await getLobbySnapshot(code);
    socket.send(
      JSON.stringify({
        type: "lobby.updated",
        payload: snapshot,
      }),
    );
  },
);

/* ────────── WebSocket: Game Session ────────── */

app.get<{
  Params: { sessionId: string };
  Querystring: { playerId?: string };
}>(
  "/ws/sessions/:sessionId",
  { websocket: true },
  async (socket, request) => {
    const sessionId = request.params.sessionId;
    const realtimeSocket = socket as RealtimeSocket;
    realtimeSocket.playerId = request.query.playerId;
    registerSocket(sessionSubscribers, sessionId, realtimeSocket);

    realtimeSocket.on("message", async (payload) => {
      try {
        const data = JSON.parse(payload?.toString() ?? "") as
          | { type: "chat.send"; message: string }
          | { type: "editor.update"; content: string }
          | { type: "category.vote"; categorySlug: string }
          | { type: "meeting.start" }
          | { type: "meeting.vote"; targetPlayerId: string }
          | { type: "sabotage.use" };

        const identity = await getSessionPlayerIdentity(sessionId, realtimeSocket.playerId);
        if (!identity) {
          return;
        }

        const sessionMetaResult = await query<{
          phase: "category" | "playing" | "meeting" | "game_over";
          sabotage_charges: number;
          round: number;
          category_slug: string;
        }>(
          `
            SELECT phase, sabotage_charges, round, category_slug
            FROM sessions
            WHERE id = $1
          `,
          [sessionId],
        );
        const sessionMeta = sessionMetaResult.rows[0];
        if (!sessionMeta || sessionMeta.phase === "game_over") {
          return;
        }

        const playerRoleResult = await query<{ role: "civilian" | "imposter" }>(
          `
            SELECT role
            FROM session_players
            WHERE session_id = $1 AND player_id = $2
          `,
          [sessionId, identity.player_id],
        );
        const playerRole = playerRoleResult.rows[0]?.role;
        if (!playerRole) {
          return;
        }

        /* ── Chat ── */
        if (data.type === "chat.send") {
          const nextMessage = data.message.trim();
          if (!nextMessage) {
            return;
          }

          if (!checkChatRateLimit(identity.player_id)) {
            return;
          }

          await query(
            `
              INSERT INTO session_chat_messages (id, session_id, player_id, user_name, color, message)
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              createId(),
              sessionId,
              identity.player_id,
              identity.user_name,
              identity.color,
              nextMessage,
            ],
          );

          await query(
            `
              UPDATE session_players
              SET status = 'chatting in discussion'
              WHERE session_id = $1 AND player_id = $2
            `,
            [sessionId, identity.player_id],
          );
        }

        /* ── Editor ── */
        if (data.type === "editor.update") {
          if (sessionMeta.phase !== "playing") {
            return;
          }

          await query(
            `
              UPDATE sessions
              SET editor_content = $2
              WHERE id = $1
            `,
            [sessionId, data.content.slice(0, 12000)],
          );

          await query(
            `
              UPDATE session_players
              SET status = 'editing live code'
              WHERE session_id = $1 AND player_id = $2
            `,
            [sessionId, identity.player_id],
          );
        }

        /* ── Category vote ── */
        if (data.type === "category.vote") {
          if (sessionMeta.phase !== "category") {
            return;
          }

          await query(
            `
              INSERT INTO session_category_votes (session_id, player_id, category_slug)
              VALUES ($1, $2, $3)
              ON CONFLICT (session_id, player_id)
              DO UPDATE SET category_slug = EXCLUDED.category_slug
            `,
            [sessionId, identity.player_id, data.categorySlug],
          );

          const [votesResult, playersResult] = await Promise.all([
            query<{ category_slug: string }>(
              `
                SELECT category_slug
                FROM session_category_votes
                WHERE session_id = $1
              `,
              [sessionId],
            ),
            query<{ count: string }>(
              `
                SELECT COUNT(*)::text AS count
                FROM session_players
                WHERE session_id = $1 AND status != 'ejected after meeting'
              `,
              [sessionId],
            ),
          ]);

          const totalPlayers = Number(playersResult.rows[0]?.count ?? "0");
          if (votesResult.rows.length >= totalPlayers && totalPlayers > 0) {
            const counts = new Map<string, number>();
            for (const vote of votesResult.rows) {
              counts.set(vote.category_slug, (counts.get(vote.category_slug) ?? 0) + 1);
            }

            const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
            const topScore = ranked[0]?.[1] ?? 0;
            const candidates = ranked
              .filter((entry) => entry[1] === topScore)
              .map((entry) => entry[0]);
            const selectedCategorySlug = candidates[randomInt(0, candidates.length)];
            const nextChallenge = await resolveChallengeForCategory(
              selectedCategorySlug,
              sessionMeta.round,
            );

            if (nextChallenge) {
              await query(
                `
                  UPDATE sessions
                  SET category_slug = $2,
                      challenge_id = $3,
                      phase = 'playing',
                      editor_content = $4,
                      time_remaining_seconds = $5
                  WHERE id = $1
                `,
                [
                  sessionId,
                  selectedCategorySlug,
                  nextChallenge.id,
                  editorLinesToContent(nextChallenge.editor_lines),
                  ROUND_DURATION_SECONDS,
                ],
              );

              await appendSystemMessage(
                sessionId,
                `Category locked: ${selectedCategorySlug.toUpperCase()}. Round ${sessionMeta.round} started.`,
              );
            }
          }
        }

        /* ── Emergency meeting ── */
        if (data.type === "meeting.start") {
          if (sessionMeta.phase !== "playing") {
            return;
          }

          const currentSession = await query<{ editor_content: string }>(
            `
              SELECT editor_content
              FROM sessions
              WHERE id = $1
            `,
            [sessionId],
          );

          await query(
            `
              UPDATE sessions
              SET phase = 'meeting',
                  meeting_started_by = $2,
                  meeting_snippet = $3
              WHERE id = $1
            `,
            [sessionId, identity.player_id, currentSession.rows[0]?.editor_content ?? ""],
          );
          await query(`DELETE FROM session_meeting_votes WHERE session_id = $1`, [sessionId]);
          await appendSystemMessage(sessionId, `⚠️ ${identity.user_name} called an emergency meeting!`);
        }

        /* ── Meeting vote ── */
        if (data.type === "meeting.vote") {
          if (sessionMeta.phase !== "meeting") {
            return;
          }

          await query(
            `
              INSERT INTO session_meeting_votes (session_id, voter_player_id, target_player_id)
              VALUES ($1, $2, $3)
              ON CONFLICT (session_id, voter_player_id)
              DO UPDATE SET target_player_id = EXCLUDED.target_player_id
            `,
            [sessionId, identity.player_id, data.targetPlayerId],
          );

          const [meetingVotes, playerCountResult, playerNames] = await Promise.all([
            query<MeetingVoteRow>(
              `
                SELECT voter_player_id, target_player_id
                FROM session_meeting_votes
                WHERE session_id = $1
              `,
              [sessionId],
            ),
            query<{ count: string }>(
              `
                SELECT COUNT(*)::text AS count
                FROM session_players
                WHERE session_id = $1 AND status != 'ejected after meeting'
              `,
              [sessionId],
            ),
            query<{ id: string; name: string }>(
              `
                SELECT id, name
                FROM lobby_players
                WHERE id IN (
                  SELECT player_id
                  FROM session_players
                  WHERE session_id = $1
                )
              `,
              [sessionId],
            ),
          ]);

          const totalPlayers = Number(playerCountResult.rows[0]?.count ?? "0");
          if (meetingVotes.rows.length >= totalPlayers && totalPlayers > 0) {
            const counts = new Map<string, number>();
            for (const vote of meetingVotes.rows) {
              counts.set(
                vote.target_player_id,
                (counts.get(vote.target_player_id) ?? 0) + 1,
              );
            }

            const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
            const winnerId = ranked[0]?.[0] ?? null;
            const ejectedName =
              playerNames.rows.find((player) => player.id === winnerId)?.name ?? "unknown";
            const ejectedRole =
              winnerId
                ? (
                    await query<{ role: "civilian" | "imposter" }>(
                      `
                        SELECT role
                        FROM session_players
                        WHERE session_id = $1 AND player_id = $2
                      `,
                      [sessionId, winnerId],
                    )
                  ).rows[0]?.role ?? null
                : null;

            if (winnerId) {
              await query(
                `
                  UPDATE session_players
                  SET status = 'ejected after meeting'
                  WHERE session_id = $1 AND player_id = $2
                `,
                [sessionId, winnerId],
              );
            }

            await query(
              `
                UPDATE sessions
                SET phase = 'playing',
                    meeting_started_by = NULL,
                    meeting_snippet = ''
                WHERE id = $1
              `,
              [sessionId],
            );
            await query(`DELETE FROM session_meeting_votes WHERE session_id = $1`, [sessionId]);
            await appendSystemMessage(sessionId, `🗳️ ${ejectedName} received the most votes and was ejected.`);

            if (ejectedRole === "imposter") {
              await finishGame(
                sessionId,
                "civilian",
                `${ejectedName} was the impostor! Civilian team wins. 🎉`,
              );
              return;
            }

            // Check if all civilians are ejected (imposter wins)
            const remainingCivilians = await query<{ count: string }>(
              `
                SELECT COUNT(*)::text AS count
                FROM session_players
                WHERE session_id = $1
                  AND role = 'civilian'
                  AND status != 'ejected after meeting'
              `,
              [sessionId],
            );

            if (Number(remainingCivilians.rows[0]?.count ?? "0") <= 1) {
              await finishGame(
                sessionId,
                "imposter",
                "Too many civilians were ejected. Imposter wins! 🔪",
              );
              return;
            }
          }
        }

        /* ── Sabotage ── */
        if (data.type === "sabotage.use") {
          if (sessionMeta.phase !== "playing" || playerRole !== "imposter") {
            return;
          }

          if (sessionMeta.sabotage_charges <= 0) {
            return;
          }

          // Get current editor content and apply sabotage mutation
          const editorResult = await query<{ editor_content: string }>(
            `SELECT editor_content FROM sessions WHERE id = $1`,
            [sessionId],
          );
          const currentContent = editorResult.rows[0]?.editor_content ?? "";
          const { mutatedCode, mutation } = applySabotage(currentContent);

          await query(
            `
              UPDATE sessions
              SET sabotage_charges = sabotage_charges - 1,
                  editor_content = $2
              WHERE id = $1
            `,
            [sessionId, mutatedCode],
          );
          await query(
            `
              UPDATE session_players
              SET status = 'used sabotage charge'
              WHERE session_id = $1 AND player_id = $2
            `,
            [sessionId, identity.player_id],
          );
          await appendSystemMessage(
            sessionId,
            `⚡ A sabotage wave just hit the code. Something changed...`,
          );

          // Log to imposter's feed via a chat message only they'll see
          app.log.info({ sessionId, mutation: mutation.name, description: mutation.description }, "Sabotage applied");

          const remainingCharges = sessionMeta.sabotage_charges - 1;
          if (remainingCharges <= 0) {
            await finishGame(
              sessionId,
              "imposter",
              "Imposter exhausted all sabotage charges before civilians could stop them. 🔪",
            );
            return;
          }
        }

        await publishSession(sessionId);
      } catch (error) {
        app.log.warn({ error }, "Failed to process session websocket message");
      }
    });

    const snapshot = await getSessionSnapshot(sessionId, request.query.playerId);
    socket.send(
      JSON.stringify({
        type: "session.updated",
        payload: snapshot,
      }),
    );
  },
);

/* ────────── REST: Leaderboard ────────── */

app.get("/api/leaderboard", async () => {
  const [leaderboardResult, hallOfFameResult] = await Promise.all([
    query<{
      username: string;
      category: string;
      score: number;
      record: string;
    }>(
      `
        SELECT username, category, score, record
        FROM leaderboard_entries
        ORDER BY sort_order ASC
      `,
    ),
    query<{
      title: string;
      player: string;
      description: string;
      tone: "accent" | "danger" | "success" | "warning";
    }>(
      `
        SELECT title, player, description, tone
        FROM hall_of_fame_entries
        ORDER BY sort_order ASC
      `,
    ),
  ]);

  return {
    leaderboardEntries: leaderboardResult.rows,
    hallOfFame: hallOfFameResult.rows,
  };
});

/* ────────── REST: Create Lobby ────────── */

app.post<{
  Body: {
    hostName: string;
    mode?: string;
    maxPlayers?: number;
  };
}>(
  "/api/lobbies",
  {
    schema: {
      body: {
        type: "object",
        required: ["hostName"],
        properties: {
          hostName: { type: "string", minLength: 2, maxLength: 24 },
          mode: { type: "string" },
          maxPlayers: { type: "integer", minimum: 4, maximum: 5 },
        },
      },
    },
  },
  async (request, reply) => {
    const lobbyId = createId();
    const playerId = createId();
    const code = createCode();
    const mode = request.body.mode ?? "standard";
    const maxPlayers = request.body.maxPlayers ?? 4;

    await inTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO lobbies (id, code, mode, max_players, status, host_player_id)
          VALUES ($1, $2, $3, $4, 'waiting', $5)
        `,
        [lobbyId, code, mode, maxPlayers, playerId],
      );

      await client.query(
        `
          INSERT INTO lobby_players (id, lobby_id, name, title, color, is_ready, is_host)
          VALUES ($1, $2, $3, $4, $5, true, true)
        `,
        [playerId, lobbyId, request.body.hostName.trim(), PLAYER_TITLES[0], COLOR_PALETTE[0]],
      );
    });

    const lobby = await getLobbyByCode(code);
    await publishLobby(code);
    reply.code(201);
    return {
      playerId,
      lobby,
    };
  },
);

/* ────────── REST: Join Lobby ────────── */

app.post<{
  Params: { code: string };
  Body: { playerName: string };
}>(
  "/api/lobbies/:code/join",
  {
    schema: {
      params: {
        type: "object",
        required: ["code"],
        properties: {
          code: { type: "string", minLength: 6, maxLength: 6 },
        },
      },
      body: {
        type: "object",
        required: ["playerName"],
        properties: {
          playerName: { type: "string", minLength: 2, maxLength: 24 },
        },
      },
    },
  },
  async (request, reply) => {
    const lobby = await getLobbyByCode(request.params.code);
    if (!lobby) {
      reply.code(404);
      return { message: "Lobby tidak ditemukan." };
    }

    if (lobby.status !== "waiting") {
      reply.code(409);
      return { message: "Game sudah dimulai." };
    }

    if (lobby.players.length >= lobby.maxPlayers) {
      reply.code(409);
      return { message: "Lobby sudah penuh." };
    }

    const playerId = createId();
    const paletteIndex = lobby.players.length % COLOR_PALETTE.length;
    const titleIndex = lobby.players.length % PLAYER_TITLES.length;

    await query(
      `
        INSERT INTO lobby_players (id, lobby_id, name, title, color, is_ready, is_host)
        VALUES ($1, $2, $3, $4, $5, false, false)
      `,
      [
        playerId,
        lobby.id,
        request.body.playerName.trim(),
        PLAYER_TITLES[titleIndex],
        COLOR_PALETTE[paletteIndex],
      ],
    );

    await publishLobby(request.params.code);
    reply.code(201);
    return {
      playerId,
    };
  },
);

/* ────────── REST: Get Lobby ────────── */

app.get<{
  Params: { code: string };
}>(
  "/api/lobbies/:code",
  {
    schema: {
      params: {
        type: "object",
        required: ["code"],
        properties: {
          code: { type: "string", minLength: 6, maxLength: 6 },
        },
      },
    },
  },
  async (request, reply) => {
    const snapshot = await getLobbySnapshot(request.params.code);
    if (!snapshot) {
      reply.code(404);
      return { message: "Lobby tidak ditemukan." };
    }
    return snapshot;
  },
);

/* ────────── REST: Toggle Ready ────────── */

app.post<{
  Params: { code: string; playerId: string };
}>(
  "/api/lobbies/:code/players/:playerId/ready",
  {
    schema: {
      params: {
        type: "object",
        required: ["code", "playerId"],
        properties: {
          code: { type: "string", minLength: 6, maxLength: 6 },
          playerId: { type: "string", minLength: 10 },
        },
      },
    },
  },
  async (request, reply) => {
    const lobby = await getLobbyByCode(request.params.code);
    if (!lobby) {
      reply.code(404);
      return { message: "Lobby tidak ditemukan." };
    }

    const player = lobby.players.find((item) => item.id === request.params.playerId);
    if (!player) {
      reply.code(404);
      return { message: "Player tidak ditemukan." };
    }

    if (player.isHost) {
      reply.code(400);
      return { message: "Host tidak bisa toggle ready." };
    }

    await query(
      `
        UPDATE lobby_players
        SET is_ready = NOT is_ready
        WHERE id = $1 AND lobby_id = $2
      `,
      [request.params.playerId, lobby.id],
    );

    await publishLobby(request.params.code);
    return getLobbySnapshot(request.params.code);
  },
);

/* ────────── REST: Start Game ────────── */

app.post<{
  Params: { code: string };
  Body: { playerId: string };
}>(
  "/api/lobbies/:code/start",
  {
    schema: {
      params: {
        type: "object",
        required: ["code"],
        properties: {
          code: { type: "string", minLength: 6, maxLength: 6 },
        },
      },
      body: {
        type: "object",
        required: ["playerId"],
        properties: {
          playerId: { type: "string", minLength: 10 },
        },
      },
    },
  },
  async (request, reply) => {
    const lobby = await getLobbyByCode(request.params.code);
    if (!lobby) {
      reply.code(404);
      return { message: "Lobby tidak ditemukan." };
    }

    if (lobby.hostPlayerId !== request.body.playerId) {
      reply.code(403);
      return { message: "Hanya host yang bisa memulai game." };
    }

    if (lobby.players.length < 1) {
      reply.code(400);
      return { message: "Minimal 1 pemain untuk memulai." };
    }

    const allNonHostReady = lobby.players
      .filter((player) => !player.isHost)
      .every((player) => player.isReady);

    if (!allNonHostReady) {
      reply.code(400);
      return { message: "Semua non-host harus ready." };
    }

    const existingSession = await query<{ id: string }>(
      `
        SELECT id
        FROM sessions
        WHERE lobby_id = $1
      `,
      [lobby.id],
    );

    if (existingSession.rows[0]) {
      await query(`UPDATE lobbies SET status = 'in_game' WHERE id = $1`, [lobby.id]);
      await publishLobby(request.params.code);
      await publishSession(existingSession.rows[0].id);
      return { sessionId: existingSession.rows[0].id };
    }

    const categories = await getCategories();
    const category = categories[randomInt(0, categories.length)];
    const challenge = await resolveChallengeForCategory(category.slug, 1);

    if (!challenge) {
      reply.code(500);
      return { message: "Challenge untuk kategori ini belum tersedia." };
    }

    const sessionId = createId();
    const imposterIndex = randomInt(0, lobby.players.length);
    const initialEditorContent = editorLinesToContent(challenge.editor_lines);

    // Determine max rounds based on available challenges for the category
    const maxRoundsResult = await query<{ max_round: string }>(
      `
        SELECT MAX(round_number)::text AS max_round
        FROM challenges
        WHERE category_slug = $1
      `,
      [category.slug],
    );
    const maxRounds = Math.min(4, Number(maxRoundsResult.rows[0]?.max_round ?? "4"));

    await inTransaction(async (client) => {
      await client.query(`UPDATE lobbies SET status = 'in_game' WHERE id = $1`, [lobby.id]);

      await client.query(
        `
          INSERT INTO sessions (
            id, lobby_id, challenge_id, category_slug, phase,
            round, max_rounds, sabotage_charges, time_remaining_seconds, editor_content
          )
          VALUES ($1, $2, $3, $4, 'category', 1, $5, 5, $6, $7)
        `,
        [sessionId, lobby.id, challenge.id, category.slug, maxRounds, ROUND_DURATION_SECONDS, initialEditorContent],
      );

      for (const [index, player] of lobby.players.entries()) {
        const role = index === imposterIndex ? "imposter" : "civilian";
        const status =
          role === "imposter" ? "observing edge cases" : "reviewing helper signatures";

        await client.query(
          `
            INSERT INTO session_players (session_id, player_id, role, status)
            VALUES ($1, $2, $3, $4)
          `,
          [sessionId, player.id, role, status],
        );
      }

      for (const message of challenge.chat_messages as Array<{
        user: string;
        color: string;
        message: string;
      }>) {
        await client.query(
          `
            INSERT INTO session_chat_messages (id, session_id, player_id, user_name, color, message)
            VALUES ($1, $2, NULL, $3, $4, $5)
          `,
          [createId(), sessionId, message.user, message.color, message.message],
        );
      }
    });

    await publishLobby(request.params.code);
    await publishSession(sessionId);
    return { sessionId };
  },
);

/* ────────── REST: Get Session ────────── */

app.get<{
  Params: { sessionId: string };
  Querystring: { playerId?: string };
}>(
  "/api/sessions/:sessionId",
  {
    schema: {
      params: {
        type: "object",
        required: ["sessionId"],
        properties: {
          sessionId: { type: "string", minLength: 10 },
        },
      },
      querystring: {
        type: "object",
        properties: {
          playerId: { type: "string" },
        },
      },
    },
  },
  async (request, reply) => {
    const snapshot = await getSessionSnapshot(
      request.params.sessionId,
      request.query.playerId,
    );
    if (!snapshot) {
      reply.code(404);
      return { message: "Session tidak ditemukan." };
    }
    return snapshot;
  },
);

/* ────────── Start ────────── */

async function start() {
  try {
    if (config.mockMode) {
      app.log.info("MOCK_MODE enabled — skipping database initialization.");
    } else {
      await initDatabase();
    }
    sessionTickInterval = setInterval(() => {
      void tickPlayingSessions();
    }, 1000);
    await app.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();

async function shutdown() {
  if (sessionTickInterval) {
    clearInterval(sessionTickInterval);
  }
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
