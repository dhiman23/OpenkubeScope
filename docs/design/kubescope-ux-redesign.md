# KubeScope — Experience & Information Architecture Redesign

**Version:** 2.0 (proposed)
**Date:** 2026-08-13
**Scope:** Full UX + IA redesign of the KubeScope application shell and all analysis surfaces.
**Audience:** Product, design, frontend, and backend engineering.
**Status:** Design specification — not yet implemented.

---

## 0. Executive summary

### 0.1 The core diagnosis

KubeScope's current Dashboard is asked to do two structurally incompatible jobs at the same time:

1. **Fleet management** — "what snapshots do I have, and what shape are they in?"
2. **Single-scan analysis** — "what is wrong inside *this specific* snapshot?"

These have different time horizons, different mental models, and different primary objects. Merging them produces the single defect that undermines the whole product: **the user cannot tell which scan they are looking at, and never explicitly chose it.**

This is not a styling problem. It is verifiable in the code:

| Symptom | Evidence |
| --- | --- |
| The app silently picks a scan for you | `app/app/page.tsx:114-117` — `setActiveScan(savedScans[0])` on load. The user never selected it. |
| Scan selection is invisible to the URL | Active scan is persisted via `setActiveScanId()` into local state/storage and broadcast with a `kubescope-scan-updated` CustomEvent (`app/app/page.tsx:340-345`). A URL like `/app/rbac-viewer` means something different for every user and every session. |
| Charts are visually dishonest | `app/app/page.tsx:147-171` multiplies the Critical bar by `×3`, High by `×2`, Medium by `×1.5`. A viewer cannot compare bar lengths. In a security product, exaggerated risk bars destroy trust the first time someone checks the math. |
| Navigation has no hierarchy | `components/app/sidebar.tsx:26-35` — Dashboard, Clusters, RBAC Viewer, RBAC Map, Risk Findings, Reports, Billing, Settings are one flat list of eight peers. Analysis pages and account pages sit at the same level. |
| Global search is a decoration | `components/app/header.tsx:95-107` renders an input with a `⌘K` hint and no `onChange`, no handler, no results. |
| The "map" is not a map | `app/app/rbac-map/page.tsx` renders a single linear chain (`SubjectNode → BindingNode → RoleNode → PermissionsNode`) for one selected subject. It cannot answer "who else reaches this secret?" |
| Motion is used as decoration, not signal | Staggered `delay: 0.6 + index * 0.1` chains throughout the dashboard mean the last card lands ~1.2s after paint. Enterprise operators re-load these pages dozens of times a day. |

### 0.2 The fix in one sentence

**Make the scan an explicit, addressable, first-class object in the URL, and split the product into two clearly separated modes: a Fleet mode you manage, and an Analysis Workspace you investigate inside.**

### 0.3 The three structural moves

1. **Scan-scoped routing.** Every analysis route becomes `/app/scans/{scanId}/...`. The scan is in the URL, so it is shareable, bookmarkable, back-button-correct, and impossible to be ambiguous about. This alone eliminates the reported confusion — a header chip is a *label* for the problem; routing is the *cure*.
2. **Two-mode shell.** Fleet mode (Home, Clusters, Reports library, Settings) uses one chrome. Analysis mode uses a different chrome with a persistent Scan Context Bar and a scan-scoped nav. The user always knows which world they are in.
3. **Explainable scoring.** A Security Score is only useful if a security engineer can defend it in a meeting. Every score in this design opens a breakdown showing exactly which control domains cost how many points. See Appendix A.

### 0.4 What this design requires from the backend

The requested UI needs data that does not exist in the current model (`lib/rbac-scanner.ts:86-99`). This is called out in full in **Appendix B** and must be planned as backend work, not faked in the UI:

| Field requested | Exists today? | Source |
| --- | --- | --- |
| Security Score | No | Derivable — Appendix A formula |
| Compliance % | No | Needs CIS Kubernetes Benchmark RBAC control mapping |
| Namespace count | No (derivable) | Compute during parse |
| Kubernetes version | **No — not in an RBAC snapshot** | Requires collector to emit `metadata.json` |
| Scan duration | No | Scanner service must record `startedAt`/`completedAt` |
| Environment (prod/staging/dev) | No | User-assigned label on the cluster |
| MITRE ATT&CK mapping | No | Static mapping table per detection rule |
| Attack paths | No (derivable) | Graph traversal in scanner |
| HostPath / Privileged / Anonymous | Partially | HostPath & Privileged are **Pod Security**, not RBAC — see §13.7 |

> **Design integrity rule:** no widget in this spec renders a placeholder number. If a data source is not yet available, the widget ships in a documented "Not collected" state with a one-click path to enable collection. Fabricated security metrics are worse than absent ones.

---

## 1. Complete information architecture

### 1.1 Object model

The current app conflates three distinct objects under the word "scan". Separating them is the foundation of the IA.

```
Organization
└── Workspace                    (billing + membership boundary — exists today)
    └── Cluster                  (a long-lived logical cluster: "Production EU")
        ├── identity: name, environment, owner, tags
        └── Snapshot  (aka Scan) (one point-in-time RBAC capture)
            ├── metadata: uploadedAt, duration, k8sVersion, source, status
            ├── inventory: users, groups, SAs, roles, clusterRoles, bindings…
            ├── posture:   securityScore, compliance, namespace scores
            └── findings:  risk findings, attack paths
```

**Why this matters:** the current model treats every upload as an independent island. But the questions users actually ask — *"is Production better or worse than last week?"* — are **cluster-level, across snapshots**. Without a Cluster entity there is nothing to trend against and "Compare Previous Scan" has no defined meaning.

**Cluster identity rule:** a cluster is identified by a stable key (user-confirmed on first upload, then remembered): `workspaceId + clusterName`. Uploading `production-rbac.json` twice creates **one cluster with two snapshots**, not two clusters.

### 1.2 Two-mode structure

```
┌──────────────────────── FLEET MODE ─────────────────────────┐
│  Question: "What do I have, and where should I look first?"  │
│                                                              │
│  /app                     Home — fleet overview / empty state│
│  /app/clusters            All clusters                       │
│  /app/clusters/{id}       Cluster detail + snapshot history  │
│  /app/reports             Report library (cross-cluster)     │
│  /app/settings            Workspace, members, integrations   │
│  /app/billing             Plan & usage                       │
└──────────────────────────────────────────────────────────────┘
                              │
                    [ Open Analysis ] ← explicit user act
                              ▼
┌────────────────────── ANALYSIS MODE ────────────────────────┐
│  Question: "What is wrong inside THIS snapshot?"             │
│  Every route is scoped to exactly one scanId.                │
│                                                              │
│  /app/scans/{scanId}                    Analysis Dashboard   │
│  /app/scans/{scanId}/viewer             RBAC Viewer          │
│  /app/scans/{scanId}/map                RBAC Map             │
│  /app/scans/{scanId}/findings           Risk Findings        │
│  /app/scans/{scanId}/findings/{id}      Finding detail       │
│  /app/scans/{scanId}/inventory          RBAC Inventory       │
│  /app/scans/{scanId}/namespaces         Namespace posture    │
│  /app/scans/{scanId}/reports            Reports for scan     │
│  /app/scans/{scanId}/compare/{otherId}  Scan diff            │
└──────────────────────────────────────────────────────────────┘
```

**The Analysis Dashboard cannot be reached without a `scanId` in the path.** The IA makes the reported bug structurally unrepresentable.

### 1.3 Complete route table

| Route | Screen | Scope | Today |
| --- | --- | --- | --- |
| `/app` | Home (empty state OR fleet overview) | Workspace | `app/app/page.tsx` — rewrite |
| `/app/clusters` | Cluster fleet list | Workspace | `app/app/clusters/page.tsx` — refocus |
| `/app/clusters/{clusterId}` | Cluster detail, snapshot timeline | Cluster | **new** |
| `/app/scans/{scanId}` | Analysis Dashboard | Snapshot | from `app/app/page.tsx` |
| `/app/scans/{scanId}/viewer` | RBAC Viewer | Snapshot | `app/app/rbac-viewer/page.tsx` |
| `/app/scans/{scanId}/map` | RBAC Map (graph) | Snapshot | `app/app/rbac-map/page.tsx` — rebuild |
| `/app/scans/{scanId}/findings` | Risk Findings | Snapshot | `app/app/risk-findings/page.tsx` |
| `/app/scans/{scanId}/findings/{findingId}` | Finding detail (deep-linkable) | Finding | **new** |
| `/app/scans/{scanId}/inventory` | RBAC Inventory | Snapshot | **new** |
| `/app/scans/{scanId}/namespaces` | Namespace posture | Snapshot | **new** |
| `/app/scans/{scanId}/reports` | Reports for this scan | Snapshot | from `app/app/reports/page.tsx` |
| `/app/scans/{scanId}/compare/{baselineId}` | Scan comparison | 2 snapshots | from `app/app/reports/diff/page.tsx` |
| `/app/reports` | Report library | Workspace | `app/app/reports/page.tsx` — refocus |
| `/app/settings` · `/app/billing` | Account | Workspace | unchanged |

### 1.4 URL-encoded view state

All cross-page filters live in the query string, never in a global store. This makes every view shareable — the single highest-leverage collaboration feature in a security tool.

```
/app/scans/abc123/viewer?kind=ServiceAccount&ns=production&access=admin&q=jenkins
/app/scans/abc123/findings?severity=critical&ns=payments&status=open
/app/scans/abc123/map?focus=sa:production/jenkins&depth=2
```

**Namespace filter propagation** (the requirement "clicking a namespace filters every page") is implemented as: clicking a namespace sets `?ns=<name>`, and every scan-scoped route preserves `ns` when navigating between siblings. A dismissible **Filter Context Bar** shows the active constraint so users are never mysteriously looking at a subset.

### 1.5 Redirect / migration map

| Old | New |
| --- | --- |
| `/app` (with scans) | `/app` → fleet overview (no auto-selection) |
| `/app/rbac-viewer` | 302 → `/app/scans/{lastViewedScanId}/viewer`, or `/app` if none |
| `/app/rbac-map` | 302 → `/app/scans/{lastViewedScanId}/map` |
| `/app/risk-findings` | 302 → `/app/scans/{lastViewedScanId}/findings` |
| `/app/reports/diff` | **kept as-is** (see note) |

> **Implementation note on `/app/reports/diff`.** The spec originally called for redirecting it to the scan-scoped comparison. It was left intact instead: it diffs *reports*, which is a different operation from diffing *snapshots*, and the workspace report library links to it. The new `/app/scans/{a}/compare/{b}` is additive. Retiring the report diff should be a deliberate product decision, not a side effect of a routing change.

`lastViewedScanId` is a **convenience** for redirecting legacy links only. It is never used to silently populate an analysis view — if it is missing, the user lands on Home and picks.

---

## 2. Navigation redesign

### 2.1 Fleet mode chrome

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ▣ KubeScope        [ 🔍 Search clusters, snapshots, subjects…      ⌘K ]     │
│                                       Workspace: Acme Prod ▾   ◐   ⚙   (SD)│
├──────────────┬─────────────────────────────────────────────────────────────┤
│              │                                                             │
│  OVERVIEW    │                                                             │
│  ▸ Home      │                   [ fleet content ]                         │
│  ▸ Clusters  │                                                             │
│  ▸ Reports   │                                                             │
│              │                                                             │
│  ACCOUNT     │                                                             │
│  ▸ Settings  │                                                             │
│  ▸ Billing   │                                                             │
│              │                                                             │
│  ────────────│                                                             │
│  + Upload    │                                                             │
│    Snapshot  │                                                             │
└──────────────┴─────────────────────────────────────────────────────────────┘
```

Six items in two labelled groups, versus today's flat eight. Analysis destinations are **absent** — they do not exist without a scan.

### 2.2 Analysis mode chrome

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ▣ KubeScope   [ 🔍 Search this snapshot…  ⌘K ]     Acme Prod ▾  ◐  ⚙  (SD) │
├────────────────────────────────────────────────────────────────────────────┤
│ ← All clusters │ ⬢ Production Cluster · PROD    Score 84  Crit 103  High 127│
│                │ prod-rbac-0813.json · 5m ago · k8s 1.31 · 42 ns · 12.4s    │
│                │        [Compare ▾] [Export ▾] [Report] [Scan: Aug 13 ▾]    │
├──────────────┬─────────────────────────────────────────────────────────────┤
│ ANALYSIS     │                                                             │
│ ▸ Dashboard  │                                                             │
│ ▸ Findings ⁹⁵│                  [ analysis content ]                       │
│ ▸ RBAC Viewer│                                                             │
│ ▸ RBAC Map   │                                                             │
│ ▸ Inventory  │                                                             │
│ ▸ Namespaces │                                                             │
│ ▸ Reports    │                                                             │
│              │                                                             │
│ ─────────────│                                                             │
│ SNAPSHOT     │                                                             │
│ Aug 13 · 5m  │                                                             │
│ ▸ Compare ⇄  │                                                             │
└──────────────┴─────────────────────────────────────────────────────────────┘
```

**Nav ordering is deliberate.** Findings sits directly under Dashboard because "what should I fix first?" is the dominant job. Viewer/Map/Inventory are investigation tools reached *from* a finding more often than browsed directly.

**Badge discipline:** only Findings carries a count, and it shows **open Critical + High** — not the total of all severities as today (`components/app/sidebar.tsx:67-71`). A badge reading `287` where 190 are Low is noise; `95` that all matter is signal.

### 2.3 The Scan Context Bar

The persistent answer to "which scan am I analyzing?". Present on every analysis route. Two states:

```
EXPANDED (default, at scroll top)
┌────────────────────────────────────────────────────────────────────────────┐
│ ← All clusters                                                             │
│                                                                            │
│  ⬢ Production Cluster   [PROD]  ✓ Completed                                │
│  prod-rbac-2026-08-13.json                                                 │
│                                                                            │
│  Score      Critical   High    Compliance   Namespaces  k8s     Duration   │
│   84 ▲+6      103 ▼-4   127 ▲+9    91%          42      1.31      12.4s    │
│                                                                            │
│  Uploaded 5 minutes ago            [⇄ Compare] [↓ Export ▾] [📄 Report]     │
│                                            [ Scan: Production · Aug 13 ▾ ] │
└────────────────────────────────────────────────────────────────────────────┘

COLLAPSED (after 120px scroll — sticky, 48px tall)
┌────────────────────────────────────────────────────────────────────────────┐
│ ⬢ Production · Aug 13   Score 84   C 103   H 127        [⇄] [↓] [Aug 13 ▾] │
└────────────────────────────────────────────────────────────────────────────┘
```

Every delta (`▲+6`, `▼-4`) is computed against the immediately previous completed snapshot of the same cluster, and hovering shows which snapshot is the baseline. **Deltas are shown only when a prior snapshot exists** — never `▲+0` for a first scan.

### 2.4 Scan switcher

```
                      ┌──────────────────────────────────────────┐
[ Scan: Production ▾] │ 🔍 Filter snapshots…                     │
                      ├──────────────────────────────────────────┤
                      │ PRODUCTION CLUSTER                       │
                      │ ✓ Aug 13, 09:14   Score 84   C 103  ← now│
                      │   Aug 12, 09:02   Score 78   C 107       │
                      │   Aug 11, 08:58   Score 78   C 107       │
                      │   ⋯ 27 more snapshots                    │
                      ├──────────────────────────────────────────┤
                      │ OTHER CLUSTERS                           │
                      │   Staging       Aug 13   Score 71        │
                      │   Development   Aug 13   Score 66        │
                      ├──────────────────────────────────────────┤
                      │ ⇄ Compare with previous                  │
                      │ ⊞ Manage all clusters                    │
                      └──────────────────────────────────────────┘
```

**Switch semantics — critical detail.** Switching scans keeps you on the *same page type* and preserves compatible filters:

```
/app/scans/AUG13/findings?severity=critical&ns=payments
        ↓ switch to Aug 12
/app/scans/AUG12/findings?severity=critical&ns=payments
```

If a filter cannot survive the switch (e.g. `ns=payments` does not exist in the older snapshot), the app **keeps you on the page, drops only that filter, and shows an inline notice**: *"Namespace `payments` doesn't exist in this snapshot — filter removed."* It never silently returns you to a dashboard.

---

## 3. Analysis Dashboard wireframe

Route: `/app/scans/{scanId}` · The single screen that must answer all six UX-goal questions in 10 seconds.

```
╔════════════════════════════════════════════════════════════════════════════╗
║  SCAN CONTEXT BAR  (§2.3)                                                  ║
╚════════════════════════════════════════════════════════════════════════════╝

┌── ROW 1 · POSTURE STRIP ───────────────────────────────────────────────────┐
│┌────────────────┬────────────┬────────────┬─────────────┬─────────────────┐│
││                │            │            │             │                 ││
││   ◕  84        │  CRITICAL  │    HIGH    │ COMPLIANCE  │   LAST SCAN     ││
││   /100         │            │            │             │                 ││
││                │    103     │    127     │    91%      │  5 minutes ago  ││
││  Moderate      │  ▼ 4 vs    │  ▲ 9 vs    │  ▲2pt       │                 ││
││  ▲ +6 vs Aug12 │    Aug 12  │    Aug 12  │  38/42 ctrl │  ✓ Completed    ││
││                │            │            │             │  12.4s · 1.31   ││
││ Why this score?│ View all → │ View all → │  View →     │  Compare →      ││
│└────────────────┴────────────┴────────────┴─────────────┴─────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘

┌── ROW 2 ───────────────────────────────────────────────────────────────────┐
│┌─────────────────────────────────────────┬────────────────────────────────┐│
││ RISK TREND                    [30d ▾]   │ FINDINGS DISTRIBUTION          ││
││                                         │                                ││
││ 100┤                                    │  Critical ████████░░░  103 36% ││
││  90┤        ╭───╮                       │  High     ██████████░  127 44% ││
││  84┤   ╭────╯   ╰──●  84                │  Medium   ████░░░░░░░   41 14% ││
││  78┤ ──╯                                │  Low      ██░░░░░░░░░   16  6% ││
││  70┤                                    │                                ││
││    └─────────────────────────────  date │  By category                   ││
││     Jul15   Jul29   Aug5   Aug13        │  Priv. Escalation      112     ││
││                                         │  Overly Permissive      98     ││
││ ● snapshot   ▲ score improved           │  Misconfiguration       61     ││
││ Hover a point → open that snapshot      │  Best Practice          16     ││
│└─────────────────────────────────────────┴────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘

┌── ROW 3 ───────────────────────────────────────────────────────────────────┐
│┌─────────────────────────────────────────┬────────────────────────────────┐│
││ NAMESPACE RISK HEATMAP     [Score ▾] 42 │ RBAC INVENTORY                 ││
││                                         │                                ││
││ ▐█ production      52  C 42  H 18  →    │  IDENTITIES                    ││
││ ▐█ payments        61  C 20  H 24  →    │  Users              48    →    ││
││ ▐▊ kube-system     64  C 18  H 31  →    │  Groups             12    →    ││
││ ▐▋ ingress         73  C  6  H 14  →    │  ServiceAccounts   214    →    ││
││ ▐▍ monitoring      90  C  0  H  4  →    │  ─────────────────────────     ││
││ ▐▏ logging         98  C  0  H  1  →    │  Total Subjects    274    →    ││
││                                         │                                ││
││ ⊕ cluster-wide     41  C 17  H 22  →    │  AUTHORIZATION                 ││
││                                         │  Roles             186    →    ││
││ [ Show all 42 namespaces ]              │  ClusterRoles       94    →    ││
││                                         │  ─────────────────────────     ││
││ Click a namespace to scope every page   │  Total Roles       280    →    ││
││                                         │                                ││
││                                         │  BINDINGS                      ││
││                                         │  RoleBindings      203    →    ││
││                                         │  ClusterRoleBindings 71   →    ││
││                                         │  ─────────────────────────     ││
││                                         │  Total Bindings    274    →    ││
│└─────────────────────────────────────────┴────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘

┌── ROW 4 ───────────────────────────────────────────────────────────────────┐
│┌─────────────────────────────────────────┬────────────────────────────────┐│
││ ATTACK SURFACE                          │ TOP DANGEROUS SUBJECTS         ││
││                                         │                                ││
││ ┌─────────┬─────────┬─────────┐         │ jenkins-sa        prod   ▓ 12  ││
││ │Wildcard │ Cluster │ Secret  │         │ ServiceAccount                 ││
││ │  Roles  │ Admins  │ Readers │         │ cluster-admin + secrets:*      ││
││ │   34 ▲2 │   11 ▲1 │   47 ─  │         │                    [Viewer →]  ││
││ ├─────────┼─────────┼─────────┤         │ ────────────────────────────── ││
││ │  Pods   │Imperson-│  Node   │         │ ci-deployer       prod   ▓ 18  ││
││ │  Exec   │  ation  │ Access  │         │ ServiceAccount                 ││
││ │   23 ▼1 │    6 ─  │    9 ▲3 │         │ escalate + bind + impersonate  ││
││ ├─────────┼─────────┼─────────┤         │                    [Viewer →]  ││
││ │Anonymous│Privileg-│ HostPath│         │ ────────────────────────────── ││
││ │ Access  │ ed Acct │  (PSA)  │         │ developers        payments ▓ 27││
││ │    2 ─  │   14 ─  │   ⓘ n/a │         │ Group                          ││
││ └─────────┴─────────┴─────────┘         │ secrets:read cluster-wide      ││
││                                         │                    [Viewer →]  ││
││ Each tile → filtered Findings view      │                                ││
││ ⓘ HostPath needs Pod Security data      │ [ View all 274 subjects → ]    ││
│└─────────────────────────────────────────┴────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘

┌── ROW 5 ───────────────────────────────────────────────────────────────────┐
│┌─────────────────────────────────────────┬────────────────────────────────┐│
││ RECENT FINDINGS            [Critical ▾] │ RECOMMENDED ACTIONS            ││
││                                         │                                ││
││ ● CRIT  Cluster-admin bound to default  │ ① Remove wildcard permissions  ││
││   production · Privilege Escalation     │    34 roles · fixes 41 findings││
││   → Replace with scoped Role            │    Impact: +9 score   [Plan →] ││
││   [Map] [Details]                       │ ────────────────────────────── ││
││ ─────────────────────────────────────── │ ② Reduce cluster-admin grants  ││
││ ● CRIT  Secrets write: ci-deployer      │    11 bindings · fixes 11      ││
││   payments · Privilege Escalation       │    Impact: +7 score   [Plan →] ││
││   → Scope to named secrets              │ ────────────────────────────── ││
││   [Map] [Details]                       │ ③ Review secret readers        ││
││ ─────────────────────────────────────── │    47 subjects · fixes 22      ││
││ ● CRIT  pods/exec: developers group     │    Impact: +5 score   [Plan →] ││
││   production · Privilege Escalation     │ ────────────────────────────── ││
││   → Remove exec from group role         │ ④ Disable pod exec (23)   +4   ││
││   [Map] [Details]                       │ ⑤ Review impersonation (6) +3  ││
││                                         │                                ││
││ [ All 103 critical findings → ]         │ Ordered by score gain / effort ││
│└─────────────────────────────────────────┴────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Why this layout

The rows descend a deliberate **cognitive ladder** — each row answers exactly one UX-goal question:

| Row | Question answered | Widget |
| --- | --- | --- |
| 1 | *Am I secure?* | Posture strip |
| 2 | *Am I getting better or worse?* | Risk Trend + Distribution |
| 3 | *Where is the danger, and what am I working with?* | Namespace Heatmap + Inventory |
| 4 | *How could I be attacked, and by whom?* | Attack Surface + Dangerous Subjects |
| 5 | *What do I do right now?* | Recent Findings + Recommended Actions |

A user who reads only Row 1 has an answer. A user who reads to Row 5 has a work plan. Nothing on this page is decorative.

### 3.2 Widget behaviour contracts

**Security Score tile** — "Why this score?" opens a side panel with the full domain breakdown (Appendix A). Non-negotiable: **a score a user cannot audit is a score they will not trust.**

**Risk Trend** — X axis is real elapsed time, not snapshot index, so a gap in scanning is visible as a gap. Fewer than 2 snapshots → renders "Upload a second snapshot to see trend", never a flat line.

**Findings Distribution** — bar lengths are **linearly proportional to counts**. This explicitly replaces the `×3 / ×2 / ×1.5` multipliers at `app/app/page.tsx:147-171`. Severity is encoded by colour and by sort order; it must never be encoded by *lying about length*.

**Namespace Heatmap** — ranked ascending by score (worst first), not alphabetically. The `⊕ cluster-wide` pseudo-namespace is mandatory: ClusterRoleBindings have no namespace (`lib/rbac-scanner.ts:29-42` — `namespace?: string`), and dropping them would hide the most dangerous grants in the cluster. Clicking sets `?ns=` across the workspace (§1.4).

**RBAC Inventory** — every row is a link into the Viewer with the correct filter pre-applied. This is the requirement "clicking Users opens RBAC Viewer filtered to Users":

```
Users               → /app/scans/{id}/viewer?kind=User
Groups              → /app/scans/{id}/viewer?kind=Group
ServiceAccounts     → /app/scans/{id}/viewer?kind=ServiceAccount
Roles               → /app/scans/{id}/viewer?tab=roles&kind=Role
ClusterRoles        → /app/scans/{id}/viewer?tab=roles&kind=ClusterRole
RoleBindings        → /app/scans/{id}/viewer?tab=bindings&kind=RoleBinding
ClusterRoleBindings → /app/scans/{id}/viewer?tab=bindings&kind=ClusterRoleBinding
```

**Attack Surface** — nine tiles, each a saved query into Findings. Eight map directly onto detection rules that already exist in `lib/rbac-scanner.ts:362-611`. `HostPath` renders as an explicit `ⓘ Not collected` tile — it is a Pod Security concern, not RBAC (§13.7). **Do not fake it.**

**Recommended Actions** — ordered by *score gain per unit of effort*, not by severity. This is the difference between a list of problems and a remediation plan.

### 3.3 Responsive behaviour

| Breakpoint | Layout |
| --- | --- |
| ≥1536px | 5 posture tiles across; rows 2–5 as 2-up (60/40 for row 2, 50/50 for 3–5) |
| 1280–1535px | 5 tiles across; 2-up preserved, heatmap truncates to 5 rows |
| 1024–1279px | Posture wraps 3+2; row 2 stacks; rows 3–5 stay 2-up |
| 768–1023px | Posture 2-up; everything else full width, single column |
| <768px | Single column. Posture becomes a horizontal snap-scroll carousel. Heatmap → top 5 + "show all". Attack Surface → 2 tiles per row. |

---

## 4. Home page wireframe

Route: `/app`

### 4.1 First-run — zero snapshots

Full-viewport, vertically centred, nothing else on screen. No sidebar analysis items, no zeroed metric cards, no empty charts.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ▣ KubeScope                                    Workspace: Acme ▾  ◐  (SD)  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│                                                                            │
│                              ┌──────────┐                                  │
│                              │    ⬡     │                                  │
│                              └──────────┘                                  │
│                                                                            │
│                        Welcome to KubeScope                                │
│                                                                            │
│              Analyze your Kubernetes RBAC security posture.                │
│                                                                            │
│                                                                            │
│   ╭──────────────────────────────────────────────────────────────────╮     │
│   │                                                                  │     │
│   │                            ⬆                                     │     │
│   │                                                                  │     │
│   │              Drop your RBAC snapshot here                        │     │
│   │                        or                                        │     │
│   │                 [  Upload Snapshot  ]                            │     │
│   │                                                                  │     │
│   │            Supported:  .json   ·   .zip    (max 32 MB)           │     │
│   │                                                                  │     │
│   ╰──────────────────────────────────────────────────────────────────╯     │
│                                                                            │
│                                                                            │
│         Don't have a snapshot yet?                                         │
│                                                                            │
│         ┌────────────────────────────────────────────────────────┐         │
│         │ $ kubectl get clusterroles,clusterrolebindings, \      │  [Copy] │
│         │     roles,rolebindings -A -o json > rbac-snapshot.json │         │
│         └────────────────────────────────────────────────────────┘         │
│                                                                            │
│         Read-only. Nothing leaves your cluster except this file.           │
│                                                                            │
│                                                                            │
│              [ Explore with sample data ]    [ Read the docs ]             │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Design notes.** The whole page is a drop target, not just the dashed box — first-time users aim badly. The collector command is the single highest-value element: the top reason first-run fails is that people do not know what a "snapshot" is. `Explore with sample data` routes to a clearly-labelled demo snapshot (the existing `lib/demo-data.ts` path) so evaluators reach a populated Analysis Workspace in one click without uploading anything.

### 4.2 Upload in flight

```
   ╭──────────────────────────────────────────────────────────────────╮
   │  prod-rbac-2026-08-13.json          8.4 MB                       │
   │  ████████████████████████████░░░░░░░░░░░░  68%                   │
   │                                                                  │
   │  ✓ Uploaded          ✓ Parsed         ◐ Analyzing…      ○ Ready  │
   │                        274 subjects     186 of 280 roles         │
   ╰──────────────────────────────────────────────────────────────────╯
```

Four named stages, because the async scan path (`SubmitScan` → SQS → scanner worker) means a large snapshot can sit in `pending` for a while. A single indeterminate spinner over an unbounded queue wait reads as a hang. On completion: a toast with a **primary [Open Analysis] action** — it does *not* auto-navigate. Auto-navigation is how you lose users who uploaded three files in a row.

### 4.3 Returning user — fleet overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Fleet overview                                     [ + Upload Snapshot ]  │
│  4 clusters · 31 snapshots · last scan 5 minutes ago                       │
│                                                                            │
│  ┌──────────────┬──────────────┬──────────────┬──────────────────────────┐ │
│  │ FLEET SCORE  │  CRITICAL    │  CLUSTERS    │  NEEDS ATTENTION         │ │
│  │    74 /100   │     183      │      4       │  2 clusters not scanned  │ │
│  │  ▼ 3 vs last │  across all  │  all healthy │  in over 7 days          │ │
│  └──────────────┴──────────────┴──────────────┴──────────────────────────┘ │
│                                                                            │
│  Clusters                    [Grouped by cluster ▾] [Score ▾] [🔍 Filter]  │
│                                                                            │
│   … cluster cards (§5.2) …                                                 │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

Fleet Score is the **worst** cluster score, not the mean. Averaging hides the one broken cluster — which is the only one that matters.

---

## 5. Scan Management page

Route: `/app/clusters`

### 5.1 The one place this spec diverges from the brief

The brief asks for "every uploaded scan as a large modern card". Taken literally, a team scanning nightly has **365 cards a year for one cluster**, and the page degrades into an unusable wall. Wiz, Prisma Cloud and Defender all solve this the same way: **the card is the long-lived asset; the scans are its history.**

Recommended default: **Grouped by cluster** — one rich card per cluster, showing the latest snapshot, its trend, and a snapshot count that expands into history. The brief's literal request is fully preserved as a view toggle:

```
[ Grouped by cluster ▾ ]   ← default, scales to unlimited scans
[ All snapshots        ]   ← flat card grid, exactly as briefed
```

Both views ship. The user picks; the preference persists. This satisfies "support unlimited scans" without a wall of near-identical cards.

### 5.2 Cluster card (grouped view — default)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ⬢  Production Cluster                          [PROD]        ✓ Completed  │
│     prod-rbac-2026-08-13.json · uploaded 5 minutes ago · 12.4s             │
│─────────────────────────────────────────────────────────────────────────── │
│                                                                            │
│   ┌────────────┐   Critical   High    Compliance   Namespaces   Kubernetes │
│   │            │                                                           │
│   │   ◕  84    │     103      127        91%           42          1.31    │
│   │    /100    │    ▼ 4       ▲ 9        ▲ 2pt                             │
│   │  Moderate  │                                                           │
│   │  ▲ +6      │   Subjects 274 · Roles 280 · Bindings 274                 │
│   └────────────┘                                                           │
│                                                                            │
│   30-day trend    ╭─╮                                                      │
│    78 ──╮      ╭──╯ ╰──● 84                                                │
│         ╰──────╯                                                           │
│                                                                            │
│─────────────────────────────────────────────────────────────────────────── │
│  31 snapshots  ⌄                        [ ⇄ Compare ]  [ Open Analysis → ] │
└────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼ expanded
        ┌───────────────────────────────────────────────────────────────┐
        │  Aug 13, 09:14   84  ▲+6   C 103  H 127   12.4s  ✓   [Open]  │
        │  Aug 12, 09:02   78  ─     C 107  H 118   11.8s  ✓   [Open]  │
        │  Aug 11, 08:58   78  ▼-2   C 107  H 118   12.1s  ✓   [Open]  │
        │  Aug 10, 09:11   80  ▲+1   C 104  H 115   11.9s  ✓   [Open]  │
        │  ⋯                                        [ View all 31 → ]  │
        └───────────────────────────────────────────────────────────────┘
```

**Card anatomy rules**

- **Never lead with a filename.** The card leads with the cluster identity; the filename is metadata on the second line. This is the brief's "NOT just filename" requirement, honoured structurally.
- **Environment badge** — `PROD` / `STAGING` / `DEV` / `UNLABELLED`. Colour-coded, but *always* with text, never colour alone (accessibility).
- **Score ring** is the visual anchor, sized ~72px, with the band word (`Strong` / `Moderate` / `Weak` / `Critical`) so the number never has to be interpreted from colour.
- **One primary action** per card: `Open Analysis`. Compare is secondary. Delete/rename/relabel live in a `⋯` overflow menu — destructive actions are never adjacent to the primary path.
- **Whole card is clickable** → `Open Analysis`. The explicit button remains for discoverability and keyboard users.

### 5.3 Card states

```
PENDING (queued to scanner)          FAILED
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ ⬢ Staging Cluster    [STAGE] │     │ ⬢ Dev Cluster         [DEV]  │
│   staging-rbac.json          │     │   dev-rbac.zip               │
│                              │     │                              │
│   ◐  Analyzing…              │     │   ⚠  Analysis failed         │
│   ████████░░░░░░  queued     │     │   "Unexpected token at line  │
│   Started 40s ago            │     │    1204 — malformed JSON"    │
│                              │     │                              │
│   [ Cancel ]                 │     │   [ Retry ]  [ View log ]    │
└──────────────────────────────┘     └──────────────────────────────┘

NEVER SCANNED                        STALE
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ ⬢ EU Cluster          [PROD] │     │ ⬢ Legacy Cluster      [DEV]  │
│   No snapshots yet           │     │   ⚠ Last scan 24 days ago    │
│   [ Upload Snapshot ]        │     │   Score 66 (stale)  [Open →] │
└──────────────────────────────┘     └──────────────────────────────┘
```

Failed cards surface the **real error string** verbatim (from `Scan.errorMessage`, `lib/rbac-scanner.ts:98`). "Something went wrong" is unactionable for an engineer holding a 30 MB JSON file.

### 5.4 Controls

```
[Grouped by cluster ▾]  [Sort: Risk ▾]  [Env: All ▾]  [🔍 Search]     ⊞ ☰
                         ├ Risk (worst first)  ← default
                         ├ Last scanned
                         ├ Name (A–Z)
                         └ Snapshot count
```

Default sort is **worst-first**, answering "which cluster is least secure?" with zero interaction. `⊞ ☰` toggles card grid vs. dense table for large fleets.

---

## 6. Analysis Workspace

Route group: `/app/scans/{scanId}/*`

### 6.1 Entry contract

```
Fleet ──[Open Analysis]──▶ /app/scans/{scanId}
                            │
                            ├─ Guard: scan exists in active workspace?  → 404
                            ├─ Guard: scan status === 'completed'?      → status screen
                            └─ Layout: AnalysisLayout (scan preloaded via context)
```

`app/app/scans/[scanId]/layout.tsx` fetches the scan **once** and provides it via a `ScanContext`. Today every page re-derives the active scan independently and re-listens to `kubescope-scan-updated` (`sidebar.tsx:104-113`, `page.tsx:44-50`), which is both a duplicate-fetch problem and a source of pages disagreeing about what is on screen. **The layout owns the scan; children consume it. The CustomEvent bus for scan selection is deleted.**

### 6.2 Non-completed states

A `pending` scan renders a dedicated status screen — never an empty dashboard:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                ◐                                           │
│                     Analyzing production-rbac.json                         │
│              Queued for the scanner. This usually takes 10–30s.            │
│                                                                            │
│      ✓ Uploaded     ✓ Queued     ◐ Scanning…     ○ Ready                   │
│                                                                            │
│                    [ Back to clusters ]                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

Auto-advances to the dashboard on completion via the existing poll (`waitForScan`, 2s/120s). After 120s it degrades to "Still running — we'll email you", not a spinner forever.

### 6.3 Filter context bar

When a scan-wide filter is active (namespace, severity, subject kind), a slim bar sits directly under the Scan Context Bar on every page:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Filtered:  namespace = production ✕    severity = critical ✕   [Clear all] │
│            Showing 42 of 287 findings                                      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Rule: a filter that survives navigation must always be visible.** Invisible persistent filters are the most common cause of "the data is wrong" support tickets in security tooling.

---

## 7. RBAC Viewer redesign

Route: `/app/scans/{scanId}/viewer` · replaces `app/app/rbac-viewer/page.tsx`

### 7.1 Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [ Subjects 274 ] [ Roles 280 ] [ Bindings 274 ] [ Permissions 3,417 ]      │
├────────────────────────────────────────────────────────────────────────────┤
│ 🔍 jenkins                    [Kind ▾] [Namespace ▾] [Access ▾] [Risk ▾]   │
│ Showing 3 of 274 subjects                       [↓ CSV] [↓ JSON] [Columns▾]│
├────────────────────────────────────────────────────────────────────────────┤
│ SUBJECT              NAMESPACE    ACCESS      RESOURCES   RISK    INHERITED│
├────────────────────────────────────────────────────────────────────────────┤
│ ▸ ⚙ jenkins-sa       production   ADMIN       Wildcard    ●●●●   via 3 CRB │
│   ServiceAccount                              Access      Crit             │
├────────────────────────────────────────────────────────────────────────────┤
│ ▾ ⚙ ci-deployer      production   WRITE       secrets,    ●●●○   via 2 RB  │
│   ServiceAccount                              pods, +12   High             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ EFFECTIVE PERMISSIONS                                                │  │
│  │                                                                      │  │
│  │  ▸ READ      pods, services, configmaps, deployments      (+8 more)   │  │
│  │  ▾ WRITE     secrets ⚠, deployments, jobs                            │  │
│  │      secrets    create, update, patch, delete   ⚠ Privilege escalation│  │
│  │        └ granted by ClusterRole ci-full  ← RoleBinding ci-bind (prod) │  │
│  │  ▸ ADMIN     —                                                       │  │
│  │                                                                      │  │
│  │ GRANT CHAIN                                                          │  │
│  │  ci-deployer ─▶ RoleBinding ci-bind ─▶ ClusterRole ci-full ─▶ secrets:*│  │
│  │  ci-deployer ─▶ RoleBinding dep-bind ─▶ Role deployer ─▶ deployments  │  │
│  │                                                                      │  │
│  │ FINDINGS (2)                                                         │  │
│  │  ● CRIT  Secrets write access via ci-full                            │  │
│  │  ● HIGH  Wildcard verbs on jobs                                      │  │
│  │                                                                      │  │
│  │ RECOMMENDATION                                                       │  │
│  │  Replace secrets:* with resourceNames scoped to ci-registry-creds.   │  │
│  │  ┌────────────────────────────────────────────────────────┐  [Copy]  │  │
│  │  │ rules:                                                 │          │  │
│  │  │   - apiGroups: [""]                                    │          │  │
│  │  │     resources: ["secrets"]                             │          │  │
│  │  │     resourceNames: ["ci-registry-creds"]               │          │  │
│  │  │     verbs: ["get"]                                     │          │  │
│  │  └────────────────────────────────────────────────────────┘          │  │
│  │                                                                      │  │
│  │  [ 🗺 Open in Map ]  [ ⚑ All findings ]  [ ⧉ Copy subject ref ]      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 The translation layer

The core change: **stop rendering Kubernetes API primitives, start rendering meaning.**

| Raw RBAC | Displayed as |
| --- | --- |
| `*` (verbs) | **Wildcard Access** — all verbs |
| `*` (resources) | **All Resources** |
| `*` (apiGroups) | **All API Groups** |
| `get, list, watch` | **READ** |
| `create, update, patch, delete, deletecollection` | **WRITE** |
| `escalate, bind, impersonate, *` | **ADMIN** |
| `pods/exec`, `pods/attach` | **Shell access to running containers** |
| `serviceaccounts/token` | **Can mint identity tokens** |
| ClusterRoleBinding, no namespace | **Cluster-wide** (never blank) |

Raw verbs remain visible one level down in the expansion — the abstraction must never *hide* truth from an expert, only *delay* it for a scanner. A "Show raw RBAC" toggle in `Columns ▾` reveals the original arrays for anyone who wants them.

### 7.3 Interaction rules

- **Entire row is clickable** → expands inline. Not a modal: expansion preserves scroll position and surrounding context.
- **Row click ≠ link click.** Namespace, role name and finding chips inside the row are separate navigation targets and must stop propagation.
- **Risk column** — 4-dot glyph plus text label. Sortable; default sort = risk descending.
- **Inherited Access** — the highest-value new column. "via 3 CRB" is *why* a subject has power it appears not to have. Hovering lists the bindings; clicking opens the Map focused on that subject.
- **Virtualized rows.** At 3,400+ permission rows, unvirtualized rendering with per-row Framer Motion is a guaranteed jank source. Use windowing; drop per-row entry animations entirely.
- **Keyboard:** `↑/↓` move, `→`/`Enter` expand, `←` collapse, `/` focus search, `Esc` clear.

---

## 8. RBAC Map redesign

Route: `/app/scans/{scanId}/map` · rebuilds `app/app/rbac-map/page.tsx`

### 8.1 What changes

Today the "map" is a fixed 4-column chain for a single selected subject (`SubjectNode → BindingNode → RoleNode → PermissionsNode`, `rbac-map/page.tsx:405-689`). It is a *detail view rendered horizontally*. It cannot answer the question a map exists to answer: **"what else reaches this?"**

The redesign is a real interactive graph with a full 6-layer resolution chain:

```
  SUBJECT        BINDING          ROLE           PERMISSION      RESOURCE
     │              │               │                │               │
  ┌──────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐   ┌──────────┐
  │jenkins│──▶│ CRB      │──▶│ClusterRole│──▶│ secrets:* │──▶│ 47 secrets│
  │ -sa  │    │ jenkins- │    │cluster-  │    │  ⚠ CRIT   │   │ in 12 ns  │
  │ ⚠    │    │ admin    │    │ admin ⚠  │    └───────────┘   └──────────┘
  └──────┘    └──────────┘    └──────────┘
     │                                              │
     └──────────────── ATTACK PATH ─────────────────┘
        "jenkins-sa → read all secrets → extract SA tokens
         → impersonate cluster-admin"          [ Explain ▾ ]
```

### 8.2 Full screen

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 🔍 Focus: jenkins-sa (production)  ✕     [Depth 2 ▾] [⚠ Risky only] [⤢ Fit]│
├──────────────────────────────────────────────────────┬─────────────────────┤
│                                                      │ NODE DETAIL         │
│              ┌────────┐                              │                     │
│      ┌───────│jenkins │───────┐                      │ ⬢ ClusterRole       │
│      │       │  -sa   │       │                      │   cluster-admin     │
│      ▼       └────────┘       ▼                      │                     │
│  ┌───────┐              ┌──────────┐                 │ SEVERITY  ● Critical│
│  │ CRB   │              │  RB      │                 │ SCOPE     Cluster   │
│  │jenkins│              │ ci-bind  │                 │ BOUND TO  11 subj.  │
│  └───┬───┘              └────┬─────┘                 │                     │
│      ▼                       ▼                       │ RULES               │
│  ┌────────────┐        ┌──────────┐                  │  apiGroups: ["*"]   │
│  │cluster-    │        │ deployer │                  │  resources: ["*"]   │
│  │ admin ⚠⚠   │        │          │                  │  verbs:     ["*"]   │
│  └─────┬──────┘        └────┬─────┘                  │                     │
│        ▼                    ▼                        │ REACHES             │
│  ┌──────────┐         ┌──────────┐                   │  Every resource in  │
│  │  *:*:*   │         │deploy:rw │                   │  every namespace    │
│  │  ⚠ CRIT  │         │          │                   │                     │
│  └────┬─────┘         └──────────┘                   │ FINDINGS (3)        │
│       ▼                                              │  ● Cluster-admin    │
│  ┌──────────────┐                                    │    bound to SA      │
│  │ All resources│                                    │                     │
│  │ 42 namespaces│                                    │ [Viewer] [Findings] │
│  └──────────────┘                                    │ [ Hide this node  ] │
│                                                      │                     │
│ ● Critical  ● High  ○ Normal    12 nodes · 14 edges  │                     │
└──────────────────────────────────────────────────────┴─────────────────────┘
```

### 8.3 Design rules

- **Never render the full graph.** A 274-subject cluster is ~1,100 nodes — an unreadable hairball and a rendering stall. The map is **always focused**: it opens on a subject, a role, or a resource, and expands outward by `Depth`. Entering with no focus shows a picker, not everything.
- **Layered left-to-right** (Sugiyama/dagre), never force-directed. The RBAC chain has an inherent direction; force layouts destroy it and make the picture different every load. Stable layout = stable mental model.
- **Danger encoding:** stroke weight + border colour + a `⚠` glyph. Three redundant channels, so it survives colour-blindness and greyscale screenshots pasted into tickets.
- **Reverse traversal is a first-class mode.** Focus a *resource* (`secrets` in `production`) and the graph answers **"who can reach this?"** — the highest-value question in the product and currently impossible to ask.
- **Attack Path ribbon** — when a focused subject has a chain matching a known escalation pattern, the path is highlighted and narrated in plain language with `[Explain ▾]` expanding to the step-by-step technique and MITRE reference.
- **Every node click** updates the right panel and pushes `?focus=` into the URL — the graph state is shareable.
- **Performance:** SVG up to ~300 nodes, canvas beyond. Zoom/pan only; no entrance animations on nodes.

---

## 9. Risk Findings redesign

Route: `/app/scans/{scanId}/findings` · replaces `app/app/risk-findings/page.tsx`

### 9.1 Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Risk Findings                                    [↓ Export ▾] [📄 Report] │
│  287 findings · 103 critical · 127 high                                    │
├────────────────────────────────────────────────────────────────────────────┤
│ [All 287] [Critical 103] [High 127] [Medium 41] [Low 16]  [Open][Resolved] │
│ 🔍 search    [Namespace ▾] [Category ▾] [MITRE ▾] [Subject kind ▾] [Sort ▾]│
├────────────────────────────────────────────────────────────────────────────┤
│ ▾ ● CRITICAL   Cluster-admin bound to default ServiceAccount               │
│     production · Privilege Escalation · TA0004 · 3 days ago      [Open ▾]  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ AFFECTED                                                             │  │
│  │   Namespace   production                                             │  │
│  │   Subject     ⚙ default (ServiceAccount)                             │  │
│  │   Role        ⬢ cluster-admin (ClusterRole)                          │  │
│  │   Binding     ⬡ default-admin-binding (ClusterRoleBinding)           │  │
│  │                                                                      │  │
│  │ ATTACK IMPACT                                                        │  │
│  │   Every pod in `production` that does not set a ServiceAccount runs  │  │
│  │   as `default`. Any container compromise in this namespace becomes   │  │
│  │   full cluster compromise — read all secrets, create workloads on    │  │
│  │   any node, and modify RBAC itself.                                  │  │
│  │                                                                      │  │
│  │   Blast radius:  42 namespaces · 3,417 permissions · 214 SAs         │  │
│  │                                                                      │  │
│  │ MITRE ATT&CK                                                         │  │
│  │   TA0004 Privilege Escalation → T1078.004 Valid Accounts: Cloud      │  │
│  │   TA0006 Credential Access    → T1552.007 Container API credentials  │  │
│  │                                                                      │  │
│  │ AFFECTED RESOURCES (all)                                             │  │
│  │   *  in  *  (apiGroups: *)                            [ Show 12 ▾ ]  │  │
│  │                                                                      │  │
│  │ RECOMMENDATION                                                       │  │
│  │   Delete the ClusterRoleBinding and grant a namespace-scoped Role    │  │
│  │   to a dedicated ServiceAccount instead.                             │  │
│  │   ┌──────────────────────────────────────────────────┐    [Copy]     │  │
│  │   │ kubectl delete clusterrolebinding \              │               │  │
│  │   │   default-admin-binding                          │               │  │
│  │   └──────────────────────────────────────────────────┘               │  │
│  │   ⚠ Verify no workload depends on this binding before deleting.      │  │
│  │                                                                      │  │
│  │ [🗺 View in Map] [🎫 Create ticket] [⧉ Copy ID] [✓ Mark resolved]     │  │
│  │ [🔕 Suppress ▾]                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────────┤
│ ▸ ● CRITICAL   Secrets write access: ci-deployer                          │
│     payments · Privilege Escalation · TA0004 · 3 days ago        [Open ▾]  │
├────────────────────────────────────────────────────────────────────────────┤
│ ▸ ● HIGH       Wildcard permissions: edit-extended                        │
│     kube-system · Overly Permissive · TA0004 · 3 days ago        [Open ▾]  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Rules

- **One expanded card at a time** by default (accordion), with a `[Expand all]` for scanning/printing. Multiple 400px-tall open cards make the list unnavigable.
- **Attack Impact is prose, not a field dump.** It explains *what an attacker does with this*. This is the section that turns a finding into a ticket someone actually prioritises. It is templated per detection rule, interpolated with the real subject/namespace/counts.
- **Blast radius is quantified** — "42 namespaces · 3,417 permissions" is what makes a Critical feel critical.
- **Grouping.** A cluster with 34 wildcard roles produces 34 near-identical findings. Add `[Group similar]` (default **on**) collapsing them into `Wildcard permissions (34 roles) ▾`. This is the difference between 287 rows and ~40 real problems.
- **Status model:** `Open` → `Resolved` (fixed, verified next scan) / `Suppressed` (accepted risk, requires a reason + optional expiry). Suppressed findings are excluded from the score and shown in a separate tab with an audit trail. **Suppression without a recorded reason is not permitted** — that is what turns a security tool into a rubber stamp.
- **Deep links:** `/app/scans/{id}/findings/{findingId}` opens the list scrolled and expanded to that finding. `⧉ Copy ID` copies that URL, not a bare UUID.
- **Create ticket** opens a pre-filled Jira/Linear/GitHub issue: title, severity, affected objects, remediation, and a link back. Falls back to "Copy as Markdown" when no integration is configured.

---

## 10. Reports redesign

Routes: `/app/reports` (library) · `/app/scans/{scanId}/reports` · `/app/scans/{a}/compare/{b}`

### 10.1 Report cards must carry posture, not just filenames

```
┌────────────────────────────────────────────────────────────────────────────┐
│  📄  Production Cluster — Weekly Security Report                           │
│      PDF · generated Aug 13, 09:20 · snapshot Aug 13, 09:14                │
│──────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│   Score      Compliance    Risk Delta        Critical changes              │
│                                                                            │
│    84         91%           ▲ +6             +2 new · −6 resolved          │
│   ▲ +6 pts   ▲ +2pt        improving         net −4 critical               │
│                                                                            │
│   vs. baseline: Production · Aug 12, 09:02                                 │
│                                                                            │
│   Trend  78 ──╮      ╭──╯╰──● 84                                           │
│               ╰──────╯                                                     │
│                                                                            │
│   [ ↓ Download ]  [ 👁 Preview ]  [ ⇄ View diff ]              [ ⋯ ]       │
└────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Comparison view

`/app/scans/{current}/compare/{baseline}` — builds on the existing `lib/report-diff.ts`, promoted from a reports sub-page to a first-class scan-scoped route.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Compare snapshots        [Aug 13 ▾]  ⇄  [Aug 12 ▾]        [↓ Export diff] │
├────────────────────────────────────────────────────────────────────────────┤
│                    Aug 12        Aug 13        Δ                           │
│  Security Score      78            84        ▲ +6   improving              │
│  Compliance          89%           91%       ▲ +2pt                        │
│  Critical           107           103        ▼ −4   ✓                      │
│  High               118           127        ▲ +9   ⚠                      │
│  Subjects           271           274        ▲ +3                          │
│  Roles              278           280        ▲ +2                          │
├────────────────────────────────────────────────────────────────────────────┤
│  ⊕ NEW FINDINGS (11)                                        [ Expand all ] │
│    ● CRIT  Secrets write: new-ci-sa            payments        ← regression│
│    ● HIGH  Wildcard permissions: temp-debug    kube-system                 │
│    ⋯                                                                       │
│                                                                            │
│  ⊖ RESOLVED (15)                                                           │
│    ✓ CRIT  Cluster-admin: legacy-operator      production                  │
│    ⋯                                                                       │
│                                                                            │
│  ⊙ UNCHANGED (261)                                            [ Show ▾ ]   │
├────────────────────────────────────────────────────────────────────────────┤
│  NAMESPACE DELTAS                                                          │
│    payments      61 → 54   ▼ −7   ⚠ degraded                               │
│    production    48 → 52   ▲ +4                                            │
│    kube-system   64 → 64   ─                                               │
└────────────────────────────────────────────────────────────────────────────┘
```

**New findings are the headline.** A regression between snapshots is the single most actionable output of a recurring scanner — a thing that was fine yesterday and is not fine today. Sort New first, Resolved second, Unchanged collapsed.

### 10.3 Report content model

Every generated report contains, in order: Executive summary (score, compliance, delta, top 3 risks) → Posture over time → Findings by severity → Namespace breakdown → Attack surface → Full inventory appendix → Methodology (**what was scanned, what was not, and how the score was computed**).

The methodology section is not optional. An enterprise security report that cannot explain its own scoring will be rejected in audit.

---

## 11. Component hierarchy

```
app/
├─ app/
│  ├─ layout.tsx                          AuthProvider + ProtectedRoute (existing)
│  │
│  ├─ (fleet)/                            ── FLEET MODE ────────────────────
│  │  ├─ layout.tsx                       FleetShell
│  │  │   ├─ FleetSidebar                 6 items, 2 groups
│  │  │   ├─ AppHeader                    + working CommandPalette
│  │  │   └─ WorkspaceSwitcher
│  │  ├─ page.tsx                         Home
│  │  │   ├─ EmptyState.FirstRun
│  │  │   │   ├─ SnapshotDropzone
│  │  │   │   ├─ CollectorCommandBlock
│  │  │   │   └─ SampleDataCTA
│  │  │   └─ FleetOverview
│  │  │       ├─ FleetPostureStrip
│  │  │       └─ ClusterCardGrid
│  │  ├─ clusters/page.tsx                Scan management
│  │  │   ├─ ViewToggle                   grouped | all snapshots
│  │  │   ├─ ClusterCard
│  │  │   │   ├─ ClusterIdentity          name + env badge + status
│  │  │   │   ├─ ScoreRing
│  │  │   │   ├─ MetricRow
│  │  │   │   ├─ SparklineTrend
│  │  │   │   └─ SnapshotHistoryDrawer
│  │  │   └─ SnapshotCard                 flat view
│  │  ├─ clusters/[clusterId]/page.tsx    Cluster detail + timeline
│  │  ├─ reports/page.tsx                 Report library
│  │  ├─ settings/page.tsx                (existing)
│  │  └─ billing/page.tsx                 (existing)
│  │
│  └─ scans/[scanId]/                     ── ANALYSIS MODE ─────────────────
│     ├─ layout.tsx                       AnalysisShell  ← owns ScanContext
│     │   ├─ ScanGuard                    404 / pending / failed
│     │   ├─ ScanContextBar               §2.3, collapses on scroll
│     │   │   ├─ ScanIdentity
│     │   │   ├─ ScanMetricStrip
│     │   │   ├─ ScanActions              Compare · Export · Report
│     │   │   └─ ScanSwitcher             §2.4
│     │   ├─ FilterContextBar             §6.3
│     │   └─ AnalysisSidebar              7 scan-scoped items
│     │
│     ├─ page.tsx                         Analysis Dashboard
│     │   ├─ PostureStrip
│     │   │   ├─ SecurityScoreTile → ScoreBreakdownPanel
│     │   │   ├─ SeverityTile ×2
│     │   │   ├─ ComplianceTile
│     │   │   └─ LastScanTile
│     │   ├─ RiskTrendChart
│     │   ├─ FindingsDistribution         ← linear scale, no multipliers
│     │   ├─ NamespaceHeatmap
│     │   ├─ RbacInventoryPanel           every row a filtered link
│     │   ├─ AttackSurfaceGrid            9 tiles
│     │   ├─ TopDangerousSubjects
│     │   ├─ RecentFindingsList
│     │   └─ RecommendedActions
│     │
│     ├─ viewer/page.tsx                  RBAC Viewer
│     │   ├─ EntityTabs
│     │   ├─ ViewerFilterBar
│     │   ├─ VirtualizedTable
│     │   │   └─ SubjectRow → SubjectDetailPanel
│     │   │        ├─ EffectivePermissions   READ/WRITE/ADMIN
│     │   │        ├─ GrantChain
│     │   │        ├─ InlineFindings
│     │   │        └─ RemediationSnippet
│     │   └─ ExportMenu
│     │
│     ├─ map/page.tsx                     RBAC Map
│     │   ├─ GraphCanvas                  dagre layered
│     │   │   └─ SubjectNode│BindingNode│RoleNode│PermissionNode│ResourceNode
│     │   ├─ AttackPathRibbon
│     │   ├─ GraphControls                focus · depth · risky-only · fit
│     │   ├─ NodeDetailPanel
│     │   └─ GraphLegend
│     │
│     ├─ findings/page.tsx                Risk Findings
│     │   ├─ SeverityTabs
│     │   ├─ FindingFilterBar
│     │   ├─ FindingCard
│     │   │   ├─ AffectedObjects
│     │   │   ├─ AttackImpact
│     │   │   ├─ MitreMapping
│     │   │   ├─ RemediationBlock
│     │   │   └─ FindingActions
│     │   ├─ GroupedFindingCard
│     │   └─ SuppressDialog               reason required
│     ├─ findings/[findingId]/page.tsx    deep link
│     ├─ inventory/page.tsx
│     ├─ namespaces/page.tsx
│     ├─ reports/page.tsx
│     └─ compare/[baselineId]/page.tsx
│
components/
├─ posture/     ScoreRing · ScoreBadge · SeverityDot · TrendDelta · RiskBar
├─ charts/      Sparkline · TrendChart · DistributionBars · Heatmap
├─ data/        DataTable · VirtualRow · FilterBar · FilterChip · EmptyState
├─ scan/        ScanSwitcher · ScanStatusPill · SnapshotDropzone
└─ ui/          (existing shadcn primitives — unchanged)

lib/
├─ scoring.ts        ★ new — domain scoring (Appendix A)
├─ compliance.ts     ★ new — CIS control mapping
├─ mitre.ts          ★ new — rule → ATT&CK mapping
├─ attack-paths.ts   ★ new — graph traversal
├─ permissions.ts    ★ new — verb → READ/WRITE/ADMIN translation
├─ graph.ts          ★ new — RBAC graph build + focus/depth traversal
└─ rbac-scanner.ts     existing — detection rules stay, add rule metadata
```

★ = new modules. Existing detection logic in `lib/rbac-scanner.ts:315-633` is **preserved**; it gains a metadata block per rule (domain, weight, MITRE IDs, CIS control, impact template).

---

## 12. UX improvements

1. **Explicit scan selection.** The user chooses; the app never guesses. Removes `setActiveScan(savedScans[0])` (`app/app/page.tsx:114`).
2. **Scan identity in the URL.** Shareable, bookmarkable, back-button-correct, immune to state desync.
3. **Two-mode shell.** Fleet vs. Analysis. You always know which world you are in.
4. **Honest charts.** Linear scales everywhere. Deletes the `×3/×2/×1.5` distortion at `page.tsx:147-171`.
5. **Explainable score.** "Why this score?" panel with domain-level attribution.
6. **Working command palette (⌘K).** The header input at `header.tsx:95` becomes real: jump to a cluster, snapshot, subject, role, namespace, or finding; run actions ("compare with previous", "export CSV"). Fixing a visible affordance that does nothing is higher priority than adding new features.
7. **Language translation.** `*` → "Wildcard Access", verbs → READ/WRITE/ADMIN, cluster-scoped → "Cluster-wide". Raw values one level down.
8. **Whole-row and whole-card click targets**, with proper propagation handling for nested links.
9. **Finding grouping.** 34 wildcard findings collapse into one row with a count.
10. **Suppression with mandatory reason** and optional expiry, plus an audit trail.
11. **Real error surfacing.** Parser failures show the actual message from `Scan.errorMessage`, plus which file and line.
12. **Staged upload progress** matching the real async pipeline, not one indeterminate spinner over an SQS queue wait.
13. **Filter visibility.** Persistent filters always render in a dismissible bar.
14. **Motion discipline.** Entry animations only where they carry meaning: score counters, delta reveals, graph focus transitions. Remove staggered `delay: index * 0.1` chains from lists and tables. `prefers-reduced-motion` honoured globally.
15. **Empty states with a next action.** Every empty state states what is missing, why, and the one button that fixes it.
16. **Keyboard-first tables.** Arrow navigation, `/` to search, `Esc` to clear, `Enter` to expand.
17. **Deterministic sort defaults.** Worst-first everywhere. The default view answers the primary question with zero clicks.
18. **Stale-scan warning.** Snapshots older than 7 days are labelled; posture claims about a 24-day-old snapshot are misleading.
19. **Density toggle.** Comfortable / Compact for operators working large fleets on laptops.
20. **Copy-ready remediation.** Every recommendation ships a copyable `kubectl` command or YAML fragment, with a caution line where the action is destructive.

---

## 13. Enterprise features

### 13.1 Continuous scanning (highest-value roadmap item)
Manual snapshot upload is a demo workflow. An in-cluster agent (or CronJob + push) delivering scheduled snapshots turns KubeScope from an auditing tool into a monitoring product. Everything in this IA — trend, deltas, regressions — is designed to become dramatically more valuable the moment snapshots arrive automatically.

### 13.2 RBAC / SSO
SAML + OIDC, SCIM provisioning, and roles: `Owner` / `Admin` / `Analyst` (read + suppress) / `Viewer` (read-only). Security tools are bought by teams whose IdP is non-negotiable.

### 13.3 Audit log
Immutable record of: who uploaded, who suppressed what and why, who exported, who changed settings. Required by every compliance regime this product's buyers operate under.

### 13.4 Policy as code
Workspace-level policy: which rules are enabled, custom severities, per-namespace exceptions, and an org baseline. Versioned, exportable as YAML, diffable in review.

### 13.5 Integrations
Jira / Linear / GitHub Issues (ticket creation), Slack / Teams (regression alerts), webhooks, SIEM export (JSON/CEF), and CI gating — `kubescope check --fail-on critical` in a pipeline.

### 13.6 Compliance packs
CIS Kubernetes Benchmark (RBAC sections), NSA/CISA Kubernetes Hardening Guide, SOC 2 evidence export, PCI-DSS 7.x least-privilege evidence. This is what "Compliance 91%" must actually mean — a named framework with named controls, never an arbitrary ratio.

### 13.7 Scope expansion beyond RBAC (explicit honesty)
The brief's Attack Surface list includes **HostPath** and **Privileged Accounts**. These are **Pod Security** concerns (`securityContext`, PSA/PSS), *not* RBAC objects. They are not derivable from `roles.json` / `bindings.json`. Two honest options:
- **Ship them as `ⓘ Not collected` tiles** linking to a doc on extending the collector to include Pods/PodSecurityPolicies. (Recommended for v2.)
- **Expand snapshot scope** to include workload specs, and rename the product surface from "RBAC" to "Cluster Security". (v3 decision — a product strategy call, not a design one.)

What is *not* acceptable: rendering these tiles with numbers that do not come from data.

### 13.8 Multi-cluster & data residency
Fleet views across dozens of clusters, per-cluster ownership and tagging, regional data pinning, and a documented retention policy (snapshots contain your complete authorization topology — that is sensitive data and must be treated as such in both UI copy and storage).

---

## 14. UI improvements

1. **One card component.** Today's `glass-card` usage varies in padding, radius, and border across pages. Define `Card` / `Card.Metric` / `Card.Panel` variants and use them exclusively.
2. **8px spacing grid.** Section gap 32, card padding 24, element gap 16, tight gap 8. No arbitrary values.
3. **Type scale.** 6 sizes, no more: Display 32/600 · H1 24/600 · H2 18/600 · Body 14/400 · Label 13/500 · Caption 12/400. Metric numerals use `font-variant-numeric: tabular-nums` — non-tabular figures make columns of numbers visibly ragged.
4. **Severity colour is a locked contract.** Critical `#dc2626` · High `#ea580c` · Medium `#f59e0b` · Low `#3b82f6` · Pass `#10b981`. Used *only* for severity — never decoratively. Today `text-orange-500` is hardcoded across several pages; promote to tokens.
5. **Never colour alone.** Every severity carries a dot glyph + text label. Colour-blind users and greyscale ticket screenshots must both work.
6. **Dark-first, light supported.** Dark is the default operating theme; light must remain fully legible — audit every hardcoded colour that assumes a dark backdrop.
7. **Reduce glassmorphism.** Blur/translucency on dense data tables costs legibility and GPU. Keep glass for the header only; data surfaces use solid `--card`.
8. **Skeletons, not spinners.** Every panel gets a shaped skeleton so layout does not jump.
9. **Score ring is one component** at three sizes (72 / 48 / 24). Consistent stroke, consistent band colours, consistent centre label.
10. **Table density and sticky headers** for long lists; frozen first column on horizontal scroll.
11. **Focus rings on everything interactive** — `--ring` at 2px with 2px offset. Currently inconsistent on custom-built rows.
12. **Icons carry semantics.** ⬢ ClusterRole · ⬡ binding · ⚙ ServiceAccount · 👤 User · 👥 Group · 📦 namespace. One icon, one meaning, product-wide.
13. **Empty, loading, error, partial** — four states designed for every panel, not just the happy path.
14. **Numeric formatting rules.** Counts ≥10,000 abbreviate (`12.4k`); scores never abbreviate; durations `12.4s` / `1m 04s`; timestamps relative under 24h then absolute, with the absolute value always in a tooltip.

---

## 15. Design system recommendations

### 15.1 Token layer

Extend the existing `app/globals.css` custom properties rather than replacing them — `--primary: #22d3ee` (dark) is a good, distinctive brand anchor. Add a semantic layer on top:

```css
:root {
  /* Severity — LOCKED. Never used decoratively. */
  --sev-critical: #dc2626;  --sev-critical-bg: rgb(220 38 38 / 0.12);
  --sev-high:     #ea580c;  --sev-high-bg:     rgb(234 88 12 / 0.12);
  --sev-medium:   #f59e0b;  --sev-medium-bg:   rgb(245 158 11 / 0.12);
  --sev-low:      #3b82f6;  --sev-low-bg:      rgb(59 130 246 / 0.12);
  --sev-pass:     #10b981;  --sev-pass-bg:     rgb(16 185 129 / 0.12);

  /* Posture bands */
  --band-strong: #10b981;   /* 90-100 */
  --band-moderate: #f59e0b; /*  75-89 */
  --band-weak: #ea580c;     /*  50-74 */
  --band-critical: #dc2626; /*   0-49 */

  /* Spacing — 8px grid */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px;

  /* Elevation */
  --elev-0: none;
  --elev-1: 0 1px 2px rgb(0 0 0 / 0.20);
  --elev-2: 0 4px 12px rgb(0 0 0 / 0.24);
  --elev-3: 0 12px 32px rgb(0 0 0 / 0.32);

  /* Motion — short, purposeful */
  --dur-fast: 120ms; --dur-base: 180ms; --dur-slow: 260ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; }
}
```

### 15.2 Motion policy

| Allowed | Forbidden |
| --- | --- |
| Score counter count-up (≤600ms, once per load) | Staggered list-item entrance chains |
| Delta reveal on trend values | Per-row animation in tables |
| Graph focus/zoom transitions | Page-level fade-in on every navigation |
| Expand/collapse height transitions (180ms) | Decorative parallax, floating elements |
| Skeleton shimmer | `whileHover={{ x: 4 }}` on every nav item |

This directly implements the brief's "No unnecessary animations". The current dashboard's `delay: 0.6 + index * 0.1` chains are the main offender.

### 15.3 Charting

Adopt **one** library and use it everywhere (Recharts fits the existing React/Tailwind stack). Rules: linear scales unless a log scale is labelled as such; series colours from `--chart-1..5`; severity charts use severity tokens; every chart has an accessible table fallback; no 3D, no gradients that encode nothing, no pie charts with more than 4 slices.

### 15.4 Accessibility baseline

WCAG 2.1 AA. Verify every severity colour against `--card` in both themes (`--sev-high #ea580c` on `#171717` needs checking at small sizes). Full keyboard reachability, visible focus, `aria-live` for async scan status, `prefers-reduced-motion`, and no information conveyed by colour alone.

### 15.5 Documentation

Storybook (or equivalent) for `components/posture`, `components/charts`, `components/data`, `components/scan` — every state (empty / loading / error / populated / overflow) rendered as a story. A design system that is not enumerated drifts within one quarter.

---

## 16. User journey

### 16.1 First-time evaluator — "is this worth my time?"

```
Landing → Sign up → Workspace created
   ↓
/app  ── zero snapshots ──▶ Welcome + dropzone + collector command
   ↓
Copies kubectl command, runs it, drags rbac-snapshot.json onto the page
   ↓
Upload → Parsed → Analyzing (staged progress, ~12s)
   ↓
Toast: "Production Cluster analyzed — Score 84"   [ Open Analysis ]
   ↓
/app/scans/{id}   ── Analysis Dashboard ──
   ↓
   3s:  Score 84, 103 critical            → "Am I secure?"        ✓
   6s:  production namespace worst at 52  → "Where's the danger?" ✓
  10s:  Recommended action #1: remove 34 wildcard roles, +9 score ✓
   ↓
Clicks a Critical finding → reads Attack Impact → [View in Map]
   ↓
Sees jenkins-sa → CRB → cluster-admin → *:* → all secrets
   ↓
[ Create ticket ] — pre-filled Jira issue
```

**Time to first insight: under 90 seconds from signup**, and the whole path is one decision per step.

### 16.2 Returning operator — "what changed overnight?"

```
/app → Fleet overview: Fleet Score 74 ▼3, "payments degraded"
   ↓
Opens Production card → Score 84 ▲+6, but Staging ▼−7
   ↓
Staging → [Open Analysis] → dashboard shows High ▲+9
   ↓
[ ⇄ Compare with previous ] → 11 NEW findings, 15 resolved
   ↓
New: "Secrets write: new-ci-sa (payments)" ← yesterday's deploy
   ↓
[View in Map] → confirms path → [Create ticket] → assign
```

The regression is found in **four clicks** because "what's new since last time" is a first-class route, not something to reconstruct by memory.

### 16.3 Auditor — "prove least privilege"

```
/app/reports → Production · Weekly
   ↓
Score 84, Compliance 91% (38 of 42 CIS RBAC controls)
   ↓
[Preview] → Executive summary → Methodology section
   ↓
Which 4 controls fail, which subjects cause them, what the accepted
risks are (suppressed findings with reasons + who approved + expiry)
   ↓
[ ↓ Download PDF ] → attached to audit evidence
```

The **Methodology** and **Suppression audit trail** sections are what make this journey survive contact with a real auditor.

### 16.4 Journey principle

Each journey has exactly **one primary path** and never requires the user to hold state in their head. Everything they might need to remember — which scan, which filter, which baseline — is visible on screen or encoded in the URL.

---

## 17. Future roadmap

### Phase 1 — Structural (weeks 1–4) · *unblocks everything else*
- Scan-scoped routing `/app/scans/{scanId}/*`, `AnalysisShell` + `ScanContext`
- Fleet/Analysis mode split, new sidebar grouping
- Scan Context Bar + Scan Switcher
- Home empty state + fleet overview
- Cluster entity + cluster cards + snapshot history
- Legacy route redirects
- **Backend:** namespace count, scan duration, cluster grouping key, snapshot `metadata.json` ingest for k8s version

### Phase 2 — Posture intelligence (weeks 5–8)
- `lib/scoring.ts` domain model + "Why this score?" panel
- `lib/compliance.ts` CIS RBAC control mapping → real Compliance %
- Namespace scoring + heatmap + `?ns=` propagation
- Risk trend (requires ≥2 snapshots per cluster)
- New Analysis Dashboard, all 10 widgets, honest linear charts
- RBAC Inventory page + clickable inventory links

### Phase 3 — Investigation depth (weeks 9–14)
- RBAC Viewer rebuild: virtualization, effective permissions, grant chain, inherited access
- RBAC Map rebuild: dagre graph, focus/depth, reverse traversal, node detail
- `lib/attack-paths.ts` + Attack Path ribbon
- Risk Findings rebuild: expandable cards, grouping, MITRE, suppression with reasons
- Finding deep links

### Phase 4 — Workflow (weeks 15–20)
- Compare view promoted to `/app/scans/{a}/compare/{b}`
- Report content model + methodology section
- Command palette (⌘K)
- Jira / Linear / GitHub ticket creation
- Slack / Teams regression alerts
- Recommended Actions with score-gain estimates

### Phase 5 — Enterprise (weeks 21+)
- SSO (SAML/OIDC) + SCIM + role model
- Audit log
- Policy as code
- Continuous scanning agent ← *the strategic unlock*
- CI gating CLI
- Compliance packs (CIS, NSA/CISA, SOC 2 evidence)

### Beyond
Scope expansion to Pod Security (HostPath, privileged, securityContext) — reframes the product from "RBAC Analyzer" to "Kubernetes Security Posture". Then: cross-cluster identity correlation (the same human across 12 clusters), drift detection against a declared baseline, and remediation PRs generated straight into GitOps repos.

---

## Appendix A — Security Score model

### A.1 Why not a naive deduction

The obvious formula (`100 − 12×critical − 5×high − …`) breaks immediately: 103 criticals floors the score at 0, every cluster looks identical at 0, and the metric loses all resolution exactly where users need it most. It also cannot be decomposed, so "why 84?" has no answer.

### A.2 Domain-weighted model

Score is a weighted average of eight **control domain** scores. Each domain measures *what fraction of the relevant surface is compromised*, so it is bounded, decomposable, and stable.

| # | Domain | Weight | Measures |
| --- | --- | ---: | --- |
| 1 | Cluster-admin sprawl | 20 | Subjects with cluster-admin or equivalent |
| 2 | Privilege escalation paths | 20 | `escalate`, `bind`, `impersonate`, role/binding creation |
| 3 | Secret access | 15 | Read/write on `secrets`, `serviceaccounts/token` |
| 4 | Workload execution | 12 | `pods/exec`, `pods/attach`, `pods/portforward` |
| 5 | Wildcard permissions | 12 | `*` in apiGroups / resources / verbs |
| 6 | Identity hygiene | 8 | default SA bindings, anonymous/unauthenticated grants |
| 7 | Node & host access | 8 | `nodes`, `nodes/proxy`, `nodes/*` |
| 8 | Binding scope discipline | 5 | ClusterRoleBindings where a RoleBinding suffices |

```
domainScore_d = 100 × (1 − affectedWeight_d / eligibleWeight_d)

  affectedWeight_d = Σ over affected subjects:  severityWeight × scopeMultiplier
  eligibleWeight_d = total subjects (or roles) evaluated for that domain
  severityWeight   = critical 1.0 · high 0.6 · medium 0.3 · low 0.1
  scopeMultiplier  = cluster-scoped 1.5 · namespaced 1.0

securityScore = round( Σ_d ( weight_d × domainScore_d ) / Σ_d weight_d )
```

### A.3 Bands

| Range | Band | Colour token |
| --- | --- | --- |
| 90–100 | Strong | `--band-strong` |
| 75–89 | Moderate | `--band-moderate` |
| 50–74 | Weak | `--band-weak` |
| 0–49 | Critical | `--band-critical` |

### A.4 The breakdown panel

```
Why this score?                                       84 / 100 · Moderate
─────────────────────────────────────────────────────────────────────────
Domain                        Weight   Score   Contribution   vs Aug 12
Cluster-admin sprawl            20      61       12.2  ▼        ▲ +4
Privilege escalation paths      20      74       14.8  ▼        ▲ +2
Secret access                   15      79       11.9           ─
Workload execution              12      88       10.6           ▲ +1
Wildcard permissions            12      70        8.4  ▼        ▼ −3
Identity hygiene                 8      96        7.7           ─
Node & host access               8      92        7.4           ─
Binding scope discipline         5      88        4.4           ─
─────────────────────────────────────────────────────────────────────────
                                               84 / 100

Biggest opportunity: Cluster-admin sprawl — 11 subjects hold
cluster-admin. Reducing to 3 would raise the total score by ~7 points.
                                                        [ View subjects → ]
```

### A.5 Severity cap (added during implementation)

The domain model measures the **fraction** of the surface that is compromised, which means a large cluster dilutes: a real snapshot with **351 critical findings across 1,600 roles** computes to 90, and the bands would label that **"Strong"**. Showing "Strong" beside 351 unresolved criticals damages credibility exactly as much as an inconsistent number does.

The headline score is therefore capped by the worst severity still open:

| Open findings | Score ceiling | Band ceiling |
| --- | --- | --- |
| Any critical | 74 | Weak |
| Any high (no critical) | 89 | Moderate |
| Neither | 100 | Strong |

The cap is **reported, not hidden** — the breakdown panel states the uncomputed value ("computed 90, capped at 74") and why.

**The cap applies only to a snapshot's headline score.** Per-namespace scores are computed uncapped, because they exist to *rank* namespaces against each other: capping every namespace at 74 flattens the ordering the heatmap exists to show. (Verified against real data: with the cap applied to namespaces, six namespaces all read 74; uncapped they read 35 / 96 / 98 / 98 / 99 / 100.)

### A.6 Rules

- **Deterministic.** Same snapshot → same score, always. No randomness, no time decay inside a snapshot.
- **Never approximated.** The score needs individual findings to attribute them to domains, so it cannot be derived from aggregate severity counts. A snapshot whose dataset was not loaded reports "not computed" and renders as "—". An earlier build approximated it from `riskCounts`, which produced **2 in the fleet list and 84 on the dashboard for the same snapshot** — the exact failure mode this design exists to eliminate.
- **Suppressed findings are excluded** from `affectedWeight`, and the panel shows "3 suppressed findings excluded (+2 pts)" so the adjustment is never hidden.
- **Namespace scores** use the identical formula restricted to that namespace's objects, plus cluster-scoped grants that reach into it — which is why the heatmap needs the `⊕ cluster-wide` row.
- **Compliance % is a different metric.** It is `passing CIS controls / applicable CIS controls` — binary pass/fail per named control. A cluster can score 84 and be 91% compliant; those measure different things and must never be conflated in copy.

---

## Appendix B — Data requirements

### B.1 Available today

From `lib/rbac-scanner.ts:9-99`: subjects (`User`/`Group`/`ServiceAccount`), roles (`Role`/`ClusterRole` with rules), bindings (`RoleBinding`/`ClusterRoleBinding` with roleRef + subjects), findings (severity, category, subject, role, namespace, remediation, `affectedResources`, `impactedSubjects`, `evidence`), and `Scan` (id, fileName, createdAt, clusterName, totals, riskCounts, status, errorMessage).

Eight of the nine Attack Surface tiles map onto detection rules that already exist at `lib/rbac-scanner.ts:362-611`: cluster-admin, secrets write, `pods/exec`, RoleBinding creation, ClusterRole creation, impersonation, wildcard, secrets read, `pods/portforward`, token access, node access.

### B.2 Required additions

| Field | Where it comes from | Effort |
| --- | --- | --- |
| `namespaces: string[]` + count | Derive during parse from role/binding namespaces | S |
| `securityScore`, `domainScores[]` | `lib/scoring.ts` (Appendix A) | M |
| `compliance{passed,total,controls[]}` | `lib/compliance.ts` CIS mapping | M |
| `durationMs` | Scanner records `startedAt`/`completedAt` | S |
| `kubernetesVersion` | **Collector must emit `metadata.json`** — not present in RBAC objects | M (collector change) |
| `environment` | User-assigned label on Cluster | S |
| `clusterId` | Stable `workspaceId + clusterName` key + Cluster table | M |
| `mitre[]` per finding | Static rule → ATT&CK table | S |
| `attackPaths[]` | Graph traversal in scanner | L |
| `impactTemplate` per rule | Authored prose per detection rule | M |
| `findingStatus` (open/resolved/suppressed + reason + actor + expiry) | New table + API | M |
| HostPath / Privileged | **Out of RBAC scope** — see §13.7 | — |

### B.3 Proposed collector metadata

```json
{
  "kubescopeCollectorVersion": "1.0.0",
  "collectedAt": "2026-08-13T09:14:22Z",
  "clusterName": "production",
  "kubernetesVersion": "v1.31.2",
  "context": "prod-eu-west-1",
  "namespaces": ["default", "production", "payments", "..."],
  "objectCounts": { "roles": 186, "clusterRoles": 94,
                    "roleBindings": 203, "clusterRoleBindings": 71 }
}
```

Ship this as an optional `metadata.json` inside the ZIP. Snapshots without it still parse; the affected fields render `—` with a tooltip pointing at the collector docs. **Absent data is displayed as absent, never as zero.**

---

## Appendix C — Implementation map

| Change | Files |
| --- | --- |
| Remove auto-selection of active scan | `services/web/app/app/page.tsx:114-117` |
| Remove `kubescope-scan-updated` selection bus | `app/app/page.tsx:44-50`, `components/app/sidebar.tsx:104-113` |
| Fix distorted risk bars | `app/app/page.tsx:147-171` |
| Split sidebar into Fleet/Analysis | `components/app/sidebar.tsx:26-35` |
| Badge → open critical + high only | `components/app/sidebar.tsx:67-71` |
| Implement ⌘K palette | `components/app/header.tsx:95-107` |
| New analysis shell + ScanContext | `app/app/scans/[scanId]/layout.tsx` (new) |
| Rebuild map as graph | `app/app/rbac-map/page.tsx` → `app/app/scans/[scanId]/map/page.tsx` |
| Promote diff to scan-scoped route | `app/app/reports/diff/page.tsx` → `.../compare/[baselineId]/page.tsx`; reuse `lib/report-diff.ts` |
| Add rule metadata (domain, MITRE, CIS, impact) | `lib/rbac-scanner.ts:315-633` |
| Severity colours → tokens | `app/globals.css` + all `text-orange-500` usages |

---

*End of specification.*
