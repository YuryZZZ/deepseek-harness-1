/**
 * Declarative flow-spec vocabulary for LangGraph/LangChain agent flows.
 * @module @deepseek-ai/dsh-langgraph
 */

/** A leaf flow step: one unit of work. */
export interface FlowStep {
  kind: 'llm' | 'tool' | 'search' | 'mcp' | 'subagent'
  /** Node name (maps to a LangGraph node key). */
  name: string
  /** For `llm`/`subagent`: the prompt. */
  prompt?: string
  /** For `tool`: the tool name. */
  tool?: string
  /** For `tool`/`mcp`: the arguments. */
  args?: Record<string, unknown>
  /** For `search`: the query. */
  query?: string
  /** For `mcp`: the MCP server name. */
  server?: string
}

/** A flow node: a leaf step or a control-flow combinator. */
export type FlowNode =
  | { kind: 'step'; step: FlowStep }
  | { kind: 'sequential'; name: string; steps: FlowNode[] }
  | { kind: 'parallel'; name: string; branches: FlowNode[] }
  | { kind: 'loop'; name: string; times: number; body: FlowNode }

/** A declarative multi-node flow specification. */
export interface FlowSpec {
  name: string
  description: string
  nodes: FlowNode[]
}
