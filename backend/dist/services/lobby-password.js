import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { query } from "../db.js";
const scrypt = promisify(scryptCb);
const HASH_KEY_LEN = 64;
export async function hashPassword(password) {
    // Hash format: scrypt$<salt-hex>$<key-hex>
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, HASH_KEY_LEN);
    return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function comparePassword(password, stored) {
    // Backwards-compat: also accept legacy plain-sha256 hashes (length 64 hex chars).
    if (/^[a-f0-9]{64}$/i.test(stored)) {
        const sha = createHash("sha256").update(password).digest("hex");
        return sha === stored.toLowerCase();
    }
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt")
        return false;
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const candidate = await scrypt(password, salt, expected.length);
    if (candidate.length !== expected.length)
        return false;
    return timingSafeEqual(candidate, expected);
}
export async function verifyLobbyPassword(lobbyId, submitted) {
    const result = await query(`SELECT password_hash, is_private FROM lobbies WHERE id = $1`, [lobbyId]);
    const row = result.rows[0];
    if (!row)
        return false;
    // Public lobby with no password set → always allow.
    if (!row.is_private || !row.password_hash)
        return true;
    return comparePassword(submitted, row.password_hash);
}
