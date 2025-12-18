'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSupabase } from '@/lib/supabase/browser-client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import {
  LessonInspectorData,
  PipelineNodeState,
  LessonContentPreview,
  JudgeVerdictDisplay,
  LessonLogEntry,
  Stage6NodeName,
  Stage6NodeStatus,
  JudgeVerdictType,
  IndividualJudgeVote,
  CLEVVotingResult,
  ConsensusMethod,
} from '@megacampus/shared-types';
import type { Database } from '@/types/database.generated';

type GenerationTraceRow = Database['public']['Tables']['generation_trace']['Row'];
type LessonContentRow = Database['public']['Tables']['lesson_contents']['Row'];

/**
 * Return type for useLessonInspectorData hook
 */
export interface UseLessonInspectorDataReturn {
  /** Complete lesson inspector data */
  data: LessonInspectorData | null;
  /** Whether data is being fetched */
  isLoading: boolean;
  /** Fetch error if any */
  error: Error | null;
  /** Manually refetch data */
  refetch: () => void;
}

/**
 * Patterns for extracting node names from step_name
 * Backend sends: planner_start, planner_complete, planner_error, etc.
 */
const NODE_PATTERNS: { pattern: RegExp; node: Stage6NodeName }[] = [
  { pattern: /^planner/i, node: 'planner' },
  { pattern: /^expander/i, node: 'expander' },
  { pattern: /^assembler/i, node: 'assembler' },
  { pattern: /^smoother/i, node: 'smoother' },
  { pattern: /^judge/i, node: 'judge' },
];

/**
 * Map phase field to Stage6NodeName
 * Backend records: phase: 'planner', 'expander', 'assembler', 'smoother', 'judge', 'init', 'complete'
 */
const PHASE_TO_NODE_MAP: Record<string, Stage6NodeName> = {
  'planner': 'planner',
  'expander': 'expander',
  'assembler': 'assembler',
  'smoother': 'smoother',
  'judge': 'judge',
};

/**
 * Get node name from phase field (preferred method)
 */
function getNodeFromPhase(phase: string | null): Stage6NodeName | null {
  if (!phase) return null;
  return PHASE_TO_NODE_MAP[phase.toLowerCase()] || null;
}

/**
 * Normalize step name to Stage6NodeName
 * Handles suffixes like _start, _complete, _error
 */
function normalizeStepName(stepName: string): Stage6NodeName | null {
  // Try pattern matching for step names with suffixes
  for (const { pattern, node } of NODE_PATTERNS) {
    if (pattern.test(stepName)) {
      return node;
    }
  }

  return null;
}

/**
 * Determine node status from step_name suffix
 */
function getStatusFromStepName(stepName: string, trace: GenerationTraceRow): Stage6NodeStatus {
  const lower = stepName.toLowerCase();

  // Priority: explicit suffixes
  if (lower.endsWith('_error') || trace.error_data) {
    return 'error';
  }
  if (lower.endsWith('_complete') || trace.output_data) {
    return 'completed';
  }
  if (lower.endsWith('_start')) {
    return 'active';
  }

  // Fallback based on data presence
  if (trace.error_data) return 'error';
  if (trace.output_data) return 'completed';
  return 'active';
}

/**
 * Build pipeline node states from generation traces
 */
function buildPipelineState(traces: GenerationTraceRow[]): {
  pipelineNodes: PipelineNodeState[];
  currentNode: Stage6NodeName | null;
  totalTokensUsed: number;
  totalCostUsd: number;
  totalDurationMs: number;
  retryCount: number;
} {
  const nodeMap = new Map<Stage6NodeName, PipelineNodeState>();
  let currentNode: Stage6NodeName | null = null;
  let totalTokensUsed = 0;
  let totalCostUsd = 0;
  let totalDurationMs = 0;
  let retryCount = 0;

  // Sort traces by creation time (oldest first)
  const sortedTraces = [...traces].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const trace of sortedTraces) {
    // Prefer phase field over step_name for node identification
    const nodeName = getNodeFromPhase(trace.phase) || normalizeStepName(trace.step_name);
    if (!nodeName) continue;

    // Aggregate metrics
    if (trace.tokens_used) totalTokensUsed += trace.tokens_used;
    if (trace.cost_usd) totalCostUsd += trace.cost_usd;
    if (trace.duration_ms) totalDurationMs += trace.duration_ms;
    if (trace.retry_attempt && trace.retry_attempt > 0) retryCount++;

    // Determine node status from step_name suffix
    const status = getStatusFromStepName(trace.step_name, trace);

    // Update or create node state
    const existingNode = nodeMap.get(nodeName);
    if (existingNode) {
      // Update existing node (keep completed status if already completed, unless error)
      let finalStatus: Stage6NodeStatus;
      if (status === 'error') {
        finalStatus = 'error';
      } else if (existingNode.status === 'completed') {
        finalStatus = 'completed';
      } else {
        finalStatus = status;
      }

      nodeMap.set(nodeName, {
        ...existingNode,
        status: finalStatus,
        completedAt: status === 'completed' ? new Date(trace.created_at) : existingNode.completedAt,
        tokensUsed: (existingNode.tokensUsed || 0) + (trace.tokens_used || 0),
        costUsd: (existingNode.costUsd || 0) + (trace.cost_usd || 0),
        durationMs: (existingNode.durationMs || 0) + (trace.duration_ms || 0),
        errorMessage: trace.error_data ? String(trace.error_data) : existingNode.errorMessage,
        retryAttempt: Math.max(existingNode.retryAttempt || 0, trace.retry_attempt || 0),
        output: trace.output_data || existingNode.output,
      });
    } else {
      // Create new node state
      nodeMap.set(nodeName, {
        node: nodeName,
        status,
        progress: nodeName === 'expander' ? calculateExpanderProgress(trace) : undefined,
        startedAt: new Date(trace.created_at),
        completedAt: status === 'completed' ? new Date(trace.created_at) : undefined,
        tokensUsed: trace.tokens_used || 0,
        costUsd: trace.cost_usd || 0,
        durationMs: trace.duration_ms || 0,
        errorMessage: trace.error_data ? String(trace.error_data) : undefined,
        retryAttempt: trace.retry_attempt || 0,
        output: trace.output_data || undefined,
      });
    }

    // Track current active node (latest non-completed)
    if (status === 'active' || status === 'error') {
      currentNode = nodeName;
    }
  }

  // Check if there's a "finish" trace indicating pipeline completion
  const hasFinishTrace = traces.some(t => t.step_name === 'finish' && t.phase === 'complete');
  const finishTrace = traces.find(t => t.step_name === 'finish' && t.phase === 'complete');

  // If pipeline finished successfully, mark all "active" nodes as "completed"
  // This handles cases where individual *_complete traces might be missing
  if (hasFinishTrace && !traces.some(t => t.error_data != null)) {
    for (const [nodeName, nodeState] of nodeMap.entries()) {
      if (nodeState.status === 'active') {
        nodeMap.set(nodeName, {
          ...nodeState,
          status: 'completed',
          completedAt: finishTrace ? new Date(finishTrace.created_at) : nodeState.completedAt,
        });
      }
    }
    // Clear current node since pipeline is complete
    currentNode = null;
  }

  // Enrich judge node with data from finish trace if judge_complete is missing
  const judgeNode = nodeMap.get('judge');
  if (judgeNode && finishTrace?.output_data && typeof finishTrace.output_data === 'object') {
    const finishOutput = finishTrace.output_data as Record<string, unknown>;
    // If judge has no output or incomplete output, populate from finish trace
    if (!judgeNode.output || Object.keys(judgeNode.output as object).length === 0) {
      const qualityScore = finishOutput.qualityScore as number | undefined;
      nodeMap.set('judge', {
        ...judgeNode,
        output: {
          qualityScore: qualityScore !== undefined ? qualityScore : undefined,
          finalRecommendation: qualityScore !== undefined && qualityScore > 0 ? 'accept' : 'accept',
          modelUsed: finishOutput.modelUsed as string | undefined,
        },
      });
    }
  }

  // Convert map to array in pipeline order
  const pipelineOrder: Stage6NodeName[] = ['planner', 'expander', 'assembler', 'smoother', 'judge'];
  const pipelineNodes = pipelineOrder
    .map((node) => nodeMap.get(node))
    .filter((node): node is PipelineNodeState => node !== undefined);

  return {
    pipelineNodes,
    currentNode,
    totalTokensUsed,
    totalCostUsd,
    totalDurationMs,
    retryCount,
  };
}

/**
 * Calculate expander progress from trace output
 */
function calculateExpanderProgress(trace: GenerationTraceRow): number | undefined {
  if (!trace.output_data || typeof trace.output_data !== 'object') {
    return undefined;
  }

  const output = trace.output_data as Record<string, unknown>;
  const completedSections = output.completedSections as number | undefined;
  const totalSections = output.totalSections as number | undefined;

  if (completedSections !== undefined && totalSections && totalSections > 0) {
    return Math.round((completedSections / totalSections) * 100);
  }

  // Fallback: check for successRate field
  const successRate = output.successRate as number | undefined;
  if (successRate !== undefined) {
    return successRate; // Already a percentage
  }

  // Second fallback: check for expandedCount / totalCount
  const expandedCount = output.expandedCount as number | undefined;
  const totalCount = output.totalCount as number | undefined;
  if (expandedCount !== undefined && totalCount && totalCount > 0) {
    return Math.round((expandedCount / totalCount) * 100);
  }

  return undefined;
}

/**
 * Parse lesson content body into preview format
 */
function parseLessonContent(contentRow: LessonContentRow): LessonContentPreview | null {
  if (!contentRow.content || typeof contentRow.content !== 'object') return null;

  let contentObj = contentRow.content as Record<string, unknown>;

  // Handle nested structure: {status, content: {...}, metadata: {...}}
  if (contentObj.content && typeof contentObj.content === 'object') {
    contentObj = contentObj.content as Record<string, unknown>;
  }

  const intro = contentObj.intro as string | undefined;
  const sections = contentObj.sections as Array<Record<string, unknown>> | undefined;
  const summary = contentObj.summary as string | undefined;
  const exercises = contentObj.exercises as Array<unknown> | undefined;

  return {
    introduction: intro || '',
    sections:
      sections?.map((section) => ({
        title: (section.title as string) || '',
        content: truncateContent((section.content as string) || '', 500),
        keyPoints: extractKeyPoints((section.content as string) || ''),
      })) || [],
    summary: summary || '',
    exerciseCount: exercises?.length || 0,
  };
}

/**
 * Truncate content to max length
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

/**
 * Extract key points from markdown content (simple heuristic)
 */
function extractKeyPoints(content: string): string[] {
  // Extract bullet points or numbered lists
  const lines = content.split('\n');
  const keyPoints: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match bullet points (-, *, +) or numbered lists (1., 2., etc.)
    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const point = trimmed.replace(/^[-*+\d.]\s+/, '').trim();
      if (point.length > 0 && point.length < 200) {
        keyPoints.push(point);
      }
    }
    if (keyPoints.length >= 5) break; // Limit to 5 key points
  }

  return keyPoints;
}

/**
 * Build full markdown text from structured lesson content
 *
 * Converts the structured content object (intro, sections, summary, exercises)
 * into a single markdown document for display in the Preview tab.
 */
function buildMarkdownFromContent(content: Record<string, unknown>): string {
  const sections = content.sections as Array<Record<string, unknown>> | undefined;
  const exercises = content.exercises as Array<Record<string, unknown>> | undefined;

  // Pre-allocate array capacity: intro + sections*2 + summary + exercises*3
  const estimatedSize = 1 + (sections?.length || 0) * 2 + 1 + (exercises?.length || 0) * 3;
  const parts: string[] = [];
  parts.length = estimatedSize; // Pre-allocate
  let idx = 0;

  // Introduction
  if (content.intro && typeof content.intro === 'string') {
    parts[idx++] = content.intro;
  }

  // Sections
  if (sections && Array.isArray(sections)) {
    for (const section of sections) {
      if (section.title && typeof section.title === 'string') {
        parts[idx++] = `\n## ${section.title}\n`;
      }
      if (section.content && typeof section.content === 'string') {
        parts[idx++] = section.content;
      }
    }
  }

  // Summary
  if (content.summary && typeof content.summary === 'string') {
    parts[idx++] = `\n## Заключение\n${content.summary}`;
  }

  // Exercises
  if (exercises && Array.isArray(exercises)) {
    parts[idx++] = '\n## Упражнения\n';
    for (const exercise of exercises) {
      if (exercise.title && typeof exercise.title === 'string') {
        parts[idx++] = `### ${exercise.title}`;
      }
      if (exercise.description && typeof exercise.description === 'string') {
        parts[idx++] = exercise.description;
      }
    }
  }

  // Trim to actual size and join
  parts.length = idx;
  return parts.join('\n\n');
}

/**
 * Parse judge result from lesson content metadata
 *
 * Handles both legacy format and enriched judge trace data from cascade evaluation.
 * New format includes:
 * - cascadeStage: which evaluation stage was reached (heuristic/single_judge/clev_voting)
 * - heuristics: detailed heuristic filter results with failure reasons
 * - singleJudge: single judge verdict if cascade reached that stage
 * - votes: CLEV voting results if cascade reached voting stage
 */
function parseJudgeResult(
  contentRow: LessonContentRow,
  traces: GenerationTraceRow[]
): JudgeVerdictDisplay | null {
  // Try to extract judge result from metadata
  const metadata = contentRow.metadata as Record<string, unknown> | null;
  const qualityScore = (metadata?.quality_score as number | undefined);

  // Find judge traces (prefer phase field, fallback to step_name pattern)
  const judgeTraces = traces.filter(
    (t) => (getNodeFromPhase(t.phase) === 'judge' || normalizeStepName(t.step_name) === 'judge') && t.output_data
  );

  if (judgeTraces.length === 0) {
    // Add debug logging
    console.debug('[parseJudgeResult] No judge traces found', {
      totalTraces: traces.length,
      phases: traces.map(t => t.phase).filter(Boolean),
      stepNames: traces.map(t => t.step_name).filter(Boolean),
    });
    return null;
  }

  // Use latest judge trace
  const latestJudge = judgeTraces[judgeTraces.length - 1];
  const judgeOutput = latestJudge.output_data as Record<string, unknown> | null;

  if (!judgeOutput) return null;

  // Extract enriched cascade data (new format)
  const cascadeStage = judgeOutput.cascadeStage as string | undefined;
  const heuristicsData = judgeOutput.heuristics as Record<string, unknown> | undefined;

  // Add logging for successful parse
  console.debug('[parseJudgeResult] Parsed judge result', {
    cascadeStage: cascadeStage,
    hasHeuristics: Boolean(heuristicsData),
    hasVotes: Boolean(judgeOutput.votes),
  });

  // Parse CLEV voting result (handles both old and new formats)
  const votingResult = parseVotingResult(judgeOutput, qualityScore || 0, cascadeStage);

  // Parse heuristics with fallback to old format
  const heuristicsPassed = heuristicsData?.passed as boolean ??
    (judgeOutput.heuristics_passed as boolean) ?? true;

  const heuristicsIssues = (heuristicsData?.failureReasons as string[]) ??
    (judgeOutput.heuristics_issues as string[]) ?? [];

  // Parse highlighted sections (from verdict issues)
  const highlightedSections =
    (judgeOutput.highlighted_sections as Array<Record<string, unknown>>) ?? [];

  return {
    votingResult,
    heuristicsPassed,
    heuristicsIssues: heuristicsIssues.length > 0 ? heuristicsIssues : undefined,
    highlightedSections: highlightedSections.map((section) => ({
      sectionIndex: (section.section_index as number) || 0,
      sectionTitle: (section.section_title as string) || '',
      issue: (section.issue as string) || '',
      severity: (section.severity as 'low' | 'medium' | 'high') || 'medium',
    })),
  };
}

/**
 * Parse CLEV voting result from judge output
 *
 * Handles multiple formats:
 * 1. Legacy format: votes array with explicit fields
 * 2. Enriched format with cascadeStage:
 *    - heuristic: create synthetic vote showing heuristic failure
 *    - single_judge: extract single judge verdict from singleJudge object
 *    - clev_voting: extract multiple votes from votes array
 */
function parseVotingResult(
  judgeOutput: Record<string, unknown>,
  qualityScore: number,
  cascadeStage?: string
): CLEVVotingResult {
  const votes = (judgeOutput.votes as Array<Record<string, unknown>>) ?? [];
  let parsedVotes: IndividualJudgeVote[] = [];
  let consensusMethod: ConsensusMethod = 'unanimous';
  let finalVerdict: JudgeVerdictType = determineVerdict(qualityScore);

  // Add logging for cascade stage handling
  console.debug('[parseVotingResult] Processing cascade stage', {
    cascadeStage,
    hasVotes: Boolean(judgeOutput.votes),
    hasSingleJudge: Boolean(judgeOutput.singleJudge),
    hasHeuristics: Boolean(judgeOutput.heuristics),
  });

  // Handle enriched format based on cascade stage
  if (cascadeStage) {
    if (cascadeStage === 'heuristic') {
      console.debug('[parseVotingResult] Heuristic stage - creating synthetic vote');
      // Heuristic stage: create synthetic vote indicating heuristic failure
      const heuristicIssues = (judgeOutput.heuristics_issues as string[]) ?? [];

      parsedVotes = [{
        judgeId: 'heuristic-filter',
        modelId: 'heuristic',
        modelDisplayName: 'Heuristic Filter',
        verdict: 'REGENERATE',
        score: 0,
        criteria: {
          coherence: 0,
          accuracy: 0,
          completeness: 0,
          readability: 0,
        },
        reasoning: heuristicIssues.length > 0
          ? `Failed heuristic checks: ${heuristicIssues.join(', ')}`
          : 'Content failed heuristic validation',
        evaluatedAt: new Date(),
      }];

      consensusMethod = 'unanimous';
      finalVerdict = 'REGENERATE';
    } else if (cascadeStage === 'single_judge' && judgeOutput.singleJudge) {
      console.debug('[parseVotingResult] Single judge stage');
      // Single judge stage: extract verdict from singleJudge object
      const sj = judgeOutput.singleJudge as Record<string, unknown>;
      const criteriaScores = sj.criteriaScores as Record<string, number> | undefined;

      parsedVotes = [{
        judgeId: 'single-judge',
        modelId: (sj.model as string) || 'unknown',
        modelDisplayName: (sj.model as string) || 'Single Judge',
        verdict: (sj.recommendation as JudgeVerdictType) || determineVerdict(qualityScore),
        score: (sj.score as number) || qualityScore,
        criteria: {
          coherence: criteriaScores?.learning_objective_alignment ?? qualityScore,
          accuracy: criteriaScores?.factual_accuracy ?? qualityScore,
          completeness: criteriaScores?.completeness ?? qualityScore,
          readability: criteriaScores?.clarity_readability ?? qualityScore,
        },
        reasoning: ((sj.strengths as string[]) || []).join('; ') || undefined,
        evaluatedAt: new Date(),
      }];

      consensusMethod = 'unanimous';
      finalVerdict = (sj.recommendation as JudgeVerdictType) || determineVerdict(qualityScore);
    } else if (cascadeStage === 'clev_voting' && votes.length > 0) {
      console.debug('[parseVotingResult] CLEV voting stage');
      // CLEV voting stage: parse multiple votes
      parsedVotes = votes.map((vote, idx) => ({
        judgeId: (vote.judge_id as string) || `judge-${idx + 1}`,
        modelId: (vote.model_id as string) || 'unknown',
        modelDisplayName: (vote.model_display_name as string) || 'Unknown Model',
        verdict: (vote.verdict as JudgeVerdictType) || determineVerdict(qualityScore),
        score: (vote.score as number) || qualityScore,
        criteria: {
          coherence: (vote.coherence as number) || qualityScore,
          accuracy: (vote.accuracy as number) || qualityScore,
          completeness: (vote.completeness as number) || qualityScore,
          readability: (vote.readability as number) || qualityScore,
        },
        reasoning: vote.reasoning as string | undefined,
        evaluatedAt: new Date(vote.evaluated_at as string || new Date().toISOString()),
      }));

      consensusMethod = (judgeOutput.consensus_method as ConsensusMethod) ?? 'majority';
      finalVerdict = (judgeOutput.final_verdict as JudgeVerdictType) ?? determineVerdict(qualityScore);
    }
  }

  // Fallback to legacy format if no cascade stage or no votes parsed yet
  if (parsedVotes.length === 0 && votes.length > 0) {
    console.debug('[parseVotingResult] Using legacy format fallback');
    parsedVotes = votes.map((vote, idx) => ({
      judgeId: (vote.judge_id as string) || `judge-${idx + 1}`,
      modelId: (vote.model_id as string) || 'unknown',
      modelDisplayName: (vote.model_display_name as string) || 'Unknown Model',
      verdict: (vote.verdict as JudgeVerdictType) || determineVerdict(qualityScore),
      score: (vote.score as number) || qualityScore,
      criteria: {
        coherence: (vote.coherence as number) || qualityScore,
        accuracy: (vote.accuracy as number) || qualityScore,
        completeness: (vote.completeness as number) || qualityScore,
        readability: (vote.readability as number) || qualityScore,
      },
      reasoning: vote.reasoning as string | undefined,
      evaluatedAt: new Date(vote.evaluated_at as string || new Date().toISOString()),
    }));

    consensusMethod = (judgeOutput.consensus_method as ConsensusMethod) ?? 'unanimous';
    finalVerdict = (judgeOutput.final_verdict as JudgeVerdictType) ?? determineVerdict(qualityScore);
  }

  return {
    votes: parsedVotes,
    consensusMethod,
    finalVerdict,
    finalScore: qualityScore,
    tieBreakerId: judgeOutput.tie_breaker_id as string | undefined,
    isThirdJudgeInvoked: (judgeOutput.is_third_judge_invoked as boolean) ?? false,
  };
}

/**
 * Determine verdict from quality score (fallback)
 */
function determineVerdict(score: number): JudgeVerdictType {
  if (score >= 0.9) return 'ACCEPT';
  if (score >= 0.75) return 'TARGETED_FIX';
  if (score >= 0.6) return 'ITERATIVE_REFINEMENT';
  if (score >= 0.4) return 'REGENERATE';
  return 'ESCALATE_TO_HUMAN';
}

/**
 * Build lesson log entries from generation traces
 */
function buildLogEntries(traces: GenerationTraceRow[]): LessonLogEntry[] {
  return traces.map((trace) => {
    // Prefer phase field for node identification
    const nodeName = getNodeFromPhase(trace.phase) || normalizeStepName(trace.step_name);
    const level = trace.error_data ? 'error' : 'info';

    let message = `${trace.step_name}: ${trace.phase}`;
    if (trace.error_data) {
      message += ` - ERROR`;
    } else if (trace.output_data) {
      message += ` - Completed`;
    } else {
      message += ` - Started`;
    }

    return {
      id: trace.id,
      timestamp: new Date(trace.created_at),
      level,
      node: nodeName || 'system',
      message,
      details: {
        phase: trace.phase,
        step_name: trace.step_name,
        tokens_used: trace.tokens_used,
        cost_usd: trace.cost_usd,
        duration_ms: trace.duration_ms,
        retry_attempt: trace.retry_attempt,
        model_used: trace.model_used,
        error: trace.error_data,
      },
    };
  });
}

/**
 * Hook for fetching comprehensive lesson inspector data
 *
 * Fetches lesson content, generation traces, and provides realtime updates
 * for the Lesson Inspector view in Stage 6 UI.
 *
 * @param lessonId - Lesson UUID
 * @param moduleId - Module UUID (for context)
 * @returns Lesson inspector data with loading/error states
 *
 * @example
 * ```tsx
 * function LessonInspector({ lessonId, moduleId }) {
 *   const { data, isLoading, error, refetch } = useLessonInspectorData(lessonId, moduleId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <ErrorMessage error={error} />;
 *   if (!data) return <EmptyState />;
 *
 *   return <LessonInspectorView data={data} />;
 * }
 * ```
 */
export interface UseLessonInspectorDataOptions {
  /** Course ID */
  courseId: string;
  /** Lesson ID label (e.g., "1.2") - null when not viewing a lesson */
  lessonId: string | null;
  /** Whether hook should fetch data */
  enabled?: boolean;
}

export function useLessonInspectorData({
  courseId,
  lessonId,
  enabled = true,
}: UseLessonInspectorDataOptions): UseLessonInspectorDataReturn {
  const { supabase, session, isLoading: authLoading } = useSupabase();
  const [data, setData] = useState<LessonInspectorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fetchIdRef = useRef(0);
  // Store lesson UUID for realtime subscription
  const [lessonUuidForRealtime, setLessonUuidForRealtime] = useState<string | null>(null);

  /**
   * Fetch lesson data from database
   *
   * Data flow:
   * 1. Get section UUID from sections table (by course_id and order_index)
   * 2. Get lesson UUID from lessons table (by section_id and order_index)
   * 3. Get lesson contents from lesson_contents table (by lesson UUID)
   * 4. Get generation traces from generation_trace table (by lesson UUID)
   */
  const fetchLessonData = useCallback(async () => {
    // Extract module/lesson numbers from lesson label (e.g., "1.2" -> module 1, lesson 2)
    const lessonParts = lessonId ? lessonId.split('.') : null;
    const moduleNumber = lessonParts ? parseInt(lessonParts[0], 10) : null;
    const lessonNumber = lessonParts && lessonParts.length > 1 ? parseInt(lessonParts[1], 10) : null;
    const moduleId = moduleNumber ? `module_${moduleNumber}` : null;

    // Skip if disabled or missing required data
    if (!enabled || !lessonId || !moduleId || !moduleNumber || !lessonNumber || authLoading || !session || !courseId) {
      setIsLoading(false);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      logger.debug('[useLessonInspectorData] Fetching lesson data', {
        courseId,
        lessonId,
        moduleNumber,
        lessonNumber,
      });

      // Step 1: Get section UUID
      const { data: sectionData, error: sectionError } = await supabase
        .from('sections')
        .select('id, title')
        .eq('course_id', courseId)
        .eq('order_index', moduleNumber)
        .single();

      if (sectionError || !sectionData) {
        logger.warn('[useLessonInspectorData] Section not found', { moduleNumber, error: sectionError?.message });
        // No section yet - lesson is pending
        setData({
          lessonId,
          lessonNumber,
          moduleId,
          title: `Урок ${lessonNumber}`,
          status: 'pending',
          pipelineNodes: [],
          currentNode: null,
          content: null,
          rawMarkdown: null,
          judgeResult: null,
          totalTokensUsed: 0,
          totalCostUsd: 0,
          totalDurationMs: 0,
          retryCount: 0,
          refinementIterations: 0,
          logs: [],
          canRegenerate: false,
          canApprove: false,
          canEdit: false,
        });
        setIsLoading(false);
        return;
      }

      // Step 2: Get lesson UUID
      const { data: lessonData, error: lessonError } = await supabase
        .from('lessons')
        .select('id, title')
        .eq('section_id', sectionData.id)
        .eq('order_index', lessonNumber)
        .single();

      if (lessonError || !lessonData) {
        logger.warn('[useLessonInspectorData] Lesson not found', { lessonNumber, error: lessonError?.message });
        // No lesson yet - lesson is pending
        setData({
          lessonId,
          lessonNumber,
          moduleId,
          title: `Урок ${lessonNumber}`,
          status: 'pending',
          pipelineNodes: [],
          currentNode: null,
          content: null,
          rawMarkdown: null,
          judgeResult: null,
          totalTokensUsed: 0,
          totalCostUsd: 0,
          totalDurationMs: 0,
          retryCount: 0,
          refinementIterations: 0,
          logs: [],
          canRegenerate: false,
          canApprove: false,
          canEdit: false,
        });
        setIsLoading(false);
        return;
      }

      const lessonUuid = lessonData.id;
      const lessonTitle = lessonData.title || `Урок ${lessonNumber}`;

      // Store UUID for realtime subscription
      setLessonUuidForRealtime(lessonUuid);

      logger.debug('[useLessonInspectorData] Found lesson UUID', { lessonId, lessonUuid, lessonTitle });

      // Step 3: Fetch lesson content using UUID
      const { data: contentData, error: contentError } = await supabase
        .from('lesson_contents')
        .select('*')
        .eq('lesson_id', lessonUuid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (contentError) throw contentError;

      // Step 4: Fetch generation traces for this lesson using UUID
      const { data: tracesData, error: tracesError } = await supabase
        .from('generation_trace')
        .select('*')
        .eq('lesson_id', lessonUuid)
        .eq('stage', 'stage_6')
        .order('created_at', { ascending: true });

      if (tracesError) throw tracesError;

      // Skip if a newer fetch was started
      if (fetchId !== fetchIdRef.current) return;

      const traces = tracesData || [];

      // Build pipeline state
      const {
        pipelineNodes,
        currentNode,
        totalTokensUsed,
        totalCostUsd,
        totalDurationMs,
        retryCount,
      } = buildPipelineState(traces);

      // Parse content if available
      const content = contentData ? parseLessonContent(contentData) : null;

      // Extract rawMarkdown - priority: metadata.markdownContent > build from content
      let rawMarkdown: string | null = null;
      if (contentData?.metadata && typeof contentData.metadata === 'object') {
        const metadata = contentData.metadata as Record<string, unknown>;
        if (metadata.markdownContent && typeof metadata.markdownContent === 'string') {
          rawMarkdown = metadata.markdownContent;
        }
      }
      // Fallback: build from content structure
      if (!rawMarkdown && contentData?.content && typeof contentData.content === 'object') {
        const contentObj = contentData.content as Record<string, unknown>;
        // Check for nested content structure: {status, content: {...}, metadata: {...}}
        if (contentObj.content && typeof contentObj.content === 'object') {
          rawMarkdown = buildMarkdownFromContent(contentObj.content as Record<string, unknown>);
        } else {
          rawMarkdown = buildMarkdownFromContent(contentObj);
        }
      }

      // Parse judge result
      const judgeResult = contentData ? parseJudgeResult(contentData, traces) : null;

      // Build logs
      const logs = buildLogEntries(traces);

      // Determine overall status
      let status: 'pending' | 'active' | 'completed' | 'error' = 'pending';
      if (pipelineNodes.length > 0) {
        // Determine from pipeline nodes if available
        if (pipelineNodes.some((n) => n.status === 'error')) {
          status = 'error';
        } else if (pipelineNodes.some((n) => n.status === 'active')) {
          status = 'active';
        } else if (pipelineNodes.every((n) => n.status === 'completed')) {
          status = 'completed';
        }
      } else if (rawMarkdown || content) {
        // No pipeline nodes but content exists - check traces for completion
        const hasFinishTrace = traces.some(t => t.step_name === 'finish' && t.phase === 'complete');
        const hasErrorTrace = traces.some(t => t.error_data != null);
        if (hasErrorTrace) {
          status = 'error';
        } else if (hasFinishTrace) {
          status = 'completed';
        } else if (traces.length > 0) {
          status = 'active';
        }
      }

      // Calculate refinement iterations (judge node retries)
      const judgeNode = pipelineNodes.find((n) => n.node === 'judge');
      const refinementIterations = judgeNode?.retryAttempt || 0;

      // Construct final data
      const inspectorData: LessonInspectorData = {
        lessonId,
        lessonNumber,
        moduleId,
        title: lessonTitle,
        status,
        pipelineNodes,
        currentNode,
        content,
        rawMarkdown,
        judgeResult,
        totalTokensUsed,
        totalCostUsd,
        totalDurationMs,
        retryCount,
        refinementIterations,
        logs,
        canRegenerate: status === 'error' || status === 'completed',
        canApprove: status === 'completed' && judgeResult !== null,
        canEdit: status === 'completed',
      };

      setData(inspectorData);
      setError(null);

      logger.debug('Lesson inspector data fetched', {
        lessonId,
        status,
        pipelineNodesCount: pipelineNodes.length,
        logsCount: logs.length,
        hasContent: !!content,
      });
    } catch (err) {
      // Skip if a newer fetch was started
      if (fetchId !== fetchIdRef.current) return;

      const fetchError = err instanceof Error ? err : new Error('Failed to fetch lesson data');
      setError(fetchError);
      setData(null);

      logger.error('Failed to fetch lesson inspector data', {
        lessonId,
        error: fetchError.message,
      });
    } finally {
      // Skip if a newer fetch was started
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, lessonId, courseId, supabase, authLoading, session]);

  // Initial fetch
  useEffect(() => {
    if (!authLoading && session) {
      fetchLessonData();
    }
  }, [fetchLessonData, authLoading, session]);

  // Realtime subscription for live updates (uses UUID, not label)
  useEffect(() => {
    // Wait for lesson UUID to be resolved from initial fetch
    if (!lessonUuidForRealtime || authLoading || !session) return;

    logger.debug('Setting up realtime subscription for lesson', { lessonId, lessonUuidForRealtime });

    // Cleanup previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Create channel for this lesson using UUID
    const channel = supabase
      .channel(`lesson-inspector:${lessonUuidForRealtime}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'generation_trace',
          filter: `lesson_id=eq.${lessonUuidForRealtime}`,
        },
        () => {
          logger.debug('New trace received for lesson', { lessonId, lessonUuidForRealtime });
          fetchLessonData(); // Refetch all data
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lesson_contents',
          filter: `lesson_id=eq.${lessonUuidForRealtime}`,
        },
        () => {
          logger.debug('Lesson content updated', { lessonId, lessonUuidForRealtime });
          fetchLessonData(); // Refetch all data
        }
      )
      .subscribe((status) => {
        logger.debug('Realtime subscription status', { lessonId, lessonUuidForRealtime, status });
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [lessonId, lessonUuidForRealtime, supabase, authLoading, session, fetchLessonData]);

  // Manual refetch function
  const refetch = useCallback(() => {
    fetchLessonData();
  }, [fetchLessonData]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}

