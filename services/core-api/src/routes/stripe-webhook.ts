// Stripe webhook. Mounted with a raw-body parser (signature verification needs
// the exact bytes). Ported from app/api/stripe/webhook/route.ts. Verifies the
// signature before processing, then upserts subscription state in core.
import { Router, raw } from "express"
import type Stripe from "stripe"
import { getStripe, tierFromStatus, mapStatus } from "../lib/stripe"
import { upsertSubscription, markCanceledBySubscriptionId } from "../repositories/subscriptions"

export const stripeWebhookRouter = Router()

async function upsertFromSubscription(workspaceId: string, subscription: Stripe.Subscription, customerId: string) {
  const periodEndSec = subscription.items?.data?.[0]?.current_period_end
  await upsertSubscription({
    workspaceId,
    tier: tierFromStatus(subscription.status),
    status: mapStatus(subscription.status),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
  })
}

stripeWebhookRouter.post("/", raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"]
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !secret) return res.status(400).json({ error: "Missing signature or secret" })

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    // req.body is a Buffer here (raw parser).
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig as string, secret)
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid signature" })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const workspaceId = (session.metadata?.workspace_id as string | undefined) || (session.client_reference_id as string | undefined)
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id
        if (workspaceId && subscriptionId && customerId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          await upsertFromSubscription(workspaceId, subscription, customerId)
        }
        break
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        const workspaceId = subscription.metadata?.workspace_id as string | undefined
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id
        if (workspaceId && customerId) await upsertFromSubscription(workspaceId, subscription, customerId)
        break
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        await markCanceledBySubscriptionId(subscription.id)
        break
      }
      default:
        break
    }
    res.json({ received: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Handler error" })
  }
})
