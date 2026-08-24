/**
 * Which model the next attempt should use, and how the ladder records what it tried.
 *
 * @module quality-ladder-plan
 *
 * Split out of `job-processor.ts`. The seam is the same one that separated `model-fallback.ts`,
 * one level up: this decides WHICH rung and which model, while that one runs a single attempt
 * and judges its result. The processor between them is left with the job's own sequence.
 *
 * `buildZeroMetrics` lives here because the only caller that needs it is the failure path, and
 * the fields it fills are the ladder's own — which model was chosen, from which phase, by which
 * source — for a run that produced nothing.
 */

import { MODEL_FALLBACK } from '../config';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import { selectStage6ModelTier } from '../nodes/generator/model-selector';
import type {
  Stage6ExecutionPolicy,
  Stage6JobInput,
  Stage6JobResult,
  Stage6ModelTierName,
  Stage6QualityRecoveryAttemptHistory,
  Stage6QualityRecoveryHistory,
} from '../types';
import type {
  Stage6AutomaticQualityRungPhaseName,
  Stage6QualityRungPhaseName,
} from '@megacampus/shared-types/stage6-quality-recovery';

export function buildZeroMetrics(
  tierResult: {
    model: string | null;
    fallback: string | null;
    tier: Stage6ModelTierName | null;
    reason: string | null;
    phaseName?: string | null;
    source?: string | null;
  },
  durationMs: number
): Stage6JobResult['metrics'] {
  return {
    tokensUsed: 0,
    durationMs,
    modelUsed: null,
    selectedModel: tierResult.model,
    fallbackModel: tierResult.fallback,
    selectedModelTier: tierResult.tier,
    selectedModelTierReason: tierResult.reason,
    selectedModelPhase: tierResult.phaseName ?? null,
    selectedModelSource: tierResult.source ?? null,
    qualityScore: 0,
    regenerateCount: 0,
    truncationCount: 0,
    rejectedTokens: 0,
    regenerationMode: null,
    attemptLadder: [],
  };
}

export interface ResolvedStage6ExecutionPlan {
  initialAutomaticTier: {
    tier: Stage6ModelTierName;
    reason: string;
  } | null;
  initialAutomaticRung?: Stage6AutomaticQualityRungPhaseName;
  qualityRecovery: Stage6QualityRecoveryHistory;
}

export interface ResolvedRungModelConfig {
  primary: string;
  fallback: string;
  source: string;
  maxTokens: number | null;
}

export function isManualTopRegenerationPolicy(
  policy?: Stage6ExecutionPolicy
): policy is Stage6ExecutionPolicy {
  return policy?.mode === 'manual_top_regeneration';
}

export function mapTierToAutomaticRung(
  tier: Stage6ModelTierName
): Stage6AutomaticQualityRungPhaseName {
  return `stage_6_${tier}` as Stage6AutomaticQualityRungPhaseName;
}

export function mapRungToLegacyTier(
  phaseName: Stage6QualityRungPhaseName
): Stage6ModelTierName | null {
  switch (phaseName) {
    case 'stage_6_simple':
      return 'simple';
    case 'stage_6_normal':
      return 'normal';
    case 'stage_6_complex':
      return 'complex';
    default:
      return null;
  }
}

export async function resolveRungModelConfig(
  phaseName: Stage6QualityRungPhaseName,
  courseId: string,
  language: string
): Promise<ResolvedRungModelConfig> {
  const modelConfigService = createModelConfigService();
  const phaseConfig = await modelConfigService.getModelForPhase(
    phaseName,
    courseId,
    undefined,
    language
  );

  return {
    primary: phaseConfig.modelId,
    fallback: phaseConfig.fallbackModelId ?? MODEL_FALLBACK.fallback,
    source: phaseConfig.source,
    maxTokens: phaseConfig.maxTokens ?? null,
  };
}

export async function resolveStage6ExecutionPlan(
  lessonSpec: Stage6JobInput['lessonSpec'],
  courseId: string,
  executionPolicy?: Stage6ExecutionPolicy
): Promise<ResolvedStage6ExecutionPlan> {
  if (isManualTopRegenerationPolicy(executionPolicy)) {
    return {
      initialAutomaticTier: null,
      qualityRecovery: {
        mode: 'manual',
        manual_triggered: true,
        attempts: [],
      },
    };
  }

  const tierResult = await selectStage6ModelTier(lessonSpec, courseId);

  return {
    initialAutomaticTier: {
      tier: tierResult.tier,
      reason: tierResult.reason,
    },
    initialAutomaticRung: mapTierToAutomaticRung(tierResult.tier),
    qualityRecovery: {
      mode: 'automatic',
      attempts: [],
    },
  };
}

export function createSameTierRetryReason(
  phaseName: Stage6QualityRungPhaseName,
  rungAttemptIndex: number
): string {
  return rungAttemptIndex === 0
    ? `Initial quality rung ${phaseName}`
    : `Same-tier retry ${rungAttemptIndex} for ${phaseName}`;
}

export function createPromotedRungReason(
  phaseName: Stage6QualityRungPhaseName,
  promotedFromPhaseName: Stage6QualityRungPhaseName | undefined
): string {
  if (promotedFromPhaseName) {
    return `Promoted from ${promotedFromPhaseName} to ${phaseName} after quality_retryable`;
  }

  return `Quality rung ${phaseName}`;
}

export function createSelectedModelTierReason(
  rungPhaseName: Stage6QualityRungPhaseName,
  rungAttemptIndex: number,
  promotedFromPhaseName: Stage6QualityRungPhaseName | undefined,
  initialAutomaticTierReason: string | null,
  modelSource: string
): string {
  if (rungPhaseName === 'stage_6_manual_regeneration') {
    return `Manual top-model regeneration via ${rungPhaseName} (${modelSource})`;
  }

  if (promotedFromPhaseName) {
    return `${createPromotedRungReason(rungPhaseName, promotedFromPhaseName)} (${modelSource})`;
  }

  const retryReason = createSameTierRetryReason(rungPhaseName, rungAttemptIndex);
  if (initialAutomaticTierReason) {
    return `${initialAutomaticTierReason}; ${retryReason} (${modelSource})`;
  }

  return `${retryReason} (${modelSource})`;
}

export function appendQualityRecoveryAttempt(
  qualityRecovery: Stage6QualityRecoveryHistory,
  attempt: Stage6QualityRecoveryAttemptHistory
): void {
  qualityRecovery.attempts.push(attempt);
}
