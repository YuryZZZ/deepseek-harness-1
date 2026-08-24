import { describe, expect, it } from 'vitest'
import { designFlow, FLOW_PATTERNS } from '../src/patterns.ts'
import { reconstructFlow, renderLangGraphGuidance } from '../src/flow.ts'
import type { LangfuseObservation } from '@deepseek-ai/dsh-langfuse'

describe('designFlow', () => {
  it('auto-selects a pattern from task keywords', () => {
    const spec = designFlow('research the legal precedent for clause 4', 'legal workspace')
    expect(spec.name).toBe('rag')
    expect(spec.nodes.length).toBeGreaterThan(0)
  })

  it('uses an explicit pattern id', () => {
    const spec = designFlow('summarize ten documents', '', 'map-reduce')
    expect(spec.name).toBe('map-reduce')
  })

  it('renders guidance from a spec', () => {
    const spec = designFlow('write a compliance clause', '', 'critic-refine')
    expect(renderLangGraphGuidance(spec)).toContain('LangGraph wiring')
  })
})

describe('FLOW_PATTERNS', () => {
  it('ships the industry patterns', () => {
    expect(FLOW_PATTERNS.map(p => p.id)).toEqual(['plan-execute', 'map-reduce', 'rag', 'debate', 'critic-refine', 'router'])
  })
})

describe('reconstructFlow', () => {
  function obs(name: string, startMs: number, endMs: number, type: LangfuseObservation['type'] = 'SPAN'): LangfuseObservation {
    return {
      id: name,
      type,
      name,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
    }
  }

  it('lists nodes in order and flags repeated nodes', () => {
    const observations = [obs('search', 0, 100), obs('generate', 200, 300, 'GENERATION'), obs('critique', 400, 500)]
    const text = reconstructFlow(observations)
    expect(text).toContain('search [search]')
    expect(text).toContain('generate [llm]')
  })
})
