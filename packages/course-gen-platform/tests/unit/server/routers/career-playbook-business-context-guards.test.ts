import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  generateCareerPlaybookFollowups: vi.fn(),
  addJob: vi.fn(),
  removeTerminalJobById: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

vi.mock('@/stages/stage-career-playbook/nodes/followup-questions', () => ({
  generateCareerPlaybookFollowups: mocks.generateCareerPlaybookFollowups,
}));

vi.mock('@/orchestrator/queue', () => ({
  addJob: mocks.addJob,
  removeTerminalJobById: mocks.removeTerminalJobById,
  getQueue: vi.fn(() => ({ add: vi.fn(), on: vi.fn() })),
}));

vi.mock('@/stages/stage-career-playbook/nodes/department-classifier', () => ({
  resolveCareerPlaybookDepartmentOptions: vi.fn(),
}));

vi.mock('@/stages/stage-career-playbook/graph', () => ({
  getCareerPlaybookGraph: vi.fn(),
}));

vi.mock('@/services/career-playbook-pdf', () => ({
  renderCareerPlaybookPdf: vi.fn(),
}));

vi.mock('@/server/routers/career-playbook/course-bridge.service', () => ({
  createCourseFromPlaybook: vi.fn(),
}));

import { careerPlaybookRouter } from '@/server/routers/career-playbook';
import type { Context } from '@/server/trpc';

const playbookId = '33333333-3333-4333-8333-333333333333';
const authenticatedContext: Context = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'author@example.com',
    role: 'instructor',
    organizationId: '22222222-2222-4222-8222-222222222222',
  },
  req: new Request('http://localhost/trpc'),
};

const notStartedBusinessContext = {
  mode: 'universal',
  status: 'not_started',
  digest: null,
  source_ids: [],
};

function playbookRow(overrides: Record<string, unknown> = {}) {
  return {
    id: playbookId,
    user_id: authenticatedContext.user!.id,
    organization_id: authenticatedContext.user!.organizationId,
    status: 'awaiting_followups',
    language: 'en',
    slug: null,
    position_title: null,
    department: null,
    specialization: null,
    level: null,
    q_a_data: { fixed: [], followups: [], freeform: [] },
    role_profile_spec: null,
    generated_blocks: {},
    final_markdown: null,
    web_research: null,
    cost_breakdown: null,
    share_slug: null,
    is_public: false,
    created_at: '2026-05-14T00:00:00.000Z',
    updated_at: '2026-05-14T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

function createBuilder(singleResults: Array<{ data: unknown; error: unknown }> = []) {
  const builder = {
    update: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => {
      const result = singleResults.shift();
      return Promise.resolve(result ?? { data: null, error: new Error('No mocked result') });
    }),
  };

  return builder;
}

describe('Career Playbook business context backend guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addJob.mockResolvedValue({ id: 'career-playbook-job' });
    mocks.removeTerminalJobById.mockResolvedValue(false);
  });

  it('refuses follow-ups and generation before explicit business context completion', async () => {
    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const followupBuilder = createBuilder([
      {
        data: playbookRow({
          status: 'awaiting_followups',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
            business_context: notStartedBusinessContext,
          },
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(followupBuilder);

    await expect(
      caller.generation.requestFollowups({
        playbookId,
        fixedAnswers: {
          position: { question_key: 'position', value: 'Product Lead' },
        },
        followupAnswers: {},
        contentLanguage: 'en',
      })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Career Playbook is not accepting follow-up generation',
    });
    expect(mocks.generateCareerPlaybookFollowups).not.toHaveBeenCalled();
    expect(followupBuilder.update).not.toHaveBeenCalled();

    const generationBuilder = createBuilder([
      {
        data: playbookRow({
          status: 'ready_to_generate',
          q_a_data: {
            fixed: [
              { question_key: 'position', value: 'Sales Manager' },
              { question_key: 'department', value: 'sales' },
              { question_key: 'level', value: 'middle' },
              { question_key: 'reporting', value: 'Reports to CRO.' },
              { question_key: 'team_size', value: '201-1000' },
            ],
            followups: [],
            freeform: [],
            followup_questions: [],
            business_context: notStartedBusinessContext,
          },
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(generationBuilder);

    await expect(caller.generation.approveAndGenerate({ playbookId })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Career Playbook is not ready for generation',
    });
    expect(mocks.addJob).not.toHaveBeenCalled();
    expect(generationBuilder.update).not.toHaveBeenCalled();
  });

  it('allows follow-ups when pasted freeform notes are the only business context', async () => {
    const followupResponse = {
      questions: [
        {
          question_id: '55555555-5555-4555-8555-555555555555',
          question_text: 'Which customer segments matter most?',
          question_type: 'open',
          options: null,
          rationale: 'Freeform business context should be used for follow-up generation.',
        },
      ],
      completeness_score: 0.71,
      stop_recommendation: 'ask_more',
    };
    mocks.generateCareerPlaybookFollowups.mockResolvedValue({
      response: followupResponse,
      nodeCost: {
        node: 'followupGenerator',
        model: 'mock-model',
        input_tokens: 10,
        output_tokens: 10,
        cost_usd: 0,
      },
    });
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'awaiting_followups',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [
              {
                text: 'ICP: HR teams. Product: AI role guides. Constraint: no discounts above 10%.',
                submitted_at: '2026-06-07T10:00:00.000Z',
              },
            ],
            business_context: notStartedBusinessContext,
            followup_questions: [],
            followup_generation_count: 0,
          },
        }),
        error: null,
      },
      { data: playbookRow({ status: 'answering_followups' }), error: null },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.generation.requestFollowups({
      playbookId,
      fixedAnswers: {
        position: { question_key: 'position', value: 'Product Lead' },
      },
      followupAnswers: {},
      contentLanguage: 'en',
    });

    expect(mocks.generateCareerPlaybookFollowups).toHaveBeenCalledWith({
      playbookId,
      qaData: expect.objectContaining({
        fixed: [{ question_key: 'position', value: 'Product Lead' }],
        followups: [],
        freeform: [
          expect.objectContaining({
            text: expect.stringContaining('AI role guides'),
          }),
        ],
        business_context: expect.objectContaining({
          status: 'skipped',
          skip_reason: 'freeform_business_context',
        }),
      }),
      language: 'en',
      businessContextSourceExcerpts: '- none',
    });
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'answering_followups',
        q_a_data: expect.objectContaining({
          business_context: expect.objectContaining({
            status: 'skipped',
            skip_reason: 'freeform_business_context',
          }),
          completeness_score: 0.71,
          followup_questions: followupResponse.questions,
        }),
      })
    );
    expect(result).toEqual(followupResponse);
  });
});
