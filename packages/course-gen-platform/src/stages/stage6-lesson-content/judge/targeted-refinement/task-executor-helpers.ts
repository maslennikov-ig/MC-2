/**
 * Task Executor Helper Functions
 * @module stages/stage6-lesson-content/judge/targeted-refinement/task-executor-helpers
 *
 * Extracted helper functions to reduce complexity of task-executor.ts
 * These functions represent logical phases of patch execution.
 */

import type {
  SectionRefinementTask,
  LessonContent,
  RefinementEvent,
} from '@megacampus/shared-types';
import type { LLMCallFn } from '../patcher';
import type { IterationContext } from './types';
import type { FixPromptContext } from '../fix-templates';

import { logger } from '../../../../shared/logger';
import { LLMClient } from '../../../../shared/llm';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';
import { validateGeneratedContent } from '../../nodes/generator/generator-content';

import { buildPatcherSystemPrompt } from '../patcher';
import { buildCoherencePreservingPrompt } from '../fix-templates';
import { emitEvent } from './events';

/**
 * Build coherence-preserving prompt for iteration-aware refinement
 *
 * @param task - Refinement task
 * @param sectionContent - Section content to refine
 * @param iterationContext - Iteration context with history
 * @returns Fix prompt context
 */
export function buildPatcherPrompt(
  task: SectionRefinementTask,
  sectionContent: string,
  iterationContext: IterationContext
): FixPromptContext | null {
  if (!iterationContext.iterationHistory || !iterationContext.lessonSpec) {
    return null;
  }

  return {
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
}

/**
 * Execute LLM call for patcher with model config
 *
 * @param prompt - User prompt
 * @param systemPrompt - System prompt
 * @param options - Generation options
 * @param llmCall - Optional custom LLM call function
 * @returns Generated content and token usage
 */
export async function executeLlmCall(
  prompt: string,
  systemPrompt: string,
  options: { maxTokens: number; temperature: number },
  llmCall?: LLMCallFn
): Promise<{ content: string; tokensUsed: number }> {
  if (llmCall) {
    return await llmCall(prompt, systemPrompt, options);
  }

  // Default LLM call implementation
  const llmClient = new LLMClient();
  const modelService = createModelConfigService();

  let modelId = 'unknown';
  try {
    const config = await modelService.getModelForPhase('stage_6_patcher');
    modelId = config.modelId;
    logger.info({ modelId, source: config.source }, 'Patcher using model from config');
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to get patcher model config, using fallback'
    );
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
 * Parse and validate patcher response
 *
 * Extracts the patched content from LLM response.
 *
 * @param response - LLM response
 * @returns Validated patched content
 */
export function parsePatcherResponse(response: { content: string; tokensUsed: number }): string {
  // Basic validation and trimming
  const patchedContent = response.content.trim();

  if (!patchedContent) {
    throw new Error('Patcher returned empty content');
  }

  return patchedContent;
}

/**
 * Apply coherence-preserving patch
 *
 * Executes the coherence-preserving refinement using iteration history.
 *
 * @param task - Refinement task
 * @param sectionContent - Section content
 * @param iterationContext - Iteration context
 * @param llmCall - Optional LLM call function
 * @param onStreamEvent - Event emitter
 * @returns Patched content and token usage
 */
export async function applyCoherencePreservingPatch(
  task: SectionRefinementTask,
  sectionContent: string,
  iterationContext: IterationContext,
  llmCall: LLMCallFn | undefined,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined
): Promise<{ patchedContent: string; tokensUsed: number }> {
  logger.info(
    {
      sectionId: task.sectionId,
      iteration: iterationContext.iteration,
      historyLength: iterationContext.iterationHistory?.length || 0,
    },
    'Using coherence preserving template with iteration history'
  );

  // Build prompt context
  const fixPromptContext = buildPatcherPrompt(task, sectionContent, iterationContext);

  if (!fixPromptContext) {
    throw new Error('Cannot build coherence prompt: missing prerequisites');
  }

  const coherencePrompt = buildCoherencePreservingPrompt(fixPromptContext);

  // Execute LLM call
  const response = await executeLlmCall(
    coherencePrompt,
    buildPatcherSystemPrompt(),
    { maxTokens: 1200, temperature: 0.1 },
    llmCall
  );

  logger.info(
    {
      sectionId: task.sectionId,
      tokensUsed: response.tokensUsed,
      outputLength: response.content.length,
    },
    'Coherence preserving prompt execution complete'
  );

  // Parse response
  const patchedContent = parsePatcherResponse(response);

  // Validate for prompt template markers (hallucination detection)
  const markerValidation = validateGeneratedContent(patchedContent);
  if (!markerValidation.isValid) {
    logger.warn(
      {
        event: 'hallucination_detected',
        component: 'coherence-patcher',
        sectionId: task.sectionId,
        markersCount: markerValidation.detectedMarkers.length,
        detectedMarkers: markerValidation.detectedMarkers,
      },
      'Coherence patcher: REJECTED - response contains prompt template markers'
    );

    return {
      patchedContent: sectionContent,
      tokensUsed: response.tokensUsed,
    };
  }

  // Emit event
  emitEvent(onStreamEvent, {
    type: 'patch_applied',
    sectionId: task.sectionId,
    content: patchedContent,
    diffSummary: 'Coherence preserving refinement applied',
  });

  return {
    patchedContent,
    tokensUsed: response.tokensUsed,
  };
}

/**
 * Apply standard patcher patch
 *
 * Executes standard patcher without iteration history.
 *
 * @param task - Refinement task
 * @param sectionContent - Section content
 * @param iterationContext - Iteration context
 * @param content - Full lesson content
 * @param llmCall - Optional LLM call function
 * @param onStreamEvent - Event emitter
 * @returns Patched content and token usage
 */
export async function applyStandardPatch(
  task: SectionRefinementTask,
  sectionContent: string,
  iterationContext: IterationContext,
  _content: LessonContent,
  llmCall: LLMCallFn | undefined,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined
): Promise<{ patchedContent: string; tokensUsed: number; success: boolean }> {
  logger.info(
    {
      sectionId: task.sectionId,
    },
    'Using standard patcher'
  );

  const executePatch = (await import('../patcher')).executePatch;

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

  return {
    patchedContent: patchResult.patchedContent,
    tokensUsed: patchResult.tokensUsed,
    success: patchResult.success,
  };
}
