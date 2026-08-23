/**
 * Regression: a 200 without a completion must name itself (mc2-f1tqd).
 *
 * The shapes below are the ones the 2026-08-22 Career Playbook run actually met
 * on one endpoint of `deepseek/deepseek-v4-flash-0731` — five attempts, all
 * reported as `Cannot read properties of undefined (reading 'map')` or
 * `(reading 'message')`, none with a generation record the provider would admit
 * to. The old behaviour is reproduced here directly: without the guard, the
 * response reaches LangChain's parser and the message describes our reader
 * instead of what arrived.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  EmptyProviderResponseError,
  guardAgainstEmptyCompletion,
} from '@/shared/llm/empty-response-guard';
import { withGenerationIdCapture } from '@/shared/llm/generation-id-capture';

const COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';

function jsonResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

/** A complete answer, in the shape the provider sends when it works. */
const GOOD_BODY = JSON.stringify({
  id: 'gen-good',
  choices: [{ index: 0, message: { role: 'assistant', content: '{"verdict":"accept"}' } }],
  usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
});

describe('a successful response with no completion', () => {
  it('throws by name on an empty body', async () => {
    const base = vi.fn().mockResolvedValue(jsonResponse(''));
    const guarded = guardAgainstEmptyCompletion(base);

    await expect(guarded(COMPLETIONS, { method: 'POST' })).rejects.toBeInstanceOf(
      EmptyProviderResponseError
    );
  });

  it('throws when choices is missing altogether', async () => {
    const body = JSON.stringify({ id: 'gen-1', object: 'chat.completion' });
    const guarded = guardAgainstEmptyCompletion(vi.fn().mockResolvedValue(jsonResponse(body)));

    await expect(guarded(COMPLETIONS, { method: 'POST' })).rejects.toThrow(/no choices member/u);
  });

  it('throws when choices is present and empty', async () => {
    const body = JSON.stringify({ id: 'gen-2', choices: [] });
    const guarded = guardAgainstEmptyCompletion(vi.fn().mockResolvedValue(jsonResponse(body)));

    await expect(guarded(COMPLETIONS, { method: 'POST' })).rejects.toThrow(/choices is empty/u);
  });

  it('reports the provider error a 200 carried instead of inventing one', async () => {
    const body = JSON.stringify({ error: { message: 'upstream returned nothing', code: 502 } });
    // A fresh Response per call: a body can only be read once, and reusing one
    // would make the second assertion test the mock rather than the guard.
    const guarded = guardAgainstEmptyCompletion(vi.fn(async () => jsonResponse(body)));

    // Both halves matter: the named reason, and the provider's own sentence.
    await expect(guarded(COMPLETIONS, { method: 'POST' })).rejects.toThrow(
      /error member instead of choices/u
    );
    await expect(guarded(COMPLETIONS, { method: 'POST' })).rejects.toThrow(
      /upstream returned nothing/u
    );
  });

  it('puts the message where the logger will print it', async () => {
    const guarded = guardAgainstEmptyCompletion(vi.fn().mockResolvedValue(jsonResponse('')));

    // The repository logger prints `message` and nothing else, so a cause left
    // in a field alone is invisible exactly when it is needed.
    const error = await guarded(COMPLETIONS, { method: 'POST' }).catch(e => e as Error);
    expect(error.message).toContain('no usable completion');
    expect(error.message).toContain('empty body');
    expect(error.message).toContain('generationId=');
  });

  it('names the generation id of the attempt it is failing', async () => {
    const response = jsonResponse(JSON.stringify({ choices: [] }));
    response.headers.set('x-generation-id', 'gen-abc123');

    // The id has to be in the slot before the guard reads it, which is why the
    // guard sits above the capture and not below it.
    const { instrumentFetchWithGenerationId } = await import('@/shared/llm/generation-id-capture');
    const guarded = guardAgainstEmptyCompletion(
      instrumentFetchWithGenerationId(vi.fn().mockResolvedValue(response))
    );

    const error = await withGenerationIdCapture(async () =>
      guarded(COMPLETIONS, { method: 'POST' }).catch(e => e as EmptyProviderResponseError)
    );

    expect(error).toBeInstanceOf(EmptyProviderResponseError);
    expect((error as EmptyProviderResponseError).generationId).toBe('gen-abc123');
    expect((error as Error).message).toContain('gen-abc123');
  });
});

describe('what the guard must not touch', () => {
  it('hands a good completion through with its body intact', async () => {
    const guarded = guardAgainstEmptyCompletion(vi.fn().mockResolvedValue(jsonResponse(GOOD_BODY)));

    const response = await guarded(COMPLETIONS, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('json');
    // Reading it once here proves the body was not consumed on the way through.
    expect(await response.json()).toMatchObject({ choices: [{ index: 0 }] });
  });

  it('leaves a streamed response alone rather than draining it', async () => {
    const stream = new Response('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    const guarded = guardAgainstEmptyCompletion(vi.fn().mockResolvedValue(stream));

    const response = await guarded(COMPLETIONS, { method: 'POST' });
    expect(response.bodyUsed).toBe(false);
    expect(await response.text()).toContain('delta');
  });

  it('leaves a 400 to the wrapper that knows what to do with it', async () => {
    // The mandatory-reasoning recovery reads 400 bodies; turning one into a
    // throw here would take its retry away.
    const refusal = new Response(
      JSON.stringify({ error: { message: 'Reasoning is mandatory for this endpoint' } }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
    const guarded = guardAgainstEmptyCompletion(vi.fn().mockResolvedValue(refusal));

    const response = await guarded(COMPLETIONS, { method: 'POST' });
    expect(response.status).toBe(400);
  });

  it('ignores requests that are not completions', async () => {
    const models = jsonResponse(JSON.stringify({ data: [{ id: 'a/b' }] }));
    const guarded = guardAgainstEmptyCompletion(vi.fn().mockResolvedValue(models));

    const response = await guarded('https://openrouter.ai/api/v1/models', { method: 'GET' });
    expect(response.status).toBe(200);
  });

  it('ignores a non-JSON body', async () => {
    const html = new Response('<html>gateway timeout</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const guarded = guardAgainstEmptyCompletion(vi.fn().mockResolvedValue(html));

    await expect(guarded(COMPLETIONS, { method: 'POST' })).resolves.toBeInstanceOf(Response);
  });

  it('recognises a completions URL given as a Request or a URL', async () => {
    for (const input of [new URL(COMPLETIONS), new Request(COMPLETIONS, { method: 'POST' })]) {
      const guarded = guardAgainstEmptyCompletion(vi.fn().mockResolvedValue(jsonResponse('')));
      await expect(guarded(input)).rejects.toBeInstanceOf(EmptyProviderResponseError);
    }
  });
});

describe('the transport every LangChain model is built with carries the guard', () => {
  it('wraps the empty-completion guard around the generation-id capture', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(__dirname, '../../../../src/shared/llm/langchain-models.ts'),
      'utf8'
    );

    // A guard reachable only from a test is not a guard. This is the single
    // place `configuration.fetch` is assembled, and the clone that
    // `withStructuredOutput` builds keeps whatever is here.
    expect(source).toContain('guardAgainstEmptyCompletion(instrumentFetchWithGenerationId())');
    expect(source).toContain('withMandatoryReasoningRecoveryFetch(');
  });
});
