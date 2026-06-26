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

// Billing/Stripe removed — every workspace is treated as Unlimited. This opens
// all premium features (RBAC map, PDF export, full findings) and lifts the
// free-tier scan quota. To reintroduce tiers later, read core.subscriptions
// here instead of returning a fixed unlimited subscription.
export async function getSubscription(workspaceId: string): Promise<Subscription> {
  return { workspaceId, tier: "unlimited", status: "active" }
}

export function isPremium(_sub: Subscription | null | undefined): boolean {
  return true
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
