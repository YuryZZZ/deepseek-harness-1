# Langfuse 可观测性

[English](langfuse.md) | 中文

`ctx.langfuse` 服务是一个面向自托管或云端 Langfuse 服务器的持久化客户端，外加一个纯函数分析引擎，将原始遥测数据——轨迹、观测、评分与指标——归约为按优先级排序的洞察、建议与研究方向。服务契约见 [`@deepseek-ai/dsh-langfuse`](../../packages/langfuse/langfuse/README.md)，面向模型的消费方见 [`@deepseek-ai/dsh-tool-langfuse`](../../packages/langfuse/tool-langfuse/README.md)。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxlangfuse--langfuseservice"></a>

### `ctx.langfuse` — `LangfuseService`

Persistent Langfuse service. Mounted for the lifetime of the composition, it keeps a live reachability snapshot (refreshed at boot and on an optional interval) and exposes an on-demand analysis pass over recent telemetry.

```ts cordis-catalog
/**
 * Return the cached reachability snapshot without making a request.
 * @returns the current snapshot.
 */
getStatus(): LiveStatus

/**
 * Return the most recent analysis report, or `null` if none has run.
 * @returns the latest report, if any.
 */
getLatestReport(): AnalysisReport | null

/**
 * Fetch the server health and version.
 * @returns the health response.
 */
async health(): Promise<LangfuseHealth>

/**
 * Refresh the live reachability snapshot from the server. Never throws;
 * failures are recorded in the snapshot's `lastError`.
 * @returns the updated snapshot.
 */
async refresh(): Promise<LiveStatus>

/**
 * Run a full analysis pass over the most recent telemetry.
 * @param windowDays - analysis window; defaults to {@link defaultWindowDays}.
 * @returns the analysis report, also cached via {@link getLatestReport}.
 */
async analyze(windowDays: number = this.defaultWindowDays): Promise<AnalysisReport>

/**
 * Write an evaluation score back to Langfuse.
 * @param input - the score to create.
 * @returns the created score.
 */
async score(input: LangfuseScoreInput): Promise<unknown>

/**
 * Ingest a batch of trace/observation/score events into Langfuse.
 * @param batch - the events to ingest.
 * @returns the ingestion result.
 */
async ingest(batch: LangfuseIngestionEvent[]): Promise<unknown>
```

Source: [`packages/langfuse/langfuse/src/index.ts:76`](../../packages/langfuse/langfuse/src/index.ts)
<!-- END GENERATED cordis-surface -->
