import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { type CareerPlaybookQAData, type Json, type Language } from '@megacampus/shared-types';
import type { Context, UserContext } from '../../trpc';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import {
  runCareerPlaybookWebResearch,
  type CareerPlaybookWebResearchResult,
} from '../../../stages/stage-career-playbook/rag/web-research';
import { initiateCourseGeneration } from '../generation/lifecycle/initiate.service';
import {
  mapPlaybookRow,
  normalizeStoredQAData,
  type CareerPlaybookRow,
  type CareerPlaybookSupabase,
} from './service-mappers';
import {
  buildCourseBridgeBrief,
  buildSlug,
  persistedWebResearch,
  renderCourseBridgeSourceDocuments,
} from './course-bridge-helpers';
import {
  deleteCareerPlaybookBridgeCourse,
  uploadSyntheticCourseBridgeDocument,
  type UploadDocumentInput,
} from './course-bridge-storage';

export { deleteCareerPlaybookBridgeCourse, uploadSyntheticCourseBridgeDocument };

export { buildCourseBridgeBrief, renderCourseBridgeSourceDocuments };

interface CreateCourseFromPlaybookInput {
  playbookId: string;
  includeWebResearch?: boolean;
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
  courseSize: string;
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
    runWebResearch: runCareerPlaybookWebResearch,
    initiateGeneration: initiateCourseGeneration,
    now: () => new Date(),
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

  const includeWebResearch = input.includeWebResearch ?? true;
  const brief = buildCourseBridgeBrief(playbook);
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
    settings: {
      ...(brief.settings && typeof brief.settings === 'object' && !Array.isArray(brief.settings)
        ? brief.settings
        : {}),
      includeWebResearch,
    } as Json,
  });

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

  const documents = renderCourseBridgeSourceDocuments({
    playbook,
    brief,
    research,
    includeWebResearch,
  });
  const uploadedDocuments: Array<{ fileId: string }> = [];

  try {
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
