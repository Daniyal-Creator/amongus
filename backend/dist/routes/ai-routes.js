import { createId, query } from "../db.js";
import { loadSessionRole } from "../services/auth-guard.js";
import { aiRateLimit } from "../services/rate-limit.js";
import { ollamaGenerate } from "../services/ollama.js";
import { SABOTAGE_SUGGEST_SYSTEM, buildSabotageSuggestPrompt, COPILOT_POISON_SYSTEM, buildCopilotPoisonPrompt, REVIEW_SYSTEM, buildReviewPrompt, } from "../services/ai-prompts.js";
import { config } from "../config.js";
async function getSessionContext(sessionId) {
    const r = await query(`
      SELECT c.title AS challenge_title,
             c.language,
             s.editor_content,
             s.category_slug,
             s.phase,
             s.winner_team,
             s.end_reason
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.id = $1
    `, [sessionId]);
    return r.rows[0] ?? null;
}
export function registerAiRoutes(app) {
    /* POST /api/ai/sabotage-suggest — imposter-only */
    app.post("/api/ai/sabotage-suggest", {
        schema: {
            body: {
                type: "object",
                required: ["sessionId", "playerId"],
                properties: {
                    sessionId: { type: "string", minLength: 8 },
                    playerId: { type: "string", minLength: 8 },
                },
            },
        },
    }, async (request, reply) => {
        const { sessionId, playerId } = request.body;
        const info = await loadSessionRole(sessionId, playerId);
        if (!info)
            return reply.code(404).send({ message: "Player not in session." });
        if (info.role !== "imposter")
            return reply.code(403).send({ message: "Imposter only." });
        if (info.ejected)
            return reply.code(403).send({ message: "You have been ejected." });
        const rl = await aiRateLimit(playerId);
        if (!rl.allowed) {
            return reply.code(429).send({
                message: "AI rate limit exceeded.",
                retryAfterSeconds: rl.resetSeconds,
            });
        }
        const ctx = await getSessionContext(sessionId);
        if (!ctx)
            return reply.code(404).send({ message: "Session not found." });
        if (ctx.phase !== "playing") {
            return reply.code(409).send({ message: "Sabotage suggestions only available during play." });
        }
        const result = await ollamaGenerate(buildSabotageSuggestPrompt(ctx.challenge_title, ctx.language, ctx.editor_content), {
            system: SABOTAGE_SUGGEST_SYSTEM,
            temperature: 0.8,
            maxTokens: 60,
            timeoutMs: 20_000,
            model: config.ollamaModelImposter,
        });
        if (!result.ok) {
            // Use a short fallback hint when AI is unavailable
            const fallbackHint = "Ganti operator < menjadi <= di loop utama";
            await query(`INSERT INTO session_imposter_messages (id, session_id, user_name, color, message)
           VALUES ($1, $2, 'ghost.ai', '#ff688b', $3)`, [createId(), sessionId, fallbackHint]);
            return {
                suggestion: fallbackHint,
                model: "fallback",
                remaining: rl.remaining,
            };
        }
        // Whisper the suggestion into the imposter feed for replay/audit.
        await query(`INSERT INTO session_imposter_messages (id, session_id, user_name, color, message)
         VALUES ($1, $2, 'ghost.ai', '#ff688b', $3)`, [createId(), sessionId, result.text]);
        return {
            suggestion: result.text,
            model: config.ollamaModelImposter,
            remaining: rl.remaining,
        };
    });
    /* POST /api/ai/activate-poisoning — imposter spends an AI request to inject a poisoned hint into the civilian chat. */
    app.post("/api/ai/activate-poisoning", {
        schema: {
            body: {
                type: "object",
                required: ["sessionId", "playerId"],
                properties: {
                    sessionId: { type: "string", minLength: 8 },
                    playerId: { type: "string", minLength: 8 },
                },
            },
        },
    }, async (request, reply) => {
        const { sessionId, playerId } = request.body;
        const info = await loadSessionRole(sessionId, playerId);
        if (!info)
            return reply.code(404).send({ message: "Player not in session." });
        if (info.role !== "imposter")
            return reply.code(403).send({ message: "Imposter only." });
        if (info.ejected)
            return reply.code(403).send({ message: "You have been ejected." });
        const rl = await aiRateLimit(playerId);
        if (!rl.allowed) {
            return reply.code(429).send({
                message: "AI rate limit exceeded.",
                retryAfterSeconds: rl.resetSeconds,
            });
        }
        const ctx = await getSessionContext(sessionId);
        if (!ctx || ctx.phase !== "playing") {
            return reply.code(409).send({ message: "Poisoning only available during play." });
        }
        const result = await ollamaGenerate(buildCopilotPoisonPrompt(ctx.challenge_title, ctx.language, ctx.editor_content), {
            system: COPILOT_POISON_SYSTEM,
            temperature: 0.9,
            maxTokens: 220,
            timeoutMs: 20_000,
            model: config.ollamaModelImposter,
        });
        const poisonedHint = result.ok
            ? result.text
            : "```\n// Hint: swap the boundary check to `i <= n` for safety.\n```\nHint: tighter loop bound.";
        // Inject a poisoned message into the public chat from the AI Copilot persona.
        await query(`INSERT INTO session_chat_messages (id, session_id, player_id, user_name, color, message)
         VALUES ($1, $2, NULL, 'copilot.ai', '#9aa1c4', $3)`, [createId(), sessionId, poisonedHint]);
        await query(`INSERT INTO session_sabotage_log (id, session_id, player_id, mutation_name, description, poisoned)
         VALUES ($1, $2, $3, 'copilot_poison', $4, TRUE)`, [createId(), sessionId, playerId, poisonedHint.slice(0, 240)]);
        return {
            poisonedHint,
            usedFallback: !result.ok,
            remaining: rl.remaining,
        };
    });
    /* GET /api/game/:sessionId/review — AI post-game review per-player. Cached in session_reviews. */
    app.get("/api/game/:sessionId/review", async (request, reply) => {
        const sessionId = request.params.sessionId;
        const cached = await query(`SELECT content, model FROM session_reviews WHERE session_id = $1`, [sessionId]);
        if (cached.rows[0]) {
            try {
                const players = JSON.parse(cached.rows[0].content);
                return { players, model: cached.rows[0].model, cached: true };
            }
            catch {
                // old format — ignore cache and regenerate
            }
        }
        const ctx = await getSessionContext(sessionId);
        if (!ctx)
            return reply.code(404).send({ message: "Session not found." });
        if (ctx.phase !== "game_over") {
            return reply.code(409).send({ message: "Review available only after game_over." });
        }
        const [sabotageRows, playerRows] = await Promise.all([
            query(`SELECT description FROM session_sabotage_log WHERE session_id = $1 ORDER BY created_at ASC`, [sessionId]),
            query(`SELECT lp.name, sp.role
         FROM session_players sp
         JOIN lobby_players lp ON lp.id = sp.player_id
         WHERE sp.session_id = $1
         ORDER BY lp.created_at ASC`, [sessionId]),
        ]);
        const players = playerRows.rows;
        const winnerTeam = ctx.winner_team ?? "unknown";
        const buildFallback = () => players.map((p) => ({
            name: p.name,
            role: p.role,
            feedback: p.role === "imposter"
                ? winnerTeam === "imposter"
                    ? "Sabotase kamu berhasil — civilian tidak mendeteksi perubahan kode."
                    : "Sabotase kamu ketahuan. Coba lebih halus di ronde berikutnya."
                : winnerTeam === "civilian"
                    ? "Bagus! Kamu berhasil menemukan dan melaporkan impostor."
                    : "Impostor berhasil lolos. Perhatikan lebih teliti perubahan kode kecil.",
        }));
        const result = await ollamaGenerate(buildReviewPrompt({
            challengeTitle: ctx.challenge_title,
            language: ctx.language,
            winnerTeam,
            reason: ctx.end_reason ?? "tidak diketahui",
            sabotageLog: sabotageRows.rows.map((r) => r.description),
            players,
        }), {
            system: REVIEW_SYSTEM,
            temperature: 0.4,
            maxTokens: 300,
            timeoutMs: 60_000,
            model: config.ollamaModelReview,
        });
        let parsed = null;
        if (result.ok) {
            try {
                const jsonMatch = result.text.match(/\[[\s\S]*\]/);
                if (jsonMatch)
                    parsed = JSON.parse(jsonMatch[0]);
            }
            catch { /* fall through to fallback */ }
        }
        const finalPlayers = parsed ?? buildFallback();
        const modelUsed = result.ok && parsed ? config.ollamaModelReview : "fallback";
        await query(`INSERT INTO session_reviews (id, session_id, content, model)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id) DO UPDATE SET content = EXCLUDED.content, model = EXCLUDED.model`, [createId(), sessionId, JSON.stringify(finalPlayers), modelUsed]);
        return { players: finalPlayers, model: modelUsed, cached: false };
    });
}
