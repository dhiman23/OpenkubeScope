// RBAC graph model for the map.
//
// The previous map rendered a fixed four-column chain for one selected subject
// — a detail view drawn horizontally. It could not answer the question a map
// exists to answer: "what else reaches this?" This module builds a real graph
// with the full resolution chain and supports traversal in both directions.
//
// The graph is ALWAYS focused. A 274-subject cluster is ~1,100 nodes; drawing
// all of them produces an unreadable hairball and a rendering stall.

import type { ScanDataset, RBACRole, RBACBinding } from "./rbac-scanner"
import { hasWildcard, verbsToAccessLevel, subjectKey } from "./permissions"

export type NodeType = "subject" | "binding" | "role" | "permission" | "resource"
export type RiskLevel = "critical" | "high" | "normal"

export interface GraphNode {
  id: string
  type: NodeType
  label: string
  sublabel?: string
  risk: RiskLevel
  /** Type-specific payload for the detail panel. */
  meta: Record<string, unknown>
}

export interface GraphEdge {
  from: string
  to: string
  risk: RiskLevel
}

export interface RBACGraph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  outgoing: Map<string, string[]>
  incoming: Map<string, string[]>
}

const LAYER_OF: Record<NodeType, number> = {
  subject: 0,
  binding: 1,
  role: 2,
  permission: 3,
  resource: 4,
}

const CRITICAL_RESOURCES = ["secrets", "pods/exec", "pods/attach", "serviceaccounts/token", "*"]
const HIGH_RESOURCES = ["pods/portforward", "nodes", "nodes/proxy", "clusterroles", "clusterrolebindings", "rolebindings"]

function permissionRisk(resource: string, verbs: string[]): RiskLevel {
  const level = verbsToAccessLevel(verbs)
  if (resource === "*" || (CRITICAL_RESOURCES.includes(resource) && level !== "read")) return "critical"
  if (CRITICAL_RESOURCES.includes(resource)) return "high"
  if (HIGH_RESOURCES.includes(resource)) return "high"
  if (hasWildcard(verbs)) return "high"
  return "normal"
}

function worstRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const rank = { critical: 2, high: 1, normal: 0 }
  return rank[a] >= rank[b] ? a : b
}

export function buildGraph(dataset: ScanDataset | undefined | null): RBACGraph {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()

  const addNode = (node: GraphNode) => {
    const existing = nodes.get(node.id)
    if (existing) {
      existing.risk = worstRisk(existing.risk, node.risk)
      return existing
    }
    nodes.set(node.id, node)
    return node
  }

  const addEdge = (from: string, to: string, risk: RiskLevel) => {
    edges.push({ from, to, risk })
    const out = outgoing.get(from)
    if (out) {
      if (!out.includes(to)) out.push(to)
    } else outgoing.set(from, [to])
    const inc = incoming.get(to)
    if (inc) {
      if (!inc.includes(from)) inc.push(from)
    } else incoming.set(to, [from])
  }

  const roles: RBACRole[] = dataset?.roles ?? []
  const bindings: RBACBinding[] = dataset?.bindings ?? []

  const roleIndex = new Map<string, RBACRole>()
  for (const role of roles) if (role?.name) roleIndex.set(role.name, role)

  for (const binding of bindings) {
    if (!binding?.name || !binding.roleRef?.name) continue

    const role = roleIndex.get(binding.roleRef.name) ?? null
    const roleId = `role:${binding.roleRef.kind}/${binding.roleRef.name}`
    const bindingId = `binding:${binding.kind}/${binding.namespace || "-"}/${binding.name}`

    const roleIsAdmin = (binding.roleRef.name || "").toLowerCase().includes("cluster-admin")
    const roleRisk: RiskLevel = roleIsAdmin
      ? "critical"
      : role && (role.rules ?? []).some((r) => hasWildcard(r?.verbs ?? []) || hasWildcard(r?.resources ?? []))
        ? "high"
        : "normal"

    addNode({
      id: roleId,
      type: "role",
      label: binding.roleRef.name,
      sublabel: binding.roleRef.kind,
      risk: roleRisk,
      meta: {
        kind: binding.roleRef.kind,
        namespace: role?.namespace ?? null,
        ruleCount: role?.rules?.length ?? 0,
        rules: role?.rules ?? [],
        resolved: Boolean(role),
      },
    })

    addNode({
      id: bindingId,
      type: "binding",
      label: binding.name,
      sublabel: binding.kind === "ClusterRoleBinding" ? "Cluster-wide" : binding.namespace || "namespaced",
      risk: binding.kind === "ClusterRoleBinding" && roleRisk !== "normal" ? "critical" : roleRisk,
      meta: {
        kind: binding.kind,
        namespace: binding.namespace ?? null,
        roleRef: binding.roleRef,
        subjectCount: (binding.subjects ?? []).length,
      },
    })
    addEdge(bindingId, roleId, roleRisk)

    for (const s of binding.subjects ?? []) {
      if (!s?.name) continue
      const sid = `subject:${subjectKey(s)}`
      addNode({
        id: sid,
        type: "subject",
        label: s.name,
        sublabel: s.kind,
        risk: roleIsAdmin ? "critical" : roleRisk,
        meta: { kind: s.kind, namespace: s.namespace ?? null },
      })
      addEdge(sid, bindingId, roleRisk)
    }

    if (!role) continue

    // Permission + resource layers, aggregated per resource so a role with 40
    // rules does not explode into 40 near-identical nodes.
    const perResource = new Map<string, Set<string>>()
    for (const rule of role.rules ?? []) {
      for (const resource of rule?.resources ?? []) {
        const set = perResource.get(resource) ?? new Set<string>()
        for (const verb of rule?.verbs ?? []) set.add(verb)
        perResource.set(resource, set)
      }
    }

    for (const [resource, verbSet] of perResource) {
      const verbs = Array.from(verbSet)
      const risk = permissionRisk(resource, verbs)
      const permId = `perm:${binding.roleRef.name}/${resource}`
      addNode({
        id: permId,
        type: "permission",
        label: resource === "*" ? "All Resources" : resource,
        sublabel: hasWildcard(verbs) ? "Wildcard Access" : verbs.slice(0, 3).join(", "),
        risk,
        meta: { resource, verbs, accessLevel: verbsToAccessLevel(verbs) },
      })
      addEdge(roleId, permId, risk)

      const resourceId = `resource:${resource}`
      addNode({
        id: resourceId,
        type: "resource",
        label: resource === "*" ? "Every resource" : resource,
        sublabel: role.namespace ? `in ${role.namespace}` : "cluster-wide",
        risk,
        meta: { resource, scope: role.namespace ?? "cluster-wide" },
      })
      addEdge(permId, resourceId, risk)
    }
  }

  return { nodes, edges, outgoing, incoming }
}

export interface FocusOptions {
  depth?: number
  /** Follow edges backwards as well — "who can reach this resource?". */
  reverse?: boolean
  riskyOnly?: boolean
  maxNodes?: number
}

export interface FocusedGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
}

/**
 * Breadth-first expansion from a focus node.
 *
 * Forward traversal answers "what does this subject reach?".
 * Reverse traversal answers "who can reach this resource?" — the highest-value
 * question in the product and the one the old chain view could not ask.
 */
export function focusGraph(graph: RBACGraph, focusId: string, opts: FocusOptions = {}): FocusedGraph {
  const depth = opts.depth ?? 2
  const maxNodes = opts.maxNodes ?? 60
  const start = graph.nodes.get(focusId)
  if (!start) return { nodes: [], edges: [], truncated: false }

  const visited = new Set<string>([focusId])
  let frontier = [focusId]

  for (let level = 0; level < depth; level++) {
    const next: string[] = []
    for (const id of frontier) {
      const forward = graph.outgoing.get(id) ?? []
      const backward = opts.reverse ? (graph.incoming.get(id) ?? []) : []
      // A focused subject still needs its own upstream chain to make sense, so
      // always include incoming edges for the start node.
      const alsoBackward = id === focusId ? (graph.incoming.get(id) ?? []) : backward

      for (const neighbour of [...forward, ...alsoBackward]) {
        if (visited.has(neighbour)) continue
        const node = graph.nodes.get(neighbour)
        if (!node) continue
        if (opts.riskyOnly && node.risk === "normal" && node.type !== "subject") continue
        visited.add(neighbour)
        next.push(neighbour)
        if (visited.size >= maxNodes) break
      }
      if (visited.size >= maxNodes) break
    }
    if (visited.size >= maxNodes) break
    frontier = next
    if (frontier.length === 0) break
  }

  const nodes = Array.from(visited)
    .map((id) => graph.nodes.get(id)!)
    .filter(Boolean)
  const edges = graph.edges.filter((e) => visited.has(e.from) && visited.has(e.to))

  return { nodes, edges, truncated: visited.size >= maxNodes }
}

export interface PositionedNode extends GraphNode {
  x: number
  y: number
  /** Column index in the rendered layout, not the absolute chain layer. */
  layer: number
}

export interface GraphLayout {
  nodes: PositionedNode[]
  edges: GraphEdge[]
  width: number
  height: number
  truncated: boolean
  /** Chain layers actually present, left to right — drives the column headers. */
  layers: NodeType[]
}

/**
 * Layered left-to-right layout.
 *
 * Deliberately NOT force-directed: the RBAC chain has an inherent direction,
 * and a force layout both destroys it and redraws differently on every load.
 * A stable layout is what makes the picture a mental model instead of a puzzle.
 */
export function layoutGraph(
  focused: FocusedGraph,
  opts: { columnWidth?: number; rowHeight?: number; padding?: number } = {},
): GraphLayout {
  const columnWidth = opts.columnWidth ?? 220
  const rowHeight = opts.rowHeight ?? 72
  const padding = opts.padding ?? 32

  const byLayer = new Map<number, GraphNode[]>()
  for (const node of focused.nodes) {
    const layer = LAYER_OF[node.type]
    const list = byLayer.get(layer)
    if (list) list.push(node)
    else byLayer.set(layer, [node])
  }

  // Compact to the layers actually present. Positioning by absolute chain
  // layer pushes a resource-focused graph (layers 3-4 only) a thousand pixels
  // off-screen, which renders as an empty canvas.
  const presentLayers = Array.from(byLayer.keys()).sort((a, b) => a - b)
  const columnOf = new Map<number, number>()
  presentLayers.forEach((layer, index) => columnOf.set(layer, index))

  // Order within a layer by risk, then label, so the layout is deterministic.
  const riskRank = { critical: 0, high: 1, normal: 2 }
  const positioned: PositionedNode[] = []
  let maxRows = 0

  for (const [layer, list] of Array.from(byLayer.entries()).sort((a, b) => a[0] - b[0])) {
    const sorted = [...list].sort(
      (a, b) => riskRank[a.risk] - riskRank[b.risk] || a.label.localeCompare(b.label),
    )
    maxRows = Math.max(maxRows, sorted.length)
    const column = columnOf.get(layer) ?? 0
    sorted.forEach((node, index) => {
      positioned.push({
        ...node,
        layer: column,
        x: padding + column * columnWidth,
        y: padding + index * rowHeight,
      })
    })
  }

  // Columns are top-aligned, not centred. Centring against the tallest column
  // pushes a two-node column into the middle of a several-thousand-pixel
  // canvas, which reads as an empty graph until you scroll for it.

  const TYPE_OF_LAYER: NodeType[] = ["subject", "binding", "role", "permission", "resource"]

  return {
    nodes: positioned,
    edges: focused.edges,
    width: padding * 2 + presentLayers.length * columnWidth,
    height: padding * 2 + maxRows * rowHeight,
    truncated: focused.truncated,
    layers: presentLayers.map((layer) => TYPE_OF_LAYER[layer]),
  }
}

export const LAYER_LABEL: Record<NodeType, string> = {
  subject: "Subject",
  binding: "Binding",
  role: "Role",
  permission: "Permission",
  resource: "Resource",
}

/** Candidate focus nodes, most dangerous first — the map's entry picker. */
export function focusCandidates(graph: RBACGraph, type: NodeType, limit = 50): GraphNode[] {
  const riskRank = { critical: 0, high: 1, normal: 2 }
  return Array.from(graph.nodes.values())
    .filter((n) => n.type === type)
    .sort((a, b) => riskRank[a.risk] - riskRank[b.risk] || a.label.localeCompare(b.label))
    .slice(0, limit)
}

export interface AttackPath {
  nodes: GraphNode[]
  narrative: string
}

/**
 * Detect a known escalation chain from a focused subject.
 * Reported only when the chain actually exists in the graph — no speculation.
 */
export function findAttackPath(graph: RBACGraph, subjectId: string): AttackPath | null {
  const subject = graph.nodes.get(subjectId)
  if (!subject || subject.type !== "subject") return null

  const path: GraphNode[] = [subject]
  let current = subjectId
  let dangerous = false

  for (let hop = 0; hop < 4; hop++) {
    const neighbours = (graph.outgoing.get(current) ?? [])
      .map((id) => graph.nodes.get(id)!)
      .filter(Boolean)
      .sort((a, b) => (a.risk === "critical" ? -1 : 1) - (b.risk === "critical" ? -1 : 1))
    const next = neighbours.find((n) => n.risk === "critical") ?? neighbours.find((n) => n.risk === "high")
    if (!next) break
    if (next.risk === "critical") dangerous = true
    path.push(next)
    current = next.id
  }

  if (!dangerous || path.length < 3) return null

  const resource = path[path.length - 1]
  const role = path.find((n) => n.type === "role")
  const narrative = `${subject.label} (${subject.sublabel}) is granted ${role?.label ?? "a privileged role"}, which reaches ${resource.label}. An attacker compromising this identity inherits that access directly — no further escalation step is required.`

  return { nodes: path, narrative }
}
