import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JobType,
  type CareerPlaybookBlockState,
  type CareerPlaybookJobData,
  type CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';

const mocks = vi.hoisted(() => ({
  generateCareerPlaybookFollowups: vi.fn(),
  regenerateCareerPlaybookBlock: vi.fn(),
}));

vi.mock('@/stages/stage-career-playbook/nodes/followup-questions', () => ({
  generateCareerPlaybookFollowups: mocks.generateCareerPlaybookFollowups,
}));

vi.mock('@/stages/stage-career-playbook/nodes/block-regenerator', () => ({
  regenerateCareerPlaybookBlock: mocks.regenerateCareerPlaybookBlock,
}));

vi.mock('@/stages/stage-career-playbook/graph', () => ({
  getCareerPlaybookGraph: vi.fn(),
}));

import { getCareerPlaybookGraph } from '@/stages/stage-career-playbook/graph';
import { CareerPlaybookHandler } from '@/orchestrator/handlers/career-playbook-handler';

const getCareerPlaybookGraphMock = vi.mocked(getCareerPlaybookGraph);

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
} satisfies Omit<CareerPlaybookJobData, 'action'>;

const roleProfileSpec: CareerPlaybookRoleProfileSpec = {
  position: {
    title: 'B2B Sales Manager',
    slug: 'b2b-sales-manager',
    department: 'sales',
    level: 'senior',
  },
  context: {
    company_stage: 'growth',
    team_size: '51-200',
    reports_to: 'CRO',
    has_subordinates: true,
  },
  focus_areas: {
    primary_kpis: ['Qualified pipeline'],
    key_tools: ['CRM'],
    critical_competencies: ['Discovery'],
    anti_goals: ['Own product roadmap'],
    failure_patterns: ['Poor CRM hygiene'],
  },
  research: null,
  block_boundaries: {},
  content_language: 'ru',
};

const originalBlock: CareerPlaybookBlockState = {
  content: '## 6. KPI\n\nOld content',
  status: 'generated',
  judge_verdict: null,
  generated_at: '2026-05-13T00:00:00.000Z',
  llm_model: 'mock-model',
  attempt: 1,
};

function createJob(data: CareerPlaybookJobData): Job<CareerPlaybookJobData> {
  return {
    id: 'job-1',
    name: JobType.CAREER_PLAYBOOK,
    data,
    attemptsMade: 0,
    opts: {},
    updateProgress: vi.fn(),
    log: vi.fn(),
  } as unknown as Job<CareerPlaybookJobData>;
}

describe('CareerPlaybookHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes GENERATE_FOLLOWUPS through the follow-up helper', async () => {
    mocks.generateCareerPlaybookFollowups.mockResolvedValue({
      response: { questions: [], completeness_score: 1, stop_recommendation: 'ready_to_generate' },
      nodeCost: {
        node: 'followupGenerator',
        model: 'mock-model',
        input_tokens: 1,
        output_tokens: 1,
        cost_usd: 0,
      },
    });

    const result = await new CareerPlaybookHandler().process(
      createJob({ ...baseJobData, action: 'GENERATE_FOLLOWUPS' })
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      questions: [],
      completeness_score: 1,
      stop_recommendation: 'ready_to_generate',
    });
    expect(mocks.generateCareerPlaybookFollowups).toHaveBeenCalledWith({
      qaData: baseJobData.qaData,
      language: 'en',
    });
  });

  it('routes REGENERATE_BLOCK through the block regenerator helper', async () => {
    mocks.regenerateCareerPlaybookBlock.mockResolvedValue({
      blockId: 'block_6',
      block: { ...originalBlock, content: '## 6. KPI\n\nNew content', attempt: 2 },
      nodeCost: {
        node: 'blockRegenerator',
        model: 'mock-model',
        input_tokens: 1,
        output_tokens: 1,
        cost_usd: 0,
      },
    });

    const result = await new CareerPlaybookHandler().process(
      createJob({
        ...baseJobData,
        action: 'REGENERATE_BLOCK',
        blockId: 'block_6',
        instruction: 'Make metrics concrete',
        roleProfileSpec,
        originalBlock,
        generatedBlocks: { block_6: originalBlock },
      })
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Regenerated Career Playbook block block_6');
    expect(mocks.regenerateCareerPlaybookBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: 'block_6',
        roleProfileSpec,
        originalBlock,
        userInstruction: 'Make metrics concrete',
        otherBlocks: { block_6: originalBlock },
      })
    );
  });

  it('does not fail playbook generation only because retained judge verdicts contain warnings', async () => {
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: [],
        judgeVerdicts: [
          {
            pass: false,
            score: 80,
            issues: [
              {
                block_id: 'block_2',
                severity: 'warning',
                description: 'Regeneration budget exhausted; leave as warning.',
              },
            ],
            needs_regeneration: ['block_2'],
          },
        ],
        finalMarkdown: '## Header\n\n# B2B Sales Manager',
      }),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    const result = await new CareerPlaybookHandler().process(
      createJob({ ...baseJobData, action: 'GENERATE_PLAYBOOK' })
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Career Playbook generated');
    expect(result.error).toBeUndefined();
  });

  it('throws when graph generation returns errors so BullMQ marks the job failed', async () => {
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: ['specBuilder failed: invalid JSON'],
      }),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    await expect(
      new CareerPlaybookHandler().process(
        createJob({ ...baseJobData, action: 'GENERATE_PLAYBOOK' })
      )
    ).rejects.toThrow('Career Playbook generation failed: specBuilder failed: invalid JSON');
  });
});
