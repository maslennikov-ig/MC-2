/**
 * Stage 3 Document Summarization Job Types
 * @module @megacampus/shared-types/summarization-job
 */

/**
 * Summarization strategy type
 * - full_text: For documents <3K tokens (no LLM processing, store original text)
 * - hierarchical: For documents >3K tokens (chunking + adaptive compression)
 */
export type SummarizationStrategy = 'full_text' | 'hierarchical';

/**
 * BullMQ job payload for document summarization queue
 *
 * This interface defines the data structure for jobs in the summarization queue.
 * Jobs are created after Stage 2 text extraction completes successfully.
 */
export interface SummarizationJobData {
  /** Course UUID */
  course_id: string;

  /** Organization UUID */
  organization_id: string;

  /** File catalog entry UUID */
  file_id: string;

  /** Correlation ID for tracing across stages */
  correlation_id: string;

  /** Extracted text from Stage 2 (from markdown_content column) */
  extracted_text: string;

  /** Original filename for logging */
  original_filename: string;

  /** ISO 639-1 language code (e.g., 'ru', 'en') */
  language: string;

  /** Course topic for context */
  topic: string;

  /** Processing strategy */
  strategy: SummarizationStrategy;

  /** Model identifier: 'openai/gpt-oss-20b' | 'openai/gpt-oss-120b' | 'google/gemini-2.5-flash-preview' */
  model: string;

  /** Threshold for no-summary decision (tokens). Default: 3000 */
  no_summary_threshold_tokens?: number;

  /** Quality threshold for acceptance (0-1 scale). Default: 0.75 */
  quality_threshold?: number;

  /** Maximum output tokens for LLM. Default: 10000 */
  max_output_tokens?: number;

  /** Current retry attempt number (0-indexed) */
  retry_attempt?: number;

  /** Previous strategy used in retry chain */
  previous_strategy?: string;

  /** Document priority from Stage 2 classification (HIGH or LOW) */
  priority?: 'HIGH' | 'LOW';
}
