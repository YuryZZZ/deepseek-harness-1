import { describe, expect, it } from 'vitest'
import { analyzeTelemetry, formatAnalysisReport } from '../src/analyzer.ts'
import type { LangfuseDailyMetric, LangfuseObservation, LangfuseScore } from '../src/types.ts'

function observation(overrides: Partial<LangfuseObservation> = {}): LangfuseObservation {
  return {
    id: 'obs-1',
    type: 'GENERATION',
    name: 'chat',
    startTime: '2026-08-20T00:00:00.000Z',
    endTime: '2026-08-20T00:00:02.000Z',
    model: 'deepseek-chat',
    ...overrides,
  }
}

describe('analyzeTelemetry', () => {
  it('flags a high error rate as critical', () => {
    const observations = Array.from({ length: 10 }, (_, i) =>
      observation({ id: `o-${i}`, level: i < 6 ? 'ERROR' : 'DEFAULT' }),
    )
    const report = analyzeTelemetry({ from: 'a', to: 'b', traces: [], observations, scores: [], metrics: [] })
    expect(report.errorRate).toBeGreaterThan(0.5)
    expect(report.insights.some(i => i.category === 'reliability' && i.severity === 'critical')).toBe(true)
  })

  it('flags missing evaluation coverage', () => {
    const report = analyzeTelemetry({
      from: 'a',
      to: 'b',
      traces: [{ id: 't1', timestamp: '2026-08-20T00:00:00.000Z', name: 'flow' }],
      observations: [observation()],
      scores: [],
      metrics: [],
    })
    expect(report.insights.some(i => i.category === 'evaluation')).toBe(true)
  })

  it('rolls up cost and tokens from daily metrics and flags non-model values', () => {
    const metrics: LangfuseDailyMetric[] = [
      {
        date: '2026-08-20',
        countTraces: 5,
        countObservations: 6,
        totalCost: 1.5,
        usage: [
          { model: 'deepseek-chat', inputUsage: 100, outputUsage: 50, totalUsage: 150, totalCost: 1.5, countTraces: 4, countObservations: 4 },
          { model: 'critic', inputUsage: 0, outputUsage: 0, totalUsage: 40, totalCost: 0, countTraces: 1, countObservations: 2 },
        ],
      },
    ]
    const report = analyzeTelemetry({ from: 'a', to: 'b', traces: [], observations: [], scores: [], metrics })
    expect(report.totalCost).toBe(1.5)
    expect(report.totalInputTokens).toBe(100)
    expect(report.insights.some(i => i.category === 'usage' && i.title.includes('non-model'))).toBe(true)
  })

  it('reports per-name score stats and flags triggered boolean guards', () => {
    const scores: LangfuseScore[] = [
      { id: 's1', traceId: 't1', name: 'fallback_used', value: 1, timestamp: '2026-08-20T00:00:00.000Z' },
      { id: 's2', traceId: 't2', name: 'fallback_used', value: 0, timestamp: '2026-08-20T00:00:00.000Z' },
    ]
    const report = analyzeTelemetry({ from: 'a', to: 'b', traces: [], observations: [], scores, metrics: [] })
    expect(report.scoreStats.some(s => s.name === 'fallback_used' && s.max === 1)).toBe(true)
    expect(report.insights.some(i => i.category === 'quality' && i.title.includes('flags'))).toBe(true)
  })

  it('formats a non-empty report', () => {
    const report = analyzeTelemetry({ from: 'a', to: 'b', traces: [], observations: [observation()], scores: [], metrics: [] })
    const text = formatAnalysisReport(report)
    expect(text).toContain('Recommendations')
    expect(text).toContain('Research directions')
  })
})
