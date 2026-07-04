// Promisified gRPC clients for the two internal services. core-api is the only
// REST-facing tier; browsers talk REST to it, it talks gRPC to these.

import * as grpc from "@grpc/grpc-js"
import { RbacScannerServiceClient } from "../generated/scanner"
import * as scanner from "../generated/scanner"
import { ReportServiceClient } from "../generated/report"
import * as report from "../generated/report"

let scannerClient: RbacScannerServiceClient | null = null
let reportClient: ReportServiceClient | null = null

function scannerC(): RbacScannerServiceClient {
  if (!scannerClient) {
    scannerClient = new RbacScannerServiceClient(process.env.SCANNER_SERVICE_ADDR || "localhost:50051", grpc.credentials.createInsecure())
  }
  return scannerClient
}

function reportC(): ReportServiceClient {
  if (!reportClient) {
    reportClient = new ReportServiceClient(process.env.REPORT_SERVICE_ADDR || "localhost:50052", grpc.credentials.createInsecure())
  }
  return reportClient
}

// The grpc-js generated client methods are overloaded; wrapping each call in an
// explicit callback lambda gives clean Res inference (binding the method
// directly collapses to `unknown` because of the overloads).
function call<Res>(invoke: (cb: (e: grpc.ServiceError | null, r: Res) => void) => void): Promise<Res> {
  return new Promise<Res>((resolve, reject) => {
    invoke((err, res) => (err ? reject(err) : resolve(res)))
  })
}

// ---- scanner ----
export const scannerApi = {
  scanSnapshot: (req: scanner.ScanSnapshotRequest) => call<scanner.ScanSnapshotResponse>((cb) => scannerC().scanSnapshot(req, cb)),
  submitScan: (req: scanner.SubmitScanRequest) => call<scanner.SubmitScanResponse>((cb) => scannerC().submitScan(req, cb)),
  getScan: (req: scanner.GetScanRequest) => call<scanner.GetScanResponse>((cb) => scannerC().getScan(req, cb)),
  listScans: (req: scanner.ListScansRequest) => call<scanner.ListScansResponse>((cb) => scannerC().listScans(req, cb)),
  listScansByCluster: (req: scanner.ListScansByClusterRequest) => call<scanner.ListScansByClusterResponse>((cb) => scannerC().listScansByCluster(req, cb)),
  deleteScan: (req: scanner.DeleteScanRequest) => call<scanner.DeleteScanResponse>((cb) => scannerC().deleteScan(req, cb)),
}

// ---- report ----
export const reportApi = {
  generateReport: (req: report.GenerateReportRequest) => call<report.GenerateReportResponse>((cb) => reportC().generateReport(req, cb)),
  getReport: (req: report.GetReportRequest) => call<report.GetReportResponse>((cb) => reportC().getReport(req, cb)),
  listReports: (req: report.ListReportsRequest) => call<report.ListReportsResponse>((cb) => reportC().listReports(req, cb)),
  deleteReport: (req: report.DeleteReportRequest) => call<report.DeleteReportResponse>((cb) => reportC().deleteReport(req, cb)),
  listScheduledReports: (req: report.ListScheduledReportsRequest) => call<report.ListScheduledReportsResponse>((cb) => reportC().listScheduledReports(req, cb)),
  createScheduledReport: (req: report.CreateScheduledReportRequest) => call<report.CreateScheduledReportResponse>((cb) => reportC().createScheduledReport(req, cb)),
  deleteScheduledReport: (req: report.DeleteScheduledReportRequest) => call<report.DeleteScheduledReportResponse>((cb) => reportC().deleteScheduledReport(req, cb)),
  toggleScheduledReport: (req: report.ToggleScheduledReportRequest) => call<report.ToggleScheduledReportResponse>((cb) => reportC().toggleScheduledReport(req, cb)),
  runDueScheduledReports: (req: report.RunDueScheduledReportsRequest) => call<report.RunDueScheduledReportsResponse>((cb) => reportC().runDueScheduledReports(req, cb)),
}

export function closeClients(): void {
  scannerClient?.close()
  reportClient?.close()
  scannerClient = null
  reportClient = null
}

// Re-export proto enums/namespaces routes need for request building.
export { scanner, report }
