import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';
import {
  STAGE6_CANONICAL_PHASE_DEFAULTS,
  STAGE6_EXPLICIT_PHASE_NAMES,
} from '@megacampus/shared-types/stage6-model-config';
import { DEFAULT_MODEL_CONFIGS } from '@/server/routers/pipeline-admin/constants';
import { DEFAULT_PHASE_CONFIGS } from '@/shared/llm/model-config-db';

const seedPath = new URL('../../../../src/config/config-seed.json', import.meta.url);
const seedRows = JSON.parse(readFileSync(seedPath, 'utf8')) as Array<Record<string, unknown>>;

describe('stage6 fallback topology', () => {
  it('seeds every canonical explicit Stage 6 phase as global standard any', () => {
    for (const phaseName of STAGE6_EXPLICIT_PHASE_NAMES) {
      expect(
        seedRows.find(
          row =>
            row.phase_name === phaseName &&
            row.config_type === 'global' &&
            row.language === 'any' &&
            row.context_tier === 'standard' &&
            row.judge_role == null
        ),
        `Missing seed entry for ${phaseName}`
      ).toBeTruthy();
    }
  });

  it('keeps escalation and manual canonical defaults off the retired default-model path', () => {
    const autoLastChance = STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance;
    const manualRegeneration = STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration;

    // Both hops must stay off DEFAULT_MODEL_ID: escalation only runs after the
    // default model has already failed on this lesson.
    expect(autoLastChance.modelId).toBe('z-ai/glm-5.2');
    expect(autoLastChance.modelId).not.toBe(DEFAULT_MODEL_ID);
    expect(autoLastChance.fallbackModelId).not.toBe(DEFAULT_MODEL_ID);
    expect(autoLastChance.fallbackModelId).not.toBe(autoLastChance.modelId);

    expect(manualRegeneration.modelId).not.toBe(DEFAULT_MODEL_ID);
    expect(manualRegeneration.fallbackModelId).toBe('z-ai/glm-5.2');
    expect(manualRegeneration.fallbackModelId).not.toBe(DEFAULT_MODEL_ID);
    expect(manualRegeneration.fallbackModelId).not.toBe(manualRegeneration.modelId);
  });

  it('aligns admin defaults and loader defaults with canonical Stage 6 mapping', () => {
    expect(DEFAULT_MODEL_CONFIGS.stage_6_auto_last_chance).toMatchObject({
      modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.modelId,
      fallbackModelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.fallbackModelId,
      temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.temperature,
      maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.maxTokens,
    });

    expect(DEFAULT_MODEL_CONFIGS.stage_6_manual_regeneration).toMatchObject({
      modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.modelId,
      fallbackModelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.fallbackModelId,
      temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.temperature,
      maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.maxTokens,
    });

    expect(DEFAULT_PHASE_CONFIGS.stage_6_content).toMatchObject({
      modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.modelId,
      fallbackModelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.fallbackModelId,
      temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.temperature,
      maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.maxTokens,
    });
  });
});
