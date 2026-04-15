import { DEFAULT_FALLBACK_MODEL_ID, DEFAULT_MODEL_ID } from './model-defaults';

export interface Stage6CanonicalPhaseConfig {
  modelId: string;
  fallbackModelId: string;
  temperature: number;
  maxTokens: number;
  maxContextTokens: number;
  qualityThreshold: number | null;
  maxRetries: number;
  timeoutMs: number | null;
  cacheReadEnabled: boolean;
  tier: 'standard' | 'extended';
}

function createStage6Config(
  overrides: Partial<Stage6CanonicalPhaseConfig> & Pick<Stage6CanonicalPhaseConfig, 'modelId'>
): Stage6CanonicalPhaseConfig {
  return {
    modelId: overrides.modelId,
    fallbackModelId: overrides.fallbackModelId ?? DEFAULT_FALLBACK_MODEL_ID,
    temperature: overrides.temperature ?? 0.7,
    maxTokens: overrides.maxTokens ?? 8000,
    maxContextTokens: overrides.maxContextTokens ?? 128000,
    qualityThreshold: overrides.qualityThreshold ?? null,
    maxRetries: overrides.maxRetries ?? 3,
    timeoutMs: overrides.timeoutMs ?? 300000,
    cacheReadEnabled: overrides.cacheReadEnabled ?? false,
    tier: overrides.tier ?? 'standard',
  };
}

export const STAGE6_CANONICAL_PHASE_DEFAULTS = {
  stage_6_content: createStage6Config({
    modelId: 'moonshotai/kimi-k2-thinking',
    fallbackModelId: 'qwen/qwen3.5-plus-02-15',
  }),
  stage_6_refinement: createStage6Config({
    modelId: DEFAULT_MODEL_ID,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
    temperature: 0.5,
  }),
  stage_6_rag_planning: createStage6Config({
    modelId: DEFAULT_MODEL_ID,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
    temperature: 0.3,
    maxTokens: 4096,
  }),
  stage_6_simple: createStage6Config({
    modelId: DEFAULT_MODEL_ID,
    fallbackModelId: 'moonshotai/kimi-k2-thinking',
  }),
  stage_6_normal: createStage6Config({
    modelId: 'moonshotai/kimi-k2-thinking',
    fallbackModelId: 'google/gemini-3-flash-preview',
  }),
  stage_6_complex: createStage6Config({
    modelId: 'qwen/qwen3.5-plus-02-15',
    fallbackModelId: 'moonshotai/kimi-k2-thinking',
  }),
  stage_6_auto_last_chance: createStage6Config({
    modelId: 'z-ai/glm-5',
    fallbackModelId: 'qwen/qwen3.5-plus-02-15',
    maxTokens: 12000,
  }),
  stage_6_manual_regeneration: createStage6Config({
    modelId: 'openai/gpt-5.4',
    fallbackModelId: 'z-ai/glm-5',
    maxTokens: 12000,
  }),
  stage_6_arbiter: createStage6Config({
    modelId: DEFAULT_MODEL_ID,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
    temperature: 0.0,
    maxTokens: 2048,
  }),
  stage_6_patcher: createStage6Config({
    modelId: DEFAULT_MODEL_ID,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
    temperature: 0.1,
    maxTokens: 1000,
  }),
  stage_6_section_expander: createStage6Config({
    modelId: DEFAULT_MODEL_ID,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
    maxTokens: 2000,
  }),
  stage_6_delta_judge: createStage6Config({
    modelId: DEFAULT_MODEL_ID,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
    temperature: 0.0,
    maxTokens: 512,
  }),
} as const;

export type Stage6CanonicalPhaseName = keyof typeof STAGE6_CANONICAL_PHASE_DEFAULTS;

export const STAGE6_EXPLICIT_PHASE_NAMES = [
  'stage_6_content',
  'stage_6_refinement',
  'stage_6_rag_planning',
  'stage_6_auto_last_chance',
  'stage_6_manual_regeneration',
  'stage_6_arbiter',
  'stage_6_patcher',
  'stage_6_section_expander',
  'stage_6_delta_judge',
] as const satisfies readonly Stage6CanonicalPhaseName[];

export const STAGE6_TIER_MODELS = {
  simple: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_simple.modelId,
  normal: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_normal.modelId,
  complex: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_complex.modelId,
} as const;

export const STAGE6_TIER_FALLBACKS = {
  simple: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_simple.fallbackModelId,
  normal: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_normal.fallbackModelId,
  complex: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_complex.fallbackModelId,
} as const;

export function getStage6CanonicalPhaseConfig(
  phaseName: string
): Stage6CanonicalPhaseConfig | null {
  return phaseName in STAGE6_CANONICAL_PHASE_DEFAULTS
    ? STAGE6_CANONICAL_PHASE_DEFAULTS[phaseName as keyof typeof STAGE6_CANONICAL_PHASE_DEFAULTS]
    : null;
}
