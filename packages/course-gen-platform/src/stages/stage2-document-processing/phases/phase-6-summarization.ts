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
import { llmClient } from '../../../shared/llm/client';
import { hierarchicalChunking, type HierarchicalChunkingResult } from '../../../shared/summarization/hierarchical-chunking';
import {
  validateSummaryQuality,
  type QualityCheckResult,
} from '../../../shared/validation/quality-validator';
import { createModelConfigService, getEffectiveStageConfig, type PhaseModelConfig } from '../../../shared/llm/model-config-service';
import logger from '../../../shared/logger';

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

/**
 * Default summarization configuration
 */
const DEFAULT_SUMMARIZATION_CONFIG = {
  targetTokens: 200000,
  maxIterations: 5,
  chunkSize: 115000,
  overlapPercent: 5,
  temperature: 0.7,
  maxTokensPerChunk: 10000,
} as const;

/**
 * Title generation prompts by language
 */
const TITLE_GENERATION_PROMPTS: Record<string, string> = {
  rus: `Ты эксперт по анализу документов. На основе предоставленного текста сгенерируй краткое и информативное название документа.

Требования к названию:
- 5-10 слов максимум
- Отражает основную тему/содержание
- Профессиональный стиль
- Без кавычек и специальных символов
- На русском языке

Верни ТОЛЬКО название, без пояснений.`,

  eng: `You are a document analysis expert. Based on the provided text, generate a concise and informative document title.

Title requirements:
- 5-10 words maximum
- Reflects the main topic/content
- Professional style
- No quotes or special characters
- In English

Return ONLY the title, no explanations.`,
};

/**
 * Default model for lightweight title generation
 * Uses fast, cheap model since title extraction is simple
 */
const TITLE_GENERATION_MODEL = 'google/gemini-2.0-flash-001';

/**
 * Generate a meaningful document title from summary or full text
 *
 * @param text - Summary or document text to analyze
 * @param language - Language code ('rus' or 'eng')
 * @param model - Optional model override
 * @returns Generated title or fallback from first line
 */
async function generateDocumentTitle(
  text: string,
  language: string,
  model: string = TITLE_GENERATION_MODEL
): Promise<string> {
  // Use first 2000 chars for title generation (enough context, minimal tokens)
  const textForTitle = text.slice(0, 2000);

  // Language-specific prompt
  const langKey = language === 'rus' || language === 'ru' ? 'rus' : 'eng';
  const systemPrompt = TITLE_GENERATION_PROMPTS[langKey];

  try {
    const response = await llmClient.generateCompletion(textForTitle, {
      model,
      systemPrompt,
      maxTokens: 50, // Title should be very short
      temperature: 0.3, // Low temperature for consistency
    });

    const generatedTitle = response.content.trim()
      // Remove any quotes that might wrap the title
      .replace(/^["'«»]|["'«»]$/g, '')
      // Remove any "Title:" prefix the model might add
      .replace(/^(Title|Название|Заголовок):\s*/i, '')
      .trim();

    if (generatedTitle && generatedTitle.length >= 3 && generatedTitle.length <= 200) {
      logger.debug({
        textLength: textForTitle.length,
        generatedTitle,
        language: langKey,
      }, '[Phase 6] Document title generated');
      return generatedTitle;
    }

    // Fallback: extract from first line if generation failed
    return extractTitleFromText(text, language);
  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
      language: langKey,
    }, '[Phase 6] Title generation failed, using fallback');

    return extractTitleFromText(text, language);
  }
}

/**
 * Fallback title extraction from text
 * Uses first meaningful line or sentence
 */
function extractTitleFromText(text: string, language: string): string {
  // Split into lines and find first non-empty, non-header line
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      // Skip markdown headers but keep their content
      if (line.startsWith('#')) {
        return line.replace(/^#+\s*/, '').length > 3;
      }
      return line.length > 3;
    });

  if (lines.length === 0) {
    return language === 'rus' ? 'Документ без названия' : 'Untitled Document';
  }

  // Get first meaningful line, strip markdown
  let title = lines[0].replace(/^#+\s*/, '').trim();

  // Truncate if too long
  if (title.length > 100) {
    title = title.slice(0, 97) + '...';
  }

  return title;
}

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
interface SummarizationConfig {
  model: string;
  fallbackModel: string;
  maxOutputTokens: number;
  qualityThreshold: number;
  retryAttempt: number;
}

/**
 * Execute Phase 6: Document Summarization
 *
 * Processes a single document to generate a concise summary for classification.
 * Small documents (<3K tokens) are returned as-is. Large documents use
 * hierarchical chunking with quality validation.
 *
 * @param courseId - Course ID (for logging)
 * @param fileId - File ID to process
 * @param organizationId - Organization ID (for logging)
 * @param options - Optional configuration
 * @returns Phase 6 result with summary and metadata
 *
 * @example
 * ```typescript
 * const result = await executePhase6Summarization(
 *   courseId,
 *   fileId,
 *   organizationId,
 *   {
 *     onProgress: (progress, message) => {
 *       console.log(`${progress}%: ${message}`);
 *     }
 *   }
 * );
 *
 * console.log(`Summary: ${result.summary.slice(0, 200)}...`);
 * console.log(`Quality: ${result.metadata.qualityScore}`);
 * console.log(`Method: ${result.processingMethod}`);
 * ```
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

  logger.info({
    courseId,
    fileId,
    organizationId,
  }, '[Phase 6] Starting document summarization');

  options?.onProgress?.(0, 'Loading document');

  // Step 1: Load document from database
  const supabase = getSupabaseAdmin();
  const { data: fileData, error: fetchError } = await supabase
    .from('file_catalog')
    .select('markdown_content, filename, mime_type')
    .eq('id', fileId)
    .single();

  if (fetchError || !fileData) {
    logger.error({ fileId, error: fetchError }, '[Phase 6] Failed to load document');
    throw new Error(`Failed to load document: ${fetchError?.message || 'File not found'}`);
  }

  const extractedText = fileData.markdown_content || '';
  if (!extractedText) {
    logger.warn({ fileId }, '[Phase 6] Document has no markdown content, skipping');
    return buildEmptyResult(fileId);
  }

  // Step 2: Detect language (simple heuristic - can be improved)
  const language = detectLanguage(extractedText);

  logger.info({
    fileId,
    textLength: extractedText.length,
    language,
  }, '[Phase 6] Document loaded');

  options?.onProgress?.(10, 'Estimating tokens');

  // Step 3: Estimate token count
  const estimatedTokens = tokenEstimator.estimateTokens(extractedText, language);

  logger.info({
    fileId,
    estimatedTokens,
    bypassThreshold: DEFAULT_NO_SUMMARY_THRESHOLD,
  }, '[Phase 6] Token estimation complete');

  // Step 4: Check if should bypass summarization (small documents)
  if (estimatedTokens < DEFAULT_NO_SUMMARY_THRESHOLD) {
    logger.info({
      fileId,
      estimatedTokens,
      threshold: DEFAULT_NO_SUMMARY_THRESHOLD,
    }, '[Phase 6] Small document detected, bypassing summarization');

    options?.onProgress?.(85, 'Generating document title');

    // Generate title even for small documents
    const generatedTitle = await generateDocumentTitle(extractedText, language);

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

  // Step 5: Execute hierarchical summarization with retry logic
  options?.onProgress?.(20, 'Generating summary');

  // Determine model configuration from database based on language and token count
  const modelConfig = await getModelConfigForSummarization(language, estimatedTokens);

  const config: SummarizationConfig = {
    model: modelConfig.modelId,
    fallbackModel: modelConfig.fallbackModelId || modelConfig.modelId,
    maxOutputTokens: modelConfig.maxTokens,
    qualityThreshold: 0.75, // Default, will be overridden by database value in retry function
    retryAttempt: 0,
  };

  logger.info({
    fileId,
    model: config.model,
    fallback: config.fallbackModel,
    source: modelConfig.source,
  }, '[Phase 6] Model configuration loaded');

  const result = await executeSummarizationWithRetry(
    fileId,
    extractedText,
    language,
    fileData.filename || 'Unknown document',
    estimatedTokens,
    config,
    startTime,
    options
  );

  options?.onProgress?.(100, 'Summarization complete');

  return result;
}

/**
 * Execute summarization with quality validation and retry logic
 */
async function executeSummarizationWithRetry(
  fileId: string,
  extractedText: string,
  language: string,
  topic: string,
  originalTokens: number,
  config: SummarizationConfig,
  startTime: number,
  options?: {
    onProgress?: (progress: number, message: string) => void;
  }
): Promise<Phase6Result> {
  // Get quality threshold and max retries from model config
  // Determine phase name based on language and tier (matches model selection logic)
  const modelConfigService = createModelConfigService();
  const tier = originalTokens >= EXTENDED_TIER_THRESHOLD_FALLBACK ? 'extended' : 'standard';
  const phaseName = `stage_2_${tier}_${language}` as const;

  // Explicit default values (fallback when DB unavailable)
  const DEFAULT_QUALITY_THRESHOLD = 0.75;
  const DEFAULT_MAX_RETRIES = 3;

  // Initialize with defaults
  let effectiveQualityThreshold = config.qualityThreshold ?? DEFAULT_QUALITY_THRESHOLD;
  let maxRetries = DEFAULT_MAX_RETRIES;

  try {
    const phaseConfig = await modelConfigService.getModelForPhase(phaseName);
    const effectiveConfig = getEffectiveStageConfig(phaseConfig);

    effectiveQualityThreshold = effectiveConfig.qualityThreshold;
    maxRetries = effectiveConfig.maxRetries;

    logger.info({
      fileId,
      phaseName,
      qualityThreshold: effectiveQualityThreshold,
      maxRetries,
      source: phaseConfig.source,
    }, '[Phase 6] Using database-driven config values');
  } catch (error) {
    logger.warn({
      fileId,
      phaseName,
      error: error instanceof Error ? error.message : String(error),
      fallbackQualityThreshold: effectiveQualityThreshold,
      fallbackMaxRetries: maxRetries,
    }, '[Phase 6] Failed to load phase config, using hardcoded defaults');
  }

  let currentAttempt = 0;

  while (currentAttempt <= maxRetries) {
    try {
      logger.info({
        fileId,
        attempt: currentAttempt + 1,
        maxAttempts: maxRetries + 1,
        model: config.model,
      }, '[Phase 6] Executing summarization attempt');

      // Execute hierarchical chunking
      const progressBase = 20 + (currentAttempt * 20);
      options?.onProgress?.(progressBase, `Summarizing (attempt ${currentAttempt + 1})`);

      const chunkingResult: HierarchicalChunkingResult = await hierarchicalChunking(
        extractedText,
        language,
        topic,
        {
          targetTokens: config.maxOutputTokens,
          maxIterations: DEFAULT_SUMMARIZATION_CONFIG.maxIterations,
          chunkSize: DEFAULT_SUMMARIZATION_CONFIG.chunkSize,
          overlapPercent: DEFAULT_SUMMARIZATION_CONFIG.overlapPercent,
          model: config.model,
          temperature: DEFAULT_SUMMARIZATION_CONFIG.temperature,
          maxTokensPerChunk: DEFAULT_SUMMARIZATION_CONFIG.maxTokensPerChunk,
        }
      );

      logger.info({
        fileId,
        iterations: chunkingResult.iterations,
        totalInputTokens: chunkingResult.totalInputTokens,
        totalOutputTokens: chunkingResult.totalOutputTokens,
        finalTokenCount: chunkingResult.metadata.final_token_count,
      }, '[Phase 6] Summarization complete');

      // Validate quality
      options?.onProgress?.(progressBase + 10, 'Validating quality');

      const qualityCheck: QualityCheckResult = await validateSummaryQuality(
        extractedText,
        chunkingResult.summary,
        { threshold: effectiveQualityThreshold }
      );

      logger.info({
        fileId,
        qualityScore: qualityCheck.quality_score,
        passed: qualityCheck.quality_check_passed,
        threshold: effectiveQualityThreshold,
      }, '[Phase 6] Quality validation complete');

      // If quality passed, store and return
      if (qualityCheck.quality_check_passed) {
        options?.onProgress?.(progressBase + 12, 'Generating document title');

        // Generate title from summary (uses less tokens than full text)
        const generatedTitle = await generateDocumentTitle(chunkingResult.summary, language);

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
          effectiveQualityThreshold,
          chunkingResult.totalInputTokens,
          chunkingResult.totalOutputTokens,
          currentAttempt
        );

        logger.info({
          fileId,
          generatedTitle,
          qualityScore: qualityCheck.quality_score,
          attempts: currentAttempt + 1,
        }, '[Phase 6] Summary stored successfully');

        return result;
      }

      // Quality failed - determine if should retry
      if (currentAttempt >= maxRetries) {
        logger.warn({
          fileId,
          qualityScore: qualityCheck.quality_score,
          attempts: currentAttempt + 1,
        }, '[Phase 6] Max retries reached, using best-effort summary');

        // Generate title even for best-effort summary
        options?.onProgress?.(progressBase + 12, 'Generating document title');
        const generatedTitle = await generateDocumentTitle(chunkingResult.summary, language);

        // Store best-effort summary
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
          effectiveQualityThreshold,
          chunkingResult.totalInputTokens,
          chunkingResult.totalOutputTokens,
          currentAttempt
        );
      }

      // Apply escalation and retry
      logger.warn({
        fileId,
        qualityScore: qualityCheck.quality_score,
        currentAttempt,
      }, '[Phase 6] Quality check failed, applying escalation');

      applyEscalation(config, currentAttempt);
      currentAttempt++;

    } catch (error) {
      logger.error({
        fileId,
        attempt: currentAttempt + 1,
        error: error instanceof Error ? error.message : String(error),
      }, '[Phase 6] Summarization attempt failed');

      // If max retries reached, fall back to full text
      if (currentAttempt >= maxRetries) {
        logger.error({
          fileId,
          attempts: currentAttempt + 1,
        }, '[Phase 6] All attempts failed, falling back to full text');

        options?.onProgress?.(85, 'Generating document title');
        const generatedTitle = await generateDocumentTitle(extractedText, language);

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

      applyEscalation(config, currentAttempt);
      currentAttempt++;
    }
  }

  // Should never reach here, but fallback to full text
  logger.error({ fileId }, '[Phase 6] Unexpected retry loop exit, falling back to full text');
  const fallbackTitle = await generateDocumentTitle(extractedText, language);
  return await storeFullText(
    fileId,
    extractedText,
    fallbackTitle,
    originalTokens,
    language,
    Date.now() - startTime
  );
}

/**
 * Apply escalation strategy for retry
 *
 * Escalation path:
 * 1. Retry 1: Switch to fallback model from database config
 * 2. Retry 2: Increase output tokens by 25%
 * 3. Retry 3: Further increase output tokens by 25%
 */
function applyEscalation(config: SummarizationConfig, retryAttempt: number): void {
  config.retryAttempt = retryAttempt + 1;

  // Retry 1: Switch to fallback model
  if (retryAttempt === 0 && config.fallbackModel !== config.model) {
    const previousModel = config.model;
    config.model = config.fallbackModel;
    logger.info({
      previousModel,
      newModel: config.model,
    }, '[Phase 6] Escalation: Switching to fallback model');
  }

  // Retry 2: Increase output tokens by 25%
  if (retryAttempt === 1) {
    const previousTokens = config.maxOutputTokens;
    config.maxOutputTokens = Math.ceil(config.maxOutputTokens * 1.25);
    logger.info({
      previousTokens,
      newMaxTokens: config.maxOutputTokens,
    }, '[Phase 6] Escalation: Increasing token budget (+25%)');
  }

  // Retry 3: Further increase output tokens by 25%
  if (retryAttempt === 2) {
    const previousTokens = config.maxOutputTokens;
    config.maxOutputTokens = Math.ceil(config.maxOutputTokens * 1.25);
    logger.info({
      previousTokens,
      newMaxTokens: config.maxOutputTokens,
    }, '[Phase 6] Escalation: Increasing token budget further (+25%)');
  }
}

/**
 * Store summarization result in database
 */
async function storeSummary(
  fileId: string,
  summary: string,
  generatedTitle: string,
  originalTokens: number,
  summaryTokens: number,
  language: string,
  iterations: number,
  qualityScore: number,
  processingTimeMs: number,
  qualityThreshold: number,
  totalInputTokens?: number,
  totalOutputTokens?: number,
  retryAttempt?: number
): Promise<Phase6Result> {
  const supabase = getSupabaseAdmin();

  const compressionRatio = originalTokens > 0 ? summaryTokens / originalTokens : 1;

  const metadata = {
    summary_tokens: summaryTokens,
    original_tokens: originalTokens,
    language: language,
    quality_score: qualityScore,
    processing_time_ms: processingTimeMs,
    iterations: iterations,
    compression_ratio: compressionRatio,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    quality_check_passed: qualityScore >= qualityThreshold,
    retry_attempt: retryAttempt,
    processing_method: 'hierarchical' as const,
  };

  const { error } = await supabase
    .from('file_catalog')
    .update({
      processed_content: summary,
      generated_title: generatedTitle,
      processing_method: 'hierarchical',
      summary_metadata: metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fileId);

  if (error) {
    logger.error({ fileId, error }, '[Phase 6] Failed to store summary');
    throw new Error(`Failed to store summary: ${error.message}`);
  }

  logger.info({
    fileId,
    generatedTitle,
    summaryLength: summary.length,
    compressionRatio: compressionRatio.toFixed(2),
  }, '[Phase 6] Summary stored in database');

  return {
    success: true,
    fileId,
    summary,
    generatedTitle,
    summaryTokens,
    originalTokens,
    language,
    processingMethod: 'hierarchical',
    metadata: {
      iterations,
      qualityScore,
      processingTimeMs,
      totalInputTokens,
      totalOutputTokens,
      compressionRatio,
      qualityCheckPassed: qualityScore >= qualityThreshold,
      retryAttempt,
    },
  };
}

/**
 * Store full text (bypass summarization for small documents)
 */
async function storeFullText(
  fileId: string,
  fullText: string,
  generatedTitle: string,
  estimatedTokens: number,
  language: string,
  processingTimeMs: number
): Promise<Phase6Result> {
  const supabase = getSupabaseAdmin();

  const metadata = {
    summary_tokens: estimatedTokens,
    original_tokens: estimatedTokens,
    language: language,
    quality_score: 1.0, // Full text = 100% fidelity
    processing_time_ms: processingTimeMs,
    iterations: 0,
    compression_ratio: 1.0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    quality_check_passed: true,
    processing_method: 'full_text' as const,
  };

  const { error } = await supabase
    .from('file_catalog')
    .update({
      processed_content: fullText,
      generated_title: generatedTitle,
      processing_method: 'full_text',
      summary_metadata: metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fileId);

  if (error) {
    logger.error({ fileId, error }, '[Phase 6] Failed to store full text');
    throw new Error(`Failed to store full text: ${error.message}`);
  }

  logger.info({
    fileId,
    generatedTitle,
    textLength: fullText.length,
    estimatedTokens,
  }, '[Phase 6] Full text stored (bypass)');

  return {
    success: true,
    fileId,
    summary: fullText,
    generatedTitle,
    summaryTokens: estimatedTokens,
    originalTokens: estimatedTokens,
    language,
    processingMethod: 'full_text',
    metadata: {
      iterations: 0,
      qualityScore: 1.0,
      processingTimeMs,
      compressionRatio: 1.0,
      qualityCheckPassed: true,
    },
  };
}

/**
 * Build empty result for documents with no content
 */
function buildEmptyResult(fileId: string): Phase6Result {
  return {
    success: false,
    fileId,
    summary: '',
    generatedTitle: '',
    summaryTokens: 0,
    originalTokens: 0,
    language: 'unknown',
    processingMethod: 'full_text',
    metadata: {
      iterations: 0,
      qualityScore: 0,
      processingTimeMs: 0,
    },
  };
}

/**
 * Detect document language using simple heuristic
 *
 * Checks for Cyrillic characters to detect Russian.
 * Falls back to English if no Cyrillic found.
 *
 * @param text - Text to analyze
 * @returns Language code ('ru' or 'en') in ISO 639-1 format
 */
function detectLanguage(text: string): 'ru' | 'en' {
  // Simple heuristic: check for Cyrillic characters
  const cyrillicPattern = /[\u0400-\u04FF]/;
  const hasCyrillic = cyrillicPattern.test(text.slice(0, 1000)); // Check first 1000 chars

  return hasCyrillic ? 'ru' : 'en';
}

/**
 * Extended model config with fallback model ID
 * Note: PhaseModelConfig now includes fallbackModelId, qualityThreshold, maxRetries, timeoutMs
 */
type ExtendedPhaseModelConfig = PhaseModelConfig;

/**
 * Get model configuration for summarization based on language and token count
 *
 * Determines the appropriate phase name and fetches configuration from database.
 * Uses dynamic tier-based selection with language-specific context reserves:
 * - Calculates dynamic threshold based on model's max context and language reserve
 * - Standard tier: < dynamic threshold
 * - Extended tier: >= dynamic threshold (needs more capable models)
 *
 * Example: 128K model with EN (15% reserve) → 109K threshold
 *
 * @param language - Document language ('ru' or 'en')
 * @param tokenCount - Estimated token count
 * @returns Model configuration with primary and fallback models
 */
async function getModelConfigForSummarization(
  language: string,
  tokenCount: number
): Promise<ExtendedPhaseModelConfig> {
  const modelConfigService = createModelConfigService();

  // Language is now 'ru' or 'en' directly (ISO 639-1 format)
  const langCode = language as 'ru' | 'en';

  // Calculate dynamic threshold based on model's max context and language reserve
  // Standard tier models in llm_model_config have max_context_tokens = 128000
  // This matches database values. If model configs change, update this value.
  // See: SELECT max_context_tokens FROM llm_model_config WHERE context_tier = 'standard'
  const assumedMaxContext = 128000;
  let dynamicThreshold: number;

  try {
    dynamicThreshold = await modelConfigService.calculateDynamicThreshold(
      assumedMaxContext,
      langCode
    );
    logger.debug({
      language,
      tokenCount,
      maxContext: assumedMaxContext,
      dynamicThreshold,
    }, '[Phase 6] Dynamic threshold calculated');
  } catch (err) {
    // Fallback to hardcoded threshold if dynamic calculation fails
    logger.warn(
      { err, language },
      '[Phase 6] Failed to calculate dynamic threshold, using fallback'
    );
    dynamicThreshold = EXTENDED_TIER_THRESHOLD_FALLBACK;
  }

  // Determine tier based on dynamic threshold
  const tier = tokenCount >= dynamicThreshold ? 'extended' : 'standard';

  // Construct phase name (e.g., 'stage_2_standard_ru', 'stage_2_extended_en')
  const finalPhaseName = `stage_2_${tier}_${langCode}` as const;

  logger.debug({
    language,
    tokenCount,
    dynamicThreshold,
    tier,
    phaseName: finalPhaseName,
  }, '[Phase 6] Determining model configuration');

  // Fetch config from database with fallback to hardcoded
  const config = await modelConfigService.getModelForPhase(finalPhaseName);

  // Also fetch fallback model from emergency config if needed
  const emergencyConfig = await modelConfigService.getModelForPhase('emergency');

  return {
    ...config,
    fallbackModelId: emergencyConfig.modelId,
  };
}
