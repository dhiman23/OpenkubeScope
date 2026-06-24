import Stripe from "stripe"

let cached: Stripe | null = null

export function getStripe(): Stripe {
  if (cached) return cached
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) throw new Error("Missing STRIPE_SECRET_KEY environment variable")
  cached = new Stripe(secret, { typescript: true })
  return cached
}

// Stripe's status string-union. Typed as string to avoid coupling to the SDK's
// namespace export, which varies across @types versions.
export type StripeSubStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "unpaid" | "incomplete_expired" | (string & {})

export function tierFromStatus(status: StripeSubStatus): "free" | "unlimited" {
  return status === "active" || status === "trialing" ? "unlimited" : "free"
}

export function mapStatus(status: StripeSubStatus): string {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "incomplete":
      return status
    case "unpaid":
    case "incomplete_expired":
      return "canceled"
    default:
      return "inactive"
  }
}
