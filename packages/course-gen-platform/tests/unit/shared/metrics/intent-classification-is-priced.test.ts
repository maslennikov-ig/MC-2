/**
 * Contract: classifying a chat message is spend, and it lands on the course.
 *
 * `shared/intent/classifier.ts` built its own `new OpenAI()` and called
 * `chat.completions.create` directly. It had no course in its signature and
 * recorded nothing — no trace row, no price — so every chat turn that missed
 * the Redis intent cache spent real money that could not be reconstructed
 * afterwards (mc2-b5a2r).
 *
 * The worse half was that the guard agreed. `no-anonymous-spend` scans `shared`,
 * so this file was in scope, but its two detectors matched the repository's two
 * LLM wrappers and a raw SDK call matched neither. The guard the whole cost
 * epic leans on was green over a paid call it could not see; the third detector
 * and its own cases live in that file.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logTrace, createModelConfigService, completionsCreate, redisGet, redisSet } = vi.hoisted(
  () => ({
    logTrace: vi.fn(() => Promise.resolve(undefined)),
    completionsCreate: vi.fn(),
    redisGet: vi.fn(() => Promise.resolve(null)),
    redisSet: vi.fn(() => Promise.resolve(true)),
    createModelConfigService: vi.fn(() => ({
      getModelForPhase: vi.fn(() =>
        Promise.resolve({ modelId: 'openai/gpt-5.6-luna', temperature: 0.1, maxTokens: 256 })
      ),
    })),
  })
);

// The classifier builds its own client when the caller passes none, which is
// the path a cache hit takes.
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: completionsCreate } };
  },
}));

vi.mock('@/shared/trace-logger', () => ({ logTrace }));
vi.mock('@/shared/cache/redis', () => ({ cache: { get: redisGet, set: redisSet } }));
vi.mock('@/services/token-tracking-service', () => ({
  updateCourseEstimatedCost: vi.fn(() => Promise.resolve(0)),
}));
vi.mock('@/shared/llm/model-config-service.js', () => ({
  createModelConfigService,
  isMissingChatPhaseConfigError: vi.fn(() => false),
}));
vi.mock('@/shared/logger/index.js', () => {
  const stub = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { logger: stub, default: stub };
});
vi.mock('@/shared/logger', () => {
  const stub = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { logger: stub, default: stub };
});

import { classifyIntent } from '@/shared/intent/classifier';

const COURSE_ID = '20000000-0000-4000-8000-000000000001';

/** The client the caller passes in tests; the classifier then skips the cache. */
const client = { chat: { completions: { create: completionsCreate } } } as never;

function answer(content: string, usage = { prompt_tokens: 420, completion_tokens: 60 }) {
  return {
    model: 'openai/gpt-5.6-luna',
    usage,
    choices: [{ finish_reason: 'stop', message: { content } }],
  };
}

const DELETE_LESSON = JSON.stringify({
  intent: 'DELETE_LESSON',
  confidence: 0.95,
  target: { elementType: 'lesson', identifier: 'урок 2.3', path: null },
  destination: null,
  fieldName: null,
  newValue: null,
});

describe('an intent classification is charged to its course', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a priced trace row against the course that was edited', async () => {
    completionsCreate.mockResolvedValue(answer(DELETE_LESSON));

    await classifyIntent(COURSE_ID, 'удали урок 2.3', undefined, client);

    expect(logTrace).toHaveBeenCalledTimes(1);
    const [entry] = logTrace.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({
      courseId: COURSE_ID,
      // `chat_*` already maps to the editing stage, so this needed no new
      // plumbing in the cost path.
      stage: 'stage_edit',
      phase: 'chat_intent_classification',
      modelUsed: 'openai/gpt-5.6-luna',
      tokensUsed: 480,
    });
    // Catalogue price for gpt-5.6-luna: $0.10 in, $0.60 out per million.
    expect(entry.costUsd).toBeCloseTo((420 * 0.1 + 60 * 0.6) / 1_000_000, 12);
  });

  it('prices the model the provider served, not only the one asked for', async () => {
    completionsCreate.mockResolvedValue({
      ...answer(DELETE_LESSON),
      model: 'openai/gpt-5.6-luna-2026-04-01',
    });

    await classifyIntent(COURSE_ID, 'удали урок 2.3', undefined, client);

    const [entry] = logTrace.mock.calls[0] as [Record<string, unknown>];
    expect(entry.modelUsed).toBe('openai/gpt-5.6-luna-2026-04-01');
  });

  it('records a call that was paid for and produced nothing usable', async () => {
    // A truncated answer costs exactly what a usable one costs, and this one
    // returns UNKNOWN — the money is spent either way.
    completionsCreate.mockResolvedValue({
      model: 'openai/gpt-5.6-luna',
      usage: { prompt_tokens: 420, completion_tokens: 256 },
      choices: [{ finish_reason: 'length', message: { content: '{"intent":' } }],
    });

    const result = await classifyIntent(COURSE_ID, 'удали урок 2.3', undefined, client);

    expect(result).toEqual({ intent: 'UNKNOWN', confidence: 0 });
    expect(logTrace).toHaveBeenCalledTimes(1);
    expect((logTrace.mock.calls[0][0] as { tokensUsed: number }).tokensUsed).toBe(676);
  });

  it('spends nothing, and records nothing, on a cache hit', async () => {
    // The cache is the reason this call is cheap in aggregate; it is also why
    // the missing row was easy to overlook.
    redisGet.mockResolvedValue({ intent: 'DELETE_LESSON', confidence: 0.95 } as never);

    await classifyIntent(COURSE_ID, 'удали урок 2.3');

    expect(completionsCreate).not.toHaveBeenCalled();
    expect(logTrace).not.toHaveBeenCalled();
  });
});
