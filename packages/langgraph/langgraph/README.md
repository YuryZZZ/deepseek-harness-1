# @deepseek-ai/dsh-langgraph

LangGraph/LangChain flow-intelligence plugin. Registers a prompt section encoding multi-node flow-design knowledge and two model-facing tools that reconstruct an observed agent flow from Langfuse and render LangGraph guidance from a declarative flow spec.

## Tools

| Tool | Description |
|---|---|
| `langgraph_flow` | Reconstruct an observed flow from Langfuse: node order, inferred role (llm/tool/mcp/search/subagent), latency, and repeated (loop/retry) nodes. |
| `langgraph_spec` | Render LangGraph implementation guidance from a declarative flow spec (JSON `{ name, description, nodes }`). |
| `langgraph_design` | Design a full multi-node flow for a task + workspace, from an industry pattern. |
| `langgraph_patterns` | List the available industry-leading flow patterns. |
| `langgraph_topics` | List the available LangChain/LangGraph/deep-agent knowledge topics. |
| `langgraph_knowledge` | Fetch full engineering knowledge on a topic (langchain, langgraph, deep-agents, nodes, system-instructions, dynamic-prompts). |
| `langgraph_run` | Execute a flow spec end-to-end (parallel/sequential/parallel-map/loop/conditional over tools, MCP, search, and subagents). |

Requires `@deepseek-ai/dsh-langfuse` (the `ctx.langfuse` service) and `@deepseek-ai/dsh-tools` in the same composition.

## Flow spec

A flow is a tree of typed nodes over shared state. Leaf steps are `llm` / `tool` / `mcp` / `search` / `subagent`; combinators are `sequential`, `parallel`, and `loop`. See `src/types.ts` for the exact vocabulary.

## Model Experience

### Model-facing tools

#### What the model sees

The `langgraph_flow` and `langgraph_spec` tool definitions, plus the `langgraph:flow-design` prompt section describing the node vocabulary and LangGraph wiring rules.

#### Token effect

The prompt section contributes a fixed block to every step; the two tool schemas contribute only when enabled.

#### KV Cache effect

Append-only: the prompt section is a stable prefix; enabling or disabling it adds or removes a fixed prefix without invalidating an otherwise-reusable prefix.

## Known Limitations and Deferred Work

- **Best-effort reconstruction** — `langgraph_flow` infers roles from observation names and does not parse graph edges from Langfuse metadata; a metadata-aware reconstruction is deferred.
- **Spec rendering only** — `langgraph_spec` renders guidance, it does not execute a flow; execution belongs to the workflow/subagent seams.
