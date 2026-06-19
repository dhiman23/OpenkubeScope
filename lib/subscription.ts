// Subscription data + feature-gate logic.
// Reads from the public.subscriptions table (workspace-scoped RLS).

import { createClient } from "@/lib/supabase/client"

export type Tier = "free" | "unlimited"
export type SubscriptionStatus =
  | "inactive"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"

export interface Subscription {
  workspaceId: string
  tier: Tier
  status: SubscriptionStatus
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export const FREE_SCAN_LIMIT = 1

// Premium features — used by UI gates and server-side enforcement.
export type PremiumFeature =
  | "rbac-map"
  | "pdf-export"
  | "full-findings"
  | "unlimited-scans"

export const DEFAULT_FREE_SUBSCRIPTION: Omit<Subscription, "workspaceId"> = {
  tier: "free",
  status: "inactive",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
}

// Short TTL cache to avoid refetching during a single render pass / event burst.
const subCache = new Map<string, { sub: Subscription; ts: number }>()
const CACHE_TTL_MS = 5_000

export function invalidateSubscriptionCache(workspaceId?: string): void {
  if (workspaceId) subCache.delete(workspaceId)
  else subCache.clear()
}

export async function getSubscription(workspaceId: string): Promise<Subscription> {
  if (!workspaceId) {
    return { workspaceId: "", ...DEFAULT_FREE_SUBSCRIPTION }
  }

  const cached = subCache.get(workspaceId)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.sub

  const supabase = createClient()
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "workspace_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) {
    console.error("Error fetching subscription:", error.message)
  }

  const sub: Subscription = data
    ? {
        workspaceId: data.workspace_id,
        tier: (data.tier as Tier) ?? "free",
        status: (data.status as SubscriptionStatus) ?? "inactive",
        stripeCustomerId: data.stripe_customer_id,
        stripeSubscriptionId: data.stripe_subscription_id,
        currentPeriodEnd: data.current_period_end,
        cancelAtPeriodEnd: !!data.cancel_at_period_end,
      }
    : { workspaceId, ...DEFAULT_FREE_SUBSCRIPTION }

  subCache.set(workspaceId, { sub, ts: Date.now() })
  return sub
}

export function isPremiumSubscription(sub: Subscription | null | undefined): boolean {
  if (!sub) return false
  if (sub.tier !== "unlimited") return false
  return sub.status === "active" || sub.status === "trialing"
}

export async function isPremium(workspaceId: string): Promise<boolean> {
  return isPremiumSubscription(await getSubscription(workspaceId))
}

export function getScanLimit(sub: Subscription | null | undefined): number {
  return isPremiumSubscription(sub) ? Infinity : FREE_SCAN_LIMIT
}

export function canUseFeature(
  sub: Subscription | null | undefined,
  _feature: PremiumFeature
): boolean {
  // All premium features currently share a single gate (unlimited tier).
  // Split per-feature gating here if pricing tiers expand.
  return isPremiumSubscription(sub)
}

export function notifySubscriptionChanged(workspaceId?: string): void {
  invalidateSubscriptionCache(workspaceId)
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("kubescope-subscription-updated", {
        detail: { workspaceId },
      })
    )
  }
}

export class ScanLimitError extends Error {
  constructor(public readonly limit: number) {
    super(
      `Free plan allows only ${limit} scan${limit === 1 ? "" : "s"}. Upgrade to Unlimited for unlimited scans.`
    )
    this.name = "ScanLimitError"
  }
}
