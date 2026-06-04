import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import * as path from 'path';

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
const sourceId = '66666666-6666-4666-8666-666666666666';

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
    neq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => {
      const result = singleResults.shift();
      return Promise.resolve(result ?? { data: null, error: new Error('No mocked single result') });
    }),
  };

  return builder;
}

function createDeleteBuilder(error: unknown = null) {
  const builder = {
    delete: vi.fn(() => builder),
    eq: vi.fn(() => Promise.resolve({ error })),
  };

  return builder;
}

function createCountBuilder(count = 0, error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => Promise.resolve({ count, error })),
  };

  return builder;
}

function createListBuilder(data: unknown[], error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data, error })),
  };

  return builder;
}

function createSourceRowsBuilder(data: unknown[], error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    neq: vi.fn(() => Promise.resolve({ data, error })),
  };

  return builder;
}

function createFileRowsBuilder(data: unknown[], error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => Promise.resolve({ data, error })),
  };

  return builder;
}

describe('careerPlaybookRouter business context sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('uploads a Career Playbook business context source without binding it to a course', async () => {
    const playbookBuilder = createBuilder([
      {
        data: playbookRow({
          status: 'awaiting_followups',
          organization_id: authenticatedContext.user!.organizationId,
        }),
        error: null,
      },
    ]);
    const organizationBuilder = createBuilder([
      { data: { id: authenticatedContext.user!.organizationId, tier: 'standard' }, error: null },
    ]);
    const countBuilder = createCountBuilder(0);
    const sourceBuilder = createBuilder([
      {
        data: {
          id: sourceId,
          playbook_id: playbookId,
          organization_id: authenticatedContext.user!.organizationId,
          user_id: authenticatedContext.user!.id,
          status: 'uploaded',
          file_catalog_id: '55555555-5555-4555-8555-555555555555',
        },
        error: null,
      },
    ]);
    const sourceBuilders = [countBuilder, sourceBuilder];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'career_playbooks') return playbookBuilder;
      if (table === 'organizations') return organizationBuilder;
      if (table === 'career_playbook_sources') return sourceBuilders.shift();
      throw new Error(`Unexpected table ${table}`);
    });

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.sources.uploadFile({
      playbookId,
      filename: 'product.pdf',
      fileSize: 12,
      mimeType: 'application/pdf',
      fileContent: Buffer.from('hello').toString('base64'),
    });

    expect(mocks.runPhase2Storage).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'career_playbook',
        ownerId: playbookId,
        organizationId: authenticatedContext.user!.organizationId,
        userId: authenticatedContext.user!.id,
        filename: 'product.pdf',
      })
    );
    expect(mocks.runPhase2Storage.mock.calls[0]?.[0]).not.toHaveProperty('courseId');
    expect(mocks.addJob).toHaveBeenCalledWith(
      JobType.CAREER_PLAYBOOK,
      expect.objectContaining({
        jobType: JobType.CAREER_PLAYBOOK,
        operation: 'PROCESS_SOURCE',
        playbookId,
        sourceId,
        fileId: '55555555-5555-4555-8555-555555555555',
        filePath: path.join(
          process.cwd(),
          'uploads/22222222-2222-4222-8222-222222222222/career-playbooks/33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.pdf'
        ),
        mimeType: 'application/pdf',
        userId: authenticatedContext.user!.id,
        organizationId: authenticatedContext.user!.organizationId,
        language: 'en',
        locale: 'en',
        createdAt: expect.any(String),
      }),
      expect.objectContaining({
        jobId: `career-playbook-source-${playbookId}-${sourceId}`,
      })
    );
    expect(mocks.addJob.mock.calls[0]?.[1]).not.toHaveProperty('courseId');
    expect(sourceBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        playbook_id: playbookId,
        organization_id: authenticatedContext.user!.organizationId,
        user_id: authenticatedContext.user!.id,
        source_type: 'file',
        status: 'uploaded',
        file_catalog_id: '55555555-5555-4555-8555-555555555555',
      })
    );
    expect(result).toMatchObject({
      sourceId,
      fileId: '55555555-5555-4555-8555-555555555555',
      status: 'processing',
    });
    expect(mocks.from).not.toHaveBeenCalledWith('courses');
  });

  it('lists active Career Playbook sources for the owning playbook', async () => {
    const playbookBuilder = createBuilder([
      {
        data: playbookRow({
          status: 'awaiting_followups',
          organization_id: authenticatedContext.user!.organizationId,
        }),
        error: null,
      },
    ]);
    const sourcesBuilder = createListBuilder([
      {
        id: sourceId,
        playbook_id: playbookId,
        organization_id: authenticatedContext.user!.organizationId,
        user_id: authenticatedContext.user!.id,
        source_type: 'file',
        status: 'uploaded',
        filename: 'product.pdf',
        file_catalog_id: '55555555-5555-4555-8555-555555555555',
        error_message: null,
        created_at: '2026-06-03T09:00:00.000Z',
        updated_at: '2026-06-03T09:01:00.000Z',
      },
    ]);

    mocks.from.mockImplementation((table: string) => {
      if (table === 'career_playbooks') return playbookBuilder;
      if (table === 'career_playbook_sources') return sourcesBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.sources.listSources({ playbookId });

    expect(sourcesBuilder.neq).toHaveBeenCalledWith('status', 'removed');
    expect(result).toEqual([
      {
        id: sourceId,
        playbookId,
        sourceType: 'file',
        filename: 'product.pdf',
        status: 'uploaded',
        fileCatalogId: '55555555-5555-4555-8555-555555555555',
        errorMessage: null,
        createdAt: '2026-06-03T09:00:00.000Z',
        updatedAt: '2026-06-03T09:01:00.000Z',
      },
    ]);
  });

  it('forbids listing sources for another user playbook', async () => {
    const playbookBuilder = createBuilder([
      {
        data: playbookRow({
          user_id: authenticatedContext.user!.id,
          organization_id: authenticatedContext.user!.organizationId,
        }),
        error: null,
      },
    ]);
    mocks.from.mockReturnValue(playbookBuilder);

    const caller = careerPlaybookRouter.createCaller(otherUserContext);

    await expect(caller.sources.listSources({ playbookId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Career Playbook access denied',
    });
  });

  it('removes an owned source by deleting its file_catalog row and releasing local storage quota', async () => {
    const fileId = '55555555-5555-4555-8555-555555555555';
    const storagePath = `uploads/${authenticatedContext.user!.organizationId}/career-playbooks/${playbookId}/${fileId}.pdf`;
    const playbookBuilder = createBuilder([
      {
        data: playbookRow({
          status: 'awaiting_followups',
          organization_id: authenticatedContext.user!.organizationId,
        }),
        error: null,
      },
    ]);
    const sourceBuilder = createBuilder([
      {
        data: {
          id: sourceId,
          playbook_id: playbookId,
          organization_id: authenticatedContext.user!.organizationId,
          user_id: authenticatedContext.user!.id,
          status: 'uploaded',
          filename: 'product.pdf',
          file_catalog_id: fileId,
        },
        error: null,
      },
    ]);
    const fileCatalogSelectBuilder = createBuilder([
      {
        data: {
          id: fileId,
          organization_id: authenticatedContext.user!.organizationId,
          course_id: null,
          storage_path: storagePath,
          file_size: 12,
          original_file_id: null,
          reference_count: 1,
        },
        error: null,
      },
    ]);
    const fileCatalogDeleteBuilder = createDeleteBuilder();
    const fileCatalogBuilders = [fileCatalogSelectBuilder, fileCatalogDeleteBuilder];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'career_playbooks') return playbookBuilder;
      if (table === 'career_playbook_sources') return sourceBuilder;
      if (table === 'file_catalog') return fileCatalogBuilders.shift();
      throw new Error(`Unexpected table ${table}`);
    });

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.sources.removeSource({ playbookId, sourceId });

    expect(fileCatalogDeleteBuilder.delete).toHaveBeenCalled();
    expect(fileCatalogDeleteBuilder.eq).toHaveBeenCalledWith('id', fileId);
    expect(mocks.decrementQuota).toHaveBeenCalledWith(
      authenticatedContext.user!.organizationId,
      12
    );
    expect(mocks.unlink).toHaveBeenCalledWith(expect.stringContaining(storagePath));
    expect(mocks.from).not.toHaveBeenCalledWith('courses');
    expect(result).toEqual({
      sourceId,
      playbookId,
      fileCatalogId: fileId,
      status: 'removed',
      quotaReleasedBytes: 12,
      fileDeleted: true,
    });
  });

  it('surfaces file_catalog delete errors without releasing quota or deleting the local file', async () => {
    const fileId = '55555555-5555-4555-8555-555555555555';
    const playbookBuilder = createBuilder([
      {
        data: playbookRow({
          status: 'awaiting_followups',
          organization_id: authenticatedContext.user!.organizationId,
        }),
        error: null,
      },
    ]);
    const sourceBuilder = createBuilder([
      {
        data: {
          id: sourceId,
          playbook_id: playbookId,
          organization_id: authenticatedContext.user!.organizationId,
          user_id: authenticatedContext.user!.id,
          status: 'uploaded',
          filename: 'product.pdf',
          file_catalog_id: fileId,
        },
        error: null,
      },
    ]);
    const fileCatalogSelectBuilder = createBuilder([
      {
        data: {
          id: fileId,
          organization_id: authenticatedContext.user!.organizationId,
          course_id: null,
          storage_path: `uploads/${authenticatedContext.user!.organizationId}/career-playbooks/${playbookId}/${fileId}.pdf`,
          file_size: 12,
          original_file_id: null,
          reference_count: 1,
        },
        error: null,
      },
    ]);
    const fileCatalogDeleteBuilder = createDeleteBuilder(new Error('delete failed'));
    const fileCatalogBuilders = [fileCatalogSelectBuilder, fileCatalogDeleteBuilder];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'career_playbooks') return playbookBuilder;
      if (table === 'career_playbook_sources') return sourceBuilder;
      if (table === 'file_catalog') return fileCatalogBuilders.shift();
      throw new Error(`Unexpected table ${table}`);
    });

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(caller.sources.removeSource({ playbookId, sourceId })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to remove Career Playbook source file metadata',
    });
    expect(mocks.decrementQuota).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it('cleans up stored Career Playbook source files when source record creation fails', async () => {
    const playbookBuilder = createBuilder([
      {
        data: playbookRow({
          status: 'awaiting_followups',
          organization_id: authenticatedContext.user!.organizationId,
        }),
        error: null,
      },
    ]);
    const organizationBuilder = createBuilder([
      { data: { id: authenticatedContext.user!.organizationId, tier: 'standard' }, error: null },
    ]);
    const countBuilder = createCountBuilder(0);
    const sourceBuilder = createBuilder([{ data: null, error: new Error('insert failed') }]);
    const fileCatalogBuilder = createBuilder();
    const sourceBuilders = [countBuilder, sourceBuilder];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'career_playbooks') return playbookBuilder;
      if (table === 'organizations') return organizationBuilder;
      if (table === 'career_playbook_sources') return sourceBuilders.shift();
      if (table === 'file_catalog') return fileCatalogBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expect(
      caller.sources.uploadFile({
        playbookId,
        filename: 'product.pdf',
        fileSize: 12,
        mimeType: 'application/pdf',
        fileContent: Buffer.from('hello').toString('base64'),
      })
    ).rejects.toBeInstanceOf(TRPCError);

    expect(fileCatalogBuilder.delete).toHaveBeenCalled();
    expect(fileCatalogBuilder.eq).toHaveBeenCalledWith(
      'id',
      '55555555-5555-4555-8555-555555555555'
    );
    expect(mocks.decrementQuota).toHaveBeenCalledWith(
      authenticatedContext.user!.organizationId,
      12
    );
  });

  it('returns persisted business context source summaries with a resumed draft', async () => {
    const playbookBuilder = createBuilder([
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
              source_ids: [sourceId],
            },
            followup_questions: [],
            followup_generation_count: 0,
          },
        }),
        error: null,
      },
    ]);
    const sourcesBuilder = createListBuilder([
      {
        id: sourceId,
        playbook_id: playbookId,
        source_type: 'file',
        status: 'processing',
        filename: 'sales-playbook.pdf',
        file_catalog_id: '55555555-5555-4555-8555-555555555555',
        error_message: null,
        created_at: '2026-06-03T09:00:00.000Z',
        updated_at: '2026-06-03T09:01:00.000Z',
      },
    ]);

    mocks.from.mockImplementation((table: string) => {
      if (table === 'career_playbooks') return playbookBuilder;
      if (table === 'career_playbook_sources') return sourcesBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const result = await caller.session.getDraft({ playbookId });

    expect(sourcesBuilder.neq).toHaveBeenCalledWith('status', 'removed');
    expect(result).toMatchObject({
      playbookId,
      phase: 'business_context',
      businessContextSources: [
        {
          id: sourceId,
          playbookId,
          sourceType: 'file',
          status: 'processing',
          filename: 'sales-playbook.pdf',
          fileCatalogId: '55555555-5555-4555-8555-555555555555',
          errorMessage: null,
          createdAt: '2026-06-03T09:00:00.000Z',
          updatedAt: '2026-06-03T09:01:00.000Z',
        },
      ],
    });
  });

  it('requests follow-up questions with universal context defaults', async () => {
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
      playbookId,
      qaData: expect.objectContaining({
        fixed: [{ question_key: 'position', value: 'Product Lead' }],
        followups: [],
        freeform: [],
        business_context: expect.objectContaining({ mode: 'universal', status: 'skipped' }),
      }),
      language: 'en',
      businessContextSourceExcerpts: '- none',
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

  it('refreshes company business context digest before requesting follow-ups', async () => {
    const digestSourceId = '00000000-0000-4000-8000-000000000010';
    const fileId = '00000000-0000-4000-8000-000000000020';
    const followupResponse = {
      questions: [],
      completeness_score: 0.82,
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
    const playbookBuilder = createBuilder([
      {
        data: playbookRow({
          status: 'awaiting_followups',
          q_a_data: {
            fixed: [],
            followups: [],
            freeform: [
              {
                text: 'Product: AI course generation platform. Customers: HR teams.',
                submitted_at: '2026-06-03T00:00:00.000Z',
              },
            ],
            business_context: {
              mode: 'company_specific',
              status: 'collecting',
              digest: null,
              source_ids: [digestSourceId],
            },
            followup_questions: [],
            followup_generation_count: 0,
          },
        }),
        error: null,
      },
      { data: playbookRow({ status: 'ready_to_generate' }), error: null },
    ]);
    const sourceBuilder = createSourceRowsBuilder([
      {
        id: digestSourceId,
        filename: 'sales-deck.pdf',
        status: 'ready',
        file_catalog_id: fileId,
      },
    ]);
    const fileBuilder = createFileRowsBuilder([
      {
        id: fileId,
        filename: 'sales-deck.pdf',
        processed_content: 'Metrics: qualified pipeline. Sales channels: inbound demos.',
        markdown_content: null,
      },
    ]);
    const tableBuilders = {
      career_playbooks: playbookBuilder,
      career_playbook_sources: sourceBuilder,
      file_catalog: fileBuilder,
    };
    mocks.from.mockImplementation((table: keyof typeof tableBuilders) => tableBuilders[table]);

    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    await caller.generation.requestFollowups({
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
        business_context: expect.objectContaining({
          mode: 'company_specific',
          status: 'ready',
          digest: expect.objectContaining({
            product: expect.arrayContaining([expect.stringContaining('AI course generation')]),
            customers: expect.arrayContaining([expect.stringContaining('HR teams')]),
            metrics: expect.arrayContaining([expect.stringContaining('qualified pipeline')]),
            sales_channels: expect.arrayContaining([expect.stringContaining('inbound demos')]),
          }),
        }),
      }),
      language: 'en',
      businessContextSourceExcerpts: expect.stringContaining('sales-deck.pdf'),
    });
    expect(playbookBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ready_to_generate',
        q_a_data: expect.objectContaining({
          business_context: expect.objectContaining({
            status: 'ready',
            digest: expect.objectContaining({
              metrics: expect.arrayContaining([expect.stringContaining('qualified pipeline')]),
            }),
          }),
        }),
      })
    );
  });

  it('refuses follow-up generation while selected business context sources are still processing', async () => {
    const processingSourceId = '00000000-0000-4000-8000-000000000010';
    const playbookBuilder = createBuilder([
      {
        data: playbookRow({
          status: 'awaiting_followups',
          q_a_data: {
            fixed: [],
            followups: [],
            freeform: [],
            business_context: {
              mode: 'company_specific',
              status: 'collecting',
              digest: null,
              source_ids: [processingSourceId],
            },
            followup_questions: [],
            followup_generation_count: 0,
          },
        }),
        error: null,
      },
    ]);
    const sourceBuilder = createSourceRowsBuilder([
      {
        id: processingSourceId,
        filename: 'sales-deck.pdf',
        status: 'processing',
        file_catalog_id: '00000000-0000-4000-8000-000000000020',
      },
    ]);
    mocks.from.mockImplementation((table: string) => {
      if (table === 'career_playbooks') return playbookBuilder;
      if (table === 'career_playbook_sources') return sourceBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

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
      message: 'Business context source files are still processing',
    });
    expect(mocks.generateCareerPlaybookFollowups).not.toHaveBeenCalled();
    expect(playbookBuilder.update).not.toHaveBeenCalled();
  });
});
