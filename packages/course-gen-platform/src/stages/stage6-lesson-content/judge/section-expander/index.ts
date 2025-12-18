/**
 * Section-Expander Module - Section Regeneration with RAG
 * @module stages/stage6-lesson-content/judge/section-expander
 *
 * Implements section-level content regeneration using LLM with RAG grounding.
 * Used when Patcher's surgical edits are insufficient and entire sections need rewriting.
 *
 * Features:
 * - Full section regeneration with RAG context
 * - Learning objective alignment
 * - Context-aware transitions
 * - Word count validation
 * - Token estimation for budget tracking
 *
 * Usage:
 * ```typescript
 * import { executeExpansion, estimateExpansionTokens } from './section-expander';
 *
 * const input: SectionExpanderInput = {
 *   sectionId: 'sec_intro',
 *   sectionTitle: 'Introduction',
 *   originalContent: '...',
 *   issues: [...],
 *   ragChunks: [...],
 *   learningObjectives: [...],
 *   contextAnchors: { prevSectionEnd: '...', nextSectionStart: '...' },
 *   targetWordCount: 400,
 * };
 *
 * // Estimate cost before execution
 * const estimatedTokens = estimateExpansionTokens(input);
 * console.log(`Estimated tokens: ${estimatedTokens}`);
 *
 * // Execute regeneration
 * const result = await executeExpansion(input);
 * if (result.success) {
 *   console.log(`New content: ${result.regeneratedContent}`);
 *   console.log(`Word count: ${result.wordCount}`);
 *   console.log(`Actual tokens: ${result.tokensUsed}`);
 * }
 * ```
 *
 * Token budget: ~1200-2000 tokens per call
 * Estimated duration: ~3-5 seconds
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/quickstart.md (Phase 5)
 * - packages/shared-types/src/judge-types.ts (SectionExpanderInput/Output)
 */

import type {
  SectionExpanderInput,
  SectionExpanderOutput,
} from '@megacampus/shared-types';
import {
  buildExpanderPrompt,
  buildExpanderSystemPrompt,
  extractRagChunkText,
  validateTargetWordCount,
} from './expander-prompt';
import { logger } from '../../../../shared/logger';
import { LLMClient } from '../../../../shared/llm';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';

// Re-export all prompt utilities for external use
export {
  buildExpanderPrompt,
  buildExpanderSystemPrompt,
  extractRagChunkText,
  validateTargetWordCount,
  formatIssuesAsRequirements,
} from './expander-prompt';

/**
 * Execute section regeneration
 *
 * Uses LLM with RAG chunks to regenerate an entire section.
 * Addresses multiple issues while preserving learning objectives
 * and maintaining coherence with adjacent sections.
 *
 * Estimated token usage: ~1500 tokens (input + output)
 *
 * @param input - SectionExpanderInput with issues, RAG chunks, objectives
 * @returns SectionExpanderOutput with regenerated content and metrics
 *
 * @example
 * ```typescript
 * const input: SectionExpanderInput = {
 *   sectionId: 'sec_ml_types',
 *   sectionTitle: 'Types of Machine Learning',
 *   originalContent: 'There are three types of ML...',
 *   issues: [
 *     {
 *       criterion: 'factual_accuracy',
 *       severity: 'critical',
 *       description: 'Missing reinforcement learning',
 *       suggestedFix: 'Add RL as third type',
 *       // ... other TargetedIssue fields
 *     },
 *   ],
 *   ragChunks: [
 *     { content: 'Reinforcement learning is...' },
 *     'Additional context about ML types...',
 *   ],
 *   learningObjectives: [
 *     'Identify the three main types of machine learning',
 *     'Explain differences between supervised and unsupervised learning',
 *   ],
 *   contextAnchors: {
 *     prevSectionEnd: 'We will now explore the types of ML.',
 *     nextSectionStart: 'Supervised learning is the most common type.',
 *   },
 *   targetWordCount: 350,
 * };
 *
 * const result = await executeExpansion(input);
 * // result.regeneratedContent: Full regenerated section
 * // result.success: true if no errors
 * // result.wordCount: Actual word count
 * // result.tokensUsed: Tokens consumed by LLM
 * // result.durationMs: Time taken
 * ```
 */
export async function executeExpansion(
  input: SectionExpanderInput
): Promise<SectionExpanderOutput> {
  const startTime = Date.now();

  try {
    // Get model configuration from database
    const llmClient = new LLMClient();
    const modelService = createModelConfigService();

    let modelId = 'openai/gpt-oss-120b';
    let temperature = 0.7;
    let maxTokens = 2000;

    try {
      const config = await modelService.getModelForPhase('stage_6_section_expander');
      modelId = config.modelId;
      temperature = config.temperature;
      maxTokens = config.maxTokens;
      logger.info({ modelId, source: config.source }, 'Section-Expander using model from config');
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) },
        'Failed to get expander model config, using fallback');
    }

    // Build prompts
    const prompt = buildExpanderPrompt(input);
    const systemPrompt = buildExpanderSystemPrompt();

    // Call LLM for section regeneration
    const response = await llmClient.generateCompletion(prompt, {
      model: modelId,
      temperature,
      maxTokens,
      systemPrompt,
    });

    const regeneratedContent = response.content.trim();
    const tokensUsed = response.totalTokens;

    logger.info({
      sectionId: input.sectionId,
      modelId,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    }, 'Section-Expander: LLM call complete');

    // Calculate word count for validation
    const wordCount = countWords(regeneratedContent);

    // Validate word count against target (±10% tolerance)
    const targetWordCount = validateTargetWordCount(input.targetWordCount);
    const tolerance = 0.10;
    const minWords = Math.floor(targetWordCount * (1 - tolerance));
    const maxWords = Math.ceil(targetWordCount * (1 + tolerance));

    // Log warning if word count is significantly off target
    if (wordCount < minWords || wordCount > maxWords) {
      logger.warn({
        sectionId: input.sectionId,
        wordCount,
        targetRange: { min: minWords, max: maxWords },
      }, 'Section-Expander: Word count outside target range');
    }

    return {
      regeneratedContent,
      success: true,
      wordCount,
      tokensUsed,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    // Return original content on error (graceful degradation)
    return {
      regeneratedContent: input.originalContent,
      success: false,
      wordCount: countWords(input.originalContent),
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
      errorMessage: error instanceof Error ? error.message : 'Unknown error during section expansion',
    };
  }
}

/**
 * Estimate token cost for section expansion
 *
 * Estimates total tokens required for section regeneration based on:
 * - Base prompt structure (~500 tokens)
 * - Issue descriptions (~50 tokens per issue)
 * - RAG chunks (character length / 4)
 * - Original content (character length / 4)
 * - Expected output size (target word count × 1.3)
 *
 * @param input - SectionExpanderInput
 * @returns Estimated total tokens (input + output)
 *
 * @example
 * ```typescript
 * const input: SectionExpanderInput = { ... };
 * const estimate = estimateExpansionTokens(input);
 * console.log(`Estimated tokens: ${estimate}`);
 *
 * // Check against budget
 * const tokenBudget = 15000;
 * if (estimate > tokenBudget) {
 *   console.warn('Expansion exceeds token budget');
 * }
 * ```
 */
export function estimateExpansionTokens(input: SectionExpanderInput): number {
  // Input tokens: prompt + RAG chunks + original content

  // Base prompt structure (system + user prompt template)
  const promptBase = 500;

  // Issues: ~50 tokens per issue (criterion, description, fix)
  const issueTokens = input.issues.length * 50;

  // Learning objectives: ~20 tokens per objective
  const objectiveTokens = input.learningObjectives.length * 20;

  // RAG chunks: estimate 4 characters per token
  const ragTokens = input.ragChunks.reduce((sum, chunk) => {
    const text = extractRagChunkText(chunk);
    return sum + Math.ceil(text.length / 4);
  }, 0);

  // Original content: estimate 4 characters per token
  const originalContentTokens = Math.ceil(input.originalContent.length / 4);

  // Context anchors: ~50 tokens total
  const contextTokens = 50;

  // Total input tokens
  const inputTokens =
    promptBase +
    issueTokens +
    objectiveTokens +
    ragTokens +
    originalContentTokens +
    contextTokens;

  // Output tokens: target word count × 1.3 tokens/word
  const targetWordCount = validateTargetWordCount(input.targetWordCount);
  const outputTokens = Math.ceil(targetWordCount * 1.3);

  return inputTokens + outputTokens;
}

/**
 * Count words in text
 *
 * Simple word counter that splits on whitespace and filters empty strings.
 *
 * @param text - Text to count words in
 * @returns Word count
 *
 * @example
 * ```typescript
 * countWords("Hello world"); // 2
 * countWords("Multiple   spaces   here"); // 3
 * countWords(""); // 0
 * ```
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Validate section expansion result
 *
 * Checks if the expansion result meets quality criteria:
 * - Non-empty content
 * - Word count within target range (±10%)
 * - No errors reported
 *
 * @param result - SectionExpanderOutput to validate
 * @param targetWordCount - Target word count (optional)
 * @returns Object with validation result and issues
 *
 * @example
 * ```typescript
 * const result = await executeExpansion(input);
 * const validation = validateExpansionResult(result, 400);
 *
 * if (!validation.valid) {
 *   console.error('Expansion validation failed:', validation.issues);
 * }
 * ```
 */
export function validateExpansionResult(
  result: SectionExpanderOutput,
  targetWordCount?: number
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check success flag
  if (!result.success) {
    issues.push(`Expansion failed: ${result.errorMessage || 'Unknown error'}`);
  }

  // Check for empty content
  if (!result.regeneratedContent || result.regeneratedContent.trim().length === 0) {
    issues.push('Regenerated content is empty');
  }

  // Check word count if target provided
  if (targetWordCount) {
    const validated = validateTargetWordCount(targetWordCount);
    const tolerance = 0.10;
    const minWords = Math.floor(validated * (1 - tolerance));
    const maxWords = Math.ceil(validated * (1 + tolerance));

    if (result.wordCount < minWords) {
      issues.push(
        `Word count ${result.wordCount} below target range ${minWords}-${maxWords}`
      );
    } else if (result.wordCount > maxWords) {
      issues.push(
        `Word count ${result.wordCount} above target range ${minWords}-${maxWords}`
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Batch estimate tokens for multiple sections
 *
 * Calculates total token estimate for regenerating multiple sections.
 * Useful for planning parallel execution and budget allocation.
 *
 * @param inputs - Array of SectionExpanderInput objects
 * @returns Total estimated tokens for all sections
 *
 * @example
 * ```typescript
 * const sections = [
 *   { sectionId: 'sec_1', ... },
 *   { sectionId: 'sec_2', ... },
 * ];
 *
 * const totalTokens = batchEstimateTokens(sections);
 * console.log(`Total estimated tokens: ${totalTokens}`);
 *
 * // Check if batch fits in budget
 * const maxTokens = 15000;
 * if (totalTokens > maxTokens) {
 *   console.warn('Batch exceeds token budget, split required');
 * }
 * ```
 */
export function batchEstimateTokens(inputs: SectionExpanderInput[]): number {
  return inputs.reduce((total, input) => total + estimateExpansionTokens(input), 0);
}
