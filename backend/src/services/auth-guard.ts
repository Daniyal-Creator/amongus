import { query } from "../db.js";

export type SessionRoleInfo = {
  playerId: string;
  name: string;
  color: string;
  role: "civilian" | "imposter";
  status: string;
  ejected: boolean;
};

/**
 * Server-side role validation. Pulls the player's role from the DB
 * (never trusts the client) and reports whether the player is alive
 * in the session. Use this before any role-gated action.
 */
export async function loadSessionRole(
  sessionId: string,
  playerId: string | undefined | null,
): Promise<SessionRoleInfo | null> {
  if (!playerId) return null;
  const result = await query<{
    role: "civilian" | "imposter";
    status: string;
    name: string;
    color: string;
  }>(
    `
      SELECT sp.role, sp.status, lp.name, lp.color
      FROM session_players sp
      JOIN lobby_players lp ON lp.id = sp.player_id
      WHERE sp.session_id = $1 AND sp.player_id = $2
    `,
    [sessionId, playerId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    playerId,
    name: row.name,
    color: row.color,
    role: row.role,
    status: row.status,
    ejected: row.status === "ejected after meeting",
  };
}

export class RoleViolation extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

export function assertImposter(info: SessionRoleInfo | null): asserts info is SessionRoleInfo {
  if (!info) throw new RoleViolation("not in session");
  if (info.ejected) throw new RoleViolation("ejected");
  if (info.role !== "imposter") throw new RoleViolation("imposter only");
}

export function assertAlive(info: SessionRoleInfo | null): asserts info is SessionRoleInfo {
  if (!info) throw new RoleViolation("not in session");
  if (info.ejected) throw new RoleViolation("ejected");
}
