import {
  STAGE6_AUTOMATIC_QUALITY_RUNGS as SHARED_STAGE6_AUTOMATIC_QUALITY_RUNGS,
  STAGE6_MANUAL_QUALITY_RUNG as SHARED_STAGE6_MANUAL_QUALITY_RUNG,
  type QualityRecoveryMode,
  type Stage6QualityRungPhaseName,
} from '@megacampus/shared-types/stage6-quality-recovery';

export interface Stage6QualityRungConfig {
  phaseName: Stage6QualityRungPhaseName;
  mode: QualityRecoveryMode;
  initialMaxRegenerationRetries: number;
  promotedMaxRegenerationRetries: number;
}

export const STAGE6_AUTOMATIC_QUALITY_RUNGS = SHARED_STAGE6_AUTOMATIC_QUALITY_RUNGS;
export const STAGE6_MANUAL_QUALITY_RUNG = SHARED_STAGE6_MANUAL_QUALITY_RUNG;

export const STAGE6_QUALITY_RUNG_CONFIGS: Record<
  Stage6QualityRungPhaseName,
  Stage6QualityRungConfig
> = {
  stage_6_simple: {
    phaseName: 'stage_6_simple',
    mode: 'automatic',
    initialMaxRegenerationRetries: 1,
    promotedMaxRegenerationRetries: 0,
  },
  stage_6_normal: {
    phaseName: 'stage_6_normal',
    mode: 'automatic',
    initialMaxRegenerationRetries: 1,
    promotedMaxRegenerationRetries: 0,
  },
  stage_6_complex: {
    phaseName: 'stage_6_complex',
    mode: 'automatic',
    initialMaxRegenerationRetries: 1,
    promotedMaxRegenerationRetries: 0,
  },
  stage_6_auto_last_chance: {
    phaseName: 'stage_6_auto_last_chance',
    mode: 'automatic',
    initialMaxRegenerationRetries: 0,
    promotedMaxRegenerationRetries: 1,
  },
  stage_6_manual_regeneration: {
    phaseName: 'stage_6_manual_regeneration',
    mode: 'manual',
    initialMaxRegenerationRetries: 0,
    promotedMaxRegenerationRetries: 0,
  },
};
