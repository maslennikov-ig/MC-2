import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobType } from '@megacampus/shared-types';
import { CareerPlaybookHandler } from '@/orchestrator/handlers/career-playbook-handler';
import { createCareerPlaybookRuntime } from '@/stages/stage-career-playbook/nodes/runtime';
import { getCareerPlaybookGraph } from '@/stages/stage-career-playbook/graph';

vi.mock('@/stages/stage-career-playbook/nodes/runtime', () => ({
  createCareerPlaybookRuntime: vi.fn(),
}));

vi.mock('@/stages/stage-career-playbook/graph', () => ({
  getCareerPlaybookGraph: vi.fn(),
}));

const baseJobData = {
  organizationId: '0f9dc5e4-a2f7-4af5-968f-81c8a92b7253',
  courseId: 'fe0ca675-8d3f-4372-a7c3-2781916a5cd2',
  userId: '4b7c5538-2367-4012-9088-c2cad7dac9a9',
  jobType: JobType.CAREER_PLAYBOOK,
  createdAt: '2026-05-19T10:00:00.000Z',
  playbookId: '88de7022-17f5-4d30-b982-5fefb3dbe354',
  language: 'en',
  qaData: {
    fixed: [{ question_key: 'position', value: 'Head of Sales' }],
    followups: [],
    freeform: [],
  },
};

function createJob(data: unknown) {
  return {
    id: 'job-1',
    name: JobType.CAREER_PLAYBOOK,
    data,
    attemptsMade: 0,
    opts: {},
    updateProgress: vi.fn(),
    log: vi.fn(),
  } as never;
}

describe('CareerPlaybookHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes missing or invalid LLM follow-up question ids before returning strict data', async () => {
    vi.mocked(createCareerPlaybookRuntime).mockReturnValue({
      renderPrompt: vi.fn().mockResolvedValue('rendered prompt'),
      invokeLLM: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          questions: [
            {
              question_id: 'not-a-uuid',
              question_text: 'Which revenue motion matters most?',
              question_type: 'open',
              options: null,
              rationale: 'Needed for role guide focus.',
            },
            {
              question_text: 'Which segment owns the pipeline?',
              question_type: 'open',
              options: null,
              rationale: 'Needed for scope.',
            },
          ],
          completeness_score: 0.7,
          stop_recommendation: 'ask_more',
        }),
        model: 'mock-career-model',
        inputTokens: 100,
        outputTokens: 200,
        costUsd: 0.012,
      }),
    });

    const result = await new CareerPlaybookHandler().process(
      createJob({ ...baseJobData, action: 'GENERATE_FOLLOWUPS' })
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      completeness_score: 0.7,
      stop_recommendation: 'ask_more',
    });
    expect((result.data as { questions: Array<{ question_id: string }> }).questions).toHaveLength(
      2
    );
    for (const question of (result.data as { questions: Array<{ question_id: string }> })
      .questions) {
      expect(question.question_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
  });

  it('throws when graph generation returns errors so BullMQ marks the job failed', async () => {
    vi.mocked(createCareerPlaybookRuntime).mockReturnValue({
      renderPrompt: vi.fn(),
      invokeLLM: vi.fn(),
    });
    vi.mocked(getCareerPlaybookGraph).mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: ['specBuilder failed: invalid JSON'],
      }),
    } as never);

    await expect(
      new CareerPlaybookHandler().process(
        createJob({ ...baseJobData, action: 'GENERATE_PLAYBOOK' })
      )
    ).rejects.toThrow('Career Playbook generation failed: specBuilder failed: invalid JSON');
  });
});
