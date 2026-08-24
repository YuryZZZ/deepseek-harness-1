/**
 * Industry-leading flow patterns and a designer that composes a full flow spec
 * from a task and workspace. Pure: patterns build data, they execute nothing.
 * @module @deepseek-ai/dsh-langgraph
 */

import type { FlowNode, FlowSpec } from './types.ts'

function llm(name: string, prompt: string): FlowNode {
  return { kind: 'step', step: { kind: 'llm', name, prompt } }
}

function subagent(name: string, prompt: string): FlowNode {
  return { kind: 'step', step: { kind: 'subagent', name, prompt } }
}

function search(name: string, query: string): FlowNode {
  return { kind: 'step', step: { kind: 'search', name, query } }
}

function sequential(name: string, steps: FlowNode[]): FlowNode {
  return { kind: 'sequential', name, steps }
}

function parallel(name: string, branches: FlowNode[]): FlowNode {
  return { kind: 'parallel', name, branches }
}

function loop(name: string, times: number, body: FlowNode): FlowNode {
  return { kind: 'loop', name, times, body }
}

/** One reusable flow pattern. */
export interface FlowPattern {
  id: string
  name: string
  description: string
  whenToUse: string
  build: (task: string, workspace: string) => FlowSpec
}

/** The built-in library of industry-leading flow patterns. */
export const FLOW_PATTERNS: FlowPattern[] = [
  {
    id: 'plan-execute',
    name: 'Plan and execute',
    description: 'Plan first, fan out independent steps in parallel, then synthesize.',
    whenToUse: 'Open-ended, multi-part tasks where steps can be planned up front.',
    build: (task, workspace) => ({
      name: 'plan-execute',
      description: `Plan-and-execute flow for: ${task}. Workspace: ${workspace}`,
      nodes: [
        llm('planner', `Break this task into independent sub-tasks and output them as a JSON list under the state key "plan":\n${task}`),
        { kind: 'parallel-map', name: 'executors', over: 'plan', body: subagent('executor', `Execute the assigned sub-task for: ${task}. Return a concise result.`) },
        llm('synthesizer', `Synthesize the executor results into one final answer for:\n${task}`),
      ],
    }),
  },
  {
    id: 'map-reduce',
    name: 'Map reduce',
    description: 'Map each item to a subagent in parallel, then reduce into one result.',
    whenToUse: 'Batch processing: many independent items that share one analysis.',
    build: (task, workspace) => ({
      name: 'map-reduce',
      description: `Map-reduce flow for: ${task}. Workspace: ${workspace}`,
      nodes: [
        { kind: 'parallel-map', name: 'map', over: 'items', body: subagent('analyze-item', `Analyze the assigned item for: ${task}`) },
        llm('reduce', `Aggregate the per-item results into one final answer for:\n${task}`),
      ],
    }),
  },
  {
    id: 'rag',
    name: 'Retrieval-augmented generation',
    description: 'Retrieve from multiple sources in parallel, rank, then generate.',
    whenToUse: 'Knowledge or research tasks that need grounded, sourced answers.',
    build: (task, workspace) => ({
      name: 'rag',
      description: `RAG flow for: ${task}. Workspace: ${workspace}`,
      nodes: [
        parallel('retrieve', [
          search('web-search', task),
          llm('knowledge-retrieval', `Recall domain knowledge relevant to:\n${task}`),
          subagent('document-retrieval', `Retrieve relevant documents from the workspace for:\n${task}`),
        ]),
        llm('rank', `Rank the retrieved sources by relevance and trustworthiness for:\n${task}`),
        llm('generate', `Write a grounded, sourced answer using only the ranked sources for:\n${task}`),
      ],
    }),
  },
  {
    id: 'debate',
    name: 'Multi-perspective debate',
    description: 'Argue several perspectives in parallel, judge, then reach consensus.',
    whenToUse: 'High-stakes decisions where bias and blind spots are costly.',
    build: (task, workspace) => ({
      name: 'debate',
      description: `Debate flow for: ${task}. Workspace: ${workspace}`,
      nodes: [
        parallel('perspectives', [
          llm('pro', `Argue the strongest case for the proposed approach to:\n${task}`),
          llm('con', `Argue the strongest case against the proposed approach to:\n${task}`),
          llm('neutral', `Argue a neutral, risk-focused perspective on:\n${task}`),
        ]),
        llm('judge', `Weigh the perspectives and pick the best-supported position for:\n${task}`),
        llm('consensus', `Write the final consensus recommendation for:\n${task}`),
      ],
    }),
  },
  {
    id: 'critic-refine',
    name: 'Critic and refine',
    description: 'Generate, then loop critique → revise until quality holds.',
    whenToUse: 'Quality-critical output: legal, compliance, or precision writing.',
    build: (task, workspace) => ({
      name: 'critic-refine',
      description: `Critic-and-refine flow for: ${task}. Workspace: ${workspace}`,
      nodes: [
        llm('generate', `Produce a first draft for:\n${task}`),
        loop('refine', 2, sequential('refine-step', [
          llm('critique', `Critique the current draft for errors and gaps for:\n${task}`),
          llm('revise', `Revise the draft to address the critique for:\n${task}`),
        ])),
        llm('final', `Finalize the polished answer for:\n${task}`),
      ],
    }),
  },
  {
    id: 'router',
    name: 'Classify and route',
    description: 'Classify the input, then route to a specialized branch.',
    whenToUse: 'Heterogeneous inputs that need different handling per kind.',
    build: (task, workspace) => ({
      name: 'router',
      description: `Router flow for: ${task}. Workspace: ${workspace}`,
      nodes: [
        llm('classify', `Classify the input into one of the handling branches for:\n${task}`),
        parallel('branches', [
          subagent('branch-a', `Handle the input if classified as A for:\n${task}`),
          subagent('branch-b', `Handle the input if classified as B for:\n${task}`),
          subagent('branch-c', `Handle the input if classified as C for:\n${task}`),
        ]),
        llm('final', `Produce the final result from the routed branch for:\n${task}`),
      ],
    }),
  },
]

/** Auto-select a pattern from simple task keywords. */
function autoSelectPattern(task: string): string {
  const t = task.toLowerCase()
  if (/(debate|argument|decision|policy|risk|recommend)/.test(t)) return 'debate'
  if (/(research|search|source|knowledge|question|find|lookup|retriev)/.test(t)) return 'rag'
  if (/(batch|many|list|items|summarize|multiple documents)/.test(t)) return 'map-reduce'
  if (/(classify|route|triage|categorize)/.test(t)) return 'router'
  if (/(review|compliance|precision|critique|refine|polish|quality|proofread|draft|write)/.test(t)) return 'critic-refine'
  return 'plan-execute'
}

/**
 * Design a full flow spec for a task and workspace, from a pattern.
 * @param task - the task the flow must accomplish.
 * @param workspace - the workspace context (tools, MCP servers, domain).
 * @param patternId - the pattern to use; auto-selected when omitted.
 * @returns the composed flow specification.
 */
export function designFlow(task: string, workspace: string, patternId?: string): FlowSpec {
  const id = patternId ?? autoSelectPattern(task)
  const pattern = FLOW_PATTERNS.find(p => p.id === id) ?? FLOW_PATTERNS[0]
  if (pattern === undefined) throw new Error('no flow patterns available')
  return pattern.build(task, workspace)
}
