import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generateCareerPlaybookFollowups: vi.fn(),
  getCareerPlaybookGraph: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mocks.from,
  })),
}));

vi.mock('@/stages/stage-career-playbook/nodes/followup-questions', () => ({
  generateCareerPlaybookFollowups: mocks.generateCareerPlaybookFollowups,
}));

vi.mock('@/stages/stage-career-playbook/graph', () => ({
  getCareerPlaybookGraph: mocks.getCareerPlaybookGraph,
}));

import { appRouter } from '@/server/app-router';
import { careerPlaybookRouter } from '@/server/routers/career-playbook';
import type { Context } from '@/server/trpc';

const authenticatedContext: Context = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'author@example.com',
    role: 'instructor',
    organizationId: '22222222-2222-4222-8222-222222222222',
  },
  req: new Request('http://localhost/trpc'),
};

const unauthenticatedContext: Context = {
  user: null,
  req: new Request('http://localhost/trpc'),
};

const playbookId = '33333333-3333-4333-8333-333333333333';

function playbookRow(overrides: Record<string, unknown> = {}) {
  return {
    id: playbookId,
    user_id: authenticatedContext.user!.id,
    organization_id: authenticatedContext.user!.organizationId,
    status: 'answering_fixed',
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
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => {
      const result = singleResults.shift();
      return Promise.resolve(result ?? { data: null, error: new Error('No mocked single result') });
    }),
  };

  return builder;
}

function createListBuilder(data: unknown[], error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data, error })),
  };

  return builder;
}

function expectNotImplemented(call: Promise<unknown>) {
  return expect(call).rejects.toMatchObject({
    code: 'METHOD_NOT_SUPPORTED',
  });
}

describe('careerPlaybookRouter transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is wired into the app router under careerPlaybook', () => {
    expect(appRouter._def.procedures['careerPlaybook.session.start']).toBeDefined();
    expect(appRouter._def.procedures['careerPlaybook.generation.requestFollowups']).toBeDefined();
    expect(appRouter._def.procedures['careerPlaybook.generation.approveAndGenerate']).toBeDefined();
    expect(
      appRouter._def.procedures['careerPlaybook.courseBridge.createCourseFromPlaybook']
    ).toBeDefined();
  });

  it('requires authentication for session procedures', async () => {
    const caller = careerPlaybookRouter.createCaller(unauthenticatedContext);

    await expect(caller.session.start({ language: 'ru' })).rejects.toBeInstanceOf(TRPCError);
  });

  it('starts a persisted playbook session and returns a frontend draft', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'answering_fixed',
          language: 'en',
          q_a_data: { fixed: [], followups: [], freeform: [] },
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.session.start({ language: 'en' });

    expect(mocks.from).toHaveBeenCalledWith('career_playbooks');
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: authenticatedContext.user!.id,
        organization_id: authenticatedContext.user!.organizationId,
        status: 'answering_fixed',
        language: 'en',
      })
    );
    expect(result).toMatchObject({
      playbookId,
      contentLanguage: 'en',
      status: 'answering_fixed',
      phase: 'fixed',
      fixedAnswers: [],
    });
  });

  it('submits fixed answers into the persisted QA data and denormalized role fields', async () => {
    const updatedRow = playbookRow({
      position_title: 'Product Lead',
      q_a_data: {
        fixed: [{ question_key: 'position', value: 'Product Lead' }],
        followups: [],
        freeform: [],
      },
    });
    const builder = createBuilder([
      { data: playbookRow(), error: null },
      { data: updatedRow, error: null },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.session.submitAnswer({
      playbookId,
      phase: 'fixed',
      answer: {
        question_key: 'position',
        value: 'Product Lead',
      },
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        position_title: 'Product Lead',
        q_a_data: expect.objectContaining({
          fixed: [expect.objectContaining({ question_key: 'position', value: 'Product Lead' })],
        }),
      })
    );
    expect(result).toMatchObject({
      playbookId,
      status: 'answering_fixed',
    });
  });

  it('returns seeded fixed questions from the database', async () => {
    const questions = [
      {
        id: '44444444-4444-4444-8444-444444444444',
        language: 'en',
        position: 1,
        question_key: 'position',
        question_type: 'open',
        question_text: 'Which role do you want to document?',
        helper_text: null,
        options: null,
        branching_rules: null,
        is_required: true,
      },
    ];
    const builder = createListBuilder(questions);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.session.getFixedQuestions({ uiLanguage: 'en' });

    expect(mocks.from).toHaveBeenCalledWith('career_playbook_fixed_questions');
    expect(builder.eq).toHaveBeenCalledWith('language', 'en');
    expect(result).toEqual(questions);
  });

  it('requests follow-up questions through the backend generator and persists them', async () => {
    const followupResponse = {
      questions: [
        {
          question_id: '55555555-5555-4555-8555-555555555555',
          question_text: 'Which KPIs define success?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the guide.',
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
      { data: playbookRow({ status: 'awaiting_followups' }), error: null },
      {
        data: playbookRow({
          status: 'answering_followups',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
            completeness_score: 0.71,
            followup_questions: followupResponse.questions,
          },
        }),
        error: null,
      },
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
      qaData: {
        fixed: [{ question_key: 'position', value: 'Product Lead' }],
        followups: [],
        freeform: [],
      },
      language: 'en',
    });
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'answering_followups',
        q_a_data: expect.objectContaining({
          completeness_score: 0.71,
          followup_questions: followupResponse.questions,
        }),
      })
    );
    expect(result).toEqual(followupResponse);
  });

  it('keeps persisted follow-up round count and caps stored follow-up questions', async () => {
    const existingQuestions = Array.from({ length: 6 }, (_, index) => ({
      question_id: `55555555-5555-4555-8555-55555555556${index}`,
      question_text: `Existing question ${index + 1}`,
      question_type: 'open' as const,
      options: null,
      rationale: 'Existing context.',
    }));
    const generatedQuestions = [
      {
        question_id: '55555555-5555-4555-8555-555555555571',
        question_text: 'New follow-up 1',
        question_type: 'open' as const,
        options: null,
        rationale: 'New context.',
      },
      {
        question_id: '55555555-5555-4555-8555-555555555572',
        question_text: 'New follow-up 2',
        question_type: 'open' as const,
        options: null,
        rationale: 'Extra context beyond the cap.',
      },
    ];
    const followupResponse = {
      questions: generatedQuestions,
      completeness_score: 0.68,
      stop_recommendation: 'ask_more' as const,
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
          status: 'answering_followups',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
            completeness_score: 0.5,
            followup_questions: existingQuestions,
            followup_generation_count: 1,
          },
        }),
        error: null,
      },
      { data: playbookRow({ status: 'answering_followups' }), error: null },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    await caller.generation.requestFollowups({
      playbookId,
      fixedAnswers: {
        position: { question_key: 'position', value: 'Product Lead' },
      },
      followupAnswers: {},
      contentLanguage: 'en',
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        q_a_data: expect.objectContaining({
          followup_generation_count: 2,
          followup_questions: [...existingQuestions, generatedQuestions[0]],
        }),
      })
    );
  });

  it('refuses follow-up generation after the playbook leaves the follow-up phase', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'generating',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
            followup_questions: [],
            followup_generation_count: 1,
          },
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

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
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('starts backend generation handoff and returns generating status', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'ready_to_generate',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
          },
        }),
        error: null,
      },
      { data: playbookRow({ status: 'generating' }), error: null },
    ]);
    mocks.from.mockReturnValue(builder);
    mocks.getCareerPlaybookGraph.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: [],
        generatedBlocks: {},
        finalMarkdown: '# Product Lead',
      }),
    });

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.generation.approveAndGenerate({ playbookId });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'generating',
      })
    );
    expect(result).toMatchObject({
      playbookId,
      status: 'generating',
      phase: 'completion',
    });
  });

  it('refuses backend generation handoff before the playbook is ready', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'answering_fixed',
          q_a_data: { fixed: [], followups: [], freeform: [] },
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(caller.generation.approveAndGenerate({ playbookId })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Career Playbook is not ready for generation',
    });
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('returns generation status from the persisted playbook row', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'completed',
          final_markdown: '# Product Lead',
          generated_blocks: {
            header: {
              content: '# Product Lead',
              status: 'generated',
              attempt: 1,
            },
          },
          completed_at: '2026-05-14T01:00:00.000Z',
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.generation.getStatus({ playbookId });

    expect(result).toMatchObject({
      playbookId,
      status: 'completed',
      phase: 'completion',
      finalMarkdown: '# Product Lead',
      completedAt: '2026-05-14T01:00:00.000Z',
    });
  });

  it('returns persisted follow-up generation count from a resumed draft', async () => {
    const followupQuestion = {
      question_id: '55555555-5555-4555-8555-555555555581',
      question_text: 'Which KPIs define success?',
      question_type: 'open' as const,
      options: null,
      rationale: 'KPI specificity improves the guide.',
    };
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'answering_followups',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
            completeness_score: 0.71,
            followup_questions: [followupQuestion],
            followup_generation_count: 2,
          },
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.session.getDraft({ playbookId });

    expect(result).toMatchObject({
      playbookId,
      status: 'answering_followups',
      followupGenerationCount: 2,
    });
  });

  it('keeps library, share, and course bridge procedures as skeletons for later tasks', async () => {
    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const publicCaller = careerPlaybookRouter.createCaller(unauthenticatedContext);

    await expectNotImplemented(caller.library.list({ limit: 20 }));
    await expectNotImplemented(caller.share.shareToggle({ playbookId, isPublic: true }));
    await expectNotImplemented(publicCaller.share.getPublicBySlug({ shareSlug: 'sales-guide' }));
    await expectNotImplemented(caller.courseBridge.createCourseFromPlaybook({ playbookId }));
  });
});
