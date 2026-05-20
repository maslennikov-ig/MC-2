import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generateCareerPlaybookFollowups: vi.fn(),
  getCareerPlaybookGraph: vi.fn(),
  renderCareerPlaybookPdf: vi.fn(),
  addJob: vi.fn(),
  removeTerminalJobById: vi.fn(),
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

vi.mock('@/services/career-playbook-pdf', () => ({
  renderCareerPlaybookPdf: mocks.renderCareerPlaybookPdf,
}));

vi.mock('@/orchestrator/queue', () => ({
  addJob: mocks.addJob,
  removeTerminalJobById: mocks.removeTerminalJobById,
  getQueue: vi.fn(() => ({
    add: vi.fn(),
    on: vi.fn(),
  })),
}));

import { appRouter } from '@/server/app-router';
import { careerPlaybookRouter } from '@/server/routers/career-playbook';
import type { Context } from '@/server/trpc';
import { JobType } from '@megacampus/shared-types';

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

const otherUserContext: Context = {
  user: {
    id: '77777777-7777-4777-8777-777777777777',
    email: 'reader@example.com',
    role: 'student',
    organizationId: authenticatedContext.user!.organizationId,
  },
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
    delete: vi.fn(() => builder),
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

describe('careerPlaybookRouter transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is wired into the app router under careerPlaybook', () => {
    expect(appRouter._def.procedures['careerPlaybook.exportPdf']).toBeDefined();
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
    mocks.addJob.mockResolvedValue({ id: 'career-playbook-job-1' });
    mocks.removeTerminalJobById.mockResolvedValue(false);
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

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.generation.approveAndGenerate({ playbookId });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'generating',
      })
    );
    expect(mocks.removeTerminalJobById).toHaveBeenCalledWith(`career-playbook:${playbookId}`);
    expect(mocks.addJob).toHaveBeenCalledWith(
      JobType.CAREER_PLAYBOOK,
      expect.not.objectContaining({
        courseId: expect.any(String),
      }),
      expect.objectContaining({
        jobId: `career-playbook:${playbookId}`,
      })
    );
    expect(mocks.addJob).toHaveBeenCalledWith(
      JobType.CAREER_PLAYBOOK,
      expect.objectContaining({
        jobType: JobType.CAREER_PLAYBOOK,
        operation: 'GENERATE_PLAYBOOK',
        playbookId,
        userId: authenticatedContext.user!.id,
        organizationId: authenticatedContext.user!.organizationId,
        language: 'en',
        locale: 'en',
        qaData: {
          fixed: [{ question_key: 'position', value: 'Product Lead' }],
          followups: [],
          freeform: [],
        },
        createdAt: expect.any(String),
      }),
      expect.any(Object)
    );
    expect(result).toMatchObject({
      playbookId,
      status: 'generating',
      phase: 'completion',
    });
  });

  it('removes a stale terminal generation job before retrying a failed playbook', async () => {
    mocks.addJob.mockResolvedValue({ id: 'career-playbook-job-2' });
    mocks.removeTerminalJobById.mockResolvedValue(true);
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'failed',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
            generation_error: 'Previous worker failure',
          },
        }),
        error: null,
      },
      { data: playbookRow({ status: 'generating' }), error: null },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    await expect(caller.generation.approveAndGenerate({ playbookId })).resolves.toMatchObject({
      playbookId,
      status: 'generating',
    });

    expect(mocks.removeTerminalJobById).toHaveBeenCalledWith(`career-playbook:${playbookId}`);
    expect(mocks.addJob).toHaveBeenCalledTimes(1);
  });

  it('marks the playbook failed when queue enqueue fails after generation status update', async () => {
    mocks.addJob.mockRejectedValue(new Error('Redis unavailable'));
    mocks.removeTerminalJobById.mockResolvedValue(false);
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
      { data: playbookRow({ status: 'failed' }), error: null },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(caller.generation.approveAndGenerate({ playbookId })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to enqueue Career Playbook generation',
    });
    expect(builder.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: 'generating' })
    );
    expect(builder.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'failed',
        q_a_data: expect.objectContaining({
          generation_error: 'Redis unavailable',
        }),
      })
    );
  });

  it('reports when enqueue compensation cannot mark the playbook failed', async () => {
    mocks.addJob.mockRejectedValue(new Error('Redis unavailable'));
    mocks.removeTerminalJobById.mockResolvedValue(false);
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
      { data: null, error: new Error('permission denied') },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(caller.generation.approveAndGenerate({ playbookId })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to enqueue Career Playbook generation and mark playbook failed',
    });
    expect(builder.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'failed',
        q_a_data: expect.objectContaining({
          generation_error: 'Redis unavailable',
        }),
      })
    );
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

  it('does not enqueue another generation job when already generating', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'generating',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
          },
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.generation.approveAndGenerate({ playbookId });

    expect(result).toMatchObject({
      playbookId,
      status: 'generating',
      phase: 'completion',
    });
    expect(mocks.addJob).not.toHaveBeenCalled();
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('returns generation status from the persisted playbook row', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'completed',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
            generation_error: 'Stale worker error',
          },
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
    expect(result.error).toBeUndefined();
  });

  it('refuses answer edits while generation is active', async () => {
    const builder = createBuilder([{ data: playbookRow({ status: 'generating' }), error: null }]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(
      caller.session.submitAnswer({
        playbookId,
        phase: 'fixed',
        answer: {
          question_key: 'position',
          value: 'Edited during generation',
        },
      })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Career Playbook generation is already in progress',
    });
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('refuses generation status for same-organization playbooks owned by another user', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          user_id: authenticatedContext.user!.id,
          organization_id: authenticatedContext.user!.organizationId,
          status: 'completed',
          final_markdown: '# Product Lead',
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(otherUserContext);

    await expect(caller.generation.getStatus({ playbookId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Career Playbook access denied',
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

  it('lists only owned playbooks in the personal library', async () => {
    const ownPlaybook = playbookRow({
      id: '33333333-3333-4333-8333-333333333334',
      position_title: 'Own role',
      created_at: '2026-05-14T03:00:00.000Z',
    });
    const sameOrgPlaybook = playbookRow({
      id: '33333333-3333-4333-8333-333333333335',
      user_id: '77777777-7777-4777-8777-777777777777',
      position_title: 'Same-org role',
      created_at: '2026-05-14T02:00:00.000Z',
    });
    const foreignPlaybook = playbookRow({
      id: '33333333-3333-4333-8333-333333333336',
      user_id: '88888888-8888-4888-8888-888888888888',
      organization_id: '99999999-9999-4999-8999-999999999999',
      position_title: 'Hidden role',
      created_at: '2026-05-14T01:00:00.000Z',
    });
    const builder = createListBuilder([ownPlaybook, sameOrgPlaybook, foreignPlaybook]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.library.list({ limit: 20 });

    expect(mocks.from).toHaveBeenCalledWith('career_playbooks');
    expect(builder.eq).toHaveBeenCalledWith('user_id', authenticatedContext.user!.id);
    expect(result.items).toHaveLength(1);
    expect(result.items.map(item => item.id)).toEqual([ownPlaybook.id]);
    expect(result.items.every(item => item.id !== sameOrgPlaybook.id)).toBe(true);
    expect(result.items.every(item => item.id !== foreignPlaybook.id)).toBe(true);
  });

  it('returns a readable playbook by id from the library router', async () => {
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
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.library.get({ playbookId });

    expect(result).toMatchObject({
      id: playbookId,
      status: 'completed',
      finalMarkdown: '# Product Lead',
      isPublic: false,
    });
  });

  it('refuses same-organization playbooks in the personal library get endpoint', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          user_id: '77777777-7777-4777-8777-777777777777',
          organization_id: authenticatedContext.user!.organizationId,
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(caller.library.get({ playbookId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Career Playbook access denied',
    });
  });

  it('deletes an owned playbook through the library router', async () => {
    const builder = createBuilder([
      { data: playbookRow(), error: null },
      { data: playbookRow(), error: null },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.library.delete({ playbookId });

    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith('id', playbookId);
    expect(builder.eq).toHaveBeenCalledWith('user_id', authenticatedContext.user!.id);
    expect(result).toEqual({ deleted: true, playbookId });
  });

  it('refuses to publish incomplete or empty playbooks', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'generating',
          final_markdown: null,
          share_slug: null,
          is_public: false,
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(caller.share.shareToggle({ playbookId, isPublic: true })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Career Playbook must be completed before sharing',
    });
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('enables public sharing with an unguessable generated share slug', async () => {
    const predictableSlug = 'cp-33333333333343338333333333333333';
    const builder = createBuilder([
      {
        data: playbookRow({
          share_slug: null,
          is_public: false,
          status: 'completed',
          final_markdown: '# Sales Manager',
        }),
        error: null,
      },
      {
        data: playbookRow({
          share_slug: 'cp-1234567890abcdef12345678',
          is_public: true,
          status: 'completed',
          final_markdown: '# Sales Manager',
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.share.shareToggle({ playbookId, isPublic: true });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_public: true,
        share_slug: expect.stringMatching(/^cp-[a-f0-9]{24}$/),
      })
    );
    expect(builder.update.mock.calls[0][0].share_slug).not.toBe(predictableSlug);
    expect(builder.eq).toHaveBeenCalledWith('id', playbookId);
    expect(builder.eq).toHaveBeenCalledWith('user_id', authenticatedContext.user!.id);
    expect(result).toEqual({
      playbookId,
      isPublic: true,
      shareSlug: 'cp-1234567890abcdef12345678',
    });
  });

  it('disables public sharing without returning an active share link', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          share_slug: 'existing-share-slug',
          is_public: true,
        }),
        error: null,
      },
      {
        data: playbookRow({
          share_slug: 'existing-share-slug',
          is_public: false,
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.share.shareToggle({ playbookId, isPublic: false });

    expect(builder.update).toHaveBeenCalledWith({
      is_public: false,
      share_slug: 'existing-share-slug',
    });
    expect(result).toEqual({
      playbookId,
      isPublic: false,
      shareSlug: null,
    });
  });

  it('uses existing share slug when re-enabling public sharing', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          share_slug: 'existing-share-slug',
          is_public: false,
          status: 'completed',
          final_markdown: '# Sales Manager',
        }),
        error: null,
      },
      {
        data: playbookRow({
          share_slug: 'existing-share-slug',
          is_public: true,
          status: 'completed',
          final_markdown: '# Sales Manager',
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.share.shareToggle({ playbookId, isPublic: true });

    expect(builder.update).toHaveBeenCalledWith({
      is_public: true,
      share_slug: 'existing-share-slug',
    });
    expect(result.shareSlug).toBe('existing-share-slug');
  });

  it('returns a public playbook by share slug without authentication', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          id: '66666666-6666-4666-8666-666666666666',
          share_slug: 'sales-guide',
          is_public: true,
          status: 'completed',
          final_markdown: '# Sales Manager',
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(unauthenticatedContext);
    const result = await caller.share.getPublicBySlug({ shareSlug: 'sales-guide' });

    expect(builder.select).toHaveBeenCalledWith(expect.not.stringContaining('q_a_data'));
    expect(builder.select).toHaveBeenCalledWith(expect.not.stringContaining('role_profile_spec'));
    expect(builder.select).toHaveBeenCalledWith(expect.not.stringContaining('web_research'));
    expect(builder.select).toHaveBeenCalledWith(expect.not.stringContaining('cost_breakdown'));
    expect(builder.eq).toHaveBeenCalledWith('status', 'completed');
    expect(result).toMatchObject({
      id: '66666666-6666-4666-8666-666666666666',
      shareSlug: 'sales-guide',
      isPublic: true,
      finalMarkdown: '# Sales Manager',
    });
    expect(result).not.toHaveProperty('generatedBlocks');
  });

  it('hides public slugs until the playbook is completed with markdown', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          share_slug: 'draft-guide',
          is_public: true,
          status: 'generating',
          final_markdown: '',
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(unauthenticatedContext);

    await expect(caller.share.getPublicBySlug({ shareSlug: 'draft-guide' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(builder.eq).toHaveBeenCalledWith('status', 'completed');
  });

  it('hides private playbooks on public share lookup', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          share_slug: 'private-guide',
          is_public: false,
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(unauthenticatedContext);
    await expect(
      caller.share.getPublicBySlug({ shareSlug: 'private-guide' })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('hides another user playbook from library while allowing the public share link', async () => {
    const publicPlaybook = playbookRow({
      id: '66666666-6666-4666-8666-666666666666',
      share_slug: 'public-sales-guide',
      is_public: true,
      status: 'completed',
      final_markdown: '# Sales Manager',
    });
    const listBuilder = createListBuilder([publicPlaybook]);
    const publicShareBuilder = createBuilder([{ data: publicPlaybook, error: null }]);
    mocks.from.mockReturnValueOnce(listBuilder).mockReturnValueOnce(publicShareBuilder);

    const otherUserCaller = careerPlaybookRouter.createCaller(otherUserContext);
    const publicCaller = careerPlaybookRouter.createCaller(unauthenticatedContext);

    const otherUserLibrary = await otherUserCaller.library.list({ limit: 20 });
    expect(listBuilder.eq).toHaveBeenCalledWith('user_id', otherUserContext.user!.id);
    expect(otherUserLibrary.items).toEqual([]);

    const sharedPlaybook = await publicCaller.share.getPublicBySlug({
      shareSlug: 'public-sales-guide',
    });
    expect(sharedPlaybook).toMatchObject({
      id: publicPlaybook.id,
      shareSlug: 'public-sales-guide',
      isPublic: true,
      finalMarkdown: '# Sales Manager',
    });
  });

  it('keeps course bridge procedures as skeletons for later tasks', async () => {
    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(
      caller.courseBridge.createCourseFromPlaybook({ playbookId })
    ).rejects.toMatchObject({
      code: 'METHOD_NOT_SUPPORTED',
    });
  });

  it('exports a completed owned playbook as a base64 PDF payload', async () => {
    const pdfBuffer = Buffer.from('%PDF mocked career playbook');
    mocks.renderCareerPlaybookPdf.mockResolvedValue({
      buffer: pdfBuffer,
      fileName: 'career-playbook-product-lead.pdf',
      contentType: 'application/pdf',
    });
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'completed',
          position_title: 'Product Lead',
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
    const result = await caller.exportPdf({ playbookId });

    expect(mocks.renderCareerPlaybookPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        playbookId,
        positionTitle: 'Product Lead',
        finalMarkdown: '# Product Lead',
      })
    );
    expect(result).toEqual({
      pdfBase64: pdfBuffer.toString('base64'),
      fileName: 'career-playbook-product-lead.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdfBuffer.byteLength,
    });
  });

  it('requires authentication for PDF export', async () => {
    const caller = careerPlaybookRouter.createCaller(unauthenticatedContext);

    await expect(caller.exportPdf({ playbookId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(mocks.renderCareerPlaybookPdf).not.toHaveBeenCalled();
  });

  it('refuses PDF export for same-organization playbooks owned by another user', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          user_id: authenticatedContext.user!.id,
          organization_id: authenticatedContext.user!.organizationId,
          status: 'completed',
          final_markdown: '# Product Lead',
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(otherUserContext);

    await expect(caller.exportPdf({ playbookId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Career Playbook access denied',
    });
    expect(mocks.renderCareerPlaybookPdf).not.toHaveBeenCalled();
  });

  it('refuses PDF export before the playbook is completed', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'generating',
          final_markdown: '# Product Lead',
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(caller.exportPdf({ playbookId })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Career Playbook must be completed before PDF export',
    });
    expect(mocks.renderCareerPlaybookPdf).not.toHaveBeenCalled();
  });

  it('returns a bad request when PDF export content exceeds renderer limits', async () => {
    mocks.renderCareerPlaybookPdf.mockRejectedValue(
      new Error('Career Playbook PDF source is too large')
    );
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
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(caller.exportPdf({ playbookId })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Career Playbook PDF source is too large',
    });
  });
});
