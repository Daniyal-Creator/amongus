import { createId, query } from "../db.js";

export type AchievementAward = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  tone: string;
  playerId: string;
};

type SessionFinishContext = {
  sessionId: string;
  winnerTeam: "imposter" | "civilian";
};

/**
 * Evaluate which achievements (if any) should be granted to players in a finished session.
 * Inserts into player_achievements with ON CONFLICT DO NOTHING semantics, returning
 * only the *newly* awarded achievements so the realtime layer can broadcast toasts.
 */
export async function evaluateAchievements(ctx: SessionFinishContext): Promise<AchievementAward[]> {
  const awards: AchievementAward[] = [];

  // Pull session players + their roles + status.
  const players = await query<{
    player_id: string;
    role: string;
    status: string;
    name: string;
  }>(
    `SELECT sp.player_id, sp.role, sp.status, lp.name
     FROM session_players sp
     JOIN lobby_players lp ON lp.id = sp.player_id
     WHERE sp.session_id = $1`,
    [ctx.sessionId],
  );

  const sabotageLog = await query<{ player_id: string | null }>(
    `SELECT player_id FROM session_sabotage_log WHERE session_id = $1`,
    [ctx.sessionId],
  );

  const meetingVotes = await query<{ voter_player_id: string; target_player_id: string }>(
    `SELECT voter_player_id, target_player_id FROM session_meeting_votes WHERE session_id = $1`,
    [ctx.sessionId],
  );

  const ejectionRow = await query<{ ejected_id: string | null }>(
    `SELECT player_id AS ejected_id FROM session_players WHERE session_id = $1 AND status = 'ejected after meeting' LIMIT 1`,
    [ctx.sessionId],
  );
  const ejectedId = ejectionRow.rows[0]?.ejected_id ?? null;

  const securityScans = await query<{ player_id: string; passed: boolean }>(
    `SELECT player_id, passed FROM session_security_scans WHERE session_id = $1`,
    [ctx.sessionId],
  );

  const meetingTrigger = await query<{ meeting_started_by: string | null }>(
    `SELECT meeting_started_by FROM sessions WHERE id = $1`,
    [ctx.sessionId],
  );

  const sabotageCountByPlayer = new Map<string, number>();
  for (const row of sabotageLog.rows) {
    if (!row.player_id) continue;
    sabotageCountByPlayer.set(row.player_id, (sabotageCountByPlayer.get(row.player_id) ?? 0) + 1);
  }

  for (const player of players.rows) {
    const isImposter = player.role === "imposter";
    const wasEjected = player.status === "ejected after meeting";

    // master-saboteur: imposter completed all 5 sabotage tasks
    if (isImposter && (sabotageCountByPlayer.get(player.player_id) ?? 0) >= 5) {
      awards.push(makeAward("master-saboteur", "Master Saboteur", "Selesaikan 5 sabotage task dalam satu game.", "🔪", player.player_id));
    }

    // untouchable: imposter wins, never voted against in any meeting
    if (isImposter && ctx.winnerTeam === "imposter") {
      const wasVotedAgainst = meetingVotes.rows.some((v) => v.target_player_id === player.player_id);
      if (!wasVotedAgainst) {
        awards.push(makeAward("untouchable", "Untouchable", "Menang sebagai imposter tanpa pernah diselidiki di emergency meeting.", "🥷", player.player_id));
      }
    }

    // verified-dev: civilian ran security scan that passed
    if (!isImposter) {
      const passedScan = securityScans.rows.some((s) => s.player_id === player.player_id && s.passed);
      if (passedScan) {
        awards.push(makeAward("verified-dev", "Verified Developer", "Lulus security scanner tanpa temuan vulnerability.", "🛡️", player.player_id));
      }
    }

    // first-blood + clutch-caller: meeting starter caused successful imposter ejection
    if (
      meetingTrigger.rows[0]?.meeting_started_by === player.player_id &&
      ejectedId &&
      players.rows.find((p) => p.player_id === ejectedId)?.role === "imposter"
    ) {
      awards.push(makeAward("clutch-caller", "Clutch Caller", "Trigger emergency meeting yang berhasil eject imposter.", "🚨", player.player_id));
    }

    // first-blood: civilian voted for the imposter who got ejected
    if (!isImposter && ejectedId && !wasEjected) {
      const myVote = meetingVotes.rows.find((v) => v.voter_player_id === player.player_id);
      if (myVote && myVote.target_player_id === ejectedId) {
        const ejectedRole = players.rows.find((p) => p.player_id === ejectedId)?.role;
        if (ejectedRole === "imposter") {
          awards.push(makeAward("first-blood", "First Blood", "Berhasil eject imposter dalam emergency meeting pertama.", "🩸", player.player_id));
        }
      }
    }
  }

  // Persist; collect only newly inserted rows.
  const newlyAwarded: AchievementAward[] = [];
  for (const award of awards) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO player_achievements (id, player_id, achievement_slug, session_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (player_id, achievement_slug, session_id) DO NOTHING
       RETURNING id`,
      [createId(), award.playerId, award.slug, ctx.sessionId],
    );
    if (inserted.rows.length > 0) {
      newlyAwarded.push(award);
    }
  }

  return newlyAwarded;
}

function makeAward(slug: string, title: string, description: string, icon: string, playerId: string): AchievementAward {
  return { slug, title, description, icon, tone: "achievement", playerId };
}

export async function getPlayerAchievements(playerId: string) {
  const result = await query<{
    slug: string;
    title: string;
    description: string;
    icon: string;
    tone: string;
    awarded_at: Date;
    session_id: string | null;
  }>(
    `SELECT a.slug, a.title, a.description, a.icon, a.tone, pa.awarded_at, pa.session_id
     FROM player_achievements pa
     JOIN achievements a ON a.slug = pa.achievement_slug
     WHERE pa.player_id = $1
     ORDER BY pa.awarded_at DESC`,
    [playerId],
  );
  return result.rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    description: r.description,
    icon: r.icon,
    tone: r.tone,
    awardedAt: r.awarded_at.toISOString(),
    sessionId: r.session_id,
  }));
}
