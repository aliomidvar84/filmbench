import { createHash, randomBytes } from "node:crypto";

import { requirePool } from "../db.js";

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function newRefreshTokenRaw(): string {
  return randomBytes(48).toString("base64url");
}

export async function storeRefreshToken(
  userId: string,
  raw: string,
  expiresAt: Date,
): Promise<void> {
  const pool = requirePool();
  const tokenHash = hashRefreshToken(raw);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1::uuid, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
}

export async function findUserIdByRefreshToken(
  raw: string,
): Promise<string | null> {
  const pool = requirePool();
  const tokenHash = hashRefreshToken(raw);
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id::text
     FROM refresh_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [tokenHash],
  );
  return rows[0]?.user_id ?? null;
}

export async function revokeRefreshToken(raw: string): Promise<boolean> {
  const pool = requirePool();
  const tokenHash = hashRefreshToken(raw);
  const { rowCount } = await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  );
  return (rowCount ?? 0) > 0;
}

export async function revokeAllRefreshTokensForUser(
  userId: string,
): Promise<void> {
  const pool = requirePool();
  await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = now()
     WHERE user_id = $1::uuid AND revoked_at IS NULL`,
    [userId],
  );
}
