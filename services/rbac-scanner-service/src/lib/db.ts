import { Pool } from "pg"

// Direct connection to the RDS Postgres instance. This service owns the
// `scanner` schema (see migrations/0001_create_scans.sql) — every query
// must target scanner.<table>, never another service's schema.
let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable")
  }

  pool = new Pool({
    connectionString,
    // RDS requires TLS by default on most instance configs; allow opting
    // out for local/dev Postgres via DATABASE_SSL=false.
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX || 10),
  })

  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
