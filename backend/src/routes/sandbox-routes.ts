import type { FastifyInstance } from "fastify";
import { createId, query } from "../db.js";
import { loadSessionRole } from "../services/auth-guard.js";
import { runChallengeTests, runTests, runCode } from "../services/sandbox.js";
import type { ChallengeTest } from "../services/sandbox.js";
import { rateLimit } from "../services/rate-limit.js";

function isExpressionTest(t: unknown): t is ChallengeTest {
  return typeof t === "object" && t !== null && typeof (t as ChallengeTest).expression === "string";
}

export function registerSandboxRoutes(app: FastifyInstance) {
  /**
   * POST /api/sessions/:sessionId/execute
   * Runs the current editor content against the challenge's tests in a sandbox.
   * Rate-limited per player (5/min) to protect the public Piston endpoint.
   */
  app.post<{
    Params: { sessionId: string };
    Body: { playerId: string; stdin?: string };
  }>(
    "/api/sessions/:sessionId/execute",
    {
      schema: {
        body: {
          type: "object",
          required: ["playerId"],
          properties: {
            playerId: { type: "string", minLength: 8 },
            stdin: { type: "string", maxLength: 4000 },
          },
        },
      },
    },
    async (request, reply) => {
      const sessionId = request.params.sessionId;
      const playerId = request.body.playerId;
      const info = await loadSessionRole(sessionId, playerId);
      if (!info) return reply.code(404).send({ message: "Player not in session." });
      if (info.ejected) return reply.code(403).send({ message: "Ejected players cannot run code." });

      const rl = await rateLimit("exec", playerId, 5, 60);
      if (!rl.allowed) {
        return reply.code(429).send({ message: "Execution rate limit exceeded." });
      }

      const sessionRow = await query<{
        editor_content: string;
        language: string;
        tests: unknown[];
      }>(
        `
          SELECT s.editor_content, c.language, c.tests
          FROM sessions s
          JOIN challenges c ON c.id = s.challenge_id
          WHERE s.id = $1
        `,
        [sessionId],
      );
      const session = sessionRow.rows[0];
      if (!session) return reply.code(404).send({ message: "Session not found." });

      const rawTests = Array.isArray(session.tests) ? session.tests : [];
      const expressionTests = rawTests.filter(isExpressionTest);

      let results;
      if (expressionTests.length > 0) {
        results = await runChallengeTests(session.language, session.editor_content, expressionTests);
      } else if (rawTests.length > 0) {
        const legacyTests = (rawTests as Array<{ input?: string; expected?: string }>).map((t) => ({
          input: t.input ?? "",
          expected: t.expected ?? "",
        }));
        results = await runTests(session.language, session.editor_content, legacyTests);
      } else {
        const single = await runCode(session.language, session.editor_content, request.body.stdin ?? "");
        results = [
          {
            passed: single.ok,
            input: request.body.stdin ?? "",
            expected: "",
            actual: single.stdout,
            error: single.error ?? single.stderr,
          },
        ];
      }

      const passed = results.filter((r) => r.passed).length;
      await query(
        `INSERT INTO session_test_runs (id, session_id, player_id, passed_count, total_count, results)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [createId(), sessionId, playerId, passed, results.length, JSON.stringify(results)],
      );

      return {
        passed,
        total: results.length,
        results,
      };
    },
  );
}
