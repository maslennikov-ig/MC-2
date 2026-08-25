import { describe, expect, it, vi } from 'vitest';
import {
  OpenRouterBatchEligibilityResolver,
  selectDiscountedBatchVariant,
  type OpenRouterCatalogModel,
  type TieredRates,
} from '@/shared/llm/openrouter-batch-eligibility';

/**
 * Both routes at one tier, in dollars per million — the units `/endpoints`
 * reports and the units the decision is made in.
 */
function rates(sync: [number, number] | null, batch: [number, number] | null): TieredRates {
  return {
    sync: sync && { prompt: sync[0], completion: sync[1] },
    batch: batch && { prompt: batch[0], completion: batch[1] },
  };
}

function model(
  id: string,
  prompt: string,
  completion: string,
  contextLength: number,
  supportedParameters: string[] = ['max_tokens', 'reasoning']
): OpenRouterCatalogModel {
  return {
    id,
    context_length: contextLength,
    pricing: { prompt, completion },
    supported_parameters: supportedParameters,
  };
}

describe('selectDiscountedBatchVariant', () => {
  it('selects the Gemini batch variant when it is compatible and both rates are lower', () => {
    const models = [
      model('google/gemini-3.7-flash', '0.000000375', '0.000001875', 1_048_576),
      model('google/gemini-3.7-flash:batch', '0.0000001875', '0.0000009375', 1_048_576),
    ];

    expect(
      selectDiscountedBatchVariant('google/gemini-3.7-flash', models, {
        requiredContextTokens: 40_000,
        requiredOutputTokens: 16_000,
        requiredParameters: ['max_tokens', 'reasoning'],
      })
    ).toMatchObject({
      eligible: true,
      batchModelId: 'google/gemini-3.7-flash:batch',
      inputDiscountRatio: 0.5,
      outputDiscountRatio: 0.5,
    });
  });

  it('selects MiniMax when the live catalogue exposes the same 50% discount', () => {
    const models = [
      model('minimax/minimax-m3', '0.0000003', '0.0000012', 1_048_576),
      model('minimax/minimax-m3:batch', '0.00000015', '0.0000006', 1_048_576),
    ];

    expect(
      selectDiscountedBatchVariant('minimax/minimax-m3', models, {
        requiredContextTokens: 20_000,
        requiredOutputTokens: 8_000,
        requiredParameters: ['max_tokens'],
      })
    ).toMatchObject({ eligible: true, batchModelId: 'minimax/minimax-m3:batch' });
  });

  it('rejects a batch variant with no discount', () => {
    const models = [
      model('openai/gpt-5.6-luna', '0.0000001', '0.0000006', 1_050_000),
      model('openai/gpt-5.6-luna:batch', '0.0000001', '0.0000006', 1_050_000),
    ];

    expect(
      selectDiscountedBatchVariant('openai/gpt-5.6-luna', models, {
        requiredContextTokens: 20_000,
        requiredOutputTokens: 8_000,
        requiredParameters: ['max_tokens'],
      })
    ).toMatchObject({ eligible: false, reason: 'no_discount' });
  });

  it('rejects a more expensive variant even if it has the batch suffix', () => {
    const models = [
      model('z-ai/glm-5.2', '0.00000063', '0.00000198', 1_048_576),
      model('z-ai/glm-5.2:batch', '0.0000007', '0.0000022', 512_000),
    ];

    expect(
      selectDiscountedBatchVariant('z-ai/glm-5.2', models, {
        requiredContextTokens: 20_000,
        requiredOutputTokens: 8_000,
        requiredParameters: ['max_tokens'],
      })
    ).toMatchObject({ eligible: false, reason: 'not_cheaper' });
  });

  it('rejects a cheaper variant that cannot satisfy the request contract', () => {
    const models = [
      model('vendor/model', '0.000001', '0.000002', 100_000),
      model('vendor/model:batch', '0.0000005', '0.000001', 100_000, ['max_tokens']),
    ];

    expect(
      selectDiscountedBatchVariant('vendor/model', models, {
        requiredContextTokens: 20_000,
        requiredOutputTokens: 8_000,
        requiredParameters: ['max_tokens', 'reasoning'],
      })
    ).toMatchObject({ eligible: false, reason: 'unsupported_parameters' });
  });

  it('rejects an unknown model instead of guessing from the suffix', () => {
    expect(
      selectDiscountedBatchVariant('missing/model', [], {
        requiredContextTokens: 1,
        requiredOutputTokens: 1,
        requiredParameters: [],
      })
    ).toMatchObject({ eligible: false, reason: 'base_model_missing' });
  });
});

/**
 * The prices below are the live ones, read on 2026-08-25, in $/1M:
 *
 * | route         | in   | out  |
 * | ------------- | ---- | ---- |
 * | sync default  | 0.20 | 1.20 |
 * | sync flex     | 0.10 | 0.60 |  ← what every background phase pays
 * | batch default | 0.10 | 0.60 |  ← what a batch is billed, whatever it asks
 * | batch flex    | 0.05 | 0.30 |  ← advertised, not reachable
 *
 * `/models` publishes the default tariff for both ids, so the catalogue alone
 * says "half price" — about a synchronous call this pipeline stopped making
 * when every background phase moved to flex. And the batch leg cannot claim the
 * flex rate it advertises: two paid probes billed batch@default to the cent.
 */
describe('the price the batch discount has to beat', () => {
  const luna = [
    model('openai/gpt-5.6-luna', '0.0000002', '0.0000012', 1_050_000),
    model('openai/gpt-5.6-luna:batch', '0.0000001', '0.0000006', 1_050_000),
  ];
  const requirements = {
    requiredContextTokens: 20_000,
    requiredOutputTokens: 8_000,
    requiredParameters: ['max_tokens'],
  };

  it('is the synchronous tier we actually use, not the catalogue default', () => {
    // batch@default against sync@flex: identical money, up to a day of waiting.
    expect(
      selectDiscountedBatchVariant(
        'openai/gpt-5.6-luna',
        luna,
        requirements,
        rates([0.1, 0.6], [0.1, 0.6])
      )
    ).toMatchObject({ eligible: false, reason: 'no_discount' });
  });

  it('approves a route that is genuinely cheaper than what we pay', () => {
    // The shape that still pays off: a model with no flex endpoint, so the
    // synchronous call runs at the default tariff and batch@default halves it.
    // `z-ai/glm-5.2` is the live example — and the most expensive line of a
    // course.
    expect(
      selectDiscountedBatchVariant(
        'openai/gpt-5.6-luna',
        luna,
        { ...requirements, serviceTier: 'default' },
        rates([0.2, 1.2], [0.1, 0.6])
      )
    ).toMatchObject({
      eligible: true,
      inputDiscountRatio: 0.5,
      outputDiscountRatio: 0.5,
      comparedAgainstTier: 'default',
    });
  });

  it('refuses a batch model that does not publish our tier at all', () => {
    // Not the same as "we could not look it up": glm-5.2 has no flex endpoint,
    // and assuming the multiplier applies everywhere would invent a discount.
    expect(
      selectDiscountedBatchVariant(
        'openai/gpt-5.6-luna',
        luna,
        requirements,
        rates([0.1, 0.6], null)
      )
    ).toMatchObject({ eligible: false, reason: 'tier_unavailable' });
  });

  it('records which synchronous tier the discount was measured against', () => {
    const decision = selectDiscountedBatchVariant(
      'openai/gpt-5.6-luna',
      luna,
      { ...requirements, serviceTier: 'default' },
      rates([0.2, 1.2], [0.1, 0.6])
    );

    expect(decision).toMatchObject({ eligible: true, comparedAgainstTier: 'default' });
  });
});

describe('OpenRouterBatchEligibilityResolver', () => {
  const geminiCatalogue = () =>
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            model('google/gemini-3.7-flash', '0.000000375', '0.000001875', 1_048_576),
            model('google/gemini-3.7-flash:batch', '0.0000001875', '0.0000009375', 1_048_576),
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
  const requirements = {
    requiredContextTokens: 10_000,
    requiredOutputTokens: 8_000,
    requiredParameters: ['max_tokens'],
  };

  it('checks the live catalogue and caches it for repeated model selections', async () => {
    const fetchMock = geminiCatalogue();
    const resolver = new OpenRouterBatchEligibilityResolver({
      fetch: fetchMock,
      resolveTieredRates: vi.fn().mockResolvedValue(rates([0.1875, 0.9375], [0.09, 0.47])),
    });

    const first = await resolver.resolve('google/gemini-3.7-flash', requirements);
    await resolver.resolve('google/gemini-3.7-flash', requirements);

    expect(first).toMatchObject({ eligible: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models', {
      signal: expect.any(AbortSignal),
    });
  });

  it('asks for the rates at the tier the caller named', async () => {
    const resolveTieredRates = vi.fn().mockResolvedValue(rates([0.1875, 0.9375], [0.09, 0.47]));
    const resolver = new OpenRouterBatchEligibilityResolver({
      fetch: geminiCatalogue(),
      resolveTieredRates,
    });

    await resolver.resolve('google/gemini-3.7-flash', { ...requirements, serviceTier: 'default' });

    expect(resolveTieredRates).toHaveBeenCalledWith(
      'google/gemini-3.7-flash',
      'google/gemini-3.7-flash:batch',
      'default'
    );
  });

  it('assumes flex when the caller names no tier, because batching implies background', async () => {
    const resolveTieredRates = vi.fn().mockResolvedValue(rates([0.1875, 0.9375], [0.09, 0.47]));
    const resolver = new OpenRouterBatchEligibilityResolver({
      fetch: geminiCatalogue(),
      resolveTieredRates,
    });

    await resolver.resolve('google/gemini-3.7-flash', requirements);

    expect(resolveTieredRates).toHaveBeenCalledWith(
      'google/gemini-3.7-flash',
      'google/gemini-3.7-flash:batch',
      'flex'
    );
  });

  it('fails closed to synchronous mode when the catalogue cannot be checked', async () => {
    const resolver = new OpenRouterBatchEligibilityResolver({
      fetch: vi.fn().mockRejectedValue(new Error('network down')),
      resolveTieredRates: vi.fn().mockResolvedValue(rates([1, 1], [1, 1])),
    });

    await expect(resolver.resolve('google/gemini-3.7-flash', requirements)).resolves.toMatchObject({
      eligible: false,
      reason: 'catalog_unavailable',
    });
  });

  it('fails closed when the endpoint prices cannot be read either', async () => {
    const resolver = new OpenRouterBatchEligibilityResolver({
      fetch: geminiCatalogue(),
      resolveTieredRates: vi.fn().mockRejectedValue(new Error('endpoints unreachable')),
    });

    await expect(resolver.resolve('google/gemini-3.7-flash', requirements)).resolves.toMatchObject({
      eligible: false,
      reason: 'catalog_unavailable',
    });
  });
});
