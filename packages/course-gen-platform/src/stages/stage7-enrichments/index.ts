/**
 * Stage 7 Lesson Enrichments
 * @module stages/stage7-enrichments
 *
 * BullMQ worker infrastructure for generating lesson enrichments.
 *
 * AUTO-GENERATED (Pipeline):
 * - Cover images (1280x720, 16:9) - triggered after Stage 5
 * - Card thumbnails (1024x1024, 1:1) - triggered after Stage 5/6
 *
 * ON-DEMAND (User-initiated from UI):
 * - Quiz (single-stage)
 * - Audio narration (single-stage)
 * - Presentation slides (two-stage: draft -> final)
 * - Video (two-stage: script -> final, not yet implemented)
 * - Banner (decorative headers)
 * - Document (single-stage)
 *
 * @see AUTO_GENERATED_ENRICHMENT_TYPES and ON_DEMAND_ENRICHMENT_TYPES in config
 * @see auto-card-trigger.ts for pipeline integration
 * @see packages/web/app/api/enrichments/generate/route.ts for on-demand API
 */

// Configuration
export {
  STAGE7_CONFIG,
  STORAGE_CONFIG,
  MODEL_CONFIG,
  AUDIO_CONFIG,
  AUTO_GENERATED_ENRICHMENT_TYPES,
  ON_DEMAND_ENRICHMENT_TYPES,
} from './config';

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
