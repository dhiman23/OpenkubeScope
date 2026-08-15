"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  Boxes,
  CreditCard,
  FileText,
  GitCompare,
  LayoutDashboard,
  Layers,
  Map,
  Server,
  Settings,
  Upload,
  Users,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useSidebar } from "./app-shell"
import { useAuth } from "@/app/providers/AuthProvider"
import {
  getAnalysisNavServerState,
  getAnalysisNavState,
  subscribeAnalysisNav,
} from "@/lib/analysis-nav-store"

interface NavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  badge?: number
  exact?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

// Fleet mode: what you manage. Analysis destinations are deliberately absent —
// they do not exist without a scan, and offering them here is what produced
// "which scan am I looking at?" in the first place.
const FLEET_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Home", href: "/app", icon: LayoutDashboard, exact: true },
      { label: "Clusters", href: "/app/clusters", icon: Server },
      { label: "Reports", href: "/app/reports", icon: FileText },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", href: "/app/settings", icon: Settings },
      { label: "Billing", href: "/app/billing", icon: CreditCard },
    ],
  },
]

function analysisGroups(scanId: string, badge: number): NavGroup[] {
  const base = `/app/scans/${scanId}`
  return [
    {
      title: "Analysis",
      items: [
        { label: "Dashboard", href: base, icon: LayoutDashboard, exact: true },
        // Findings sits directly under Dashboard: "what should I fix first?"
        // is the dominant job on this screen.
        { label: "Findings", href: `${base}/findings`, icon: AlertTriangle, badge },
        { label: "RBAC Viewer", href: `${base}/viewer`, icon: Users },
        { label: "RBAC Map", href: `${base}/map`, icon: Map },
        { label: "Inventory", href: `${base}/inventory`, icon: Boxes },
        { label: "Namespaces", href: `${base}/namespaces`, icon: Layers },
        { label: "Reports", href: `${base}/reports`, icon: FileText },
      ],
    },
    {
      title: "Snapshot",
      items: [{ label: "Compare", href: `${base}/compare`, icon: GitCompare }],
    },
  ]
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function AppSidebar() {
  const pathname = usePathname()
  const { isCollapsed } = useSidebar()
  const { user } = useAuth()

  const nav = useSyncExternalStore(subscribeAnalysisNav, getAnalysisNavState, getAnalysisNavServerState)

  const scanMatch = /^\/app\/scans\/([^/]+)/.exec(pathname)
  const scanId = scanMatch?.[1] ?? null
  const groups = scanId ? analysisGroups(scanId, nav.scanId === scanId ? nav.openHighSeverity : 0) : FLEET_GROUPS

  return (
    <motion.aside
      animate={{ width: isCollapsed ? 80 : 256 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="fixed left-0 top-0 bottom-0 bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden z-50"
    >
      {/* Logo */}
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <Link
          href="/app"
          aria-label="KubeScope home"
          className={cn(
            "flex flex-1 items-center gap-3 rounded transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isCollapsed ? "justify-center" : "",
          )}
        >
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <img src="/kubescope-icon.png" alt="KubeScope" className="w-8 h-8 logo-img" />
          </div>
          {!isCollapsed && (
            <span className="text-lg font-semibold text-sidebar-foreground">
              <span className="text-cyan-500">Kube</span>Scope
            </span>
          )}
        </Link>
      </div>

      <nav aria-label={scanId ? "Analysis navigation" : "Fleet navigation"} className="flex-1 space-y-6 overflow-y-auto px-4">
        {groups.map((group) => (
          <div key={group.title} className="space-y-1">
            {!isCollapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const active = isActive(pathname, item)
              const Icon = item.icon

              const badgeLabel =
                item.badge && item.badge > 0 ? `${item.badge} open critical and high findings` : undefined

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  // Collapsed mode is icon-only, so the label has to survive in
                  // the accessible name and the tooltip — an unlabelled icon
                  // rail is a guessing game for everyone and unusable with a
                  // screen reader.
                  title={isCollapsed ? [item.label, badgeLabel].filter(Boolean).join(" — ") : undefined}
                  aria-label={isCollapsed ? [item.label, badgeLabel].filter(Boolean).join(", ") : undefined}
                  aria-current={active ? "page" : undefined}
                  className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      isCollapsed && "justify-center",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    )}
                  >
                    {/* Current-page marker that survives collapse, where the
                        highlighted label is no longer there to carry it. */}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-6 w-1 -translate-x-2 -translate-y-1/2 rounded-full bg-sidebar-primary-foreground"
                      />
                    )}
                    <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={cn(
                          "tabular rounded-full text-xs",
                          isCollapsed
                            ? "absolute right-1.5 top-1.5 h-2 w-2 p-0"
                            : "ml-auto px-2 py-0.5",
                          active
                            ? "bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground"
                            : "bg-sev-critical-bg text-sev-critical",
                        )}
                        title={badgeLabel}
                      >
                        {isCollapsed ? <span className="sr-only">{badgeLabel}</span> : item.badge}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        ))}

        {!scanId && (
          <div className="pt-2 border-t border-sidebar-border">
            <Link
              href="/app/clusters?upload=true"
              title={isCollapsed ? "Upload snapshot" : undefined}
              aria-label={isCollapsed ? "Upload snapshot" : undefined}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-sidebar-accent/50",
                  isCollapsed && "justify-center",
                )}
              >
                <Upload className="w-5 h-5 shrink-0" aria-hidden="true" />
                {!isCollapsed && <span>Upload Snapshot</span>}
              </div>
            </Link>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className={cn("flex items-center gap-3 px-2", isCollapsed && "justify-center")}>
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-sm">
              {(user?.username || user?.email)?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.username || user?.email || "User"}
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email || user?.username}</p>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  )
}
