"use client"

import { useState } from "react"
import { Check, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

interface UpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | null
  title?: string
  description?: string
}

const UNLIMITED_BENEFITS = [
  "Unlimited RBAC scans",
  "RBAC Map + permission visualization",
  "Full risk findings breakdown",
  "Premium PDF report exports",
  "Priority updates & upcoming integrations",
]

export function UpgradeDialog({
  open,
  onOpenChange,
  workspaceId,
  title = "Upgrade to KubeScope Unlimited",
  description = "Unlock unlimited scans and premium features for your workspace.",
}: UpgradeDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleUpgrade = async () => {
    if (!workspaceId) {
      toast({
        title: "No workspace selected",
        description: "Please select a workspace before upgrading.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })

      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to start checkout")
      }
      window.location.href = data.url
    } catch (err) {
      console.error("Checkout error:", err)
      toast({
        title: "Checkout failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-cyan-500/10">
              <Sparkles className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-baseline gap-2 mb-5">
            <span className="text-4xl font-bold text-cyan-600 dark:text-cyan-400">$15</span>
            <span className="text-muted-foreground">/month</span>
          </div>

          <ul className="space-y-3">
            {UNLIMITED_BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm">
                <Check className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Maybe later
          </Button>
          <Button
            onClick={handleUpgrade}
            disabled={isLoading || !workspaceId}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Redirecting…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Upgrade to Unlimited
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
