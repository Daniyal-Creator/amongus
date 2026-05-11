import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { getCategoryLeaderboard, getWeeklyTournament } from "../services/scoring.js";

export function registerLeaderboardRoutes(app: FastifyInstance) {
  /* GET /api/leaderboard/tournament — rolling 7-day aggregate */
  app.get("/api/leaderboard/tournament", async () => {
    return { entries: await getWeeklyTournament() };
  });

  /**
   * GET /api/leaderboard/:category — category-filtered leaderboard.
   * Registered AFTER the global /api/leaderboard route in index.ts.
   * `:category` may be a slug like "arrays" or the special value "all".
   */
  app.get<{ Params: { category: string } }>("/api/leaderboard/:category", async (request, reply) => {
    const category = request.params.category.toLowerCase();
    if (category === "all") {
      const all = await query<{
        username: string;
        category: string;
        score: number;
        record: string;
      }>(
        `SELECT username, category, score, record FROM leaderboard_entries ORDER BY sort_order ASC LIMIT 50`,
      );
      return { category, entries: all.rows };
    }

    const exists = await query<{ slug: string }>(`SELECT slug FROM categories WHERE slug = $1`, [
      category,
    ]);
    if (!exists.rows[0]) {
      return reply.code(404).send({ message: "Category not found." });
    }

    return { category, entries: await getCategoryLeaderboard(category) };
  });
}
