# @deepseek-ai/dsh-langfuse-ingest

English | [中文](README.zh.md)

Session-telemetry backend that records the DeepSeek Harness' own sessions into Langfuse. Composes the `session-telemetry` capture coordinator and maps each ledger record onto a Langfuse trace/observation event, pushed in batches through `ctx.langfuse.ingest()`.

## Behavior

- One Langfuse trace per session, id `tracePrefix-sessionId`, tagged with `Config.tags`.
- Each session event (`user/message`, `assistant/message`, `tool/call`, `tool/result`, …) becomes an observation under that trace; the event body is carried verbatim as `input` (user/tool) or `output` (assistant).
- Export fires on the coordinator's `session/flush` hint and on `shutdown`; a failed flush is best-effort and never fails teardown.

## Config

| Field | Type | Default | Description |
|---|---|---|---|
| `tracePrefix` | string | `dsh` | Trace-name prefix for the per-session traces. |
| `tags` | string[] | `[]` | Tags stamped on every session trace. |

Requires `@deepseek-ai/dsh-langfuse` (the `ctx.langfuse` service) in the same composition.

## Model Experience

Indirectly, through `@deepseek-ai/dsh-tool-langfuse`.

#### KV Cache effect

The backend issues no model requests and contributes no tokens to model context, so it has no effect on KV-cache reuse.

## Known Limitations and Deferred Work

- **Coarse trace granularity** — one trace per session rather than per turn; a turn-aware mapping is deferred.
- **Verbatim bodies** — event bodies are forwarded as-is rather than projected to a normalized prompt/result schema.
