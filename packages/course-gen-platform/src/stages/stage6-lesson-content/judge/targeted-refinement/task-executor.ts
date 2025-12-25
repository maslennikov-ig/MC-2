import type {
  SectionRefinementTask,
  LessonContent,
  RefinementEvent,
  IssueSeverity,
  RAGChunk,
} from '@megacampus/shared-types';
import { SUPPORTED_LANGUAGES } from '@megacampus/shared-types';
import type { LLMCallFn } from '../patcher';
import type { IterationContext } from './types';
import type { FixPromptContext } from '../fix-templates';

import { logger } from '../../../../shared/logger';
import { LLMClient } from '../../../../shared/llm';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';

import { verifyPatch } from '../verifier/delta-judge';
import { executePatch, buildPatcherSystemPrompt } from '../patcher';
import { executeExpansion } from '../section-expander';
import {
  selectFixPromptTemplate,
  buildCoherencePreservingPrompt,
} from '../fix-templates';

import { emitEvent } from './events';
import { extractSectionContent } from './content-utils';

/**
 * Verify patch using Delta Judge with most severe issue
 */
export async function verifyPatchWithDeltaJudge(
  originalContent: string,
  patchedContent: string,
  task: SectionRefinementTask,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined
): Promise<{ passed: boolean; tokensUsed: number }> {
  // Guard: skip verification if no source issues
  if (task.sourceIssues.length === 0) {
    logger.warn({
      sectionId: task.sectionId,
    }, 'Task has no source issues - skipping Delta Judge verification');
    return { passed: true, tokensUsed: 0 };
  }

  // Select most severe issue for verification
  const severityOrder: Record<IssueSeverity, number> = { critical: 0, major: 1, minor: 2 };
  const primaryIssue = [...task.sourceIssues].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  )[0];

  logger.debug({
    sectionId: task.sectionId,
    selectedIssue: primaryIssue.criterion,
    selectedSeverity: primaryIssue.severity,
    totalIssues: task.sourceIssues.length,
  }, 'Selected most severe issue for Delta Judge verification');

  const deltaResult = await verifyPatch({
    originalContent,
    patchedContent,
    addressedIssue: primaryIssue,
    sectionId: task.sectionId,
    contextAnchors: task.contextAnchors,
  });

  // Log and emit new issues
  if (deltaResult.newIssues.length > 0) {
    logger.warn({
      sectionId: task.sectionId,
      newIssuesCount: deltaResult.newIssues.length,
      newIssues: deltaResult.newIssues.map(i => ({
        criterion: i.criterion,
        severity: i.severity,
        description: i.description?.slice(0, 50) || 'No description',
      })),
    }, 'Delta Judge found new issues introduced by patch');

    for (const newIssue of deltaResult.newIssues) {
      emitEvent(onStreamEvent, {
        type: 'new_issue_detected',
        sectionId: task.sectionId,
        criterion: newIssue.criterion,
        severity: newIssue.severity,
        description: newIssue.description || 'No description',
      });
    }
  }

  return {
    passed: deltaResult.passed,
    tokensUsed: deltaResult.tokensUsed,
  };
}

/**
 * Execute a Patcher task with comprehensive error handling
 */
export async function executePatcherTask(
  task: SectionRefinementTask,
  content: LessonContent,
  llmCall: LLMCallFn | undefined,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined,
  iterationContext: IterationContext
): Promise<{ success: boolean; sectionId: string; patchedContent: string; tokensUsed: number }> {
  try {
    emitEvent(onStreamEvent, {
      type: 'task_started',
      sectionId: task.sectionId,
      taskType: 'SURGICAL_EDIT',
    });

    // Extract section content
    const sectionContent = extractSectionContent(content, task.sectionId);

    // Determine template type based on score and iteration
    const templateType = selectFixPromptTemplate(
      iterationContext.score,
      iterationContext.iteration,
      iterationContext.issues
    );

    logger.info({
      sectionId: task.sectionId,
      templateType,
      score: iterationContext.score,
      iteration: iterationContext.iteration,
      issuesCount: iterationContext.issues.length,
    }, 'Selected fix prompt template type');

    // Use coherence preserving template for iteration > 1 with history
    if (templateType === 'coherence_preserving' && iterationContext.iterationHistory && iterationContext.lessonSpec) {
      logger.info({
        sectionId: task.sectionId,
        iteration: iterationContext.iteration,
        historyLength: iterationContext.iterationHistory.length,
      }, 'Using coherence preserving template with iteration history');

      // Build FixPromptContext from available data
      const fixPromptContext: FixPromptContext = {
        originalContent: sectionContent,
        score: iterationContext.score,
        issues: task.sourceIssues.map(ti => ({
          criterion: ti.criterion,
          severity: ti.severity,
          location: ti.location,
          description: ti.description,
          quotedText: ti.quotedText,
          suggestedFix: ti.suggestedFix,
        })),
        strengths: iterationContext.strengths || [],
        lessonSpec: iterationContext.lessonSpec,
        iterationHistory: iterationContext.iterationHistory,
        sectionsToPreserve: [],
        sectionsToModify: [task.sectionId],
        terminology: [], 
      };

      const coherencePrompt = buildCoherencePreservingPrompt(fixPromptContext);

      // Default LLM call implementation if not provided
      const defaultLLMCall = async (
        prompt: string,
        systemPrompt: string,
        options: { maxTokens: number; temperature: number }
      ): Promise<{ content: string; tokensUsed: number }> => {
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
      };

      const response = await (llmCall || defaultLLMCall)(
        coherencePrompt,
        buildPatcherSystemPrompt(),
        { maxTokens: 1200, temperature: 0.1 }
      );

      logger.info({
        sectionId: task.sectionId,
        tokensUsed: response.tokensUsed,
        outputLength: response.content.length,
      }, 'Coherence preserving prompt execution complete');

      emitEvent(onStreamEvent, {
        type: 'patch_applied',
        sectionId: task.sectionId,
        content: response.content.trim(),
        diffSummary: 'Coherence preserving refinement applied',
      });

      // Verify patch using Delta Judge (lightweight ~150-250 tokens)
      let verificationPassed = true;
      let deltaJudgeTokens = 0;

      // Only run Delta Judge if content actually changed
      if (response.content.trim() !== sectionContent) {
        try {
          const result = await verifyPatchWithDeltaJudge(
            sectionContent,
            response.content.trim(),
            task,
            onStreamEvent
          );
          verificationPassed = result.passed;
          deltaJudgeTokens = result.tokensUsed;

          logger.info({
            sectionId: task.sectionId,
            passed: result.passed,
            tokensUsed: result.tokensUsed,
          }, 'Delta Judge verification complete');
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : String(error),
            sectionId: task.sectionId,
          }, 'Delta Judge verification failed, assuming pass');
          verificationPassed = true;
        }
      }

      emitEvent(onStreamEvent, {
        type: 'verification_result',
        sectionId: task.sectionId,
        passed: verificationPassed,
      });

      return {
        success: verificationPassed,
        sectionId: task.sectionId,
        patchedContent: verificationPassed ? response.content.trim() : sectionContent,
        tokensUsed: response.tokensUsed + deltaJudgeTokens,
      };
    }

    // Fallback to standard patcher
    if (templateType === 'coherence_preserving') {
      logger.warn({
        sectionId: task.sectionId,
        templateType,
        hasLessonSpec: !!iterationContext.lessonSpec,
        hasIterationHistory: !!iterationContext.iterationHistory,
        historyLength: iterationContext.iterationHistory?.length || 0,
      }, 'Coherence template selected but prerequisites missing - falling back to standard patcher');
    } else {
      logger.info({
        sectionId: task.sectionId,
        templateType,
      }, 'Using standard patcher for non-coherence template');
    }

    // Build Patcher input
    const patcherInput = {
      originalContent: sectionContent,
      sectionId: task.sectionId,
      sectionTitle: task.sectionTitle,
      instructions: task.synthesizedInstructions,
      contextAnchors: task.contextAnchors,
      contextWindow: {
        startQuote: undefined,
        endQuote: undefined,
        scope: 'section' as const,
      },
      // Pass lesson duration and language for accurate token budget calculation
      lessonDurationMinutes: iterationContext.lessonSpec?.estimated_duration_minutes,
      language: iterationContext.language,
    };

    // Execute patch
    const patchResult = await executePatch(patcherInput, llmCall);

    emitEvent(onStreamEvent, {
      type: 'patch_applied',
      sectionId: task.sectionId,
      content: patchResult.patchedContent,
      diffSummary: patchResult.diffSummary,
    });

    // Verify patch using Delta Judge (lightweight ~150-250 tokens)
    let verificationPassed = true;
    let deltaJudgeTokens = 0;

    // Only run Delta Judge if content actually changed
    if (patchResult.patchedContent !== sectionContent && patchResult.success) {
      try {
        const result = await verifyPatchWithDeltaJudge(
          sectionContent,
          patchResult.patchedContent,
          task,
          onStreamEvent
        );
        verificationPassed = result.passed;
        deltaJudgeTokens = result.tokensUsed;

        logger.info({
          sectionId: task.sectionId,
          passed: result.passed,
          tokensUsed: result.tokensUsed,
        }, 'Delta Judge verification complete');
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          sectionId: task.sectionId,
        }, 'Delta Judge verification failed, assuming pass');
        verificationPassed = true;
      }
    }

    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: verificationPassed,
    });

    return {
      success: patchResult.success && verificationPassed,
      sectionId: task.sectionId,
      patchedContent: verificationPassed ? patchResult.patchedContent : sectionContent,
      tokensUsed: patchResult.tokensUsed + deltaJudgeTokens,
    };
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      sectionId: task.sectionId,
      taskType: 'SURGICAL_EDIT',
    }, 'Patcher task failed with error');

    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: false,
    });

    const originalContent = extractSectionContent(content, task.sectionId);
    return {
      success: false,
      sectionId: task.sectionId,
      patchedContent: originalContent,
      tokensUsed: 0,
    };
  }
}

/**
 * Execute a Section-Expander task with comprehensive error handling
 */
export async function executeExpanderTask(
  task: SectionRefinementTask,
  content: LessonContent,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined,
  ragChunks: RAGChunk[],
  learningObjectives: string[],
  language?: string
): Promise<{ success: boolean; sectionId: string; regeneratedContent: string; tokensUsed: number }> {
  try {
    emitEvent(onStreamEvent, {
      type: 'task_started',
      sectionId: task.sectionId,
      taskType: 'REGENERATE_SECTION',
    });

    // Validate and normalize language parameter
    let validatedLanguage = language;
    if (language && !SUPPORTED_LANGUAGES.includes(language as typeof SUPPORTED_LANGUAGES[number])) {
      logger.warn({
        sectionId: task.sectionId,
        providedLanguage: language,
        fallback: 'en',
      }, 'Invalid language code, falling back to English');
      validatedLanguage = 'en';
    }

    logger.debug({
      sectionId: task.sectionId,
      language: validatedLanguage || 'default (en)',
      issuesCount: task.sourceIssues.length,
    }, 'Executing Section-Expander task');

    // Extract section content
    const sectionContent = extractSectionContent(content, task.sectionId);

    // Build Section-Expander input
    const expanderInput = {
      sectionId: task.sectionId,
      sectionTitle: task.sectionTitle,
      originalContent: sectionContent,
      issues: task.sourceIssues,
      ragChunks,
      learningObjectives,
      contextAnchors: task.contextAnchors,
      targetWordCount: 300,
      language: validatedLanguage,
    };

    // Execute expansion
    const expandResult = await executeExpansion(expanderInput);

    emitEvent(onStreamEvent, {
      type: 'patch_applied',
      sectionId: task.sectionId,
      content: expandResult.regeneratedContent,
      diffSummary: `Regenerated section (${expandResult.wordCount} words)`,
    });

    // Verify regeneration using Delta Judge
    let verificationPassed = true;
    let deltaJudgeTokens = 0;

    if (expandResult.regeneratedContent !== sectionContent && expandResult.success) {
      try {
        const result = await verifyPatchWithDeltaJudge(
          sectionContent,
          expandResult.regeneratedContent,
          task,
          onStreamEvent
        );
        verificationPassed = result.passed;
        deltaJudgeTokens = result.tokensUsed;

        logger.info({
          sectionId: task.sectionId,
          passed: result.passed,
          tokensUsed: result.tokensUsed,
        }, 'Delta Judge verification complete for expansion');
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          sectionId: task.sectionId,
        }, 'Delta Judge verification failed for expansion, assuming pass');
        verificationPassed = true;
      }
    }

    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: verificationPassed,
    });

    return {
      success: expandResult.success && verificationPassed,
      sectionId: task.sectionId,
      regeneratedContent: verificationPassed ? expandResult.regeneratedContent : sectionContent,
      tokensUsed: expandResult.tokensUsed + deltaJudgeTokens,
    };
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      sectionId: task.sectionId,
      taskType: 'REGENERATE_SECTION',
    }, 'Section-Expander task failed with error');

    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: false,
    });

    const originalContent = extractSectionContent(content, task.sectionId);
    return {
      success: false,
      sectionId: task.sectionId,
      regeneratedContent: originalContent,
      tokensUsed: 0,
    };
  }
}
