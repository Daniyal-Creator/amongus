import { randomInt } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { createId, initDatabase, inTransaction, pool, query } from "./db.js";
const COLOR_PALETTE = ["#14f59b", "#ffd95a", "#6da8ff", "#ff688b", "#ff9f43"];
const PLAYER_TITLES = [
    "Host / Frontend Fixer",
    "Debugger",
    "Bug Hunter",
    "Quiet Contributor",
    "Night Reviewer",
];
const app = Fastify({
    logger: true,
});
const lobbySubscribers = new Map();
const sessionSubscribers = new Map();
let sessionTickInterval = null;
function createCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]).join("");
}
function formatTimestamp(value) {
    return new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta",
    }).format(value);
}
function editorLinesToContent(lines) {
    return lines
        .map((line) => {
        const item = line;
        return item.content ?? "";
    })
        .join("\n");
}
function contentToEditorLines(content) {
    return content.split("\n").map((line, index) => ({
        number: index + 1,
        content: line,
    }));
}
function normalizePlayer(player) {
    return {
        id: player.id,
        name: player.name,
        title: player.title,
        color: player.color,
        isReady: player.is_ready,
        isHost: player.is_host,
    };
}
async function getCategories() {
    const result = await query(`
      SELECT slug, name, description, round_estimate
      FROM categories
      ORDER BY name
    `);
    return result.rows.map((category) => ({
        slug: category.slug,
        name: category.name,
        description: category.description,
        votes: 0,
        roundEstimate: category.round_estimate,
    }));
}
async function getLobbyByCode(code) {
    const lobbyResult = await query(`
      SELECT id, code, mode, max_players, status, host_player_id
      FROM lobbies
      WHERE code = $1
    `, [code.toUpperCase()]);
    const lobby = lobbyResult.rows[0];
    if (!lobby) {
        return null;
    }
    const playersResult = await query(`
      SELECT id, name, title, color, is_ready, is_host
      FROM lobby_players
      WHERE lobby_id = $1
      ORDER BY created_at ASC
    `, [lobby.id]);
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
async function getLobbySnapshot(code) {
    const lobby = await getLobbyByCode(code);
    if (!lobby) {
        return null;
    }
    const categories = await getCategories();
    const activeSessionId = lobby.status === "in_game"
        ? (await query(`
              SELECT id
              FROM sessions
              WHERE lobby_id = $1
            `, [lobby.id])).rows[0]?.id ?? null
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
async function getSessionSnapshot(sessionId, playerId) {
    const sessionResult = await query(`
      SELECT
        id,
        challenge_id,
        category_slug,
        phase,
        round,
        max_rounds,
        sabotage_charges,
        time_remaining_seconds,
        editor_content,
        meeting_started_by,
        meeting_snippet,
        winner_team,
        end_reason
      FROM sessions
      WHERE id = $1
    `, [sessionId]);
    const session = sessionResult.rows[0];
    if (!session) {
        return null;
    }
    const [playersResult, categories, challengeResult, chatMessagesResult, categoryVotesResult, meetingVotesResult] = await Promise.all([
        query(`
        SELECT lp.id, lp.name, lp.color, sp.role, sp.status
        FROM session_players sp
        JOIN lobby_players lp ON lp.id = sp.player_id
        WHERE sp.session_id = $1
        ORDER BY lp.created_at ASC
      `, [session.id]),
        getCategories(),
        query(`
        SELECT
          id,
          title,
          description,
          language,
          difficulty,
          round_number,
          tests,
          objectives,
          imposter_objectives,
          chat_messages,
          imposter_feed,
          editor_lines
        FROM challenges
        WHERE id = $1
      `, [session.challenge_id]),
        query(`
        SELECT user_name, color, message, created_at
        FROM session_chat_messages
        WHERE session_id = $1
        ORDER BY created_at ASC
      `, [session.id]),
        query(`
        SELECT player_id, category_slug
        FROM session_category_votes
        WHERE session_id = $1
      `, [session.id]),
        query(`
        SELECT voter_player_id, target_player_id
        FROM session_meeting_votes
        WHERE session_id = $1
      `, [session.id]),
    ]);
    const challenge = challengeResult.rows[0];
    const players = playersResult.rows;
    const currentPlayer = players.find((player) => player.id === playerId) ?? players[0];
    const isCivilian = currentPlayer?.role !== "imposter";
    const categoryVotes = categoryVotesResult.rows;
    const meetingVotes = meetingVotesResult.rows;
    const categoryVoteCount = new Map();
    const meetingVoteCount = new Map();
    for (const vote of categoryVotes) {
        categoryVoteCount.set(vote.category_slug, (categoryVoteCount.get(vote.category_slug) ?? 0) + 1);
    }
    for (const vote of meetingVotes) {
        meetingVoteCount.set(vote.target_player_id, (meetingVoteCount.get(vote.target_player_id) ?? 0) + 1);
    }
    return {
        phase: session.phase,
        round: session.round,
        maxRounds: session.max_rounds,
        category: categories.find((category) => category.slug === session.category_slug)?.name ?? "Unknown",
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
        currentCategoryVote: categoryVotes.find((vote) => vote.player_id === currentPlayer?.id)?.category_slug ?? null,
        meeting: {
            startedBy: players.find((player) => player.id === session.meeting_started_by)?.name ?? null,
            snippet: session.meeting_snippet,
            currentVoteTargetId: meetingVotes.find((vote) => vote.voter_player_id === currentPlayer?.id)?.target_player_id ??
                null,
        },
        result: {
            winnerTeam: session.winner_team,
            reason: session.end_reason,
        },
    };
}
async function getSessionPlayerIdentity(sessionId, playerId) {
    if (!playerId) {
        return null;
    }
    const result = await query(`
      SELECT lp.id AS player_id, lp.name AS user_name, lp.color
      FROM session_players sp
      JOIN lobby_players lp ON lp.id = sp.player_id
      WHERE sp.session_id = $1 AND sp.player_id = $2
    `, [sessionId, playerId]);
    return result.rows[0] ?? null;
}
async function resolveChallengeForCategory(categorySlug) {
    const result = await query(`
      SELECT
        id,
        title,
        description,
        language,
        difficulty,
        round_number,
        tests,
        objectives,
        imposter_objectives,
        chat_messages,
        imposter_feed,
        editor_lines
      FROM challenges
      WHERE category_slug = $1
      ORDER BY round_number ASC
      LIMIT 1
    `, [categorySlug]);
    return result.rows[0] ?? null;
}
function registerSocket(collection, key, socket) {
    const current = collection.get(key) ?? new Set();
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
function broadcast(collection, key, payload) {
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
async function publishLobby(code) {
    const snapshot = await getLobbySnapshot(code);
    if (!snapshot) {
        return;
    }
    broadcast(lobbySubscribers, code.toUpperCase(), {
        type: "lobby.updated",
        payload: snapshot,
    });
}
async function publishSession(sessionId) {
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
        socket.send(JSON.stringify({
            type: "session.updated",
            payload: snapshot,
        }));
    }
}
async function appendSystemMessage(sessionId, message) {
    await query(`
      INSERT INTO session_chat_messages (id, session_id, player_id, user_name, color, message)
      VALUES ($1, $2, NULL, 'system', '#f0a92e', $3)
    `, [createId(), sessionId, message]);
}
async function finishGame(sessionId, winnerTeam, reason) {
    const lobbyResult = await query(`
      SELECT l.code, s.lobby_id
      FROM sessions s
      JOIN lobbies l ON l.id = s.lobby_id
      WHERE s.id = $1
    `, [sessionId]);
    await query(`
      UPDATE sessions
      SET phase = 'game_over',
          winner_team = $2,
          end_reason = $3,
          ended_at = NOW(),
          meeting_started_by = NULL,
          meeting_snippet = ''
      WHERE id = $1
    `, [sessionId, winnerTeam, reason]);
    await query(`DELETE FROM session_meeting_votes WHERE session_id = $1`, [sessionId]);
    await appendSystemMessage(sessionId, reason);
    const lobby = lobbyResult.rows[0];
    if (lobby) {
        await query(`UPDATE lobbies SET status = 'finished' WHERE id = $1`, [lobby.lobby_id]);
        await publishLobby(lobby.code);
    }
    await publishSession(sessionId);
}
async function advanceToNextRound(sessionId) {
    const sessionResult = await query(`
      SELECT round, max_rounds, lobby_id
      FROM sessions
      WHERE id = $1
    `, [sessionId]);
    const session = sessionResult.rows[0];
    if (!session) {
        return;
    }
    if (session.round >= session.max_rounds) {
        await finishGame(sessionId, "civilian", "Civilian survived until the final round and secured the win.");
        return;
    }
    await query(`
      UPDATE sessions
      SET phase = 'category',
          round = round + 1,
          time_remaining_seconds = 37,
          meeting_started_by = NULL,
          meeting_snippet = ''
      WHERE id = $1
    `, [sessionId]);
    await query(`DELETE FROM session_category_votes WHERE session_id = $1`, [sessionId]);
    await query(`DELETE FROM session_meeting_votes WHERE session_id = $1`, [sessionId]);
    await appendSystemMessage(sessionId, `Round ${session.round + 1} is starting. Vote the next category.`);
    await publishSession(sessionId);
}
async function tickPlayingSessions() {
    const sessionsResult = await query(`
      SELECT id, time_remaining_seconds
      FROM sessions
      WHERE phase = 'playing'
    `);
    for (const session of sessionsResult.rows) {
        const nextTime = Math.max(0, session.time_remaining_seconds - 1);
        await query(`
        UPDATE sessions
        SET time_remaining_seconds = $2
        WHERE id = $1
      `, [session.id, nextTime]);
        if (nextTime === 0) {
            await advanceToNextRound(session.id);
            continue;
        }
        await publishSession(session.id);
    }
}
app.register(cors, {
    origin: config.corsOrigin,
});
app.register(websocket);
app.get("/health", async () => ({ ok: true }));
app.get("/api/categories", async () => {
    return getCategories();
});
app.get("/ws/lobbies/:code", { websocket: true }, async (socket, request) => {
    const code = request.params.code.toUpperCase();
    registerSocket(lobbySubscribers, code, socket);
    const snapshot = await getLobbySnapshot(code);
    socket.send(JSON.stringify({
        type: "lobby.updated",
        payload: snapshot,
    }));
});
app.get("/ws/sessions/:sessionId", { websocket: true }, async (socket, request) => {
    const sessionId = request.params.sessionId;
    const realtimeSocket = socket;
    realtimeSocket.playerId = request.query.playerId;
    registerSocket(sessionSubscribers, sessionId, realtimeSocket);
    realtimeSocket.on("message", async (payload) => {
        try {
            const data = JSON.parse(payload?.toString() ?? "");
            const identity = await getSessionPlayerIdentity(sessionId, realtimeSocket.playerId);
            if (!identity) {
                return;
            }
            const sessionMetaResult = await query(`
            SELECT phase, sabotage_charges
            FROM sessions
            WHERE id = $1
          `, [sessionId]);
            const sessionMeta = sessionMetaResult.rows[0];
            if (!sessionMeta) {
                return;
            }
            const playerRoleResult = await query(`
            SELECT role
            FROM session_players
            WHERE session_id = $1 AND player_id = $2
          `, [sessionId, identity.player_id]);
            const playerRole = playerRoleResult.rows[0]?.role;
            if (!playerRole) {
                return;
            }
            if (data.type === "chat.send") {
                const nextMessage = data.message.trim();
                if (!nextMessage) {
                    return;
                }
                await query(`
              INSERT INTO session_chat_messages (id, session_id, player_id, user_name, color, message)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                    createId(),
                    sessionId,
                    identity.player_id,
                    identity.user_name,
                    identity.color,
                    nextMessage,
                ]);
                await query(`
              UPDATE session_players
              SET status = 'chatting in discussion'
              WHERE session_id = $1 AND player_id = $2
            `, [sessionId, identity.player_id]);
            }
            if (data.type === "editor.update") {
                if (sessionMeta.phase !== "playing") {
                    return;
                }
                await query(`
              UPDATE sessions
              SET editor_content = $2
              WHERE id = $1
            `, [sessionId, data.content.slice(0, 12000)]);
                await query(`
              UPDATE session_players
              SET status = 'editing live code'
              WHERE session_id = $1 AND player_id = $2
            `, [sessionId, identity.player_id]);
            }
            if (data.type === "category.vote") {
                if (sessionMeta.phase !== "category") {
                    return;
                }
                await query(`
              INSERT INTO session_category_votes (session_id, player_id, category_slug)
              VALUES ($1, $2, $3)
              ON CONFLICT (session_id, player_id)
              DO UPDATE SET category_slug = EXCLUDED.category_slug
            `, [sessionId, identity.player_id, data.categorySlug]);
                const [votesResult, playersResult] = await Promise.all([
                    query(`
                SELECT category_slug
                FROM session_category_votes
                WHERE session_id = $1
              `, [sessionId]),
                    query(`
                SELECT COUNT(*)::text AS count
                FROM session_players
                WHERE session_id = $1
              `, [sessionId]),
                ]);
                const totalPlayers = Number(playersResult.rows[0]?.count ?? "0");
                if (votesResult.rows.length === totalPlayers && totalPlayers > 0) {
                    const counts = new Map();
                    for (const vote of votesResult.rows) {
                        counts.set(vote.category_slug, (counts.get(vote.category_slug) ?? 0) + 1);
                    }
                    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
                    const topScore = ranked[0]?.[1] ?? 0;
                    const candidates = ranked
                        .filter((entry) => entry[1] === topScore)
                        .map((entry) => entry[0]);
                    const selectedCategorySlug = candidates[randomInt(0, candidates.length)];
                    const nextChallenge = await resolveChallengeForCategory(selectedCategorySlug);
                    if (nextChallenge) {
                        await query(`
                  UPDATE sessions
                  SET category_slug = $2,
                      challenge_id = $3,
                      phase = 'playing',
                      editor_content = $4
                  WHERE id = $1
                `, [
                            sessionId,
                            selectedCategorySlug,
                            nextChallenge.id,
                            editorLinesToContent(nextChallenge.editor_lines),
                        ]);
                        await appendSystemMessage(sessionId, `Category locked: ${selectedCategorySlug.toUpperCase()}. Round started.`);
                    }
                }
            }
            if (data.type === "meeting.start") {
                if (sessionMeta.phase !== "playing" || playerRole !== "civilian") {
                    return;
                }
                const currentSession = await query(`
              SELECT editor_content
              FROM sessions
              WHERE id = $1
            `, [sessionId]);
                await query(`
              UPDATE sessions
              SET phase = 'meeting',
                  meeting_started_by = $2,
                  meeting_snippet = $3
              WHERE id = $1
            `, [sessionId, identity.player_id, currentSession.rows[0]?.editor_content ?? ""]);
                await query(`DELETE FROM session_meeting_votes WHERE session_id = $1`, [sessionId]);
                await appendSystemMessage(sessionId, `${identity.user_name} called an emergency meeting.`);
            }
            if (data.type === "meeting.vote") {
                if (sessionMeta.phase !== "meeting") {
                    return;
                }
                await query(`
              INSERT INTO session_meeting_votes (session_id, voter_player_id, target_player_id)
              VALUES ($1, $2, $3)
              ON CONFLICT (session_id, voter_player_id)
              DO UPDATE SET target_player_id = EXCLUDED.target_player_id
            `, [sessionId, identity.player_id, data.targetPlayerId]);
                const [meetingVotes, playerCountResult, playerNames] = await Promise.all([
                    query(`
                SELECT voter_player_id, target_player_id
                FROM session_meeting_votes
                WHERE session_id = $1
              `, [sessionId]),
                    query(`
                SELECT COUNT(*)::text AS count
                FROM session_players
                WHERE session_id = $1
              `, [sessionId]),
                    query(`
                SELECT id, name
                FROM lobby_players
                WHERE id IN (
                  SELECT player_id
                  FROM session_players
                  WHERE session_id = $1
                )
              `, [sessionId]),
                ]);
                const totalPlayers = Number(playerCountResult.rows[0]?.count ?? "0");
                if (meetingVotes.rows.length === totalPlayers && totalPlayers > 0) {
                    const counts = new Map();
                    for (const vote of meetingVotes.rows) {
                        counts.set(vote.target_player_id, (counts.get(vote.target_player_id) ?? 0) + 1);
                    }
                    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
                    const winnerId = ranked[0]?.[0] ?? null;
                    const ejectedName = playerNames.rows.find((player) => player.id === winnerId)?.name ?? "unknown";
                    const ejectedRole = winnerId
                        ? (await query(`
                        SELECT role
                        FROM session_players
                        WHERE session_id = $1 AND player_id = $2
                      `, [sessionId, winnerId])).rows[0]?.role ?? null
                        : null;
                    if (winnerId) {
                        await query(`
                  UPDATE session_players
                  SET status = 'ejected after meeting'
                  WHERE session_id = $1 AND player_id = $2
                `, [sessionId, winnerId]);
                    }
                    await query(`
                UPDATE sessions
                SET phase = 'playing',
                    meeting_started_by = NULL,
                    meeting_snippet = ''
                WHERE id = $1
              `, [sessionId]);
                    await query(`DELETE FROM session_meeting_votes WHERE session_id = $1`, [sessionId]);
                    await appendSystemMessage(sessionId, `${ejectedName} received the most votes.`);
                    if (ejectedRole === "imposter") {
                        await finishGame(sessionId, "civilian", `${ejectedName} was the impostor. Civilian team wins.`);
                        return;
                    }
                }
            }
            if (data.type === "sabotage.use") {
                if (sessionMeta.phase !== "playing" || playerRole !== "imposter") {
                    return;
                }
                if (sessionMeta.sabotage_charges <= 0) {
                    return;
                }
                await query(`
              UPDATE sessions
              SET sabotage_charges = sabotage_charges - 1
              WHERE id = $1
            `, [sessionId]);
                await query(`
              UPDATE session_players
              SET status = 'used sabotage charge'
              WHERE session_id = $1 AND player_id = $2
            `, [sessionId, identity.player_id]);
                await appendSystemMessage(sessionId, `A sabotage wave just hit the room. Check the code carefully.`);
                if (sessionMeta.sabotage_charges - 1 <= 0) {
                    await finishGame(sessionId, "imposter", "Imposter exhausted the sabotage meter before the civilians could stop them.");
                    return;
                }
            }
            await publishSession(sessionId);
        }
        catch (error) {
            app.log.warn({ error }, "Failed to process session websocket message");
        }
    });
    const snapshot = await getSessionSnapshot(sessionId, request.query.playerId);
    socket.send(JSON.stringify({
        type: "session.updated",
        payload: snapshot,
    }));
});
app.get("/api/leaderboard", async () => {
    const [leaderboardResult, hallOfFameResult] = await Promise.all([
        query(`
        SELECT username, category, score, record
        FROM leaderboard_entries
        ORDER BY sort_order ASC
      `),
        query(`
        SELECT title, player, description, tone
        FROM hall_of_fame_entries
        ORDER BY sort_order ASC
      `),
    ]);
    return {
        leaderboardEntries: leaderboardResult.rows,
        hallOfFame: hallOfFameResult.rows,
    };
});
app.post("/api/lobbies", {
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
}, async (request, reply) => {
    const lobbyId = createId();
    const playerId = createId();
    const code = createCode();
    const mode = request.body.mode ?? "standard";
    const maxPlayers = request.body.maxPlayers ?? 4;
    await inTransaction(async (client) => {
        await client.query(`
          INSERT INTO lobbies (id, code, mode, max_players, status, host_player_id)
          VALUES ($1, $2, $3, $4, 'waiting', $5)
        `, [lobbyId, code, mode, maxPlayers, playerId]);
        await client.query(`
          INSERT INTO lobby_players (id, lobby_id, name, title, color, is_ready, is_host)
          VALUES ($1, $2, $3, $4, $5, true, true)
        `, [playerId, lobbyId, request.body.hostName.trim(), PLAYER_TITLES[0], COLOR_PALETTE[0]]);
    });
    const lobby = await getLobbyByCode(code);
    await publishLobby(code);
    reply.code(201);
    return {
        playerId,
        lobby,
    };
});
app.post("/api/lobbies/:code/join", {
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
}, async (request, reply) => {
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
    await query(`
        INSERT INTO lobby_players (id, lobby_id, name, title, color, is_ready, is_host)
        VALUES ($1, $2, $3, $4, $5, false, false)
      `, [
        playerId,
        lobby.id,
        request.body.playerName.trim(),
        PLAYER_TITLES[titleIndex],
        COLOR_PALETTE[paletteIndex],
    ]);
    await publishLobby(request.params.code);
    reply.code(201);
    return {
        playerId,
    };
});
app.get("/api/lobbies/:code", {
    schema: {
        params: {
            type: "object",
            required: ["code"],
            properties: {
                code: { type: "string", minLength: 6, maxLength: 6 },
            },
        },
    },
}, async (request, reply) => {
    const snapshot = await getLobbySnapshot(request.params.code);
    if (!snapshot) {
        reply.code(404);
        return { message: "Lobby tidak ditemukan." };
    }
    return snapshot;
});
app.post("/api/lobbies/:code/players/:playerId/ready", {
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
}, async (request, reply) => {
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
    await query(`
        UPDATE lobby_players
        SET is_ready = NOT is_ready
        WHERE id = $1 AND lobby_id = $2
      `, [request.params.playerId, lobby.id]);
    await publishLobby(request.params.code);
    return getLobbySnapshot(request.params.code);
});
app.post("/api/lobbies/:code/start", {
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
}, async (request, reply) => {
    const lobby = await getLobbyByCode(request.params.code);
    if (!lobby) {
        reply.code(404);
        return { message: "Lobby tidak ditemukan." };
    }
    if (lobby.hostPlayerId !== request.body.playerId) {
        reply.code(403);
        return { message: "Hanya host yang bisa memulai game." };
    }
    if (lobby.players.length < 4) {
        reply.code(400);
        return { message: "Minimal 4 pemain untuk memulai." };
    }
    const allNonHostReady = lobby.players
        .filter((player) => !player.isHost)
        .every((player) => player.isReady);
    if (!allNonHostReady) {
        reply.code(400);
        return { message: "Semua non-host harus ready." };
    }
    const existingSession = await query(`
        SELECT id
        FROM sessions
        WHERE lobby_id = $1
      `, [lobby.id]);
    if (existingSession.rows[0]) {
        await query(`UPDATE lobbies SET status = 'in_game' WHERE id = $1`, [lobby.id]);
        await publishLobby(request.params.code);
        await publishSession(existingSession.rows[0].id);
        return { sessionId: existingSession.rows[0].id };
    }
    const categories = await getCategories();
    const category = categories[randomInt(0, categories.length)];
    const challengeResult = await query(`
        SELECT
          id,
          title,
          description,
          language,
          difficulty,
          round_number,
          tests,
          objectives,
          imposter_objectives,
          chat_messages,
          imposter_feed,
          editor_lines
        FROM challenges
        WHERE category_slug = $1
        ORDER BY round_number ASC
        LIMIT 1
      `, [category.slug]);
    const challenge = challengeResult.rows[0];
    if (!challenge) {
        reply.code(500);
        return { message: "Challenge untuk kategori ini belum tersedia." };
    }
    const sessionId = createId();
    const imposterIndex = randomInt(0, lobby.players.length);
    const initialEditorContent = editorLinesToContent(challenge.editor_lines);
    await inTransaction(async (client) => {
        await client.query(`UPDATE lobbies SET status = 'in_game' WHERE id = $1`, [lobby.id]);
        await client.query(`
          INSERT INTO sessions (
            id,
            lobby_id,
            challenge_id,
            category_slug,
            phase,
            round,
            max_rounds,
            sabotage_charges,
            time_remaining_seconds,
            editor_content
          )
          VALUES ($1, $2, $3, $4, 'category', 1, 4, 5, 37, $5)
        `, [sessionId, lobby.id, challenge.id, category.slug, initialEditorContent]);
        for (const [index, player] of lobby.players.entries()) {
            const role = index === imposterIndex ? "imposter" : "civilian";
            const status = role === "imposter" ? "observing edge cases" : "reviewing helper signatures";
            await client.query(`
            INSERT INTO session_players (session_id, player_id, role, status)
            VALUES ($1, $2, $3, $4)
          `, [sessionId, player.id, role, status]);
        }
        for (const message of challenge.chat_messages) {
            await client.query(`
            INSERT INTO session_chat_messages (id, session_id, player_id, user_name, color, message)
            VALUES ($1, $2, NULL, $3, $4, $5)
          `, [createId(), sessionId, message.user, message.color, message.message]);
        }
    });
    await publishLobby(request.params.code);
    await publishSession(sessionId);
    return { sessionId };
});
app.get("/api/sessions/:sessionId", {
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
}, async (request, reply) => {
    const snapshot = await getSessionSnapshot(request.params.sessionId, request.query.playerId);
    if (!snapshot) {
        reply.code(404);
        return { message: "Session tidak ditemukan." };
    }
    return snapshot;
});
async function start() {
    try {
        await initDatabase();
        sessionTickInterval = setInterval(() => {
            void tickPlayingSessions();
        }, 1000);
        await app.listen({
            host: config.host,
            port: config.port,
        });
    }
    catch (error) {
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
