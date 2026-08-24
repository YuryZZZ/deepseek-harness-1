import { describe, expect, it } from 'vitest'
import { mapLedgerRecordToEvents, type MapState } from '../src/index.ts'
import type { SessionTelemetryRecord } from '@deepseek-ai/dsh-session-telemetry'

function ledger(overrides: Partial<SessionTelemetryRecord> = {}): SessionTelemetryRecord {
  return {
    channel: 'ledger',
    time: Date.UTC(2026, 7, 23, 12, 0, 0),
    severity: 'info',
    attributes: { 'session.id': 's1', 'event.type': 'user/message', 'event.seq': 1 },
    body: { text: 'hello' },
    ...overrides,
  }
}

describe('mapLedgerRecordToEvents', () => {
  it('creates a trace on first sight and an observation per record', () => {
    const state: MapState = { emittedTraces: new Set(), counter: 0 }
    const first = mapLedgerRecordToEvents(ledger(), 'dsh', ['t'], state)
    expect(first.some(e => e.type === 'trace-create')).toBe(true)
    const obs = first.find(e => e.type === 'observation-create')
    expect(obs?.body.name).toBe('user/message')
    expect(obs?.body.type).toBe('SPAN')
    expect(obs?.body.input).toEqual({ text: 'hello' })

    const second = mapLedgerRecordToEvents(
      ledger({
        attributes: { 'session.id': 's1', 'event.type': 'assistant/message', 'event.seq': 2 },
        body: { text: 'answer' },
      }),
      'dsh',
      ['t'],
      state,
    )
    expect(second.some(e => e.type === 'trace-create')).toBe(false)
    const generation = second.find(e => e.type === 'observation-create')
    expect(generation?.body.type).toBe('GENERATION')
    expect(generation?.body.output).toEqual({ text: 'answer' })
  })

  it('uses a distinct trace per session', () => {
    const state: MapState = { emittedTraces: new Set(), counter: 0 }
    const a = mapLedgerRecordToEvents(ledger(), 'dsh', [], state)
    const b = mapLedgerRecordToEvents(
      ledger({ attributes: { 'session.id': 's2', 'event.type': 'user/message', 'event.seq': 1 } }),
      'dsh',
      [],
      state,
    )
    expect(a.some(e => e.type === 'trace-create')).toBe(true)
    expect(b.some(e => e.type === 'trace-create')).toBe(true)
  })
})
