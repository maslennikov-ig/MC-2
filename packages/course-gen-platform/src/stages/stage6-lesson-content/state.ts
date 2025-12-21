/**
 * LangGraph State Definition for Stage 6 Lesson Content Generation
 * @module stages/stage6-lesson-content/state
 *
 * Defines the LessonGraphState using LangGraph Annotation.Root for typed state management.
 * This state flows through the lesson generation pipeline:
 * Planner -> Expander -> Assembler -> Smoother -> Judge
 *
 * Reference:
 * - LangGraph.js Annotation API
 * - specs/010-stages-456-pipeline/data-model.md
 */

import { Annotation } from '@langchain/langgraph';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { LessonContent, RAGChunk } from '@megacampus/shared-types/lesson-content';
import type {
  JudgeVerdict,
  JudgeRecommendation,
  OperationMode,
  RefinementStatus,
  ArbiterOutput,
} from '@megacampus/shared-types/judge-types';

/**
 * Graph node names for state tracking
 */
export type LessonGraphNode =
  | 'planner'
  | 'expander'
  | 'assembler'
  | 'smoother'
  | 'judge'
  | 'complete';

/**
 * Expanded section content from expander node
 */
export interface ExpandedSection {
  /** Section title matching specification */
  title: string;
  /** Generated markdown content for this section */
  content: string;
  /** RAG chunks used for this section */
  chunksUsed: string[];
  /** Tokens used for this section */
  tokensUsed: number;
}

/**
 * Cost record for a single node execution
 * Used for per-node cost tracking and cost breakdown analysis
 */
export interface NodeCost {
  /** Node name (planner, expander, assembler, smoother, judge) */
  node: LessonGraphNode;
  /** Model ID used for this node */
  modelId: string;
  /** Tokens used by this node */
  tokensUsed: number;
  /** Cost in USD for this node */
  costUsd: number;
}

/**
 * LessonGraphState - State for lesson content generation workflow
 *
 * Uses LangGraph Annotation.Root for typed state definition with reducers.
 * Reducers are used for array fields to enable incremental updates.
 *
 * State flow:
 * 1. Initial: lessonSpec, courseId, ragChunks
 * 2. Planner: adds outline
 * 3. Expander: adds expandedSections (Map)
 * 4. Assembler: adds assembledContent
 * 5. Smoother: adds smoothedContent
 * 6. Judge: validates and produces finalContent
 *
 * @see https://langchain-ai.github.io/langgraphjs/ for Annotation API
 */
export const LessonGraphState = Annotation.Root({
  // ============================================================================
  // INPUT FIELDS
  // ============================================================================

  /**
   * Lesson specification from Stage 5
   * Contains sections, learning objectives, metadata, and RAG context config
   */
  lessonSpec: Annotation<LessonSpecificationV2>,

  /**
   * Course UUID for context and database operations
   */
  courseId: Annotation<string>,

  /**
   * Target language for content generation (ISO 639-1 code, e.g., 'ru', 'en')
   *
   * Defaults to 'en' (English) if not provided.
   * Used for:
   * - Model selection (via ModelConfigService, supports ru/en only)
   * - Prompt generation (via getLanguageName() for full language names)
   * - Heuristic evaluation (language-aware readability checks)
   *
   * @see getLanguageName() in @megacampus/shared-types for language name mapping
   */
  language: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => 'en',
  }),

  /**
   * Lesson UUID resolved from lesson_id (e.g., "1.1" -> actual UUID)
   * Used for trace logging and database foreign keys
   */
  lessonUuid: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  // ============================================================================
  // RAG CONTEXT
  // ============================================================================

  /**
   * RAG chunks retrieved for this lesson
   * Retrieved based on lessonSpec.rag_context configuration
   */
  ragChunks: Annotation<RAGChunk[]>({
    reducer: (x, y) => (y.length > 0 ? y : x),
    default: () => [],
  }),

  /**
   * RAG context cache ID for tracking
   * Links to rag_context_cache table
   */
  ragContextId: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  /**
   * User instructions for refinement
   * Provided when regenerating with specific feedback
   */
  userRefinementPrompt: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  /**
   * Model override for fallback retry strategy
   * When set, nodes should use this model instead of querying ModelConfigService
   * Used by handler's processWithFallback() to switch to fallback model
   */
  modelOverride: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  // ============================================================================
  // GENERATION PHASES
  // ============================================================================

  /**
   * Lesson outline generated by planner node
   * Structured outline with section headers and key points
   */
  outline: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  /**
   * Expanded sections from expander node
   * Map of section title -> expanded content
   */
  expandedSections: Annotation<Map<string, ExpandedSection>>({
    reducer: (existing, update) => {
      // Merge maps, with update taking precedence
      const merged = new Map(existing);
      update.forEach((value, key) => {
        merged.set(key, value);
      });
      return merged;
    },
    default: () => new Map(),
  }),

  /**
   * Assembled content from assembler node
   * Combined sections with intro, transitions, and exercises
   */
  assembledContent: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  /**
   * Smoothed content from smoother node
   * Refined transitions and polished prose
   */
  smoothedContent: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  // ============================================================================
  // FINAL OUTPUT
  // ============================================================================

  /**
   * Final lesson content after judge validation
   * Complete LessonContent object ready for storage
   */
  lessonContent: Annotation<LessonContent | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  // ============================================================================
  // METADATA & TRACKING
  // ============================================================================

  /**
   * Current node in the graph
   * Used for routing and progress tracking
   */
  currentNode: Annotation<LessonGraphNode>({
    reducer: (x, y) => y ?? x,
    default: () => 'planner' as LessonGraphNode,
  }),

  /**
   * Errors accumulated during generation
   * Reducer appends new errors to existing list
   */
  errors: Annotation<string[]>({
    reducer: (existing, update) => [...existing, ...update],
    default: () => [],
  }),

  /**
   * Retry count for current phase
   * Used by regeneration logic
   */
  retryCount: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),

  /**
   * Model used for generation
   * Tracks which LLM processed this lesson
   */
  modelUsed: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  /**
   * Total tokens used across all phases
   * Accumulated for cost tracking
   */
  tokensUsed: Annotation<number>({
    reducer: (existing, update) => existing + update,
    default: () => 0,
  }),

  /**
   * Total duration in milliseconds
   * Accumulated across phases
   */
  durationMs: Annotation<number>({
    reducer: (existing, update) => existing + update,
    default: () => 0,
  }),

  /**
   * Total cost in USD for lesson generation
   * Accumulated across all nodes (planner, expander, assembler, smoother, judge)
   */
  totalCostUsd: Annotation<number>({
    reducer: (existing, update) => existing + update,
    default: () => 0,
  }),

  /**
   * Cost breakdown by node
   * Tracks per-node model usage, tokens, and cost for analysis
   */
  nodeCosts: Annotation<NodeCost[]>({
    reducer: (existing, update) => [...existing, ...update],
    default: () => [],
  }),

  /**
   * Temperature used for generation
   * Set based on content archetype
   */
  temperature: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0.7,
  }),

  /**
   * Quality score from judge (0-1)
   * Used for accept/reject decisions
   */
  qualityScore: Annotation<number | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  // ============================================================================
  // JUDGE EVALUATION FIELDS
  // ============================================================================

  /**
   * Judge verdict from cascade evaluation
   * Contains full evaluation details including criteria scores and issues
   */
  judgeVerdict: Annotation<JudgeVerdict | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  /**
   * Final recommendation from judge evaluation
   * ACCEPT, ACCEPT_WITH_MINOR_REVISION, ITERATIVE_REFINEMENT, REGENERATE, ESCALATE_TO_HUMAN
   */
  judgeRecommendation: Annotation<JudgeRecommendation | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  /**
   * Flag indicating content needs complete regeneration
   * Set when judge returns REGENERATE recommendation
   */
  needsRegeneration: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),

  /**
   * Flag indicating content needs human review
   * Set when judge returns ESCALATE_TO_HUMAN recommendation
   */
  needsHumanReview: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),

  /**
   * Previous quality scores for trend analysis
   * Used by decision engine to detect diminishing returns
   */
  previousScores: Annotation<number[]>({
    reducer: (existing, update) => [...existing, ...update],
    default: () => [],
  }),

  /**
   * Refinement iteration count
   * Tracks how many refinement loops have been executed (max 2)
   */
  refinementIterationCount: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),

  // ============================================================================
  // TARGETED REFINEMENT STATE (Phase 3)
  // ============================================================================

  /**
   * Operation mode for targeted refinement
   * - 'full-auto': Automatic best-effort, no human escalation
   * - 'semi-auto': Higher thresholds, human escalation possible
   */
  targetedRefinementMode: Annotation<OperationMode>({
    reducer: (x, y) => y ?? x,
    default: () => 'full-auto' as OperationMode,
  }),

  /**
   * Arbiter output from consolidateVerdicts()
   * Contains refinement plan, agreement score, and filtered issues
   */
  arbiterOutput: Annotation<ArbiterOutput | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  /**
   * Final status after targeted refinement
   * - 'accepted': Score met threshold
   * - 'accepted_warning': Below ideal but acceptable (full-auto)
   * - 'best_effort': Returned best available (full-auto)
   * - 'escalated': Needs human review (semi-auto only)
   */
  targetedRefinementStatus: Annotation<RefinementStatus | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  /**
   * Sections locked during targeted refinement
   * Locked after 2 edits to prevent oscillation
   */
  lockedSections: Annotation<string[]>({
    reducer: (existing, update) => {
      // Merge unique section IDs
      const set = new Set([...existing, ...update]);
      return Array.from(set);
    },
    default: () => [],
  }),

  /**
   * Edit count per section during targeted refinement
   * Used to determine when to lock sections
   */
  sectionEditCount: Annotation<Record<string, number>>({
    reducer: (existing, update) => ({ ...existing, ...update }),
    default: () => ({}),
  }),

  /**
   * Total tokens used in targeted refinement
   * Tracks against 15,000 token budget
   */
  targetedRefinementTokensUsed: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
});

/**
 * Type alias for LessonGraphState instance
 * Use this type for node function parameters and returns
 */
export type LessonGraphStateType = typeof LessonGraphState.State;

/**
 * Partial state update type
 * Use this for node return types
 */
export type LessonGraphStateUpdate = Partial<LessonGraphStateType>;
