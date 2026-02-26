/**
 * Phase 6: Document Summarization - Helper Functions
 *
 * Extracted from phase-6-summarization.ts to reduce function complexity and line count.
 * Contains:
 * - Document loading and empty content handling
 * - Summarization attempt execution
 * - Quality validation and retry decision logic
 * - Title generation (LLM + fallback)
 * - Database storage (summary + full text)
 * - Language detection and course language lookup
 *
 * @module stages/stage2-document-processing/phases/phase-6-summarization-helpers
 */

import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { cacheFileProcessedContent } from '../../../shared/cache/file-content-cache';
import {
  hierarchicalChunking,
  type HierarchicalChunkingResult,
} from '../../../shared/summarization/hierarchical-chunking';
import {
  validateSummaryQuality,
  type QualityCheckResult,
} from '../../../shared/validation/quality-validator';
import { llmClient } from '../../../shared/llm/client';
import logger from '../../../shared/logger';
import type {
  Phase6Result,
  SummarizationConfig,
  SummarizationAttemptResult,
} from './phase-6-summarization';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default summarization parameters */
export const DEFAULT_SUMMARIZATION_CONFIG = {
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
const TITLE_GENERATION_MODEL = 'google/gemini-3-flash-preview';

// ============================================================================
// DOCUMENT LOADING
// ============================================================================

/**
 * Load document from database and handle empty content case.
 * Returns null if document has no content (empty fallback stored to DB).
 */
export async function loadDocumentContent(
  courseId: string,
  fileId: string
): Promise<{ extractedText: string; filename: string } | null> {
  const supabase = getSupabaseAdmin();
  const { data: fileData, error: fetchError } = await supabase
    .from('file_catalog')
    .select('markdown_content, filename, mime_type')
    .eq('id', fileId)
    .single();

  if (fetchError || !fileData) {
    logger.error({ courseId, fileId, error: fetchError }, '[Phase 6] Failed to load document');
    throw new Error(`Failed to load document: ${fetchError?.message || 'File not found'}`);
  }

  const extractedText = fileData.markdown_content || '';
  if (!extractedText) {
    logger.warn(
      { courseId, fileId },
      '[Phase 6] Document has no markdown content, storing empty fallback'
    );
    await storeEmptyFallback(supabase, courseId, fileId);
    return null;
  }

  return { extractedText, filename: fileData.filename || 'Unknown document' };
}

/** Store empty fallback to prevent Stage 4 barrier blocking */
async function storeEmptyFallback(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  courseId: string,
  fileId: string
): Promise<void> {
  const emptyFallbackMetadata = {
    error: 'no_markdown_content',
    fallback_reason: 'empty_content',
    quality_score: 0,
  };

  const { error: updateError } = await supabase
    .from('file_catalog')
    .update({
      processed_content: '[NO CONTENT]',
      processing_method: 'full_text',
      summary_metadata: { ...emptyFallbackMetadata, is_fallback: true },
      updated_at: new Date().toISOString(),
    })
    .eq('id', fileId);

  if (updateError) {
    logger.error(
      { courseId, fileId, error: updateError.message },
      '[Phase 6] Failed to store empty fallback'
    );
  } else {
    logger.info(
      { courseId, fileId },
      '[Phase 6] Stored empty fallback for document without content'
    );
  }
}

// ============================================================================
// SUMMARIZATION ATTEMPT
// ============================================================================

/**
 * Execute a single summarization attempt with hierarchical chunking and quality validation.
 */
export async function executeSummarizationAttempt(
  fileId: string,
  extractedText: string,
  language: string,
  topic: string,
  config: SummarizationConfig,
  currentAttempt: number,
  maxRetries: number,
  effectiveQualityThreshold: number,
  options?: { onProgress?: (progress: number, message: string) => void }
): Promise<SummarizationAttemptResult> {
  logger.info(
    {
      fileId,
      attempt: currentAttempt + 1,
      maxAttempts: maxRetries + 1,
      model: config.model,
    },
    '[Phase 6] Executing summarization attempt'
  );

  // Execute hierarchical chunking
  const progressBase = 20 + currentAttempt * 20;
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

  logger.info(
    {
      fileId,
      iterations: chunkingResult.iterations,
      totalInputTokens: chunkingResult.totalInputTokens,
      totalOutputTokens: chunkingResult.totalOutputTokens,
      finalTokenCount: chunkingResult.metadata.final_token_count,
    },
    '[Phase 6] Summarization complete'
  );

  // Validate quality
  options?.onProgress?.(progressBase + 10, 'Validating quality');

  const qualityCheck: QualityCheckResult = await validateSummaryQuality(
    extractedText,
    chunkingResult.summary,
    { threshold: effectiveQualityThreshold }
  );

  logger.info(
    {
      fileId,
      qualityScore: qualityCheck.quality_score,
      passed: qualityCheck.quality_check_passed,
      threshold: effectiveQualityThreshold,
    },
    '[Phase 6] Quality validation complete'
  );

  return {
    chunkingResult,
    qualityCheck,
    progressBase,
  };
}

// ============================================================================
// RESULT BUILDING
// ============================================================================

/**
 * Build empty result for documents with no content
 */
export function buildEmptyResult(fileId: string): Phase6Result {
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

// ============================================================================
// ESCALATION
// ============================================================================

/**
 * Apply escalation strategy for retry
 *
 * Escalation path:
 * 1. Retry 1: Switch to fallback model from database config
 * 2. Retry 2: Increase output tokens by 25%
 * 3. Retry 3: Further increase output tokens by 25%
 */
export function applyEscalation(config: SummarizationConfig, retryAttempt: number): void {
  config.retryAttempt = retryAttempt + 1;

  // Retry 1: Switch to fallback model
  if (retryAttempt === 0 && config.fallbackModel !== config.model) {
    const previousModel = config.model;
    config.model = config.fallbackModel;
    logger.info(
      { previousModel, newModel: config.model },
      '[Phase 6] Escalation: Switching to fallback model'
    );
  }

  // Retry 2+: Increase output tokens by 25%
  if (retryAttempt >= 1) {
    const previousTokens = config.maxOutputTokens;
    config.maxOutputTokens = Math.ceil(config.maxOutputTokens * 1.25);
    logger.info(
      { previousTokens, newMaxTokens: config.maxOutputTokens },
      '[Phase 6] Escalation: Increasing token budget (+25%)'
    );
  }
}

// ============================================================================
// TITLE GENERATION
// ============================================================================

/**
 * Generate a meaningful document title from summary or full text
 */
export async function generateDocumentTitle(
  text: string,
  language: string,
  model: string = TITLE_GENERATION_MODEL
): Promise<string> {
  const textForTitle = text.slice(0, 2000);
  const langKey = language === 'rus' || language === 'ru' ? 'rus' : 'eng';
  const systemPrompt = TITLE_GENERATION_PROMPTS[langKey];

  try {
    const response = await llmClient.generateCompletion(textForTitle, {
      model,
      systemPrompt,
      maxTokens: 50,
      temperature: 0.3,
    });

    const generatedTitle = response.content
      .trim()
      .replace(/^["'«»]|["'«»]$/g, '')
      .replace(/^(Title|Название|Заголовок):\s*/i, '')
      .trim();

    if (generatedTitle && generatedTitle.length >= 3 && generatedTitle.length <= 200) {
      logger.debug(
        { textLength: textForTitle.length, generatedTitle, language: langKey },
        '[Phase 6] Document title generated'
      );
      return generatedTitle;
    }

    return extractTitleFromText(text, language);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), language: langKey },
      '[Phase 6] Title generation failed, using fallback'
    );
    return extractTitleFromText(text, language);
  }
}

/**
 * Fallback title extraction from text
 */
export function extractTitleFromText(text: string, language: string): string {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      if (line.startsWith('#')) {
        return line.replace(/^#+\s*/, '').length > 3;
      }
      return line.length > 3;
    });

  if (lines.length === 0) {
    return language === 'rus' ? 'Документ без названия' : 'Untitled Document';
  }

  let title = lines[0].replace(/^#+\s*/, '').trim();
  if (title.length > 100) {
    title = title.slice(0, 97) + '...';
  }
  return title;
}

// ============================================================================
// DATABASE STORAGE
// ============================================================================

/**
 * Store summarization result in database
 */
export async function storeSummary(
  courseId: string,
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

  void cacheFileProcessedContent(courseId, fileId, summary);

  logger.info(
    {
      fileId,
      generatedTitle,
      summaryLength: summary.length,
      compressionRatio: compressionRatio.toFixed(2),
    },
    '[Phase 6] Summary stored in database'
  );

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
export async function storeFullText(
  courseId: string,
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
    quality_score: 1.0,
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

  void cacheFileProcessedContent(courseId, fileId, fullText);

  logger.info(
    { fileId, generatedTitle, textLength: fullText.length, estimatedTokens },
    '[Phase 6] Full text stored (bypass)'
  );

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

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

/**
 * Detect document language using simple heuristic
 */
export function detectLanguage(text: string): 'ru' | 'en' {
  const cyrillicPattern = /[\u0400-\u04FF]/;
  const hasCyrillic = cyrillicPattern.test(text.slice(0, 1000));
  return hasCyrillic ? 'ru' : 'en';
}

/**
 * Get course target language from database
 */
export async function getCourseLanguage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  courseId: string
): Promise<'ru' | 'en' | null> {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('language')
      .eq('id', courseId)
      .single();

    if (error || !data?.language) {
      logger.warn(
        { courseId, error: error?.message },
        '[Phase 6] Failed to get course language, will use document language'
      );
      return null;
    }

    const lang = data.language.toLowerCase();
    if (lang === 'ru' || lang === 'rus' || lang === 'russian') return 'ru';
    if (lang === 'en' || lang === 'eng' || lang === 'english') return 'en';

    logger.warn(
      { courseId, language: data.language },
      '[Phase 6] Unknown course language, will use document language'
    );
    return null;
  } catch (error) {
    logger.warn(
      { courseId, error: error instanceof Error ? error.message : String(error) },
      '[Phase 6] Exception getting course language'
    );
    return null;
  }
}
