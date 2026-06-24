// Subscription read endpoint. The billing/checkout/portal routes were removed
// with Stripe; this keeps a read-only endpoint so the frontend can show the
// current tier (set internally via setTier()).
import { Router } from "express"
import { requireAuth, requireCredentialsChanged } from "../auth/middleware"
import { getOwnedWorkspace } from "../repositories/workspaces"
import { getSubscription, isPremium } from "../repositories/subscriptions"

export const subscriptionRouter = Router()
subscriptionRouter.use(requireAuth, requireCredentialsChanged)

subscriptionRouter.get("/:workspaceId/subscription", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const sub = await getSubscription(ws.id)
  res.json({ subscription: sub, premium: isPremium(sub) })
})
