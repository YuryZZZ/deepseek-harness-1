# Agent Note: Langfuse observability analysis seam

Status: implemented

English | [中文](2026-08-22-langfuse-observability-analysis-seam.zh.md)

## Problem

The LegalAI stack logs LLM activity to a self-hosted Langfuse server, but nothing reads that telemetry back to improve operations. Cost, latency, error, and evaluation signals sit in Langfuse without being surfaced to an agent or turned into actions, so a dsh agent had no way to inspect its organization's flows, workspaces, or fine-tuned models.

## Decision

Add a two-package Langfuse capability seam:

- `@deepseek-ai/dsh-langfuse` mounts `ctx.langfuse`: a zero-dependency HTTP client over the Langfuse public REST API plus a pure `analyzeTelemetry` engine that reduces traces, observations, scores, and metrics into an `AnalysisReport` (per-model breakdown, prioritized `Insight`s, `Recommendation`s, and research directions). The service keeps a live reachability snapshot, refreshed at boot and on a configurable interval.
- `@deepseek-ai/dsh-tool-langfuse` exposes six model-facing tools — `langfuse_status`, `langfuse_traces`, `langfuse_trace`, `langfuse_metrics`, `langfuse_scores`, and `langfuse_analyze` — that call the service.

Credentials are configuration fed from the environment (`!!js process.env.*`), never hardcoded. The analyzer is a pure function, so it is unit-testable and replay-safe.

## Alternatives considered

- **One package for service and tools** — rejected: the service and its model-facing consumer evolve independently and follow the existing `dsh-shell` / `dsh-tool-bash` split.
- **Stream live analysis into the session log** — rejected for the first cut: model-visible output requires a persistent `SessionEventMap` member and a log-format change; on-demand tool results need neither.
- **Reuse the `session-telemetry` seam** — rejected: that seam exports dsh's own session records, while Langfuse is an external observability backend being read.

## Consequences

- The plugin reads external telemetry on demand; it does not write or backfill Langfuse.
- `analyze()` samples the first page of each collection. Totals are authoritative from `/api/public/metrics/daily`, but per-item detail is a bounded sample.
- A live Langfuse server is required for real data; the client and analyzer degrade to typed `LangfuseError` when it is unreachable, and the live snapshot records the failure.
