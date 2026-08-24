# @deepseek-ai/dsh-tool-langfuse

[English](README.md) | 中文

基于 `ctx.langfuse` 的面向模型的工具。需要 `@deepseek-ai/dsh-langfuse` 与 `@deepseek-ai/dsh-tools`。

## 工具

| 工具 | 描述 |
|---|---|
| `langfuse_status` | 可达性及近期的轨迹/成本活动。 |
| `langfuse_traces` | 列出近期轨迹，可按名称与回看窗口过滤。 |
| `langfuse_trace` | 单个轨迹及其观测（生成）与评分。 |
| `langfuse_metrics` | 窗口内的每日轨迹、观测与成本。 |
| `langfuse_scores` | 近期评测评分，可按名称过滤。 |
| `langfuse_analyze` | 完整分析：按优先级排序的洞察、建议与研究方向。 |
| `langfuse_score` | 将评测分数或反馈写回轨迹/观测。 |
| `langfuse_record` | 记录一个自定义轨迹（提示、结果或工作流步骤）。 |

## 安装

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

### 面向模型的工具

#### 模型所见

六个 `langfuse_*` 工具定义（名称、描述与参数模式），包括 `langfuse_analyze` 的描述，它指示模型运行完整分析并返回洞察、建议与研究方向。

#### Token 影响

有条件的：仅当工具在当前预设中被启用时，每个工具才会向提示组装贡献一个固定的模式条目。

#### KV 缓存影响

仅追加：工具模式是加入提示组装的稳定前缀，因此启用或禁用某个工具只会添加或移除一个固定前缀，而不会使原本可复用的前缀失效。

## Known Limitations and Deferred Work

- **文本输出** — 每个工具都返回格式化字符串而非结构化对象；`langfuse_analyze` 的编程化（结构化模式）返回形态已延后。
- **无写入路径** — 工具仅读取 Langfuse；提交评分或反馈不在本包范围内。
