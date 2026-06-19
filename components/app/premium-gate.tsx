"use client"

import { useState, type ReactNode } from "react"
import { Lock, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UpgradeDialog } from "./upgrade-dialog"
import { useSubscription } from "@/hooks/use-subscription"
import { useWorkspace } from "./app-shell"

interface PremiumGateProps {
  children: ReactNode
  title?: string
  description?: string
  /** When true, skip the gate (e.g. demo mode). */
  bypass?: boolean
}

/**
 * Soft-gate wrapper: renders children with a blur overlay and upgrade CTA
 * when the active workspace is not on the Unlimited tier.
 */
export function PremiumGate({
  children,
  title = "Premium Feature",
  description = "Upgrade to KubeScope Unlimited to unlock this feature.",
  bypass = false,
}: PremiumGateProps) {
  const { activeWorkspace } = useWorkspace()
  const { isPremium, isLoading } = useSubscription(activeWorkspace?.id || null)
  const [dialogOpen, setDialogOpen] = useState(false)

  if (bypass || isPremium || isLoading) {
    return <>{children}</>
  }

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none select-none blur-md opacity-60"
      >
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-border/60 bg-background/95 backdrop-blur-sm shadow-xl p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
          </div>
          <h2 className="mt-4 text-xl font-semibold">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>

          <Button
            onClick={() => setDialogOpen(true)}
            className="mt-6 bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Upgrade to Unlimited
          </Button>
        </div>
      </div>

      <UpgradeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={activeWorkspace?.id || null}
      />
    </div>
  )
}
