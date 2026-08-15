"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Moon, Sun, Bell, LogOut, User, CreditCard, Menu, ChevronDown, Check, FolderPlus } from "lucide-react"
import { useTheme } from "next-themes"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { useSidebar, useWorkspace } from "./app-shell"
import { setActiveWorkspaceId, type Workspace } from "@/lib/workspace-manager"
import { loadScans } from "@/lib/scan-storage"
import { useAuth } from "@/app/providers/AuthProvider"
import { AvatarImage } from "@/components/ui/avatar"
import { CommandPalette, useCommandPalette } from "./command-palette"

export function AppHeader() {
  const { user, signOut } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette()
  const [mounted, setMounted] = useState(false)
  const { toast } = useToast()
  const { isCollapsed, setIsCollapsed } = useSidebar()
  const { workspaces, activeWorkspace, refreshWorkspaces, setShowCreateDialog } = useWorkspace()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleWorkspaceSwitch = async (workspace: Workspace) => {
    setIsLoading(true)
    await setActiveWorkspaceId(workspace.id)
    await refreshWorkspaces()

    // Check if workspace has scans
    const scans = await loadScans(workspace.id)
    const hasScans = scans.length > 0
    
    // Premium loading effect
    setTimeout(() => {
      setIsLoading(false)
      toast({
        description: hasScans 
          ? `Switched to ${workspace.name} (${scans.length} scans)` 
          : `Switched to ${workspace.name} - No scans yet`,
      })
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent("kubescope-workspace-changed", { 
        detail: { workspaceId: workspace.id } 
      }))
    }, 300)
  }

  const handleThemeToggle = () => {
    const newTheme = resolvedTheme === "dark" ? "light" : "dark"
    setTheme(newTheme)
    toast({
      description: `Switched to ${newTheme === "dark" ? "Dark" : "Light"} mode`,
    })
  }

  // 56px rather than 64px: this bar carries search, workspace, theme and
  // account only, and the height it gives back is analysis space on pages that
  // are already dense.
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="h-full px-6 flex items-center justify-between gap-4">
        {/* Sidebar toggle + Global search */}
        <div className="flex items-center gap-2 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded-xl"
          >
            <Menu className="h-4 w-4" />
          </Button>
          
          {/* Opens the command palette. This used to be an input with a ⌘K hint
              and no handler — a visible affordance that did nothing. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="relative flex-1 max-w-md flex items-center gap-2 h-10 px-3 rounded-xl bg-muted/50 border border-transparent text-left text-sm text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">Search clusters, snapshots, actions…</span>
            <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Workspace switcher - Always visible */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="rounded-xl gap-2 min-w-[140px] justify-between bg-transparent"
                disabled={isLoading}
              >
                <span className="truncate">
                  {activeWorkspace?.name || "Select workspace"}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {workspaces.length > 0 ? (
                <>
                  {workspaces.map((workspace) => (
                    <DropdownMenuItem
                      key={workspace.id}
                      onClick={() => handleWorkspaceSwitch(workspace)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>{workspace.name}</span>
                        {activeWorkspace?.id === workspace.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground text-sm">
                  No workspaces yet
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setShowCreateDialog(true)}
                className="cursor-pointer text-primary"
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                Create Workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleThemeToggle}
            className="rounded-xl relative overflow-hidden"
            disabled={!mounted}
          >
            <AnimatePresence mode="wait" initial={false}>
              {mounted && (
                <motion.div
                  key={resolvedTheme}
                  initial={{ y: -20, opacity: 0, rotate: -90 }}
                  animate={{ y: 0, opacity: 1, rotate: 0 }}
                  exit={{ y: 20, opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  {resolvedTheme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="rounded-xl relative">
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
            <span className="sr-only">Notifications</span>
          </Button>

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="rounded-xl p-1">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {(user?.username || user?.email)?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div>
                  <p className="font-medium">{user?.username || user?.email || "User"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email || user?.username}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <CreditCard className="mr-2 h-4 w-4" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={async () => {
                  await signOut()
                  toast({
                    description: "Signed out successfully",
                  })
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  )
}
