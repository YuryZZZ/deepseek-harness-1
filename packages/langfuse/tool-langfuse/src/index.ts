/**
 * Model-facing Langfuse observability tools: reachability status, trace
 * listing/detail, daily metrics, evaluation scores, and a full analysis pass
 * that produces prioritized improvements and research directions.
 * @module @deepseek-ai/dsh-tool-langfuse
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  formatAnalysisReport,
  type LangfuseService,
  type LangfuseTraceWithDetails,
} from '@deepseek-ai/dsh-langfuse'

export const name = 'tool-langfuse'
export const inject = ['tools', 'langfuse']

/** Render one trace summary line. */
function formatTrace(trace: LangfuseTraceWithDetails): string {
  const cost = trace.totalCost === undefined ? '' : `, $${trace.totalCost.toFixed(4)}`
  const latency = trace.latency === undefined ? '' : `, ${(trace.latency / 1000).toFixed(1)}s`
  const scores = trace.scores?.map(s => `${s.name}=${s.value}`).join(', ')
  const scoreText = scores !== undefined && scores !== '' ? `, scores {${scores}}` : ''
  return `- ${trace.name} (${trace.id}) @ ${trace.timestamp}${cost}${latency}${scoreText}`
}

export function apply(ctx: Context) {
  const langfuse: LangfuseService = ctx.langfuse

  ctx.tools.register(defineTool({
    name: 'langfuse_status',
    description: 'Check whether the Langfuse observability server is reachable and report recent trace and cost activity.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() {
      const status = await langfuse.refresh()
      const lines = [
        `Langfuse reachable: ${status.reachable ? 'yes' : 'no'}`,
        `Last sync: ${status.lastSyncAt ?? 'never'}`,
        `Recent traces (${langfuse.defaultWindowDays}d window): ${status.recentTraceCount}`,
        `Recent cost: $${status.recentTotalCost.toFixed(4)}`,
      ]
      if (status.lastError !== null) lines.push(`Last error: ${status.lastError}`)
      return lines.join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langfuse_traces',
    description: 'List recent Langfuse traces (flows), optionally filtered by name.',
    parameters: {
      limit: { type: 'number', description: 'Maximum traces to return (default 20).' },
      name: { type: 'string', description: 'Optional trace-name substring filter.' },
      hoursAgo: { type: 'number', description: 'Look back this many hours (default 24).' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const hoursAgo = args.hoursAgo ?? 24
      const from = new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
      const result = await langfuse.client.listTraces({
        limit: args.limit ?? 20,
        fromTimestamp: from,
        ...(args.name !== undefined ? { name: args.name } : {}),
      })
      if (result.data.length === 0) return 'No traces in the requested window.'
      return result.data.map(formatTrace).join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langfuse_trace',
    description: 'Fetch one Langfuse trace (flow) with its observations (generations) and scores.',
    parameters: {
      traceId: { type: 'string', required: true, description: 'The trace id.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const trace = await langfuse.client.getTrace(args.traceId)
      const lines = [`Trace: ${trace.name} (${trace.id}) @ ${trace.timestamp}`]
      if (trace.userId !== undefined) lines.push(`User: ${trace.userId}`)
      if (trace.sessionId !== undefined) lines.push(`Session: ${trace.sessionId}`)
      if (trace.totalCost !== undefined) lines.push(`Cost: $${trace.totalCost.toFixed(4)}`)
      if (trace.latency !== undefined) lines.push(`Latency: ${(trace.latency / 1000).toFixed(1)}s`)
      const observations = trace.observations ?? []
      if (observations.length > 0) {
        lines.push('Observations:')
        for (const obs of observations) {
          const model = obs.model === undefined ? '' : ` model=${obs.model}`
          const tokens = obs.totalTokens === undefined ? '' : ` ${obs.totalTokens} tokens`
          const cost = obs.totalCost === undefined ? '' : ` $${obs.totalCost.toFixed(4)}`
          const level = obs.level === undefined ? '' : ` level=${obs.level}`
          const error = obs.statusMessage === undefined ? '' : ` error="${obs.statusMessage}"`
          lines.push(`  - ${obs.name} [${obs.type}]${model}${tokens}${cost}${level}${error}`)
        }
      }
      const scores = trace.scores ?? []
      if (scores.length > 0) {
        lines.push('Scores:')
        for (const score of scores) lines.push(`  - ${score.name} = ${score.value}`)
      }
      return lines.join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langfuse_metrics',
    description: 'Report daily Langfuse metrics (traces, observations, cost) over a window.',
    parameters: {
      days: { type: 'number', description: 'Number of days to cover (default 7).' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const days = args.days ?? 7
      const to = new Date()
      const from = new Date(to.getTime() - days * 86_400_000)
      const metrics = await langfuse.client.metricsDaily(from.toISOString(), to.toISOString())
      if (metrics.data.length === 0) return 'No metrics in the requested window.'
      let totalTraces = 0
      let totalCost = 0
      const lines: string[] = []
      for (const day of metrics.data) {
        totalTraces += day.countTraces
        totalCost += day.totalCost
        lines.push(`- ${day.date}: ${day.countTraces} traces, ${day.countObservations} observations, $${day.totalCost.toFixed(4)}`)
      }
      lines.unshift(`Totals over ${days}d: ${totalTraces} traces, $${totalCost.toFixed(4)}`)
      return lines.join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langfuse_scores',
    description: 'List recent Langfuse evaluation scores, optionally filtered by score name.',
    parameters: {
      days: { type: 'number', description: 'Number of days to cover (default 7).' },
      name: { type: 'string', description: 'Optional score-name filter.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const days = args.days ?? 7
      const to = new Date()
      const from = new Date(to.getTime() - days * 86_400_000)
      const result = await langfuse.client.listScores({
        limit: 50,
        fromTimestamp: from.toISOString(),
        toTimestamp: to.toISOString(),
        ...(args.name !== undefined ? { name: args.name } : {}),
      })
      if (result.data.length === 0) return 'No scores in the requested window.'
      return result.data.map(s => `- ${s.name} = ${s.value} (trace ${s.traceId}, ${s.timestamp})`).join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langfuse_analyze',
    description: 'Run a full analysis of recent Langfuse telemetry and return prioritized insights, recommendations, and research directions.',
    parameters: {
      windowDays: { type: 'number', description: 'Analysis window in days (default: service default, usually 7).' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const report = await langfuse.analyze(args.windowDays)
      return formatAnalysisReport(report)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langfuse_score',
    description: 'Write an evaluation score or feedback back to a Langfuse trace or observation.',
    parameters: {
      name: { type: 'string', required: true, description: 'Score name, e.g. "accuracy" or "quality_score".' },
      value: { type: 'number', required: true, description: 'Numeric score value.' },
      traceId: { type: 'string', description: 'Optional trace id to attach the score to.' },
      observationId: { type: 'string', description: 'Optional observation id to attach the score to.' },
      comment: { type: 'string', description: 'Optional human-readable comment.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      await langfuse.score({
        name: args.name,
        value: args.value,
        ...(args.traceId !== undefined ? { traceId: args.traceId } : {}),
        ...(args.observationId !== undefined ? { observationId: args.observationId } : {}),
        ...(args.comment !== undefined ? { comment: args.comment } : {}),
      })
      return `Score "${args.name}" = ${args.value} recorded.`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langfuse_record',
    description: 'Record a custom trace (a prompt, result, or workflow step) into Langfuse.',
    parameters: {
      name: { type: 'string', required: true, description: 'Trace name, e.g. "prompt-experiment" or "manual-review".' },
      input: { type: 'string', description: 'Input text or prompt.' },
      output: { type: 'string', description: 'Output or result text.' },
      tags: { type: 'string', description: 'Comma-separated tags.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const id = randomUUID()
      const tags = args.tags === undefined ? [] : args.tags.split(',').map(t => t.trim()).filter(t => t !== '')
      await langfuse.ingest([{
        id,
        type: 'trace-create',
        timestamp: new Date().toISOString(),
        body: {
          name: args.name,
          input: args.input,
          output: args.output,
          tags,
        },
      }])
      return `Trace "${args.name}" recorded (id ${id}).`
    },
  }))
}
