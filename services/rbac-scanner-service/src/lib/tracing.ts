// Manual span helpers.
//
// Auto-instrumentation only sees I/O (grpc, pg, ioredis, aws-sdk), so the
// expensive in-process work shows up in a trace as an unexplained gap between
// two I/O spans. These helpers put a span around that work and carry the
// business attributes (workspace/scan/report ids, sizes, counts) that make a
// trace answerable instead of just timed.
//
// When no collector is configured startTelemetry() never starts the SDK, so
// trace.getTracer() returns the no-op tracer and everything below is free.
// Nothing here needs an "is tracing on?" guard.

import { SpanStatusCode, trace, type Attributes, type Span } from "@opentelemetry/api"

export const tracer = trace.getTracer("rbac-scanner-service")

function recordFailure(span: Span, err: unknown): void {
  span.recordException(err instanceof Error ? err : new Error(String(err)))
  span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) })
}

/** Runs fn inside an active span; records exceptions and always ends the span. */
export async function withSpan<T>(name: string, attributes: Attributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span)
    } catch (err) {
      recordFailure(span, err)
      throw err
    } finally {
      span.end()
    }
  })
}

/** Synchronous variant, for CPU-bound steps that never await. */
export function withSyncSpan<T>(name: string, attributes: Attributes, fn: (span: Span) => T): T {
  return tracer.startActiveSpan(name, { attributes }, (span) => {
    try {
      return fn(span)
    } catch (err) {
      recordFailure(span, err)
      throw err
    } finally {
      span.end()
    }
  })
}
