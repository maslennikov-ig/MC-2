/**
 * BullMQ Job Type Definitions
 *
 * This file defines the schema and types for all job types that will be processed
 * by the BullMQ orchestration system. Jobs are categorized by their purpose in the
 * course generation pipeline.
 *
 * Stage 0: Infrastructure only - job definitions for future stages
 * @module bullmq-jobs
 */

import { z } from 'zod';
import { languageSchema } from './common-enums';

// ============================================================================
// Job Type Enum
// ============================================================================

/**
 * All possible job types in the system
 *
 * Stage 1+: Document processing, course generation, AI workflows
 * Stage 0: Test jobs only (for infrastructure validation)
 */
export enum JobType {
  // Test jobs (Stage 0)
  TEST_JOB = 'test_job',
  INITIALIZE = 'initialize',

  // Document processing (Stage 1+)
  DOCUMENT_PROCESSING = 'document_processing',

  // Summary generation (Stage 2+)
  SUMMARY_GENERATION = 'summary_generation',

  // Document classification (Stage 3)
  DOCUMENT_CLASSIFICATION = 'document_classification',

  // Structure analysis (Stage 4+)
  STRUCTURE_ANALYSIS = 'structure_analysis',
  STRUCTURE_GENERATION = 'structure_generation',

  // Text generation (Stage 4+)
  TEXT_GENERATION = 'text_generation',

  // Lesson content generation (Stage 6+)
  LESSON_CONTENT = 'lesson_content',

  // Enrichment generation (Stage 7+)
  ENRICHMENT_GENERATION = 'enrichment_generation',

  // Finalization (Stage 5+)
  FINALIZATION = 'finalization',
}

// ============================================================================
// Job Status Enum
// ============================================================================

export enum JobStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  WAITING = 'waiting',
}

// ============================================================================
// Base Job Data Schema
// ============================================================================

/**
 * Base schema for all jobs - contains common fields
 */
export const BaseJobDataSchema = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
  userId: z.string().uuid(),
  jobType: z.nativeEnum(JobType),
  createdAt: z.string().datetime(),
  locale: z.enum(['ru', 'en']).default('ru'),
});

export type BaseJobData = z.infer<typeof BaseJobDataSchema>;

// ============================================================================
// Test Job Schema (Stage 0)
// ============================================================================

/**
 * Test job for infrastructure validation
 */
export const TestJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.TEST_JOB),
  message: z.string(),
  delayMs: z.number().int().min(0).optional(),
  shouldFail: z.boolean().optional(),
  checkCancellation: z.boolean().optional(), // Enable periodic cancellation checks
});

export type TestJobData = z.infer<typeof TestJobDataSchema>;

// ============================================================================
// Initialize Job Schema (Stage 0)
// ============================================================================

/**
 * Initialize course generation job
 */
export const InitializeJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.INITIALIZE),
  metadata: z.record(z.unknown()).optional(),
});

export type InitializeJobData = z.infer<typeof InitializeJobDataSchema>;

// ============================================================================
// Document Processing Job Schema (Stage 1+)
// ============================================================================

/**
 * Document processing job - chunking, embedding, indexing
 */
export const DocumentProcessingJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.DOCUMENT_PROCESSING),
  fileId: z.string().uuid(),
  filePath: z.string(),
  mimeType: z.string(),
  chunkSize: z.number().int().min(256).max(2048).default(512),
  chunkOverlap: z.number().int().min(0).max(512).default(50),
});

export type DocumentProcessingJobData = z.infer<typeof DocumentProcessingJobDataSchema>;

// ============================================================================
// Summary Generation Job Schema (Stage 2+)
// ============================================================================

/**
 * Summary generation job - AI-powered summarization
 */
export const SummaryGenerationJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.SUMMARY_GENERATION),
  documentIds: z.array(z.string().uuid()),
  summaryType: z.enum(['brief', 'detailed', 'key_points']),
  maxTokens: z.number().int().min(100).max(4000).default(1000),
});

export type SummaryGenerationJobData = z.infer<typeof SummaryGenerationJobDataSchema>;

// ============================================================================
// Document Classification Job Schema (Stage 3)
// ============================================================================

/**
 * Document classification job - Stage 3 document priority classification
 *
 * Classifies documents into CORE, IMPORTANT, and SUPPLEMENTARY priorities
 * for token budget allocation in Stage 4.
 */
export const DocumentClassificationJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.DOCUMENT_CLASSIFICATION),
});

export type DocumentClassificationJobData = z.infer<typeof DocumentClassificationJobDataSchema>;

// ============================================================================
// Structure Analysis Job Schema (Stage 4)
// ============================================================================

/**
 * Structure analysis job - Stage 4 topic analysis and course planning
 *
 * Note: The handler fetches full course data from the database,
 * so only basic identifiers and optional context are needed in the payload.
 */
export const StructureAnalysisJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.STRUCTURE_ANALYSIS),
  /** Course title for context (handler fetches full data from DB) */
  title: z.string().optional(),
  /** Course settings (optional, fetched from DB if not provided) */
  settings: z.record(z.unknown()).optional(),
  /** Webhook URL for completion notification */
  webhookUrl: z.string().url().nullable().optional(),
});

export type StructureAnalysisJobData = z.infer<typeof StructureAnalysisJobDataSchema>;

// ============================================================================
// Structure Generation Job Schema (Stage 3+)
// ============================================================================

/**
 * Structure generation job - generate course outline from analysis
 */
export const StructureGenerationJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.STRUCTURE_GENERATION),
  analysisId: z.string().uuid(),
  preferences: z
    .object({
      sectionsCount: z.number().int().min(1).max(20).optional(),
      lessonsPerSection: z.number().int().min(1).max(10).optional(),
    })
    .optional(),
});

export type StructureGenerationJobData = z.infer<typeof StructureGenerationJobDataSchema>;

// ============================================================================
// Text Generation Job Schema (Stage 4+)
// ============================================================================

/**
 * Text generation job - generate lesson content using RAG
 */
export const TextGenerationJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.TEXT_GENERATION),
  lessonId: z.string().uuid(),
  retrievalQuery: z.string(),
  topK: z.number().int().min(1).max(50).default(10),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(100).max(8000).default(2000),
});

export type TextGenerationJobData = z.infer<typeof TextGenerationJobDataSchema>;

// ============================================================================
// Finalization Job Schema (Stage 5+)
// ============================================================================

/**
 * Finalization job - package course, update status, notify user
 */
export const FinalizationJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.FINALIZATION),
  outputFormat: z.enum(['json', 'html', 'scorm']).default('json'),
  notifyUser: z.boolean().default(true),
});

export type FinalizationJobData = z.infer<typeof FinalizationJobDataSchema>;

// ============================================================================
// Lesson Content Job Schema (Stage 6+)
// ============================================================================

/**
 * Lesson content generation job - Stage 6 pipeline
 *
 * Extends BaseJobDataSchema to include common fields (organizationId, courseId,
 * userId, jobType, createdAt) required by base-handler and error-handler.
 *
 * For full type definitions of lessonSpec and ragChunks, see:
 * - lesson-specification-v2.ts (LessonSpecificationV2Schema)
 * - lesson-content.ts (RAGChunkSchema)
 *
 * This schema uses passthrough to allow the complex nested structures
 * from the canonical schema definitions while maintaining job-level validation.
 */
export const LessonContentJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.LESSON_CONTENT),
  /** Lesson specification from Stage 5 (validated by handler using canonical schema) */
  lessonSpec: z.object({
    lesson_id: z.string(),
    title: z.string(),
    sections: z.array(z.object({ title: z.string() }).passthrough()),
    metadata: z.object({}).passthrough().optional(),
  }).passthrough(),
  /** RAG chunks retrieved for this lesson (validated by handler using canonical schema) */
  ragChunks: z.array(z.object({
    chunk_id: z.string(),
    content: z.string(),
  }).passthrough()),
  /** RAG context cache ID for tracking */
  ragContextId: z.string().nullable(),
  /** Target language for content generation (ISO 639-1 code from supported set) */
  language: languageSchema.default('en'),
  /** Optional model override for fallback retry */
  modelOverride: z.string().optional(),
});

export type LessonContentJobData = z.infer<typeof LessonContentJobDataSchema>;

// ============================================================================
// Enrichment Generation Job Schema (Stage 7+)
// ============================================================================

/**
 * Enrichment generation job - Stage 7 pipeline
 *
 * Generates enrichments (audio, video, quiz, presentation, document) for lessons.
 *
 * For full type definitions of enrichment types and settings, see:
 * - enrichment-content.ts (EnrichmentContent schemas)
 * - enrichment-settings.ts (Settings schemas)
 * - lesson-enrichment.ts (LessonEnrichment schema)
 */
export const EnrichmentGenerationJobDataSchema = BaseJobDataSchema.extend({
  jobType: z.literal(JobType.ENRICHMENT_GENERATION),
  /** Enrichment record UUID */
  enrichmentId: z.string().uuid(),
  /** Enrichment type (determines handler routing) */
  enrichmentType: z.enum(['video', 'audio', 'presentation', 'quiz', 'document']),
  /** Parent lesson UUID */
  lessonId: z.string().uuid(),
  /** Type-specific generation settings (validated by handler using canonical schemas) */
  settings: z.record(z.unknown()).optional(),
  /** Optional lesson content for context */
  lessonContent: z.string().optional(),
  /** Optional model override for fallback retry */
  modelOverride: z.string().optional(),
});

export type EnrichmentGenerationJobData = z.infer<typeof EnrichmentGenerationJobDataSchema>;

// ============================================================================
// Union Type for All Jobs
// ============================================================================

/**
 * Discriminated union of all job data types
 */
export type JobData =
  | TestJobData
  | InitializeJobData
  | DocumentProcessingJobData
  | SummaryGenerationJobData
  | DocumentClassificationJobData
  | StructureAnalysisJobData
  | StructureGenerationJobData
  | TextGenerationJobData
  | LessonContentJobData
  | EnrichmentGenerationJobData
  | FinalizationJobData;

/**
 * Zod schema for validating any job data
 */
export const JobDataSchema = z.discriminatedUnion('jobType', [
  TestJobDataSchema,
  InitializeJobDataSchema,
  DocumentProcessingJobDataSchema,
  SummaryGenerationJobDataSchema,
  DocumentClassificationJobDataSchema,
  StructureAnalysisJobDataSchema,
  StructureGenerationJobDataSchema,
  TextGenerationJobDataSchema,
  LessonContentJobDataSchema,
  EnrichmentGenerationJobDataSchema,
  FinalizationJobDataSchema,
]);

// ============================================================================
// Job Options
// ============================================================================

/**
 * BullMQ job options configuration
 */
export interface JobOptions {
  /**
   * Maximum number of retry attempts
   */
  attempts?: number;

  /**
   * Backoff strategy for retries
   */
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };

  /**
   * Job priority (higher = more important)
   */
  priority?: number;

  /**
   * Delay before job execution (ms)
   */
  delay?: number;

  /**
   * Job timeout (ms)
   */
  timeout?: number;

  /**
   * Remove job on completion
   */
  removeOnComplete?: boolean | number;

  /**
   * Remove job on failure
   */
  removeOnFail?: boolean | number;
}

/**
 * Default job options per job type
 */
export const DEFAULT_JOB_OPTIONS: Record<JobType, JobOptions> = {
  [JobType.TEST_JOB]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
  [JobType.INITIALIZE]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    timeout: 30000,
    removeOnComplete: 100,
    removeOnFail: false,
  },
  [JobType.DOCUMENT_PROCESSING]: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    timeout: 300000, // 5 minutes
    removeOnComplete: 100,
    removeOnFail: false,
  },
  [JobType.SUMMARY_GENERATION]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    timeout: 120000, // 2 minutes
    removeOnComplete: 100,
    removeOnFail: false,
  },
  [JobType.DOCUMENT_CLASSIFICATION]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    timeout: 180000, // 3 minutes
    removeOnComplete: 100,
    removeOnFail: false,
  },
  [JobType.STRUCTURE_ANALYSIS]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    timeout: 180000, // 3 minutes
    removeOnComplete: 100,
    removeOnFail: false,
  },
  [JobType.STRUCTURE_GENERATION]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    timeout: 120000, // 2 minutes
    removeOnComplete: 100,
    removeOnFail: false,
  },
  [JobType.TEXT_GENERATION]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    timeout: 240000, // 4 minutes
    removeOnComplete: 100,
    removeOnFail: false,
  },
  [JobType.LESSON_CONTENT]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    timeout: 300000, // 5 minutes per lesson
    removeOnComplete: 1000,
    removeOnFail: false,
    priority: 5, // Medium priority for lesson generation
  },
  [JobType.ENRICHMENT_GENERATION]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    timeout: 300000, // 5 minutes (allows for TTS/LLM generation)
    removeOnComplete: 100,
    removeOnFail: false,
    priority: 5, // Medium priority
  },
  [JobType.FINALIZATION]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    timeout: 60000, // 1 minute
    removeOnComplete: 100,
    removeOnFail: false,
  },
};
