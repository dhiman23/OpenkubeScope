import React from "react"
import { DocsSidebar } from "@/components/docs/docs-sidebar"

export const metadata = {
  title: "Documentation - KubeScope",
  description: "Learn how to use KubeScope to audit and visualize your Kubernetes RBAC permissions.",
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <DocsSidebar />
        <main className="flex-1 lg:pl-72">
          {children}
        </main>
      </div>
    </div>
  )
}
