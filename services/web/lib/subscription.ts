// Subscription data + feature-gate logic. Rewired from Supabase to core-api.
// Stripe is gone — tier is set internally server-side; this just reads it.

import { subscriptionApi } from "./api-client"

export type Tier = "free" | "unlimited"
export type SubscriptionStatus = "inactive" | "active" | "trialing" | "past_due" | "canceled" | "incomplete"

export interface Subscription {
  workspaceId: string
  tier: Tier
  status: SubscriptionStatus
}

export const FREE_SCAN_LIMIT = 1

export type PremiumFeature = "rbac-map" | "pdf-export" | "full-findings" | "unlimited-scans"

export const DEFAULT_FREE_SUBSCRIPTION: Omit<Subscription, "workspaceId"> = {
  tier: "free",
  status: "inactive",
}

const subCache = new Map<string, { sub: Subscription; ts: number }>()
const CACHE_TTL_MS = 5_000

export function invalidateSubscriptionCache(workspaceId?: string): void {
  if (workspaceId) subCache.delete(workspaceId)
  else subCache.clear()
}

export async function getSubscription(workspaceId: string): Promise<Subscription> {
  if (!workspaceId) return { workspaceId: "", ...DEFAULT_FREE_SUBSCRIPTION }

  const cached = subCache.get(workspaceId)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.sub

  let sub: Subscription
  try {
    const res = await subscriptionApi.get(workspaceId)
    sub = {
      workspaceId,
      tier: (res.subscription.tier as Tier) ?? "free",
      status: (res.subscription.status as SubscriptionStatus) ?? "inactive",
    }
  } catch {
    sub = { workspaceId, ...DEFAULT_FREE_SUBSCRIPTION }
  }

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

export function canUseFeature(sub: Subscription | null | undefined, _feature: PremiumFeature): boolean {
  return isPremiumSubscription(sub)
}

export function notifySubscriptionChanged(workspaceId?: string): void {
  invalidateSubscriptionCache(workspaceId)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("kubescope-subscription-updated", { detail: { workspaceId } }))
  }
}

export class ScanLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Free plan allows only ${limit} scan${limit === 1 ? "" : "s"}. Upgrade to Unlimited for unlimited scans.`)
    this.name = "ScanLimitError"
  }
}
