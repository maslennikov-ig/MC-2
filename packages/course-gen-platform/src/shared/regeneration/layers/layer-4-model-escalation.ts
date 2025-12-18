/**
 * Layer 4: Model Escalation
 *
 * Escalates to a larger, more capable model when smaller models fail.
 * Extracted from orchestrator/services/analysis/phase-2-scope.ts for reusability.
 *
 * Pattern:
 * - Start with cost-efficient model (20B)
 * - Escalate to expert model (120B) if needed
 * - Configurable escalation chain
 *
 * @module shared/regeneration/layers/layer-4-model-escalation
 * @see packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts (lines 166-178)
 */

import { getModelForPhase } from '@/shared/llm/langchain-models';
import type { PhaseName } from '@megacampus/shared-types/model-config';
import logger from '@/shared/logger';

/**
 * Model escalation result
 */
export interface ModelEscalationResult {
  /** Raw output from escalated model */
  output: string;
  /** Model that succeeded */
  modelUsed: string;
  /** Phase name that succeeded */
  phaseUsed: PhaseName;
}

/**
 * Escalates to a larger model in the chain
 *
 * Tries each phase in the escalation chain until one succeeds.
 *
 * @param prompt - Prompt to invoke on escalated model
 * @param courseId - Course ID for model configuration
 * @param escalationChain - Array of phase names to try in order (default: ['stage_4_expert'])
 * @returns Model escalation result with output and metadata
 * @throws Error if all models in escalation chain fail
 *
 * @example
 * ```typescript
 * import { escalateToLargerModel } from '@/shared/regeneration/layers/layer-4-model-escalation';
 *
 * // Escalate to 120B model
 * const result = await escalateToLargerModel(
 *   prompt,
 *   courseId,
 *   ['stage_4_expert'] // 120B model
 * );
 *
 * console.log(result.output); // Raw JSON from model
 * console.log(result.modelUsed); // 'openai/gpt-oss-120b'
 * console.log(result.phaseUsed); // 'stage_4_expert'
 * ```
 */
export async function escalateToLargerModel(
  prompt: string,
  courseId: string,
  escalationChain: PhaseName[] = ['stage_4_expert']
): Promise<ModelEscalationResult> {
  logger.info(
    { escalationChain },
    'Layer 4: Model escalation starting'
  );

  for (const phase of escalationChain) {
    try {
      logger.debug({ phase }, 'Trying escalated model');

      const model = await getModelForPhase(phase, courseId);
      const modelId = model.model || 'unknown';

      logger.debug({ modelId, phase }, 'Invoking escalated model');

      const response = await model.invoke(prompt);
      const output = response.content as string;

      // Verify output is parseable JSON
      JSON.parse(output);

      logger.info(
        { phase, modelId },
        'Layer 4: Model escalation succeeded'
      );

      return {
        output,
        modelUsed: modelId,
        phaseUsed: phase,
      };
    } catch (error) {
      logger.warn(
        {
          phase,
          error: error instanceof Error ? error.message : String(error),
        },
        'Escalated model failed'
      );

      // Continue to next model in chain
      continue;
    }
  }

  // All models failed
  throw new Error(
    `Layer 4 (Model escalation) failed: All models in chain exhausted [${escalationChain.join(', ')}]`
  );
}

/**
 * Gets appropriate escalation chain for a given stage and phase
 *
 * Provides sensible defaults for common scenarios.
 *
 * @param stage - Regeneration stage (analyze, generation, etc.)
 * @param currentPhase - Current phase that failed (optional)
 * @returns Array of phase names for escalation
 *
 * @example
 * ```typescript
 * import { getEscalationChain } from '@/shared/regeneration/layers/layer-4-model-escalation';
 *
 * // For Analyze stage Phase 2
 * const chain = getEscalationChain('analyze', 'stage_4_scope');
 * console.log(chain); // ['stage_4_expert']
 *
 * // For Generation stage
 * const genChain = getEscalationChain('generation');
 * console.log(genChain); // ['stage_4_expert']
 * ```
 */
export function getEscalationChain(
  stage: string,
  currentPhase?: string
): PhaseName[] {
  // Default escalation: Go to expert model (120B)
  const defaultChain: PhaseName[] = ['stage_4_expert'];

  // Stage-specific overrides
  if (stage === 'analyze') {
    // Analyze already uses stage_4_scope (20B) or stage_4_expert (120B)
    // If stage_4_scope failed, escalate to stage_4_expert
    if (currentPhase === 'stage_4_scope') {
      return ['stage_4_expert'];
    }

    // If stage_4_expert failed, no further escalation (go to emergency)
    if (currentPhase === 'stage_4_expert') {
      return [];
    }
  }

  if (stage === 'generation') {
    // Generation uses cost-optimized models
    // Escalate to expert model if needed
    return ['stage_4_expert'];
  }

  return defaultChain;
}
