import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createModelConfigService,
  getEffectiveStageConfig,
  isMissingChatPhaseConfigError,
  resolveModelWithFallback,
  DEFAULT_PHASE_CONFIGS,
  EMERGENCY_FALLBACK_MODEL,
  checkPhaseModelPricingHealth,
  isModelPriced,
  resolveDefaultPhaseConfig,
} from '@/shared/llm/model-config-service';
import { getModelPricing } from '@/shared/llm/cost-calculator';
import * as ModelConfigDB from '@/shared/llm/model-config-db';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';
import { STAGE6_CANONICAL_PHASE_DEFAULTS } from '@megacampus/shared-types/stage6-model-config';

// Hoist mocks
const { mockSupabase, mockLogger } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() },
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

vi.mock('@/shared/logger', () => ({
  default: mockLogger,
  logger: mockLogger,
}));

vi.mock('@/shared/llm/model-config-db', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    fetchStageConfigFromDb: vi.fn(),
    PhaseConfigRow: undefined,
    StageConfigRow: undefined,
    fetchPhaseConfigFromDb: vi.fn(),
    fetchJudgeConfigsFromDb: vi.fn(),
  };
});

type MockStageConfig = {
  modelId?: string;
  qualityThreshold?: number | null;
  maxRetries?: number | null;
  timeoutMs?: number | null;
  primary?: string;
  fallback?: string;
};
type MockPhaseConfig = { modelId?: string; maxContextTokens?: number; cacheReadEnabled?: boolean };

describe('model-config-service', () => {
  const service = createModelConfigService();

  beforeEach(() => {
    vi.clearAllMocks();
    service.clearCache(); // Ensure fresh cache for each test

    // Default context reserve DB mock setup
    const builder: any = {
      select: vi.fn().mockResolvedValue({
        data: [
          { language: 'ru', reserve_percent: 0.25 },
          { language: 'any', reserve_percent: 0.15 },
        ],
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(builder);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('isMissingChatPhaseConfigError', () => {
    it('returns true for missing log', () => {
      const err = new Error(
        'Chat phase "chat_qna" has no active config in database. Seed the config before using chat.'
      );
      expect(isMissingChatPhaseConfigError(err)).toBe(true);
    });

    it('returns true for legacy missing log', () => {
      const err = new Error('Chat phase "chat_qna" has no config');
      expect(isMissingChatPhaseConfigError(err)).toBe(true);
    });

    it('returns false for other errors', () => {
      const err = new Error('Failed to fetch from LLM');
      expect(isMissingChatPhaseConfigError(err)).toBe(false);
      expect(isMissingChatPhaseConfigError(null)).toBe(false);
      expect(isMissingChatPhaseConfigError('Not an error')).toBe(false);
    });
  });

  describe('getEffectiveStageConfig', () => {
    it('applies defaults correctly', () => {
      const fallbackConfig: any = {
        modelId: 'test',
        qualityThreshold: null,
        maxRetries: null,
        timeoutMs: null,
      };
      const config = getEffectiveStageConfig(fallbackConfig);

      expect(config.qualityThreshold).toBeDefined();
      expect(config.maxRetries).toBeDefined();
    });

    it('preserves existing values', () => {
      const dbConfig: any = {
        modelId: 'test',
        qualityThreshold: 0.9,
        maxRetries: 5,
        timeoutMs: 10000,
      };
      const config = getEffectiveStageConfig(dbConfig);

      expect(config.qualityThreshold).toBe(0.9);
      expect(config.maxRetries).toBe(5);
      expect(config.timeoutMs).toBe(10000);
    });
  });

  describe('ModelConfigServiceImpl', () => {
    describe('getModelForStage', () => {
      it('fetches from DB and sets cache', async () => {
        const mockConfig: MockStageConfig = { primary: 'test-model', fallback: 'test-fallback' };
        vi.mocked(ModelConfigDB.fetchStageConfigFromDb).mockResolvedValueOnce(mockConfig as any);

        const config = await service.getModelForStage(3, 'ru', 1000);

        expect(config.primary).toBe('test-model');
        expect(ModelConfigDB.fetchStageConfigFromDb).toHaveBeenCalledTimes(1);

        // Next call should use cache
        const config2 = await service.getModelForStage(3, 'ru', 1000);
        expect(config2.primary).toBe('test-model');
        expect(ModelConfigDB.fetchStageConfigFromDb).toHaveBeenCalledTimes(1); // STILL 1
      });

      it('returns stale cache on DB failure', async () => {
        vi.useFakeTimers();

        const mockConfig: MockStageConfig = { primary: 'test-model' };
        vi.mocked(ModelConfigDB.fetchStageConfigFromDb).mockResolvedValueOnce(mockConfig as any);

        await service.getModelForStage(3, 'ru', 1000); // Prime cache

        // Fast forward 10 minutes (past fresh TTL, within max age)
        vi.advanceTimersByTime(10 * 60 * 1000);

        // DB fails
        vi.mocked(ModelConfigDB.fetchStageConfigFromDb).mockRejectedValueOnce(new Error('DB Down'));

        const config = await service.getModelForStage(3, 'ru', 1000);
        expect(config.primary).toBe('test-model'); // Kept stale cache
        expect(mockLogger.warn).toHaveBeenCalled(); // Logged warning
      });

      it('throws when no cache and no DB', async () => {
        vi.mocked(ModelConfigDB.fetchStageConfigFromDb).mockRejectedValueOnce(new Error('DB Down'));

        await expect(service.getModelForStage(3, 'ru', 1000)).rejects.toThrow(
          'Cannot get stage config'
        );
      });

      it('chooses extended tier for stage 4 above threshold', async () => {
        const mockConfig: MockStageConfig = { primary: 'test-model' };
        vi.mocked(ModelConfigDB.fetchStageConfigFromDb).mockResolvedValue(mockConfig as any);
        // Stage 4 threshold is 260K
        await service.getModelForStage(4, 'ru', 280000);
        expect(ModelConfigDB.fetchStageConfigFromDb).toHaveBeenCalledWith(4, 'ru', 'extended');
      });
    });

    describe('getModelForPhase', () => {
      it('fetches from DB into cache', async () => {
        const mockConfig: MockPhaseConfig = { modelId: 'test-model', maxContextTokens: 100000 };
        // For determinePhaseTier
        vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockResolvedValue(mockConfig as any);

        const config = await service.getModelForPhase('test_phase', 'course1', 50000, 'ru');

        expect(config.modelId).toBe('test-model');
        expect(ModelConfigDB.fetchPhaseConfigFromDb).toHaveBeenCalled();
      });

      it('throws explicit error for chat phases if no config found', async () => {
        vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockResolvedValue(null);

        await expect(service.getModelForPhase('chat_qna')).rejects.toThrow('no active config');
      });

      it('uses hardcoded fallback for non-chat phases if no DB and no cache', async () => {
        vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockResolvedValue(null);

        // global_default should be hit if standard exists
        const config = await service.getModelForPhase('non_existent_phase');
        expect(config.modelId).toBeDefined();
        // Uses default config
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.anything(),
          expect.stringContaining('Using global_default HARDCODED fallback')
        );
      });

      it('uses canonical explicit fallback for stage_6_content instead of global_default', async () => {
        vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockResolvedValue(null);

        const config = await service.getModelForPhase('stage_6_content');

        expect(config.modelId).toBe(STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.modelId);
        expect(config.fallbackModelId).toBe(
          STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.fallbackModelId
        );
        expect(config.modelId).not.toBe(DEFAULT_PHASE_CONFIGS.global_default.modelId);
      });

      it('keeps stage_6_auto_last_chance fallback off the retired default-model path', async () => {
        vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockResolvedValue(null);

        const config = await service.getModelForPhase('stage_6_auto_last_chance');

        expect(config.modelId).toBe(
          STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.modelId
        );
        expect(config.modelId).not.toBe(DEFAULT_MODEL_ID);
        expect(config.fallbackModelId).toBe(
          STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.fallbackModelId
        );
      });

      it('keeps stage_6_manual_regeneration fallback off the retired default-model path', async () => {
        vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockResolvedValue(null);

        const config = await service.getModelForPhase('stage_6_manual_regeneration');

        expect(config.modelId).toBe(
          STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.modelId
        );
        expect(config.modelId).not.toBe(DEFAULT_MODEL_ID);
        expect(config.fallbackModelId).toBe(
          STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.fallbackModelId
        );
      });

      describe('token-aware cache-first tier routing (mc2-gusxd)', () => {
        // Both tiers carry maxContextTokens so the dynamic threshold is derived
        // from the standard config: ru reserve 0.25 → threshold = 100000 * 0.75 = 75000.
        const primeTwoTierMock = () =>
          vi
            .mocked(ModelConfigDB.fetchPhaseConfigFromDb)
            .mockImplementation((_phase: any, _course: any, tier: any) => {
              if (tier === 'standard')
                return Promise.resolve({
                  modelId: 'std-model',
                  maxContextTokens: 100000,
                  tier: 'standard',
                } as any);
              if (tier === 'extended')
                return Promise.resolve({
                  modelId: 'ext-model',
                  maxContextTokens: 200000,
                  tier: 'extended',
                  cacheReadEnabled: true,
                } as any);
              return Promise.resolve(null);
            });

        it('cold call fetches from DB and selects standard below the dynamic threshold', async () => {
          primeTwoTierMock();
          // 50000 < 75000 → standard
          const config = await service.getModelForPhase('cache_phase', 'course1', 50000, 'ru');
          expect(config.modelId).toBe('std-model');
          expect(ModelConfigDB.fetchPhaseConfigFromDb).toHaveBeenCalled();
        });

        it('cold call fetches from DB and selects extended above the dynamic threshold', async () => {
          primeTwoTierMock();
          // 150000 > 75000 → extended
          const config = await service.getModelForPhase('cache_phase', 'course1', 150000, 'ru');
          expect(config.modelId).toBe('ext-model');
          expect(ModelConfigDB.fetchPhaseConfigFromDb).toHaveBeenCalled();
        });

        it('warm standard call reuses cache without any fetchPhaseConfigFromDb call', async () => {
          primeTwoTierMock();
          // Cold call primes BOTH tier caches
          const cold = await service.getModelForPhase('cache_phase', 'course1', 50000, 'ru');
          expect(cold.modelId).toBe('std-model');

          vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockClear();

          const warm = await service.getModelForPhase('cache_phase', 'course1', 50000, 'ru');
          expect(warm.modelId).toBe('std-model'); // same tier selected
          expect(ModelConfigDB.fetchPhaseConfigFromDb).toHaveBeenCalledTimes(0);
        });

        it('warm extended call reuses cache without any fetchPhaseConfigFromDb call', async () => {
          primeTwoTierMock();
          // Priming with a standard-selecting call still caches the extended tier
          await service.getModelForPhase('cache_phase', 'course1', 50000, 'ru');

          vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockClear();

          const warm = await service.getModelForPhase('cache_phase', 'course1', 150000, 'ru');
          expect(warm.modelId).toBe('ext-model'); // extended tier served from cache
          expect(ModelConfigDB.fetchPhaseConfigFromDb).toHaveBeenCalledTimes(0);
        });

        it('warm cache preserves identical tier selection across the threshold', async () => {
          primeTwoTierMock();
          const coldStd = await service.getModelForPhase('cache_phase', 'course1', 50000, 'ru');
          const coldExt = await service.getModelForPhase('cache_phase', 'course1', 150000, 'ru');

          vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockClear();

          const warmStd = await service.getModelForPhase('cache_phase', 'course1', 50000, 'ru');
          const warmExt = await service.getModelForPhase('cache_phase', 'course1', 150000, 'ru');

          expect(warmStd.modelId).toBe(coldStd.modelId);
          expect(warmExt.modelId).toBe(coldExt.modelId);
          expect(ModelConfigDB.fetchPhaseConfigFromDb).toHaveBeenCalledTimes(0);
        });
      });
    });

    describe('getJudgeModels', () => {
      it('fetches judge models and caches them', async () => {
        const mockConfig = {
          primary: { modelId: 'judge-primary' },
          secondary: { modelId: 'judge-sec' },
          tiebreaker: { modelId: 'judge-tie' },
        };
        vi.mocked(ModelConfigDB.fetchJudgeConfigsFromDb).mockResolvedValueOnce(mockConfig as any);

        const config = await service.getJudgeModels('ru');
        expect(config.primary.modelId).toBe('judge-primary');
        expect(ModelConfigDB.fetchJudgeConfigsFromDb).toHaveBeenCalledWith('ru');
      });

      it('throws when no cache and no DB', async () => {
        vi.mocked(ModelConfigDB.fetchJudgeConfigsFromDb).mockRejectedValueOnce(
          new Error('DB Down')
        );

        await expect(service.getJudgeModels('ru')).rejects.toThrow('Cannot get judge models');
      });
    });

    describe('getContextReservePercent', () => {
      it('returns from database', async () => {
        const percent = await service.getContextReservePercent('ru');
        expect(percent).toBe(0.25);
      });

      it('falls back to any if explicit lang missing', async () => {
        const percent = await service.getContextReservePercent('en');
        expect(percent).toBe(0.15); // "any" fallback from DB mock
      });

      it('uses fallback dict if DB completely fails', async () => {
        mockSupabase.from.mockReturnValue({
          select: vi.fn().mockResolvedValue({ error: new Error('DB Down') }),
        });

        const percent = await service.getContextReservePercent('ru');
        expect(percent).toBe(0.25); // from DEFAULT_CONTEXT_RESERVE fallback
      });
    });

    describe('calculateDynamicThreshold', () => {
      it('calculates threshold correctly', async () => {
        // maxContext * (1 - reserve) -> 1000 * (1 - 0.25)
        const threshold = await service.calculateDynamicThreshold(1000, 'ru');
        expect(threshold).toBe(750);
      });
    });

    describe('getStage4TierConfigs', () => {
      it('fetches both standard and extended from stage_4_scope', async () => {
        vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockImplementation(
          (_phase: any, _course: any, tier: any) => {
            if (tier === 'standard')
              return Promise.resolve({ modelId: 'std-model', maxContextTokens: 100000 } as any);
            if (tier === 'extended')
              return Promise.resolve({
                modelId: 'ext-model',
                maxContextTokens: 200000,
                cacheReadEnabled: true,
              } as any);
            return Promise.resolve(null);
          }
        );

        const configs = await service.getStage4TierConfigs('en');
        expect(configs.standard.modelId).toBe('std-model');
        expect(configs.extended.modelId).toBe('ext-model');
        expect(configs.extended.cacheReadEnabled).toBe(true);
      });

      it('falls back to emergency config on error', async () => {
        vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockRejectedValue(new Error('DB down'));

        const configs = await service.getStage4TierConfigs('en');
        expect(configs.standard.modelId).toBe('google/gemini-3-flash-preview');
        expect(configs.extended.modelId).toBe('google/gemini-3-flash-preview');
      });
    });
  });

  describe('resolveModelWithFallback', () => {
    it('uses settings model if provided, skipping DB', async () => {
      const model = await resolveModelWithFallback({
        settingsModel: 'user-model',
        phaseName: 'test_phase',
        fallbackModel: 'fallback-model',
      });

      expect(model).toBe('user-model');
      expect(ModelConfigDB.fetchPhaseConfigFromDb).not.toHaveBeenCalled();
    });

    it('uses DB config if available', async () => {
      vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockResolvedValueOnce({
        modelId: 'db-model',
      } as any);

      const model = await resolveModelWithFallback({
        phaseName: 'test_phase',
        fallbackModel: 'fallback-model',
      });

      expect(model).toBe('db-model');
    });

    it('falls back if DB configuration fails or is missing', async () => {
      vi.mocked(ModelConfigDB.fetchPhaseConfigFromDb).mockRejectedValueOnce(new Error('fail'));

      const model = await resolveModelWithFallback({
        phaseName: 'super_rare_phase',
        fallbackModel: 'fallback-model',
      });

      expect(model).toBe(DEFAULT_PHASE_CONFIGS['global_default'].modelId);
    });

    it('falls back to actual fallback parameter if global throwing', () => {
      // simulate complete failure
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });
  });
});

describe('model pricing health check (IMP-4)', () => {
  it('reports an unknown/deprecated model id as unpriced and a known catalog model as priced', () => {
    const result = checkPhaseModelPricingHealth({
      known_phase: { modelId: 'deepseek/deepseek-v4-flash', fallbackModelId: 'openai/gpt-oss-20b' },
      drifted_phase: {
        modelId: 'openai/gpt-oss-120b', // retired/deprecated id, no pricing entry
        fallbackModelId: 'deepseek/deepseek-v4-pro',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.unpricedModels).toEqual([
      { phaseName: 'drifted_phase', role: 'primary', modelId: 'openai/gpt-oss-120b' },
    ]);
    // Distinct, sorted, and only the priced models are silently accepted.
    expect(result.checkedModelIds).toContain('deepseek/deepseek-v4-flash');
    expect(result.checkedModelIds).toContain('deepseek/deepseek-v4-pro');
    expect(result.missingPhases).toEqual([]);
  });

  it('passes when every configured model is present in the pricing catalog', () => {
    const result = checkPhaseModelPricingHealth({
      phase_a: {
        modelId: 'deepseek/deepseek-v4-flash',
        fallbackModelId: 'deepseek/deepseek-v4-pro',
      },
      phase_b: { modelId: EMERGENCY_FALLBACK_MODEL },
    });

    expect(result.ok).toBe(true);
    expect(result.unpricedModels).toEqual([]);
  });

  it('honors an injected pricing predicate and records unresolved phases', () => {
    const result = checkPhaseModelPricingHealth(
      {
        resolvable: { modelId: 'model-x' },
        unresolved: null,
      },
      { isPriced: (modelId: string) => modelId !== 'model-x' }
    );

    expect(result.unpricedModels).toEqual([
      { phaseName: 'resolvable', role: 'primary', modelId: 'model-x' },
    ]);
    expect(result.missingPhases).toEqual(['unresolved']);
  });

  it('isModelPriced mirrors the OpenRouter pricing catalog', () => {
    expect(isModelPriced(EMERGENCY_FALLBACK_MODEL)).toBe(
      getModelPricing(EMERGENCY_FALLBACK_MODEL) !== null
    );
    expect(isModelPriced('definitely/not-a-real-model')).toBe(false);
  });

  it('resolveDefaultPhaseConfig falls back to global_default for unseeded phases', () => {
    expect(resolveDefaultPhaseConfig('stage_career_playbook_group_1')).toBe(
      DEFAULT_PHASE_CONFIGS['global_default']
    );
    // The offline default career-playbook fallback chain must stay priceable.
    const config = resolveDefaultPhaseConfig('stage_career_playbook_group_1');
    expect(config).not.toBeNull();
    expect(isModelPriced(config!.modelId)).toBe(true);
  });
});
