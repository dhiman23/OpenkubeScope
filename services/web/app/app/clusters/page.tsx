"use client"

import React from "react"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import {
  Upload,
  Search,
  Server,
  Clock,
  ChevronRight,
  Loader2,
  ExternalLink,
  Download,
  MoreHorizontal,
  FileJson,
  FileArchive,
  X,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"
import Loading from "./loading"
import { useToast } from "@/hooks/use-toast"
import {
  type Scan,
  uploadScanFile,
  loadScansMeta,
  loadScans,
  setActiveScanId,
  setWorkspaceMode,
  deleteScan,
} from "@/lib/rbac-scanner"
import { getActiveWorkspace } from "@/lib/workspace-manager"
import { getTimeAgo, getTotalRisks } from "@/lib/format-utils"
import { ScanLimitError } from "@/lib/subscription"
import { UpgradeDialog } from "@/components/app/upgrade-dialog"
import { useWorkspace } from "@/components/app/app-shell"

function ClustersContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [analyzePhase, setAnalyzePhase] = useState("")
  const [scans, setScans] = useState<Scan[]>([])
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null)
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const { activeWorkspace } = useWorkspace()

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load scans from localStorage on mount and on workspace change
  useEffect(() => {
    loadScansData()

    const handleWorkspaceChange = () => {
      loadScansData()
    }
    window.addEventListener("kubescope-workspace-changed", handleWorkspaceChange)
    
    return () => {
      window.removeEventListener("kubescope-workspace-changed", handleWorkspaceChange)
    }
  }, [])

  const loadScansData = async () => {
    const savedScans = await loadScansMeta()
    setScans(savedScans)
  }

  // Check if we should open upload modal from URL params
  useEffect(() => {
    if (searchParams.get("upload") === "true") {
      setIsUploadModalOpen(true)
    }
  }, [searchParams])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && (file.name.endsWith('.zip') || file.name.endsWith('.json'))) {
      setSelectedFile(file)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleAnalyze = async () => {
    if (!selectedFile) return

    setIsAnalyzing(true)
    setAnalyzeProgress(0)
    setAnalyzePhase("Reading file...")

    try {
      setAnalyzeProgress(10)
      setAnalyzePhase("Uploading & analyzing snapshot...")

      // Upload the file — core-api parses, runs the findings engine, and
      // persists it server-side, returning the saved scan.
      const savedScan = await uploadScanFile(selectedFile)
      setAnalyzeProgress(100)
      setAnalyzePhase("Complete!")

      if (!savedScan) {
        throw new Error("Failed to save scan - no workspace selected")
      }

      // Set this as the active scan for the current workspace
      await setActiveScanId(savedScan.id)
      await setWorkspaceMode("real")
      
      // Reload all scans from DB to ensure UI is in sync
      await loadScansData()
      
      // Dispatch custom event to notify other components about scan update
      window.dispatchEvent(new CustomEvent("kubescope-scan-updated", { detail: { scanId: savedScan.id } }))

      const totalRisks = savedScan.riskCounts.critical + savedScan.riskCounts.high + 
                         savedScan.riskCounts.medium + savedScan.riskCounts.low

      // Get active workspace and show which workspace the scan was saved to
      const workspace = await getActiveWorkspace()
      const workspaceName = workspace?.name || "current workspace"

      toast({
        title: "Scan completed",
        description: `Snapshot saved to ${workspaceName}. Found ${totalRisks} risks across ${savedScan.totals.subjects} subjects, ${savedScan.totals.roles} roles, and ${savedScan.totals.bindings} bindings.`,
      })

      setIsAnalyzing(false)
      setAnalyzeProgress(0)
      setAnalyzePhase("")
      setSelectedFile(null)
      setIsUploadModalOpen(false)

    } catch (error) {
      console.error("Error analyzing file:", error)
      setIsAnalyzing(false)
      setAnalyzeProgress(0)
      setAnalyzePhase("")

      if (error instanceof ScanLimitError) {
        setIsUploadModalOpen(false)
        setShowUpgradeDialog(true)
        toast({
          title: "Scan limit reached",
          description: error.message,
          variant: "destructive",
        })
        return
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      toast({
        title: "Error analyzing file",
        description: errorMessage.includes("authenticated")
          ? errorMessage
          : `Failed to save scan: ${errorMessage}. Please ensure the file contains valid RBAC data.`,
        variant: "destructive",
      })
    }
  }

  const handleViewScan = async (scan: Scan) => {
    await setActiveScanId(scan.id)
    await setWorkspaceMode("real")
    // Dispatch custom event to notify components about active scan change
    window.dispatchEvent(new CustomEvent("kubescope-scan-updated", { detail: { scanId: scan.id } }))
    router.push("/app")
  }

  const handleDeleteScan = async (scanId: string) => {
    const newScans = scans.filter(s => s.id !== scanId)
    setScans(newScans)
    await deleteScan(scanId)
    toast({
      description: "Scan deleted successfully.",
    })
  }

  const handleExportScan = async (scan: Scan) => {
    // If dataset is missing (metadata-only load), fetch the full scan
    let dataset: Scan["dataset"] | undefined = scan.dataset
    if (!dataset) {
      const fullScans = await loadScans()
      const fullScan = fullScans.find(s => s.id === scan.id)
      dataset = fullScan?.dataset
    }
    if (!dataset) return

    const dataStr = JSON.stringify(dataset, null, 2)
    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    const fileName = scan.fileName || `scan-${scan.id}`
    link.download = `${fileName.replace(/\.(json|zip)$/, "")}-export.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Memoize filtered scans - only recompute when inputs change
  const filteredScans = useMemo(() => {
    const query = debouncedSearchQuery.toLowerCase()
    if (!query) return scans
    
    return scans.filter((scan) => {
      const fileName = (scan.fileName || '').toLowerCase()
      const clusterName = (scan.clusterName || '').toLowerCase()
      return fileName.includes(query) || clusterName.includes(query)
    })
  }, [scans, debouncedSearchQuery])


  return (
    <div className="space-y-8">
      {/* Page header */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clusters</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your Kubernetes RBAC snapshots
          </p>
        </div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={() => setIsUploadModalOpen(true)}
            className="rounded-xl"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload RBAC Snapshot
          </Button>
        </motion.div>
      </motion.div>

      {/* Search */}
      <motion.div
        className="relative max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search scans..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11 rounded-xl"
        />
      </motion.div>

      {/* Scans grid */}
      {filteredScans.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-6">
            {filteredScans.map((scan) => (
              <div
                key={scan.id}
                className="glass-card p-6 cursor-pointer group hover:-translate-y-1 transition-transform"
                onClick={() => handleViewScan(scan)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-muted">
                      {scan.fileName?.endsWith('.json') ? (
                        <FileJson className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <FileArchive className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold truncate max-w-[200px]">{scan.fileName || `Scan ${scan.id.slice(0, 8)}`}</h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3.5 h-3.5" />
                        {getTimeAgo(scan.createdAt)}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation()
                        handleViewScan(scan)
                      }}>
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation()
                        handleExportScan(scan)
                      }}>
                        Export Report
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteScan(scan.id)
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Risk counts */}
                <div className="mt-4 flex items-center gap-4 flex-wrap">
                  {(scan.riskCounts?.critical || 0) > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-destructive" />
                      <span className="text-sm">
                        <span className="font-medium">{scan.riskCounts?.critical || 0}</span>
                        <span className="text-muted-foreground ml-1">Critical</span>
                      </span>
                    </div>
                  )}
                  {(scan.riskCounts?.high || 0) > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      <span className="text-sm">
                        <span className="font-medium">{scan.riskCounts?.high || 0}</span>
                        <span className="text-muted-foreground ml-1">High</span>
                      </span>
                    </div>
                  )}
                  {(scan.riskCounts?.medium || 0) > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-warning" />
                      <span className="text-sm">
                        <span className="font-medium">{scan.riskCounts?.medium || 0}</span>
                        <span className="text-muted-foreground ml-1">Medium</span>
                      </span>
                    </div>
                  )}
                  {(scan.riskCounts?.low || 0) > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <span className="text-sm">
                        <span className="font-medium">{scan.riskCounts?.low || 0}</span>
                        <span className="text-muted-foreground ml-1">Low</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Totals */}
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm flex-wrap gap-2">
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">
                      {scan.totals?.subjects || 0} subjects
                    </span>
                    <span className="text-muted-foreground">
                      {scan.totals?.roles || 0} roles
                    </span>
                    <span className="text-muted-foreground">
                      {scan.totals?.bindings || 0} bindings
                    </span>
                  </div>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                    Completed
                  </span>
                </div>

                {/* Hover indicator */}
                <div className="flex items-center justify-end mt-4 text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>View details</span>
                  <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </div>
            ))}
        </div>
      ) : (
        /* Premium Empty State */
        <motion.div
          className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted/30 via-background to-muted/30 p-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="relative text-center max-w-md mx-auto">
            <motion.div 
              className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
            >
              <Sparkles className="w-10 h-10 text-primary" />
            </motion.div>
            
            <h3 className="text-2xl font-bold mb-2">No scans yet</h3>
            <p className="text-muted-foreground mb-8">
              Upload your first RBAC snapshot to analyze your Kubernetes cluster permissions and discover potential security risks.
            </p>
            
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                size="lg" 
                className="rounded-xl px-8"
                onClick={() => setIsUploadModalOpen(true)}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Your First Snapshot
              </Button>
            </motion.div>

            <p className="mt-6 text-xs text-muted-foreground">
              Supports .zip and .json files
            </p>
          </div>
        </motion.div>
      )}

      {/* Upload Modal */}
      <Dialog 
        open={isUploadModalOpen} 
        onOpenChange={(open) => {
          setIsUploadModalOpen(open)
          if (!open) {
            // Reset state when closing
            setSelectedFile(null)
            setIsAnalyzing(false)
            setAnalyzeProgress(0)
            setAnalyzePhase("")
          }
        }}
      >
        <DialogContent 
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Upload RBAC Snapshot</DialogTitle>
            <DialogDescription>
              Upload a .zip or .json file containing your Kubernetes RBAC configuration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {!isAnalyzing ? (
              <>
                {/* Drop zone */}
                <motion.div
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                    selectedFile 
                      ? "border-primary bg-primary/5" 
                      : "border-muted-foreground/25 hover:border-muted-foreground/50"
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  whileHover={{ scale: 1.01 }}
                >
                  <input
                    type="file"
                    accept=".zip,.json"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-0"
                  />
                  
                  {selectedFile ? (
                    <div className="space-y-2">
                      <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                        {selectedFile.name.endsWith('.json') ? (
                          <FileJson className="w-6 h-6 text-primary" />
                        ) : (
                          <FileArchive className="w-6 h-6 text-primary" />
                        )}
                      </div>
                      <p className="font-medium truncate max-w-[250px] mx-auto">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedFile(null)
                        }}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-12 h-12 mx-auto rounded-xl bg-muted flex items-center justify-center">
                        <Upload className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="font-medium">Drop your file here</p>
                      <p className="text-sm text-muted-foreground">or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-2">Supports .zip and .json</p>
                    </div>
                  )}
                </motion.div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl bg-transparent"
                    onClick={() => setIsUploadModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 rounded-xl"
                    disabled={!selectedFile}
                    onClick={handleAnalyze}
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Analyze
                  </Button>
                </div>
              </>
            ) : (
              /* Analyzing state */
              <motion.div
                className="space-y-6 py-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="text-center space-y-4">
                  <motion.div
                    className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 className="w-8 h-8 text-primary" />
                  </motion.div>
                  
                  <div>
                    <p className="font-semibold text-lg">{analyzePhase}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedFile?.name}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{Math.round(analyzeProgress)}%</span>
                  </div>
                  <Progress value={analyzeProgress} className="h-2" />
                </div>

                {analyzeProgress >= 100 && (
                  <motion.div
                    className="flex items-center justify-center gap-2 text-success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">Analysis complete!</span>
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Scan Details Sheet */}
      <Sheet open={!!selectedScan} onOpenChange={() => setSelectedScan(null)}>
        <SheetContent className="sm:max-w-lg">
          {selectedScan && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  {selectedScan.fileName.endsWith('.json') ? (
                    <FileJson className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <FileArchive className="w-5 h-5 text-muted-foreground" />
                  )}
                  {selectedScan.fileName}
                </SheetTitle>
                <SheetDescription>
                  Scanned {getTimeAgo(selectedScan.createdAt)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Risk Summary */}
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Risk Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <p className="text-2xl font-bold text-destructive">{selectedScan.riskCounts.critical}</p>
                      <p className="text-xs text-muted-foreground">Critical</p>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                      <p className="text-2xl font-bold text-orange-500">{selectedScan.riskCounts.high}</p>
                      <p className="text-xs text-muted-foreground">High</p>
                    </div>
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                      <p className="text-2xl font-bold text-warning">{selectedScan.riskCounts.medium}</p>
                      <p className="text-xs text-muted-foreground">Medium</p>
                    </div>
                    <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                      <p className="text-2xl font-bold text-success">{selectedScan.riskCounts.low}</p>
                      <p className="text-xs text-muted-foreground">Low</p>
                    </div>
                  </div>
                </div>

                {/* RBAC Totals */}
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    RBAC Overview
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Subjects</span>
                      <span className="font-medium">{selectedScan.totals.subjects}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Roles</span>
                      <span className="font-medium">{selectedScan.totals.roles}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Bindings</span>
                      <span className="font-medium">{selectedScan.totals.bindings}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">Cluster</span>
                      <span className="font-medium">{selectedScan.clusterName}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button 
                    className="flex-1 rounded-xl" 
                    onClick={() => {
                      handleViewScan(selectedScan)
                      setSelectedScan(null)
                    }}
                  >
                    View in Dashboard
                  </Button>
                  <Button 
                    variant="outline" 
                    className="rounded-xl bg-transparent"
                    onClick={() => handleExportScan(selectedScan)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <UpgradeDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
        workspaceId={activeWorkspace?.id || null}
        title="Upgrade for unlimited scans"
        description="Your Free plan includes 1 lifetime RBAC scan. Upgrade to Unlimited to scan as many clusters as you need."
      />
    </div>
  )
}

export default function ClustersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ClustersContent />
    </Suspense>
  )
}
