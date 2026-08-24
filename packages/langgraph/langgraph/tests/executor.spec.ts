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

  it('runs direct single-turn LLM generation when the llm service is available', async () => {
    const ctx = {
      tools: { execute: async () => ({ ok: true }) },
      web: { search: async () => ({ sources: [] }) },
      get: (name: string) => name === 'llm'
        ? {
          listProviders: () => [{ id: 'litellm', name: 'LiteLLM Gateway' }],
          listModels: async () => [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'litellm' }],
          stream: async function* () {
            yield { type: 'text-delta', index: 0, text: 'Summary of ' }
            yield { type: 'text-delta', index: 0, text: 'matter' }
          },
        }
        : undefined,
    } as unknown as Context

    const spec: FlowSpec = {
      name: 'llm-flow',
      description: '',
      nodes: [
        { kind: 'step', step: { kind: 'llm', name: 'summary', prompt: 'Summarize {{matter}}' } },
      ],
    }
    const result = await runFlow(ctx, {} as never, new AbortController().signal, spec)
    expect(result).toEqual({ summary: 'Summary of matter' })
  })

  it('falls back to a subagent for an llm step when the llm service is absent', async () => {
    let capturedLabel = ''
    const ctx = {
      tools: { execute: async () => ({ ok: true }) },
      web: { search: async () => ({ sources: [] }) },
      get: () => undefined,
      subagents: {
        list: () => ['spawn'],
        start: async (_provider: string, req: { label?: string }) => {
          capturedLabel = req.label ?? ''
          return { result: Promise.resolve({ brief: 'done' }) }
        },
      },
    } as unknown as Context

    const spec: FlowSpec = {
      name: 'llm-fallback',
      description: '',
      nodes: [
        { kind: 'step', step: { kind: 'llm', name: 'brief', prompt: 'Write a brief' } },
      ],
    }
    const result = await runFlow(ctx, {} as never, new AbortController().signal, spec)
    expect(capturedLabel).toBe('brief')
    expect(result).toEqual({ brief: { brief: 'done' } })
  })

  it('runs subagent step with resolved provider and label', async () => {
    let capturedProvider = ''
    let capturedLabel = ''
    const ctx = {
      tools: { execute: async () => ({ ok: true }) },
      web: { search: async () => ({ sources: [] }) },
      subagents: {
        list: () => ['spawn', 'fork'],
        start: async (provider: string, req: { label?: string }) => {
          capturedProvider = provider
          capturedLabel = req.label ?? ''
          return { result: Promise.resolve({ analysis: 'done' }) }
        },
      },
    } as unknown as Context

    const spec: FlowSpec = {
      name: 'subagent-flow',
      description: '',
      nodes: [
        { kind: 'step', step: { kind: 'subagent', name: 'investigate', prompt: 'Investigate facts' } },
      ],
    }
    const result = await runFlow(ctx, {} as never, new AbortController().signal, spec)
    expect(capturedProvider).toBe('spawn')
    expect(capturedLabel).toBe('investigate')
    expect(result).toEqual({ investigate: { analysis: 'done' } })
  })
})
