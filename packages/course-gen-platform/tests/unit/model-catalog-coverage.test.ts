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
  NO_PUBLISHED_TEXT_RATE,
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

  it('prices every live routing model at the OpenRouter base rates last verified for each', () => {
    // The models a course actually runs on. Three of these were wrong at once on
    // 2026-08-20 and the errors pointed in opposite directions, which is why the
    // invoice gap looked smaller than its causes: openai/gpt-5.6-luna was
    // recorded at exactly its Batch rate — half the synchronous one — while
    // z-ai/glm-5.2 was 1.23x and ~deepseek/...-latest up to 1.8x too dear
    // (mc2-v1pn2, mc2-156kg).
    const verifiedRates: Record<string, [input: number, output: number]> = {
      // The most movable rate here: $0.08/$0.18, then $0.14/$0.28, then
      // $0.06/$0.12 on consecutive days to 2026-08-26, and 2.33x within two
      // hours on 2026-08-25. Dates are deliberately absent from the line below,
      // because the nightly sync rewrites the number and cannot rewrite a date
      // beside it (mc2-rhyac).
      'deepseek/deepseek-v4-flash-0731': [0.045, 0.09],
      'openai/gpt-5.6-luna': [0.2, 1.2],
      'z-ai/glm-5.2': [1.19, 3.74],
      // Read 2026-08-26, the day it was published. Two endpoints only: z-ai at
      // exactly this rate and novita at twice it (mc2-r8shw).
      'z-ai/glm-5.3-flash': [0.075, 0.25],
      'minimax/minimax-m3': [0.3, 1.2],
      'google/gemini-3.7-flash': [0.75, 3.75],
      'openai/gpt-5-image-mini': [2.5, 2],
      'google/gemini-2.5-flash-image': [0.3, 2.5],
      // Read 2026-08-27 from `/api/v1/images/models/.../endpoints`, because
      // neither of these is in the chat catalogue at all. The banner model
      // publishes no text leg — see the entry — and its real rate is the flat
      // per-frame figure checked below.
      'sourceful/riverflow-v2.5-fast': [0, 0],
      'openai/gpt-image-2': [5, 30],
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
      'openai/gpt-image-2': 30,
    };

    // The other half of the image catalogue charges by the frame and reports no
    // output tokens at all, so there is no token rate to verify and the flat
    // figure is the whole price. 26 of the 48 are priced this way; keeping them
    // in the same check as the token-priced ones would mean asserting a rate
    // that does not exist.
    const verifiedFlatImagePrices: Record<string, number> = {
      // Published base rate, read 2026-08-27. Deliberately not the $0.013954
      // that a 1K frame actually billed — the catalogue tracks what is
      // published, and the receipt replaces the estimate seconds later.
      'sourceful/riverflow-v2.5-fast': 0.019,
    };

    const billedPerImage = Object.entries(MODEL_CATALOG)
      .filter(([, capabilities]) => capabilities.billedPerImage)
      .map(([modelId]) => modelId);
    expect(billedPerImage.sort()).toEqual(
      [...Object.keys(verifiedImageRates), ...Object.keys(verifiedFlatImagePrices)].sort()
    );

    const actual = Object.fromEntries(
      Object.keys(verifiedImageRates).map(modelId => [
        modelId,
        getModelCapabilities(modelId)?.imageOutputPricePerMillion ?? null,
      ])
    );

    expect(actual).toEqual(verifiedImageRates);

    const actualFlat = Object.fromEntries(
      Object.keys(verifiedFlatImagePrices).map(modelId => [
        modelId,
        getModelCapabilities(modelId)?.imagePriceFlatUsd ?? null,
      ])
    );

    expect(actualFlat).toEqual(verifiedFlatImagePrices);
  });

  it('prices the two entries kept outside the live routing set', () => {
    // Two, and only for a mechanism rather than for history. Twenty entries left
    // the catalogue on 2026-08-29: the stated reason for keeping them — "so old
    // cost reports still resolve" — described a mechanism that does not exist,
    // because the dollars are persisted at the call (`generation_trace.cost_usd`,
    // `career_playbooks.cost_breakdown.nodeCosts[].cost_usd`) and no reporting
    // path reads this catalogue (mc2-11jn5).
    const verifiedRates: Record<string, [input: number, output: number]> = {
      // `deepseek/deepseek-v4-flash` matters more than a retired entry usually
      // would, because `normalizeModelId` prices every undated V4 Flash snapshot
      // from here (mc2-hc91g). Re-read 2026-08-26 at $0.088606/$0.177212: the
      // snapshot held $0.05306, 40% UNDER, which is the direction that refuses
      // calls rather than merely misreporting them. It has now been corrected
      // four times in four days, each time by somebody re-reading it, which is
      // the argument for the check running nightly (mc2-ts9i2, mc2-a6qxc).
      'deepseek/deepseek-v4-flash': [0.08512, 0.17024],
      '~deepseek/deepseek-v4-flash-latest': [0.03, 0.1],
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
    // Split pricing throughout: a combined rate here would be quietly counted
    // twice for whichever leg is dearer.
    for (const modelId of Object.keys(verifiedRates)) {
      expect(getModelCapabilities(modelId)?.combinedPricePerMillion, modelId).toBeUndefined();
    }
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
     * Empty since 2026-08-28, and that is the point.
     *
     * It held `moonshotai/kimi-linear-48b-a3b-instruct`, an entry in
     * `model-selector.ts MODELS` — a registry of eleven models that nothing
     * outside its own barrel ever selected from, yet which
     * `collectRoutableModelSources` read, so the gate believed four dead ids
     * were live routes. Deleting the registry retired the exception rather than
     * pricing a model nobody calls (mc2-u8kwx).
     */
    const UNCATALOGUED_TODAY: string[] = [];

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

    it('routes to exactly the models the live list declares, no more', () => {
      // This used to assert the derived set was BIGGER than the hand-written
      // one, because it was: 20 models against 10, the extra ten reachable
      // through registries the list knew nothing about. After mc2-u8kwx the two
      // are the same set, which is a stronger statement than either half — it
      // fails both when a registry goes silent and when a new one appears
      // without being declared live.
      expect([...routable].sort()).toEqual([...LIVE_ROUTING_MODEL_IDS].sort());
    });

    it('can name at least one registry for every model it routes to', () => {
      for (const modelId of routable) {
        expect(describeRoutableModel(modelId).length, modelId).toBeGreaterThan(0);
      }
    });
  });

  it('never carries a zero or negative price', () => {
    // "Some positive rate", not "a positive text rate". A per-frame image model
    // publishes no text leg at all — `sourceful/riverflow-v2.5-fast`'s entire
    // `pricing` array is one `output_image` entry — so quoting a text rate for
    // it would be inventing one, and the zeros there mean "not offered".
    //
    // The invariant this guard exists for is unchanged: no model may be
    // reachable with nothing to charge it at. A model with every rate at zero
    // still fails, which is the case that hides spend.
    const broken = Object.entries(MODEL_CATALOG)
      .filter(([, capabilities]) => {
        const rates = [
          capabilities.inputPricePerMillion,
          capabilities.outputPricePerMillion,
          capabilities.imageOutputPricePerMillion,
          capabilities.imagePriceFlatUsd,
          capabilities.combinedPricePerMillion,
        ];
        if (rates.some(rate => rate !== undefined && rate < 0)) return true;
        return !rates.some(rate => rate !== undefined && rate > 0);
      })
      .map(([modelId]) => modelId);

    expect(broken).toEqual([]);
  });

  it('only lets a text rate be absent when an image rate is present', () => {
    // The counterpart of the guard above, and the reason `NO_PUBLISHED_TEXT_RATE`
    // is a name rather than a bare `0`. That zero means "this provider quotes no
    // prompt or completion rate", which is true of exactly one entry today and
    // must stay tied to the thing that *is* charged. Without this, a model
    // somebody forgot to price would wear identical clothes to a per-frame one
    // and the table would read the same either way (mc2-f4n3q).
    const untethered = Object.entries(MODEL_CATALOG)
      .filter(([, capabilities]) => {
        const noTextRate =
          capabilities.inputPricePerMillion === NO_PUBLISHED_TEXT_RATE &&
          capabilities.outputPricePerMillion === NO_PUBLISHED_TEXT_RATE;
        if (!noTextRate) return false;
        // A model billed per frame must say so, and say how much.
        return (
          capabilities.billedPerImage !== true ||
          !(
            (capabilities.imagePriceFlatUsd ?? 0) > 0 ||
            (capabilities.imageOutputPricePerMillion ?? 0) > 0
          )
        );
      })
      .map(([modelId]) => modelId);

    expect(untethered).toEqual([]);
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
