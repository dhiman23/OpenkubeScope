import { Pool } from "pg"

// core-api owns the `core` schema (see migrations/0001_create_core.sql).
// Lazily built so importing this module never opens a connection — tests and
// CLI paths can import it without a live database.
let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable")
  }

  // DATABASE_SSL=false is the local/compose escape hatch (plain Postgres has no
  // TLS). Otherwise TLS is on, but rejectUnauthorized:false skips CA validation
  // so the RDS certificate chain does not need to be bundled — this encrypts
  // the connection without authenticating the server.
  // max defaults to 10: each replica holds its own pool, so raise it only
  // against the RDS max_connections budget across all replicas.
  pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX || 10),
  })

  return pool
}

// Nulls the pool so a later getPool() rebuilds instead of handing back a closed
// one — matters on SIGTERM paths that may still touch the DB after shutdown.
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
