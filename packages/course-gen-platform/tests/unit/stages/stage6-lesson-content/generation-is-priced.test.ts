/**
 * Contract: writing a lesson leaves a priced trace row.
 *
 * Lesson generation is the single largest cost line in the pipeline, and it was
 * recorded with tokens and a null price on every ordinary run: the only figure
 * the node had came from a Batch API response, and the Batch feature is off by
 * default. The course total is a sum over `generation_trace.cost_usd`, so the
 * biggest line was silently omitted — measured on the paid run of 2026-08-16,
 * course 944e6795: 31506 generator tokens and 5523 section-regeneration tokens,
 * all unpriced (mc2-4wiot).
 *
 * The price is taken at the call, not at the node, because the call is the only
 * place that holds the input/output split the tariff needs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { getContentLabels } from '@megacampus/shared-types';

const { logTraceMock, invokeMock, createModelMock } = vi.hoisted(() => ({
  logTraceMock: vi.fn(),
  invokeMock: vi.fn(),
  createModelMock: vi.fn(),
}));

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: { ...noop, child: () => noop }, default: { ...noop, child: () => noop } };
});
vi.mock('@/shared/trace-logger', () => ({ logTrace: logTraceMock }));
vi.mock('@/shared/llm/langchain-models', () => ({
  createCostRecordingModel: createModelMock,
  // The batch corrective retry deliberately builds an unpriced model.
  createOpenRouterModel: vi.fn(() => ({ invoke: invokeMock })),
}));

import { costRecordingCallbacks } from '@/shared/llm/model-cost-callbacks';

import { generateLessonSingleCall } from '@/stages/stage6-lesson-content/nodes/generator/generator-single-call';
import { generateTruncationContinuation } from '@/stages/stage6-lesson-content/nodes/generator/generator-truncation';
import { prepareLessonSingleCallRequest } from '@/stages/stage6-lesson-content/nodes/generator/generator-request';

vi.mock('@/stages/stage6-lesson-content/nodes/generator/generator-request', () => ({
  prepareLessonSingleCallRequest: vi.fn(),
}));
vi.mock('@/stages/stage6-lesson-content/nodes/generator/model-selector', () => ({
  selectStage6ModelTier: vi.fn(),
}));
vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: () => ({ getModelForPhase: async () => ({ modelId: MODEL }) }),
  REASONING_DISABLED: { enabled: false },
}));
vi.mock('@/shared/prompts/prompt-service', () => ({
  createPromptService: () => ({ renderPrompt: async () => 'write this section' }),
}));

import { generateSection } from '@/stages/stage6-lesson-content/nodes/generator/generator-section';

import { selectStage6ModelTier } from '@/stages/stage6-lesson-content/nodes/generator/model-selector';

const COURSE_ID = '944e6795-580c-45b7-8eee-75a67c123965';
const MODEL = 'openai/gpt-5.6-luna';
const LABELS = getContentLabels('en');
const CONTENT = `## ${LABELS.introduction}\n\nA short opening.\n\n## Body\n\nThe lesson itself.\n`;

/** OpenRouter's name for the call, as LangChain puts it on the message. */
const GENERATION_ID = 'gen-1787317000-Stage6Receipt';

/**
 * The model the node was handed, built the way the factory builds it.
 *
 * The callbacks are the real ones: they are what turns a call into a priced row,
 * and a test that invented its own would be testing itself. Only the transport
 * is fake.
 */
let lastModel: { invoke: typeof invokeMock; callbacks?: unknown };

/** What the provider hands back, with the split LangChain reports. */
async function fireLLMEnd(
  model: { callbacks?: unknown },
  promptTokens: number,
  completionTokens: number
): Promise<void> {
  const callbacks = model.callbacks as
    | Array<{ handleLLMEnd: (output: unknown) => Promise<void> }>
    | undefined;
  expect(callbacks, 'the model was created without cost recording').toBeDefined();
  await callbacks![0].handleLLMEnd({
    llmOutput: { tokenUsage: { promptTokens, completionTokens } },
    generations: [[{ message: { id: GENERATION_ID } }]],
  });
}

function lessonSpec(): LessonSpecificationV2 {
  return {
    lesson_id: '2.1',
    title: 'Time management basics',
    description: 'A lesson',
    estimated_duration_minutes: 10,
    difficulty_level: 'beginner',
    learning_objectives: [],
    sections: [{ title: 'Body' }],
    metadata: { target_audience: 'beginner', tone: 'neutral', content_archetype: 'concept' },
  } as unknown as LessonSpecificationV2;
}

beforeEach(() => {
  vi.clearAllMocks();
  createModelMock.mockImplementation(
    (
      modelId: string,
      _temperature: number,
      _maxTokens: number,
      phase: string,
      courseId?: string
    ) => {
      lastModel = {
        invoke: invokeMock,
        callbacks: costRecordingCallbacks(modelId, phase, courseId),
      };
      return lastModel;
    }
  );
  invokeMock.mockResolvedValue({
    content: CONTENT,
    response_metadata: { tokenUsage: { totalTokens: 9000 } },
  });
});

describe('Stage 6 generation prices itself', () => {
  it('charges a written lesson to the course, at the tier that wrote it', async () => {
    vi.mocked(prepareLessonSingleCallRequest).mockResolvedValue({
      prompt: 'write the lesson',
      modelId: MODEL,
      phaseName: 'stage_6_simple',
      temperature: 0.7,
      maxTokens: 8000,
      reasoning: { enabled: false },
      labels: LABELS,
      digestHeader: LABELS.lessonDigest,
      outputLanguage: 'English',
      targetWordCount: 1500,
    } as never);

    await generateLessonSingleCall(lessonSpec(), [], 'en', null, null, null, COURSE_ID);
    await fireLLMEnd(lastModel, 10_000, 5_000);

    const row = logTraceMock.mock.calls
      .map(call => call[0])
      .find(arg => arg.stepName === 'llm_call');
    expect(row).toMatchObject({
      courseId: COURSE_ID,
      stage: 'stage_6',
      phase: 'stage_6_simple',
      modelUsed: MODEL,
      tokensUsed: 15_000,
    });
    // 10k in at $0.2/M plus 5k out at $1.2/M. Both legs doubled on 2026-08-21:
    // the catalogue had been carrying luna's Batch tariff as its synchronous one
    // (mc2-v1pn2).
    expect(row.costUsd).toBeCloseTo(0.008, 6);
    // The receipt: without it the row is priced from the catalogue and can never
    // be settled against what OpenRouter actually billed (mc2-258fi).
    expect(row.inputData).toMatchObject({ billedCall: true, generationId: GENERATION_ID });
  });

  it('charges the continuation of a truncated lesson too', async () => {
    vi.mocked(selectStage6ModelTier).mockResolvedValue({
      model: MODEL,
      fallback: MODEL,
      tier: 'simple',
      reason: 'test',
      phaseName: 'stage_6_simple',
      source: 'test',
      reasoning: { enabled: false },
    } as never);
    invokeMock.mockResolvedValue({
      content: 'the rest of the lesson',
      response_metadata: { tokenUsage: { totalTokens: 900 } },
    });

    await generateTruncationContinuation(lessonSpec(), CONTENT, 'en', COURSE_ID);
    await fireLLMEnd(lastModel, 800, 200);

    const row = logTraceMock.mock.calls
      .map(call => call[0])
      .find(arg => arg.stepName === 'llm_call');
    expect(row).toMatchObject({ courseId: COURSE_ID, stage: 'stage_6', modelUsed: MODEL });
    expect(row.costUsd).toBeGreaterThan(0);
  });

  it('charges a regenerated section, which the judge sends back most often', async () => {
    invokeMock.mockResolvedValue({
      content: 'the rewritten section',
      response_metadata: { tokenUsage: { totalTokens: 2700 } },
    });

    const spec = lessonSpec();
    await generateSection(
      spec.sections[0] as never,
      spec,
      [],
      '',
      'en',
      COURSE_ID,
      null,
      null,
      null
    );
    await fireLLMEnd(lastModel, 2_000, 700);

    const row = logTraceMock.mock.calls
      .map(call => call[0])
      .find(arg => arg.stepName === 'llm_call');
    expect(row).toMatchObject({ courseId: COURSE_ID, stage: 'stage_6', modelUsed: MODEL });
    expect(row.costUsd).toBeGreaterThan(0);
  });

  it('records nothing when there is no course to charge, instead of guessing one', async () => {
    vi.mocked(prepareLessonSingleCallRequest).mockResolvedValue({
      prompt: 'write the lesson',
      modelId: MODEL,
      phaseName: 'stage_6_simple',
      temperature: 0.7,
      maxTokens: 8000,
      reasoning: { enabled: false },
      labels: LABELS,
      digestHeader: LABELS.lessonDigest,
      outputLanguage: 'English',
      targetWordCount: 1500,
    } as never);

    await generateLessonSingleCall(lessonSpec(), [], 'en', null, null, null, undefined);

    expect(lastModel.callbacks).toBeUndefined();
    expect(logTraceMock.mock.calls.some(call => call[0].stepName === 'llm_call')).toBe(false);
  });
});
