import { createId, query } from "../db.js";
import { loadSessionRole } from "../services/auth-guard.js";
import { scanForVulnerabilities } from "../services/security-scanner.js";
export function registerSecurityRoutes(app) {
    /**
     * POST /api/sessions/:sessionId/security-scan
     * Civilian-side MedBay task. Awards a "Verified Developer" badge when the
     * current editor passes static checks. Records the result for the post-game review.
     */
    app.post("/api/sessions/:sessionId/security-scan", {
        schema: {
            body: {
                type: "object",
                required: ["playerId"],
                properties: { playerId: { type: "string", minLength: 8 } },
            },
        },
    }, async (request, reply) => {
        const sessionId = request.params.sessionId;
        const playerId = request.body.playerId;
        const info = await loadSessionRole(sessionId, playerId);
        if (!info)
            return reply.code(404).send({ message: "Player not in session." });
        if (info.ejected)
            return reply.code(403).send({ message: "Ejected players cannot scan." });
        const sessionRow = await query(`
          SELECT s.editor_content, c.language
          FROM sessions s
          JOIN challenges c ON c.id = s.challenge_id
          WHERE s.id = $1
        `, [sessionId]);
        const session = sessionRow.rows[0];
        if (!session)
            return reply.code(404).send({ message: "Session not found." });
        const report = scanForVulnerabilities(session.editor_content, session.language);
        await query(`INSERT INTO session_security_scans (id, session_id, player_id, passed, badge, report)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [createId(), sessionId, playerId, report.passed, report.badge, JSON.stringify(report)]);
        return {
            passed: report.passed,
            badge: report.badge,
            issues: report.issues,
            scannedLines: report.scannedLines,
        };
    });
    /**
     * GET /api/sessions/:sessionId/security-scans — most recent scans (for civilians).
     */
    app.get("/api/sessions/:sessionId/security-scans", async (request) => {
        const result = await query(`SELECT player_id, passed, badge, report, created_at
         FROM session_security_scans
         WHERE session_id = $1
         ORDER BY created_at DESC
         LIMIT 20`, [request.params.sessionId]);
        return { scans: result.rows };
    });
}
