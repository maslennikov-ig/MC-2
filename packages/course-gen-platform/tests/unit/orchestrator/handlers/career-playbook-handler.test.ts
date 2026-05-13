import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CareerPlaybookBlockState,
  CareerPlaybookRoleProfileSpec,
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
import {
  CareerPlaybookHandler,
  type CareerPlaybookJobData,
} from '@/orchestrator/handlers/career-playbook-handler';

const getCareerPlaybookGraphMock = vi.mocked(getCareerPlaybookGraph);

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

function job(data: CareerPlaybookJobData): Job<CareerPlaybookJobData> {
  return { data } as Job<CareerPlaybookJobData>;
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
      job({
        jobType: 'GENERATE_FOLLOWUPS',
        playbookId: '00000000-0000-4000-8000-000000000001',
        userId: '00000000-0000-4000-8000-000000000002',
        organizationId: '00000000-0000-4000-8000-000000000003',
        language: 'ru',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      questions: [],
      completeness_score: 1,
      stop_recommendation: 'ready_to_generate',
    });
    expect(mocks.generateCareerPlaybookFollowups).toHaveBeenCalledWith({
      qaData: { fixed: [], followups: [], freeform: [] },
      language: 'ru',
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
      job({
        jobType: 'REGENERATE_BLOCK',
        playbookId: '00000000-0000-4000-8000-000000000001',
        userId: '00000000-0000-4000-8000-000000000002',
        organizationId: '00000000-0000-4000-8000-000000000003',
        language: 'ru',
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
      job({
        jobType: 'GENERATE_PLAYBOOK',
        playbookId: '00000000-0000-4000-8000-000000000001',
        userId: '00000000-0000-4000-8000-000000000002',
        organizationId: '00000000-0000-4000-8000-000000000003',
        language: 'ru',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Career Playbook generated');
    expect(result.error).toBeUndefined();
  });
});
