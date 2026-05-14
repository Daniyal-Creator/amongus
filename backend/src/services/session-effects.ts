import { createId, query } from "../db.js";

export async function appendSystemMessage(sessionId: string, message: string) {
  await query(
    `
      INSERT INTO session_chat_messages (id, session_id, player_id, user_name, color, message)
      VALUES ($1, $2, NULL, 'system', '#f0a92e', $3)
    `,
    [createId(), sessionId, message],
  );
}

export async function appendImposterMessage(sessionId: string, message: string) {
  await query(
    `
      INSERT INTO session_imposter_messages (id, session_id, user_name, color, message)
      VALUES ($1, $2, 'ghost.ai', '#ff688b', $3)
    `,
    [createId(), sessionId, message],
  );
}
