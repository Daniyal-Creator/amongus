import { createId, query } from "../db.js";
/**
 * Compute and persist leaderboard impact at the end of a game.
 * - Civilians on winning side: +score
 * - Imposter on winning side: +score (slightly higher)
 * - Losing side: small participation score
 *
 * Records into:
 *   game_results        — one row per session
 *   leaderboard_history — one row per (player, session) for category leaderboards
 *   leaderboard_entries — upserted aggregate rolling score
 */
export async function recordGameResult(input) {
    const { sessionId, categorySlug, winnerTeam, reason } = input;
    const players = await query(`
      SELECT sp.player_id, lp.name, sp.role, sp.status
      FROM session_players sp
      JOIN lobby_players lp ON lp.id = sp.player_id
      WHERE sp.session_id = $1
    `, [sessionId]);
    await query(`
      INSERT INTO game_results (id, session_id, category_slug, winner_team, reason)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (session_id) DO UPDATE
      SET winner_team = EXCLUDED.winner_team, reason = EXCLUDED.reason
    `, [createId(), sessionId, categorySlug, winnerTeam, reason]);
    for (const p of players.rows) {
        const won = p.role === winnerTeam;
        const ejected = p.status === "ejected after meeting";
        let delta = 10; // participation
        if (won)
            delta = p.role === "imposter" ? 60 : 40;
        else if (ejected && p.role === "imposter")
            delta = 5; // caught
        else if (ejected && p.role === "civilian")
            delta = 2; // wrongly ejected
        await query(`
        INSERT INTO leaderboard_history (id, player_id, session_id, category_slug, role, won, score_delta)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [createId(), p.player_id, sessionId, categorySlug, p.role, won, delta]);
        // upsert rolling leaderboard row
        const rolling = await query(`SELECT id, score, record FROM leaderboard_entries WHERE username = $1 AND category = $2 LIMIT 1`, [p.name, categorySlug]);
        if (rolling.rows[0]) {
            const next = rolling.rows[0].score + delta;
            const winsMatch = rolling.rows[0].record.match(/(\d+)W-(\d+)L/);
            const wins = (winsMatch ? Number(winsMatch[1]) : 0) + (won ? 1 : 0);
            const losses = (winsMatch ? Number(winsMatch[2]) : 0) + (won ? 0 : 1);
            await query(`UPDATE leaderboard_entries SET score = $1, record = $2 WHERE id = $3`, [next, `${wins}W-${losses}L`, rolling.rows[0].id]);
        }
        else {
            await query(`
          INSERT INTO leaderboard_entries (id, username, category, score, record, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [createId(), p.name, categorySlug, delta, won ? "1W-0L" : "0W-1L", 999]);
        }
    }
    // re-sort sort_order so leaderboards stay coherent
    await query(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) AS rn
        FROM leaderboard_entries
      )
      UPDATE leaderboard_entries
      SET sort_order = ranked.rn
      FROM ranked
      WHERE leaderboard_entries.id = ranked.id
    `);
}
export async function getCategoryLeaderboard(categorySlug, limit = 20) {
    const result = await query(`
      SELECT username, category, score, record
      FROM leaderboard_entries
      WHERE category = $1
      ORDER BY score DESC, username ASC
      LIMIT $2
    `, [categorySlug, limit]);
    return result.rows;
}
/**
 * Weekly tournament view: rolling 7-day aggregate of leaderboard_history.
 */
export async function getWeeklyTournament(limit = 20) {
    const result = await query(`
      SELECT lp.name AS player_name,
             SUM(lh.score_delta)::int AS score,
             SUM(CASE WHEN lh.won THEN 1 ELSE 0 END)::int AS wins,
             COUNT(*)::int AS games
      FROM leaderboard_history lh
      JOIN lobby_players lp ON lp.id = lh.player_id
      WHERE lh.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY lp.name
      ORDER BY score DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
}
