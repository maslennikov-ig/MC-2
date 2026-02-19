import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { LessonContent, RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { CourseStyle } from '@megacampus/shared-types/style-prompts';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';

export type Stage6ModelTierName = 'simple' | 'normal' | 'complex';

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

  /** Model selected by Stage 6 tier routing before overrides/retries */
  selectedModel?: string | null;

  /** Fallback model paired with selectedModel */
  fallbackModel?: string | null;

  /** Selected Stage 6 tier */
  selectedModelTier?: Stage6ModelTierName | null;

  /** Human-readable tier selection reason */
  selectedModelTierReason?: string | null;

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

    /** Quality score from validation (0-1) */
    qualityScore: number;
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
    /** Quality score from judge (0-1, or 0 if not evaluated) */
    qualityScore: number;
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
