import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ArbiterOutput,
  LessonContent,
  RefinementEvent,
  SectionRefinementTask,
  TargetedIssue,
} from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';
import { executeTargetedRefinement } from '@/stages/stage6-lesson-content/judge/targeted-refinement/orchestrator';
import type { TargetedRefinementInput } from '@/stages/stage6-lesson-content/judge/targeted-refinement/types';

vi.mock('@/stages/stage6-lesson-content/judge/targeted-refinement/task-executor', () => ({
  executePatcherTask: vi.fn(),
  executeExpanderTask: vi.fn(),
  verifyPatchWithDeltaJudge: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  },
}));

import {
  executeExpanderTask,
  executePatcherTask,
} from '@/stages/stage6-lesson-content/judge/targeted-refinement/task-executor';

function createMockLessonContent(sectionCount: number): LessonContent {
  return {
    lesson_id: '11111111-1111-4111-8111-111111111111',
    course_id: '22222222-2222-4222-8222-222222222222',
    content: {
      introduction: 'Lesson introduction.',
      sections: Array.from({ length: sectionCount }, (_, index) => ({
        title: `Section ${index + 1}`,
        content: `Content for section ${index + 1} with enough text to satisfy test fixtures.`,
      })),
      summary: 'Lesson summary.',
      exercises: [],
    },
    metadata: {
      total_words: 100,
      total_tokens: 200,
      cost_usd: 0.01,
      quality_score: 0.7,
      rag_chunks_used: 0,
      generation_duration_ms: 1000,
      model_used: 'test-model',
      archetype_used: 'concept_explainer',
      temperature_used: 0.3,
    },
    status: 'completed',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function createMockIssue(sectionId: string): TargetedIssue {
  return {
    id: `issue_${sectionId}`,
    criterion: 'clarity_readability',
    severity: 'major',
    location: `section ${sectionId}`,
    description: 'Sentence structure is too complex for the target audience.',
    quotedText: 'Content for section',
    suggestedFix: 'Use shorter and clearer sentences.',
    inlineReplacement: undefined,
    targetSectionId: sectionId,
    fixAction: 'SURGICAL_EDIT',
    contextWindow: {
      startQuote: 'Content',
      endQuote: 'section',
      scope: 'section',
    },
    fixInstructions: 'Rewrite the section for clarity.',
  };
}

function createMockTask(sectionId: string): SectionRefinementTask {
  const issue = createMockIssue(sectionId);
  return {
    sectionId,
    sectionTitle: `Section ${sectionId}`,
    actionType: 'SURGICAL_EDIT',
    synthesizedInstructions: `Improve ${sectionId} clarity.`,
    contextAnchors: {
      prevSectionEnd: undefined,
      nextSectionStart: undefined,
    },
    priority: 'major',
    sourceIssues: [issue],
  };
}

function createMockArbiterOutput(
  tasks: SectionRefinementTask[],
  overrides: Partial<ArbiterOutput> = {}
): ArbiterOutput {
  const allIssues = tasks.flatMap(task => task.sourceIssues);

  return {
    agreementLevel: 'high',
    agreementScore: 0.85,
    acceptedIssues: allIssues,
    rejectedIssues: [],
    plan: {
      status: 'PENDING',
      issues: [],
      sectionsToPreserve: [],
      sectionsToModify: [],
      preserveTerminology: [],
      iterationHistory: [],
      tasks,
      estimatedCost: 0,
      agreementScore: 0.85,
      conflictResolutions: [],
      executionBatches: [],
    },
    tokensUsed: 0,
    durationMs: 10,
    ...overrides,
  };
}

function createInput(
  content: LessonContent,
  arbiterOutput: ArbiterOutput,
  overrides: Partial<TargetedRefinementInput> = {}
): TargetedRefinementInput {
  return {
    content,
    arbiterOutput,
    operationMode: 'full-auto',
    ...overrides,
  };
}

describe('executeTargetedRefinement token safety', () => {
  const mockExecutePatcherTask = vi.mocked(executePatcherTask);
  const mockExecuteExpanderTask = vi.mocked(executeExpanderTask);

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteExpanderTask.mockReset();
  });

  it('stops before starting the next task when token budget is exhausted', async () => {
    const content = createMockLessonContent(2);
    const tasks = [createMockTask('sec_1'), createMockTask('sec_2')];
    const arbiterOutput = createMockArbiterOutput(tasks, {
      agreementScore: 0.6,
      tokensUsed: REFINEMENT_CONFIG.limits.maxTokens - 100,
    });
    const events: RefinementEvent[] = [];

    mockExecutePatcherTask.mockResolvedValue({
      success: true,
      sectionId: 'sec_1',
      patchedContent: 'Patched section 1.',
      tokensUsed: 250,
    });

    const result = await executeTargetedRefinement(
      createInput(content, arbiterOutput, {
        onStreamEvent: (event: RefinementEvent) => events.push(event),
      })
    );

    expect(mockExecutePatcherTask).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('best_effort');
    expect(result.bestEffortResult?.bestScore).toBeDefined();
    expect(result.tokensUsed).toBe(REFINEMENT_CONFIG.limits.maxTokens + 150);
    expect(events.some(event => event.type === 'budget_warning')).toBe(true);
  });

  it('caps executed tasks per iteration to five', async () => {
    const content = createMockLessonContent(6);
    const tasks = Array.from({ length: 6 }, (_, index) => createMockTask(`sec_${index + 1}`));
    const arbiterOutput = createMockArbiterOutput(tasks, {
      agreementScore: 0.85,
    });

    mockExecutePatcherTask.mockImplementation((task: { sectionId: string }) =>
      Promise.resolve({
        success: true,
        sectionId: task.sectionId,
        patchedContent: `Patched ${task.sectionId}`,
        tokensUsed: 120,
      })
    );

    const result = await executeTargetedRefinement(createInput(content, arbiterOutput));

    expect(result.iterations).toBe(1);
    expect(mockExecutePatcherTask).toHaveBeenCalledTimes(5);
  });
});
