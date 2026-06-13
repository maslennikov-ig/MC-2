import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import {
  type CareerPlaybookBusinessContext,
  type CareerPlaybookBusinessContextSourceSummary,
  type CareerPlaybookQAData,
  type CourseSize,
  type CourseStyle,
  type Json,
  type Language,
} from '@megacampus/shared-types';
import type { Context, UserContext } from '../../trpc';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import {
  runCareerPlaybookWebResearch,
  type CareerPlaybookWebResearchResult,
} from '../../../stages/stage-career-playbook/rag/web-research';
import {
  loadCareerPlaybookBusinessContextSourceEvidence,
  type CareerPlaybookBusinessContextSourceEvidenceResult,
} from '../../../stages/stage-career-playbook/nodes/business-context';
import { initiateCourseGeneration } from '../generation/lifecycle/initiate.service';
import {
  mapPlaybookRow,
  normalizeStoredQAData,
  toJson,
  type CareerPlaybookRow,
  type CareerPlaybookSupabase,
} from './service-mappers';
import {
  buildCourseBridgeBrief,
  buildSlug,
  type CourseBridgeBrief,
  persistedWebResearch,
  renderCourseBridgeSourceDocuments,
} from './course-bridge-helpers';
import { listCareerPlaybookBusinessContextSourceSummaries } from './sources.service';
import {
  deleteCareerPlaybookBridgeCourse,
  uploadSyntheticCourseBridgeDocument,
  type UploadDocumentInput,
} from './course-bridge-storage';

export { deleteCareerPlaybookBridgeCourse, uploadSyntheticCourseBridgeDocument };

export { buildCourseBridgeBrief, renderCourseBridgeSourceDocuments };

interface PreviewCourseFromPlaybookInput {
  playbookId: string;
}

interface CourseBridgeOverrides {
  title?: string;
  courseDescription?: string;
  targetAudience?: string;
  learningOutcomes?: string[];
  language?: Language;
  courseSize?: CourseSize;
  style?: CourseStyle;
}

interface CreateCourseFromPlaybookInput {
  playbookId: string;
  includeWebResearch?: boolean;
  includeBusinessContextSources?: boolean;
  overrides?: CourseBridgeOverrides;
}

interface InsertCourseInput {
  userId: string;
  organizationId: string;
  title: string;
  slug: string;
  courseDescription: string;
  targetAudience: string;
  learningOutcomes: string[];
  language: Language;
  courseSize: CourseSize;
  style: CourseStyle;
  settings: Json;
}

interface InsertedCourse {
  id: string;
  slug: string;
  title: string;
}

export interface CourseBridgeDependencies {
  loadPlaybook: (playbookId: string, user: UserContext) => Promise<CareerPlaybookRow>;
  getOrganizationSlug: (organizationId: string) => Promise<string>;
  insertCourse: (input: InsertCourseInput) => Promise<InsertedCourse>;
  deleteCourse: (courseId: string) => Promise<void>;
  uploadDocument: (input: UploadDocumentInput) => Promise<{ fileId: string }>;
  listBusinessContextSources: (
    playbookId: string
  ) => Promise<CareerPlaybookBusinessContextSourceSummary[]>;
  loadBusinessContextSourceEvidence: (input: {
    playbookId?: string;
    context: CareerPlaybookBusinessContext;
    maxSources?: number;
    maxCharsPerSource?: number;
    maxAggregateTokens?: number;
  }) => Promise<CareerPlaybookBusinessContextSourceEvidenceResult>;
  runWebResearch: (qaData: CareerPlaybookQAData) => Promise<CareerPlaybookWebResearchResult>;
  initiateGeneration: typeof initiateCourseGeneration;
  now: () => Date;
}

function requireUser(ctx: Context): UserContext {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  return ctx.user;
}

function assertPlaybookAccess(playbook: CareerPlaybookRow, user: UserContext): void {
  if (user.role === 'superadmin') return;
  if (playbook.user_id === user.id && playbook.organization_id === user.organizationId) return;

  throw new TRPCError({ code: 'FORBIDDEN', message: 'Career Playbook access denied' });
}

function assertCompleted(playbook: CareerPlaybookRow): void {
  if (playbook.status === 'completed') return;

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Only completed Career Playbooks can be converted into courses',
  });
}

async function loadOwnedPlaybook(
  playbookId: string,
  user: UserContext
): Promise<CareerPlaybookRow> {
  const supabase = getSupabaseAdmin() as unknown as CareerPlaybookSupabase;
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('*')
    .eq('id', playbookId)
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
      cause: error,
    });
  }

  const playbook = mapPlaybookRow(data);
  assertPlaybookAccess(playbook, user);
  return playbook;
}

async function getOrganizationSlug(organizationId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', organizationId)
    .single();

  if (error || !data?.slug) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to resolve organization slug',
      cause: error,
    });
  }

  return data.slug;
}

async function insertCourse(input: InsertCourseInput): Promise<InsertedCourse> {
  const supabase = getSupabaseAdmin();
  const maxAttempts = 5;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const suffix = attempt === 0 ? undefined : randomUUID().replaceAll('-', '').slice(0, 8);
    const slug = buildSlug(input.slug, suffix);
    const { data: existingCourse } = await supabase
      .from('courses')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('slug', slug)
      .single();

    if (existingCourse) continue;

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('courses')
      .insert({
        title: input.title,
        slug,
        status: 'draft',
        user_id: input.userId,
        organization_id: input.organizationId,
        course_description: input.courseDescription,
        target_audience: input.targetAudience,
        learning_outcomes: input.learningOutcomes.join('\n'),
        language: input.language,
        course_size: input.courseSize,
        style: input.style,
        settings: input.settings,
        has_files: true,
        created_at: now,
        updated_at: now,
      })
      .select('id, slug, title')
      .single();

    if (!error && data) return data as InsertedCourse;
    lastError = error;
    if ((error as { code?: string } | null)?.code !== '23505') break;
  }

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to create course from Career Playbook',
    cause: lastError,
  });
}

function defaultDependencies(): CourseBridgeDependencies {
  return {
    loadPlaybook: loadOwnedPlaybook,
    getOrganizationSlug,
    insertCourse,
    deleteCourse: deleteCareerPlaybookBridgeCourse,
    uploadDocument: uploadSyntheticCourseBridgeDocument,
    listBusinessContextSources: listCareerPlaybookBusinessContextSourceSummaries,
    loadBusinessContextSourceEvidence: loadCareerPlaybookBusinessContextSourceEvidence,
    runWebResearch: runCareerPlaybookWebResearch,
    initiateGeneration: initiateCourseGeneration,
    now: () => new Date(),
  };
}

function settingsRecord(settings: Json): Record<string, unknown> {
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

function textOverride(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizedLearningOutcomes(value: string[] | undefined, fallback: string[]): string[] {
  const outcomes =
    value
      ?.map(item => item.trim())
      .filter((item): item is string => item.length > 0)
      .slice(0, 20) ?? [];
  return outcomes.length > 0 ? outcomes : fallback;
}

function applyCourseBridgeOverrides(
  brief: CourseBridgeBrief,
  overrides: CourseBridgeOverrides | undefined
): CourseBridgeBrief {
  if (!overrides) return brief;

  const title = textOverride(overrides.title, brief.title);
  const style = overrides.style ?? brief.style;

  return {
    ...brief,
    title,
    slugBase: buildSlug(title),
    courseDescription: textOverride(overrides.courseDescription, brief.courseDescription),
    targetAudience: textOverride(overrides.targetAudience, brief.targetAudience),
    learningOutcomes: normalizedLearningOutcomes(
      overrides.learningOutcomes,
      brief.learningOutcomes
    ),
    language: overrides.language ?? brief.language,
    courseSize: overrides.courseSize ?? brief.courseSize,
    style,
    settings: toJson({
      ...settingsRecord(brief.settings),
      style,
    }),
  };
}

function courseBridgeDraft(brief: CourseBridgeBrief) {
  return {
    title: brief.title,
    courseDescription: brief.courseDescription,
    targetAudience: brief.targetAudience,
    learningOutcomes: brief.learningOutcomes,
    language: brief.language,
    courseSize: brief.courseSize,
    style: brief.style,
  };
}

function resolveBusinessContextForBridge(
  playbook: CareerPlaybookRow,
  sources: CareerPlaybookBusinessContextSourceSummary[] = []
): CareerPlaybookBusinessContext {
  const context = normalizeStoredQAData(playbook.q_a_data).business_context;
  if (context.source_ids.length > 0) return context;

  const readySourceIds = sources
    .filter(source => source.status === 'ready')
    .map(source => source.id);
  if (readySourceIds.length === 0) return context;

  return {
    ...context,
    mode: 'company_specific',
    status: 'ready',
    source_ids: readySourceIds,
  };
}

function selectedBusinessContextSources(
  context: CareerPlaybookBusinessContext,
  sources: CareerPlaybookBusinessContextSourceSummary[]
): CareerPlaybookBusinessContextSourceSummary[] {
  const selectedIds = new Set(context.source_ids);
  return sources.filter(source => source.status === 'ready' && selectedIds.has(source.id));
}

async function resolveBusinessContextForCreate(
  playbook: CareerPlaybookRow,
  dependencies: CourseBridgeDependencies
): Promise<CareerPlaybookBusinessContext> {
  const context = normalizeStoredQAData(playbook.q_a_data).business_context;
  if (context.source_ids.length > 0) return context;

  const sources = await dependencies.listBusinessContextSources(playbook.id);
  return resolveBusinessContextForBridge(playbook, sources);
}

function throwBusinessContextSourcesUnavailable(): never {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Selected business context sources are unavailable. Retry without company context.',
  });
}

async function loadRequiredBusinessContextSourceExcerpts(
  playbook: CareerPlaybookRow,
  dependencies: CourseBridgeDependencies
): Promise<string> {
  try {
    const context = await resolveBusinessContextForCreate(playbook, dependencies);
    if (context.mode === 'universal' || context.source_ids.length === 0) {
      throwBusinessContextSourcesUnavailable();
    }

    const sourceEvidence = await dependencies.loadBusinessContextSourceEvidence({
      playbookId: playbook.id,
      context,
      maxSources: 8,
      maxCharsPerSource: 12_000,
      maxAggregateTokens: 12_000,
    });
    if (!sourceEvidence.hasAuthoritativeEvidence) throwBusinessContextSourcesUnavailable();
    return sourceEvidence.sourceExcerpts;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throwBusinessContextSourcesUnavailable();
  }
}

export async function previewCourseFromPlaybook(
  ctx: Context,
  input: PreviewCourseFromPlaybookInput,
  dependencies: CourseBridgeDependencies = defaultDependencies()
) {
  const user = requireUser(ctx);
  const playbook = await dependencies.loadPlaybook(input.playbookId, user);
  assertPlaybookAccess(playbook, user);
  assertCompleted(playbook);

  let businessContextSources: CareerPlaybookBusinessContextSourceSummary[] = [];
  try {
    businessContextSources = await dependencies.listBusinessContextSources(playbook.id);
  } catch {
    businessContextSources = [];
  }
  const businessContext = resolveBusinessContextForBridge(playbook, businessContextSources);
  const selectedSources = selectedBusinessContextSources(businessContext, businessContextSources);

  return {
    playbookId: playbook.id,
    brief: courseBridgeDraft(buildCourseBridgeBrief(playbook)),
    defaults: {
      includeWebResearch: false,
      includeBusinessContextSources: false,
    },
    sources: {
      roleGuide: {
        included: true,
      },
      webResearch: {
        available: Boolean(persistedWebResearch(playbook)),
        defaultIncluded: false,
      },
      businessContextSources: {
        available: selectedSources.length > 0,
        defaultIncluded: false,
        sourceCount: selectedSources.length,
        sources: selectedSources.map(source => ({
          id: source.id,
          filename: source.filename,
          status: source.status,
        })),
      },
    },
  };
}

export async function createCourseFromPlaybook(
  ctx: Context,
  input: CreateCourseFromPlaybookInput,
  dependencies: CourseBridgeDependencies = defaultDependencies()
) {
  const user = requireUser(ctx);
  const playbook = await dependencies.loadPlaybook(input.playbookId, user);
  assertPlaybookAccess(playbook, user);
  assertCompleted(playbook);

  const includeWebResearch = input.includeWebResearch ?? false;
  const includeBusinessContextSources = input.includeBusinessContextSources ?? false;
  const brief = applyCourseBridgeOverrides(buildCourseBridgeBrief(playbook), input.overrides);
  const orgSlug = await dependencies.getOrganizationSlug(user.organizationId);
  const course = await dependencies.insertCourse({
    userId: user.id,
    organizationId: user.organizationId,
    title: brief.title,
    slug: brief.slugBase,
    courseDescription: brief.courseDescription,
    targetAudience: brief.targetAudience,
    learningOutcomes: brief.learningOutcomes,
    language: brief.language,
    courseSize: brief.courseSize,
    style: brief.style,
    settings: toJson({
      ...settingsRecord(brief.settings),
      includeWebResearch,
      includeBusinessContextSources,
      style: brief.style,
    }),
  });

  const uploadedDocuments: Array<{ fileId: string }> = [];

  try {
    let research: CareerPlaybookWebResearchResult | null = null;
    if (includeWebResearch) {
      research = persistedWebResearch(playbook);
    }
    if (includeWebResearch && !research) {
      try {
        research = await dependencies.runWebResearch(normalizeStoredQAData(playbook.q_a_data));
      } catch (error) {
        research = {
          kpis_insights: [],
          trends_insights: [],
          onboarding_insights: [],
          sources: [],
          errors: [error instanceof Error ? error.message : String(error)],
        };
      }
    }
    const businessContextSourceExcerpts = includeBusinessContextSources
      ? await loadRequiredBusinessContextSourceExcerpts(playbook, dependencies)
      : null;

    const documents = renderCourseBridgeSourceDocuments({
      playbook,
      brief,
      research,
      includeWebResearch,
      businessContextSourceExcerpts,
    });

    for (const document of documents) {
      uploadedDocuments.push(
        await dependencies.uploadDocument({
          courseId: course.id,
          organizationId: user.organizationId,
          userId: user.id,
          filename: document.filename,
          markdown: document.markdown,
          sourceUrls: document.sourceUrls,
        })
      );
    }

    const generation = await dependencies.initiateGeneration({
      ctx,
      input: { courseId: course.id, webhookUrl: null },
    });

    return {
      success: true as const,
      courseId: course.id,
      redirectUrl: `/courses/${orgSlug}/${course.slug}/generating`,
      sourceDocumentIds: uploadedDocuments.map(document => document.fileId),
      generationCode: generation.generationCode,
    };
  } catch (error) {
    await dependencies.deleteCourse(course.id);
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create course from Career Playbook',
      cause: error,
    });
  }
}
