"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
  BookOpen, 
  Upload, 
  Table2, 
  Network, 
  AlertTriangle, 
  FileText, 
  Shield, 
  HelpCircle,
  ChevronRight,
  Menu,
  X
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

const navigation = [
  {
    title: "Introduction",
    items: [
      { title: "Getting Started", href: "/docs/getting-started", icon: BookOpen },
    ],
  },
  {
    title: "Core Features",
    items: [
      { title: "Upload RBAC Snapshot", href: "/docs/upload-snapshot", icon: Upload },
      { title: "RBAC Viewer", href: "/docs/rbac-viewer", icon: Table2 },
      { title: "RBAC Map", href: "/docs/rbac-map", icon: Network },
      { title: "Risk Findings", href: "/docs/risk-findings", icon: AlertTriangle },
      { title: "Reports & Export", href: "/docs/reports-export", icon: FileText },
    ],
  },
  {
    title: "Trust",
    items: [
      { title: "Security & Privacy", href: "/docs/security-privacy", icon: Shield },
    ],
  },
  {
    title: "Help",
    items: [
      { title: "FAQ", href: "/docs/faq", icon: HelpCircle },
    ],
  },
]

export function DocsSidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden rounded-xl"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <motion.div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <motion.aside
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-background border-r border-border z-40 overflow-y-auto",
          "lg:sticky lg:top-0 lg:h-screen",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        initial={false}
        animate={{ x: mobileOpen ? 0 : undefined }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
      >
        <div className="p-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/kubescope-icon.png" alt="KubeScope" className="w-8 h-8 logo-img" />
            </div>
            <span className="font-semibold text-lg">KubeScope</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-1">Docs</span>
          </Link>

          {/* Navigation */}
          <nav className="space-y-6">
            {navigation.map((section, sectionIndex) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sectionIndex * 0.1 }}
              >
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {section.title}
                </h4>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href
                    const Icon = item.icon
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span>{item.title}</span>
                          {isActive && (
                            <ChevronRight className="w-4 h-4 ml-auto" />
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </motion.div>
            ))}
          </nav>
        </div>
      </motion.aside>
    </>
  )
}

export { navigation }
