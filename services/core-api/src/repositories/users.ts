import bcrypt from "bcryptjs"
import { getPool } from "../db"

export interface UserRow {
  id: string
  email: string
  password_hash: string
  created_at: string
}

export async function createUser(email: string, password: string): Promise<{ id: string; email: string }> {
  const pool = getPool()
  const hash = await bcrypt.hash(password, 10)
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO core.users (email, password_hash) VALUES (lower($1), $2) RETURNING id, email`,
    [email, hash],
  )
  return { id: rows[0].id, email: rows[0].email }
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const pool = getPool()
  const { rows } = await pool.query<UserRow>(`SELECT * FROM core.users WHERE email = lower($1)`, [email])
  return rows[0] || null
}

export async function verifyPassword(user: UserRow, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash)
}
