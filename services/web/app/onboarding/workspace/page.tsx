"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import {
  createWorkspace,
  setActiveWorkspace,
  setOnboardingCompleted,
  SUGGESTED_WORKSPACES,
} from "@/lib/workspace-manager"
import { Plus, CheckCircle2 } from "lucide-react"

export default function WorkspaceSelectionPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSelectWorkspace = async (name: string) => {
    setIsLoading(true)

    const workspace = createWorkspace(name)
    setActiveWorkspace(workspace.id)
    setOnboardingCompleted(true)

    toast({
      title: "Workspace created",
      description: `Workspace set to ${workspace.name} ✅`,
    })

    await new Promise(resolve => setTimeout(resolve, 300))
    router.push("/clusters")
  }

  const handleCreateCustom = async () => {
    if (!newWorkspaceName.trim()) return

    setIsLoading(true)
    await handleSelectWorkspace(newWorkspaceName.trim())
    setIsCreatingNew(false)
    setNewWorkspaceName("")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Background animation */}
      <motion.div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.15), transparent 70%)",
        }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 8, repeat: Infinity }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        {/* Header */}
        <motion.div
          className="text-center mb-16 max-w-2xl"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold mb-4">Choose a Workspace</h1>
          <p className="text-xl text-muted-foreground">
            Workspaces keep Production, Staging, Dev environments separate.
          </p>
        </motion.div>

        {/* Workspaces grid */}
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <AnimatePresence>
            {SUGGESTED_WORKSPACES.map((workspace, index) => (
              <motion.div
                key={workspace.name}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                whileHover={{ y: -4 }}
              >
                <Button
                  onClick={() => handleSelectWorkspace(workspace.name)}
                  disabled={isLoading}
                  variant="outline"
                  className="h-24 w-full border-white/20 hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-start justify-center p-6 relative overflow-hidden group"
                >
                  {/* Hover glow */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100"
                    animate={{ x: [-200, 200] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />

                  <div className="relative z-10 w-full text-left">
                    <h3 className="text-xl font-bold mb-2">{workspace.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      Click to select this workspace
                    </p>
                  </div>
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Create new workspace card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            whileHover={{ y: -4 }}
          >
            <Button
              onClick={() => setIsCreatingNew(true)}
              disabled={isLoading}
              variant="outline"
              className="h-24 w-full border-dashed border-white/30 hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center p-6 relative overflow-hidden group"
            >
              <Plus className="w-6 h-6 mb-2 text-primary" />
              <span className="text-sm font-semibold">Create New Workspace</span>
            </Button>
          </motion.div>
        </div>

        {/* Info text */}
        <motion.p
          className="text-center text-sm text-muted-foreground max-w-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          Each workspace maintains its own scans and settings independently.
        </motion.p>
      </div>

      {/* Create new workspace modal */}
      <Dialog open={isCreatingNew} onOpenChange={setIsCreatingNew}>
        <DialogContent className="bg-white/5 backdrop-blur-xl border-white/10">
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
            <DialogDescription>
              Give your workspace a unique name to keep it organized.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Workspace name
              </label>
              <Input
                type="text"
                placeholder="e.g., Prod-India"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newWorkspaceName.trim()) {
                    handleCreateCustom()
                  }
                }}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setIsCreatingNew(false)}
                variant="outline"
                className="flex-1"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateCustom}
                disabled={!newWorkspaceName.trim() || isLoading}
                className="flex-1 bg-gradient-to-r from-primary to-primary/80"
              >
                {isLoading ? "Creating..." : "Create Workspace"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
