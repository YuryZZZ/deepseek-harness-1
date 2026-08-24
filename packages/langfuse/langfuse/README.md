# @deepseek-ai/dsh-langfuse

English | [中文](README.zh.md)

Langfuse observability client and LLM-operations analysis service. Mounts `ctx.langfuse`: a persistent, zero-dependency client over a self-hosted or cloud Langfuse server, plus a pure analysis engine that reduces raw telemetry (traces, observations, scores, metrics) into prioritized insights, recommendations, and research directions.

## Service

`ctx.langfuse` exposes:

| Member | Description |
|---|---|
| `client` | Stateless `LangfuseClient` over the Langfuse public REST API (`health`, `listTraces`, `getTrace`, `listObservations`, `listScores`, `metricsDaily`, `numericMetric`). |
| `getStatus()` | Cached reachability snapshot: `reachable`, `lastSyncAt`, `lastError`, `recentTraceCount`, `recentTotalCost`. |
| `refresh()` | Re-read health and recent daily metrics, then update the snapshot. Never throws; failures land in `lastError`. |
| `getLatestReport()` | Most recent analysis report, or `null` before the first run. |
| `health()` | Server health and version. |
| `analyze(windowDays?)` | Full analysis pass; caches and returns the report. |
| `defaultWindowDays` | Configured default analysis window in days. |

## Config

| Field | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | string | — (required) | Langfuse server base URL, no trailing slash. |
| `publicKey` | string | — (required) | Langfuse public key (client id). |
| `secretKey` | string | — (required) | Langfuse secret key. |
| `projectId` | string | — | Optional project id to scope reads. |
| `pollIntervalMs` | number | `0` | Background refresh interval in milliseconds; `0` disables the poller. |
| `defaultWindowDays` | number | `7` | Default analysis window in days. |

Credentials are configuration, never hardcoded. Feed them from the environment in `cordis.yml`:

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

The service issues no model requests and contributes no tokens to model context, so it has no effect on KV-cache reuse.

## Known Limitations and Deferred Work

- **Bounded sample** — `analyze()` samples the first page of traces/observations/scores (up to 100/200/100 items). Totals come from the authoritative daily metrics, but per-item detail is a sample rather than an exhaustive scan; a paginating walk of all pages is deferred.
- **Fixed timeout** — every request uses a fixed 30-second timeout; very large windows or slow self-hosted servers may want a configurable timeout.
- **Read-only** — the service reads telemetry; writing, backfilling, or posting evaluations to Langfuse is out of scope.
