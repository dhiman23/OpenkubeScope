"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Server,
  Users,
  Map,
  AlertTriangle,
  FileText,
  Settings,
  CreditCard,
} from "lucide-react"
import { useState, useEffect } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useSidebar } from "./app-shell"
import { useAuth } from "@/app/providers/AuthProvider"
import { getActiveWorkspace, type Workspace } from "@/lib/workspace-manager"
import { getActiveScan } from "@/lib/rbac-scanner"
import { demoMetrics } from "@/lib/demo-data"

const navItems = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard },
  { label: "Clusters", href: "/app/clusters", icon: Server },
  { label: "RBAC Viewer", href: "/app/rbac-viewer", icon: Users },
  { label: "RBAC Map", href: "/app/rbac-map", icon: Map },
  { label: "Risk Findings", href: "/app/risk-findings", icon: AlertTriangle },
  { label: "Reports", href: "/app/reports", icon: FileText },
  { label: "Billing", href: "/app/billing", icon: CreditCard },
  { label: "Settings", href: "/app/settings", icon: Settings },
]

 export function AppSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  const { isCollapsed } = useSidebar()
  const [riskCount, setRiskCount] = useState(0)
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const { user } = useAuth()

  // Function to update risk count from active scan
  const updateRiskCount = async (workspaceId?: string) => {
    // If demo mode, use demo risk count
    if (isDemo) {
      const demoTotal = demoMetrics.criticalRisks + demoMetrics.highRisks + demoMetrics.mediumRisks + demoMetrics.lowRisks
      setRiskCount(demoTotal)
      return
    }

    const active = workspaceId 
      ? { id: workspaceId } 
      : await getActiveWorkspace()
    
    if (!active) {
      setRiskCount(0)
      return
    }
    
    const activeScan = await getActiveScan(active.id)
    
    if (activeScan && activeScan.riskCounts) {
      const total = (activeScan.riskCounts.critical || 0) + 
                   (activeScan.riskCounts.high || 0) + 
                   (activeScan.riskCounts.medium || 0) + 
                   (activeScan.riskCounts.low || 0)
      setRiskCount(total)
    } else {
      setRiskCount(0)
    }
  }

  useEffect(() => {
    // Function to load active workspace and risk count
    const loadWorkspaceData = async () => {
      // If demo mode, skip workspace loading
      if (isDemo) {
        await updateRiskCount()
        return
      }

      const active = await getActiveWorkspace()
      setActiveWorkspace(active)
      if (active) {
        await updateRiskCount(active.id)
      }
    }
    
    loadWorkspaceData()

    // Listen for workspace changes
    const handleWorkspaceChange = async (e: Event) => {
      const customEvent = e as CustomEvent<{ workspaceId?: string }>
      const active = await getActiveWorkspace()
      setActiveWorkspace(active)
      await updateRiskCount(customEvent.detail?.workspaceId || active?.id)
    }
    
    // Listen for scan updates (reload risk count)
    const handleScanUpdate = async () => {
      await updateRiskCount()
    }
    
    window.addEventListener("kubescope-workspace-changed", handleWorkspaceChange)
    window.addEventListener("kubescope-scan-updated", handleScanUpdate)
    
    return () => {
      window.removeEventListener("kubescope-workspace-changed", handleWorkspaceChange)
      window.removeEventListener("kubescope-scan-updated", handleScanUpdate)
    }
  }, [isDemo])

  return (
    <motion.aside 
      animate={{ width: isCollapsed ? 80 : 256 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="fixed left-0 top-0 bottom-0 bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden z-50"
    >
      {/* Logo */}
      <div className="p-6 flex items-center justify-between gap-2">
        <Link href="/app" className={cn(
          "flex items-center gap-3 transition-opacity flex-1",
          isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
        )}>
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <img src="/kubescope-icon.png" alt="KubeScope" className="w-8 h-8 logo-img" />
          </div>
          <span className="font-semibold text-lg text-sidebar-foreground">
            <span className="text-cyan-500">Kube</span>Scope
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/app" && pathname.startsWith(item.href))
          const Icon = item.icon
          
          // Add demo param to hrefs when in demo mode
          const href = isDemo ? `${item.href}?demo=true` : item.href
          
          return (
            <Link key={item.href} href={href}>
              <motion.div
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-xl bg-sidebar-primary"
                    layoutId="activeNav"
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
                <Icon className={cn(
                  "relative z-10 w-5 h-5 shrink-0",
                  isActive ? "text-sidebar-primary-foreground" : ""
                )} />
                {!isCollapsed && (
                  <span className="relative z-10">{item.label}</span>
                )}
                {!isCollapsed && item.label === "Risk Findings" && (
                  <span className={cn(
                    "relative z-10 ml-auto px-2 py-0.5 text-xs rounded-full",
                    isActive 
                      ? "bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground" 
                      : "bg-destructive/10 text-destructive"
                  )}>
                    {riskCount || 0}
                  </span>
                )}
              </motion.div>
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-sidebar-border">
        <div className={cn(
          "flex items-center gap-3 px-2",
          isCollapsed ? "justify-center" : ""
        )}>
          <Avatar className="h-9 w-9 shrink-0">
            {user?.user_metadata?.avatar_url && (
              <AvatarImage src={user.user_metadata.avatar_url || "/placeholder.svg"} alt={user.user_metadata.full_name || user.email || "User"} />
            )}
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-sm">
              {user?.user_metadata?.full_name
                ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
                : user?.email?.[0].toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.user_metadata?.full_name || user?.email || "User"}
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {user?.email}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  )
}
