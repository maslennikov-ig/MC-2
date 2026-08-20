/**
 * Contract: an administrator changing `stage_7_presentation` changes the whole
 * presentation, not half of it.
 *
 * The final call read `settings.model` alone. That was invisible while this
 * package always wrote that key, but once a first attempt stopped forcing a
 * model (mc2-b7olk.8) the key was absent, the call fell through to
 * DEFAULT_MODEL_ID, and the database was never consulted — so one presentation
 * could be drafted by the configured model and finished by another (mc2-vk1zl).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateCompletion, resolveModelWithFallback } = vi.hoisted(() => ({
  generateCompletion: vi.fn(),
  resolveModelWithFallback: vi.fn(),
}));

vi.mock('@/shared/llm/client', () => ({ llmClient: { generateCompletion } }));
vi.mock('@/shared/llm/model-config-service', () => ({ resolveModelWithFallback }));
vi.mock('@/stages/stage7-enrichments/services/database-service', () => ({
  getLessonContent: vi.fn(() =>
    Promise.resolve('# Lesson\n\n## Objectives\n- Understand pagination\n')
  ),
}));
vi.mock('@/shared/logger', () => {
  const stub = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { logger: stub, default: stub };
});

import { presentationHandler } from '@/stages/stage7-enrichments/handlers/presentation-handler';
import { LLM_CALL_BUDGET } from '@/stages/stage7-enrichments/config';
import type { EnrichmentHandlerInput } from '@/stages/stage7-enrichments/types';

/** The model `llm_model_config.stage_7_presentation` names for this course. */
const CONFIGURED_MODEL = 'moonshotai/kimi-k2-thinking';

const DRAFT_JSON = JSON.stringify({
  outline: [
    { title: 'Why pagination', key_points: ['A capped select is silent'], layout: 'title' },
    { title: 'How it works', key_points: ['Advance by what came back'], layout: 'content' },
    { title: 'Recap', key_points: ['The sum cannot truncate'], layout: 'content' },
  ],
  metadata: { estimated_slides: 3, theme: 'default' },
});

const FINAL_JSON = JSON.stringify({
  theme: 'default',
  slides: [
    { index: 0, title: 'Why pagination', content: 'A capped select is silent', layout: 'title' },
  ],
  metadata: { total_slides: 1, estimated_duration_minutes: 3 },
});

function handlerInput(settings: Record<string, unknown> = {}): EnrichmentHandlerInput {
  return {
    enrichmentContext: {
      enrichment: { id: 'enr-1', lesson_id: 'lesson-1', course_id: 'course-1' },
      lesson: { id: 'lesson-1', title: 'Pagination', course_id: 'course-1' },
      course: { id: 'course-1', title: 'Reading a big table', language: 'en' },
    },
    settings,
  } as unknown as EnrichmentHandlerInput;
}

/** Every model the handler asked the client to call, in order. */
function modelsCalled(): string[] {
  return generateCompletion.mock.calls.map(call => (call[1] as { model: string }).model);
}

describe('the presentation model comes from the phase config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveModelWithFallback.mockResolvedValue(CONFIGURED_MODEL);
    generateCompletion
      .mockResolvedValueOnce({
        content: DRAFT_JSON,
        model: CONFIGURED_MODEL,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      })
      .mockResolvedValue({
        content: FINAL_JSON,
        model: CONFIGURED_MODEL,
        inputTokens: 200,
        outputTokens: 120,
        totalTokens: 320,
      });
  });

  it('uses the configured model for both the draft and the final slides', async () => {
    // A first attempt writes no `settings.model`, which is the case the final
    // call used to read as "nothing configured".
    const input = handlerInput();

    const draft = await presentationHandler.generateDraft!(input);
    await presentationHandler.generateFinal!(input, draft);

    expect(modelsCalled()).toEqual([CONFIGURED_MODEL, CONFIGURED_MODEL]);
  });

  it('asks the database for the presentation phase on the final call too', async () => {
    const input = handlerInput();

    const draft = await presentationHandler.generateDraft!(input);
    resolveModelWithFallback.mockClear();
    await presentationHandler.generateFinal!(input, draft);

    expect(resolveModelWithFallback).toHaveBeenCalledTimes(1);
    expect(resolveModelWithFallback.mock.calls[0][0]).toMatchObject({
      phaseName: 'stage_7_presentation',
      courseId: 'course-1',
    });
  });

  it('still lets a retry force the fallback model onto both calls', async () => {
    // On a retry the job processor writes `settings.model`, and resolution
    // gives that precedence over the phase config.
    resolveModelWithFallback.mockResolvedValue('qwen/qwen3-235b-a22b-2507');
    const input = handlerInput({ model: 'qwen/qwen3-235b-a22b-2507' });

    const draft = await presentationHandler.generateDraft!(input);
    await presentationHandler.generateFinal!(input, draft);

    expect(modelsCalled()).toEqual(['qwen/qwen3-235b-a22b-2507', 'qwen/qwen3-235b-a22b-2507']);
    for (const call of resolveModelWithFallback.mock.calls) {
      expect(call[0]).toMatchObject({ settingsModel: 'qwen/qwen3-235b-a22b-2507' });
    }
  });

  it('bounds both calls by the enrichment budget, not the shared 238s default', async () => {
    const input = handlerInput();

    const draft = await presentationHandler.generateDraft!(input);
    await presentationHandler.generateFinal!(input, draft);

    for (const call of generateCompletion.mock.calls) {
      expect(call[1]).toMatchObject({
        timeout: LLM_CALL_BUDGET.timeoutMs,
        maxRetries: LLM_CALL_BUDGET.transportRetries,
      });
    }
  });
});
