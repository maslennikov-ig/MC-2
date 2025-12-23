import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { LessonContent, RAGChunk } from '@megacampus/shared-types/lesson-content';

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

  /** Optional user instructions for refinement */
  userRefinementPrompt?: string;
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
