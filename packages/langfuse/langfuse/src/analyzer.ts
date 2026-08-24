/**
 * Pure analysis: turn raw Langfuse telemetry into insights, recommendations,
 * and research directions. No I/O; every input arrives as plain data.
 * @module @deepseek-ai/dsh-langfuse
 */

import type {
  LangfuseDailyMetric,
  LangfuseObservation,
  LangfuseScore,
  LangfuseTraceWithDetails,
} from './types.ts'

export type InsightCategory = 'cost' | 'latency' | 'quality' | 'reliability' | 'usage' | 'evaluation'
export type InsightSeverity = 'info' | 'warning' | 'critical'

/** One detected finding, with concrete evidence. */
export interface Insight {
  severity: InsightSeverity
  category: InsightCategory
  title: string
  detail: string
  evidence: string
}

/** One concrete action that follows from an insight. */
export interface Recommendation {
  category: InsightCategory
  title: string
  action: string
  expectedImpact: string
  effort: 'low' | 'medium' | 'high'
}

/** Per-model rollup of authoritative daily metrics plus sampled latency. */
export interface ModelBreakdown {
  model: string
  traces: number
  observations: number
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  avgLatencyMs: number | null
  errorCount: number
  /** Zero cost with no input/output token split: likely an agent role, not a model. */
  suspicious: boolean
}

/** Aggregate stats for one evaluation-score name. */
export interface ScoreStat {
  name: string
  count: number
  avg: number
  min: number
  max: number
}

/** The full analysis produced by {@link analyzeTelemetry}. */
export interface AnalysisReport {
  from: string
  to: string
  traceCount: number
  observationCount: number
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  errorCount: number
  errorRate: number
  distinctModels: number
  distinctUsers: number
  scoredTraceCount: number
  models: ModelBreakdown[]
  scoreStats: ScoreStat[]
  insights: Insight[]
  recommendations: Recommendation[]
  researchDirections: string[]
}

const ERROR_LEVELS: ReadonlySet<string> = new Set(['ERROR', 'WARNING'])
const HIGH_ERROR_RATE = 0.05
const HIGH_LATENCY_MS = 10_000
const COST_CONCENTRATION = 0.6

function isErrorObservation(obs: LangfuseObservation): boolean {
  return obs.level !== undefined && ERROR_LEVELS.has(obs.level)
}

function latencyMs(obs: LangfuseObservation): number | null {
  if (obs.endTime === undefined) return null
  const ms = Date.parse(obs.endTime) - Date.parse(obs.startTime)
  return Number.isFinite(ms) ? ms : null
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Reduce telemetry samples into a structured analysis with prioritized
 * insights and recommendations. Pure: identical input yields identical output.
 * @param input - traces, observations, scores, and metrics for one window.
 * @returns the analysis report.
 */
export function analyzeTelemetry(input: {
  from: string
  to: string
  traces: LangfuseTraceWithDetails[]
  observations: LangfuseObservation[]
  scores: LangfuseScore[]
  metrics: LangfuseDailyMetric[]
}): AnalysisReport {
  const { from, to, traces, observations, scores, metrics } = input

  // Authoritative totals and per-model rollups from daily metrics.
  let totalCost = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let metricTraceCount = 0
  let metricObservationCount = 0
  const byModel = new Map<string, ModelBreakdown>()

  for (const day of metrics) {
    metricTraceCount += day.countTraces
    metricObservationCount += day.countObservations
    totalCost += day.totalCost
    for (const usage of day.usage) {
      const model = usage.model ?? '(unknown)'
      let entry = byModel.get(model)
      if (entry === undefined) {
        entry = {
          model,
          traces: 0,
          observations: 0,
          totalCost: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          avgLatencyMs: null,
          errorCount: 0,
          suspicious: false,
        }
        byModel.set(model, entry)
      }
      entry.totalCost += usage.totalCost ?? 0
      entry.totalInputTokens += usage.inputUsage ?? 0
      entry.totalOutputTokens += usage.outputUsage ?? 0
      entry.traces += usage.countTraces ?? 0
      entry.observations += usage.countObservations ?? 0
    }
  }
  for (const entry of byModel.values()) {
    totalInputTokens += entry.totalInputTokens
    totalOutputTokens += entry.totalOutputTokens
    entry.suspicious = entry.totalCost === 0 && entry.totalInputTokens === 0 && entry.totalOutputTokens === 0
  }

  const traceCount = metricTraceCount > 0 ? metricTraceCount : traces.length
  const observationCount = metricObservationCount > 0 ? metricObservationCount : observations.length

  // Latency and errors come from the observation sample.
  const modelLatencies = new Map<string, number[]>()
  let errorCount = 0
  for (const obs of observations) {
    const model = obs.model ?? '(unknown)'
    const ms = latencyMs(obs)
    if (ms !== null) {
      const list = modelLatencies.get(model) ?? []
      list.push(ms)
      modelLatencies.set(model, list)
    }
    if (isErrorObservation(obs)) errorCount += 1
  }
  for (const entry of byModel.values()) {
    entry.avgLatencyMs = average(modelLatencies.get(entry.model) ?? [])
  }
  const errorRate = observationCount > 0 ? errorCount / observationCount : 0

  const models = [...byModel.values()].sort((a, b) => b.totalCost - a.totalCost)
  const distinctModels = byModel.size
  const distinctUsers = new Set(traces.map(t => t.userId).filter((id): id is string => id !== undefined)).size

  // Scores grouped by name, so heterogeneous metrics (durations, flags) stay separate.
  const byScoreName = new Map<string, { count: number; sum: number; min: number; max: number }>()
  const scoredTraceIds = new Set<string>()
  for (const score of scores) {
    scoredTraceIds.add(score.traceId)
    let stat = byScoreName.get(score.name)
    if (stat === undefined) {
      stat = { count: 0, sum: 0, min: score.value, max: score.value }
      byScoreName.set(score.name, stat)
    }
    stat.count += 1
    stat.sum += score.value
    stat.min = Math.min(stat.min, score.value)
    stat.max = Math.max(stat.max, score.value)
  }
  const scoreStats: ScoreStat[] = [...byScoreName.entries()]
    .map(([name, stat]) => ({ name, count: stat.count, avg: stat.sum / stat.count, min: stat.min, max: stat.max }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const scoredTraceCount = scoredTraceIds.size

  const insights: Insight[] = []
  const recommendations: Recommendation[] = []
  const researchDirections: string[] = []

  // Reliability.
  if (errorRate >= HIGH_ERROR_RATE) {
    insights.push({
      severity: 'critical',
      category: 'reliability',
      title: 'High error rate',
      detail: `${(errorRate * 100).toFixed(1)}% of observations failed or warned.`,
      evidence: `${errorCount} of ${observationCount} observations`,
    })
    recommendations.push({
      category: 'reliability',
      title: 'Triage failures',
      action: 'Group errors by status message and model; add retries with backoff and a circuit breaker for the failing stage.',
      expectedImpact: 'Lower failure rate and fewer dropped tasks.',
      effort: 'medium',
    })
  }

  // Latency: flag slow models from the sample.
  const slowModels = models.filter(m => m.avgLatencyMs !== null && m.avgLatencyMs >= HIGH_LATENCY_MS)
  if (slowModels.length > 0) {
    insights.push({
      severity: 'warning',
      category: 'latency',
      title: 'Slow models',
      detail: 'One or more models average 10s or more per generation.',
      evidence: slowModels.map(m => `${m.model} ${((m.avgLatencyMs as number) / 1000).toFixed(1)}s`).join(', '),
    })
    recommendations.push({
      category: 'latency',
      title: 'Reduce latency',
      action: 'Add timeouts and streaming; consider a faster model or parallelism for the slowest steps.',
      expectedImpact: 'Faster responses and better end-user experience.',
      effort: 'medium',
    })
  }

  // Cost concentration.
  const topModel = models[0]
  if (topModel !== undefined && totalCost > 0 && topModel.totalCost / totalCost > COST_CONCENTRATION) {
    insights.push({
      severity: 'info',
      category: 'cost',
      title: 'Cost concentration',
      detail: 'One model drives most spend.',
      evidence: `${topModel.model} accounts for ${((topModel.totalCost / totalCost) * 100).toFixed(1)}% of cost`,
    })
    recommendations.push({
      category: 'cost',
      title: 'Right-size model routing',
      action: `Route low-complexity calls away from ${topModel.model}; add prompt caching for repeated prefixes and per-task token budgets.`,
      expectedImpact: 'Lower per-task cost without quality loss.',
      effort: 'medium',
    })
  }
  if (totalCost > 0) {
    recommendations.push({
      category: 'cost',
      title: 'Track spend per agent and workspace',
      action: 'Tag traces by agent and workspace; set per-workspace cost budgets and alert on overrun.',
      expectedImpact: 'Visibility into which workflows cost the most.',
      effort: 'low',
    })
  }

  // Data hygiene: model field carrying non-model values.
  const suspiciousModels = models.filter(m => m.suspicious)
  if (suspiciousModels.length > 0) {
    insights.push({
      severity: 'warning',
      category: 'usage',
      title: 'Model field carries non-model values',
      detail: 'Some "models" have no cost and no input/output token split, suggesting agent roles or un-attributed runs are logged under `model`.',
      evidence: suspiciousModels.map(m => m.model).join(', '),
    })
    recommendations.push({
      category: 'usage',
      title: 'Clean up model attribution',
      action: 'Move agent roles into trace/observation metadata or tags; keep `model` for real model ids so cost and latency roll up correctly.',
      expectedImpact: 'Accurate per-model cost and latency, and a model list that reflects reality.',
      effort: 'low',
    })
  }

  // Triggered operational flags.
  const triggeredFlags = scoreStats.filter(s => s.min === 0 && s.max === 1)
  if (triggeredFlags.length > 0) {
    insights.push({
      severity: 'warning',
      category: 'quality',
      title: 'Operational flags triggered',
      detail: 'Boolean guard scores fired on at least one trace.',
      evidence: triggeredFlags.map(s => s.name).join(', '),
    })
    recommendations.push({
      category: 'quality',
      title: 'Investigate triggered guards',
      action: 'Pull the traces where these flags fired and inspect the fallback, warning, or gate paths they recorded.',
      expectedImpact: 'Fewer silent fallbacks and warnings reaching users.',
      effort: 'medium',
    })
  }

  // Evaluation coverage.
  if (scoredTraceCount === 0) {
    insights.push({
      severity: 'warning',
      category: 'evaluation',
      title: 'No evaluation coverage',
      detail: 'No scores are attached to traces, so quality is not being measured.',
      evidence: `${traceCount} traces, 0 scored`,
    })
    recommendations.push({
      category: 'evaluation',
      title: 'Stand up an eval pipeline',
      action: 'Attach an LLM-as-judge or rule-based quality score to every trace; baseline quality before changing prompts.',
      expectedImpact: 'Make quality regressions visible and measurable.',
      effort: 'medium',
    })
  }

  researchDirections.push('Fine-tune evaluation: compare the highest-cost or slowest models against a cheaper base on the same tasks, curating a regression set from low-scored traces.')
  researchDirections.push('Prompt regression analysis: group traces by prompt signature and detect score drift across versions and model routes.')
  researchDirections.push('Caching opportunity: measure duplicate input prefixes across traces to size a semantic or prefix cache.')
  researchDirections.push('Model-routing audit: benchmark the current model mix per task type to consolidate providers and reduce routing complexity.')

  return {
    from,
    to,
    traceCount,
    observationCount,
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    errorCount,
    errorRate,
    distinctModels,
    distinctUsers,
    scoredTraceCount,
    models,
    scoreStats,
    insights,
    recommendations,
    researchDirections,
  }
}

/** Format an analysis report as readable markdown for a model or user. */
export function formatAnalysisReport(report: AnalysisReport): string {
  const lines: string[] = []
  lines.push(`Langfuse analysis: ${report.from} → ${report.to}`)
  lines.push('')
  lines.push(`Traces: ${report.traceCount} | Observations: ${report.observationCount} | Cost: $${report.totalCost.toFixed(4)}`)
  lines.push(`Tokens: ${report.totalInputTokens} in / ${report.totalOutputTokens} out | Models: ${report.distinctModels} | Users: ${report.distinctUsers}`)
  lines.push(`Errors: ${report.errorCount} (${(report.errorRate * 100).toFixed(1)}%) | Scored traces: ${report.scoredTraceCount}`)
  lines.push('')

  if (report.models.length > 0) {
    lines.push('## Model breakdown')
    for (const model of report.models) {
      const latency = model.avgLatencyMs === null ? 'n/a' : `${(model.avgLatencyMs / 1000).toFixed(1)}s`
      const mark = model.suspicious ? ' [non-model]' : ''
      lines.push(`- ${model.model}${mark}: ${model.traces} traces, $${model.totalCost.toFixed(4)}, ${model.totalInputTokens + model.totalOutputTokens} tokens, ${latency} avg, ${model.errorCount} errors`)
    }
    lines.push('')
  }

  if (report.scoreStats.length > 0) {
    lines.push('## Scores')
    for (const stat of report.scoreStats) {
      lines.push(`- ${stat.name}: ${stat.count} values, avg ${stat.avg.toFixed(2)}, min ${stat.min}, max ${stat.max}`)
    }
    lines.push('')
  }

  if (report.insights.length > 0) {
    lines.push('## Insights')
    for (const insight of report.insights) {
      lines.push(`- [${insight.severity}/${insight.category}] ${insight.title} — ${insight.detail} (${insight.evidence})`)
    }
    lines.push('')
  }

  if (report.recommendations.length > 0) {
    lines.push('## Recommendations')
    for (const rec of report.recommendations) {
      lines.push(`- [${rec.category}/${rec.effort}] ${rec.title}: ${rec.action} Impact: ${rec.expectedImpact}`)
    }
    lines.push('')
  }

  if (report.researchDirections.length > 0) {
    lines.push('## Research directions')
    for (const direction of report.researchDirections) {
      lines.push(`- ${direction}`)
    }
  }

  return lines.join('\n')
}
