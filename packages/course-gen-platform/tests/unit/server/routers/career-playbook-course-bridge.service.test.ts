import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/server/trpc';
import {
  buildCourseBridgeBrief,
  createCourseFromPlaybook,
  renderCourseBridgeSourceDocuments,
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

function createDependencies(overrides: Partial<CourseBridgeDependencies> = {}) {
  const uploadedIds: string[] = [];
  const dependencies: CourseBridgeDependencies = {
    loadPlaybook: vi.fn(async () => completedPlaybook()),
    getOrganizationSlug: vi.fn(async () => 'acme'),
    insertCourse: vi.fn(async input => ({
      id: courseId,
      slug: input.slug,
      title: input.title,
    })),
    deleteCourse: vi.fn(async () => undefined),
    uploadDocument: vi.fn(async input => {
      const id = input.filename.includes('web-research') ? 'file-web-kpis' : 'file-role-guide';
      uploadedIds.push(id);
      return { fileId: id };
    }),
    runWebResearch: vi.fn(async () => ({
      kpis_insights: ['Activation and retention are common product lead KPIs.'],
      trends_insights: ['AI-assisted product discovery is becoming standard.'],
      onboarding_insights: ['First 30 days should cover rituals and stakeholders.'],
      sources: ['https://example.com/product-lead-kpis'],
      errors: [],
    })),
    initiateGeneration: vi.fn(async () => ({
      success: true,
      jobId: 'job-1',
      message: 'Генерация курса инициализирована',
      courseId,
      generationCode: 'GEN-123',
    })),
    now: () => new Date('2026-05-19T10:00:00.000Z'),
    ...overrides,
  };

  return { dependencies, uploadedIds };
}

describe('course bridge service', () => {
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

  it('creates fallback source markdown when web research is unavailable', async () => {
    const { dependencies } = createDependencies({
      loadPlaybook: vi.fn(async () => completedPlaybook({ role_profile_spec: null })),
      runWebResearch: vi.fn(async () => ({
        kpis_insights: [],
        trends_insights: [],
        onboarding_insights: [],
        sources: [],
        errors: ['TAVILY_API_KEY is not configured'],
      })),
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
    expect(documents[1]!.markdown).toContain('https://example.com/product-lead-kpis');
    expect(documents[1]!.markdown).toContain('Activation and retention');
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
      loadPlaybook: vi.fn(async () => completedPlaybook({ web_research: persistedResearch })),
      runWebResearch: vi.fn(async () => {
        throw new Error('external lookup should not run');
      }),
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
      uploadDocument: vi.fn(async () => {
        throw uploadError;
      }),
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
      initiateGeneration: vi.fn(async () => {
        throw serviceUnavailable;
      }),
    });

    await expect(
      createCourseFromPlaybook(instructorContext, { playbookId }, dependencies)
    ).rejects.toBe(serviceUnavailable);

    expect(dependencies.uploadDocument).toHaveBeenCalled();
    expect(dependencies.deleteCourse).toHaveBeenCalledWith(courseId);
  });

  it('rejects non-completed playbooks before creating a course', async () => {
    const { dependencies } = createDependencies({
      loadPlaybook: vi.fn(async () => completedPlaybook({ status: 'generating' })),
    });

    await expect(
      createCourseFromPlaybook(instructorContext, { playbookId }, dependencies)
    ).rejects.toBeInstanceOf(TRPCError);

    expect(dependencies.insertCourse).not.toHaveBeenCalled();
  });

  it('rejects non-superadmin users when the playbook belongs to another organization', async () => {
    const { dependencies } = createDependencies({
      loadPlaybook: vi.fn(async () =>
        completedPlaybook({
          organization_id: '99999999-9999-4999-8999-999999999999',
        })
      ),
    });

    await expect(
      createCourseFromPlaybook(instructorContext, { playbookId }, dependencies)
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    expect(dependencies.insertCourse).not.toHaveBeenCalled();
  });
});
