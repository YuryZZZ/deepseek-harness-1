/**
 * Langfuse API and configuration types for the `ctx.langfuse` capability seam.
 * @module @deepseek-ai/dsh-langfuse
 */

/** Langfuse health/version response. */
export interface LangfuseHealth {
  status: string
  version?: string
}

/** Pagination envelope shared by Langfuse list endpoints. */
export interface LangfuseMeta {
  page: number
  limit: number
  totalItems: number
  totalPages: number
}

/** A trace is one end-to-end flow: a user or agent task. */
export interface LangfuseTrace {
  id: string
  timestamp: string
  name: string
  input?: unknown
  output?: unknown
  sessionId?: string
  userId?: string
  release?: string
  version?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

/** A trace with nested observations and scores, as returned by list/detail endpoints. */
export interface LangfuseTraceWithDetails extends LangfuseTrace {
  observations?: LangfuseObservation[]
  scores?: LangfuseScore[]
  totalCost?: number
  latency?: number
}

/** An observation is one unit of work: a generation (LLM call), span, or event. */
export interface LangfuseObservation {
  id: string
  traceId?: string
  parentObservationId?: string
  type: 'GENERATION' | 'SPAN' | 'EVENT'
  name: string
  startTime: string
  endTime?: string
  model?: string
  input?: unknown
  output?: unknown
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  totalCost?: number
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR'
  statusMessage?: string
  usage?: LangfuseUsage
}

/** Token usage for an observation. */
export interface LangfuseUsage {
  input?: number
  output?: number
  total?: number
  unit?: string
}

/** An evaluation score attached to a trace or observation. */
export interface LangfuseScore {
  id: string
  traceId: string
  observationId?: string
  name: string
  value: number
  dataType?: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL'
  stringValue?: string
  comment?: string
  timestamp: string
}

/** One day of aggregated metrics from `/api/public/metrics/daily`. */
export interface LangfuseDailyMetric {
  date: string
  countTraces: number
  countObservations: number
  totalCost: number
  usage: LangfuseDailyUsage[]
}

/** Per-model usage bucket within a daily metric. */
export interface LangfuseDailyUsage {
  model?: string
  inputUsage?: number
  outputUsage?: number
  totalUsage?: number
  totalCost?: number
  countObservations?: number
  countTraces?: number
}

/** A generic list response envelope. */
export interface LangfuseList<T> {
  data: T[]
  meta: LangfuseMeta
}
