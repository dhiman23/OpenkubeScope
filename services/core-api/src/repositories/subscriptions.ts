// Owns core.subscriptions. Premium gate + scan-limit logic lives here (it was
// deliberately NOT ported into rbac-scanner-service — quota is core-api's
// domain). Stripe billing has been removed: a workspace's tier is set
// internally (e.g. by an admin/seat process) rather than via a payment provider.

import { getPool } from "../db"

export type Tier = "free" | "unlimited"

export interface Subscription {
  workspaceId: string
  tier: Tier
  status: string
}

export const FREE_SCAN_LIMIT = 1

const DEFAULT_FREE: Omit<Subscription, "workspaceId"> = {
  tier: "free",
  status: "inactive",
}

interface SubRow {
  workspace_id: string
  tier: string
  status: string
}

export async function getSubscription(workspaceId: string): Promise<Subscription> {
  const pool = getPool()
  const { rows } = await pool.query<SubRow>(
    `SELECT workspace_id, tier, status FROM core.subscriptions WHERE workspace_id = $1`,
    [workspaceId],
  )
  const data = rows[0]
  if (!data) return { workspaceId, ...DEFAULT_FREE }
  return {
    workspaceId: data.workspace_id,
    tier: (data.tier as Tier) ?? "free",
    status: data.status ?? "inactive",
  }
}

export function isPremium(sub: Subscription | null | undefined): boolean {
  if (!sub) return false
  if (sub.tier !== "unlimited") return false
  return sub.status === "active" || sub.status === "trialing"
}

// Set a workspace's tier internally (no payment provider). Used by an
// admin/provisioning path to grant the unlimited tier.
export async function setTier(workspaceId: string, tier: Tier, status = "active"): Promise<void> {
  const pool = getPool()
  await pool.query(
    `INSERT INTO core.subscriptions (workspace_id, tier, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id) DO UPDATE SET tier = EXCLUDED.tier, status = EXCLUDED.status`,
    [workspaceId, tier, status],
  )
}
