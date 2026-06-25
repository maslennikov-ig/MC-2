import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/server/trpc';

const bridgeMocks = vi.hoisted(() => ({
  decrementQuota: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  incrementQuota: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('@/shared/validation/quota-enforcer', () => ({
  decrementQuota: bridgeMocks.decrementQuota,
  incrementQuota: bridgeMocks.incrementQuota,
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: bridgeMocks.getSupabaseAdmin,
}));

vi.mock('node:fs/promises', () => ({
  mkdir: bridgeMocks.mkdir,
  unlink: bridgeMocks.unlink,
  writeFile: bridgeMocks.writeFile,
}));

import {
  buildCourseBridgeBrief,
  createCourseFromPlaybook,
  deleteCareerPlaybookBridgeCourse,
  previewCourseFromPlaybook,
  renderCourseBridgeSourceDocuments,
  uploadSyntheticCourseBridgeDocument,
  type CourseBridgeDependencies,
} from '@/server/routers/career-playbook/course-bridge.service';
import type { CareerPlaybookRow } from '@/server/routers/career-playbook/service-mappers';

const playbookId = '33333333-3333-4333-8333-333333333333';
const courseId = '44444444-4444-4444-8444-444444444444';

const instructorContext: Context = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'author@example.com',
    role: 'instructor',
    organizationId: '22222222-2222-4222-8222-222222222222',
  },
  req: new Request('http://localhost/trpc'),
};

function completedPlaybook(overrides: Partial<CareerPlaybookRow> = {}): CareerPlaybookRow {
  return {
    id: playbookId,
    user_id: instructorContext.user!.id,
    organization_id: instructorContext.user!.organizationId,
    status: 'completed',
    language: 'en',
    slug: null,
    position_title: 'Product Lead',
    department: 'Product',
    specialization: 'Platform',
    level: 'Lead',
    q_a_data: {
      fixed: [
        { question_key: 'position', value: 'Product Lead' },
        { question_key: 'department', value: 'Product' },
        { question_key: 'level', value: 'Lead' },
      ],
      followups: [],
      freeform: [],
    },
    role_profile_spec: {
      position: {
        title: 'Product Lead',
        slug: 'product-lead',
        department: 'Product',
        specialization: 'Platform',
        level: 'lead',
      },
      context: {
        team_size: '11-50',
        reports_to: 'Chief Product Officer',
        has_subordinates: true,
      },
      focus_areas: {
        primary_kpis: ['Improve activation', 'Grow platform adoption'],
        key_tools: ['Product analytics'],
        critical_competencies: ['Define product strategy', 'Run discovery rituals'],
        anti_goals: ['Operate as a ticket taker'],
        failure_patterns: ['Weak stakeholder alignment'],
      },
      research: {
        kpis_insights: ['Activation is a leading platform metric.'],
        trends_insights: [],
        onboarding_insights: [],
        sources: ['https://example.com/spec-research'],
      },
      block_boundaries: {},
      content_language: 'en',
    },
    generated_blocks: {
      block_6: {
        content: 'Mission: own platform product outcomes.',
        status: 'generated',
        attempt: 1,
      },
      block_7: {
        content: 'KPIs: activation, retention, adoption.',
        status: 'generated',
        attempt: 1,
      },
      block_8: {
        content: 'Competencies: discovery, prioritization, stakeholder management.',
        status: 'generated',
        attempt: 1,
      },
      block_14: {
        content: 'First 30 days: map users and rituals.',
        status: 'generated',
        attempt: 1,
      },
      block_21: {
        content: 'Career path: senior lead to product director.',
        status: 'generated',
        attempt: 1,
      },
    },
    final_markdown: '# Product Lead\n\nComplete role guide.',
    web_research: null,
    cost_breakdown: null,
    share_slug: null,
    is_public: false,
    created_at: '2026-05-14T00:00:00.000Z',
    updated_at: '2026-05-14T00:00:00.000Z',
    completed_at: '2026-05-14T01:00:00.000Z',
    ...overrides,
  };
}

function businessContextPlaybook(): CareerPlaybookRow {
  return completedPlaybook({
    q_a_data: {
      fixed: [
        { question_key: 'position', value: 'Product Lead' },
        { question_key: 'department', value: 'Product' },
        { question_key: 'level', value: 'Lead' },
      ],
      followups: [],
      freeform: [],
      business_context: {
        mode: 'company_specific',
        status: 'ready',
        digest: null,
        source_ids: ['55555555-5555-4555-8555-555555555555'],
      },
    },
  });
}

function createDependencies(overrides: Partial<CourseBridgeDependencies> = {}) {
  const uploadedIds: string[] = [];
  const dependencies: CourseBridgeDependencies = {
    loadPlaybook: vi.fn(() => Promise.resolve(completedPlaybook())),
    getOrganizationSlug: vi.fn(() => Promise.resolve('acme')),
    insertCourse: vi.fn(input =>
      Promise.resolve({
        id: courseId,
        slug: input.slug,
        title: input.title,
      })
    ),
    deleteCourse: vi.fn(() => Promise.resolve(undefined)),
    uploadDocument: vi.fn(input => {
      const id = input.filename.includes('web-research')
        ? 'file-web-kpis'
        : input.filename.includes('business-context')
          ? 'file-business-context'
          : 'file-role-guide';
      uploadedIds.push(id);
      return Promise.resolve({ fileId: id });
    }),
    listBusinessContextSources: vi.fn(() => Promise.resolve([])),
    loadBusinessContextSourceEvidence: vi.fn(() =>
      Promise.resolve({
        sourceExcerpts: '- none',
        hasAuthoritativeEvidence: false,
        unavailableReason: 'universal',
      })
    ),
    runWebResearch: vi.fn(() =>
      Promise.resolve({
        kpis_insights: ['Activation and retention are common product lead KPIs.'],
        trends_insights: ['AI-assisted product discovery is becoming standard.'],
        onboarding_insights: ['First 30 days should cover rituals and stakeholders.'],
        sources: ['https://example.com/product-lead-kpis'],
        errors: [],
      })
    ),
    initiateGeneration: vi.fn(() =>
      Promise.resolve({
        success: true,
        jobId: 'job-1',
        message: 'Генерация курса инициализирована',
        courseId,
        generationCode: 'GEN-123',
      })
    ),
    now: () => new Date('2026-05-19T10:00:00.000Z'),
    ...overrides,
  };

  return { dependencies, uploadedIds };
}

describe('course bridge service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.decrementQuota.mockResolvedValue(undefined);
    bridgeMocks.incrementQuota.mockResolvedValue(undefined);
    bridgeMocks.mkdir.mockResolvedValue(undefined);
    bridgeMocks.unlink.mockResolvedValue(undefined);
    bridgeMocks.writeFile.mockResolvedValue(undefined);
  });

  it('extracts a course brief from blocks 6, 7, 8, 14, and 21', () => {
    const brief = buildCourseBridgeBrief(completedPlaybook());

    expect(brief.title).toBe('Product Lead');
    expect(brief.targetAudience).toBe('lead Product Platform');
    expect(brief.learningOutcomes).toContain('Define product strategy');
    expect(brief.learningOutcomes).toContain('Improve activation');
    expect(brief.courseDescription).toContain('Mission: own platform product outcomes.');
    expect(brief.courseDescription).toContain('KPIs: activation, retention, adoption.');
    expect(brief.courseDescription).toContain('Competencies: discovery');
    expect(brief.courseDescription).toContain('First 30 days');
    expect(brief.courseDescription).toContain('Career path');
  });

  it('previews an editable course passport with supporting sources disabled by default', async () => {
    const { dependencies } = createDependencies({
      loadPlaybook: vi.fn(() => Promise.resolve(businessContextPlaybook())),
      listBusinessContextSources: vi.fn(() =>
        Promise.resolve([
          {
            id: '55555555-5555-4555-8555-555555555555',
            playbookId,
            sourceType: 'file',
            filename: 'company-handbook.md',
            status: 'ready',
            fileCatalogId: 'file-company-handbook',
            errorMessage: null,
            createdAt: '2026-05-14T00:00:00.000Z',
            updatedAt: '2026-05-14T00:00:00.000Z',
          },
        ])
      ),
    });

    const preview = await previewCourseFromPlaybook(
      instructorContext,
      { playbookId },
      dependencies
    );

    expect(preview.brief).toMatchObject({
      title: 'Product Lead',
      courseSize: 'auto',
      style: 'professional',
      language: 'en',
    });
    expect(preview.defaults).toEqual({
      includeWebResearch: false,
      includeBusinessContextSources: false,
    });
    expect(preview.sources.roleGuide).toMatchObject({ included: true });
    expect(preview.sources.webResearch).toMatchObject({
      available: true,
      defaultIncluded: false,
    });
    expect(preview.sources.businessContextSources).toMatchObject({
      available: true,
      defaultIncluded: false,
      sourceCount: 1,
    });
  });

  it('keeps course preview available when optional business-context source listing fails', async () => {
    const { dependencies } = createDependencies({
      listBusinessContextSources: vi.fn(() => Promise.reject(new Error('source list unavailable'))),
    });

    const preview = await previewCourseFromPlaybook(
      instructorContext,
      { playbookId },
      dependencies
    );

    expect(preview.brief.title).toBe('Product Lead');
    expect(preview.sources.roleGuide).toMatchObject({ included: true });
    expect(preview.sources.businessContextSources).toEqual({
      available: false,
      defaultIncluded: false,
      sourceCount: 0,
      sources: [],
    });
  });

  it('applies preview overrides and keeps optional sources off by default', async () => {
    const { dependencies } = createDependencies();

    await createCourseFromPlaybook(
      instructorContext,
      {
        playbookId,
        overrides: {
          title: 'Edited onboarding course',
          courseDescription: 'Edited course description',
          targetAudience: 'New platform product leads',
          learningOutcomes: ['Build activation strategy', 'Run discovery rituals'],
          language: 'ru',
          courseSize: 'mini',
          style: 'practical',
        },
      },
      dependencies
    );

    expect(dependencies.runWebResearch).not.toHaveBeenCalled();
    expect(dependencies.loadBusinessContextSourceEvidence).not.toHaveBeenCalled();
    expect(dependencies.insertCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Edited onboarding course',
        slug: 'edited-onboarding-course',
        courseDescription: 'Edited course description',
        targetAudience: 'New platform product leads',
        learningOutcomes: ['Build activation strategy', 'Run discovery rituals'],
        language: 'ru',
        courseSize: 'mini',
        style: 'practical',
        generationMode: 'semi_automatic',
        settings: expect.objectContaining({
          source: 'career_playbook',
          playbookId,
          bridgeVersion: 1,
          includeWebResearch: false,
          includeBusinessContextSources: false,
          clarifying_questions_enabled: true,
          clarifying_questions_skipped: false,
          style: 'practical',
        }),
        sourceDocuments: [
          expect.objectContaining({
            filename: 'career-playbook-edited-onboarding-course.md',
          }),
        ],
      })
    );
    expect(dependencies.uploadDocument).toHaveBeenCalledTimes(1);
  });

  it('adds uploaded business-context sources only when explicitly requested', async () => {
    const { dependencies } = createDependencies({
      loadPlaybook: vi.fn(() => Promise.resolve(businessContextPlaybook())),
      loadBusinessContextSourceEvidence: vi.fn(() =>
        Promise.resolve({
          sourceExcerpts: '## Source: company-handbook.md\n\nCompany-specific activation rituals.',
          hasAuthoritativeEvidence: true,
          unavailableReason: 'none',
        })
      ),
    });

    const result = await createCourseFromPlaybook(
      instructorContext,
      { playbookId, includeBusinessContextSources: true },
      dependencies
    );

    expect(dependencies.loadBusinessContextSourceEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        playbookId,
        context: expect.objectContaining({
          mode: 'company_specific',
          source_ids: ['55555555-5555-4555-8555-555555555555'],
        }),
      })
    );
    expect(dependencies.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'career-playbook-business-context-product-lead.md',
        markdown: expect.stringContaining('Company-specific activation rituals.'),
      })
    );
    expect(result.sourceDocumentIds).toEqual(['file-role-guide', 'file-business-context']);
  });

  it('creates fallback source markdown when web research is unavailable', async () => {
    const { dependencies } = createDependencies({
      loadPlaybook: vi.fn(() => Promise.resolve(completedPlaybook({ role_profile_spec: null }))),
      runWebResearch: vi.fn(() =>
        Promise.resolve({
          kpis_insights: [],
          trends_insights: [],
          onboarding_insights: [],
          sources: [],
          errors: ['TAVILY_API_KEY is not configured'],
        })
      ),
    });

    const result = await createCourseFromPlaybook(
      instructorContext,
      { playbookId, includeWebResearch: true },
      dependencies
    );

    expect(dependencies.uploadDocument).toHaveBeenCalledTimes(1);
    expect(dependencies.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId,
        filename: 'career-playbook-product-lead.md',
        markdown: expect.stringContaining('Source: Career Playbook'),
      })
    );
    expect(result.sourceDocumentIds).toEqual(['file-role-guide']);
  });

  it('creates web research source markdown with source URLs when search succeeds', () => {
    const documents = renderCourseBridgeSourceDocuments({
      playbook: completedPlaybook(),
      brief: buildCourseBridgeBrief(completedPlaybook()),
      research: {
        kpis_insights: ['Activation and retention are common product lead KPIs.'],
        trends_insights: ['AI-assisted product discovery is becoming standard.'],
        onboarding_insights: ['First 30 days should cover rituals and stakeholders.'],
        sources: ['https://example.com/product-lead-kpis'],
        errors: [],
      },
      includeWebResearch: true,
    });

    expect(documents).toHaveLength(2);
    expect(documents[1]).toMatchObject({
      filename: 'career-playbook-web-research-product-lead.md',
    });
    expect(documents[1].markdown).toContain('https://example.com/product-lead-kpis');
    expect(documents[1].markdown).toContain('Activation and retention');
  });

  it('reuses persisted playbook web research before running a fresh external lookup', async () => {
    const persistedResearch = {
      kpis_insights: ['Persisted KPI insight'],
      trends_insights: ['Persisted trend insight'],
      onboarding_insights: ['Persisted onboarding insight'],
      sources: ['https://example.com/persisted-research'],
      errors: [],
    };
    const { dependencies } = createDependencies({
      loadPlaybook: vi.fn(() =>
        Promise.resolve(completedPlaybook({ web_research: persistedResearch }))
      ),
      runWebResearch: vi.fn(() => Promise.reject(new Error('external lookup should not run'))),
    });

    await createCourseFromPlaybook(
      instructorContext,
      { playbookId, includeWebResearch: true },
      dependencies
    );

    expect(dependencies.runWebResearch).not.toHaveBeenCalled();
    expect(dependencies.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'career-playbook-web-research-product-lead.md',
        markdown: expect.stringContaining('Persisted KPI insight'),
        sourceUrls: ['https://example.com/persisted-research'],
      })
    );
  });

  it('rolls back the created course when synthetic source upload fails', async () => {
    const uploadError = new Error('disk unavailable');
    const { dependencies } = createDependencies({
      uploadDocument: vi.fn(() => Promise.reject(uploadError)),
    });

    await expect(
      createCourseFromPlaybook(instructorContext, { playbookId }, dependencies)
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });

    expect(dependencies.deleteCourse).toHaveBeenCalledWith(courseId);
    expect(dependencies.initiateGeneration).not.toHaveBeenCalled();
  });

  it('creates the course, persists synthetic documents, and starts generation', async () => {
    const { dependencies } = createDependencies();

    const result = await createCourseFromPlaybook(
      instructorContext,
      { playbookId, includeWebResearch: true },
      dependencies
    );

    expect(dependencies.insertCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Product Lead',
        slug: 'product-lead',
        courseDescription: expect.stringContaining('Mission: own platform product outcomes.'),
        targetAudience: 'lead Product Platform',
        courseSize: 'auto',
        generationMode: 'semi_automatic',
        settings: expect.objectContaining({
          clarifying_questions_enabled: true,
          clarifying_questions_skipped: false,
        }),
        sourceDocuments: expect.arrayContaining([
          expect.objectContaining({
            filename: 'career-playbook-product-lead.md',
            size: expect.any(Number),
            type: 'text/markdown',
          }),
          expect.objectContaining({
            filename: 'career-playbook-web-research-product-lead.md',
            size: expect.any(Number),
            type: 'text/markdown',
          }),
        ]),
      })
    );
    expect(dependencies.uploadDocument).toHaveBeenCalledTimes(2);
    expect(dependencies.initiateGeneration).toHaveBeenCalledWith({
      ctx: instructorContext,
      input: { courseId, webhookUrl: null },
    });
    expect(result).toMatchObject({
      success: true,
      courseId,
      redirectUrl: '/courses/acme/product-lead/generating',
      sourceDocumentIds: ['file-role-guide', 'file-web-kpis'],
      generationCode: 'GEN-123',
    });
  });

  it('rolls back the created course when generation initiation fails after uploads', async () => {
    const serviceUnavailable = new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Worker is not ready',
    });
    const { dependencies } = createDependencies({
      initiateGeneration: vi.fn(() => Promise.reject(serviceUnavailable)),
    });

    await expect(
      createCourseFromPlaybook(instructorContext, { playbookId }, dependencies)
    ).rejects.toBe(serviceUnavailable);

    expect(dependencies.uploadDocument).toHaveBeenCalled();
    expect(dependencies.deleteCourse).toHaveBeenCalledWith(courseId);
  });

  it('does not create a course when selected business-context source lookup fails', async () => {
    const { dependencies } = createDependencies({
      listBusinessContextSources: vi.fn(() => Promise.reject(new Error('source list unavailable'))),
    });

    await expect(
      createCourseFromPlaybook(
        instructorContext,
        { playbookId, includeBusinessContextSources: true },
        dependencies
      )
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    expect(dependencies.insertCourse).not.toHaveBeenCalled();
    expect(dependencies.deleteCourse).not.toHaveBeenCalled();
    expect(dependencies.uploadDocument).not.toHaveBeenCalled();
    expect(dependencies.initiateGeneration).not.toHaveBeenCalled();
  });

  it('does not create a course when selected business-context sources have no authoritative evidence', async () => {
    const { dependencies } = createDependencies({
      loadPlaybook: vi.fn(() => Promise.resolve(businessContextPlaybook())),
      loadBusinessContextSourceEvidence: vi.fn(() =>
        Promise.resolve({
          sourceExcerpts: [
            'Source evidence pack.',
            'Aggregate budget: 12000 estimated tokens across all selected sources.',
            '',
            '[Source 1: company-handbook.md]',
            'Status: uploaded. Processed text is not available yet.',
            'Do not infer facts from this file.',
          ].join('\n'),
          hasAuthoritativeEvidence: false,
          unavailableReason: 'no_authoritative_content',
        })
      ),
    });

    await expect(
      createCourseFromPlaybook(
        instructorContext,
        { playbookId, includeBusinessContextSources: true },
        dependencies
      )
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    expect(dependencies.insertCourse).not.toHaveBeenCalled();
    expect(dependencies.deleteCourse).not.toHaveBeenCalled();
    expect(dependencies.uploadDocument).not.toHaveBeenCalled();
    expect(dependencies.initiateGeneration).not.toHaveBeenCalled();
  });

  it('rejects non-completed playbooks before creating a course', async () => {
    const { dependencies } = createDependencies({
      loadPlaybook: vi.fn(() => Promise.resolve(completedPlaybook({ status: 'generating' }))),
    });

    await expect(
      createCourseFromPlaybook(instructorContext, { playbookId }, dependencies)
    ).rejects.toBeInstanceOf(TRPCError);

    expect(dependencies.insertCourse).not.toHaveBeenCalled();
  });

  it('rejects non-superadmin users when the playbook belongs to another organization', async () => {
    const { dependencies } = createDependencies({
      loadPlaybook: vi.fn(() =>
        Promise.resolve(
          completedPlaybook({
            organization_id: '99999999-9999-4999-8999-999999999999',
          })
        )
      ),
    });

    await expect(
      createCourseFromPlaybook(instructorContext, { playbookId }, dependencies)
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    expect(dependencies.insertCourse).not.toHaveBeenCalled();
  });

  it('reserves storage quota when persisting synthetic bridge markdown', async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    bridgeMocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });
    const markdown = '# Product Lead\n\nComplete role guide.';

    const result = await uploadSyntheticCourseBridgeDocument({
      courseId,
      organizationId: instructorContext.user!.organizationId,
      userId: instructorContext.user!.id,
      filename: 'career-playbook-product-lead.md',
      markdown,
      sourceUrls: [],
    });

    const expectedSize = Buffer.byteLength(markdown, 'utf8');
    expect(result.fileId).toEqual(expect.any(String));
    expect(bridgeMocks.incrementQuota).toHaveBeenCalledWith(
      instructorContext.user!.organizationId,
      expectedSize
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        course_id: courseId,
        file_size: expectedSize,
        filename: 'career-playbook-product-lead.md',
        processing_method: 'full_text',
      })
    );
    expect(bridgeMocks.decrementQuota).not.toHaveBeenCalled();
  });

  it('releases reserved quota when synthetic bridge markdown persistence fails', async () => {
    bridgeMocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ error: { message: 'insert failed' } })),
      })),
    });
    const markdown = '# Product Lead\n\nComplete role guide.';

    await expect(
      uploadSyntheticCourseBridgeDocument({
        courseId,
        organizationId: instructorContext.user!.organizationId,
        userId: instructorContext.user!.id,
        filename: 'career-playbook-product-lead.md',
        markdown,
        sourceUrls: [],
      })
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });

    expect(bridgeMocks.decrementQuota).toHaveBeenCalledWith(
      instructorContext.user!.organizationId,
      Buffer.byteLength(markdown, 'utf8')
    );
  });

  it('releases bridge document quota when rolling back a created course', async () => {
    const selectEq = vi.fn(() =>
      Promise.resolve({
        data: [
          {
            storage_path: `uploads/${instructorContext.user!.organizationId}/${courseId}/source.md`,
            file_size: 128,
            organization_id: instructorContext.user!.organizationId,
          },
          {
            storage_path: `uploads/${instructorContext.user!.organizationId}/${courseId}/research.md`,
            file_size: 256,
            organization_id: instructorContext.user!.organizationId,
          },
        ],
      })
    );
    const deleteEq = vi.fn(() => Promise.resolve({ error: null }));
    bridgeMocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'file_catalog') {
          return {
            select: vi.fn(() => ({ eq: selectEq })),
          };
        }
        if (table === 'courses') {
          return {
            delete: vi.fn(() => ({ eq: deleteEq })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    await deleteCareerPlaybookBridgeCourse(courseId);

    expect(bridgeMocks.decrementQuota).toHaveBeenCalledWith(
      instructorContext.user!.organizationId,
      128
    );
    expect(bridgeMocks.decrementQuota).toHaveBeenCalledWith(
      instructorContext.user!.organizationId,
      256
    );
  });

  it('keeps bridge document quota and files when course rollback delete fails', async () => {
    bridgeMocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'file_catalog') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                Promise.resolve({
                  data: [
                    {
                      storage_path: `uploads/${instructorContext.user!.organizationId}/${courseId}/source.md`,
                      file_size: 128,
                      organization_id: instructorContext.user!.organizationId,
                    },
                  ],
                })
              ),
            })),
          };
        }
        if (table === 'courses') {
          return {
            delete: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: { message: 'delete failed' } })),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    await deleteCareerPlaybookBridgeCourse(courseId);

    expect(bridgeMocks.unlink).not.toHaveBeenCalled();
    expect(bridgeMocks.decrementQuota).not.toHaveBeenCalled();
  });
});
