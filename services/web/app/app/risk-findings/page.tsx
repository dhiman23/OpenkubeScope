"use client"

import { LegacyScanRedirect } from "@/components/app/legacy-scan-redirect"

// Legacy route. Analysis pages are scoped to a snapshot now — see
// /app/scans/[scanId]/findings. This keeps old links and bookmarks working.
export default function LegacyPage() {
  return <LegacyScanRedirect suffix="/findings" />
}
