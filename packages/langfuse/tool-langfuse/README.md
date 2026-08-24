# @deepseek-ai/dsh-tool-langfuse

English | [中文](README.zh.md)

Model-facing tools over `ctx.langfuse`. Requires `@deepseek-ai/dsh-langfuse` and `@deepseek-ai/dsh-tools`.

## Tools

| Tool | Description |
|---|---|
| `langfuse_status` | Reachability and recent trace/cost activity. |
| `langfuse_traces` | List recent traces, filterable by name and lookback window. |
| `langfuse_trace` | One trace with its observations (generations) and scores. |
| `langfuse_metrics` | Daily traces, observations, and cost over a window. |
| `langfuse_scores` | Recent evaluation scores, filterable by name. |
| `langfuse_analyze` | Full analysis: prioritized insights, recommendations, and research directions. |
| `langfuse_score` | Write an evaluation score or feedback back to a trace/observation. |
| `langfuse_record` | Record a custom trace (a prompt, result, or workflow step). |

## Installation

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: '@deepseek-ai/dsh-langfuse'
  config:
    baseUrl: 'https://langfuse-server-699552818896.us-central1.run.app'
    publicKey: !!js process.env.LANGFUSE_PUBLIC_KEY
    secretKey: !!js process.env.LANGFUSE_SECRET_KEY
    projectId: 'LegalAI-Adjudication'
    pollIntervalMs: 300000
    defaultWindowDays: 7
- name: '@deepseek-ai/dsh-tool-langfuse'
- name: '@deepseek-ai/dsh-langfuse/invariant'
- name: '@deepseek-ai/dsh-tool-langfuse/invariant'
```

## Model Experience

### Model-facing tools

#### What the model sees

The six `langfuse_*` tool definitions (name, description, and parameter schema), including the `langfuse_analyze` description that instructs the model to run a full analysis and return insights, recommendations, and research directions.

#### Token effect

Conditional: each tool contributes a fixed schema entry to prompt assembly only when the tool is enabled in the active preset.

#### KV Cache effect

Append-only: the tool schemas are a stable prefix added to prompt assembly, so enabling or disabling a tool adds or removes a fixed prefix without invalidating an otherwise-reusable prefix.

## Known Limitations and Deferred Work

- **Text output** — every tool returns a formatted string rather than a structured object; a programmatic (structured-schema) return shape for `langfuse_analyze` is deferred.
- **No write path** — tools only read Langfuse; posting scores or feedback is out of scope for this package.
