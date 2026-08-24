/**
 * Knowledge base: LangChain/LangGraph/deep-agent engineering knowledge,
 * current as of August 2026. Served on demand by the `langgraph_knowledge`
 * tool and condensed into the core prompt section.
 * @module @deepseek-ai/dsh-langgraph
 */

/** One knowledge topic. */
export interface KnowledgeTopic {
  id: string
  title: string
  content: string
}

/** The full knowledge base, organized by topic. */
export const KNOWLEDGE_TOPICS: KnowledgeTopic[] = [
  {
    id: 'langchain',
    title: 'LangChain fundamentals',
    content: `LangChain builds composable pipelines from Runnables (the LCEL interface).
- Runnable: the unit of work — invoke(), stream(), batch(), and chainable with |.
- prompt | model | output_parser: the canonical chain; bind tools with model.bind_tools().
- Chains: RunnableSequence (ordered), RunnableParallel (concurrent), RunnableBranch (routing).
- Tools: a function + a schema; @tool decorator, BaseTool; args are schema-validated.
- Retrieval: retrievers (vector, keyword, hybrid) feed documents into prompts.
- Memory: conversation state kept explicitly in the chain (RunnableWithMessageHistory).
Best practice: compose small typed runnables; keep I/O at the edges; prefer LCEL over custom chains.`,
  },
  {
    id: 'langgraph',
    title: 'LangGraph core',
    content: `LangGraph models an agent as a stateful graph, not a linear chain.
- StateGraph: nodes are functions (state -> partial state update); state is a TypedDict (or Pydantic model).
- add_node(key, fn): register a node. set_entry_point / set_finish_point: define flow ends.
- add_edge(a, b): unconditional transition. add_conditional_edges(a, router): dynamic routing by state.
- Reducers: define how parallel writes merge (add, list append, overwrite); use Annotated[T, reducer].
- Checkpointers: persist state per thread for resume, time-travel, and human-in-the-loop.
- Human-in-the-loop: interrupt() to pause for approval, then resume with a command.
- Streaming: stream() / astream() emit node-level and token-level events.
Best practice: one node = one responsibility; pass only needed keys; bound loops with counters in state; checkpoint long runs.`,
  },
  {
    id: 'deep-agents',
    title: 'Deep agent orchestration',
    content: `Deep agents compose many specialized agents and tools into one workflow.
- Subagents: delegate a bounded subtask to a child agent; the parent owns the plan and synthesis.
- Orchestration: plan-execute (plan, parallel executors, synthesize), map-reduce (parallel map, reduce), debate (parallel perspectives, judge), critic-refine (generate -> critique -> revise loop), router (classify -> branch).
- Parallelism: run independent branches concurrently; join with reducers; bound total agents.
- Reflection: critique own output, then revise; loops improve quality but bound iterations.
- Tools + retrieval + MCP: each is a node that reads/writes state; keep outputs JSON-serializable.
- Supervision: a judge/verifier node gates the final answer; track lineage to the source prompt.
Best practice: match the pattern to the task shape; parallelize independent work; keep the parent loop simple.`,
  },
  {
    id: 'nodes',
    title: 'Node creation (llm / tool / mcp / search)',
    content: `Every flow node is one of five leaf kinds.
- llm: a model call — a prompt (system + task) in, a structured result out; use structured output (with_structured_output) for reliable parsing.
- tool: call a named tool with args; tools are schema-declared; handle errors as state, not exceptions.
- mcp: call a tool on an MCP server (server + tool + args); the MCP client discovers tools at runtime.
- search: web search (query -> ranked results); combine with fetch for grounded content.
- subagent: delegate a subtask to a child agent with its own tools and prompt.
Each node writes only its own state keys and returns a partial update; keep results JSON-serializable so checkpoints and replay work.`,
  },
  {
    id: 'system-instructions',
    title: 'Writing agent system instructions',
    content: `A strong agent system prompt is specific, role-bound, and bounded.
- Role and objective: one sentence on who the agent is and the goal it serves.
- Task scope: what is in scope and explicitly out of scope; name the output format.
- Tool usage: when to use each tool; prefer direct action over asking when the intent is clear.
- Constraints: hard rules first (safety, format, sources), then soft preferences.
- Grounding: cite sources; do not invent facts; state uncertainty.
- Format: specify the exact output structure (markdown, JSON schema, tables).
Best practice: keep instructions declarative and stable; vary the dynamic parts in the task prompt, not the system prompt.`,
  },
  {
    id: 'dynamic-prompts',
    title: 'Dynamic prompt construction',
    content: `Dynamic prompts assemble the model request from state at runtime.
- Template: a fixed skeleton with placeholders filled from state (f-string / prompt template).
- State-driven: inject only the context the current node needs; avoid stuffing the whole state.
- Few-shot: include 1-3 exemplars selected by similarity to the current input.
- Chain-of-thought: request step-by-step reasoning for complex steps; hide it from the final answer when unnecessary.
- Structured output: bind a schema so the model returns parseable JSON, not prose.
- Loop counters and lineage: include iteration index and source in prompts inside loops.
Best practice: system prompt = stable contract; task prompt = dynamic; keep the dynamic prompt minimal and grounded.`,
  },
  {
    id: 'mcp',
    title: 'MCP and mcp-cloud-hub integration',
    content: `MCP (Model Context Protocol) exposes external tools through servers.
- The harness bridges MCP servers with dsh-mcp-client, which registers their tools on ctx.tools as mcp__<serverName>__<toolName>.
- mcp-cloud-hub is the shared remote MCP hub; connect it with one dsh-mcp-client entry (serverName: cloud-hub, transport: streamable-http, url: the hub URL).
- In a flow, an mcp step references a server + tool; it resolves to the registered mcp__<server>__<tool> at runtime.
- Discover the available MCP tools by listing ctx.tools names prefixed mcp__ before designing a flow.
Best practice: use MCP for external, shared capabilities (search, memory, domain APIs) and ordinary tools for first-party work.`,
  },
  {
    id: 'dynamic-agents',
    title: 'Dynamic agent creation (never hardcoded)',
    content: `Subagents must be created from the task, flow, and workspace at runtime — never hardcoded.
- parallel-map: fan one body out over a state list (e.g. state.plan or state.items); the number of subagents equals the list length, so it adapts to the task.
- Planner pattern: an llm node writes a JSON list to state, then a parallel-map runs one subagent per item.
- Model selection: each step can carry a model id (e.g. a LiteLLM route); the runtime resolves it against the available models.
- Workspace context: read the workspace's available tools, MCP servers, and models, then assemble the flow from them.
Best practice: derive arity from data, not literals; pin models per step only when the task needs it.`,
  },
]

/** Resolve one topic by id, or undefined. */
export function knowledgeTopic(id: string): KnowledgeTopic | undefined {
  return KNOWLEDGE_TOPICS.find(topic => topic.id === id)
}

/** List all topic ids and titles. */
export function listKnowledgeTopics(): string {
  return KNOWLEDGE_TOPICS.map(topic => `- ${topic.id}: ${topic.title}`).join('\n')
}
