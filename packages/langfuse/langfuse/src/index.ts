/**
 * Langfuse observability service (`ctx.langfuse`): a persistent client over the
 * user's Langfuse deployment plus an analysis engine that turns raw telemetry
 * into actionable LLM-operations recommendations.
 * @module @deepseek-ai/dsh-langfuse
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LangfuseClient } from './client.ts'
import type { LangfuseIngestionEvent, LangfuseScoreInput } from './client.ts'
import { analyzeTelemetry } from './analyzer.ts'
import type { AnalysisReport } from './analyzer.ts'
import type { LangfuseHealth } from './types.ts'

export { LangfuseClient, LangfuseError } from './client.ts'
export type { LangfuseIngestionEvent, LangfuseScoreInput } from './client.ts'
export { analyzeTelemetry, formatAnalysisReport } from './analyzer.ts'
export type {
  AnalysisReport,
  Insight,
  InsightCategory,
  InsightSeverity,
  ModelBreakdown,
  Recommendation,
} from './analyzer.ts'
export type {
  LangfuseDailyMetric,
  LangfuseDailyUsage,
  LangfuseHealth,
  LangfuseList,
  LangfuseMeta,
  LangfuseObservation,
  LangfuseScore,
  LangfuseTrace,
  LangfuseTraceWithDetails,
  LangfuseUsage,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    langfuse: LangfuseService
  }
}

/** Plugin configuration; `static Config` supplies the defaults. */
export interface Config {
  /** Base URL of the Langfuse server, no trailing slash. */
  baseUrl: string
  /** Langfuse public key (client id). */
  publicKey: string
  /** Langfuse secret key. */
  secretKey: string
  /** Optional project id to scope reads to one workspace. */
  projectId?: string
  /** Background refresh interval in milliseconds; 0 disables the poller. */
  pollIntervalMs?: number
  /** Default analysis window in days. */
  defaultWindowDays?: number
}

/** Live reachability snapshot maintained by the service. */
export interface LiveStatus {
  reachable: boolean
  lastSyncAt: string | null
  lastError: string | null
  recentTraceCount: number
  recentTotalCost: number
}

/**
 * Persistent Langfuse service. Mounted for the lifetime of the composition,
 * it keeps a live reachability snapshot (refreshed at boot and on an optional
 * interval) and exposes an on-demand analysis pass over recent telemetry.
 */
export class LangfuseService extends Service {
  static Config: z<Config> = z.object({
    baseUrl: z.string().required(),
    publicKey: z.string().required(),
    secretKey: z.string().required(),
    projectId: z.string(),
    pollIntervalMs: z.number().default(0),
    defaultWindowDays: z.number().default(7),
  })

  /** The underlying HTTP client; public so consumers can run raw queries. */
  readonly client: LangfuseClient
  private readonly config: Config
  private status: LiveStatus = { reachable: false, lastSyncAt: null, lastError: null, recentTraceCount: 0, recentTotalCost: 0 }
  private latestReport: AnalysisReport | null = null

  constructor(ctx: Context, config: Config) {
    super(ctx, 'langfuse')
    this.config = config
    this.client = new LangfuseClient(config)
    const interval = config.pollIntervalMs ?? 0
    if (interval > 0) {
      ctx.effect(() => {
        const timer = setInterval(() => {
          void this.refresh()
        }, interval)
        return () => {
          clearInterval(timer)
        }
      })
    }
  }

  /** The configured default analysis window in days. */
  get defaultWindowDays(): number {
    return this.config.defaultWindowDays ?? 7
  }

  /**
   * Return the cached reachability snapshot without making a request.
   * @returns the current snapshot.
   */
  getStatus(): LiveStatus {
    return this.status
  }

  /**
   * Return the most recent analysis report, or `null` if none has run.
   * @returns the latest report, if any.
   */
  getLatestReport(): AnalysisReport | null {
    return this.latestReport
  }

  /**
   * Fetch the server health and version.
   * @returns the health response.
   */
  async health(): Promise<LangfuseHealth> {
    return this.client.health()
  }

  /**
   * Refresh the live reachability snapshot from the server. Never throws;
   * failures are recorded in the snapshot's `lastError`.
   * @returns the updated snapshot.
   */
  async refresh(): Promise<LiveStatus> {
    try {
      const now = new Date()
      const from = new Date(now.getTime() - this.defaultWindowDays * 86_400_000)
      await this.client.health()
      const metrics = await this.client.metricsDaily(from.toISOString(), now.toISOString())
      let recentTraceCount = 0
      let recentTotalCost = 0
      for (const day of metrics.data) {
        recentTraceCount += day.countTraces
        recentTotalCost += day.totalCost
      }
      this.status = { reachable: true, lastSyncAt: now.toISOString(), lastError: null, recentTraceCount, recentTotalCost }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      this.status = { ...this.status, reachable: false, lastError: message }
    }
    return this.status
  }

  /**
   * Run a full analysis pass over the most recent telemetry.
   * @param windowDays - analysis window; defaults to {@link defaultWindowDays}.
   * @returns the analysis report, also cached via {@link getLatestReport}.
   */
  async analyze(windowDays: number = this.defaultWindowDays): Promise<AnalysisReport> {
    const to = new Date()
    const from = new Date(to.getTime() - windowDays * 86_400_000)
    const fromIso = from.toISOString()
    const toIso = to.toISOString()
    const [traces, observations, scores, metrics] = await Promise.all([
      this.client.listTraces({ fromTimestamp: fromIso, toTimestamp: toIso, limit: 100 }),
      this.client.listObservations({ fromTimestamp: fromIso, toTimestamp: toIso, limit: 100 }),
      this.client.listScores({ fromTimestamp: fromIso, toTimestamp: toIso, limit: 100 }),
      this.client.metricsDaily(fromIso, toIso),
    ])
    const report = analyzeTelemetry({
      from: fromIso,
      to: toIso,
      traces: traces.data,
      observations: observations.data,
      scores: scores.data,
      metrics: metrics.data,
    })
    this.latestReport = report
    return report
  }

  /**
   * Write an evaluation score back to Langfuse.
   * @param input - the score to create.
   * @returns the created score.
   */
  async score(input: LangfuseScoreInput): Promise<unknown> {
    return this.client.createScore(input)
  }

  /**
   * Ingest a batch of trace/observation/score events into Langfuse.
   * @param batch - the events to ingest.
   * @returns the ingestion result.
   */
  async ingest(batch: LangfuseIngestionEvent[]): Promise<unknown> {
    return this.client.ingest(batch)
  }
}

export default LangfuseService
