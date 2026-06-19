"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/app/providers/AuthProvider"
import { useToast } from "@/hooks/use-toast"
import { 
  User, 
  Bell, 
  Shield, 
  Palette, 
  Database, 
  Trash2,
  Save,
  RefreshCw,
  Briefcase,
  AlertTriangle
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { 
  getWorkspaces, 
  deleteWorkspace, 
  getActiveWorkspaceId,
  type Workspace 
} from "@/lib/workspace-manager"

export default function SettingsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [notifications, setNotifications] = useState({
    email: true,
    riskAlerts: true,
    weeklyReport: false,
  })
  const [loading, setLoading] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null)
  const [deletingWorkspace, setDeletingWorkspace] = useState(false)

  useEffect(() => {
    loadWorkspaces()
  }, [])

  const loadWorkspaces = async () => {
    const ws = await getWorkspaces()
    const activeId = await getActiveWorkspaceId()
    setWorkspaces(ws)
    setActiveWorkspaceId(activeId)
  }

  const handleSave = () => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      toast({
        description: "Settings saved successfully",
      })
    }, 500)
  }

  const handleClearData = () => {
    localStorage.clear()
    toast({
      description: "All local data cleared",
    })
    window.location.reload()
  }

  const handleDeleteWorkspace = async () => {
    if (!workspaceToDelete) return
    
    setDeletingWorkspace(true)
    try {
      await deleteWorkspace(workspaceToDelete.id)

      toast({
        description: `Workspace "${workspaceToDelete.name}" and all associated data deleted successfully`,
      })

      // Reload workspaces
      await loadWorkspaces()
      
      // Trigger workspace change event for other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent("kubescope-workspace-changed"))
      }
      
      setDeleteDialogOpen(false)
      setWorkspaceToDelete(null)
    } catch (error) {
      console.error("Error deleting workspace:", error)
      toast({
        variant: "destructive",
        description: `Failed to delete workspace: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    } finally {
      setDeletingWorkspace(false)
    }
  }

  const openDeleteDialog = (workspace: Workspace) => {
    setWorkspaceToDelete(workspace)
    setDeleteDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and application preferences
        </p>
      </div>

      <div className="grid gap-6">
        {/* Profile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile
              </CardTitle>
              <CardDescription>
                Your account information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  defaultValue={user?.user_metadata?.full_name || ""}
                  placeholder="Your name"
                  disabled
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  defaultValue={user?.email || ""}
                  disabled
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notifications */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>
                Configure how you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
                <Switch
                  checked={notifications.email}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, email: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Risk alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified about critical security findings
                  </p>
                </div>
                <Switch
                  checked={notifications.riskAlerts}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, riskAlerts: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Weekly report</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive a weekly security summary
                  </p>
                </div>
                <Switch
                  checked={notifications.weeklyReport}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, weeklyReport: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Workspace Management */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Workspaces
              </CardTitle>
              <CardDescription>
                Manage your workspaces and their data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {workspaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workspaces found</p>
              ) : (
                workspaces.map((workspace) => (
                  <div key={workspace.id}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
                          {workspace.name}
                          {workspace.id === activeWorkspaceId && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                              Active
                            </span>
                          )}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {workspace.description || 'No description'}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteDialog(workspace)}
                        disabled={workspaces.length === 1}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                    {workspace !== workspaces[workspaces.length - 1] && (
                      <Separator className="mt-4" />
                    )}
                  </div>
                ))
              )}
              {workspaces.length === 1 && (
                <p className="text-xs text-muted-foreground mt-2">
                  You must have at least one workspace
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Data Management */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Management
              </CardTitle>
              <CardDescription>
                Manage your local data and scans
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Clear all data</Label>
                  <p className="text-sm text-muted-foreground">
                    Remove all local scans and workspaces
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearData}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </motion.div>
      </div>

      {/* Delete Workspace Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Workspace
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete{" "}
                <span className="font-semibold">{workspaceToDelete?.name}</span>?
              </p>
              <p className="text-destructive font-medium">
                This action cannot be undone. All data associated with this workspace will be permanently deleted, including:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All scans and RBAC analysis data</li>
                <li>Cluster configurations</li>
                <li>Risk findings and reports</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingWorkspace}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorkspace}
              disabled={deletingWorkspace}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingWorkspace ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Workspace
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
