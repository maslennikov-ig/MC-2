import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { LessonContent, RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { CourseStyle } from '@megacampus/shared-types/style-prompts';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import type {
  QualityRecoveryAttempt,
  QualityRecoveryMode,
  QualityRecoveryFinalDisposition,
  Stage6QualityRungPhaseName,
} from '@megacampus/shared-types/stage6-quality-recovery';

export type Stage6ModelTierName = 'simple' | 'normal' | 'complex';
export type Stage6QualityRungName = Stage6QualityRungPhaseName;
export type Stage6ExecutionPolicyMode = 'manual_top_regeneration';
export type Stage6QualityAttemptOutcome = 'accepted' | 'quality_retryable' | 'failed';

/**
 * Execution context for Stage 6 jobs.
 *
 * Distinguishes the reason a lesson generation was triggered so that
 * precondition checks (e.g. isStage6CourseActive) can allow legitimate
 * remediation jobs on completed courses.
 *
 * - full_generation:        Normal pipeline-driven first-time generation
 * - partial_regeneration:   User-triggered regeneration of selected lessons (partialGenerate)
 * - manual_regeneration:    Manual top-model regeneration via admin UI
 * - generate_missing:       Backfill missing lessons on an otherwise completed course
 */
export type Stage6ExecutionContext =
  | 'full_generation'
  | 'partial_regeneration'
  | 'manual_regeneration'
  | 'generate_missing';

/** Execution contexts that allow jobs to run on completed courses. */
export const STAGE6_REMEDIATION_CONTEXTS: ReadonlySet<Stage6ExecutionContext> = new Set([
  'partial_regeneration',
  'manual_regeneration',
  'generate_missing',
]);

export interface Stage6ExecutionPolicy {
  mode: Stage6ExecutionPolicyMode;
}

export interface Stage6QualityRecoveryAttemptHistory extends QualityRecoveryAttempt {
  rung_attempt_index: number;
  outcome: Stage6QualityAttemptOutcome;
  selected_model: string | null;
  fallback_model: string | null;
  selected_model_phase?: string | null;
  selected_model_source?: string | null;
  model_used: string | null;
  quality_score: number;
  errors: string[];
  review_reasons?: string[];
}

export interface Stage6QualityRecoveryHistory {
  mode: QualityRecoveryMode;
  manual_triggered?: boolean;
  attempts: Stage6QualityRecoveryAttemptHistory[];
  final_disposition?: QualityRecoveryFinalDisposition;
}

export interface Stage6ControlDecision {
  action: 'run_rung' | 'human_review_required';
  attempt: QualityRecoveryAttempt | null;
  finalDisposition: QualityRecoveryFinalDisposition | null;
}

/**
 * Stage 6 job input structure
 * Contains lesson specification and context for generation
 */
export interface Stage6JobInput {
  /** Lesson specification from Stage 5 */
  lessonSpec: LessonSpecificationV2;

  /** Course UUID for context and database operations */
  courseId: string;

  /** RAG chunks (deprecated - handler fetches via retrieveLessonContext()) */
  ragChunks?: RAGChunk[];

  /** RAG context cache ID (deprecated - handler manages this) */
  ragContextId?: string | null;

  /** Target language for content generation (ISO 639-1 code, e.g., 'ru', 'en') */
  language: string;

  /** Lesson UUID for database operations (optional, resolved from lessonSpec.lesson_id if not provided) */
  lessonUuid?: string | null;

  /** Optional model override for fallback retry */
  modelOverride?: string;

  /** Optional execution policy for user-triggered top-model regeneration. */
  executionPolicy?: Stage6ExecutionPolicy;

  /** Model selected by Stage 6 tier routing before overrides/retries */
  selectedModel?: string | null;

  /** Fallback model paired with selectedModel */
  fallbackModel?: string | null;

  /** Selected Stage 6 tier */
  selectedModelTier?: Stage6ModelTierName | null;

  /** Human-readable tier selection reason */
  selectedModelTierReason?: string | null;

  /** Effective Stage 6 phase backing the selected model */
  selectedModelPhase?: string | null;

  /** Effective config source for the selected model */
  selectedModelSource?: string | null;

  /** Optional user instructions for refinement */
  userRefinementPrompt?: string;

  /**
   * Course content style for lesson generation
   * Controls vocabulary, phrasing, and narrative approach
   * @example 'gamified' - Quest-based, achievement-oriented narrative
   * @example 'professional' - Business formal, concise, authoritative
   * @default 'professional' (fallback in getStylePrompt when null/undefined)
   */
  style?: CourseStyle;

  /**
   * Analysis result from Stage 4 containing generation guidance
   * Provides specific analogies, real-world examples, and pedagogical strategy
   * for higher quality content generation
   */
  analysisResult?: AnalysisResult;

  /**
   * Skip automatic course completion check after job completes
   * Set to true for partialGenerate jobs where frontend tracks completion independently
   */
  skipCompletionCheck?: boolean;

  /**
   * Execution context explaining why this job was created.
   * Remediation contexts (partial_regeneration, manual_regeneration, generate_missing)
   * allow the worker to proceed even when the course is in 'completed' or
   * 'stage_6_complete' state.
   * @default 'full_generation'
   */
  executionContext?: Stage6ExecutionContext;

  /** Organization UUID (for job status tracking, optional) */
  organizationId?: string;

  /** User UUID who triggered the generation (for job status tracking, optional) */
  userId?: string;

  /** Job type identifier (for job status tracking, optional) */
  jobType?: string;
}

/**
 * Stage 6 job result structure
 * Returned after job completion (success or failure)
 */
export interface Stage6JobResult {
  /** Lesson identifier */
  lessonId: string;

  /** Success flag */
  success: boolean;

  /** Generated lesson content (null on failure) */
  lessonContent: LessonContent | null;

  /** Error messages (empty on success) */
  errors: string[];

  /** Outer quality ladder history (if the job used multi-rung recovery). */
  qualityRecovery?: Stage6QualityRecoveryHistory;

  /** Generation metrics */
  metrics: {
    /** Total tokens used */
    tokensUsed: number;

    /** Total duration in milliseconds */
    durationMs: number;

    /** Model identifier used for generation */
    modelUsed: string | null;

    /** Model selected by Stage 6 tier routing before overrides/retries */
    selectedModel: string | null;

    /** Fallback model paired with selectedModel */
    fallbackModel: string | null;

    /** Selected Stage 6 tier */
    selectedModelTier: Stage6ModelTierName | null;

    /** Human-readable tier selection reason */
    selectedModelTierReason: string | null;

    /** Effective Stage 6 phase backing the selected model */
    selectedModelPhase?: string | null;

    /** Effective config source for the selected model */
    selectedModelSource?: string | null;

    /** Quality score from validation (0-1) */
    qualityScore: number;

    /** Number of full regenerate loops requested */
    regenerateCount: number;

    /** Number of truncation-only regenerate detections */
    truncationCount: number;

    /** Tokens spent on attempts that ended in REGENERATE */
    rejectedTokens: number;

    /** Last regeneration mode used (null if no regeneration needed) */
    regenerationMode: 'full_regenerate' | 'truncation_continuation' | null;

    /** Attempt ladder captured for persistence/debugging */
    attemptLadder?: Stage6QualityRecoveryAttemptHistory[];
  };
}

/**
 * Progress update structure for streaming
 * Sent via job.updateProgress() during processing
 */
export interface ProgressUpdate {
  /** Lesson identifier being processed */
  lessonId: string;

  /** Current processing phase */
  phase: 'planner' | 'expander' | 'assembler' | 'smoother' | 'judge' | 'complete';

  /** Progress percentage (0-100) */
  progress: number;

  /** Human-readable status message */
  message: string;

  /** Tokens used so far (optional) */
  tokensUsed?: number;
}

/**
 * Model configuration for fallback retry
 */
export interface ModelConfig {
  /** Primary model to use */
  primary: string;
  /** Fallback model if primary fails */
  fallback: string;
}

/**
 * Stage 6 orchestrator input
 *
 * Contains all required inputs for lesson content generation.
 */
export interface Stage6Input {
  /** Lesson specification from Stage 5 */
  lessonSpec: LessonSpecificationV2;
  /** Course UUID for context */
  courseId: string;
  /** Target language for content generation (ISO 639-1 code, e.g., 'ru', 'en') */
  language: string;
  /** Lesson UUID resolved from lesson_id (optional, for trace logging) */
  lessonUuid?: string | null;
  /** Pre-retrieved RAG chunks (optional) */
  ragChunks?: RAGChunk[];
  /** RAG context cache ID for tracking (optional) */
  ragContextId?: string;
  /** User instructions for refinement (optional) */
  userRefinementPrompt?: string;
  /** Model override for fallback retry (optional) */
  modelOverride?: string;
  /**
   * Course content style for lesson generation
   * Controls vocabulary, phrasing, and narrative approach
   * @example 'gamified' - Quest-based, achievement-oriented narrative
   * @example 'professional' - Business formal, concise, authoritative
   * @default 'professional' (fallback in getStylePrompt when null/undefined)
   */
  style?: string;
  /**
   * Analysis result from Stage 4 containing generation guidance
   * Provides specific analogies, real-world examples, and pedagogical strategy
   * for higher quality content generation
   */
  analysisResult?: AnalysisResult;

  /** Model selected by Stage 6 tier routing before overrides/retries */
  selectedModel?: string | null;

  /** Fallback model paired with selectedModel */
  fallbackModel?: string | null;

  /** Selected Stage 6 tier */
  selectedModelTier?: Stage6ModelTierName | null;

  /** Human-readable tier selection reason */
  selectedModelTierReason?: string | null;

  /** Effective Stage 6 phase backing the selected model */
  selectedModelPhase?: string | null;

  /** Effective config source for the selected model */
  selectedModelSource?: string | null;
}

/**
 * Stage 6 orchestrator output
 *
 * Contains generated content and execution metrics.
 */
export interface Stage6Output {
  /** Generated lesson content (null if failed) */
  lessonContent: LessonContent | null;
  /** Whether generation succeeded */
  success: boolean;
  /** Accumulated errors during generation */
  errors: string[];

  /** Outer quality ladder history (if the run used multi-rung recovery). */
  qualityRecovery?: Stage6QualityRecoveryHistory;

  /** Execution metrics */
  metrics: {
    /** Total tokens used across all nodes */
    tokensUsed: number;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Model used for generation */
    modelUsed: string | null;
    /** Model selected by Stage 6 tier routing before overrides/retries */
    selectedModel: string | null;
    /** Fallback model paired with selectedModel */
    fallbackModel: string | null;
    /** Selected Stage 6 tier */
    selectedModelTier: Stage6ModelTierName | null;
    /** Human-readable tier selection reason */
    selectedModelTierReason: string | null;
    /** Effective Stage 6 phase backing the selected model */
    selectedModelPhase?: string | null;
    /** Effective config source for the selected model */
    selectedModelSource?: string | null;
    /** Quality score from judge (0-1, or 0 if not evaluated) */
    qualityScore: number;
    /** Number of full regenerate loops requested */
    regenerateCount: number;
    /** Number of truncation-only regenerate detections */
    truncationCount: number;
    /** Tokens spent on attempts that ended in REGENERATE */
    rejectedTokens: number;
    /** Last regeneration mode used (null if no regeneration needed) */
    regenerationMode: 'full_regenerate' | 'truncation_continuation' | null;
    /** Attempt ladder captured for persistence/debugging */
    attemptLadder?: Stage6QualityRecoveryAttemptHistory[];
  };
  /** Human review metadata (for UI warnings) */
  reviewInfo?: {
    /** Whether content needs human review */
    needsReview: boolean;
    /** Reasons for review requirement */
    reasons: string[];
    /** Factual verification accuracy score (0-1) */
    factualAccuracyScore?: number;
    /** Number of unverified claims */
    unverifiedClaims?: number;
  };
  /** Lesson digest — 3-5 sentence factual summary for inter-lesson context */
  lessonDigest?: string;
}
