/**
 * Stage 6 Lesson Content Generation Types
 * @module @megacampus/shared-types/lesson-content
 *
 * Defines types and Zod schemas for:
 * - RAG context caching (RAGContextCache, RAGChunk, RAGQueryParams)
 * - Lesson content structure (LessonContent, LessonContentBody)
 * - Content sections, examples, exercises with citations
 * - Generation metadata for lesson content
 *
 * Reference:
 * - specs/010-stages-456-pipeline/data-model.md (lines 241-407)
 * - specs/010-stages-456-pipeline/contracts/trpc-procedures.ts
 */

import { z } from 'zod';

// ============================================================================
// CONTENT ARCHETYPE (Shared Enum)
// ============================================================================

/**
 * Content archetype for temperature routing and content style
 *
 * Used to determine LLM parameters and content generation strategy:
 * - code_tutorial: Lower temperature (0.3), structured step-by-step
 * - concept_explainer: Medium temperature (0.5), clear explanations
 * - case_study: Higher temperature (0.7), narrative style
 * - legal_warning: Very low temperature (0.1), precise and formal
 *
 * Reference: specs/010-stages-456-pipeline/quickstart.md (lines 371-406)
 */
export const ContentArchetypeSchema = z.enum([
  'code_tutorial',
  'concept_explainer',
  'case_study',
  'legal_warning',
]);

export type ContentArchetype = z.infer<typeof ContentArchetypeSchema>;

// ============================================================================
// LESSON STATUS
// ============================================================================

/**
 * Status of lesson content generation
 *
 * State machine: pending -> generating -> completed | failed | review_required
 *
 * NOTE: Named LessonContentStatus (not LessonStatus) to avoid conflict with
 * the database LessonStatus enum in zod-schemas.ts which represents
 * lesson publication status (draft/published/archived).
 */
export const LessonContentStatusSchema = z.enum([
  'pending',           // Not yet started
  'generating',        // Currently being generated
  'completed',         // Successfully generated and validated
  'failed',            // Generation failed after retries
  'review_required',   // Generated but needs human review (quality below threshold)
]);

export type LessonContentStatus = z.infer<typeof LessonContentStatusSchema>;

// ============================================================================
// RAG CONTEXT CACHE
// ============================================================================

/**
 * Filter criteria for RAG queries
 *
 * Used to narrow down vector search results based on document metadata.
 */
export const RAGFilterSchema = z.object({
  /** Limit search to specific file IDs */
  file_ids: z.array(z.string().uuid()).optional(),

  /** Filter by topic keywords */
  topics: z.array(z.string()).optional(),

  /** Filter by section/heading keywords */
  section_keywords: z.array(z.string()).optional(),
});

export type RAGFilter = z.infer<typeof RAGFilterSchema>;

/**
 * Parameters used for RAG query execution
 *
 * Captures the search configuration used to retrieve context chunks.
 */
export const RAGQueryParamsSchema = z.object({
  /** Search queries (can be multiple for hybrid retrieval) */
  queries: z.array(z.string().min(1)),

  /** Filter criteria for narrowing results */
  filters: RAGFilterSchema,

  /** Maximum number of chunks to retrieve */
  limit: z.number().int().positive(),

  /** Search algorithm type */
  search_type: z.enum(['similarity', 'mmr']),
});

export type RAGQueryParams = z.infer<typeof RAGQueryParamsSchema>;

/**
 * Individual RAG chunk retrieved from vector store
 *
 * Represents a single piece of context from a source document.
 */
export const RAGChunkSchema = z.object({
  /** Unique chunk identifier */
  chunk_id: z.string(),

  /** Source document UUID from file_catalog */
  document_id: z.string().uuid(),

  /** Original document filename for reference */
  document_name: z.string(),

  /** Chunk text content */
  content: z.string(),

  /** Page number or section identifier (optional) */
  page_or_section: z.string().optional(),

  /** Relevance score from vector search (0-1 scale) */
  relevance_score: z.number().min(0).max(1),

  /** Additional chunk metadata (embeddings info, etc.) */
  metadata: z.record(z.unknown()),
});

export type RAGChunk = z.infer<typeof RAGChunkSchema>;

/**
 * RAG context cache for a lesson
 *
 * Stores retrieved context chunks for a specific lesson to enable:
 * - Efficient regeneration without re-querying vector store
 * - Debugging and quality analysis of context selection
 * - Citation tracking back to source documents
 *
 * TTL: course_completed_at + 1 hour (for review/editing window)
 */
export const RAGContextCacheSchema = z.object({
  /** Unique context cache identifier */
  context_id: z.string().uuid(),

  /** Course UUID */
  course_id: z.string().uuid(),

  /** Lesson UUID */
  lesson_id: z.string().uuid(),

  /** Retrieved context chunks */
  chunks: z.array(RAGChunkSchema),

  /** Query parameters used for retrieval */
  query_params: RAGQueryParamsSchema,

  /** Cache creation timestamp */
  created_at: z.coerce.date(),

  /** Cache expiration timestamp */
  expires_at: z.coerce.date(),
});

export type RAGContextCache = z.infer<typeof RAGContextCacheSchema>;

// ============================================================================
// LESSON CONTENT STRUCTURE
// ============================================================================

/**
 * Citation reference to source document
 *
 * Links generated content back to specific source material.
 */
export const CitationSchema = z.object({
  /** Source document name */
  document: z.string(),

  /** Page number or section identifier */
  page_or_section: z.string(),
});

export type Citation = z.infer<typeof CitationSchema>;

/**
 * Content section within a lesson
 *
 * Main content blocks that form the lesson body.
 * Target: 3-5K words total across all sections.
 */
export const ContentSectionSchema = z.object({
  /** Section heading/title */
  title: z.string().min(3).max(300),

  /** Section content in Markdown format (3-5K words total) */
  content: z.string().min(50),

  /** Optional citations for this section */
  citations: z.array(CitationSchema).optional(),
});

export type ContentSection = z.infer<typeof ContentSectionSchema>;

/**
 * Example within a lesson
 *
 * Illustrative examples that reinforce concepts.
 */
export const ContentExampleSchema = z.object({
  /** Example title/heading */
  title: z.string().min(3).max(300),

  /** Example explanation in Markdown */
  content: z.string().min(20),

  /** Optional code snippet */
  code: z.string().optional(),

  /** Citation references (document names) */
  citations: z.array(z.string()).optional(),
});

export type ContentExample = z.infer<typeof ContentExampleSchema>;

/**
 * Grading rubric for exercises
 *
 * Provides assessment criteria and point allocation.
 */
export const GradingRubricSchema = z.object({
  /** Assessment criteria description */
  criteria: z.string().min(10),

  /** Point value for this criterion */
  points: z.number().int().nonnegative(),
});

export type GradingRubric = z.infer<typeof GradingRubricSchema>;

/**
 * Exercise within a lesson
 *
 * Practical exercises for learner engagement and assessment.
 */
export const ContentExerciseSchema = z.object({
  /** Exercise question/prompt */
  question: z.string().min(10).max(2000),

  /** Optional hints to guide learners */
  hints: z.array(z.string()).optional(),

  /** Model solution/answer */
  solution: z.string().min(10),

  /** Optional grading rubric */
  grading_rubric: GradingRubricSchema.optional(),
});

export type ContentExercise = z.infer<typeof ContentExerciseSchema>;

/**
 * Interactive element configuration
 *
 * Defines interactive components embedded in lesson content.
 */
export const InteractiveElementSchema = z.object({
  /** Type of interactive element */
  type: z.enum(['quiz', 'code_sandbox', 'diagram_builder']),

  /** Element-specific configuration */
  config: z.record(z.unknown()),
});

export type InteractiveElement = z.infer<typeof InteractiveElementSchema>;

/**
 * Lesson content body structure
 *
 * Complete content structure for a generated lesson.
 */
export const LessonContentBodySchema = z.object({
  /** Introduction paragraph (Markdown) */
  intro: z.string().min(50),

  /** Main content sections */
  sections: z.array(ContentSectionSchema).min(1),

  /** Illustrative examples */
  examples: z.array(ContentExampleSchema),

  /** Practical exercises */
  exercises: z.array(ContentExerciseSchema),

  /** Optional interactive elements */
  interactive_elements: z.array(InteractiveElementSchema).optional(),
});

export type LessonContentBody = z.infer<typeof LessonContentBodySchema>;

// ============================================================================
// LESSON CONTENT METADATA
// ============================================================================

/**
 * Metadata for lesson content generation
 *
 * Tracks generation metrics, costs, and quality scores.
 */
export const LessonContentMetadataSchema = z.object({
  /** Total word count in generated content */
  total_words: z.number().int().nonnegative(),

  /** Total token count (input + output) */
  total_tokens: z.number().int().nonnegative(),

  /** Generation cost in USD */
  cost_usd: z.number().nonnegative(),

  /** Quality score from validation (0.0-1.0 scale) */
  quality_score: z.number().min(0).max(1),

  /** Number of RAG chunks used in generation */
  rag_chunks_used: z.number().int().nonnegative(),

  /** Generation duration in milliseconds */
  generation_duration_ms: z.number().int().nonnegative(),

  /** Model identifier used for generation */
  model_used: z.string(),

  /** Content archetype used for parameter routing */
  archetype_used: ContentArchetypeSchema,

  /** Temperature setting used for generation */
  temperature_used: z.number().min(0).max(2),
});

export type LessonContentMetadata = z.infer<typeof LessonContentMetadataSchema>;

// ============================================================================
// LESSON CONTENT (Complete Entity)
// ============================================================================

/**
 * Complete lesson content entity
 *
 * Full lesson content structure including body, metadata, and status.
 * Stored in lesson_content table or as JSONB in lessons table.
 */
export const LessonContentSchema = z.object({
  /** Lesson UUID */
  lesson_id: z.string().uuid(),

  /** Course UUID */
  course_id: z.string().uuid(),

  /** Lesson content body */
  content: LessonContentBodySchema,

  /** Generation metadata */
  metadata: LessonContentMetadataSchema,

  /** Content generation status */
  status: LessonContentStatusSchema,

  /** Creation timestamp */
  created_at: z.coerce.date(),

  /** Last update timestamp */
  updated_at: z.coerce.date(),
});

export type LessonContent = z.infer<typeof LessonContentSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate RAG context cache data
 * @param data - Raw data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateRAGContextCache(data: unknown) {
  return RAGContextCacheSchema.safeParse(data);
}

/**
 * Validate lesson content data
 * @param data - Raw data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateLessonContent(data: unknown) {
  return LessonContentSchema.safeParse(data);
}

/**
 * Validate lesson content body (without metadata)
 * @param data - Raw content body to validate
 * @returns Validation result with parsed data or errors
 */
export function validateLessonContentBody(data: unknown) {
  return LessonContentBodySchema.safeParse(data);
}

/**
 * Validate lesson content metadata
 * @param data - Raw metadata to validate
 * @returns Validation result with parsed data or errors
 */
export function validateLessonContentMetadata(data: unknown) {
  return LessonContentMetadataSchema.safeParse(data);
}

/**
 * Type guard for LessonContent
 * @param value - Value to check
 * @returns True if value is a valid LessonContent
 */
export function isLessonContent(value: unknown): value is LessonContent {
  return LessonContentSchema.safeParse(value).success;
}

/**
 * Type guard for RAGContextCache
 * @param value - Value to check
 * @returns True if value is a valid RAGContextCache
 */
export function isRAGContextCache(value: unknown): value is RAGContextCache {
  return RAGContextCacheSchema.safeParse(value).success;
}
