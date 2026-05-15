import { createId, query } from "../db.js";
import { loadSessionRole } from "../services/auth-guard.js";
import { runChallengeTests, runTests, runCode } from "../services/sandbox.js";
import { rateLimit } from "../services/rate-limit.js";
import { validateImposterTasks, } from "../services/sabotage-validator.js";
import { appendImposterMessage, appendSystemMessage, } from "../services/session-effects.js";
import { finishGame, publishSession } from "../index.js";
function isExpressionTest(t) {
    return typeof t === "object" && t !== null && typeof t.expression === "string";
}
function isImposterTaskDef(t) {
    return (typeof t === "object" &&
        t !== null &&
        typeof t.expectedPattern === "string" &&
        typeof t.hint === "string" &&
        typeof t.lineHint === "number");
}
export function registerSandboxRoutes(app) {
    app.post("/api/sessions/:sessionId/execute", {
        schema: {
            body: {
                type: "object",
                required: ["playerId"],
                properties: {
                    playerId: { type: "string", minLength: 8 },
                    stdin: { type: "string", maxLength: 4000 },
                    code: { type: "string", maxLength: 65536 },
                },
            },
        },
    }, async (request, reply) => {
        const sessionId = request.params.sessionId;
        const playerId = request.body.playerId;
        const info = await loadSessionRole(sessionId, playerId);
        if (!info)
            return reply.code(404).send({ message: "Player not in session." });
        if (info.ejected)
            return reply.code(403).send({ message: "Ejected players cannot run code." });
        const rl = await rateLimit("exec", playerId, 5, 60);
        if (!rl.allowed) {
            return reply.code(429).send({ message: "Execution rate limit exceeded." });
        }
        const sessionRow = await query(`
          SELECT s.editor_content, c.language, c.tests, c.imposter_objectives,
                 s.sabotage_charges, s.imposter_task_progress, s.phase
          FROM sessions s
          JOIN challenges c ON c.id = s.challenge_id
          WHERE s.id = $1
        `, [sessionId]);
        const session = sessionRow.rows[0];
        if (!session)
            return reply.code(404).send({ message: "Session not found." });
        if (session.phase !== "playing") {
            return reply.code(403).send({ message: "Code execution is only available while playing." });
        }
        // Use code submitted in the request body; fall back to the shared editor content.
        const editorContent = request.body.code ?? session.editor_content;
        /* ── Imposter path ── */
        if (info.role === "imposter") {
            const rawTasks = Array.isArray(session.imposter_objectives) ? session.imposter_objectives : [];
            const tasks = rawTasks.filter(isImposterTaskDef);
            if (tasks.length === 0) {
                return reply.code(500).send({ message: "Challenge has no imposter tasks configured." });
            }
            const previouslyCompleted = Array.isArray(session.imposter_task_progress)
                ? session.imposter_task_progress.filter((n) => typeof n === "number")
                : [];
            const validation = validateImposterTasks(editorContent, tasks, previouslyCompleted);
            let nextCharges = session.sabotage_charges;
            if (validation.newlyCompleted.length > 0 && session.phase === "playing") {
                const nextProgress = [...previouslyCompleted, ...validation.newlyCompleted].sort((a, b) => a - b);
                nextCharges = Math.max(0, session.sabotage_charges - validation.newlyCompleted.length);
                await query(`
              UPDATE sessions
              SET imposter_task_progress = $2::jsonb,
                  sabotage_charges = $3
              WHERE id = $1
            `, [sessionId, JSON.stringify(nextProgress), nextCharges]);
                for (const idx of validation.newlyCompleted) {
                    const task = tasks[idx];
                    await query(`INSERT INTO session_sabotage_log (id, session_id, player_id, mutation_name, description, poisoned)
               VALUES ($1, $2, $3, $4, $5, FALSE)`, [createId(), sessionId, playerId, `task_${idx}`, task.title]);
                    await appendImposterMessage(sessionId, `Sabotage validated: ${task.title}.`);
                }
                await appendSystemMessage(sessionId, `⚡ Code mutation detected (${validation.newlyCompleted.length} new).`);
                if (nextCharges <= 0) {
                    await finishGame(sessionId, "imposter", "Imposter completed all sabotage tasks before civilians could stop them. 🔪");
                }
                else {
                    await publishSession(sessionId);
                }
            }
            const completed = validation.tasks.filter((t) => t.done).length;
            return {
                mode: "imposter",
                completed,
                total: tasks.length,
                charges: nextCharges,
                tasks: validation.tasks,
            };
        }
        /* ── Civilian path ── */
        const rawTests = Array.isArray(session.tests) ? session.tests : [];
        const expressionTests = rawTests.filter(isExpressionTest);
        let results;
        if (expressionTests.length > 0) {
            results = await runChallengeTests(session.language, editorContent, expressionTests);
        }
        else if (rawTests.length > 0) {
            const legacyTests = rawTests.map((t) => ({
                input: t.input ?? "",
                expected: t.expected ?? "",
            }));
            results = await runTests(session.language, editorContent, legacyTests);
        }
        else {
            const single = await runCode(session.language, editorContent, request.body.stdin ?? "");
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
        await query(`INSERT INTO session_test_runs (id, session_id, player_id, passed_count, total_count, results)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [createId(), sessionId, playerId, passed, results.length, JSON.stringify(results)]);
        // Publish so other players see updated done flags via snapshot.
        await publishSession(sessionId);
        return {
            mode: "civilian",
            passed,
            total: results.length,
            results,
        };
    });
}
