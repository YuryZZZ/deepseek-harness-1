import { describe, expect, it } from 'vitest'
import { interpolate, runFlow } from '../src/executor.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { FlowSpec } from '../src/types.ts'

function mockCtx() {
  const calls: string[] = []
  const ctx = {
    tools: {
      execute: async (input: { name: string }) => {
        calls.push(input.name)
        return { ok: true, tool: input.name }
      },
    },
    web: { search: async () => ({ sources: [] }) },
    subagents: { start: async (name: string) => ({ result: Promise.resolve({ ok: true, subagent: name }) }) },
  } as unknown as Context
  return { ctx, calls }
}

describe('runFlow', () => {
  it('runs sequential and parallel tool steps and merges state', async () => {
    const { ctx, calls } = mockCtx()
    const spec: FlowSpec = {
      name: 'test',
      description: '',
      nodes: [
        {
          kind: 'sequential',
          name: 'seq',
          steps: [
            { kind: 'step', step: { kind: 'tool', name: 'a', tool: 't1' } },
            {
              kind: 'parallel',
              name: 'par',
              branches: [
                { kind: 'step', step: { kind: 'tool', name: 'b', tool: 't2' } },
                { kind: 'step', step: { kind: 'tool', name: 'c', tool: 't3' } },
              ],
            },
          ],
        },
      ],
    }
    const result = await runFlow(ctx, {} as never, new AbortController().signal, spec)
    expect(calls).toEqual(expect.arrayContaining(['t1', 't2', 't3']))
    expect(result).toHaveProperty('a')
    expect(result).toHaveProperty('b')
    expect(result).toHaveProperty('c')
  })

  it('loops a body the requested number of times', async () => {
    const { ctx, calls } = mockCtx()
    const spec: FlowSpec = {
      name: 'loop',
      description: '',
      nodes: [
        { kind: 'loop', name: 'retry', times: 3, body: { kind: 'step', step: { kind: 'tool', name: 'r', tool: 'retry' } } },
      ],
    }
    const result = await runFlow(ctx, {} as never, new AbortController().signal, spec)
    expect(calls.filter(c => c === 'retry')).toHaveLength(3)
    expect(result).toHaveProperty('r')
  })

  it('interpolates {{state}} placeholders into prompts and args', () => {
    const state = { matter: { id: '29MVR' }, query: 'clause 4' }
    expect(interpolate('Analyze {{matter.id}} for {{query}}', state)).toBe('Analyze 29MVR for clause 4')
    expect(interpolate('missing {{nope}}', state)).toBe('missing ')
  })

  it('runs while and retry constructs', async () => {
    const { ctx, calls } = mockCtx()
    const spec: FlowSpec = {
      name: 'controls',
      description: '',
      nodes: [
        { kind: 'while', name: 'spin', while: 'go', body: { kind: 'step', step: { kind: 'tool', name: 'tick', tool: 'tick' } } },
        { kind: 'retry', name: 'resilient', attempts: 2, body: { kind: 'step', step: { kind: 'tool', name: 'ok', tool: 'ok' } } },
      ],
    }
    const result = await runFlow(ctx, {} as never, new AbortController().signal, spec)
    expect(calls).toContain('ok')
    expect(result).toHaveProperty('ok')
  })
})
