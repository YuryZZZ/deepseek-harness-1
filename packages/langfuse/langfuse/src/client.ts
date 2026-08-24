/**
 * Zero-dependency HTTP client for the Langfuse public REST API.
 * @module @deepseek-ai/dsh-langfuse
 */

import type {
  LangfuseDailyMetric,
  LangfuseHealth,
  LangfuseList,
  LangfuseObservation,
  LangfuseScore,
  LangfuseTraceWithDetails,
} from './types.ts'

/** Error thrown for transport and API failures; `status` is 0 for network errors. */
export class LangfuseError extends Error {
  /** HTTP status code; 0 for transport or network failures. */
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'LangfuseError'
    this.status = status
  }
}

/** Query filters shared by list endpoints. */
export interface LangfuseQuery {
  limit?: number
  page?: number
  fromTimestamp?: string
  toTimestamp?: string
  name?: string
  userId?: string
  sessionId?: string
  tags?: string[]
}

/** Result of the `/api/public/v2/metrics/numeric` endpoint. */
export interface LangfuseNumericMetric {
  data: Array<{ time?: string; value: number }>
}

/** Input for creating a score via `POST /api/public/scores`. */
export interface LangfuseScoreInput {
  traceId?: string
  observationId?: string
  name: string
  value: number
  comment?: string
  dataType?: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL'
}

/** One batched event for `POST /api/public/ingestion`. */
export interface LangfuseIngestionEvent {
  id: string
  type: 'trace-create' | 'observation-create' | 'observation-update' | 'score-create'
  timestamp: string
  body: Record<string, unknown>
}

/** Default per-request timeout for Langfuse API calls. */
const REQUEST_TIMEOUT_MS = 30_000

/** Build the HTTP Basic auth token for Langfuse public/secret keys. */
function basicAuth(publicKey: string, secretKey: string): string {
  return Buffer.from(`${publicKey}:${secretKey}`, 'utf8').toString('base64')
}

/** A thin, stateless client over the Langfuse public REST API. */
export class LangfuseClient {
  private readonly baseUrl: string
  private readonly auth: string

  constructor(config: { baseUrl: string; publicKey: string; secretKey: string }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.auth = basicAuth(config.publicKey, config.secretKey)
  }

  private async request<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
      }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(url, {
        headers: { Authorization: `Basic ${this.auth}`, Accept: 'application/json' },
        signal: controller.signal,
      })
    } catch (cause) {
      throw new LangfuseError(`Langfuse unreachable at ${this.baseUrl}: ${String(cause)}`)
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new LangfuseError(`Langfuse ${response.status} on ${path}: ${body.slice(0, 500)}`, response.status)
    }
    return (await response.json()) as T
  }

  /**
   * Fetch the server health and version.
   * @returns the health response.
   */
  async health(): Promise<LangfuseHealth> {
    return this.request<LangfuseHealth>('/api/public/health')
  }

  /**
   * List traces, newest first by default.
   * @param query - pagination and filter options.
   * @returns the matching traces.
   */
  async listTraces(query: LangfuseQuery = {}): Promise<LangfuseList<LangfuseTraceWithDetails>> {
    return this.request<LangfuseList<LangfuseTraceWithDetails>>('/api/public/traces', {
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      fromTimestamp: query.fromTimestamp,
      toTimestamp: query.toTimestamp,
      name: query.name,
      userId: query.userId,
      sessionId: query.sessionId,
      tags: query.tags?.join(','),
    })
  }

  /**
   * Fetch a single trace with its nested observations and scores.
   * @param traceId - the trace id.
   * @returns the trace.
   */
  async getTrace(traceId: string): Promise<LangfuseTraceWithDetails> {
    return this.request<LangfuseTraceWithDetails>(`/api/public/traces/${encodeURIComponent(traceId)}`)
  }

  /**
   * List observations (generations, spans, events).
   * @param query - pagination and filter options.
   * @returns the matching observations.
   */
  async listObservations(query: LangfuseQuery & { type?: string; traceId?: string } = {}): Promise<LangfuseList<LangfuseObservation>> {
    return this.request<LangfuseList<LangfuseObservation>>('/api/public/observations', {
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      traceId: query.traceId,
      type: query.type,
      fromTimestamp: query.fromTimestamp,
      toTimestamp: query.toTimestamp,
      name: query.name,
    })
  }

  /**
   * List evaluation scores.
   * @param query - pagination and filter options.
   * @returns the matching scores.
   */
  async listScores(query: LangfuseQuery & { name?: string } = {}): Promise<LangfuseList<LangfuseScore>> {
    return this.request<LangfuseList<LangfuseScore>>('/api/public/scores', {
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      name: query.name,
      fromTimestamp: query.fromTimestamp,
      toTimestamp: query.toTimestamp,
    })
  }

  /**
   * Fetch per-day aggregated metrics over a closed window.
   * @param fromTimestamp - inclusive start ISO timestamp.
   * @param toTimestamp - exclusive end ISO timestamp.
   * @returns one daily metric per day.
   */
  async metricsDaily(fromTimestamp: string, toTimestamp: string): Promise<{ data: LangfuseDailyMetric[] }> {
    return this.request<{ data: LangfuseDailyMetric[] }>('/api/public/metrics/daily', {
      fromTimestamp,
      toTimestamp,
    })
  }

  /**
   * Fetch one numeric metric series over a closed window.
   * @param name - the metric name.
   * @param fromTimestamp - inclusive start ISO timestamp.
   * @param toTimestamp - exclusive end ISO timestamp.
   * @param aggregate - aggregation method.
   * @returns the metric series.
   */
  async numericMetric(
    name: string,
    fromTimestamp: string,
    toTimestamp: string,
    aggregate: 'sum' | 'avg' | 'count' = 'sum',
  ): Promise<LangfuseNumericMetric> {
    return this.request<LangfuseNumericMetric>('/api/public/v2/metrics/numeric', {
      name,
      fromTimestamp,
      toTimestamp,
      aggregate,
    })
  }

  /**
   * Create a score via `POST /api/public/scores`.
   * @param input - the score to create.
   * @returns the created score.
   */
  async createScore(input: LangfuseScoreInput): Promise<unknown> {
    return this.post<unknown>('/api/public/scores', input)
  }

  /**
   * Ingest a batch of trace/observation/score events via `POST /api/public/ingestion`.
   * @param batch - the events to ingest.
   * @returns the ingestion result.
   */
  async ingest(batch: LangfuseIngestionEvent[]): Promise<unknown> {
    return this.post<unknown>('/api/public/ingestion', { batch })
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Basic ${this.auth}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (cause) {
      throw new LangfuseError(`Langfuse unreachable at ${this.baseUrl}: ${String(cause)}`)
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new LangfuseError(`Langfuse ${response.status} on ${path}: ${text.slice(0, 500)}`, response.status)
    }
    return (await response.json()) as T
  }
}
