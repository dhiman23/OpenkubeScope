// Ported from lib/subscription.ts. Owns core.subscriptions. Premium gate +
// scan-limit logic lives here (it was deliberately NOT ported into
// rbac-scanner-service — billing is core-api's domain).

import { getPool } from "../db"

export type Tier = "free" | "unlimited"

export interface Subscription {
  workspaceId: string
  tier: Tier
  status: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export const FREE_SCAN_LIMIT = 1

const DEFAULT_FREE: Omit<Subscription, "workspaceId"> = {
  tier: "free",
  status: "inactive",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
}

interface SubRow {
  workspace_id: string
  tier: string
  status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export async function getSubscription(workspaceId: string): Promise<Subscription> {
  const pool = getPool()
  const { rows } = await pool.query<SubRow>(
    `SELECT workspace_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end
       FROM core.subscriptions WHERE workspace_id = $1`,
    [workspaceId],
  )
  const data = rows[0]
  if (!data) return { workspaceId, ...DEFAULT_FREE }
  return {
    workspaceId: data.workspace_id,
    tier: (data.tier as Tier) ?? "free",
    status: data.status ?? "inactive",
    stripeCustomerId: data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: !!data.cancel_at_period_end,
  }
}

export function isPremium(sub: Subscription | null | undefined): boolean {
  if (!sub) return false
  if (sub.tier !== "unlimited") return false
  return sub.status === "active" || sub.status === "trialing"
}

export async function upsertSubscription(params: {
  workspaceId: string
  tier: Tier
  status: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}): Promise<void> {
  const pool = getPool()
  await pool.query(
    `INSERT INTO core.subscriptions
       (workspace_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (workspace_id) DO UPDATE SET
       tier = EXCLUDED.tier, status = EXCLUDED.status,
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end`,
    [
      params.workspaceId,
      params.tier,
      params.status,
      params.stripeCustomerId,
      params.stripeSubscriptionId,
      params.currentPeriodEnd,
      params.cancelAtPeriodEnd,
    ],
  )
}

export async function markCanceledBySubscriptionId(subscriptionId: string): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE core.subscriptions SET tier = 'free', status = 'canceled', cancel_at_period_end = FALSE
      WHERE stripe_subscription_id = $1`,
    [subscriptionId],
  )
}

export async function getCustomerIdForWorkspace(workspaceId: string): Promise<string | null> {
  const sub = await getSubscription(workspaceId)
  return sub.stripeCustomerId
}
