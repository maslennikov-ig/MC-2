import { afterEach, describe, expect, it, vi } from 'vitest';
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
