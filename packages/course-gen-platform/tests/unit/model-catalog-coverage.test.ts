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
    const verifiedBatchRates: Record<string, [input: number, output: number, context: number]> = {
      'google/gemini-3.7-flash:batch': [0.1875, 0.9375, 1_048_576],
      'minimax/minimax-m3:batch': [0.15, 0.6, 524_288],
      'openai/gpt-5.6-luna:batch': [0.1, 0.6, 1_050_000],
      'z-ai/glm-5.2:batch': [0.7, 2.2, 512_000],
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

  it('prices listed retired models at the OpenRouter rates verified on 2026-08-14', () => {
    const verifiedRates: Record<string, [input: number, output: number]> = {
      'deepseek/deepseek-v3.1-terminus': [0.27, 0.95],
      'deepseek/deepseek-v4-flash': [0.14, 0.28],
      'deepseek/deepseek-v4-pro': [1.168, 2.336],
      'google/gemini-2.5-flash': [0.3, 2.5],
      'moonshotai/kimi-k2-thinking': [0.6, 2.5],
      'openai/gpt-oss-20b': [0.03, 0.13],
      'qwen/qwen3-235b-a22b-2507': [0.09, 0.55],
      'qwen/qwen3-max': [0.78, 3.9],
      'qwen/qwen3.7-plus': [0.32, 1.28],
      'z-ai/glm-4.6': [0.5, 2],
      'z-ai/glm-5': [0.95, 2.55],
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
