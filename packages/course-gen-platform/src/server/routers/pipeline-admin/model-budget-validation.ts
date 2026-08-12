import { TRPCError } from '@trpc/server';
import { getModelCapabilities } from '@megacampus/shared-types';

/**
 * Refuse a phase budget the provider cannot honour.
 *
 * On 2026-08-12 two live rows asked for more than the model could emit —
 * stage_5_escalation wanted 30000 output tokens from a model capped at 16384,
 * and stage_7_cover claimed a 128K input budget from a 32K-context model.
 * Nothing rejected either value when it was saved, and nothing complained
 * afterwards; the provider simply clamped or errored at request time.
 */
export function assertBudgetFitsModel(
  modelId: string,
  maxTokens: number | null | undefined,
  maxContextTokens?: number | null
): void {
  const capabilities = getModelCapabilities(modelId);
  if (!capabilities) return;

  if (maxTokens && capabilities.maxOutputTokens && maxTokens > capabilities.maxOutputTokens) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${modelId} emits at most ${capabilities.maxOutputTokens} output tokens; ${maxTokens} was requested.`,
    });
  }

  if (
    maxContextTokens &&
    capabilities.contextLength &&
    maxContextTokens > capabilities.contextLength
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${modelId} has a ${capabilities.contextLength}-token context; ${maxContextTokens} was requested.`,
    });
  }
}
