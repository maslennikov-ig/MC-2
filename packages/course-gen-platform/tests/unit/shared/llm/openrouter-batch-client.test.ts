import { afterEach, describe, expect, it, vi } from 'vitest';
import { getModelCapabilities } from '@megacampus/shared-types';
import {
  OpenRouterBatchClient,
  mapCompletedBatchResultsByPosition,
  type OpenRouterBatch,
} from '@/shared/llm/openrouter-batch-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenRouterBatchClient', () => {
  it('submits ten chat requests in one POST and preserves required top-level field order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'batch_123',
          object: 'batch',
          endpoint: '/v1/chat/completions',
          model: 'google/gemini-3.7-flash',
          completion_window: '24h',
          status: 'validating',
          created_at: 1,
          finalized_at: null,
          request_counts: { total: 10, completed: 0, failed: 0 },
          usage: null,
          results: null,
          error: null,
        }),
        { status: 202, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenRouterBatchClient({ apiKey: 'test-key' });
    const requests = Array.from({ length: 10 }, (_, position) => ({
      customId: `lesson-${position}`,
      body: { messages: [{ role: 'user' as const, content: `Prompt ${position}` }] },
    }));

    const submitted = await client.submitChatBatch({
      model: 'google/gemini-3.7-flash',
      requests,
    });

    expect(submitted).toMatchObject({ id: 'batch_123', status: 'validating' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/beta/batches');
    expect(init.method).toBe('POST');
    const serialized = String(init.body);
    expect(serialized.indexOf('"endpoint"')).toBeLessThan(serialized.indexOf('"model"'));
    expect(serialized.indexOf('"model"')).toBeLessThan(serialized.indexOf('"requests"'));
    expect(JSON.parse(serialized)).toMatchObject({
      endpoint: '/v1/chat/completions',
      model: 'google/gemini-3.7-flash',
    });
    expect(JSON.parse(serialized).requests).toHaveLength(10);
  });

  it('polls a saved batch identifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'batch_saved',
          object: 'batch',
          endpoint: '/v1/chat/completions',
          model: 'minimax/minimax-m3',
          completion_window: '24h',
          status: 'in_progress',
          created_at: 1,
          finalized_at: null,
          request_counts: { total: 10, completed: 4, failed: 0 },
          usage: null,
          results: null,
          error: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenRouterBatchClient({ apiKey: 'test-key' }).getBatch('batch_saved');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/beta/batches/batch_saved',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('polls the identifier format OpenRouter actually issues', async () => {
    // The guard required `batch_` and OpenRouter returns `batch-`. Read off a
    // live submission on 2026-08-25: `batch-1787647619-as0NWfE8y270wkfYc6aq`.
    // Every batch could therefore be created and never read: the coordinator
    // would poll nothing, wait out its whole window and fall back to
    // synchronous generation, which looks like a slow provider (mc2-g4fdf).
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'batch-1787647619-as0NWfE8y270wkfYc6aq' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenRouterBatchClient({ apiKey: 'test-key' }).getBatch(
      'batch-1787647619-as0NWfE8y270wkfYc6aq'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/beta/batches/batch-1787647619-as0NWfE8y270wkfYc6aq',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('still refuses anything that is not an identifier', async () => {
    const client = new OpenRouterBatchClient({ apiKey: 'test-key' });

    await expect(client.getBatch('../../v1/chat/completions')).rejects.toThrow(
      'Invalid OpenRouter batch identifier'
    );
    await expect(client.getBatch('batchsomething')).rejects.toThrow(
      'Invalid OpenRouter batch identifier'
    );
  });
});

describe('mapCompletedBatchResultsByPosition', () => {
  it('maps shuffled results back to input positions and keeps an item error local', () => {
    const batch = {
      status: 'completed',
      results: [
        {
          custom_id: 'lesson-2',
          response: {
            status_code: 200,
            request_id: 'request-2',
            body: {
              choices: [{ message: { role: 'assistant', content: 'third' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.01 },
            },
          },
          error: null,
        },
        {
          custom_id: 'lesson-0',
          response: {
            status_code: 200,
            request_id: 'request-0',
            body: {
              choices: [{ message: { role: 'assistant', content: 'first' } }],
              usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12, cost: 0.005 },
            },
          },
          error: null,
        },
        {
          custom_id: 'lesson-1',
          response: null,
          error: { code: 'provider_error', message: 'nope' },
        },
      ],
    } as unknown as OpenRouterBatch;

    expect(mapCompletedBatchResultsByPosition(batch, ['lesson-0', 'lesson-1', 'lesson-2'])).toEqual(
      [
        expect.objectContaining({ ok: true, content: 'first', totalTokens: 12 }),
        expect.objectContaining({ ok: false, error: 'provider_error: nope' }),
        expect.objectContaining({ ok: true, content: 'third', totalTokens: 30 }),
      ]
    );
  });

  it('marks a missing result as a local failure rather than throwing for the whole batch', () => {
    const batch = { status: 'completed', results: [] } as unknown as OpenRouterBatch;

    expect(mapCompletedBatchResultsByPosition(batch, ['lesson-0'])).toEqual([
      { ok: false, error: 'Missing batch result for lesson-0' },
    ]);
  });

  it('splits the one batch-level cost by what each item is worth, not by headcount', () => {
    // OpenRouter reports `cost` once for the whole batch and never per result,
    // so a course of ten lessons would otherwise record ten identical prices.
    const batch = {
      status: 'completed',
      model: 'google/gemini-3.7-flash',
      usage: { cost: 0.03 },
      results: [
        { customId: 'lesson-0', promptTokens: 10_000, completionTokens: 1_000 },
        { customId: 'lesson-1', promptTokens: 10_000, completionTokens: 3_000 },
      ].map((item, index) => ({
        custom_id: item.customId,
        response: {
          status_code: 200,
          request_id: `request-${index}`,
          body: {
            choices: [{ message: { role: 'assistant', content: `Lesson ${index}` } }],
            usage: {
              prompt_tokens: item.promptTokens,
              completion_tokens: item.completionTokens,
              total_tokens: item.promptTokens + item.completionTokens,
            },
          },
        },
        error: null,
      })),
    } as unknown as OpenRouterBatch;

    const results = mapCompletedBatchResultsByPosition(batch, ['lesson-0', 'lesson-1']);

    // What each item is worth at the catalogued rates decides its share, so the
    // longer answer carries the larger part of one batch price. The rates come
    // from the catalogue rather than being retyped: the nightly sync rewrites
    // them and cannot rewrite a number typed here (mc2-rhyac).
    const rates = getModelCapabilities('google/gemini-3.7-flash');
    const worth = (promptTokens: number, completionTokens: number): number =>
      (promptTokens * (rates?.inputPricePerMillion ?? 0)) / 1e6 +
      (completionTokens * (rates?.outputPricePerMillion ?? 0)) / 1e6;
    const first = worth(10_000, 1_000);
    const second = worth(10_000, 3_000);
    const batchCost = 0.03;
    const costs = results.map(result => (result.ok ? result.costUsd : null));

    expect(costs[0]).toBeCloseTo((batchCost * first) / (first + second), 10);
    expect(costs[1]).toBeCloseTo((batchCost * second) / (first + second), 10);
    // And the whole batch price is still spent exactly once.
    expect(costs.reduce((sum: number, cost) => sum + (cost ?? 0), 0)).toBeCloseTo(batchCost, 10);
  });

  it('allocates provider-level usage when result bodies omit per-request usage', () => {
    const batch = {
      status: 'completed',
      usage: {
        prompt_tokens: 21,
        completion_tokens: 41,
        total_tokens: 62,
        cost: 0.0062,
      },
      results: ['lesson-0', 'lesson-1'].map((customId, index) => ({
        custom_id: customId,
        response: {
          status_code: 200,
          request_id: `request-${index}`,
          body: {
            choices: [{ message: { role: 'assistant', content: `Lesson ${index}` } }],
          },
        },
        error: null,
      })),
    } as unknown as OpenRouterBatch;

    const results = mapCompletedBatchResultsByPosition(batch, ['lesson-0', 'lesson-1']);

    expect(results).toEqual([
      expect.objectContaining({ ok: true, totalTokens: 31, costUsd: 0.0031 }),
      expect.objectContaining({ ok: true, totalTokens: 31, costUsd: 0.0031 }),
    ]);
    const successful = results.filter(result => result.ok);
    expect(successful.reduce((sum, result) => sum + result.totalTokens, 0)).toBe(62);
    expect(successful.reduce((sum, result) => sum + (result.costUsd ?? 0), 0)).toBeCloseTo(0.0062);
  });
});
