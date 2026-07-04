import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  resolveCareerPlaybookDepartmentOptions: vi.fn(),
  generateCareerPlaybookFollowups: vi.fn(),
  getCareerPlaybookGraph: vi.fn(),
  renderCareerPlaybookPdf: vi.fn(),
  previewCourseFromPlaybook: vi.fn(),
  createCourseFromPlaybook: vi.fn(),
  validateFile: vi.fn(),
  runPhase2Storage: vi.fn(),
  isStorageError: vi.fn(),
  decrementQuota: vi.fn(),
  unlink: vi.fn(),
  addJob: vi.fn(),
  removeTerminalJobById: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  unlink: mocks.unlink,
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

vi.mock('@/shared/validation/file-validator', () => ({
  validateFile: mocks.validateFile,
}));

vi.mock('@/shared/validation/quota-enforcer', () => ({
  decrementQuota: mocks.decrementQuota,
}));

vi.mock('@/stages/stage1-document-upload/phases', () => ({
  runPhase2Storage: mocks.runPhase2Storage,
  isStorageError: mocks.isStorageError,
}));

vi.mock('@/stages/stage-career-playbook/nodes/followup-questions', () => ({
  generateCareerPlaybookFollowups: mocks.generateCareerPlaybookFollowups,
}));

vi.mock('@/stages/stage-career-playbook/nodes/department-classifier', () => ({
  resolveCareerPlaybookDepartmentOptions: mocks.resolveCareerPlaybookDepartmentOptions,
}));

vi.mock('@/stages/stage-career-playbook/graph', () => ({
  getCareerPlaybookGraph: mocks.getCareerPlaybookGraph,
}));

vi.mock('@/services/career-playbook-pdf', () => ({
  renderCareerPlaybookPdf: mocks.renderCareerPlaybookPdf,
}));

vi.mock('@/server/routers/career-playbook/course-bridge.service', () => ({
  previewCourseFromPlaybook: mocks.previewCourseFromPlaybook,
  createCourseFromPlaybook: mocks.createCourseFromPlaybook,
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
  const isPublic = typeof overrides.is_public === 'boolean' ? overrides.is_public : false;
  const visibility = overrides.visibility ?? (isPublic ? 'public' : 'private');

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
    is_public: isPublic,
    visibility,
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
    neq: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => {
      const result = singleResults.shift();
      return Promise.resolve(result ?? { data: null, error: null });
    }),
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
    neq: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data, error })),
  };

  return builder;
}

type SupabaseMockBuilder = ReturnType<typeof createBuilder> | ReturnType<typeof createListBuilder>;

function createOrganizationBuilder(slug = 'mega-campus') {
  return createBuilder([{ data: { slug }, error: null }]);
}

function mockCareerPlaybookTable(builder: SupabaseMockBuilder, organizationSlug = 'mega-campus') {
  mocks.from.mockImplementation((table: string) => {
    if (table === 'organizations') return createOrganizationBuilder(organizationSlug);
    return builder;
  });
}

function mockCareerPlaybookTablesInOrder(
  builders: SupabaseMockBuilder[],
  organizationSlug = 'mega-campus'
) {
  let careerPlaybookCallIndex = 0;
  mocks.from.mockImplementation((table: string) => {
    if (table === 'organizations') return createOrganizationBuilder(organizationSlug);
    return builders[Math.min(careerPlaybookCallIndex++, builders.length - 1)];
  });
}

describe('careerPlaybookRouter transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReset();
    mocks.validateFile.mockReturnValue({ valid: true });
    mocks.runPhase2Storage.mockResolvedValue({
      fileId: '55555555-5555-4555-8555-555555555555',
      storagePath:
        'uploads/22222222-2222-4222-8222-222222222222/career-playbooks/33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.pdf',
      fileHash: 'hash',
      actualSize: 12,
      durationMs: 10,
      deduplicated: false,
    });
    mocks.isStorageError.mockReturnValue(false);
    mocks.decrementQuota.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('is wired into the app router under careerPlaybook', () => {
    expect(appRouter._def.procedures['careerPlaybook.exportPdf']).toBeDefined();
    expect(appRouter._def.procedures['careerPlaybook.session.start']).toBeDefined();
    expect(appRouter._def.procedures['careerPlaybook.session.saveProgress']).toBeDefined();
    expect(
      appRouter._def.procedures['careerPlaybook.session.resolveDepartmentOptions']
    ).toBeDefined();
    expect(appRouter._def.procedures['careerPlaybook.generation.requestFollowups']).toBeDefined();
    expect(appRouter._def.procedures['careerPlaybook.sources.uploadFile']).toBeDefined();
    expect(appRouter._def.procedures['careerPlaybook.sources.listSources']).toBeDefined();
    expect(appRouter._def.procedures['careerPlaybook.sources.removeSource']).toBeDefined();
    expect(appRouter._def.procedures['careerPlaybook.generation.approveAndGenerate']).toBeDefined();
    expect(
      appRouter._def.procedures['careerPlaybook.courseBridge.createCourseFromPlaybook']
    ).toBeDefined();
  });

  it('requires authentication for session procedures', async () => {
    const caller = careerPlaybookRouter.createCaller(unauthenticatedContext);

    await expect(caller.session.start({ language: 'ru' })).rejects.toBeInstanceOf(TRPCError);
  });

  it('resolves narrow department options through the Career Playbook classifier', async () => {
    mocks.resolveCareerPlaybookDepartmentOptions.mockResolvedValue({
      status: 'needs_user_choice',
      source: 'llm',
      confidence: 0.74,
      candidates: [{ value: 'operations', label: 'Operations', confidence: 0.74 }],
    });

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.session.resolveDepartmentOptions({
      title: 'Unusual company role',
      language: 'en',
    });

    expect(mocks.resolveCareerPlaybookDepartmentOptions).toHaveBeenCalledWith({
      title: 'Unusual company role',
      language: 'en',
    });
    expect(result).toEqual({
      status: 'needs_user_choice',
      source: 'llm',
      confidence: 0.74,
      candidates: [{ value: 'operations', label: 'Operations', confidence: 0.74 }],
    });
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
      businessContextSources: [],
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

  it('does not persist ready-to-generate when follow-up completeness is below threshold', async () => {
    const followupResponse = {
      questions: [],
      completeness_score: 0.55,
      stop_recommendation: 'ready_to_generate' as const,
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
      { data: playbookRow({ status: 'answering_followups' }), error: null },
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

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'answering_followups',
        q_a_data: expect.objectContaining({
          completeness_score: 0.55,
        }),
      })
    );
    expect(result).toEqual({
      ...followupResponse,
      stop_recommendation: 'ask_more',
    });
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

  it('accumulates follow-up LLM cost into a fresh persisted cost breakdown', async () => {
    const followupResponse = {
      questions: [],
      completeness_score: 0.55,
      stop_recommendation: 'ask_more' as const,
    };
    const nodeCost = {
      node: 'followupGenerator',
      model: 'mock-model',
      input_tokens: 120,
      output_tokens: 80,
      cost_usd: 0.25,
    };
    mocks.generateCareerPlaybookFollowups.mockResolvedValue({
      response: followupResponse,
      nodeCost,
    });
    const builder = createBuilder([
      {
        data: playbookRow({ status: 'answering_followups', cost_breakdown: null }),
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
        cost_breakdown: {
          nodeCosts: [nodeCost],
          total_cost_usd: 0.25,
        },
      })
    );
  });

  it('appends follow-up LLM cost onto a pre-existing cost breakdown and re-sums the total', async () => {
    const followupResponse = {
      questions: [],
      completeness_score: 0.55,
      stop_recommendation: 'ask_more' as const,
    };
    const existingNodeCost = {
      node: 'specBuilder',
      model: 'mock-model',
      input_tokens: 100,
      output_tokens: 200,
      cost_usd: 0.5,
    };
    const nodeCost = {
      node: 'followupGenerator',
      model: 'mock-model',
      input_tokens: 120,
      output_tokens: 80,
      cost_usd: 0.25,
    };
    mocks.generateCareerPlaybookFollowups.mockResolvedValue({
      response: followupResponse,
      nodeCost,
    });
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'answering_followups',
          cost_breakdown: {
            nodeCosts: [existingNodeCost],
            total_cost_usd: 0.5,
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
        cost_breakdown: {
          nodeCosts: [existingNodeCost, nodeCost],
          total_cost_usd: 0.75,
        },
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
    expect(mocks.removeTerminalJobById).toHaveBeenCalledWith(`career-playbook-${playbookId}`);
    expect(mocks.addJob).toHaveBeenCalledWith(
      JobType.CAREER_PLAYBOOK,
      expect.not.objectContaining({
        courseId: expect.any(String),
      }),
      expect.objectContaining({
        jobId: `career-playbook-${playbookId}`,
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
        qaData: expect.objectContaining({
          fixed: [{ question_key: 'position', value: 'Product Lead' }],
          followups: [],
          freeform: [],
          business_context: expect.objectContaining({ mode: 'universal' }),
        }),
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

  it('allows fixed-only generation when follow-up generation never persisted questions', async () => {
    mocks.addJob.mockResolvedValue({ id: 'career-playbook-job-fixed-only' });
    mocks.removeTerminalJobById.mockResolvedValue(false);
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'answering_fixed',
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
    expect(mocks.addJob).toHaveBeenCalledTimes(1);
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

    expect(mocks.removeTerminalJobById).toHaveBeenCalledWith(`career-playbook-${playbookId}`);
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
    mockCareerPlaybookTable(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.library.list({ limit: 20 });

    expect(mocks.from).toHaveBeenCalledWith('career_playbooks');
    expect(builder.or).toHaveBeenCalledWith(
      expect.stringContaining(`user_id.eq.${authenticatedContext.user!.id}`)
    );
    expect(builder.or).toHaveBeenCalledWith(expect.stringContaining('visibility.eq.organization'));
    expect(result.items).toHaveLength(1);
    expect(result.items.map(item => item.id)).toEqual([ownPlaybook.id]);
    expect(result.items.every(item => item.id !== sameOrgPlaybook.id)).toBe(true);
    expect(result.items.every(item => item.id !== foreignPlaybook.id)).toBe(true);
  });

  it('filters, sorts, counts, and exposes facets for the personal library', async () => {
    const rows = [
      playbookRow({
        id: '33333333-3333-4333-8333-333333333337',
        position_title: 'Sales Manager',
        status: 'completed',
        department: 'sales',
        level: 'lead',
        is_public: true,
        created_at: '2026-05-14T03:00:00.000Z',
      }),
      playbookRow({
        id: '33333333-3333-4333-8333-333333333338',
        position_title: 'Sales Analyst',
        status: 'completed',
        department: 'sales',
        level: 'junior',
        created_at: '2026-05-14T02:00:00.000Z',
      }),
      playbookRow({
        id: '33333333-3333-4333-8333-333333333339',
        position_title: 'Engineering Manager',
        status: 'completed',
        department: 'engineering',
        level: 'lead',
        created_at: '2026-05-14T01:00:00.000Z',
      }),
      playbookRow({
        id: '33333333-3333-4333-8333-333333333340',
        position_title: 'Sales Draft',
        status: 'draft',
        department: 'sales',
        level: 'lead',
        created_at: '2026-05-13T01:00:00.000Z',
      }),
    ];
    const builder = createListBuilder(rows);
    mockCareerPlaybookTable(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.library.list({
      limit: 20,
      search: 'sales',
      status: 'completed',
      department: 'sales',
      level: 'lead',
      sort: 'title_asc',
    });

    expect(result.items.map(item => item.positionTitle)).toEqual(['Sales Manager']);
    expect(result.totalCount).toBe(1);
    expect(result.statistics).toEqual({
      totalCount: 4,
      completedCount: 3,
      inProgressCount: 0,
      publicCount: 1,
    });
    expect(result.facets.departments).toEqual(['engineering', 'sales']);
    expect(result.facets.levels).toEqual(['junior', 'lead']);
    expect(result.facets.statuses).toContain('completed');
    expect(result.facets.statuses).toContain('draft');
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

  it('enables public sharing with a deterministic role-based share slug', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          share_slug: null,
          is_public: false,
          status: 'completed',
          final_markdown: '# Sales Manager',
          position_title: 'Head of Sales',
        }),
        error: null,
      },
      { data: null, error: null },
      {
        data: playbookRow({
          share_slug: 'head-of-sales',
          is_public: true,
          status: 'completed',
          final_markdown: '# Sales Manager',
        }),
        error: null,
      },
    ]);
    mockCareerPlaybookTable(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.share.shareToggle({ playbookId, isPublic: true });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_public: true,
        share_slug: 'head-of-sales',
      })
    );
    expect(builder.maybeSingle).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith('id', playbookId);
    expect(builder.eq).toHaveBeenCalledWith('user_id', authenticatedContext.user!.id);
    expect(result).toMatchObject({
      playbookId,
      isPublic: true,
      shareSlug: 'head-of-sales',
      organizationSlug: 'mega-campus',
      visibility: 'public',
      viewerPermissions: {
        canCreateCourse: true,
        canDelete: true,
        canEdit: true,
        canManageVisibility: true,
      },
    });
  });

  it('adds a short suffix only when the role-based share slug collides', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          share_slug: null,
          is_public: false,
          status: 'completed',
          final_markdown: '# Sales Manager',
          position_title: 'Head of Sales',
        }),
        error: null,
      },
      {
        data: { id: '99999999-9999-4999-8999-999999999999' },
        error: null,
      },
      { data: null, error: null },
      {
        data: playbookRow({
          share_slug: 'head-of-sales-333333',
          is_public: true,
          status: 'completed',
          final_markdown: '# Sales Manager',
          position_title: 'Head of Sales',
        }),
        error: null,
      },
    ]);
    mockCareerPlaybookTable(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.share.shareToggle({ playbookId, isPublic: true });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_public: true,
        share_slug: 'head-of-sales-333333',
      })
    );
    expect(builder.maybeSingle).toHaveBeenCalledTimes(2);
    expect(result.shareSlug).toBe('head-of-sales-333333');
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
      visibility: 'private',
    });
    expect(result).toMatchObject({
      playbookId,
      isPublic: false,
      shareSlug: null,
      visibility: 'private',
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
      visibility: 'public',
    });
    expect(result.shareSlug).toBe('existing-share-slug');
    expect(result.visibility).toBe('public');
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
    mockCareerPlaybookTable(builder);

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
      organizationSlug: 'mega-campus',
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
    mockCareerPlaybookTablesInOrder([listBuilder, publicShareBuilder]);

    const otherUserCaller = careerPlaybookRouter.createCaller(otherUserContext);
    const publicCaller = careerPlaybookRouter.createCaller(unauthenticatedContext);

    const otherUserLibrary = await otherUserCaller.library.list({ limit: 20 });
    expect(listBuilder.or).toHaveBeenCalledWith(
      expect.stringContaining(`user_id.eq.${otherUserContext.user!.id}`)
    );
    expect(otherUserLibrary.items).toEqual([]);

    const sharedPlaybook = await publicCaller.share.getPublicBySlug({
      shareSlug: 'public-sales-guide',
    });
    expect(sharedPlaybook).toMatchObject({
      id: publicPlaybook.id,
      shareSlug: 'public-sales-guide',
      isPublic: true,
      organizationSlug: 'mega-campus',
      finalMarkdown: '# Sales Manager',
    });
  });

  it('creates a course from a completed owned playbook', async () => {
    mocks.createCourseFromPlaybook.mockResolvedValue({
      success: true,
      courseId: '44444444-4444-4444-8444-444444444444',
      redirectUrl: '/courses/acme/product-lead/generating',
      sourceDocumentIds: ['file-role-guide', 'file-web-kpis'],
      generationCode: 'GEN-123',
    });
    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.courseBridge.createCourseFromPlaybook({ playbookId });

    expect(mocks.createCourseFromPlaybook).toHaveBeenCalledWith(authenticatedContext, {
      playbookId,
      includeWebResearch: false,
      includeBusinessContextSources: false,
    });
    expect(result).toMatchObject({
      success: true,
      courseId: '44444444-4444-4444-8444-444444444444',
      redirectUrl: '/courses/acme/product-lead/generating',
      sourceDocumentIds: ['file-role-guide', 'file-web-kpis'],
    });
  });

  it('rate limits course bridge creation attempts on the server', () => {
    const procedure = appRouter._def.procedures[
      'careerPlaybook.courseBridge.createCourseFromPlaybook'
    ] as { _def?: { middlewares?: unknown[] } };

    expect(procedure._def?.middlewares?.length).toBeGreaterThanOrEqual(5);
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
