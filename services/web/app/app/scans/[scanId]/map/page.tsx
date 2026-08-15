"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeftRight,
  Crosshair,
  List,
  Maximize2,
  Network,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useScan } from "@/components/scan/scan-context"
import {
  buildGraph,
  findAttackPath,
  focusCandidates,
  focusGraph,
  layoutGraph,
  LAYER_LABEL,
  type GraphNode,
  type NodeType,
  type RiskLevel,
} from "@/lib/graph"

const NODE_WIDTH = 176
const NODE_HEIGHT = 52

const RISK_STROKE: Record<RiskLevel, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  // --border is a hairline colour meant for dividers against a card; used as an
  // edge stroke it made ordinary grants effectively invisible, so the graph
  // read as a set of disconnected boxes.
  normal: "var(--muted-foreground)",
}

const RISK_WIDTH: Record<RiskLevel, number> = { critical: 2, high: 1.75, normal: 1.25 }

export default function RbacMapPage() {
  const { scan, scanId } = useScan()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const focusId = searchParams.get("focus")
  const depth = Number(searchParams.get("depth") ?? 3)
  const riskyOnly = searchParams.get("risky") === "1"

  // Resources and permissions have no outgoing edges — forward traversal from
  // one finds nothing. "Who can reach this?" is the only useful question at
  // that end of the chain, so reverse is the default there.
  const dirParam = searchParams.get("dir")
  const reverse = dirParam ? dirParam === "reverse" : Boolean(focusId && /^(resource|perm):/.test(focusId))

  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [pickerQuery, setPickerQuery] = useState("")
  const [pickerType, setPickerType] = useState<NodeType>("subject")
  // A node-link diagram is not usable for everyone, and a 60-node chart cannot
  // be scanned by keyboard alone — the same subgraph is always available as a
  // list, and both views drive the same focus/selection state.
  const [view, setView] = useState<"graph" | "table">("graph")
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const graph = useMemo(() => buildGraph(scan.dataset), [scan.dataset])

  const layout = useMemo(() => {
    if (!focusId || !graph.nodes.has(focusId)) return null
    return layoutGraph(focusGraph(graph, focusId, { depth, reverse, riskyOnly }), {
      columnWidth: 240,
      rowHeight: 76,
    })
  }, [graph, focusId, depth, reverse, riskyOnly])

  const attackPath = useMemo(
    () => (focusId && focusId.startsWith("subject:") ? findAttackPath(graph, focusId) : null),
    [graph, focusId],
  )

  useEffect(() => {
    setSelected(null)
    // A new focus always starts fitted: keeping the previous pan would drop the
    // reader into empty space beside the new subgraph.
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [focusId, depth, reverse, riskyOnly])

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  const candidates = useMemo(() => {
    const list = focusCandidates(graph, pickerType, 400)
    const q = pickerQuery.toLowerCase().trim()
    return (q ? list.filter((node) => node.label.toLowerCase().includes(q)) : list).slice(0, 60)
  }, [graph, pickerType, pickerQuery])

  if (graph.nodes.size === 0) {
    return (
      <div className="data-card p-10 text-center">
        <p className="font-medium">Nothing to map</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This snapshot has no resolvable bindings, so there is no authorization chain to draw.
        </p>
      </div>
    )
  }

  // The map is always focused: a 274-subject cluster is ~1,100 nodes, which is
  // an unreadable hairball and a rendering stall. Entering without a focus
  // shows a picker rather than everything.
  if (!focusId || !layout) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">RBAC map</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a starting point. The map expands outward from it — drawing every node at once would be unreadable.
          </p>
        </div>

        <div className="data-card p-6">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {(
              [
                ["subject", "Subjects"],
                ["role", "Roles"],
                ["resource", "Resources"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPickerType(value)}
                aria-pressed={pickerType === value}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  pickerType === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-foreground/80 hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}

            <div className="relative flex-1 min-w-[200px] max-w-sm ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Filter…"
                className="pl-9 h-9 rounded-xl"
              />
            </div>
          </div>

          {pickerType === "resource" && (
            <p className="mb-3 text-sm text-muted-foreground">
              Focusing a resource answers <span className="text-foreground">&ldquo;who can reach this?&rdquo;</span> —
              the graph opens with reverse traversal already on.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setParam("focus", node.id)}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-left transition-colors hover:border-foreground/25 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="w-1.5 h-8 rounded-full shrink-0"
                  style={{ background: RISK_STROKE[node.risk] }}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{node.label}</span>
                  <span className="block text-xs text-muted-foreground truncate">{node.sublabel}</span>
                </span>
              </button>
            ))}
          </div>

          {candidates.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
        </div>
      </div>
    )
  }

  const focusNode = graph.nodes.get(focusId)!

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm">
          <Crosshair className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium truncate max-w-[220px]">{focusNode.label}</span>
          <span className="text-xs text-muted-foreground">{focusNode.sublabel}</span>
          <button
            type="button"
            onClick={() => setParam("focus", null)}
            aria-label="Clear focus and choose a different starting point"
            title="Clear focus"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </span>

        <select
          value={String(depth)}
          onChange={(e) => setParam("depth", e.target.value)}
          className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="1">Depth 1</option>
          <option value="2">Depth 2</option>
          <option value="3">Depth 3</option>
          <option value="4">Depth 4</option>
        </select>

        <Button
          variant={reverse ? "default" : "outline"}
          size="sm"
          className={cn("rounded-xl", !reverse && "bg-transparent")}
          onClick={() => setParam("dir", reverse ? "forward" : "reverse")}
          title="Follow edges backwards — who can reach this?"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
          Reverse
        </Button>

        {/* The toggle's state is stated in words, not only by the switch position. */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-1.5 transition-colors",
            riskyOnly ? "border-sev-critical/50 bg-sev-critical-bg" : "border-border",
          )}
        >
          <Switch id="risky-only" checked={riskyOnly} onCheckedChange={(on) => setParam("risky", on ? "1" : null)} />
          <Label
            htmlFor="risky-only"
            className={cn("cursor-pointer text-sm", riskyOnly ? "font-medium text-sev-critical" : "text-foreground/80")}
          >
            {riskyOnly ? "Risky only: on" : "Risky only: off"}
          </Label>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground tabular">
            {layout.nodes.length} nodes · {layout.edges.length} edges
          </span>
          <div className="flex items-center gap-1 rounded-xl border border-border p-0.5">
            <button
              type="button"
              onClick={() => setView("graph")}
              aria-pressed={view === "graph"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === "graph" ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted",
              )}
            >
              <Network className="w-3.5 h-3.5" aria-hidden="true" />
              Graph
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              aria-pressed={view === "table"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === "table" ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted",
              )}
            >
              <List className="w-3.5 h-3.5" aria-hidden="true" />
              List
            </button>
          </div>
        </div>
      </div>

      {attackPath && (
        <div className="data-card p-4 border-l-2 border-l-sev-critical">
          <p className="text-[11px] uppercase tracking-wide text-sev-critical font-medium">Attack path</p>
          <p className="mt-1.5 text-sm leading-relaxed">{attackPath.narrative}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {attackPath.nodes.map((node) => node.label).join(" → ")}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {view === "graph" ? (
          <GraphCanvas
            layout={layout}
            focusId={focusId}
            selected={selected}
            onSelect={setSelected}
            zoom={zoom}
            pan={pan}
            onZoom={setZoom}
            onPan={setPan}
          />
        ) : (
          <GraphTable
            layout={layout}
            focusId={focusId}
            selected={selected}
            onSelect={setSelected}
            onFocus={(id) => setParam("focus", id)}
          />
        )}

        <NodeDetail node={selected ?? focusNode} scanId={scanId} onFocus={(id) => setParam("focus", id)} />
      </div>
    </div>
  )
}

type Layout = ReturnType<typeof layoutGraph>

const PADDING = 40

/**
 * The graph canvas.
 *
 * Previously this was a fixed-size SVG in a scrolling box: no zoom, no way back
 * to a fitted view once scrolled, edges with no arrowheads (so the direction of
 * a grant was ambiguous), labels silently truncated at 20 characters with no
 * way to read the rest, and nodes that only responded to a mouse click.
 */
function GraphCanvas({
  layout,
  focusId,
  selected,
  onSelect,
  zoom,
  pan,
  onZoom,
  onPan,
}: {
  layout: Layout
  focusId: string
  selected: GraphNode | null
  onSelect: (node: GraphNode) => void
  zoom: number
  pan: { x: number; y: number }
  onZoom: (value: number) => void
  onPan: (value: { x: number; y: number }) => void
}) {
  const fullWidth = Math.max(layout.width, 640) + PADDING * 2
  const fullHeight = Math.max(layout.height, 280) + PADDING * 2

  // viewBox drives both zoom and pan, so "fit" is simply zoom 1 / pan 0 and can
  // never end up showing empty space.
  const viewWidth = fullWidth / zoom
  const viewHeight = fullHeight / zoom
  const viewX = -PADDING + pan.x
  const viewY = -PADDING + pan.y

  const clampPan = (next: { x: number; y: number }) => ({
    x: Math.max(-PADDING, Math.min(next.x, fullWidth - viewWidth)),
    y: Math.max(-PADDING, Math.min(next.y, fullHeight - viewHeight)),
  })

  const step = 80 / zoom

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      onPan(clampPan({ x: pan.x + move.x, y: pan.y + move.y }))
      return
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault()
      onZoom(Math.min(3, Number((zoom + 0.25).toFixed(2))))
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault()
      onZoom(Math.max(0.5, Number((zoom - 0.25).toFixed(2))))
    }
    if (event.key === "0") {
      event.preventDefault()
      onZoom(1)
      onPan({ x: 0, y: 0 })
    }
  }

  return (
    <div className="data-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex gap-0 text-[11px] uppercase tracking-wide text-muted-foreground">
          {layout.layers.map((type) => (
            <span key={type} style={{ width: 240 * Math.min(1, zoom) }}>
              {LAYER_LABEL[type]}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <IconButton
            label="Zoom out"
            onClick={() => onZoom(Math.max(0.5, Number((zoom - 0.25).toFixed(2))))}
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="w-4 h-4" aria-hidden="true" />
          </IconButton>
          <span className="tabular w-12 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <IconButton
            label="Zoom in"
            onClick={() => onZoom(Math.min(3, Number((zoom + 0.25).toFixed(2))))}
            disabled={zoom >= 3}
          >
            <ZoomIn className="w-4 h-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Fit to screen"
            onClick={() => {
              onZoom(1)
              onPan({ x: 0, y: 0 })
            }}
          >
            <Maximize2 className="w-4 h-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
          className="block max-h-[65vh] w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-label="RBAC authorization graph. Use arrow keys to pan, plus and minus to zoom, 0 to fit. Tab to move between nodes."
        >
          <defs>
            {/* Arrowheads: a grant has a direction, and a plain line does not
                say which way it points. */}
            {(["critical", "high", "normal"] as RiskLevel[]).map((risk) => (
              <marker
                key={risk}
                id={`arrow-${risk}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={RISK_STROKE[risk]} />
              </marker>
            ))}
          </defs>

          {layout.edges.map((edge, index) => {
            const from = layout.nodes.find((n) => n.id === edge.from)
            const to = layout.nodes.find((n) => n.id === edge.to)
            if (!from || !to) return null
            const x1 = from.x + NODE_WIDTH
            const y1 = from.y + NODE_HEIGHT / 2
            const x2 = to.x
            const y2 = to.y + NODE_HEIGHT / 2
            const mid = (x1 + x2) / 2
            return (
              <path
                key={`${edge.from}-${edge.to}-${index}`}
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={RISK_STROKE[edge.risk]}
                strokeWidth={RISK_WIDTH[edge.risk]}
                markerEnd={`url(#arrow-${edge.risk})`}
                // Raised from 0.4: at 0.4 on a dark surface the ordinary edges
                // were close to invisible.
                opacity={edge.risk === "normal" ? 0.65 : 0.9}
              />
            )
          })}

          {layout.nodes.map((node) => {
            const isFocus = node.id === focusId
            const isSelected = selected?.id === node.id
            const fullLabel = `${node.label}${node.sublabel ? ` — ${node.sublabel}` : ""}`
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => onSelect(node)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelect(node)
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${node.type}: ${fullLabel}. Risk ${node.risk}.`}
                className="cursor-pointer focus-visible:outline-none"
              >
                {/* Native tooltip carries the untruncated name. */}
                <title>{fullLabel}</title>
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={10}
                  fill="var(--card)"
                  stroke={isSelected || isFocus ? "var(--primary)" : RISK_STROKE[node.risk]}
                  strokeWidth={isSelected || isFocus ? 2 : RISK_WIDTH[node.risk]}
                />
                {node.risk !== "normal" && (
                  <text x={NODE_WIDTH - 14} y={18} fontSize={11} fill={RISK_STROKE[node.risk]}>
                    ⚠
                  </text>
                )}
                <text x={12} y={22} fontSize={12} fontWeight={500} fill="var(--foreground)">
                  {node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label}
                </text>
                <text x={12} y={38} fontSize={10} fill="var(--muted-foreground)">
                  {(node.sublabel ?? "").length > 24 ? `${node.sublabel!.slice(0, 23)}…` : node.sublabel}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Minimap: where the viewport sits in the whole subgraph. */}
        {zoom > 1 && (
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-border bg-background/90 p-1 shadow-sm">
            <svg width={128} height={80} viewBox={`${-PADDING} ${-PADDING} ${fullWidth} ${fullHeight}`} aria-hidden="true">
              {layout.nodes.map((node) => (
                <rect
                  key={node.id}
                  x={node.x}
                  y={node.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={6}
                  fill={node.id === focusId ? "var(--primary)" : RISK_STROKE[node.risk]}
                  opacity={0.65}
                />
              ))}
              <rect
                x={viewX}
                y={viewY}
                width={viewWidth}
                height={viewHeight}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={12}
              />
            </svg>
          </div>
        )}
      </div>

      {layout.truncated && (
        <p className="px-4 pb-3 pt-2 text-xs text-sev-medium">
          Graph truncated at 60 nodes. Reduce depth or turn on &ldquo;Risky only&rdquo; to narrow it.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: RISK_STROKE.critical }} aria-hidden="true" />
          Critical
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: RISK_STROKE.high }} aria-hidden="true" />
          High
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/60" aria-hidden="true" />
          Normal
        </span>
        <span className="ml-auto">Arrows point from grant holder to what it reaches.</span>
      </div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

const RISK_LABEL: Record<RiskLevel, string> = { critical: "Critical", high: "High", normal: "Normal" }

/**
 * The list alternative.
 *
 * Same nodes, same selection, same focus actions — for readers who cannot use a
 * node-link diagram efficiently, and for anyone who just wants to search it.
 */
function GraphTable({
  layout,
  focusId,
  selected,
  onSelect,
  onFocus,
}: {
  layout: Layout
  focusId: string
  selected: GraphNode | null
  onSelect: (node: GraphNode) => void
  onFocus: (id: string) => void
}) {
  const degree = new Map<string, number>()
  for (const edge of layout.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1)
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1)
  }

  const rows = [...layout.nodes].sort((a, b) => {
    const order: Record<RiskLevel, number> = { critical: 0, high: 1, normal: 2 }
    return order[a.risk] - order[b.risk] || a.label.localeCompare(b.label)
  })

  return (
    <div className="data-card overflow-hidden">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Nodes reachable from the focused object, worst risk first. Select a row to see its detail.
        </caption>
        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-foreground/80">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-semibold">Object</th>
            <th scope="col" className="px-4 py-2.5 text-left font-semibold">Layer</th>
            <th scope="col" className="px-4 py-2.5 text-left font-semibold">Risk</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Connections</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((node) => (
            <tr
              key={node.id}
              className={cn(
                "cursor-pointer transition-colors hover:bg-muted/40",
                selected?.id === node.id && "bg-muted/60",
                node.id === focusId && "bg-primary/5",
              )}
              onClick={() => onSelect(node)}
            >
              <th scope="row" className="max-w-0 px-4 py-2.5 text-left font-normal">
                <span className="block truncate font-medium" title={node.label}>
                  {node.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground" title={node.sublabel}>
                  {node.sublabel}
                </span>
              </th>
              <td className="px-4 py-2.5 text-muted-foreground">{LAYER_LABEL[node.type]}</td>
              <td className="px-4 py-2.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5",
                    node.risk === "critical" && "text-sev-critical",
                    node.risk === "high" && "text-sev-high",
                    node.risk === "normal" && "text-muted-foreground",
                  )}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: RISK_STROKE[node.risk] }}
                    aria-hidden="true"
                  />
                  {RISK_LABEL[node.risk]}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{degree.get(node.id) ?? 0}</td>
              <td className="px-4 py-2.5 text-right">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onFocus(node.id)
                  }}
                  className="rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Focus
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {layout.truncated && (
        <p className="border-t border-border px-4 py-3 text-xs text-sev-medium">
          Truncated at 60 nodes. Reduce depth or turn on &ldquo;Risky only&rdquo; to narrow it.
        </p>
      )}
    </div>
  )
}

function NodeDetail({
  node,
  scanId,
  onFocus,
}: {
  node: GraphNode
  scanId: string
  onFocus: (id: string) => void
}) {
  const meta = node.meta as Record<string, unknown>

  return (
    <div className="data-card p-5 h-fit lg:sticky lg:top-32">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Node detail</p>
      <h3 className="mt-1 text-lg font-semibold break-words">{node.label}</h3>
      <p className="text-sm text-muted-foreground">{node.sublabel}</p>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Type</dt>
          <dd className="capitalize">{node.type}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Risk</dt>
          <dd
            className={
              node.risk === "critical" ? "text-sev-critical" : node.risk === "high" ? "text-sev-high" : ""
            }
          >
            {node.risk === "normal" ? "Normal" : node.risk === "high" ? "High" : "Critical"}
          </dd>
        </div>
        {typeof meta.ruleCount === "number" && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Rules</dt>
            <dd className="tabular">{meta.ruleCount}</dd>
          </div>
        )}
        {typeof meta.subjectCount === "number" && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Subjects</dt>
            <dd className="tabular">{meta.subjectCount}</dd>
          </div>
        )}
        {Array.isArray(meta.verbs) && (
          <div>
            <dt className="text-muted-foreground mb-1">Verbs</dt>
            <dd className="text-xs">{(meta.verbs as string[]).join(", ")}</dd>
          </div>
        )}
        {meta.resolved === false && (
          <p className="text-xs text-sev-medium">
            This role is referenced by a binding but is not present in the snapshot.
          </p>
        )}
      </dl>

      <div className="mt-4 flex flex-col gap-2">
        <Button variant="outline" size="sm" className="rounded-xl bg-transparent" onClick={() => onFocus(node.id)}>
          Focus this node
        </Button>
        {node.type === "subject" && (
          <Link href={`/app/scans/${scanId}/viewer?q=${encodeURIComponent(node.label)}`}>
            <Button variant="outline" size="sm" className="rounded-xl bg-transparent w-full">
              Open in Viewer
            </Button>
          </Link>
        )}
        {node.type === "role" && (
          <Link href={`/app/scans/${scanId}/findings?q=${encodeURIComponent(node.label)}`}>
            <Button variant="outline" size="sm" className="rounded-xl bg-transparent w-full">
              Findings for this role
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}
