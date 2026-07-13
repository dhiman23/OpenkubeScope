// Runs this service's SQL migrations automatically on startup, so a fresh
// database (including a brand-new RDS instance) never needs manual `psql -f`.
//
// Safe by construction, not by tracking a schema_migrations table:
//   - Every migration file under ../../migrations is written idempotently
//     (CREATE SCHEMA/TABLE/INDEX IF NOT EXISTS, ADD/DROP COLUMN IF [NOT] EXISTS,
//     conditional DO blocks for constraints) — re-running an already-applied
//     file is a guaranteed no-op, never an error and never data loss.
//   - Files run in filename order (0001_, 0002_, ...), each inside its own
//     transaction so a mid-file failure can't leave that file half-applied.
// Concurrency: multiple replicas starting at once all call this. A Postgres
// session-level advisory lock (a plain int, scoped to this one service)
// serializes them — the first replica runs every file; the rest block on the
// lock, then run the same already-applied files as harmless no-ops.

import fs from "fs"
import path from "path"
import type { Pool } from "pg"

// Distinct from core-api's and report-service's lock keys so the three
// services don't needlessly block each other's startup on the shared
// Postgres instance.
const ADVISORY_LOCK_KEY = 72002

const MIGRATIONS_DIR = path.join(__dirname, "../../migrations")

export async function runMigrations(pool: Pool): Promise<void> {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`)
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  if (files.length === 0) {
    throw new Error(`No .sql migration files found in ${MIGRATIONS_DIR}`)
  }

  const client = await pool.connect()
  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY])

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
      try {
        await client.query("BEGIN")
        await client.query(sql)
        await client.query("COMMIT")
        console.log(`[migrate] applied ${file}`)
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {})
        throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : err}`)
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => {})
    client.release()
  }
}
