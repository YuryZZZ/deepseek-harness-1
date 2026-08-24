/**
 * Flow executor: recursively evaluates a declarative flow spec against the
 * live capability seams — tools, MCP, search, and subagents. State is a plain
 * record threaded through the evaluation; each node returns a partial update.
 * @module @deepseek-ai/dsh-langgraph
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-web'
import type {} from '@deepseek-ai/dsh-subagent'
import type { FlowNode, FlowSpec } from './types.ts'

/** Interpolate `{{a.b.c}}` placeholders from the flow state. */
export function interpolate(template: string, state: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, path: string) => {
    const value = path.trim().split('.').reduce<unknown>((acc, key) => {
      if (acc === null || acc === undefined || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[key]
    }, state)
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
  })
}

/** Resolve the boolean value a `while`/`when`/`switch.on` predicate names. */
function predicate(state: Record<string, unknown>, path: string): boolean {
  const value = path.trim().split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, state)
  return Boolean(value)
}

/** Interpolate string values in an arguments object. */
function interpolateArgs(args: Record<string, unknown>, state: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    out[key] = typeof value === 'string' ? interpolate(value, state) : value
  }
  return out
}

/** Evaluate one node into a partial state update. */
async function runNode(
  node: FlowNode,
  state: Record<string, unknown>,
  ctx: Context,
  agent: Agent,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  switch (node.kind) {
    case 'step': {
      const step = node.step
      if (step.kind === 'tool' || step.kind === 'mcp') {
        const toolName = step.kind === 'mcp'
          ? `mcp__${step.server ?? ''}__${step.tool ?? ''}`
          : (step.tool ?? '')
        const result = await ctx.tools.execute({
          callId: CallId(randomUUID()),
          name: interpolate(toolName, state),
          arguments: interpolateArgs(step.args ?? {}, state),
          signal,
        })
        return { [step.name]: result }
      }
      if (step.kind === 'search') {
        const result = await ctx.web.search({ query: interpolate(step.query ?? '', state) }, signal)
        return { [step.name]: result }
      }
      const prompt = interpolate(step.prompt ?? '', state)
      const message = createUserMessage({
        content: [{ type: 'text', text: prompt }],
        source: { kind: 'user' },
      })
      const run = await ctx.subagents.start(step.name, {
        prompt: message.content,
        parent: agent,
        signal,
      })
      return { [step.name]: await run.result }
    }
    case 'sequential': {
      let out = state
      for (const step of node.steps) {
        out = { ...out, ...(await runNode(step, out, ctx, agent, signal)) }
      }
      return out
    }
    case 'parallel': {
      const results = await Promise.all(node.branches.map(b => runNode(b, state, ctx, agent, signal)))
      return results.reduce<Record<string, unknown>>((acc, r) => ({ ...acc, ...r }), {})
    }
    case 'parallel-map': {
      const raw = state[node.over]
      const items: unknown[] = Array.isArray(raw) ? raw : []
      const results = await Promise.all(items.map(item => runNode(node.body, { ...state, item }, ctx, agent, signal)))
      return { [node.name]: results }
    }
    case 'loop': {
      let out = state
      for (let i = 0; i < node.times; i += 1) {
        out = { ...out, ...(await runNode(node.body, out, ctx, agent, signal)) }
      }
      return out
    }
    case 'while': {
      let out = state
      let guard = 0
      while (predicate(out, node.while) && guard < 100) {
        out = { ...out, ...(await runNode(node.body, out, ctx, agent, signal)) }
        guard += 1
      }
      return out
    }
    case 'retry': {
      let lastError: unknown
      for (let i = 0; i < node.attempts; i += 1) {
        try {
          return await runNode(node.body, state, ctx, agent, signal)
        } catch (error) {
          lastError = error
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }
    case 'switch': {
      const raw = state[node.on]
      const key = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : ''
      const branch = node.cases[key] ?? node.default
      if (branch === undefined) return {}
      return runNode(branch, state, ctx, agent, signal)
    }
    case 'conditional': {
      const branch = predicate(state, node.when) ? node.then : (node.else ?? node.then)
      return runNode(branch, state, ctx, agent, signal)
    }
  }
}

/**
 * Execute a flow spec end to end. Each top-level node runs in order against
 * the accumulated state; the final state is the flow's result.
 * @param ctx - the Cordis context carrying tools, web, and subagents.
 * @param agent - the invoking agent (owns spawned subagents).
 * @param signal - cancellation for the whole run.
 * @param spec - the flow to execute.
 * @returns the final state record.
 */
export async function runFlow(
  ctx: Context,
  agent: Agent,
  signal: AbortSignal,
  spec: FlowSpec,
): Promise<Record<string, unknown>> {
  let state: Record<string, unknown> = {}
  for (const node of spec.nodes) {
    state = { ...state, ...(await runNode(node, state, ctx, agent, signal)) }
  }
  return state
}
