import type { FastifyInstance } from "fastify";
import { createId, query } from "../db.js";
import { loadSessionRole } from "../services/auth-guard.js";
import { aiRateLimit } from "../services/rate-limit.js";
import { ollamaGenerate } from "../services/ollama.js";
import {
  SABOTAGE_SUGGEST_SYSTEM,
  buildSabotageSuggestPrompt,
  COPILOT_POISON_SYSTEM,
  buildCopilotPoisonPrompt,
  REVIEW_SYSTEM,
  buildReviewPrompt,
} from "../services/ai-prompts.js";
import { config } from "../config.js";

type SessionContext = {
  challenge_title: string;
  language: string;
  editor_content: string;
  category_slug: string;
  phase: string;
  winner_team: "civilian" | "imposter" | null;
  end_reason: string | null;
};

async function getSessionContext(sessionId: string): Promise<SessionContext | null> {
  const r = await query<SessionContext>(
    `
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
    `,
    [sessionId],
  );
  return r.rows[0] ?? null;
}

export function registerAiRoutes(app: FastifyInstance) {
  /* POST /api/ai/sabotage-suggest — imposter-only */
  app.post<{ Body: { sessionId: string; playerId: string } }>(
    "/api/ai/sabotage-suggest",
    {
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
    },
    async (request, reply) => {
      const { sessionId, playerId } = request.body;
      const info = await loadSessionRole(sessionId, playerId);
      if (!info) return reply.code(404).send({ message: "Player not in session." });
      if (info.role !== "imposter") return reply.code(403).send({ message: "Imposter only." });
      if (info.ejected) return reply.code(403).send({ message: "You have been ejected." });

      const rl = await aiRateLimit(playerId);
      if (!rl.allowed) {
        return reply.code(429).send({
          message: "AI rate limit exceeded.",
          retryAfterSeconds: rl.resetSeconds,
        });
      }

      const ctx = await getSessionContext(sessionId);
      if (!ctx) return reply.code(404).send({ message: "Session not found." });
      if (ctx.phase !== "playing") {
        return reply.code(409).send({ message: "Sabotage suggestions only available during play." });
      }

      const result = await ollamaGenerate(
        buildSabotageSuggestPrompt(ctx.challenge_title, ctx.language, ctx.editor_content),
        { system: SABOTAGE_SUGGEST_SYSTEM, temperature: 0.8, maxTokens: 200, timeoutMs: 20_000 },
      );
      if (!result.ok) {
        return reply.code(502).send({
          message: "AI service unavailable.",
          detail: result.error.message,
          fallback:
            "Try swapping a `<` for `<=` in the main loop — it's a classic off-by-one only careful reviewers will spot.",
        });
      }

      // Whisper the suggestion into the imposter feed for replay/audit.
      await query(
        `INSERT INTO session_imposter_messages (id, session_id, user_name, color, message)
         VALUES ($1, $2, 'ghost.ai', '#ff688b', $3)`,
        [createId(), sessionId, result.text],
      );

      return {
        suggestion: result.text,
        model: config.ollamaModel,
        remaining: rl.remaining,
      };
    },
  );

  /* POST /api/ai/activate-poisoning — imposter spends an AI request to inject a poisoned hint into the civilian chat. */
  app.post<{ Body: { sessionId: string; playerId: string } }>(
    "/api/ai/activate-poisoning",
    {
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
    },
    async (request, reply) => {
      const { sessionId, playerId } = request.body;
      const info = await loadSessionRole(sessionId, playerId);
      if (!info) return reply.code(404).send({ message: "Player not in session." });
      if (info.role !== "imposter") return reply.code(403).send({ message: "Imposter only." });
      if (info.ejected) return reply.code(403).send({ message: "You have been ejected." });

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

      const result = await ollamaGenerate(
        buildCopilotPoisonPrompt(ctx.challenge_title, ctx.language, ctx.editor_content),
        { system: COPILOT_POISON_SYSTEM, temperature: 0.9, maxTokens: 220, timeoutMs: 20_000 },
      );

      const poisonedHint = result.ok
        ? result.text
        : "```\n// Hint: swap the boundary check to `i <= n` for safety.\n```\nHint: tighter loop bound.";

      // Inject a poisoned message into the public chat from the AI Copilot persona.
      await query(
        `INSERT INTO session_chat_messages (id, session_id, player_id, user_name, color, message)
         VALUES ($1, $2, NULL, 'copilot.ai', '#9aa1c4', $3)`,
        [createId(), sessionId, poisonedHint],
      );

      await query(
        `INSERT INTO session_sabotage_log (id, session_id, player_id, mutation_name, description, poisoned)
         VALUES ($1, $2, $3, 'copilot_poison', $4, TRUE)`,
        [createId(), sessionId, playerId, poisonedHint.slice(0, 240)],
      );

      return {
        poisonedHint,
        usedFallback: !result.ok,
        remaining: rl.remaining,
      };
    },
  );

  /* GET /api/game/:sessionId/review — AI post-game review. Cached in session_reviews. */
  app.get<{ Params: { sessionId: string } }>("/api/game/:sessionId/review", async (request, reply) => {
    const sessionId = request.params.sessionId;

    const cached = await query<{ content: string; model: string; created_at: Date }>(
      `SELECT content, model, created_at FROM session_reviews WHERE session_id = $1`,
      [sessionId],
    );
    if (cached.rows[0]) {
      return { review: cached.rows[0].content, model: cached.rows[0].model, cached: true };
    }

    const ctx = await getSessionContext(sessionId);
    if (!ctx) return reply.code(404).send({ message: "Session not found." });
    if (ctx.phase !== "game_over") {
      return reply.code(409).send({ message: "Review available only after game_over." });
    }

    const sabotageRows = await query<{ description: string }>(
      `SELECT description FROM session_sabotage_log WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId],
    );

    const result = await ollamaGenerate(
      buildReviewPrompt({
        challengeTitle: ctx.challenge_title,
        language: ctx.language,
        finalCode: ctx.editor_content,
        winnerTeam: ctx.winner_team ?? "unknown",
        reason: ctx.end_reason ?? "unknown",
        sabotageLog: sabotageRows.rows.map((r) => r.description),
      }),
      { system: REVIEW_SYSTEM, temperature: 0.5, maxTokens: 600, timeoutMs: 30_000 },
    );

    const content = result.ok
      ? result.text
      : [
          `Verdict: ${ctx.winner_team ?? "?"} team — ${ctx.end_reason ?? "no reason recorded"}.`,
          "Refactor suggestions:",
          "- Add explicit edge-case tests for empty input.",
          "- Replace mutating helpers with pure functions for easier review.",
          "- Pin loop bounds to named constants to spot sabotage faster.",
          "Teaching moment: civilians should diff against the seed code each round to detect silent edits.",
        ].join("\n");

    await query(
      `INSERT INTO session_reviews (id, session_id, content, model)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id) DO UPDATE SET content = EXCLUDED.content, model = EXCLUDED.model`,
      [createId(), sessionId, content, result.ok ? config.ollamaModel : "fallback"],
    );

    return { review: content, model: result.ok ? config.ollamaModel : "fallback", cached: false };
  });
}
