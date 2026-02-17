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
import type { DetectedIssueForLLM } from '../../judge/self-reviewer/self-reviewer-prompt';
import {
  LLM_PER_ATTEMPT_TIMEOUT_MS,
  LLMIssueSchema,
  calculateSelfReviewerMaxTokens,
} from './self-reviewer-constants';
import { withRetry, extractSectionsToRegenerate } from './self-reviewer-helpers';
import { parseSelfReviewerResponse } from './self-reviewer-json';
import { removeChatbotArtifacts, stripForeignScriptCharacters } from './self-reviewer-heuristics';
import { ZERO_TOLERANCE_SCRIPTS } from '../../judge/heuristic-filter';

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
  /** Pre-detected issues from heuristic phase for targeted LLM fixing */
  detectedIssues?: DetectedIssueForLLM[];
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
export async function runLLMReview(options: LLMReviewOptions): Promise<LLMReviewResult> {
  const { lessonSpec, ragChunks, generatedContent, language, detectedIssues } = options;
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
    generatedContent,
    detectedIssues
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
        retryOn: error => {
          const message = error.message.toLowerCase();
          return (
            message.includes('timeout') ||
            message.includes('rate limit') ||
            message.includes('network') ||
            message.includes('503') ||
            message.includes('429') ||
            message.includes('econnreset') ||
            message.includes('socket')
          );
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
        error: 'invalid response format',
      };
    }

    // Validate and map LLM issues
    const validatedIssues: SelfReviewIssue[] = parsed.issues.map(issue => {
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
// GRAMMAR INLINE FIXES
// ============================================================================

/**
 * Apply simple inline fix for grammar issues
 * Zero-token replacement using exact string matching.
 *
 * @param content - Content to fix
 * @param quotedText - Exact text to find
 * @param replacement - Text to replace with
 * @returns Object with success flag and modified content
 */
function applySimpleInlineFix(
  content: string,
  quotedText: string,
  replacement: string
): { success: boolean; content: string; reason?: string } {
  // Must have both quotedText and replacement
  if (!quotedText || !replacement) {
    return { success: false, content, reason: 'missing_replacement' };
  }

  // Check exact match exists
  const index = content.indexOf(quotedText);
  if (index === -1) {
    return { success: false, content, reason: 'text_not_found' };
  }

  // Check uniqueness: must be exactly 1 occurrence
  const occurrences = content.split(quotedText).length - 1;
  if (occurrences > 1) {
    return { success: false, content, reason: 'multiple_occurrences' };
  }

  // Apply replacement
  const newContent = content.replace(quotedText, replacement);
  return { success: true, content: newContent };
}

/**
 * Apply all grammar fixes to content
 *
 * @param content - Original content
 * @param issues - Grammar issues with quotedText and inlineReplacement
 * @returns Object with modified content and fix statistics
 */
function applyGrammarFixes(
  content: string,
  issues: SelfReviewIssue[]
): { content: string; appliedCount: number; failedCount: number } {
  const nodeLogger = logger.child({ phase: 'grammarFixes' });
  let currentContent = content;
  let appliedCount = 0;
  let failedCount = 0;

  const grammarIssues = issues.filter(
    i => i.type === 'GRAMMAR' && i.quotedText && i.inlineReplacement
  );

  for (const issue of grammarIssues) {
    const result = applySimpleInlineFix(
      currentContent,
      issue.quotedText!,
      issue.inlineReplacement!
    );

    if (result.success) {
      currentContent = result.content;
      appliedCount++;
      nodeLogger.debug({
        msg: 'Grammar fix applied',
        quotedText: issue.quotedText?.slice(0, 30),
        location: issue.location,
      });
    } else {
      failedCount++;
      nodeLogger.debug({
        msg: 'Grammar fix failed',
        reason: result.reason,
        quotedText: issue.quotedText?.slice(0, 30),
        location: issue.location,
      });
    }
  }

  if (appliedCount > 0) {
    nodeLogger.info({
      msg: 'Grammar fixes completed',
      appliedCount,
      failedCount,
      tokensSaved: appliedCount * 1500, // Estimate: ~1500 tokens saved per fix
    });
  }

  return { content: currentContent, appliedCount, failedCount };
}

// ============================================================================
// PATCHING
// ============================================================================

/**
 * Apply programmatic fixes or validate LLM patches
 *
 * Handles FIXED status with programmatic patching for HYGIENE and GRAMMAR issues,
 * and validates LLM-provided patches against schema.
 *
 * @param result - Current SelfReviewResult
 * @param generatedContent - Original generated content
 * @returns Object with updated result and optional patched content
 */
export function applyPatching(
  result: SelfReviewResult,
  generatedContent: string,
  language?: string
): { result: SelfReviewResult; patchedContent: string | null } {
  const nodeLogger = logger.child({ phase: 'patching' });
  let patchedContent: string | null = null;
  let workingContent = generatedContent;
  const updatedResult = { ...result };

  // STEP 1: Apply GRAMMAR fixes (Phase 2.5) - zero-token inline fixes
  const grammarIssues = result.issues.filter(
    i => i.type === 'GRAMMAR' && i.severity === 'FIXABLE' && i.quotedText && i.inlineReplacement
  );

  if (grammarIssues.length > 0) {
    const grammarResult = applyGrammarFixes(workingContent, grammarIssues);
    if (grammarResult.appliedCount > 0) {
      workingContent = grammarResult.content;
      patchedContent = workingContent;
      updatedResult.status = 'FIXED';
      updatedResult.reasoning += ` (${grammarResult.appliedCount} grammar fix(es) applied)`;
    }
  }

  // STEP 2: PROGRAMMATIC PATCHING for HYGIENE issues
  if ((result.status === 'FIXED' || grammarIssues.length > 0) && !result.patchedContent) {
    const hygieneIssues = result.issues.filter(
      i => i.type === 'HYGIENE' && i.severity === 'FIXABLE'
    );
    const fixableIssues = [...grammarIssues, ...hygieneIssues];
    const allIssuesAreFixable =
      fixableIssues.length === result.issues.length && fixableIssues.length > 0;

    if (hygieneIssues.length > 0) {
      nodeLogger.info({
        msg: 'Applying programmatic fix for HYGIENE issues',
        issuesCount: hygieneIssues.length,
      });

      const cleanedContent = removeChatbotArtifacts(workingContent);

      if (cleanedContent.length < workingContent.length) {
        workingContent = cleanedContent;
        patchedContent = workingContent;
        updatedResult.status = 'FIXED';
        updatedResult.reasoning += ' (HYGIENE fixed programmatically)';
        nodeLogger.info({
          msg: 'Chatbot artifacts removed programmatically',
          originalLength: generatedContent.length,
          cleanedLength: cleanedContent.length,
          removedChars: generatedContent.length - cleanedContent.length,
        });
      }
    }

    // If we have patches applied, keep FIXED status
    // If no patches were applied, downgrade to PASS_WITH_FLAGS
    if (patchedContent === null && result.status === 'FIXED') {
      updatedResult.status = allIssuesAreFixable ? 'PASS_WITH_FLAGS' : result.status;
      if (!allIssuesAreFixable) {
        updatedResult.reasoning += ' (No programmatic fix applied)';
      }
    }
  }

  // STEP 3: Validate LLM-provided patches (if any)
  if (result.patchedContent) {
    const validation = LessonContentBodySchema.safeParse(result.patchedContent);

    if (!validation.success) {
      nodeLogger.warn({
        msg: 'Invalid patchedContent from LLM, downgrading status',
        errors: validation.error.errors.map(e => e.message),
      });

      updatedResult.patchedContent = null;
      // Keep our programmatic patches if we have them
      if (patchedContent === null) {
        const hasCriticalIssues = result.issues.some(i => i.severity === 'CRITICAL');
        const hasMinorIssues = result.issues.some(
          i => i.severity === 'INFO' || i.severity === 'FIXABLE'
        );
        updatedResult.status = hasCriticalIssues
          ? 'REGENERATE'
          : hasMinorIssues
            ? 'PASS_WITH_FLAGS'
            : 'PASS';
      }
      updatedResult.reasoning += ' (LLM patch rejected: invalid schema)';
    } else {
      patchedContent = JSON.stringify(result.patchedContent, null, 2);
      nodeLogger.info({ msg: 'Content successfully patched by self-reviewer' });
    }
  }

  // STEP 4: Safety net — strip remaining foreign characters from zero-tolerance scripts
  // This runs AFTER all LLM-based fixes. If the LLM already translated/removed foreign chars,
  // this step does nothing. Only activates if foreign chars still remain.
  if (language) {
    // Determine which zero-tolerance scripts to check based on language
    const allScripts = [...ZERO_TOLERANCE_SCRIPTS];
    const scriptsToStrip = allScripts.filter(script => {
      // Don't strip CJK if target language IS Chinese, etc.
      if (script === 'CJK' && (language === 'zh' || language === 'ja' || language === 'ko'))
        return false;
      if (script === 'ARABIC' && language === 'ar') return false;
      if (script === 'DEVANAGARI' && (language === 'hi' || language === 'bn')) return false;
      return true;
    });

    nodeLogger.debug({
      msg: 'Safety net: checking for residual foreign characters',
      language,
      scriptsToStrip,
      skippedScripts: allScripts.filter(s => !scriptsToStrip.includes(s)),
    });

    if (scriptsToStrip.length > 0) {
      const stripResult = stripForeignScriptCharacters(workingContent, scriptsToStrip);
      if (stripResult.fixCount > 0) {
        nodeLogger.warn({
          msg: 'Safety net: stripped remaining foreign characters after LLM review',
          fixCount: stripResult.fixCount,
          scriptsStripped: scriptsToStrip,
          language,
        });
        workingContent = stripResult.content;
        patchedContent = workingContent;
        if (updatedResult.status === 'PASS' || updatedResult.status === 'PASS_WITH_FLAGS') {
          updatedResult.status = 'FIXED';
        }
        updatedResult.reasoning += ` (${stripResult.fixCount} residual foreign character(s) stripped as safety net)`;
      }
    }
  }

  return { result: updatedResult, patchedContent };
}
