// Structured logs with trace correlation.
//
// Each line is one JSON object carrying the trace_id/span_id of the active
// span. That id is what joins the two halves of the observability stack: a log
// line found in Kibana names the trace to open in Jaeger, and a slow span in
// Jaeger names the logs to search for. Bare console.log lines cannot be joined
// to a trace at all.
//
// Deliberately no logging library: fluentd already ships stdout/stderr from
// every pod, this only changes the shape of what it ships. For the trace_id to
// become a queryable field rather than text inside the message, fluentd needs
// a JSON parser on the container log source.
//
// Outside a span (startup, poll loop) the correlation fields are simply
// omitted — an all-zero trace id is worse than none.

import { isSpanContextValid, trace } from "@opentelemetry/api"

const service = process.env.OTEL_SERVICE_NAME || "report-service"

type Fields = Record<string, unknown>
type Level = "info" | "warn" | "error"

function emit(level: Level, msg: string, fields?: Fields): void {
  const spanContext = trace.getActiveSpan()?.spanContext()
  const correlation =
    spanContext && isSpanContextValid(spanContext)
      ? { trace_id: spanContext.traceId, span_id: spanContext.spanId }
      : {}

  const line = JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...correlation, ...fields })
  if (level === "error") console.error(line)
  else console.log(line)
}

export const log = {
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
}
