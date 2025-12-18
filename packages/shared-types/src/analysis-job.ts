/**
 * Stage 4 Structure Analysis Job Types
 * @module @megacampus/shared-types/analysis-job
 */

/**
 * Target audience type for course analysis
 */
export type TargetAudience = 'beginner' | 'intermediate' | 'advanced' | 'mixed';

/**
 * Processing method for document summaries (from Stage 3)
 */
export type ProcessingMethod = 'bypass' | 'detailed' | 'balanced' | 'aggressive';

/**
 * Document summary metadata from Stage 3 summarization
 *
 * Note: This is distinct from Stage 3's SummaryMetadata which includes
 * LLM processing details. This interface focuses on compression metrics.
 */
export interface DocumentSummaryMetadata {
  /** Original document tokens before summarization */
  original_tokens: number;

  /** Summary tokens after compression */
  summary_tokens: number;

  /** Compression ratio (original / summary) */
  compression_ratio: number;

  /** Quality score (0-1 scale) */
  quality_score: number;
}

/**
 * Document summary from Stage 3 processing
 *
 * This interface represents a processed document that has been
 * extracted and summarized in Stage 3. These summaries are
 * optionally included in the analysis job payload.
 */
export interface DocumentSummary {
  /** File catalog entry UUID */
  document_id: string;

  /** Original filename */
  file_name: string;

  /** Processed summary content from Stage 3 */
  processed_content: string;

  /** Processing method used in Stage 3 */
  processing_method: ProcessingMethod;

  /** Summary metadata (tokens, compression, quality) */
  summary_metadata: DocumentSummaryMetadata;
}

/**
 * Input data for structure analysis job
 *
 * This data is extracted from the courses table and optionally
 * includes document summaries from Stage 3.
 */
export interface StructureAnalysisInput {
  /** Course topic (from courses.topic) */
  topic: string;

  /** Target language for final course (e.g., 'ru', 'en') */
  language: string;

  /** Content style (e.g., 'professional', 'conversational') */
  style: string;

  /** Optional user requirements (from courses.answers) */
  answers?: string;

  /** Target audience level */
  target_audience: TargetAudience;

  /** Difficulty level (e.g., 'beginner', 'intermediate', 'advanced') */
  difficulty: string;

  /** Lesson duration in minutes (3-45) */
  lesson_duration_minutes: number;

  /** Optional document summaries from Stage 3 */
  document_summaries?: DocumentSummary[];
}

/**
 * BullMQ job payload for STRUCTURE_ANALYSIS queue
 *
 * @deprecated Use `StructureAnalysisJobData` from `bullmq-jobs.ts` instead.
 * This interface uses snake_case naming which doesn't match the actual job data.
 * The handler now uses camelCase from BaseJobDataSchema and fetches course data from DB.
 *
 * Migration note:
 * - course_id → courseId (from BaseJobData)
 * - organization_id → organizationId (from BaseJobData)
 * - user_id → userId (from BaseJobData)
 * - input → fetched from database by handler
 */
export interface StructureAnalysisJob {
  /** @deprecated Use courseId from StructureAnalysisJobData */
  course_id: string;

  /** @deprecated Use organizationId from StructureAnalysisJobData */
  organization_id: string;

  /** @deprecated Use userId from StructureAnalysisJobData */
  user_id: string;

  /** @deprecated Handler fetches this from database */
  input: StructureAnalysisInput;

  /** @deprecated Not used - handler uses defaults */
  priority: number;

  /** @deprecated Not used - handler uses job.attemptsMade */
  attempt_count: number;

  /** @deprecated Use createdAt from StructureAnalysisJobData */
  created_at: string;
}
