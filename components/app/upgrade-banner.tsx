"use client"

import { useEffect, useState } from "react"
import { Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UpgradeDialog } from "./upgrade-dialog"
import { useWorkspace } from "./app-shell"
import { useSubscription } from "@/hooks/use-subscription"

const DISMISS_KEY = "kubescope-upgrade-banner-dismissed"

export function UpgradeBanner() {
  const { activeWorkspace } = useWorkspace()
  const { isPremium, isLoading } = useSubscription(activeWorkspace?.id || null)
  const [dismissed, setDismissed] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1")
  }, [])

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1")
    setDismissed(true)
  }

  if (isLoading || isPremium || dismissed || !activeWorkspace?.id) return null

  return (
    <>
      <div className="relative rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent p-4 flex items-center gap-4">
        <div className="p-2 rounded-lg bg-cyan-500/15 shrink-0">
          <Sparkles className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Unlock unlimited scans and premium features</p>
          <p className="text-sm text-muted-foreground">
            You're on the Free plan. Upgrade to Unlimited for $15/month to scan as many clusters as you need.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0"
          size="sm"
        >
          Upgrade
        </Button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <UpgradeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={activeWorkspace.id}
      />
    </>
  )
}
