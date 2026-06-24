// String <-> proto-enum conversions for report.proto types. DB rows store the
// string forms (matching the monolith's CHECK constraints); proto uses numeric
// enums. Kept in one place so repos and server stay in sync.

import * as proto from "../generated/report"
import type { ReportType, ReportFormat, ReportStatusStr } from "./rbac-types"

export type ScheduleFrequencyStr = "daily" | "weekly" | "monthly"

export const reportTypeToProto: Record<ReportType, proto.ReportType> = {
  COMPLIANCE: proto.ReportType.COMPLIANCE,
  RISK_ASSESSMENT: proto.ReportType.RISK_ASSESSMENT,
  RBAC_AUDIT: proto.ReportType.RBAC_AUDIT,
  TREND_ANALYSIS: proto.ReportType.TREND_ANALYSIS,
}

export const reportTypeFromProto: Record<number, ReportType> = {
  [proto.ReportType.COMPLIANCE]: "COMPLIANCE",
  [proto.ReportType.RISK_ASSESSMENT]: "RISK_ASSESSMENT",
  [proto.ReportType.RBAC_AUDIT]: "RBAC_AUDIT",
  [proto.ReportType.TREND_ANALYSIS]: "TREND_ANALYSIS",
}

export const reportFormatToProto: Record<ReportFormat, proto.ReportFormat> = {
  PDF: proto.ReportFormat.PDF,
  JSON: proto.ReportFormat.JSON,
  CSV: proto.ReportFormat.CSV,
}

export const reportFormatFromProto: Record<number, ReportFormat> = {
  [proto.ReportFormat.PDF]: "PDF",
  [proto.ReportFormat.JSON]: "JSON",
  [proto.ReportFormat.CSV]: "CSV",
}

export const reportStatusToProto: Record<ReportStatusStr, proto.ReportStatus> = {
  generating: proto.ReportStatus.PENDING,
  completed: proto.ReportStatus.COMPLETED,
  failed: proto.ReportStatus.FAILED,
}

export const scheduleFrequencyToProto: Record<ScheduleFrequencyStr, proto.ScheduleFrequency> = {
  daily: proto.ScheduleFrequency.DAILY,
  weekly: proto.ScheduleFrequency.WEEKLY,
  monthly: proto.ScheduleFrequency.MONTHLY,
}

export const scheduleFrequencyFromProto: Record<number, ScheduleFrequencyStr> = {
  [proto.ScheduleFrequency.DAILY]: "daily",
  [proto.ScheduleFrequency.WEEKLY]: "weekly",
  [proto.ScheduleFrequency.MONTHLY]: "monthly",
}
