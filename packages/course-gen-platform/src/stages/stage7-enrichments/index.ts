/**
 * Stage 7 Lesson Enrichments
 * @module stages/stage7-enrichments
 *
 * BullMQ worker infrastructure for generating lesson enrichments:
 * - Quiz (single-stage)
 * - Audio narration (single-stage)
 * - Presentation slides (two-stage: draft -> final)
 * - Video (two-stage: script -> final)
 * - Document (single-stage)
 */

// Configuration
export { STAGE7_CONFIG, STORAGE_CONFIG, MODEL_CONFIG, AUDIO_CONFIG } from './config';

// Types
export type {
  Stage7JobInput,
  Stage7JobResult,
  Stage7ProgressUpdate,
  EnrichmentWithContext,
  EnrichmentHandlerInput,
  DraftResult,
  GenerateResult,
  ModelConfig,
} from './types';

// Factory (Worker and Queue creation)
export {
  createStage7Worker,
  createStage7Queue,
  gracefulShutdown,
  addEnrichmentJob,
  getQueueStats,
} from './factory';

// Job Processor
export { processStage7Job } from './services/job-processor';

// Database Service
export {
  getEnrichment,
  updateEnrichmentStatus,
  saveEnrichmentContent,
  saveDraftContent,
  linkEnrichmentAsset,
  incrementGenerationAttempt,
  getLessonContent,
} from './services/database-service';

// Storage Service
export {
  uploadEnrichmentAsset,
  getSignedUrl,
  deleteEnrichmentAsset,
  assetExists,
  getAssetMetadata,
  buildAssetPath,
} from './services/storage-service';

// Enrichment Router
export {
  routeEnrichment,
  isTwoStageEnrichment,
  getRegisteredTypes,
} from './services/enrichment-router';
export type { EnrichmentHandler } from './services/enrichment-router';

// Retry Strategy
export {
  shouldRetry,
  getRetryDelay,
  getFallbackModel,
  getModelForAttempt,
  categorizeError,
  isRetryableError,
  requiresModelFallback,
  formatErrorForLogging,
} from './retry-strategy';
export type { RetryContext, ErrorCategory } from './retry-strategy';
