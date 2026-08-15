"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Circle, FileArchive, FileJson, Loader2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { uploadScan, waitForScan } from "@/lib/scan-storage"
import { getOrCreateActiveWorkspaceId } from "@/lib/workspace-manager"
import { setWorkspaceMode } from "@/lib/rbac-scanner"
import { ScanLimitError } from "@/lib/subscription"

type Stage = "idle" | "uploading" | "queued" | "scanning" | "done"

const STAGES: { key: Stage; label: string }[] = [
  { key: "uploading", label: "Uploading" },
  { key: "queued", label: "Queued" },
  { key: "scanning", label: "Scanning" },
  { key: "done", label: "Ready" },
]

function StageRow({ current }: { current: Stage }) {
  const order = STAGES.map((s) => s.key)
  const index = order.indexOf(current)

  return (
    <div className="flex items-center justify-center gap-5 flex-wrap">
      {STAGES.map((stage, i) => {
        const state = i < index ? "done" : i === index ? "active" : "todo"
        const Icon = state === "done" ? CheckCircle2 : state === "active" ? Loader2 : Circle
        return (
          <span
            key={stage.key}
            className={cn(
              "inline-flex items-center gap-1.5 text-sm",
              state === "done" ? "text-sev-pass" : state === "active" ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className={cn("w-4 h-4", state === "active" && "animate-spin")} />
            {stage.label}
          </span>
        )
      })}
    </div>
  )
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Snapshot upload.
 *
 * Stages are real, not decorative: the async path submits to a queue and polls,
 * so a large snapshot can sit in "pending" for a while. A single indeterminate
 * spinner over an unbounded queue wait reads as a hang.
 *
 * On success it shows a toast with an [Open Analysis] action rather than
 * navigating on its own — auto-navigation loses anyone uploading several files.
 */
export function SnapshotUploader({
  open,
  onOpenChange,
  onUploaded,
  onScanLimit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded?: () => void | Promise<void>
  onScanLimit?: () => void
}) {
  const router = useRouter()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>("idle")
  const [dragging, setDragging] = useState(false)

  const busy = stage !== "idle" && stage !== "done"

  const reset = () => {
    setFile(null)
    setStage("idle")
  }

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped && (dropped.name.endsWith(".zip") || dropped.name.endsWith(".json"))) {
      setFile(dropped)
    }
  }, [])

  const analyze = async () => {
    if (!file) return
    setStage("uploading")

    try {
      const workspaceId = await getOrCreateActiveWorkspaceId()
      if (!workspaceId) throw new Error("No workspace selected")

      let scan = await uploadScan(workspaceId, file)

      if (scan.status === "pending") {
        setStage("queued")
        setStage("scanning")
        scan = await waitForScan(workspaceId, scan.id)
      } else {
        setStage("scanning")
      }

      if (scan.status === "failed") {
        throw new Error(scan.errorMessage || "The scanner could not process this snapshot.")
      }

      setStage("done")
      await setWorkspaceMode("real")
      await onUploaded?.()

      toast({
        title: "Snapshot analyzed",
        description: `${scan.totals?.subjects ?? 0} subjects, ${scan.totals?.roles ?? 0} roles, ${
          scan.riskCounts?.critical ?? 0
        } critical findings.`,
        action: (
          <Button size="sm" onClick={() => router.push(`/app/scans/${scan.id}`)}>
            Open Analysis
          </Button>
        ),
      })

      onOpenChange(false)
      reset()
    } catch (error) {
      setStage("idle")

      if (error instanceof ScanLimitError) {
        onOpenChange(false)
        onScanLimit?.()
        toast({ title: "Scan limit reached", description: error.message, variant: "destructive" })
        return
      }

      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload RBAC snapshot</DialogTitle>
          <DialogDescription>JSON or ZIP exported from your cluster. Nothing else is required.</DialogDescription>
        </DialogHeader>

        {busy || stage === "done" ? (
          <div className="py-6 space-y-5">
            <div className="text-center">
              <p className="font-medium truncate">{file?.name}</p>
              <p className="text-sm text-muted-foreground">{file ? formatFileSize(file.size) : ""}</p>
            </div>
            <StageRow current={stage} />
            <p className="text-center text-xs text-muted-foreground">
              Large snapshots are queued to the scanner and can take a little longer.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border hover:border-foreground/25",
              )}
            >
              <Upload className="w-7 h-7 mx-auto text-muted-foreground" />
              <p className="mt-3 font-medium">Drop your snapshot here</p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
              <p className="mt-2 text-xs text-muted-foreground">Supported: .json · .zip</p>
              <input
                ref={inputRef}
                type="file"
                accept=".json,.zip"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && (
              <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                {file.name.endsWith(".zip") ? (
                  <FileArchive className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <FileJson className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <button type="button" onClick={() => setFile(null)} aria-label="Remove file">
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!file} onClick={analyze}>
                Analyze snapshot
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
