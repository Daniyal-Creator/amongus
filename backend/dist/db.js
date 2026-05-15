import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { config } from "./config.js";
import { CATEGORY_SEEDS, CHALLENGE_SEEDS, HALL_OF_FAME_SEEDS, LEADERBOARD_SEEDS, ACHIEVEMENT_SEEDS, } from "./seed-data.js";
export const pool = new Pool({
    connectionString: config.databaseUrl,
});
export async function query(text, values = []) {
    return pool.query(text, values);
}
async function withClient(callback) {
    const client = await pool.connect();
    try {
        return await callback(client);
    }
    finally {
        client.release();
    }
}
export async function initDatabase() {
    await query(`
    CREATE TABLE IF NOT EXISTS categories (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      round_estimate TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      category_slug TEXT NOT NULL REFERENCES categories(slug),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      language TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      tests JSONB NOT NULL,
      objectives JSONB NOT NULL,
      imposter_objectives JSONB NOT NULL,
      chat_messages JSONB NOT NULL,
      imposter_feed JSONB NOT NULL,
      editor_lines JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lobbies (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      mode TEXT NOT NULL,
      max_players INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      host_player_id TEXT,
      is_private BOOLEAN NOT NULL DEFAULT FALSE,
      password_hash TEXT,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lobby_players (
      id TEXT PRIMARY KEY,
      lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      color TEXT NOT NULL,
      is_ready BOOLEAN NOT NULL DEFAULT FALSE,
      is_host BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      lobby_id TEXT UNIQUE NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
      challenge_id TEXT NOT NULL REFERENCES challenges(id),
      category_slug TEXT NOT NULL REFERENCES categories(slug),
      phase TEXT NOT NULL DEFAULT 'category',
      round INTEGER NOT NULL DEFAULT 1,
      max_rounds INTEGER NOT NULL DEFAULT 4,
      sabotage_charges INTEGER NOT NULL DEFAULT 5,
      time_remaining_seconds INTEGER NOT NULL DEFAULT 37,
      editor_content TEXT NOT NULL DEFAULT '',
      meeting_started_by TEXT REFERENCES lobby_players(id) ON DELETE SET NULL,
      meeting_snippet TEXT NOT NULL DEFAULT '',
      winner_team TEXT,
      end_reason TEXT,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      imposter_task_progress JSONB NOT NULL DEFAULT '[]'::jsonb
    );

    CREATE TABLE IF NOT EXISTS session_players (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES lobby_players(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      disconnected_at TIMESTAMPTZ,
      PRIMARY KEY (session_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS session_chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      player_id TEXT REFERENCES lobby_players(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL,
      color TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS session_imposter_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      color TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS session_category_votes (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES lobby_players(id) ON DELETE CASCADE,
      category_slug TEXT NOT NULL REFERENCES categories(slug),
      PRIMARY KEY (session_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS session_meeting_votes (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      voter_player_id TEXT NOT NULL REFERENCES lobby_players(id) ON DELETE CASCADE,
      target_player_id TEXT NOT NULL REFERENCES lobby_players(id) ON DELETE CASCADE,
      PRIMARY KEY (session_id, voter_player_id)
    );

    CREATE TABLE IF NOT EXISTS leaderboard_entries (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      category TEXT NOT NULL,
      score INTEGER NOT NULL,
      record TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hall_of_fame_entries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      player TEXT NOT NULL,
      description TEXT NOT NULL,
      tone TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_results (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      category_slug TEXT NOT NULL,
      winner_team TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leaderboard_history (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES lobby_players(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      category_slug TEXT NOT NULL,
      role TEXT NOT NULL,
      won BOOLEAN NOT NULL,
      score_delta INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_leaderboard_history_week ON leaderboard_history(created_at);

    CREATE TABLE IF NOT EXISTS session_security_scans (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES lobby_players(id) ON DELETE CASCADE,
      passed BOOLEAN NOT NULL,
      badge TEXT NOT NULL,
      report JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS session_reviews (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS session_sabotage_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      player_id TEXT REFERENCES lobby_players(id) ON DELETE SET NULL,
      mutation_name TEXT NOT NULL,
      description TEXT NOT NULL,
      poisoned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS session_test_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      player_id TEXT REFERENCES lobby_players(id) ON DELETE SET NULL,
      passed_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      results JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS achievements (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      tone TEXT NOT NULL DEFAULT 'achievement'
    );

    CREATE TABLE IF NOT EXISTS player_achievements (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES lobby_players(id) ON DELETE CASCADE,
      achievement_slug TEXT NOT NULL REFERENCES achievements(slug),
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (player_id, achievement_slug, session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_id);
  `);
    /* ── Idempotent migrations for previously deployed schemas ── */
    await query(`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS imposter_task_progress JSONB NOT NULL DEFAULT '[]'::jsonb;

    ALTER TABLE lobbies
      ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS password_hash TEXT,
      ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'medium';

    ALTER TABLE session_players
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;

    ALTER TABLE challenges
      ADD COLUMN IF NOT EXISTS difficulty_tier TEXT NOT NULL DEFAULT 'medium';
  `);
    for (const category of CATEGORY_SEEDS) {
        await query(`
        INSERT INTO categories (slug, name, description, round_estimate)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            round_estimate = EXCLUDED.round_estimate
      `, [category.slug, category.name, category.description, category.roundEstimate]);
    }
    for (const challenge of CHALLENGE_SEEDS) {
        await query(`
        INSERT INTO challenges (
          id,
          category_slug,
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
          editor_lines,
          difficulty_tier
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            description = EXCLUDED.description,
            tests = EXCLUDED.tests,
            objectives = EXCLUDED.objectives,
            imposter_objectives = EXCLUDED.imposter_objectives,
            chat_messages = EXCLUDED.chat_messages,
            imposter_feed = EXCLUDED.imposter_feed,
            editor_lines = EXCLUDED.editor_lines,
            difficulty_tier = EXCLUDED.difficulty_tier
      `, [
            challenge.id,
            challenge.categorySlug,
            challenge.title,
            challenge.description,
            challenge.language,
            challenge.difficulty,
            challenge.roundNumber,
            JSON.stringify(challenge.tests),
            JSON.stringify(challenge.objectives),
            JSON.stringify(challenge.imposterObjectives),
            JSON.stringify(challenge.chatMessages),
            JSON.stringify(challenge.imposterFeed),
            JSON.stringify(challenge.editorLines),
            challenge.difficulty,
        ]);
    }
    for (const entry of LEADERBOARD_SEEDS) {
        await query(`
        INSERT INTO leaderboard_entries (id, username, category, score, record, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE
        SET username = EXCLUDED.username,
            category = EXCLUDED.category,
            score = EXCLUDED.score,
            record = EXCLUDED.record,
            sort_order = EXCLUDED.sort_order
      `, [entry.id, entry.username, entry.category, entry.score, entry.record, entry.sortOrder]);
    }
    for (const ach of ACHIEVEMENT_SEEDS) {
        await query(`
        INSERT INTO achievements (slug, title, description, icon, tone)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE
        SET title = EXCLUDED.title,
            description = EXCLUDED.description,
            icon = EXCLUDED.icon,
            tone = EXCLUDED.tone
      `, [ach.slug, ach.title, ach.description, ach.icon, ach.tone]);
    }
    for (const entry of HALL_OF_FAME_SEEDS) {
        await query(`
        INSERT INTO hall_of_fame_entries (id, title, player, description, tone, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            player = EXCLUDED.player,
            description = EXCLUDED.description,
            tone = EXCLUDED.tone,
            sort_order = EXCLUDED.sort_order
      `, [entry.id, entry.title, entry.player, entry.description, entry.tone, entry.sortOrder]);
    }
}
export async function inTransaction(callback) {
    return withClient(async (client) => {
        await client.query("BEGIN");
        try {
            const result = await callback(client);
            await client.query("COMMIT");
            return result;
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
    });
}
export function createId() {
    return randomUUID();
}
