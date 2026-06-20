import { Router } from "express"
import { requireAuth, requireCredentialsChanged } from "../auth/middleware"
import {
  listWorkspaces,
  getOwnedWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  setActiveWorkspace,
} from "../repositories/workspaces"
import { listClusters, createCluster, deleteCluster } from "../repositories/clusters"

export const workspacesRouter = Router()
workspacesRouter.use(requireAuth, requireCredentialsChanged)

workspacesRouter.get("/", async (req, res) => {
  res.json({ workspaces: await listWorkspaces(req.user!.id) })
})

workspacesRouter.post("/", async (req, res) => {
  const { name, description } = req.body ?? {}
  if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "name required" })
  try {
    const ws = await createWorkspace(req.user!.id, name, description)
    res.status(201).json({ workspace: ws })
  } catch (err) {
    // UNIQUE(user_id, name) violation -> 409
    const msg = err instanceof Error ? err.message : "Failed"
    res.status(/duplicate key|unique/i.test(msg) ? 409 : 500).json({ error: msg })
  }
})

workspacesRouter.patch("/:id", async (req, res) => {
  const { name, description } = req.body ?? {}
  const ws = await updateWorkspace(req.user!.id, req.params.id, { name, description })
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  res.json({ workspace: ws })
})

workspacesRouter.delete("/:id", async (req, res) => {
  const ok = await deleteWorkspace(req.user!.id, req.params.id)
  if (!ok) return res.status(404).json({ error: "Workspace not found" })
  res.json({ deleted: true })
})

workspacesRouter.post("/:id/activate", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.id)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  await setActiveWorkspace(req.user!.id, ws.id)
  res.json({ active: ws.id })
})

// ---- clusters (nested under a workspace, ownership-checked) ----

workspacesRouter.get("/:id/clusters", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.id)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  res.json({ clusters: await listClusters(ws.id) })
})

workspacesRouter.post("/:id/clusters", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.id)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const { name, kubeconfig } = req.body ?? {}
  if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "name required" })
  const cluster = await createCluster(ws.id, name, kubeconfig)
  res.status(201).json({ cluster })
})

workspacesRouter.delete("/:id/clusters/:clusterId", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.id)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const ok = await deleteCluster(ws.id, req.params.clusterId)
  if (!ok) return res.status(404).json({ error: "Cluster not found" })
  res.json({ deleted: true })
})
