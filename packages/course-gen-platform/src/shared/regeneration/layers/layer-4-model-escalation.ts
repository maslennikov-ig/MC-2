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
 * console.log(result.modelUsed); // 'deepseek/deepseek-v4-flash'
 * console.log(result.phaseUsed); // 'stage_4_expert'
 * ```
 */
export async function escalateToLargerModel(
  prompt: string,
  courseId: string,
  escalationChain: PhaseName[] = ['stage_4_expert']
): Promise<ModelEscalationResult> {
  logger.info({ escalationChain }, 'Layer 4: Model escalation starting');

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

      logger.info({ phase, modelId }, 'Layer 4: Model escalation succeeded');

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
 * console.log(genChain); // ['stage_5_escalation', 'stage_4_expert']
 * ```
 */
export function getEscalationChain(stage: string, currentPhase?: string): PhaseName[] {
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
    // Stage 5 escalates to the phase configured for exactly this, then keeps the
    // old expert hop behind it (mc2-9yrgb, owner's decision 2026-08-23).
    //
    // `stage_5_escalation` had six active rows, a screen in pipeline-admin, and
    // no caller: every caller of `escalateToLargerModel` passed a chain, and none
    // of them passed this one. Escalating a failed Stage 5 section to
    // `stage_4_expert` instead meant retrying on `openai/gpt-5.6-luna` — the
    // model that had just failed — with an 8000-token output budget, which is
    // below what `stage_5_simple` and `stage_5_complex` are given on a normal
    // attempt. `stage_5_escalation` carries 30000 output tokens, reasoning with
    // a reserved 8000-token budget, and `z-ai/glm-5.2` as its fallback, so the
    // second hop is a different vendor rather than the losing bet again.
    //
    // Output ceilings checked before wiring this up, because a budget above the
    // model's ceiling trades silent inaction for a loud refusal on a live course:
    // luna 128000, glm-5.2 262144, deepseek-v4-flash-0731 384000 — all far above
    // 30000. The 16384-capped model the warning in
    // `pipeline-admin/model-budget-validation.ts` describes left these rows on
    // 2026-08-12 and `assertBudgetFitsModel` now refuses to save such a pair.
    //
    // `stage_4_expert` stays second rather than being replaced: if
    // `stage_5_escalation` cannot be resolved, the behaviour is the one that has
    // been running, not an exception.
    return ['stage_5_escalation', 'stage_4_expert'];
  }

  return defaultChain;
}
