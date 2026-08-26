/**
 * Model catalogue coverage (mc2-0a47t, mc2-a2j1x).
 *
 * A model missing from the catalogue does not fail loudly — the cost maths
 * quietly substitutes a $1/$3 default and reports a plausible wrong number. On
 * 2026-08-12 four of the seven models actually in production were absent from
 * every pricing table in the repo, and three separate hand-maintained tables
 * disagreed with the provider: z-ai/glm-5 was recorded at $0.25/$1.00 against a
 * real $0.95/$2.55, and Stage 4 priced deepseek-v4-flash tenfold too high.
 *
 * These checks run offline against the committed seed, so a routing change that
 * introduces an unpriced model fails here rather than in an invoice.
 */
import { describe, expect, it } from 'vitest';

import { collectRoutableModelIds, describeRoutableModel } from '@/shared/llm/routable-models';

import {
  MODEL_CATALOG,
  LIVE_ROUTING_MODEL_IDS,
  getModelCapabilities,
} from '@megacampus/shared-types';

import seed from '@/config/config-seed.json';

interface SeedRow {
  phase_name: string;
  model_id: string;
  fallback_model_id: string | null;
}

const rows = seed as unknown as SeedRow[];

const seedModels = [
  ...new Set(rows.flatMap(row => [row.model_id, row.fallback_model_id]).filter(Boolean)),
] as string[];

describe('model catalogue coverage', () => {
  it('keeps Batch API variants as separate billable models at their live rates', () => {
    // Re-read 2026-08-21. Two of these were carrying half the published rate on
    // the belief that a Batch tariff is always half the base one. It is for luna
    // and for gemini; it is not for the other two — `z-ai/glm-5.2:batch` is
    // dearer than its synchronous form, and `minimax/minimax-m3:batch` costs
    // exactly the same as it (mc2-hc91g).
    const verifiedBatchRates: Record<string, [input: number, output: number, context: number]> = {
      'google/gemini-3.7-flash:batch': [0.1875, 0.9375, 1_048_576],
      'minimax/minimax-m3:batch': [0.3, 1.2, 524_288],
      'openai/gpt-5.6-luna:batch': [0.1, 0.6, 1_050_000],
      'z-ai/glm-5.2:batch': [1.4, 4.4, 512_000],
    };

    const actual = Object.fromEntries(
      Object.keys(verifiedBatchRates).map(modelId => {
        const capabilities = getModelCapabilities(modelId);
        return [
          modelId,
          capabilities
            ? [
                capabilities.inputPricePerMillion,
                capabilities.outputPricePerMillion,
                capabilities.contextLength,
              ]
            : null,
        ];
      })
    );

    expect(actual).toEqual(verifiedBatchRates);
  });

  it('prices every live routing model at the OpenRouter base rates verified on 2026-08-25', () => {
    // The models a course actually runs on. Three of these were wrong at once on
    // 2026-08-20 and the errors pointed in opposite directions, which is why the
    // invoice gap looked smaller than its causes: openai/gpt-5.6-luna was
    // recorded at exactly its Batch rate — half the synchronous one — while
    // z-ai/glm-5.2 was 1.23x and ~deepseek/...-latest up to 1.8x too dear
    // (mc2-v1pn2, mc2-156kg).
    const verifiedRates: Record<string, [input: number, output: number]> = {
      'deepseek/deepseek-v4-flash-0731': [0.14, 0.28],
      'openai/gpt-5.6-luna': [0.2, 1.2],
      'z-ai/glm-5.2': [1.19, 3.74],
      'minimax/minimax-m3': [0.3, 1.2],
      'google/gemini-3.7-flash': [0.375, 1.875],
      'openai/gpt-5-image-mini': [2.5, 2],
      'google/gemini-2.5-flash-image': [0.3, 2.5],
    };

    expect([...LIVE_ROUTING_MODEL_IDS].sort()).toEqual(Object.keys(verifiedRates).sort());
    const actual = Object.fromEntries(
      Object.keys(verifiedRates).map(modelId => {
        const capabilities = getModelCapabilities(modelId);
        return [
          modelId,
          capabilities
            ? [capabilities.inputPricePerMillion, capabilities.outputPricePerMillion]
            : null,
        ];
      })
    );

    expect(actual).toEqual(verifiedRates);
  });

  it('prices every image model at its published image_output rate', () => {
    // The rate that nothing read. Image prices lived in a private table inside
    // `image-generation-service.ts` — the second price table this repository
    // forbids itself — and it drifted until a card booked at $0.007 was billed
    // $0.045080, 6.4x more (mc2-5mhlb).
    const verifiedImageRates: Record<string, number> = {
      'openai/gpt-5-image-mini': 8,
      'google/gemini-2.5-flash-image': 30,
    };

    const billedPerImage = Object.entries(MODEL_CATALOG)
      .filter(([, capabilities]) => capabilities.billedPerImage)
      .map(([modelId]) => modelId);
    expect(billedPerImage.sort()).toEqual(Object.keys(verifiedImageRates).sort());

    const actual = Object.fromEntries(
      Object.keys(verifiedImageRates).map(modelId => [
        modelId,
        getModelCapabilities(modelId)?.imageOutputPricePerMillion ?? null,
      ])
    );

    expect(actual).toEqual(verifiedImageRates);
  });

  it('prices listed retired models at the OpenRouter rates verified on 2026-08-21', () => {
    const verifiedRates: Record<string, [input: number, output: number]> = {
      'deepseek/deepseek-v3.1-terminus': [0.27, 1.0],
      // The three DeepSeek rows below were re-read 2026-08-23 by the first run
      // of the nightly drift check (mc2-ts9i2), which is what that check is for:
      // this snapshot is only as current as the last person who remembered to
      // re-read it, and nobody had for two days.
      //
      // `deepseek/deepseek-v4-flash` matters more than a retired entry usually
      // would, because `normalizeModelId` prices every undated V4 Flash snapshot
      // from here (mc2-hc91g). It was 1.50x dear; `deepseek-v4-pro` was 4.03x,
      // the largest gap this catalogue has held.
      'deepseek/deepseek-v4-flash': [0.05306, 0.10612],
      '~deepseek/deepseek-v4-flash-latest': [0.05, 0.13],
      'deepseek/deepseek-v4-pro': [0.396894, 0.793788],
      'google/gemini-2.5-flash': [0.3, 2.5],
      'moonshotai/kimi-k2-thinking': [0.6, 2.5],
      'openai/gpt-oss-20b': [0.03, 0.13],
      'qwen/qwen3-235b-a22b-2507': [0.09, 0.55],
      'qwen/qwen3-max': [0.78, 3.9],
      'qwen/qwen3.7-plus': [0.32, 1.28],
      'z-ai/glm-4.6': [0.5, 2],
      'z-ai/glm-5': [0.6, 1.92],
    };

    const actual = Object.fromEntries(
      Object.keys(verifiedRates).map(modelId => {
        const capabilities = getModelCapabilities(modelId);
        return [
          modelId,
          capabilities
            ? [capabilities.inputPricePerMillion, capabilities.outputPricePerMillion]
            : null,
        ];
      })
    );

    expect(actual).toEqual(verifiedRates);
    expect(
      getModelCapabilities('google/gemini-2.5-flash')?.combinedPricePerMillion
    ).toBeUndefined();
  });

  it('prices every model the seed can route to', () => {
    const unpriced = seedModels.filter(modelId => !getModelCapabilities(modelId));

    expect(unpriced).toEqual([]);
  });

  it('prices every model declared as live routing', () => {
    const unpriced = LIVE_ROUTING_MODEL_IDS.filter(modelId => !getModelCapabilities(modelId));

    expect(unpriced).toEqual([]);
  });

  /**
   * Everything the code can route to, derived rather than restated.
   *
   * `LIVE_ROUTING_MODEL_IDS` is seven ids typed by hand. Sixty days of
   * `generation_trace` to 2026-08-25 held eleven, and the six that were missing
   * were not scripts: `stage_6_refinement` ran on `qwen/qwen3.7-plus`,
   * `z-ai/glm-5` and `minimax/minimax-m2.1`, and `moonshotai/kimi-k2-thinking`
   * served `stage_4_clarifying`. They reached the wire through registries the
   * hand-written list knew nothing about — a per-phase fallback table, an
   * escalation registry, a provider rename map, the Stage 6 repair tiers
   * (mc2-a6qxc).
   */
  describe('models the code can route to', () => {
    const routable = collectRoutableModelIds();

    /**
     * Routable ids with no catalogue entry, as found on 2026-08-26.
     *
     * Grandfathered rather than fixed here, because adding a price is a claim
     * about what a provider charges and belongs with a reading of the published
     * list, not with a test. Both are entries in `MODELS` — the escalation
     * registry in `model-selector.ts` — and nothing selects them today: the only
     * paths that could return them are `getModelByKey` and
     * `getModelsWithCapability`, and neither is called anywhere outside the
     * barrel that re-exports it. The point of listing them is that a *new* one
     * fails here instead of joining them.
     */
    const UNCATALOGUED_TODAY = [
      'moonshotai/kimi-linear-48b-a3b-instruct',
      'qwen/qwen-plus-2025-07-28',
    ];

    it('prices every model the code can route to, apart from the two already known', () => {
      const unpriced = routable.filter(modelId => !getModelCapabilities(modelId));

      expect(unpriced.sort()).toEqual([...UNCATALOGUED_TODAY].sort());
    });

    it('covers everything the hand-written live list claims', () => {
      // The list stays for its `shared-types` consumers, but stops being the
      // authority: if it names something no registry routes to, one of the two
      // is wrong and this says so rather than letting them drift apart.
      const missing = LIVE_ROUTING_MODEL_IDS.filter(modelId => !routable.includes(modelId));

      expect(missing).toEqual([]);
    });

    it('finds more than the hand-written list did, and says who routes to each', () => {
      // Guards the derivation itself: if `collectRoutableModelSources` silently
      // stopped reading a registry, this is what notices.
      expect(routable.length).toBeGreaterThan(LIVE_ROUTING_MODEL_IDS.length);

      for (const modelId of routable) {
        expect(describeRoutableModel(modelId).length).toBeGreaterThan(0);
      }
    });
  });

  it('never carries a zero or negative price', () => {
    const broken = Object.entries(MODEL_CATALOG)
      .filter(
        ([, capabilities]) =>
          capabilities.inputPricePerMillion <= 0 || capabilities.outputPricePerMillion <= 0
      )
      .map(([modelId]) => modelId);

    expect(broken).toEqual([]);
  });

  it('keeps the seed within each provider output ceiling', () => {
    const seedRows = seed as unknown as Array<SeedRow & { max_tokens: number }>;
    const over = seedRows
      .filter(row => {
        const capabilities = getModelCapabilities(row.model_id);
        return (
          capabilities?.maxOutputTokens != null && row.max_tokens > capabilities.maxOutputTokens
        );
      })
      .map(row => `${row.phase_name} -> ${row.model_id}`);

    expect(over).toEqual([]);
  });
});
