import Stripe from "stripe"

let cachedStripe: Stripe | null = null

export function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable")
  }

  cachedStripe = new Stripe(secret, {
    // Uses the SDK's pinned default API version.
    typescript: true,
  })
  return cachedStripe
}
