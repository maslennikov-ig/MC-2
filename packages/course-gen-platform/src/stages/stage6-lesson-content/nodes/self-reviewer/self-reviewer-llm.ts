/**
 * Self-Reviewer LLM Functions
 * @module stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-llm
 *
 * Phase 2 LLM-based semantic review and result building.
 */

import { logger } from '@/shared/logger';
import { LLMClient } from '@/shared/llm';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import type { SelfReviewIssue, SelfReviewResult } from '@megacampus/shared-types/judge-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk, LessonContentBody } from '@megacampus/shared-types/lesson-content';
import { LessonContentBodySchema } from '@megacampus/shared-types/lesson-content';
import {
  buildSelfReviewerSystemPrompt,
  buildSelfReviewerUserMessage,
  estimateSelfReviewerTokens,
} from '../../judge/self-reviewer/self-reviewer-prompt';
import {
  LLM_PER_ATTEMPT_TIMEOUT_MS,
  LLMIssueSchema,
  calculateSelfReviewerMaxTokens,
} from './self-reviewer-constants';
import {
  withRetry,
  extractSectionsToRegenerate,
} from './self-reviewer-helpers';
import { parseSelfReviewerResponse } from './self-reviewer-json';
import { removeChatbotArtifacts } from './self-reviewer-heuristics';

// ============================================================================
// TYPES
// ============================================================================

export interface LLMReviewResult {
  success: boolean;
  parsed: {
    status: SelfReviewResult['status'];
    reasoning: string;
    issues: SelfReviewIssue[];
    patched_content: LessonContentBody | null;
  } | null;
  tokensUsed: number;
  error?: string;
}

export interface LLMReviewOptions {
  lessonSpec: LessonSpecificationV2;
  ragChunks: RAGChunk[];
  generatedContent: string;
  language: string;
}

// ============================================================================
// LLM REVIEW
// ============================================================================

/**
 * Run Phase 2: LLM-based Semantic Review
 *
 * Calls LLM for semantic validation with retry logic.
 *
 * @param options - Review options including lesson spec and content
 * @returns LLM review result with parsed response or error
 */
export async function runLLMReview(
  options: LLMReviewOptions
): Promise<LLMReviewResult> {
  const { lessonSpec, ragChunks, generatedContent, language } = options;
  const nodeLogger = logger.child({ phase: 'llmReview' });

  // Get model configuration
  const modelConfigService = createModelConfigService();
  const estimatedTokens = estimateSelfReviewerTokens(generatedContent, ragChunks, language);
  const normalizedLanguage: 'ru' | 'en' = language === 'ru' ? 'ru' : 'en';
  const phaseConfig = await modelConfigService.getModelForPhase(
    'stage_6_refinement',
    undefined,
    estimatedTokens,
    normalizedLanguage
  );

  nodeLogger.info({
    msg: 'Calling LLM for semantic self-review',
    model: phaseConfig.modelId,
    estimatedTokens,
  });

  // Build prompts
  const systemPrompt = buildSelfReviewerSystemPrompt();
  const userMessage = buildSelfReviewerUserMessage(
    language,
    lessonSpec,
    ragChunks,
    generatedContent
  );

  // Calculate dynamic max tokens
  const dynamicMaxTokens = calculateSelfReviewerMaxTokens(generatedContent.length, language);

  nodeLogger.debug({
    msg: 'Calculated dynamic maxTokens for self-reviewer',
    contentLength: generatedContent.length,
    language,
    calculatedMaxTokens: dynamicMaxTokens,
  });

  const llmClient = new LLMClient();
  const llmOptions = {
    model: phaseConfig.modelId,
    temperature: 0.1,
    maxTokens: dynamicMaxTokens,
    systemPrompt,
    timeout: LLM_PER_ATTEMPT_TIMEOUT_MS,
  };

  try {
    const llmResponse = await withRetry(
      () => llmClient.generateCompletion(userMessage, llmOptions),
      {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,
        retryOn: (error) => {
          const message = error.message.toLowerCase();
          return message.includes('timeout') ||
                 message.includes('rate limit') ||
                 message.includes('network') ||
                 message.includes('503') ||
                 message.includes('429') ||
                 message.includes('econnreset') ||
                 message.includes('socket');
        },
      }
    );

    nodeLogger.debug({
      msg: 'LLM self-review response received',
      tokensUsed: llmResponse.totalTokens,
      responseLength: llmResponse.content.length,
    });

    // Parse response
    const parsed = parseSelfReviewerResponse(llmResponse.content);
    if (!parsed) {
      nodeLogger.warn({
        msg: 'Failed to parse LLM self-review response',
        responsePreview: llmResponse.content.slice(0, 200),
      });

      return {
        success: false,
        parsed: null,
        tokensUsed: llmResponse.totalTokens,
        error: 'Invalid response format',
      };
    }

    // Validate and map LLM issues
    const validatedIssues: SelfReviewIssue[] = parsed.issues.map((issue) => {
      const validated = LLMIssueSchema.safeParse(issue);
      if (!validated.success) {
        nodeLogger.warn({
          msg: 'Invalid LLM issue format, using defaults',
          issue,
          errors: validated.error.errors.map(e => e.message),
        });
        return LLMIssueSchema.parse(issue);
      }
      return validated.data;
    });

    return {
      success: true,
      parsed: {
        status: parsed.status,
        reasoning: parsed.reasoning,
        issues: validatedIssues,
        patched_content: parsed.patched_content ?? null,
      },
      tokensUsed: llmResponse.totalTokens,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    nodeLogger.warn({
      msg: 'LLM review failed after retries',
      error: errorMessage,
    });

    return {
      success: false,
      parsed: null,
      tokensUsed: 0,
      error: errorMessage,
    };
  }
}

// ============================================================================
// RESULT BUILDING
// ============================================================================

/**
 * Build final SelfReviewResult from LLM and heuristic data
 *
 * Combines heuristic issues with LLM issues and determines final status.
 *
 * @param llmResult - Result from runLLMReview
 * @param heuristicIssues - Issues from heuristic phase
 * @param heuristicDetails - Details from heuristic checks
 * @param tokensUsed - Total tokens used
 * @param durationMs - Total duration
 * @returns Complete SelfReviewResult
 */
export function buildLLMReviewResult(
  llmResult: LLMReviewResult,
  heuristicIssues: SelfReviewIssue[],
  heuristicDetails: SelfReviewResult['heuristicDetails'],
  tokensUsed: number,
  durationMs: number
): SelfReviewResult {
  if (!llmResult.success || !llmResult.parsed) {
    // LLM failed - return with heuristic issues only
    const hasIssues = heuristicIssues.length > 0;
    return {
      status: hasIssues ? 'PASS_WITH_FLAGS' : 'PASS',
      reasoning: `Heuristics passed. LLM review failed: ${llmResult.error}`,
      issues: heuristicIssues,
      patchedContent: null,
      tokensUsed,
      durationMs,
      heuristicsPassed: true,
      heuristicDetails,
    };
  }

  const allIssues = [...heuristicIssues, ...llmResult.parsed.issues];
  const sectionsToRegenerate = extractSectionsToRegenerate(allIssues);

  return {
    status: llmResult.parsed.status,
    reasoning: llmResult.parsed.reasoning,
    issues: allIssues,
    patchedContent: llmResult.parsed.patched_content,
    sectionsToRegenerate: sectionsToRegenerate.length > 0 ? sectionsToRegenerate : undefined,
    tokensUsed,
    durationMs,
    heuristicsPassed: true,
    heuristicDetails,
  };
}

// ============================================================================
// PATCHING
// ============================================================================

/**
 * Apply programmatic fixes or validate LLM patches
 *
 * Handles FIXED status with programmatic patching for HYGIENE issues,
 * and validates LLM-provided patches against schema.
 *
 * @param result - Current SelfReviewResult
 * @param generatedContent - Original generated content
 * @returns Object with updated result and optional patched content
 */
export function applyPatching(
  result: SelfReviewResult,
  generatedContent: string
): { result: SelfReviewResult; patchedContent: string | null } {
  const nodeLogger = logger.child({ phase: 'patching' });
  let patchedContent: string | null = null;
  const updatedResult = { ...result };

  // PROGRAMMATIC PATCHING for HYGIENE issues
  if (result.status === 'FIXED' && !result.patchedContent) {
    const hygieneIssues = result.issues.filter(
      i => i.type === 'HYGIENE' && i.severity === 'FIXABLE'
    );
    const onlyHygieneIssues = hygieneIssues.length === result.issues.length && hygieneIssues.length > 0;

    if (onlyHygieneIssues) {
      nodeLogger.info({
        msg: 'Applying programmatic fix for HYGIENE issues',
        issuesCount: hygieneIssues.length,
      });

      const cleanedContent = removeChatbotArtifacts(generatedContent);

      if (cleanedContent.length < generatedContent.length) {
        patchedContent = cleanedContent;
        updatedResult.reasoning += ' (Fixed programmatically)';
        nodeLogger.info({
          msg: 'Chatbot artifacts removed programmatically',
          originalLength: generatedContent.length,
          cleanedLength: cleanedContent.length,
          removedChars: generatedContent.length - cleanedContent.length,
        });
      } else {
        updatedResult.status = 'PASS_WITH_FLAGS';
        updatedResult.reasoning += ' (No programmatic fix applied)';
      }
    } else {
      updatedResult.status = 'PASS_WITH_FLAGS';
      updatedResult.reasoning += ' (FIXED status without patch, downgraded)';
    }
  }

  // Validate LLM-provided patches
  if (result.patchedContent) {
    const validation = LessonContentBodySchema.safeParse(result.patchedContent);

    if (!validation.success) {
      nodeLogger.warn({
        msg: 'Invalid patchedContent from LLM, downgrading status',
        errors: validation.error.errors.map(e => e.message),
      });

      updatedResult.patchedContent = null;
      const hasCriticalIssues = result.issues.some(i => i.severity === 'CRITICAL');
      const hasMinorIssues = result.issues.some(i => i.severity === 'INFO' || i.severity === 'FIXABLE');
      updatedResult.status = hasCriticalIssues
        ? 'REGENERATE'
        : hasMinorIssues
          ? 'PASS_WITH_FLAGS'
          : 'PASS';
      updatedResult.reasoning += ' (LLM patch rejected: invalid schema)';
    } else {
      patchedContent = JSON.stringify(result.patchedContent, null, 2);
      nodeLogger.info({ msg: 'Content successfully patched by self-reviewer' });
    }
  }

  return { result: updatedResult, patchedContent };
}
