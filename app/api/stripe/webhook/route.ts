import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe/server"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function tierFromStatus(status: Stripe.Subscription.Status): "free" | "unlimited" {
  return status === "active" || status === "trialing" ? "unlimited" : "free"
}

function mapStatus(status: Stripe.Subscription.Status): string {
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

async function upsertSubscription(
  workspaceId: string,
  subscription: Stripe.Subscription,
  customerId: string
) {
  const supabase = createServiceClient()
  const status = mapStatus(subscription.status)
  const tier = tierFromStatus(subscription.status)
  // Stripe's latest API exposes period end on the item, not the subscription root.
  const periodEndSec = subscription.items?.data?.[0]?.current_period_end
  const currentPeriodEnd = periodEndSec
    ? new Date(periodEndSec * 1000).toISOString()
    : null

  const { error } = await supabase.from("subscriptions").upsert(
    {
      workspace_id: workspaceId,
      tier,
      status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" }
  )

  if (error) {
    console.error("Failed to upsert subscription:", error.message)
    throw error
  }
}

async function markCanceled(subscriptionId: string) {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from("subscriptions")
    .update({
      tier: "free",
      status: "canceled",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId)

  if (error) {
    console.error("Failed to mark canceled:", error.message)
    throw error
  }
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature")
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 })
  }

  const stripe = getStripe()
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature"
    console.error("Webhook signature verification failed:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const workspaceId =
          (session.metadata?.workspace_id as string | undefined) ||
          (session.client_reference_id as string | undefined)
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id

        if (workspaceId && subscriptionId && customerId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          await upsertSubscription(workspaceId, subscription, customerId)
        }
        break
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        const workspaceId = subscription.metadata?.workspace_id as string | undefined
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id

        if (workspaceId && customerId) {
          await upsertSubscription(workspaceId, subscription, customerId)
        } else {
          console.warn("Subscription event missing workspace_id metadata", subscription.id)
        }
        break
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        await markCanceled(subscription.id)
        break
      }
      default:
        break
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error"
    console.error("Webhook handler error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
