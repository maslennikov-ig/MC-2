import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  resolveCareerPlaybookDepartmentOptions: vi.fn(),
  generateCareerPlaybookFollowups: vi.fn(),
  getCareerPlaybookGraph: vi.fn(),
  renderCareerPlaybookPdf: vi.fn(),
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

vi.mock('fs/promises', () => ({ unlink: mocks.unlink }));
vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mocks.from, rpc: mocks.rpc })),
}));
vi.mock('@/shared/validation/file-validator', () => ({ validateFile: mocks.validateFile }));
vi.mock('@/shared/validation/quota-enforcer', () => ({ decrementQuota: mocks.decrementQuota }));
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
  createCourseFromPlaybook: mocks.createCourseFromPlaybook,
}));
vi.mock('@/orchestrator/queue', () => ({
  addJob: mocks.addJob,
  removeTerminalJobById: mocks.removeTerminalJobById,
  getQueue: vi.fn(() => ({ add: vi.fn(), on: vi.fn() })),
}));

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
    visibility: 'private',
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
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => {
      const result = singleResults.shift();
      return Promise.resolve(result ?? { data: null, error: new Error('No mocked single result') });
    }),
  };

  return builder;
}

describe('careerPlaybookRouter progress and context persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReset();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('clears persisted follow-up context when freeform business notes change', async () => {
    const staleFollowupQuestion = {
      question_id: '00000000-0000-4000-8000-000000000301',
      question_text: 'Which tools matter?',
      question_type: 'open',
      options: null,
      rationale: 'Clarifies tools.',
    };
    const existingRow = playbookRow({
      status: 'answering_followups',
      q_a_data: {
        fixed: [{ question_key: 'position', value: 'Product Lead' }],
        followups: [
          {
            question_id: staleFollowupQuestion.question_id,
            question_text: staleFollowupQuestion.question_text,
            question_type: 'open',
            value: 'Old CRM',
            skipped: false,
          },
        ],
        freeform: [{ text: 'Old context', submitted_at: '2026-06-07T10:00:00.000Z' }],
        completeness_score: 0.81,
        followup_questions: [staleFollowupQuestion],
        followup_generation_count: 1,
      },
    });
    const updatedRow = playbookRow({
      status: 'awaiting_followups',
      q_a_data: {
        fixed: [{ question_key: 'position', value: 'Product Lead' }],
        followups: [],
        freeform: [{ text: 'New context', submitted_at: '2026-06-07T10:01:00.000Z' }],
        completeness_score: 0,
        followup_questions: [],
        followup_generation_count: 0,
      },
    });
    const builder = createBuilder([
      { data: existingRow, error: null },
      { data: updatedRow, error: null },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.session.submitAnswer({
      playbookId,
      phase: 'freeform',
      answer: { freeform_text: 'New context' },
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'awaiting_followups',
        q_a_data: expect.objectContaining({
          followups: [],
          followup_questions: [],
          followup_generation_count: 0,
          completeness_score: 0,
        }),
      })
    );
    expect(result).toMatchObject({
      playbookId,
      status: 'awaiting_followups',
      followupQuestions: [],
      followupAnswers: [],
      followupGenerationCount: 0,
    });
  });

  it('saves wizard progress into persisted QA data without changing answers', async () => {
    const existingRow = playbookRow({
      q_a_data: {
        fixed: [{ question_key: 'position', value: 'Product Lead' }],
        followups: [],
        freeform: [],
      },
    });
    const updatedRow = playbookRow({
      q_a_data: {
        ...existingRow.q_a_data,
        ui_progress: {
          phase: 'fixed',
          current_fixed_question_key: 'level',
          current_fixed_index: 1,
          updated_at: '2026-06-07T10:00:00.000Z',
        },
      },
    });
    const builder = createBuilder([
      { data: existingRow, error: null },
      { data: updatedRow, error: null },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.session.saveProgress({
      playbookId,
      progress: {
        phase: 'fixed',
        current_fixed_question_key: 'level',
        current_fixed_index: 1,
        updated_at: '2026-06-07T10:00:00.000Z',
      },
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        q_a_data: expect.objectContaining({
          fixed: [{ question_key: 'position', value: 'Product Lead' }],
          ui_progress: expect.objectContaining({ current_fixed_question_key: 'level' }),
        }),
      })
    );
    expect(result.progress).toMatchObject({
      phase: 'fixed',
      current_fixed_question_key: 'level',
    });
  });

  it('returns wizard progress from a resumed draft and derives the active phase from it', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'awaiting_followups',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
            business_context: {
              mode: 'company_specific',
              status: 'collecting',
              digest: null,
              source_ids: [],
            },
            ui_progress: {
              phase: 'business_context',
              updated_at: '2026-06-07T10:00:00.000Z',
            },
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
      status: 'awaiting_followups',
      phase: 'business_context',
      progress: expect.objectContaining({ phase: 'business_context' }),
    });
  });

  it('keeps terminal draft phases at completion even when persisted progress is stale', async () => {
    const builder = createBuilder([
      {
        data: playbookRow({
          status: 'completed',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Product Lead' }],
            followups: [],
            freeform: [],
            ui_progress: {
              phase: 'fixed',
              current_fixed_question_key: 'level',
              current_fixed_index: 1,
              updated_at: '2026-06-07T10:00:00.000Z',
            },
          },
          final_markdown: '# Product Lead Role Guide',
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.session.getDraft({ playbookId });

    expect(result).toMatchObject({
      playbookId,
      status: 'completed',
      phase: 'completion',
      progress: expect.objectContaining({ phase: 'fixed' }),
    });
  });
});
