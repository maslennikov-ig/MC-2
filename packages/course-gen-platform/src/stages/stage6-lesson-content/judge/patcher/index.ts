/**
 * Patcher module - Surgical content edits
 * @module stages/stage6-lesson-content/judge/patcher
 *
 * Implements the Patcher agent for targeted refinement system.
 * Performs surgical edits on lesson content using LLM while preserving context.
 *
 * Token cost: ~500-1000 tokens per patch (see REFINEMENT_CONFIG in judge-types.ts)
 *
 * Usage:
 * ```typescript
 * const patcherInput: PatcherInput = {
 *   originalContent: section.content,
 *   sectionId: 'sec_introduction',
 *   sectionTitle: 'Introduction',
 *   instructions: 'Improve clarity by simplifying technical jargon',
 *   contextAnchors: {
 *     prevSectionEnd: 'previous context...',
 *     nextSectionStart: 'next context...',
 *   },
 *   contextWindow: {
 *     startQuote: 'problematic area starts...',
 *     endQuote: 'problematic area ends...',
 *     scope: 'paragraph',
 *   },
 * };
 *
 * const result = await executePatch(patcherInput);
 * if (result.success) {
 *   console.log('Patched content:', result.patchedContent);
 *   console.log('Changes:', result.diffSummary);
 * }
 * ```
 */

import type { PatcherInput, PatcherOutput } from '@megacampus/shared-types';
import { buildPatcherPrompt, buildPatcherSystemPrompt } from './patcher-prompt';
import { logger } from '../../../../shared/logger';
import { LLMClient } from '@/shared/llm';
import { createModelConfigService } from '@/shared/llm/model-config-service';

export { buildPatcherPrompt, buildPatcherSystemPrompt } from './patcher-prompt';

/**
 * LLM call function signature for dependency injection
 * Will be integrated with actual LLM service in Phase 3
 */
export type LLMCallFn = (
  prompt: string,
  systemPrompt: string,
  options: { maxTokens: number; temperature: number }
) => Promise<{ content: string; tokensUsed: number }>;

/**
 * Default LLM call implementation using LLMClient
 *
 * Uses ModelConfigService to get database-driven model configuration.
 * Falls back to hardcoded model if database unavailable.
 */
async function defaultLLMCall(
  prompt: string,
  systemPrompt: string,
  options: { maxTokens: number; temperature: number }
): Promise<{ content: string; tokensUsed: number }> {
  const llmClient = new LLMClient();
  const modelService = createModelConfigService();

  let modelId = 'unknown'; // Will be set from database config
  try {
    const config = await modelService.getModelForPhase('stage_6_patcher');
    modelId = config.modelId;
    logger.info({ modelId, source: config.source }, 'Patcher using model from config');
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) },
      'Failed to get patcher model config, using fallback');
  }

  const response = await llmClient.generateCompletion(prompt, {
    model: modelId,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    systemPrompt,
  });

  return {
    content: response.content,
    tokensUsed: response.totalTokens,
  };
}

/**
 * Execute a surgical patch on content
 *
 * Uses LLM to apply targeted fixes while preserving context.
 * Estimated token usage: ~500-1000 tokens (prompt + response)
 *
 * @param input - PatcherInput with original content and fix instructions
 * @param llmCall - Optional LLM call function for dependency injection (defaults to defaultLLMCall)
 * @returns PatcherOutput with patched content and metrics
 */
import { getTokenMultiplier, getCharsPerToken } from '@megacampus/shared-types';

/**
 * Minimum ratio of patched content length to original content length
 * If patch results in content shorter than this ratio, it's considered truncated
 * 0.7 = patched content must be at least 70% of original length
 */
const MIN_CONTENT_LENGTH_RATIO = 0.7;

/**
 * Base token budget per minute of lesson duration (for English)
 * Based on ~150 words/minute, ~1.3 tokens/word = ~200 tokens/minute
 * We use 250 tokens/minute as generous buffer
 */
const BASE_TOKENS_PER_MINUTE = 250;

/**
 * Calculate max tokens based on lesson duration and language
 *
 * Language multipliers (relative to English):
 * - en/es/fr/de: 1.0x
 * - ru: 1.33x (Cyrillic)
 * - zh: 2.67x (CJK - most expensive)
 * - ja/ko/th: 2.0x
 * - ar/hi/bn: 1.6x
 *
 * @param lessonDurationMinutes - Lesson duration in minutes (3-45)
 * @param contentLength - Original content length in characters (fallback estimation)
 * @param language - Content language code (e.g., 'ru', 'en', 'zh')
 * @returns Calculated maxTokens for LLM call
 */
function calculateMaxTokensForPatch(
  lessonDurationMinutes: number | undefined,
  contentLength: number,
  language: string = 'en'
): number {
  // Get language multiplier (1.0 for English, higher for other languages)
  const languageMultiplier = getTokenMultiplier(language);

  // If lesson duration is provided, use it for accurate calculation
  if (lessonDurationMinutes) {
    // Base: tokens per minute × duration × 1.5 buffer × language multiplier
    const durationBasedTokens = Math.ceil(
      lessonDurationMinutes * BASE_TOKENS_PER_MINUTE * 1.5 * languageMultiplier
    );
    // Clamp to reasonable range:
    // - Min: 1500 (short English lessons)
    // - Max: 45000 (all our models support 50K+ output)
    return Math.max(1500, Math.min(45000, durationBasedTokens));
  }

  // Fallback: estimate from content length if duration not provided
  const charsPerToken = getCharsPerToken(language);
  const estimatedTokens = Math.ceil(contentLength / charsPerToken);
  return Math.max(1500, Math.min(16000, estimatedTokens * 1.5));
}

export async function executePatch(
  input: PatcherInput,
  llmCall: LLMCallFn = defaultLLMCall
): Promise<PatcherOutput> {
  const startTime = Date.now();

  // Calculate dynamic maxTokens based on lesson duration, language, and content length
  const maxTokens = calculateMaxTokensForPatch(
    input.lessonDurationMinutes,
    input.originalContent.length,
    input.language
  );

  logger.info({
    sectionId: input.sectionId,
    sectionTitle: input.sectionTitle,
    originalLength: input.originalContent.length,
    scope: input.contextWindow.scope,
    lessonDurationMinutes: input.lessonDurationMinutes || 'not provided',
    language: input.language || 'en (default)',
    languageMultiplier: getTokenMultiplier(input.language || 'en'),
    maxTokens,
  }, 'Executing Patcher: surgical edit');

  try {
    const prompt = buildPatcherPrompt(input);
    const systemPrompt = buildPatcherSystemPrompt();

    const response = await llmCall(prompt, systemPrompt, {
      maxTokens,
      temperature: 0.1,
    });
    const patchedContent = response.content.trim();
    const tokensUsed = response.tokensUsed;

    // IMPORTANT: Validate that content was not truncated
    // If patched content is significantly shorter than original, reject the patch
    const lengthRatio = patchedContent.length / input.originalContent.length;
    if (lengthRatio < MIN_CONTENT_LENGTH_RATIO) {
      logger.error({
        sectionId: input.sectionId,
        originalLength: input.originalContent.length,
        patchedLength: patchedContent.length,
        lengthRatio: lengthRatio.toFixed(2),
        minRatio: MIN_CONTENT_LENGTH_RATIO,
      }, 'Patcher: REJECTED - content was truncated, returning original');

      return {
        patchedContent: input.originalContent, // Return original - patch was corrupted
        success: false,
        diffSummary: `Patch rejected: content truncated to ${(lengthRatio * 100).toFixed(0)}% of original`,
        tokensUsed,
        durationMs: Date.now() - startTime,
        errorMessage: 'Patch resulted in truncated content - LLM output was incomplete',
      };
    }

    // Calculate diff summary
    const diffSummary = generateDiffSummary(input.originalContent, patchedContent);

    const durationMs = Date.now() - startTime;

    logger.info({
      sectionId: input.sectionId,
      tokensUsed,
      durationMs,
      diffSummary,
      patchedLength: patchedContent.length,
      lengthDelta: patchedContent.length - input.originalContent.length,
      lengthRatio: lengthRatio.toFixed(2),
    }, 'Patcher: surgical edit complete');

    return {
      patchedContent,
      success: true,
      diffSummary,
      tokensUsed,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error({
      sectionId: input.sectionId,
      error: errorMessage,
      durationMs,
    }, 'Patcher: surgical edit failed');

    return {
      patchedContent: input.originalContent, // Return original on error
      success: false,
      diffSummary: 'No changes applied',
      tokensUsed: 0,
      durationMs,
      errorMessage,
    };
  }
}

/**
 * Generate a human-readable summary of changes
 *
 * Compares original and patched content to produce a concise diff summary.
 * Used for logging and debugging purposes.
 *
 * @param original - Original content before patching
 * @param patched - Patched content after LLM edit
 * @returns Human-readable diff summary
 */
function generateDiffSummary(original: string, patched: string): string {
  if (original === patched) {
    return 'No changes detected';
  }

  const originalWords = original.split(/\s+/).length;
  const patchedWords = patched.split(/\s+/).length;
  const wordDiff = patchedWords - originalWords;

  // Simple diff summary
  const parts: string[] = [];
  if (wordDiff > 0) {
    parts.push(`Added ~${wordDiff} words`);
  } else if (wordDiff < 0) {
    parts.push(`Removed ~${Math.abs(wordDiff)} words`);
  } else {
    parts.push('Word count unchanged');
  }

  // Character-level changes
  const charDiff = patched.length - original.length;
  if (charDiff !== 0) {
    parts.push(`${charDiff > 0 ? '+' : ''}${charDiff} characters`);
  }

  // Calculate approximate edit distance ratio
  const maxLength = Math.max(original.length, patched.length);
  const minLength = Math.min(original.length, patched.length);
  const editRatio = maxLength > 0 ? ((maxLength - minLength) / maxLength * 100).toFixed(1) : '0.0';
  parts.push(`${editRatio}% changed`);

  return parts.length > 0 ? parts.join(', ') : 'Content modified';
}
