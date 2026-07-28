import { describe, it, expect } from "vitest"
import {
  reportTypeToProto,
  reportTypeFromProto,
  reportFormatToProto,
  reportFormatFromProto,
  scheduleFrequencyToProto,
  scheduleFrequencyFromProto,
} from "./enums"

describe("report enum conversions", () => {
  it("round-trips every report type through proto and back", () => {
    for (const key of Object.keys(reportTypeToProto) as (keyof typeof reportTypeToProto)[]) {
      expect(reportTypeFromProto[reportTypeToProto[key]]).toBe(key)
    }
  })

  it("round-trips every report format through proto and back", () => {
    for (const key of Object.keys(reportFormatToProto) as (keyof typeof reportFormatToProto)[]) {
      expect(reportFormatFromProto[reportFormatToProto[key]]).toBe(key)
    }
  })

  it("round-trips every schedule frequency through proto and back", () => {
    for (const key of Object.keys(scheduleFrequencyToProto) as (keyof typeof scheduleFrequencyToProto)[]) {
      expect(scheduleFrequencyFromProto[scheduleFrequencyToProto[key]]).toBe(key)
    }
  })
})
