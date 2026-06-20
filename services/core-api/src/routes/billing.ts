import { Router } from "express"
import { requireAuth, requireCredentialsChanged } from "../auth/middleware"
import { getOwnedWorkspace } from "../repositories/workspaces"
import { getSubscription, isPremium, getCustomerIdForWorkspace } from "../repositories/subscriptions"
import { getStripe } from "../lib/stripe"

export const billingRouter = Router()
billingRouter.use(requireAuth, requireCredentialsChanged)

billingRouter.get("/:workspaceId/subscription", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const sub = await getSubscription(ws.id)
  res.json({ subscription: sub, premium: isPremium(sub) })
})

// Create a Stripe Checkout session for the Unlimited plan.
billingRouter.post("/:workspaceId/checkout", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })

  const priceId = process.env.STRIPE_PRICE_ID_UNLIMITED
  if (!priceId) return res.status(500).json({ error: "Stripe price not configured" })

  const siteUrl = process.env.PUBLIC_SITE_URL || req.headers.origin || "http://localhost:3000"

  try {
    const stripe = getStripe()
    const existingCustomer = await getCustomerIdForWorkspace(ws.id)

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer: existingCustomer || undefined,
      customer_email: existingCustomer ? undefined : req.user!.email ?? undefined,
      client_reference_id: ws.id,
      allow_promotion_codes: true,
      subscription_data: { metadata: { workspace_id: ws.id, user_id: req.user!.id } },
      metadata: { workspace_id: ws.id, user_id: req.user!.id },
      success_url: `${siteUrl}/app/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/app/billing?canceled=1`,
    })

    res.json({ url: session.url })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Checkout failed" })
  }
})

// Create a Stripe Billing Portal session.
billingRouter.post("/:workspaceId/portal", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })

  const customerId = await getCustomerIdForWorkspace(ws.id)
  if (!customerId) return res.status(400).json({ error: "No active subscription to manage" })

  const siteUrl = process.env.PUBLIC_SITE_URL || req.headers.origin || "http://localhost:3000"

  try {
    const stripe = getStripe()
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/app/billing`,
    })
    res.json({ url: portal.url })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Portal failed" })
  }
})
