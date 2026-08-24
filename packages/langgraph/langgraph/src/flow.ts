/**
 * Pure flow helpers: reconstruct an observed flow from Langfuse observations,
 * and render LangGraph implementation guidance from a declarative spec. No I/O.
 * @module @deepseek-ai/dsh-langgraph
 */

import type { LangfuseObservation } from '@deepseek-ai/dsh-langfuse'
import type { FlowNode, FlowSpec } from './types.ts'

/** Infer a node's role from its name and observation type. */
function kindOf(name: string, type: string): string {
  const n = name.toLowerCase()
  if (type === 'GENERATION') return 'llm'
  if (n.includes('search') || n.includes('retriev')) return 'search'
  if (n.includes('mcp')) return 'mcp'
  if (n.includes('tool') || n.includes('call')) return 'tool'
  if (n.includes('agent') || n.includes('subagent') || n.includes('delegate')) return 'subagent'
  return 'span'
}

/** Human-readable latency for one observation. */
function latencyLabel(obs: LangfuseObservation): string {
  if (obs.endTime === undefined) return ''
  const ms = Date.parse(obs.endTime) - Date.parse(obs.startTime)
  return Number.isFinite(ms) ? ` (${(ms / 1000).toFixed(1)}s)` : ''
}

/**
 * Reconstruct a best-effort flow description from Langfuse observations:
 * node order, inferred role, latency, and repeated (loop/retry) nodes.
 * @param observations - observations from one or more traces in a window.
 * @returns a readable flow summary.
 */
export function reconstructFlow(observations: LangfuseObservation[]): string {
  if (observations.length === 0) return 'No observations found in the window.'
  const sorted = [...observations].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
  const counts = new Map<string, number>()
  const lines: string[] = [`Observed ${sorted.length} nodes:`]
  for (const obs of sorted) {
    const name = obs.name
    counts.set(name, (counts.get(name) ?? 0) + 1)
    lines.push(`- ${name} [${kindOf(name, obs.type)}]${latencyLabel(obs)}`)
  }
  const repeats = [...counts.entries()].filter(([, c]) => c > 1).map(([n, c]) => `${n}×${c}`)
  if (repeats.length > 0) lines.push(`Repeated nodes (likely loops/retries): ${repeats.join(', ')}`)
  return lines.join('\n')
}

/** Render one node recursively as LangGraph pseudo-structure. */
function renderNode(node: FlowNode, depth: number): string[] {
  const pad = '  '.repeat(depth)
  switch (node.kind) {
    case 'step': {
      const s = node.step
      const detail = s.kind === 'llm' || s.kind === 'subagent'
        ? `prompt="${s.prompt ?? ''}"`
        : s.kind === 'search'
          ? `query="${s.query ?? ''}"`
          : `tool=${s.tool ?? ''} server=${s.server ?? ''}`
      return [`${pad}${s.name} (${s.kind}) — ${detail}`]
    }
    case 'sequential':
      return [`${pad}${node.name} (sequential):`, ...node.steps.flatMap(s => renderNode(s, depth + 1))]
    case 'parallel':
      return [`${pad}${node.name} (parallel):`, ...node.branches.flatMap(b => renderNode(b, depth + 1))]
    case 'loop':
      return [`${pad}${node.name} (loop ×${node.times}):`, ...renderNode(node.body, depth + 1)]
    case 'conditional': {
      const out = [`${pad}${node.name} (if ${node.when}):`, ...renderNode(node.then, depth + 1)]
      if (node.else !== undefined) out.push(`${pad}${node.name} (else):`, ...renderNode(node.else, depth + 1))
      return out
    }
  }
}

/**
 * Render LangGraph implementation guidance from a declarative flow spec:
 * node list, wiring (edges / conditional edges for loops), and state notes.
 * @param spec - the flow specification.
 * @returns implementation guidance for building the graph in LangGraph.
 */
export function renderLangGraphGuidance(spec: FlowSpec): string {
  const lines: string[] = [
    `Flow: ${spec.name}`,
    spec.description,
    '',
    'Nodes:',
    ...spec.nodes.flatMap(n => renderNode(n, 1)),
    '',
    'LangGraph wiring:',
    '- Each leaf step is a StateGraph node (or a node built from a LangChain runnable).',
    '- `sequential` nodes connect with edges in order.',
    '- `parallel` branches fan out from one node and join with a merge node (or a reducer that combines their state keys).',
    '- `loop` nodes use `add_conditional_edges` to route back to the entry node while a counter in state is below the bound.',
    '- `conditional` nodes use `add_conditional_edges` to route to the `then` or `else` branch based on a state predicate.',
    '- Keep state a TypedDict; each node writes only its own keys and returns a partial update.',
    '- Tools, MCP, and search nodes call their capability and store the result in state; keep outputs JSON-serializable.',
    '- Add a checkpoint for long or resumable flows.',
  ]
  return lines.join('\n')
}
