import { describe, expect, it, vi } from 'vitest';
import {
  OpenRouterBatchEligibilityResolver,
  selectDiscountedBatchVariant,
  type OpenRouterCatalogModel,
} from '@/shared/llm/openrouter-batch-eligibility';

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

describe('OpenRouterBatchEligibilityResolver', () => {
  it('checks the live catalogue and caches it for repeated model selections', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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
    const resolver = new OpenRouterBatchEligibilityResolver({ fetch: fetchMock });
    const requirements = {
      requiredContextTokens: 10_000,
      requiredOutputTokens: 8_000,
      requiredParameters: ['max_tokens'],
    };

    await resolver.resolve('google/gemini-3.7-flash', requirements);
    await resolver.resolve('google/gemini-3.7-flash', requirements);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models', {
      signal: expect.any(AbortSignal),
    });
  });

  it('fails closed to synchronous mode when the catalogue cannot be checked', async () => {
    const resolver = new OpenRouterBatchEligibilityResolver({
      fetch: vi.fn().mockRejectedValue(new Error('network down')),
    });

    await expect(
      resolver.resolve('google/gemini-3.7-flash', {
        requiredContextTokens: 10_000,
        requiredOutputTokens: 8_000,
        requiredParameters: ['max_tokens'],
      })
    ).resolves.toMatchObject({ eligible: false, reason: 'catalog_unavailable' });
  });
});
