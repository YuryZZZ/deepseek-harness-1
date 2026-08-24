# Agent Note: Langfuse 可观测性分析能力缝

Status: implemented

[English](2026-08-22-langfuse-observability-analysis-seam.md) | 中文

## 问题

LegalAI 技术栈将 LLM 活动写入自托管的 Langfuse 服务器，但没有任何组件回读这些遥测数据来改进运营。成本、延迟、错误与评测信号停留在 Langfuse 中，既不会呈现给代理，也不会转化为行动，因此 dsh 代理无法查看其组织的工作流、工作区或微调模型。

## 决策

新增一个两包的 Langfuse 能力缝：

- `@deepseek-ai/dsh-langfuse` 挂载 `ctx.langfuse`：一个零依赖的 Langfuse 公共 REST API HTTP 客户端，加上一个纯函数 `analyzeTelemetry` 引擎，将轨迹、观测、评分与指标归约为 `AnalysisReport`（按模型细分、按优先级排序的 `Insight`、`Recommendation` 与研究方向）。该服务维护一个实时的可达性快照，在启动时及按配置的间隔刷新。
- `@deepseek-ai/dsh-tool-langfuse` 暴露六个面向模型的工具——`langfuse_status`、`langfuse_traces`、`langfuse_trace`、`langfuse_metrics`、`langfuse_scores` 与 `langfuse_analyze`——它们调用该服务。

凭据是从环境注入的配置（`!!js process.env.*`），绝不硬编码。分析器是纯函数，因此可单元测试且可安全重放。

## 备选方案

- **服务与工具合并为一个包**——否决：服务与其面向模型的消费方独立演进，并沿用现有的 `dsh-shell` / `dsh-tool-bash` 拆分。
- **将实时分析流式写入会话日志**——否决（首版）：面向模型的输出需要持久化的 `SessionEventMap` 成员以及日志格式变更；按需工具结果两者都不需要。
- **复用 `session-telemetry` 缝**——否决：该缝导出的是 dsh 自身的会话记录，而 Langfuse 是被读取的外部可观测性后端。

## 后果

- 该插件按需读取外部遥测数据；它不写入也不回填 Langfuse。
- `analyze()` 对每个集合只采样第一页。总量以 `/api/public/metrics/daily` 为准，但逐项明细是有界的样本。
- 真实数据需要一个在线的 Langfuse 服务器；当它不可达时，客户端与分析器退化为带类型的 `LangfuseError`，实时快照会记录该失败。
