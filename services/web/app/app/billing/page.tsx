"use client"

import { useEffect, useState, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
  Shield,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useWorkspace } from "@/components/app/app-shell"
import { useSubscription } from "@/hooks/use-subscription"
import { UpgradeDialog } from "@/components/app/upgrade-dialog"
import { useToast } from "@/hooks/use-toast"
import { notifySubscriptionChanged } from "@/lib/subscription"

const UNLIMITED_FEATURES = [
  "Unlimited RBAC scans",
  "RBAC Map + permission visualization",
  "Full risk findings breakdown",
  "Premium PDF report exports",
  "Priority updates & upcoming integrations",
]

const BASE_FEATURES = [
  "1 lifetime RBAC scan",
  "RBAC Viewer + basic risk highlights",
  "Export basic findings (CSV)",
]

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default function BillingPage() {
  const searchParams = useSearchParams()
  const { activeWorkspace } = useWorkspace()
  const { subscription, isPremium, isLoading, refresh } = useSubscription(activeWorkspace?.id || null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const { toast } = useToast()

  // Auto-open upgrade dialog if ?upgrade=1 is present (from landing "Upgrade to Unlimited" CTA)
  useEffect(() => {
    if (searchParams.get("upgrade") === "1" && !isPremium && activeWorkspace?.id) {
      setUpgradeOpen(true)
    }
  }, [searchParams, isPremium, activeWorkspace?.id])

  // Handle success redirect from Stripe
  useEffect(() => {
    if (searchParams.get("success") === "1") {
      toast({
        title: "Welcome to Unlimited!",
        description: "Your subscription is active. It may take a few seconds to reflect.",
      })
      // Poll a couple times in case the webhook hasn't landed yet.
      const timers = [2000, 5000, 10000].map((ms) =>
        setTimeout(() => {
          notifySubscriptionChanged(activeWorkspace?.id)
          void refresh()
        }, ms)
      )
      return () => timers.forEach(clearTimeout)
    }
    if (searchParams.get("canceled") === "1") {
      toast({
        title: "Checkout canceled",
        description: "No changes were made to your subscription.",
      })
    }
  }, [searchParams, toast, refresh, activeWorkspace?.id])

  const handleManage = async () => {
    if (!activeWorkspace?.id) return
    setPortalLoading(true)
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: activeWorkspace.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || "Failed to open portal")
      window.location.href = data.url
    } catch (err) {
      toast({
        title: "Could not open billing portal",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
      setPortalLoading(false)
    }
  }

  const statusLabel = useMemo(() => {
    if (!subscription) return "Free"
    if (isPremium) return "Unlimited"
    if (subscription.status === "past_due") return "Past due"
    if (subscription.status === "canceled") return "Canceled"
    return "Free"
  }, [subscription, isPremium])

  const renewalLabel = isPremium ? "Unlimited plan active" : "No active subscription"

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your KubeScope subscription and billing details.
        </p>
      </div>

      {/* Current plan card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10">
                <Shield className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <CardTitle>Current plan</CardTitle>
                <CardDescription>
                  {activeWorkspace ? `Workspace: ${activeWorkspace.name}` : "No workspace selected"}
                </CardDescription>
              </div>
            </div>
            <Badge
              variant={isPremium ? "default" : "secondary"}
              className={
                isPremium
                  ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                  : undefined
              }
            >
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6 items-center justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">
                  {isPremium ? "$15" : "$0"}
                </span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{renewalLabel}</p>
            </div>

            <div className="flex gap-3">
              {isPremium ? (
                <Button onClick={handleManage} disabled={portalLoading || isLoading}>
                  {portalLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Opening…
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Manage Subscription
                      <ExternalLink className="h-3.5 w-3.5 ml-2 opacity-70" />
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => setUpgradeOpen(true)}
                  disabled={!activeWorkspace?.id || isLoading}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Upgrade to Unlimited
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan comparison */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className={!isPremium ? "border-cyan-500/40" : undefined}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>KubeScope Base</CardTitle>
              {!isPremium && <Badge variant="secondary">Active</Badge>}
            </div>
            <CardDescription>Perfect for individuals and learning</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-3xl font-bold">Free</span>
            </div>
            <ul className="space-y-3">
              {BASE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Check className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className={isPremium ? "border-cyan-500/40" : "border-cyan-500/20"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>KubeScope Unlimited</CardTitle>
              {isPremium ? (
                <Badge className="bg-cyan-600 hover:bg-cyan-700 text-white">Active</Badge>
              ) : (
                <Badge variant="secondary">Recommended</Badge>
              )}
            </div>
            <CardDescription>For teams and production clusters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">$15</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <ul className="space-y-3">
              {UNLIMITED_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Check className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Payments are processed securely by Stripe. See our{" "}
        <Link href="/" className="underline hover:text-foreground">
          pricing page
        </Link>{" "}
        for full feature comparison.
      </p>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        workspaceId={activeWorkspace?.id || null}
      />
    </div>
  )
}
