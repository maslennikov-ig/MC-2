/**
 * Phase 6: Document Summarization
 *
 * Generates concise summaries for documents before classification.
 * Processes each document individually and stores the summary in file_catalog.
 *
 * Core Tasks:
 * 1. Load extracted text from file_catalog.markdown_content
 * 2. Estimate token count for bypass logic (<3K tokens)
 * 3. Apply hierarchical chunking for large documents
 * 4. Validate quality with Jina embeddings (0.75 threshold)
 * 5. Store summary in file_catalog.processed_content
 * 6. Store metadata in file_catalog.summary_metadata
 *
 * Quality Assurance:
 * - Small documents (<3K tokens): Return full text for 100% fidelity
 * - Large documents: Hierarchical summarization with quality validation
 * - Quality threshold: 0.75 (75% semantic similarity)
 * - Retry escalation: Model upgrade, token increase (max 3 attempts)
 *
 * Integration:
 * - Runs AFTER Phase 5 (Embedding Generation)
 * - Runs BEFORE Phase 7 (Classification)
 * - Stores results directly in file_catalog (no job queue)
 *
 * @module stages/stage2-document-processing/phases/phase-6-summarization
 */

import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { tokenEstimator } from '../../../shared/llm/token-estimator';
import type { HierarchicalChunkingResult } from '../../../shared/summarization/hierarchical-chunking';
import type { QualityCheckResult } from '../../../shared/validation/quality-validator';
import {
  createModelConfigService,
  getEffectiveStageConfig,
  type PhaseModelConfig,
} from '../../../shared/llm/model-config-service';
import logger from '../../../shared/logger';
import { validateLocale } from '@/shared/validation';
import { DEFAULT_MODEL_ID, DEFAULT_FALLBACK_MODEL_ID } from '@megacampus/shared-types';
import {
  loadDocumentContent,
  buildEmptyResult,
  executeSummarizationAttempt,
  applyEscalation,
  generateDocumentTitle,
  storeSummary,
  storeFullText,
  detectLanguage,
  getCourseLanguage,
} from './phase-6-summarization-helpers';

/**
 * Default threshold for small document bypass (tokens)
 * Documents below this threshold are returned as-is without LLM processing
 */
const DEFAULT_NO_SUMMARY_THRESHOLD = 3000;

/**
 * Token threshold for extended tier (larger documents need more capable models)
 * NOTE: This is now calculated dynamically based on model's max context and language reserve.
 * The hardcoded value is kept as a fallback only.
 */
const EXTENDED_TIER_THRESHOLD_FALLBACK = 80000;

// ============================================================================
// EXPORTED TYPES (used by helpers)
// ============================================================================

/**
 * Result from Phase 6 summarization
 */
export interface Phase6Result {
  /** Whether summarization succeeded */
  success: boolean;
  /** File ID that was processed */
  fileId: string;
  /** Generated summary (or full text if bypassed) */
  summary: string;
  /** AI-generated document title based on content analysis */
  generatedTitle: string;
  /** Summary token count */
  summaryTokens: number;
  /** Original document token count */
  originalTokens: number;
  /** Detected language code */
  language: string;
  /** Processing method used */
  processingMethod: 'full_text' | 'hierarchical';
  /** Summary metadata */
  metadata: {
    /** Number of hierarchical iterations */
    iterations: number;
    /** Quality score (0-1) */
    qualityScore: number;
    /** Processing time in milliseconds */
    processingTimeMs: number;
    /** Total LLM input tokens consumed */
    totalInputTokens?: number;
    /** Total LLM output tokens generated */
    totalOutputTokens?: number;
    /** Compression ratio achieved */
    compressionRatio?: number;
    /** Whether quality threshold was met */
    qualityCheckPassed?: boolean;
    /** Retry attempt number (if retried) */
    retryAttempt?: number;
  };
}

/**
 * Internal summarization configuration
 */
export interface SummarizationConfig {
  model: string;
  fallbackModel: string;
  maxOutputTokens: number;
  qualityThreshold: number;
  retryAttempt: number;
}

/**
 * Result from a single summarization attempt (used by helpers)
 */
export interface SummarizationAttemptResult {
  chunkingResult: HierarchicalChunkingResult;
  qualityCheck: QualityCheckResult;
  progressBase: number;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Execute Phase 6: Document Summarization
 *
 * Processes a single document to generate a concise summary for classification.
 * Small documents (<3K tokens) are returned as-is. Large documents use
 * hierarchical chunking with quality validation.
 */
export async function executePhase6Summarization(
  courseId: string,
  fileId: string,
  organizationId: string,
  options?: {
    onProgress?: (progress: number, message: string) => void;
  }
): Promise<Phase6Result> {
  const startTime = Date.now();

  logger.info({ courseId, fileId, organizationId }, '[Phase 6] Starting document summarization');
  options?.onProgress?.(0, 'Loading document');

  // Step 1: Load document from database
  const docResult = await loadDocumentContent(courseId, fileId);
  if (!docResult) {
    return buildEmptyResult(fileId);
  }

  const { extractedText, filename } = docResult;

  // Step 2: Detect languages
  const documentLanguage = detectLanguage(extractedText);
  const supabase = getSupabaseAdmin();
  const courseLanguage = await getCourseLanguage(supabase, courseId);
  const titleLanguage = courseLanguage || documentLanguage;
  const language = documentLanguage;

  logger.info({ fileId, textLength: extractedText.length, language }, '[Phase 6] Document loaded');

  options?.onProgress?.(10, 'Estimating tokens');

  // Step 3: Estimate token count
  const estimatedTokens = tokenEstimator.estimateTokens(extractedText, language);

  logger.info(
    { fileId, estimatedTokens, bypassThreshold: DEFAULT_NO_SUMMARY_THRESHOLD },
    '[Phase 6] Token estimation complete'
  );

  // Step 4: Check if should bypass summarization (small documents)
  if (estimatedTokens < DEFAULT_NO_SUMMARY_THRESHOLD) {
    return await handleSmallDocument(
      fileId,
      extractedText,
      titleLanguage,
      estimatedTokens,
      language,
      startTime,
      options
    );
  }

  // Step 5: Execute hierarchical summarization with retry logic
  options?.onProgress?.(20, 'Generating summary');

  const modelConfig = await getModelConfigForSummarization(language, estimatedTokens);
  const config: SummarizationConfig = {
    model: modelConfig.modelId,
    fallbackModel: modelConfig.fallbackModelId || modelConfig.modelId,
    maxOutputTokens: modelConfig.maxTokens,
    qualityThreshold: 0.75,
    retryAttempt: 0,
  };

  logger.info(
    { fileId, model: config.model, fallback: config.fallbackModel, source: modelConfig.source },
    '[Phase 6] Model configuration loaded'
  );

  const result = await executeSummarizationWithRetry(
    courseId,
    fileId,
    extractedText,
    language,
    titleLanguage,
    filename,
    estimatedTokens,
    config,
    startTime,
    options
  );

  options?.onProgress?.(100, 'Summarization complete');
  return result;
}

// ============================================================================
// SMALL DOCUMENT BYPASS
// ============================================================================

/** Handle small documents by storing full text without summarization */
async function handleSmallDocument(
  fileId: string,
  extractedText: string,
  titleLanguage: string,
  estimatedTokens: number,
  language: string,
  startTime: number,
  options?: { onProgress?: (progress: number, message: string) => void }
): Promise<Phase6Result> {
  logger.info(
    { fileId, estimatedTokens, threshold: DEFAULT_NO_SUMMARY_THRESHOLD },
    '[Phase 6] Small document detected, bypassing summarization'
  );

  options?.onProgress?.(85, 'Generating document title');
  const generatedTitle = await generateDocumentTitle(extractedText, titleLanguage);

  options?.onProgress?.(90, 'Storing full text');
  const result = await storeFullText(
    fileId,
    extractedText,
    generatedTitle,
    estimatedTokens,
    language,
    Date.now() - startTime
  );

  options?.onProgress?.(100, 'Summarization complete');
  return result;
}

// ============================================================================
// SUMMARIZATION WITH RETRY
// ============================================================================

/**
 * Execute summarization with quality validation and retry logic
 */
async function executeSummarizationWithRetry(
  courseId: string,
  fileId: string,
  extractedText: string,
  language: string,
  titleLanguage: string,
  topic: string,
  originalTokens: number,
  config: SummarizationConfig,
  startTime: number,
  options?: { onProgress?: (progress: number, message: string) => void }
): Promise<Phase6Result> {
  // Load quality threshold and max retries from database config
  const { effectiveQualityThreshold, maxRetries } = await loadRetryConfig(
    fileId,
    originalTokens,
    language,
    config
  );

  let currentAttempt = 0;

  while (currentAttempt <= maxRetries) {
    try {
      const attemptResult = await executeSummarizationAttempt(
        fileId,
        extractedText,
        language,
        topic,
        config,
        currentAttempt,
        maxRetries,
        effectiveQualityThreshold,
        options
      );

      // If quality passed, store and return
      if (attemptResult.qualityCheck.quality_check_passed) {
        return await handleQualityPassed(
          fileId,
          attemptResult,
          titleLanguage,
          originalTokens,
          language,
          effectiveQualityThreshold,
          startTime,
          currentAttempt,
          options
        );
      }

      // Quality failed - check if max retries reached
      if (currentAttempt >= maxRetries) {
        return await handleMaxRetriesReached(
          courseId,
          fileId,
          attemptResult,
          titleLanguage,
          originalTokens,
          language,
          effectiveQualityThreshold,
          startTime,
          currentAttempt,
          options
        );
      }

      // Apply escalation and retry
      logger.warn(
        {
          courseId,
          fileId,
          qualityScore: attemptResult.qualityCheck.quality_score,
          currentAttempt,
        },
        '[Phase 6] Quality check failed, applying escalation'
      );
      applyEscalation(config, currentAttempt);
      currentAttempt++;
    } catch (error) {
      logger.error(
        {
          fileId,
          attempt: currentAttempt + 1,
          error: error instanceof Error ? error.message : String(error),
        },
        '[Phase 6] Summarization attempt failed'
      );

      if (currentAttempt >= maxRetries) {
        return await handleAllAttemptsFailed(
          fileId,
          extractedText,
          titleLanguage,
          originalTokens,
          language,
          startTime,
          currentAttempt,
          options
        );
      }

      applyEscalation(config, currentAttempt);
      currentAttempt++;
    }
  }

  // Should never reach here, but fallback to full text
  logger.error({ fileId }, '[Phase 6] Unexpected retry loop exit, falling back to full text');
  const fallbackTitle = await generateDocumentTitle(extractedText, titleLanguage);
  return await storeFullText(
    fileId,
    extractedText,
    fallbackTitle,
    originalTokens,
    language,
    Date.now() - startTime
  );
}

/** Load quality threshold and max retries from database config */
async function loadRetryConfig(
  fileId: string,
  originalTokens: number,
  language: string,
  config: SummarizationConfig
): Promise<{ effectiveQualityThreshold: number; maxRetries: number }> {
  const modelConfigService = createModelConfigService();
  const tier = originalTokens >= EXTENDED_TIER_THRESHOLD_FALLBACK ? 'extended' : 'standard';
  const phaseName = `stage_2_${tier}_${language}` as const;

  const DEFAULT_QUALITY_THRESHOLD = 0.75;
  const DEFAULT_MAX_RETRIES = 3;

  let effectiveQualityThreshold = config.qualityThreshold ?? DEFAULT_QUALITY_THRESHOLD;
  let maxRetries = DEFAULT_MAX_RETRIES;

  try {
    const phaseConfig = await modelConfigService.getModelForPhase(phaseName);
    const effectiveConfig = getEffectiveStageConfig(phaseConfig);
    effectiveQualityThreshold = effectiveConfig.qualityThreshold;
    maxRetries = effectiveConfig.maxRetries;

    logger.info(
      {
        fileId,
        phaseName,
        qualityThreshold: effectiveQualityThreshold,
        maxRetries,
        source: phaseConfig.source,
      },
      '[Phase 6] Using database-driven config values'
    );
  } catch (error) {
    logger.warn(
      {
        fileId,
        phaseName,
        error: error instanceof Error ? error.message : String(error),
        fallbackQualityThreshold: effectiveQualityThreshold,
        fallbackMaxRetries: maxRetries,
      },
      '[Phase 6] Failed to load phase config, using hardcoded defaults'
    );
  }

  return { effectiveQualityThreshold, maxRetries };
}

/** Handle successful quality validation - store summary and return */
async function handleQualityPassed(
  fileId: string,
  attemptResult: SummarizationAttemptResult,
  titleLanguage: string,
  originalTokens: number,
  language: string,
  qualityThreshold: number,
  startTime: number,
  currentAttempt: number,
  options?: { onProgress?: (progress: number, message: string) => void }
): Promise<Phase6Result> {
  const { chunkingResult, qualityCheck, progressBase } = attemptResult;

  options?.onProgress?.(progressBase + 12, 'Generating document title');
  const generatedTitle = await generateDocumentTitle(chunkingResult.summary, titleLanguage);

  options?.onProgress?.(progressBase + 15, 'Storing summary');
  const result = await storeSummary(
    fileId,
    chunkingResult.summary,
    generatedTitle,
    originalTokens,
    chunkingResult.metadata.final_token_count,
    language,
    chunkingResult.iterations,
    qualityCheck.quality_score,
    Date.now() - startTime,
    qualityThreshold,
    chunkingResult.totalInputTokens,
    chunkingResult.totalOutputTokens,
    currentAttempt
  );

  logger.info(
    {
      fileId,
      generatedTitle,
      qualityScore: qualityCheck.quality_score,
      attempts: currentAttempt + 1,
    },
    '[Phase 6] Summary stored successfully'
  );

  return result;
}

/** Handle max retries reached - store best-effort summary */
async function handleMaxRetriesReached(
  courseId: string,
  fileId: string,
  attemptResult: SummarizationAttemptResult,
  titleLanguage: string,
  originalTokens: number,
  language: string,
  qualityThreshold: number,
  startTime: number,
  currentAttempt: number,
  options?: { onProgress?: (progress: number, message: string) => void }
): Promise<Phase6Result> {
  const { chunkingResult, qualityCheck, progressBase } = attemptResult;

  logger.warn(
    { courseId, fileId, qualityScore: qualityCheck.quality_score, attempts: currentAttempt + 1 },
    '[Phase 6] Max retries reached, using best-effort summary'
  );

  options?.onProgress?.(progressBase + 12, 'Generating document title');
  const generatedTitle = await generateDocumentTitle(chunkingResult.summary, titleLanguage);

  options?.onProgress?.(progressBase + 15, 'Storing best-effort summary');
  return await storeSummary(
    fileId,
    chunkingResult.summary,
    generatedTitle,
    originalTokens,
    chunkingResult.metadata.final_token_count,
    language,
    chunkingResult.iterations,
    qualityCheck.quality_score,
    Date.now() - startTime,
    qualityThreshold,
    chunkingResult.totalInputTokens,
    chunkingResult.totalOutputTokens,
    currentAttempt
  );
}

/** Handle all attempts failed - fall back to full text */
async function handleAllAttemptsFailed(
  fileId: string,
  extractedText: string,
  titleLanguage: string,
  originalTokens: number,
  language: string,
  startTime: number,
  currentAttempt: number,
  options?: { onProgress?: (progress: number, message: string) => void }
): Promise<Phase6Result> {
  logger.error(
    { fileId, attempts: currentAttempt + 1 },
    '[Phase 6] All attempts failed, falling back to full text'
  );

  options?.onProgress?.(85, 'Generating document title');
  const generatedTitle = await generateDocumentTitle(extractedText, titleLanguage);

  options?.onProgress?.(90, 'Storing full text (fallback)');
  return await storeFullText(
    fileId,
    extractedText,
    generatedTitle,
    originalTokens,
    language,
    Date.now() - startTime
  );
}

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

/** Extended model config with fallback model ID */
type ExtendedPhaseModelConfig = PhaseModelConfig;

/**
 * Get model configuration for summarization based on language and token count
 */
async function getModelConfigForSummarization(
  language: string,
  tokenCount: number
): Promise<ExtendedPhaseModelConfig> {
  const modelConfigService = createModelConfigService();
  const langCode = validateLocale(language);

  // Calculate dynamic threshold based on model's max context and language reserve
  const assumedMaxContext = 128000;
  let dynamicThreshold: number;

  try {
    dynamicThreshold = await modelConfigService.calculateDynamicThreshold(
      assumedMaxContext,
      langCode
    );
    logger.debug(
      { language, tokenCount, maxContext: assumedMaxContext, dynamicThreshold },
      '[Phase 6] Dynamic threshold calculated'
    );
  } catch (err) {
    logger.warn(
      { err, language },
      '[Phase 6] Failed to calculate dynamic threshold, using fallback'
    );
    dynamicThreshold = EXTENDED_TIER_THRESHOLD_FALLBACK;
  }

  const tier = tokenCount >= dynamicThreshold ? 'extended' : 'standard';
  const finalPhaseName = `stage_2_${tier}_${langCode}` as const;

  logger.debug(
    { language, tokenCount, dynamicThreshold, tier, phaseName: finalPhaseName },
    '[Phase 6] Determining model configuration'
  );

  try {
    const config = await modelConfigService.getModelForPhase(finalPhaseName);

    // Also fetch fallback model from emergency config if needed
    let fallbackModelId = DEFAULT_FALLBACK_MODEL_ID;
    try {
      const emergencyConfig = await modelConfigService.getModelForPhase('emergency');
      fallbackModelId = emergencyConfig.modelId;
    } catch (emergencyError) {
      logger.warn(
        {
          error: emergencyError instanceof Error ? emergencyError.message : String(emergencyError),
        },
        '[Phase 6] Failed to get emergency config, using hardcoded fallback'
      );
    }

    return { ...config, fallbackModelId };
  } catch (configError) {
    logger.warn(
      {
        phaseName: finalPhaseName,
        tier,
        language: langCode,
        error: configError instanceof Error ? configError.message : String(configError),
      },
      '[Phase 6] Failed to get model config from database, using hardcoded defaults'
    );

    return {
      modelId: DEFAULT_MODEL_ID,
      fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
      temperature: 0.7,
      maxTokens: 8192,
      maxContextTokens: tier === 'extended' ? 200000 : 128000,
      qualityThreshold: 0.75,
      maxRetries: 3,
      timeoutMs: null,
      cacheReadEnabled: false,
      tier,
      source: 'hardcoded' as const,
    };
  }
}
