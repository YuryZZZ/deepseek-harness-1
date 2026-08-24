/**
 * LangGraph/LangChain flow-intelligence plugin. Registers a prompt section
 * encoding multi-node flow-design knowledge and two model-facing tools that
 * reconstruct an observed flow from Langfuse and render LangGraph guidance
 * from a declarative flow spec.
 * @module @deepseek-ai/dsh-langgraph
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { LangfuseService } from '@deepseek-ai/dsh-langfuse'
import { reconstructFlow, renderLangGraphGuidance } from './flow.ts'
import { designFlow, FLOW_PATTERNS } from './patterns.ts'
import { KNOWLEDGE_TOPICS, knowledgeTopic, listKnowledgeTopics } from './knowledge.ts'
import type { FlowSpec } from './types.ts'

export { reconstructFlow, renderLangGraphGuidance } from './flow.ts'
export { designFlow, FLOW_PATTERNS } from './patterns.ts'
export type { FlowPattern } from './patterns.ts'
export { KNOWLEDGE_TOPICS, knowledgeTopic, listKnowledgeTopics } from './knowledge.ts'
export type { KnowledgeTopic } from './knowledge.ts'
export type { FlowNode, FlowSpec, FlowStep } from './types.ts'

export const name = 'langgraph'
export const inject = ['systemPrompt', 'tools', 'langfuse']

/** Prompt section encoding LangGraph/LangChain flow-design knowledge. */
const FLOW_DESIGN_KNOWLEDGE = `LangGraph / LangChain multi-node flow design:
A flow is a graph of typed nodes over shared state (a TypedDict).

Leaf node kinds:
- llm — a model reasoning step (prompt in, result out).
- tool — call a tool by name with args.
- mcp — call an MCP tool (server + tool + args).
- search — web search (query in, results out).
- subagent — delegate a subtask to a child agent.

Control-flow combinators:
- sequential — run steps in order, feed each output to the next.
- parallel — run independent branches concurrently, then merge.
- loop — repeat a body N times (iteration, retry, map-over).

LangGraph mapping: each leaf is a StateGraph node; sequential uses edges in
order; parallel fans out from one node and joins via a reducer; loop uses
add_conditional_edges back to the entry node with a counter in state.

Guidelines: parallelize independent work; bound loop iterations; keep node
outputs JSON-serializable; each node writes only its own state keys; add a
checkpoint for long or resumable flows.`

export function apply(ctx: Context) {
  ctx.systemPrompt.section({ name: 'langgraph:flow-design', order: 100, text: FLOW_DESIGN_KNOWLEDGE })

  const langfuse: LangfuseService = ctx.langfuse

  ctx.tools.register(defineTool({
    name: 'langgraph_flow',
    description: 'Reconstruct an observed agent flow from Langfuse: node order, inferred role (llm/tool/mcp/search/subagent), latency, and repeated (loop/retry) nodes.',
    parameters: {
      hoursAgo: { type: 'number', description: 'Look back this many hours (default 24).' },
      name: { type: 'string', description: 'Optional observation-name filter.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const hoursAgo = args.hoursAgo ?? 24
      const from = new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
      const result = await langfuse.client.listObservations({
        fromTimestamp: from,
        limit: 100,
        ...(args.name !== undefined ? { name: args.name } : {}),
      })
      return reconstructFlow(result.data)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langgraph_spec',
    description: 'Render LangGraph implementation guidance from a declarative flow spec (JSON with name, description, and nodes).',
    parameters: {
      spec: { type: 'string', required: true, description: 'JSON FlowSpec: { "name", "description", "nodes": [...] }.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute(args) {
      const spec = JSON.parse(args.spec) as FlowSpec
      return Promise.resolve(renderLangGraphGuidance(spec))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langgraph_design',
    description: 'Design a full multi-node flow (parallel/sequential/loop over llm/tool/mcp/search/subagent nodes) for a task and workspace, from an industry pattern.',
    parameters: {
      task: { type: 'string', required: true, description: 'The task the flow must accomplish.' },
      workspace: { type: 'string', description: 'Workspace context: domain, tools, MCP servers.' },
      pattern: { type: 'string', description: 'Pattern id (plan-execute, map-reduce, rag, debate, critic-refine, router); auto-selected when omitted.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute(args) {
      const spec = designFlow(args.task, args.workspace ?? '', args.pattern)
      return Promise.resolve(`${renderLangGraphGuidance(spec)}\n\n## Spec (JSON)\n\`\`\`json\n${JSON.stringify(spec, null, 2)}\n\`\`\``)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langgraph_patterns',
    description: 'List the available industry-leading flow patterns and when to use each.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute() {
      return Promise.resolve(FLOW_PATTERNS.map(p => `- ${p.id} (${p.name}): ${p.whenToUse}`).join('\n'))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langgraph_topics',
    description: 'List the available LangChain/LangGraph/deep-agent knowledge topics.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute() {
      return Promise.resolve(listKnowledgeTopics())
    },
  }))

  ctx.tools.register(defineTool({
    name: 'langgraph_knowledge',
    description: 'Fetch full LangChain/LangGraph/deep-agent engineering knowledge on a topic (langchain, langgraph, deep-agents, nodes, system-instructions, dynamic-prompts, or "all").',
    parameters: {
      topic: { type: 'string', required: true, description: 'Topic id, or "all".' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute(args) {
      if (args.topic === 'all') {
        return Promise.resolve(KNOWLEDGE_TOPICS.map(t => `## ${t.title}\n${t.content}`).join('\n\n'))
      }
      const topic = knowledgeTopic(args.topic)
      if (topic === undefined) return Promise.resolve(`Unknown topic "${args.topic}". Available topics:\n${listKnowledgeTopics()}`)
      return Promise.resolve(`${topic.title}\n${topic.content}`)
    },
  }))
}
