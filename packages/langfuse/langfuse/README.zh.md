# @deepseek-ai/dsh-langfuse

[English](README.md) | 中文

Langfuse 可观测性客户端与 LLM 运营分析服务。挂载 `ctx.langfuse`：一个零依赖的、针对自托管或云端 Langfuse 服务器的客户端，加上一个纯函数分析引擎，将原始遥测数据（轨迹、观测、评分、指标）归约为按优先级排序的洞察、建议与研究方向。

## 服务

`ctx.langfuse` 暴露：

| 成员 | 描述 |
|---|---|
| `client` | 基于 Langfuse 公共 REST API 的无状态 `LangfuseClient`（`health`、`listTraces`、`getTrace`、`listObservations`、`listScores`、`metricsDaily`、`numericMetric`）。 |
| `getStatus()` | 缓存的可达性快照：`reachable`、`lastSyncAt`、`lastError`、`recentTraceCount`、`recentTotalCost`。 |
| `refresh()` | 重新读取健康状态与近期每日指标，然后更新快照。永不抛出；失败会写入 `lastError`。 |
| `getLatestReport()` | 最近一次分析报告，若尚未运行则为 `null`。 |
| `health()` | 服务器健康状态与版本。 |
| `analyze(windowDays?)` | 完整分析流程；缓存并返回报告。 |
| `defaultWindowDays` | 配置的默认分析窗口（天）。 |

## 配置

| 字段 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `baseUrl` | string | —（必填） | Langfuse 服务器基础 URL，不带尾部斜杠。 |
| `publicKey` | string | —（必填） | Langfuse 公钥（客户端 ID）。 |
| `secretKey` | string | —（必填） | Langfuse 密钥。 |
| `projectId` | string | — | 可选的项目 ID，用于限定读取范围。 |
| `pollIntervalMs` | number | `0` | 后台刷新间隔（毫秒）；`0` 禁用轮询。 |
| `defaultWindowDays` | number | `7` | 默认分析窗口（天）。 |

凭据来自配置，绝不硬编码。在 `cordis.yml` 中从环境注入：

```yaml
- name: '@deepseek-ai/dsh-langfuse'
  config:
    baseUrl: 'https://langfuse-server-699552818896.us-central1.run.app'
    publicKey: !!js process.env.LANGFUSE_PUBLIC_KEY
    secretKey: !!js process.env.LANGFUSE_SECRET_KEY
    projectId: 'LegalAI-Adjudication'
    pollIntervalMs: 300000
```

## Model Experience

Indirectly, through `@deepseek-ai/dsh-tool-langfuse`.

#### KV Cache effect

该服务不发起模型请求，也不向模型上下文贡献任何 token，因此对 KV 缓存复用没有影响。

## Known Limitations and Deferred Work

- **有界采样** — `analyze()` 只采样轨迹/观测/评分的第一页（最多 100/200/100 项）。总量以权威的每日指标为准，但逐项明细是采样而非穷举扫描；对全部分页的遍历扫描已延后。
- **固定超时** — 每个请求使用固定的 30 秒超时；超大窗口或较慢的自托管服务器可能需要可配置的超时。
- **只读** — 该服务读取遥测数据；向 Langfuse 写入、回填或提交评测不在范围内。
