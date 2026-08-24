# @deepseek-ai/dsh-langfuse-ingest

[English](README.md) | 中文

会话遥测后端，将 DeepSeek Harness 自身的会话记录到 Langfuse。组合 `session-telemetry` 捕获协调器，并将每条账本记录映射为 Langfuse 轨迹/观测事件，通过 `ctx.langfuse.ingest()` 批量推送。

## 行为

- 每个会话一个 Langfuse 轨迹，ID 为 `tracePrefix-sessionId`，带 `Config.tags` 标签。
- 每个会话事件（`user/message`、`assistant/message`、`tool/call`、`tool/result` 等）成为该轨迹下的一个观测；事件体原样作为 `input`（用户/工具）或 `output`（助手）携带。
- 导出在协调器的 `session/flush` 提示及 `shutdown` 时触发；失败的 flush 尽力而为，绝不导致关闭失败。

## Config

| 字段 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `tracePrefix` | string | `dsh` | 会话轨迹的名称前缀。 |
| `tags` | string[] | `[]` | 盖在每个会话轨迹上的标签。 |

需要同一组合中的 `@deepseek-ai/dsh-langfuse`（`ctx.langfuse` 服务）。

## Model Experience

Indirectly, through `@deepseek-ai/dsh-tool-langfuse`.

#### KV Cache effect

该后端不发起模型请求，也不向模型上下文贡献任何 token，因此对 KV 缓存复用没有影响。

## Known Limitations and Deferred Work

- **粗粒度轨迹** — 每个会话一个轨迹，而非每个回合一个；回合感知的映射已延后。
- **原样事件体** — 事件体按原样转发，而非投影到规范化的提示/结果模式。
