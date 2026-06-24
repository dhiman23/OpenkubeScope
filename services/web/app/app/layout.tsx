import React from "react"
import { AppShell } from "@/components/app/app-shell"
import { ProtectedRoute } from "@/components/auth/ProtectedRoute"

// Gate the authenticated app section only — landing + auth pages stay public.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}
