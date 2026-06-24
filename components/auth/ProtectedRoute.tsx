"use client"

import React, { useEffect } from "react"
import { useAuth } from "@/app/providers/AuthProvider"
import { usePathname, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Loader2 className="w-8 h-8 text-primary" />
        </motion.div>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </motion.div>
    </div>
  )
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, mustChange, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    // Not logged in -> login.
    if (!user) {
      router.replace("/auth/login")
      return
    }
    // Logged in but must change initial credentials (Jenkins-style) -> force it.
    if (mustChange && pathname !== "/auth/change-credentials") {
      router.replace("/auth/change-credentials")
    }
  }, [user, mustChange, loading, pathname, router])

  // Block render until auth resolves / redirects fire.
  if (loading || !user || (mustChange && pathname !== "/auth/change-credentials")) {
    return <FullScreenLoader />
  }

  return <>{children}</>
}
