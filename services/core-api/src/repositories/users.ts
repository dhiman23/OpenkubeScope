import bcrypt from "bcryptjs"
import { getPool } from "../db"

export interface UserRow {
  id: string
  email: string | null
  username: string | null
  password_hash: string
  must_change_credentials: boolean
  created_at: string
}

export const BOOTSTRAP_ADMIN_USERNAME = "admin"
const BOOTSTRAP_ADMIN_PASSWORD = "admin"

// Jenkins-style first-boot seed: if there are no users at all, create the
// admin/admin account flagged to force a credential change on first login.
// Idempotent — safe to call on every startup.
export async function ensureBootstrapAdmin(): Promise<void> {
  const pool = getPool()
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM core.users`)
  if (Number(rows[0].count) > 0) return

  const hash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 10)
  await pool.query(
    `INSERT INTO core.users (username, email, password_hash, must_change_credentials)
     VALUES ($1, NULL, $2, TRUE)
     ON CONFLICT DO NOTHING`,
    [BOOTSTRAP_ADMIN_USERNAME, hash],
  )
  console.log(`Seeded bootstrap admin (username "${BOOTSTRAP_ADMIN_USERNAME}", password "${BOOTSTRAP_ADMIN_PASSWORD}") — change on first login`)
}

// Email/password signup (self-service accounts). Username defaults to null;
// these users log in by email.
export async function createUser(email: string, password: string): Promise<{ id: string; email: string | null; username: string | null }> {
  const pool = getPool()
  const hash = await bcrypt.hash(password, 10)
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO core.users (email, password_hash) VALUES (lower($1), $2) RETURNING id, email, username`,
    [email, hash],
  )
  return { id: rows[0].id, email: rows[0].email, username: rows[0].username }
}

// Look up by username OR email (case-insensitive) — supports both the bootstrap
// admin (username) and self-service users (email).
export async function findUserByIdentifier(identifier: string): Promise<UserRow | null> {
  const pool = getPool()
  const { rows } = await pool.query<UserRow>(
    `SELECT * FROM core.users WHERE lower(username) = lower($1) OR email = lower($1) LIMIT 1`,
    [identifier],
  )
  return rows[0] || null
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const pool = getPool()
  const { rows } = await pool.query<UserRow>(`SELECT * FROM core.users WHERE email = lower($1)`, [email])
  return rows[0] || null
}

export async function verifyPassword(user: UserRow, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash)
}

export async function isUsernameTaken(username: string, excludeUserId: string): Promise<boolean> {
  const pool = getPool()
  const { rows } = await pool.query(`SELECT 1 FROM core.users WHERE lower(username) = lower($1) AND id <> $2 LIMIT 1`, [username, excludeUserId])
  return rows.length > 0
}

// Forced credential change: set new username + password, clear the flag.
export async function updateCredentials(userId: string, newUsername: string, newPassword: string): Promise<void> {
  const pool = getPool()
  const hash = await bcrypt.hash(newPassword, 10)
  await pool.query(
    `UPDATE core.users SET username = $2, password_hash = $3, must_change_credentials = FALSE WHERE id = $1`,
    [userId, newUsername, hash],
  )
}
