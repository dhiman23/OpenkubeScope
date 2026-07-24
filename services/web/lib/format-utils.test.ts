import { describe, it, expect } from "vitest"
import { getTimeAgo, getTotalRisks } from "./format-utils"
import type { Scan } from "@/lib/rbac-scanner"

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

describe("getTimeAgo", () => {
  it("returns 'Just now' under a minute", () => {
    expect(getTimeAgo(iso(30_000))).toBe("Just now")
  })

  it("uses singular for exactly one minute", () => {
    expect(getTimeAgo(iso(61_000))).toBe("1 minute ago")
  })

  it("uses plural minutes", () => {
    expect(getTimeAgo(iso(5 * 60_000))).toBe("5 minutes ago")
  })

  it("switches to hours past 60 minutes", () => {
    expect(getTimeAgo(iso(3 * 60 * 60_000))).toBe("3 hours ago")
  })

  it("switches to days past 24 hours", () => {
    expect(getTimeAgo(iso(2 * 24 * 60 * 60_000))).toBe("2 days ago")
  })
})

describe("getTotalRisks", () => {
  it("sums all severity counts", () => {
    const scan = { riskCounts: { critical: 1, high: 2, medium: 3, low: 4 } } as Scan
    expect(getTotalRisks(scan)).toBe(10)
  })

  it("returns 0 when riskCounts is absent", () => {
    expect(getTotalRisks({} as Scan)).toBe(0)
  })
})
