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

    // Confirm ownership and pull the stripe customer id.
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("user_id", user.id)
      .single()

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    }

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (!sub?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No active subscription to manage" },
        { status: 400 }
      )
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get("origin") ||
      "http://localhost:3000"

    const stripe = getStripe()
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${siteUrl}/app/billing`,
    })

    return NextResponse.json({ url: portal.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("Stripe portal error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
