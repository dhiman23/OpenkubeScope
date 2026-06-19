import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getStripe } from "@/lib/stripe/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json().catch(() => ({}))
    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify user owns the workspace.
    const { data: workspace, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("id", workspaceId)
      .eq("user_id", user.id)
      .single()

    if (wsErr || !workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    }

    const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_UNLIMITED
    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price not configured" },
        { status: 500 }
      )
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get("origin") ||
      "http://localhost:3000"

    const stripe = getStripe()

    // Reuse existing customer if this workspace already has one on record.
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer: existingSub?.stripe_customer_id || undefined,
      customer_email: existingSub?.stripe_customer_id ? undefined : user.email,
      client_reference_id: workspaceId,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          workspace_id: workspaceId,
          user_id: user.id,
        },
      },
      metadata: {
        workspace_id: workspaceId,
        user_id: user.id,
      },
      success_url: `${siteUrl}/app/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/app/billing?canceled=1`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("Stripe checkout error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
