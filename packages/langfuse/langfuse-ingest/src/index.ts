/**
 * Langfuse Service Provider for the DeepSeek Harness telemetry capability.
 *
 * Composes the {@link SessionTelemetryCoordinator} capture side and maps each
 * ledger record onto a Langfuse trace/observation event, pushed in batches
 * through `ctx.langfuse.ingest()`. One trace is created per session (id
 * `tracePrefix-sessionId`); each session event becomes an observation whose
 * `input`/`output` carries the event body verbatim. Export timing follows the
 * coordinator's `session/flush` hint and `shutdown`.
 *
 * @module @deepseek-ai/dsh-langfuse-ingest
 */

import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import {
  SessionTelemetryCoordinator,
  type SessionTelemetryRecord,
  type SessionTelemetrySharingStatus,
  type SessionTelemetrySink,
} from '@deepseek-ai/dsh-session-telemetry'
import type { LangfuseIngestionEvent, LangfuseService } from '@deepseek-ai/dsh-langfuse'

/** Plugin configuration. */
export interface Config {
  /** Trace-name prefix for the per-session traces. */
  tracePrefix?: string
  /** Tags stamped on every session trace. */
  tags?: string[]
}

/** Schemastery validator for {@link Config}. */
export const Config: z<Config> = z.object({
  tracePrefix: z.string().default('dsh'),
  tags: z.array(z.string()).default([]),
})

/** Mutable mapping state carried between {@link mapLedgerRecordToEvents} calls. */
export interface MapState {
  emittedTraces: Set<string>
  counter: number
}

/**
 * Map one ledger record to Langfuse ingestion events (a `trace-create` on first
 * sight of the session, then an `observation-create` for the event itself).
 * Pure apart from mutating `state`.
 * @param record - the ledger record to map.
 * @param tracePrefix - trace-name prefix.
 * @param tags - tags for the session trace.
 * @param state - mutable trace/counter state.
 * @returns the ingestion events for this record.
 */
export function mapLedgerRecordToEvents(
  record: SessionTelemetryRecord,
  tracePrefix: string,
  tags: string[],
  state: MapState,
): LangfuseIngestionEvent[] {
  const events: LangfuseIngestionEvent[] = []
  const sessionId = String(record.attributes['session.id'] ?? 'unknown-session')
  const eventType = String(record.attributes['event.type'] ?? 'session-event')
  const traceId = `${tracePrefix}-${sessionId}`
  const timestamp = new Date(record.time).toISOString()

  if (!state.emittedTraces.has(traceId)) {
    state.emittedTraces.add(traceId)
    events.push({
      id: `${traceId}-trace`,
      type: 'trace-create',
      timestamp,
      body: { name: tracePrefix, tags, metadata: { 'session.id': sessionId } },
    })
  }

  const body: Record<string, unknown> = {
    traceId,
    type: eventType === 'assistant/message' ? 'GENERATION' : 'SPAN',
    name: eventType,
    metadata: { severity: record.severity },
  }
  if (eventType === 'assistant/message') {
    body.output = record.body
  } else {
    body.input = record.body
  }

  events.push({
    id: `${traceId}-obs-${state.counter}`,
    type: 'observation-create',
    timestamp,
    body,
  })
  state.counter += 1
  return events
}

/**
 * Records the harness' own session events into Langfuse via the ingestion API.
 * Attaches as an active SessionTelemetrySink via SessionTelemetryCoordinator.
 */
export class LangfuseIngestBackend implements SessionTelemetrySink {
  static inject = ['langfuse', 'sessions']

  static Config: z<Config> = Config

  private readonly langfuse: LangfuseService
  private readonly tracePrefix: string
  private readonly tags: string[]
  private readonly queue: LangfuseIngestionEvent[] = []
  private readonly state: MapState = { emittedTraces: new Set(), counter: 0 }

  constructor(ctx: Context, config: Config) {
    this.langfuse = ctx.langfuse
    this.tracePrefix = config.tracePrefix ?? 'dsh'
    this.tags = config.tags ?? []
    new SessionTelemetryCoordinator(ctx, this, 'live')
  }

  get sharing(): SessionTelemetrySharingStatus {
    return 'full'
  }

  /**
   * Enqueue one ledger record as a Langfuse observation. Non-blocking: the
   * network send happens on {@link flush} / {@link shutdown}.
   * @param record - the logical record to report.
   */
  emit(record: SessionTelemetryRecord): void {
    if (record.channel !== 'ledger') return
    this.queue.push(...mapLedgerRecordToEvents(record, this.tracePrefix, this.tags, this.state))
  }

  /** Drain the queue into Langfuse; fires on the coordinator's `session/flush` hint. */
  flush(): void {
    void this.drain()
  }

  /** Flush queued events and await quiescence. */
  async shutdown(): Promise<void> {
    await this.drain()
  }

  private async drain(): Promise<void> {
    if (this.queue.length === 0) return
    const batch = this.queue.splice(0, this.queue.length)
    try {
      await this.langfuse.ingest(batch)
    } catch {
      // Telemetry export is best-effort; a failed flush must not fail teardown.
    }
  }
}

export default LangfuseIngestBackend
