"use client"

import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react"
import { AppSidebar } from "@/components/app/sidebar"
import { AppHeader } from "@/components/app/header"
import { motion, AnimatePresence } from "framer-motion"
import { usePathname, useSearchParams } from "next/navigation"
import { 
  getWorkspaces, 
  createWorkspace, 
  setActiveWorkspaceId, 
  setupDebugHelper,
  type Workspace 
} from "@/lib/workspace-manager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, FolderPlus, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export const SidebarContext = createContext({
  isCollapsed: false,
  setIsCollapsed: (_collapsed: boolean) => {},
})

// Workspace context to share workspace state across components
export const WorkspaceContext = createContext<{
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  refreshWorkspaces: () => Promise<Workspace[]>
  showCreateDialog: boolean
  setShowCreateDialog: (show: boolean) => void
}>({
  workspaces: [],
  activeWorkspace: null,
  refreshWorkspaces: async () => [],
  showCreateDialog: false,
  setShowCreateDialog: () => {},
})

export const useWorkspace = () => useContext(WorkspaceContext)

export function AppShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  const refreshWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    const allWorkspaces = await getWorkspaces()
    setWorkspaces(allWorkspaces)

    if (allWorkspaces.length > 0) {
      const { getActiveWorkspace } = await import("@/lib/workspace-manager")
      const active = await getActiveWorkspace()
      setActiveWorkspace(active)
    }

    return allWorkspaces
  }, [])

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      // If demo mode, skip workspace initialization
      if (isDemo) {
        setIsLoading(false)
        return
      }
      
      setupDebugHelper()
      
      const allWorkspaces = await refreshWorkspaces()
      
      // If no workspaces exist, auto-create a default one
      if (allWorkspaces.length === 0) {
        try {
          const workspace = await createWorkspace("Default Workspace")
          await setActiveWorkspaceId(workspace.id)
          await refreshWorkspaces()
          toast({
            title: "Welcome to KubeScope!",
            description: "Your default workspace is ready. Upload an RBAC snapshot to get started.",
          })
        } catch (error) {
          // Fallback to showing dialog if auto-create fails
          setShowCreateDialog(true)
        }
      }
      
      setIsLoading(false)
    }
    
    init()
    
    // Listen for workspace changes (skip in demo mode)
    if (!isDemo) {
      const handleWorkspaceChange = () => {
        refreshWorkspaces()
      }
      window.addEventListener("kubescope-workspace-changed", handleWorkspaceChange)
      return () => window.removeEventListener("kubescope-workspace-changed", handleWorkspaceChange)
    }
  }, [isDemo])

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return
    
    setIsCreating(true)
    try {
      const workspace = await createWorkspace(newWorkspaceName.trim())
      
      await setActiveWorkspaceId(workspace.id)
      await refreshWorkspaces()
      
      setShowCreateDialog(false)
      setNewWorkspaceName("")
      
      toast({
        title: "Workspace created",
        description: `${workspace.name} is now ready. You can upload RBAC snapshots to analyze.`,
      })
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent("kubescope-workspace-changed", { 
        detail: { workspaceId: workspace.id } 
      }))
    } catch (error) {
      console.error("Error creating workspace:", error)
      toast({
        title: "Error creating workspace",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const workspaceContextValue = useMemo(() => ({
    workspaces,
    activeWorkspace,
    refreshWorkspaces,
    showCreateDialog,
    setShowCreateDialog,
  }), [workspaces, activeWorkspace, refreshWorkspaces, showCreateDialog])

  // Show loading state while checking workspaces
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <WorkspaceContext.Provider value={workspaceContextValue}>
      <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed }}>
        <div className="min-h-screen bg-background">
          <AppSidebar />
          <motion.div 
            animate={{ marginLeft: isCollapsed ? 80 : 256 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex flex-col min-h-screen"
          >
            <AppHeader />
            <AnimatePresence mode="wait">
              <motion.main
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="p-6 flex-1"
              >
                {children}
              </motion.main>
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Create Workspace Dialog */}
        <Dialog 
          open={showCreateDialog} 
          onOpenChange={(open) => {
            // Only allow closing if user has at least one workspace
            if (!open && workspaces.length === 0) return
            setShowCreateDialog(open)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <DialogTitle>
                  {workspaces.length === 0 ? "Welcome to KubeScope!" : "Create Workspace"}
                </DialogTitle>
              </div>
              <DialogDescription>
                {workspaces.length === 0 
                  ? "Create your first workspace to start analyzing Kubernetes RBAC permissions. Workspaces help organize your cluster scans."
                  : "Create a new workspace to organize your cluster scans."}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  placeholder="e.g., Production, Staging, Development"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newWorkspaceName.trim()) {
                      handleCreateWorkspace()
                    }
                  }}
                  className="h-11"
                  autoFocus
                />
              </div>

              {workspaces.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  <p className="text-sm text-muted-foreground w-full mb-1">Quick suggestions:</p>
                  {["Production", "Staging", "Development", "QA"].map((name) => (
                    <Button
                      key={name}
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs"
                      onClick={() => setNewWorkspaceName(name)}
                    >
                      {name}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              {workspaces.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleCreateWorkspace}
                disabled={!newWorkspaceName.trim() || isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Create Workspace
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </SidebarContext.Provider>
    </WorkspaceContext.Provider>
  )
}

export const useSidebar = () => useContext(SidebarContext)
