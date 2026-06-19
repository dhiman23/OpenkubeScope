"use client"

import { useCallback, useEffect, useState } from "react"
import {
  getSubscription,
  isPremiumSubscription,
  type Subscription,
  DEFAULT_FREE_SUBSCRIPTION,
} from "@/lib/subscription"

export interface UseSubscriptionResult {
  subscription: Subscription | null
  isPremium: boolean
  isLoading: boolean
  refresh: () => Promise<void>
}

export function useSubscription(workspaceId: string | null | undefined): UseSubscriptionResult {
  const [subscription, setSubscription] = useState<Subscription | null>(
    workspaceId ? { workspaceId, ...DEFAULT_FREE_SUBSCRIPTION } : null
  )
  const [isLoading, setIsLoading] = useState(!!workspaceId)

  const load = useCallback(async () => {
    if (!workspaceId) {
      setSubscription(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const sub = await getSubscription(workspaceId)
      setSubscription(sub)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!workspaceId) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ workspaceId?: string }>).detail
      if (!detail?.workspaceId || detail.workspaceId === workspaceId) {
        void load()
      }
    }
    window.addEventListener("kubescope-subscription-updated", handler)
    return () => window.removeEventListener("kubescope-subscription-updated", handler)
  }, [workspaceId, load])

  return {
    subscription,
    isPremium: isPremiumSubscription(subscription),
    isLoading,
    refresh: load,
  }
}
