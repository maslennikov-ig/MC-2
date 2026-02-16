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

import { logger } from '../../../../shared/logger';

import { verifyPatch } from '../verifier/delta-judge';
import { executeExpansion } from '../section-expander';
import { selectFixPromptTemplate } from '../fix-templates';
import { processInlineFixes, INLINE_FIXER_ENABLED } from '../inline-fixer';
import { runMermaidFixPipeline } from '../../utils/mermaid-fix-pipeline';

import { emitEvent } from './events';
import { extractSectionContent } from './content-utils';
import { applyCoherencePreservingPatch, applyStandardPatch } from './task-executor-helpers';

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
    logger.warn(
      {
        sectionId: task.sectionId,
      },
      'Task has no source issues - skipping Delta Judge verification'
    );
    return { passed: true, tokensUsed: 0 };
  }

  // Select most severe issue for verification
  const severityOrder: Record<IssueSeverity, number> = { critical: 0, major: 1, minor: 2 };
  const primaryIssue = [...task.sourceIssues].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  )[0];

  logger.debug(
    {
      sectionId: task.sectionId,
      selectedIssue: primaryIssue.criterion,
      selectedSeverity: primaryIssue.severity,
      totalIssues: task.sourceIssues.length,
    },
    'Selected most severe issue for Delta Judge verification'
  );

  const deltaResult = await verifyPatch({
    originalContent,
    patchedContent,
    addressedIssue: primaryIssue,
    sectionId: task.sectionId,
    contextAnchors: task.contextAnchors,
  });

  // Log and emit new issues
  if (deltaResult.newIssues.length > 0) {
    logger.warn(
      {
        sectionId: task.sectionId,
        newIssuesCount: deltaResult.newIssues.length,
        newIssues: deltaResult.newIssues.map(i => ({
          criterion: i.criterion,
          severity: i.severity,
          description: i.description?.slice(0, 50) || 'No description',
        })),
      },
      'Delta Judge found new issues introduced by patch'
    );

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
    let sectionContent = extractSectionContent(content, task.sectionId);

    // Step 0: Try InlineFixer first (zero-token surgical fixes)
    const inlineResult = tryInlineFixer(task, sectionContent, onStreamEvent);
    if (inlineResult.skipPatcher) {
      return {
        success: true,
        sectionId: task.sectionId,
        patchedContent: inlineResult.content,
        tokensUsed: 0,
      };
    }
    sectionContent = inlineResult.content;

    // Determine template type
    const templateType = selectFixPromptTemplate(
      iterationContext.score,
      iterationContext.iteration,
      iterationContext.issues
    );

    logger.info(
      {
        sectionId: task.sectionId,
        templateType,
        score: iterationContext.score,
        iteration: iterationContext.iteration,
        issuesCount: iterationContext.issues.length,
      },
      'Selected fix prompt template type'
    );

    // Execute patch based on template type
    let patchedContent: string;
    let tokensUsed: number;

    if (
      templateType === 'coherence_preserving' &&
      iterationContext.iterationHistory &&
      iterationContext.lessonSpec
    ) {
      const coherenceResult = await applyCoherencePreservingPatch(
        task,
        sectionContent,
        iterationContext,
        llmCall,
        onStreamEvent
      );
      patchedContent = coherenceResult.patchedContent;
      tokensUsed = coherenceResult.tokensUsed;
    } else {
      if (templateType === 'coherence_preserving') {
        logger.warn(
          {
            sectionId: task.sectionId,
            templateType,
            hasLessonSpec: !!iterationContext.lessonSpec,
            hasIterationHistory: !!iterationContext.iterationHistory,
            historyLength: iterationContext.iterationHistory?.length || 0,
          },
          'Coherence template selected but prerequisites missing - falling back to standard patcher'
        );
      }

      const standardResult = await applyStandardPatch(
        task,
        sectionContent,
        iterationContext,
        content,
        llmCall,
        onStreamEvent
      );
      patchedContent = standardResult.patchedContent;
      tokensUsed = standardResult.tokensUsed;
    }

    // Run full mermaid fix pipeline on patched content (regex → validate → LLM fix → revalidate → fallback)
    const mermaidResult = await runMermaidFixPipeline(patchedContent);
    if (mermaidResult.modified) {
      patchedContent = mermaidResult.content;
      logger.debug(
        { sectionId: task.sectionId, metrics: mermaidResult.metrics },
        'Patcher: Mermaid fix pipeline applied to patched content'
      );
    }

    // Verify patch using Delta Judge
    const verificationResult = await verifyPatchIfChanged(
      sectionContent,
      patchedContent,
      task,
      onStreamEvent
    );

    return {
      success: verificationResult.passed,
      sectionId: task.sectionId,
      patchedContent: verificationResult.passed ? patchedContent : sectionContent,
      tokensUsed: tokensUsed + verificationResult.tokensUsed,
    };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        sectionId: task.sectionId,
        taskType: 'SURGICAL_EDIT',
      },
      'Patcher task failed with error'
    );

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
 * Try to fix issues with InlineFixer first
 *
 * @param task - Refinement task
 * @param sectionContent - Section content
 * @param onStreamEvent - Event emitter
 * @returns Inline fixer result with updated content and skip flag
 */
function tryInlineFixer(
  task: SectionRefinementTask,
  sectionContent: string,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined
): { content: string; skipPatcher: boolean } {
  if (!INLINE_FIXER_ENABLED || task.sourceIssues.length === 0) {
    return { content: sectionContent, skipPatcher: false };
  }

  const inlineResult = processInlineFixes(sectionContent, task.sourceIssues);

  if (inlineResult.appliedFixes.length === 0) {
    return { content: sectionContent, skipPatcher: false };
  }

  logger.info(
    {
      sectionId: task.sectionId,
      appliedCount: inlineResult.appliedFixes.length,
      failedCount: inlineResult.failedFixes.length,
      tokensSaved: inlineResult.metrics.tokensSaved,
    },
    'InlineFixer applied surgical fixes'
  );

  // If all issues fixed, skip Patcher
  if (inlineResult.failedFixes.length === 0) {
    logger.info(
      {
        sectionId: task.sectionId,
        totalIssues: task.sourceIssues.length,
        tokensSaved: inlineResult.metrics.tokensSaved,
      },
      'All issues fixed by InlineFixer - skipping Patcher'
    );

    emitEvent(onStreamEvent, {
      type: 'patch_applied',
      sectionId: task.sectionId,
      content: inlineResult.content,
      diffSummary: `InlineFixer applied ${inlineResult.appliedFixes.length} fixes (${inlineResult.metrics.tokensSaved} tokens saved)`,
    });

    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: true,
    });

    return { content: inlineResult.content, skipPatcher: true };
  }

  return { content: inlineResult.content, skipPatcher: false };
}

/**
 * Verify patch if content changed
 *
 * @param originalContent - Original section content
 * @param patchedContent - Patched section content
 * @param task - Refinement task
 * @param onStreamEvent - Event emitter
 * @returns Verification result with pass status and tokens used
 */
async function verifyPatchIfChanged(
  originalContent: string,
  patchedContent: string,
  task: SectionRefinementTask,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined
): Promise<{ passed: boolean; tokensUsed: number }> {
  if (patchedContent === originalContent) {
    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: true,
    });
    return { passed: true, tokensUsed: 0 };
  }

  try {
    const result = await verifyPatchWithDeltaJudge(
      originalContent,
      patchedContent,
      task,
      onStreamEvent
    );

    logger.info(
      {
        sectionId: task.sectionId,
        passed: result.passed,
        tokensUsed: result.tokensUsed,
      },
      'Delta Judge verification complete'
    );

    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: result.passed,
    });

    return result;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        sectionId: task.sectionId,
      },
      'Delta Judge verification failed, assuming pass'
    );

    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: true,
    });

    return { passed: true, tokensUsed: 0 };
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
): Promise<{
  success: boolean;
  sectionId: string;
  regeneratedContent: string;
  tokensUsed: number;
}> {
  try {
    emitEvent(onStreamEvent, {
      type: 'task_started',
      sectionId: task.sectionId,
      taskType: 'REGENERATE_SECTION',
    });

    // Validate and normalize language parameter
    let validatedLanguage = language;
    if (
      language &&
      !SUPPORTED_LANGUAGES.includes(language as (typeof SUPPORTED_LANGUAGES)[number])
    ) {
      logger.warn(
        {
          sectionId: task.sectionId,
          providedLanguage: language,
          fallback: 'en',
        },
        'Invalid language code, falling back to English'
      );
      validatedLanguage = 'en';
    }

    logger.debug(
      {
        sectionId: task.sectionId,
        language: validatedLanguage || 'default (en)',
        issuesCount: task.sourceIssues.length,
      },
      'Executing Section-Expander task'
    );

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

    // Run full mermaid fix pipeline on expanded content (regex → validate → LLM fix → revalidate → fallback)
    let expandedContent = expandResult.regeneratedContent;
    const mermaidResult = await runMermaidFixPipeline(expandedContent);
    if (mermaidResult.modified) {
      expandedContent = mermaidResult.content;
      logger.debug(
        { sectionId: task.sectionId, metrics: mermaidResult.metrics },
        'Expander: Mermaid fix pipeline applied to expanded content'
      );
    }

    emitEvent(onStreamEvent, {
      type: 'patch_applied',
      sectionId: task.sectionId,
      content: expandedContent,
      diffSummary: `Regenerated section (${expandResult.wordCount} words)`,
    });

    // Verify regeneration using Delta Judge
    let verificationPassed = true;
    let deltaJudgeTokens = 0;

    if (expandedContent !== sectionContent && expandResult.success) {
      try {
        const result = await verifyPatchWithDeltaJudge(
          sectionContent,
          expandedContent,
          task,
          onStreamEvent
        );
        verificationPassed = result.passed;
        deltaJudgeTokens = result.tokensUsed;

        logger.info(
          {
            sectionId: task.sectionId,
            passed: result.passed,
            tokensUsed: result.tokensUsed,
          },
          'Delta Judge verification complete for expansion'
        );
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            sectionId: task.sectionId,
          },
          'Delta Judge verification failed for expansion, assuming pass'
        );
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
      regeneratedContent: verificationPassed ? expandedContent : sectionContent,
      tokensUsed: expandResult.tokensUsed + deltaJudgeTokens,
    };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        sectionId: task.sectionId,
        taskType: 'REGENERATE_SECTION',
      },
      'Section-Expander task failed with error'
    );

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
