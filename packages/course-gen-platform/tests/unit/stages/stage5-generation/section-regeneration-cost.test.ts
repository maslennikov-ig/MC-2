/**
 * Contract: regenerating a section reports what the regeneration was recorded
 * as costing.
 *
 * The repository rule is one paid call, one priced row, priced at the call.
 * Section regeneration kept the first two halves and dropped the third: the
 * generator builds its model through `createCostRecordingModelAsync`, so every
 * call already wrote a priced `generation_trace` row, but the history entry the
 * service persisted carried a hardcoded `cost_usd: 0` behind a TODO. A field
 * that is always zero is not a cheap regeneration, it is a measurement nobody
 * took — and it reads identically to one (mc2-sdjy8.2).
 *
 * The three tests below are the three links of the read-back, because a break
 * in any one of them restores the silent zero:
 *
 * 1. the recorder hands back the figure it wrote;
 * 2. the section batch asks for that figure and returns it;
 * 3. the regeneration history entry is that figure.
 *
 * @module tests/unit/stages/stage5-generation/section-regeneration-cost
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Section, CourseStructure, GenerationJobInput } from '@megacampus/shared-types';

// ============================================================================
// MOCKS — must precede any import of the modules under test
// ============================================================================

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { default: noop, logger: noop };
});

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue('trace-id'),
}));

vi.mock('@/shared/metrics/llm-cost', () => ({
  recordLlmCallCost: vi.fn(),
}));

vi.mock('@/shared/llm/langchain-models', () => ({
  createCostRecordingModelAsync: vi.fn(),
}));

vi.mock('@/stages/stage5-generation/utils/section-batch/prompt-builder', () => ({
  buildBatchPrompt: vi.fn().mockResolvedValue('SECTION PROMPT'),
}));

vi.mock('@/shared/regeneration', () => ({
  UnifiedRegenerator: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/shared/course-nodes/writer', () => ({
  writeCourseNodes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/course-nodes/feature-flags', () => ({
  assertStableIds: vi.fn(),
}));

vi.mock('@/shared/course-nodes/structure-resolver', () => ({
  resolveStructure: vi.fn(),
}));

import { recordLlmCallCost } from '@/shared/metrics/llm-cost';
import { costRecordingCallbacks } from '@/shared/llm/model-cost-callbacks';
import { createCostRecordingModelAsync } from '@/shared/llm/langchain-models';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { resolveStructure } from '@/shared/course-nodes/structure-resolver';
import { generateWithRetry } from '@/stages/stage5-generation/utils/section-batch/generator-core';
import type { ModelTier } from '@/stages/stage5-generation/utils/section-batch/types';
import { SectionRegenerationService } from '@/stages/stage5-generation/utils/section-regeneration-service';
import type { SectionBatchGenerator } from '@/stages/stage5-generation/utils/section-batch-generator';

// ============================================================================
// FIXTURES
// ============================================================================

function makeSection(sectionNumber: number, title: string): Section {
  return {
    section_number: sectionNumber,
    section_title: title,
    section_description: `A section that covers ${title} in workable detail.`,
    learning_objectives: [`Understand the essentials of ${title}`],
    lessons: [
      {
        lesson_number: 1,
        lesson_title: `Getting started with ${title}`,
        lesson_description: `An opening lesson that introduces ${title} to a new learner.`,
        lesson_objectives: [`Describe what ${title} is for`, `Apply ${title} to a small task`],
        key_topics: [`Foundations of ${title}`, `Everyday uses of ${title}`],
        estimated_duration_minutes: 15,
      },
    ],
  } as unknown as Section;
}

function makeJobInput(courseId: string): GenerationJobInput {
  return {
    course_id: courseId,
    organization_id: 'org-1',
    user_id: 'user-1',
    analysis_result: null,
    frontend_parameters: { course_title: 'Cost Read-back Course', language: 'en' },
    vectorized_documents: false,
    document_summaries: [],
  } as unknown as GenerationJobInput;
}

const NORMAL_TIER: ModelTier = {
  model: 'test/section-model',
  tier: 'normal',
  reason: 'fixed for the test',
  temperature: 0.7,
  maxTokens: 8000,
};

// ============================================================================
// LINK 1 — the recorder hands back what it wrote
// ============================================================================

describe('costRecordingCallbacks reports the recorded cost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hands the sink exactly the figure recordLlmCallCost wrote to the row', async () => {
    vi.mocked(recordLlmCallCost).mockResolvedValue(0.0731);
    const recorded: Array<number | undefined> = [];

    const callbacks = costRecordingCallbacks('test/section-model', 'stage_5_normal', 'course-1', v =>
      recorded.push(v)
    );

    const handler = (callbacks as Array<{ handleLLMEnd: (o: unknown) => Promise<void> }>)[0];
    await handler.handleLLMEnd({
      generations: [[{ message: { id: 'gen-abc' } }]],
      llmOutput: { tokenUsage: { promptTokens: 1200, completionTokens: 900 } },
    });

    expect(recorded).toEqual([0.0731]);
  });

  it('passes an unrecorded price through as undefined rather than as a zero', async () => {
    vi.mocked(recordLlmCallCost).mockResolvedValue(undefined);
    const recorded: Array<number | undefined> = [];

    const callbacks = costRecordingCallbacks('test/section-model', 'stage_5_normal', 'course-1', v =>
      recorded.push(v)
    );

    const handler = (callbacks as Array<{ handleLLMEnd: (o: unknown) => Promise<void> }>)[0];
    await handler.handleLLMEnd({
      generations: [[{ message: { id: 'gen-abc' } }]],
      llmOutput: { tokenUsage: { promptTokens: 10, completionTokens: 10 } },
    });

    expect(recorded).toEqual([undefined]);
  });
});

// ============================================================================
// LINK 2 — the section batch asks for the figure and returns it
// ============================================================================

describe('section batch generation carries a cost context and reports the cost', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // A function expression, not an arrow: the generator calls this with `new`.
    vi.mocked(UnifiedRegenerator).mockImplementation(function () {
      return {
        regenerate: vi.fn().mockResolvedValue({
          success: true,
          data: { sections: [makeSection(3, 'Incremental section regeneration')] },
          metadata: { layerUsed: 'none', retryCount: 0, qualityPassed: true },
        }),
      } as never;
    } as never);
  });

  it('builds the model with the course id and a stage_5 phase, and returns the recorded cost', async () => {
    vi.mocked(createCostRecordingModelAsync).mockImplementation(
      (
        _modelId,
        _temperature,
        _maxTokens,
        _phase,
        _courseId,
        _reasoning,
        _timeoutMs,
        onCostRecorded
      ) =>
        Promise.resolve({
          invoke: vi.fn().mockImplementation(() => {
            // Stands in for the recording callback: the model's own call
            // reports what it was recorded as costing.
            onCostRecorded?.(0.0421);
            return Promise.resolve({ content: JSON.stringify({ sections: [] }) });
          }),
        } as never)
    );

    const result = await generateWithRetry(
      3,
      2,
      makeJobInput('course-cost-1'),
      NORMAL_TIER,
      undefined,
      'en'
    );

    // (a) the call carries a cost context: a course to bill and a stage_5 phase.
    const [modelId, , , phase, courseId, , , sink] = vi.mocked(createCostRecordingModelAsync).mock
      .calls[0];
    expect(modelId).toBe('test/section-model');
    expect(phase).toBe('stage_5_normal');
    expect(courseId).toBe('course-cost-1');
    expect(typeof sink).toBe('function');

    // (b) the batch reports the recorded figure, not a placeholder.
    expect(result.costUsd).toBe(0.0421);
  });

  it('adds up every call the attempt made rather than reporting only the last', async () => {
    vi.mocked(createCostRecordingModelAsync).mockImplementation(
      (
        _modelId,
        _temperature,
        _maxTokens,
        _phase,
        _courseId,
        _reasoning,
        _timeoutMs,
        onCostRecorded
      ) =>
        Promise.resolve({
          invoke: vi.fn().mockImplementation(() => {
            onCostRecorded?.(0.02);
            // A second priced call on the same model, as the regenerator makes.
            onCostRecorded?.(0.005);
            return Promise.resolve({ content: JSON.stringify({ sections: [] }) });
          }),
        } as never)
    );

    const result = await generateWithRetry(
      3,
      2,
      makeJobInput('course-cost-2'),
      NORMAL_TIER,
      undefined,
      'en'
    );

    expect(result.costUsd).toBeCloseTo(0.025, 10);
  });

  it('reports no cost at all when no call was priced', async () => {
    vi.mocked(createCostRecordingModelAsync).mockImplementation(
      (
        _modelId,
        _temperature,
        _maxTokens,
        _phase,
        _courseId,
        _reasoning,
        _timeoutMs,
        onCostRecorded
      ) =>
        Promise.resolve({
          invoke: vi.fn().mockImplementation(() => {
            onCostRecorded?.(undefined);
            return Promise.resolve({ content: JSON.stringify({ sections: [] }) });
          }),
        } as never)
    );

    const result = await generateWithRetry(
      3,
      2,
      makeJobInput('course-cost-3'),
      NORMAL_TIER,
      undefined,
      'en'
    );

    expect(result.costUsd).toBeUndefined();
  });
});

// ============================================================================
// LINK 3 — the history entry is that figure
// ============================================================================

interface UpdateCapture {
  payloads: Array<Record<string, unknown>>;
}

function makeSupabaseStub(courseRow: Record<string, unknown>, capture: UpdateCapture): unknown {
  const chain = (): Record<string, unknown> => {
    const node: Record<string, unknown> = {
      select: () => node,
      update: (payload: Record<string, unknown>) => {
        capture.payloads.push(payload);
        return node;
      },
      eq: () => node,
      single: () => Promise.resolve({ data: courseRow, error: null }),
      // An update chain is awaited directly, so the chain has to settle.
      then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
    };
    return node;
  };

  return { from: () => chain() };
}

describe('SectionRegenerationService writes the recorded cost into its history', () => {
  const existingStructure: CourseStructure = {
    sections: [makeSection(1, 'Opening the course properly')],
  } as unknown as CourseStructure;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveStructure).mockResolvedValue(existingStructure);
  });

  async function regenerateWith(
    batchResult: Record<string, unknown>
  ): Promise<Array<Record<string, unknown>>> {
    const capture: UpdateCapture = { payloads: [] };

    vi.mocked(getSupabaseAdmin).mockReturnValue(
      makeSupabaseStub(
        {
          course_structure: existingStructure,
          analysis_result: {
            recommended_structure: {
              sections_breakdown: [{ area: 'Opening', estimated_lessons: 1 }],
            },
          },
          generation_metadata: {},
          title: 'Cost Read-back Course',
          language: 'en',
          style: null,
        },
        capture
      ) as never
    );

    const generator = {
      generateBatch: vi.fn().mockResolvedValue(batchResult),
    } as unknown as SectionBatchGenerator;

    const service = new SectionRegenerationService(generator);
    await service.regenerateSection('course-cost-4', 1, 'user-1', 'org-1');

    return capture.payloads;
  }

  it('persists the cost the generator recorded, not a placeholder zero', async () => {
    const payloads = await regenerateWith({
      sections: [makeSection(1, 'A freshly regenerated section')],
      modelUsed: 'test/section-model',
      tier: 'normal',
      tokensUsed: 2100,
      retryCount: 0,
      costUsd: 0.0421,
    });

    const metadataUpdate = payloads.find(payload => 'generation_metadata' in payload);
    const history = (
      metadataUpdate?.generation_metadata as {
        regeneration_history: Array<{ cost_usd?: number; tokens_used: number }>;
      }
    ).regeneration_history;

    expect(history).toHaveLength(1);
    expect(history[0].cost_usd).toBe(0.0421);
    expect(history[0].tokens_used).toBe(2100);
  });

  it('leaves the cost off the entry when the regeneration recorded no price', async () => {
    const payloads = await regenerateWith({
      sections: [makeSection(1, 'A freshly regenerated section')],
      modelUsed: 'test/section-model',
      tier: 'normal',
      tokensUsed: 2100,
      retryCount: 0,
    });

    const metadataUpdate = payloads.find(payload => 'generation_metadata' in payload);
    const history = (
      metadataUpdate?.generation_metadata as {
        regeneration_history: Array<{ cost_usd?: number }>;
      }
    ).regeneration_history;

    expect(history).toHaveLength(1);
    expect(history[0].cost_usd).toBeUndefined();
    expect('cost_usd' in history[0]).toBe(false);
  });
});
