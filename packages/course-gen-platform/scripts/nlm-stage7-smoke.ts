import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { appRouter } from '../src/server/app-router';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';

type SupportedType = 'nlm_audio' | 'nlm_video';

type ParsedArgs = {
  lessonId?: string;
  userId?: string;
  orgId?: string;
  type: SupportedType;
  timeoutSeconds: number;
  pollIntervalSeconds: number;
  regenerateIfExists: boolean;
};

type LessonCandidate = {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  courseOwnerId: string;
  courseOrganizationId: string;
  language: string;
};

type UserRow = {
  id: string;
  email: string;
  role: string;
  organization_id: string;
};

function printUsage(): void {
  console.log(`Usage: pnpm --filter @megacampus/course-gen-platform tsx scripts/nlm-stage7-smoke.ts [options]

Options:
  --lesson-id <uuid>              Lesson UUID (optional; auto-selects a real lesson by default)
  --user-id <uuid>                User UUID for API context (optional; auto-select by lesson org)
  --org-id <uuid>                 Preferred organization UUID for auto-selection
  --type <nlm_audio|nlm_video>    Enrichment type (default: nlm_audio)
  --timeout-seconds <number>      Max wait time for completion (default: 3600)
  --poll-interval-seconds <n>     Poll interval for status checks (default: 5)
  --no-regenerate-if-exists       Do not call regenerate when enrichment already exists
  -h, --help                      Show help
`);
}

function parseNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return parsed;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    type: 'nlm_audio',
    timeoutSeconds: 3600,
    pollIntervalSeconds: 5,
    regenerateIfExists: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--lesson-id':
        if (!next) throw new Error('--lesson-id requires a value');
        args.lessonId = next;
        i += 1;
        break;
      case '--user-id':
        if (!next) throw new Error('--user-id requires a value');
        args.userId = next;
        i += 1;
        break;
      case '--org-id':
        if (!next) throw new Error('--org-id requires a value');
        args.orgId = next;
        i += 1;
        break;
      case '--type':
        if (!next) throw new Error('--type requires a value');
        if (next !== 'nlm_audio' && next !== 'nlm_video') {
          throw new Error('--type must be one of: nlm_audio, nlm_video');
        }
        args.type = next;
        i += 1;
        break;
      case '--timeout-seconds':
        if (!next) throw new Error('--timeout-seconds requires a value');
        args.timeoutSeconds = parseNumber(next, '--timeout-seconds');
        i += 1;
        break;
      case '--poll-interval-seconds':
        if (!next) throw new Error('--poll-interval-seconds requires a value');
        args.pollIntervalSeconds = parseNumber(next, '--poll-interval-seconds');
        i += 1;
        break;
      case '--no-regenerate-if-exists':
        args.regenerateIfExists = false;
        break;
      case '--':
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function unwrapRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null;
  }
  if (value && typeof value === 'object') {
    return value as T;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildOnDemandSettings(type: SupportedType): Record<string, unknown> {
  if (type === 'nlm_audio') {
    return {
      nlm_source_strategy: 'hybrid',
      nlm_audio_format: 'brief',
      nlm_audio_length: 'short',
    };
  }

  return {
    nlm_source_strategy: 'hybrid',
    nlm_video_format: 'brief',
    nlm_video_style: 'auto_select',
  };
}

async function resolveLesson(
  lessonId: string | undefined,
  preferredOrgId: string | undefined
): Promise<LessonCandidate> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('lessons')
    .select(
      'id, title, sections!inner(course_id, courses!inner(id, title, user_id, organization_id, language))'
    );

  if (lessonId) {
    query = query.eq('id', lessonId).limit(1);
  } else {
    query = query.order('updated_at', { ascending: false }).limit(200);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    throw new Error(
      `Failed to resolve lesson${lessonId ? ` ${lessonId}` : ''}: ${error?.message || 'not found'}`
    );
  }

  const normalized: LessonCandidate[] = data
    .map(row => {
      const section = unwrapRelation<{ course_id: string; courses: unknown }>(row.sections);
      const course = unwrapRelation<{
        id: string;
        title: string | null;
        user_id: string;
        organization_id: string;
        language: string | null;
      }>(section?.courses);

      if (!section || !course) {
        return null;
      }

      return {
        id: row.id,
        title: row.title || 'Untitled lesson',
        courseId: section.course_id,
        courseTitle: course.title || 'Untitled course',
        courseOwnerId: course.user_id,
        courseOrganizationId: course.organization_id,
        language: course.language || 'en',
      } satisfies LessonCandidate;
    })
    .filter((value): value is LessonCandidate => value !== null);

  if (normalized.length === 0) {
    throw new Error('Could not resolve lesson candidates with course relation');
  }

  if (lessonId) {
    return normalized[0];
  }

  if (preferredOrgId) {
    const sameOrg = normalized.find(item => item.courseOrganizationId === preferredOrgId);
    if (sameOrg) {
      return sameOrg;
    }
  }

  return normalized[0];
}

async function resolveUser(args: ParsedArgs, lesson: LessonCandidate): Promise<UserRow> {
  const supabase = getSupabaseAdmin();

  if (args.userId) {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, role, organization_id')
      .eq('id', args.userId)
      .single();

    if (error || !data) {
      throw new Error(`Failed to load user ${args.userId}: ${error?.message || 'not found'}`);
    }

    return data as UserRow;
  }

  const targetOrg = args.orgId || lesson.courseOrganizationId;
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, organization_id')
    .eq('organization_id', targetOrg)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    throw new Error(
      `Failed to auto-select user in organization ${targetOrg}: ${error?.message || 'not found'}`
    );
  }

  return data[0] as UserRow;
}

async function findExistingEnrichmentId(
  lessonId: string,
  type: SupportedType
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('lesson_enrichments')
    .select('id, status')
    .eq('lesson_id', lessonId)
    .eq('enrichment_type', type)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to find existing enrichment: ${error.message}`);
  }

  return data?.[0]?.id ?? null;
}

async function main(): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const scriptDir = path.dirname(currentFile);
  const repoRoot = path.resolve(scriptDir, '../../..');

  loadDotenv({ path: path.join(repoRoot, '.env.local') });
  loadDotenv({ path: path.join(repoRoot, 'packages/course-gen-platform/.env') });

  const args = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const reportsDir = path.join(repoRoot, 'logs', 'nlm-stage7-smoke');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `${runId}.json`);

  const report: Record<string, unknown> = {
    runId,
    startedAt: nowIso(),
    args,
  };

  const lesson = await resolveLesson(args.lessonId, args.orgId);
  const user = await resolveUser(args, lesson);

  report.lesson = lesson;
  report.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id,
  };

  console.log(
    `[stage7-smoke] Using lesson "${lesson.title}" (${lesson.id}), course "${lesson.courseTitle}" (${lesson.courseId})`
  );

  console.log(
    `[stage7-smoke] Acting as user ${user.email} (${user.id}), org ${user.organization_id}, type=${args.type}`
  );

  const caller = appRouter.createCaller({
    user: {
      id: user.id,
      email: user.email,
      role: user.role as never,
      organizationId: user.organization_id,
    },
    req: new Request('http://local.stage7-smoke/internal'),
  });

  const mutationInput = {
    lessonId: lesson.id,
    enrichmentType: args.type,
    settings: buildOnDemandSettings(args.type),
  } as const;

  let enrichmentId: string | null = null;
  let startMode = 'generateOnDemand';

  try {
    const created = await caller.enrichment.generateOnDemand(mutationInput);
    enrichmentId = created.enrichmentId;
    report.generateOnDemand = created;

    console.log(`[stage7-smoke] Created enrichment ${enrichmentId}, status=${created.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.generateOnDemandError = message;

    const existingId = await findExistingEnrichmentId(lesson.id, args.type);
    if (!existingId) {
      throw new Error(`generateOnDemand failed and no existing enrichment found: ${message}`);
    }

    enrichmentId = existingId;
    startMode = 'existing';

    console.log(
      `[stage7-smoke] generateOnDemand returned error; reusing existing enrichment ${enrichmentId}`
    );

    if (args.regenerateIfExists) {
      const regen = await caller.enrichment.regenerate({ enrichmentId });
      report.regenerate = regen;
      startMode = 'regenerate';

      console.log(`[stage7-smoke] Regeneration started for enrichment ${enrichmentId}`);
    }
  }

  if (!enrichmentId) {
    throw new Error('Could not resolve enrichment ID');
  }

  report.enrichmentId = enrichmentId;
  report.startMode = startMode;

  const statusTimeline: Array<Record<string, unknown>> = [];
  const timeoutAt = Date.now() + args.timeoutSeconds * 1000;
  let finalStatus: string | null = null;
  let failedError: string | null = null;
  let lastStatus: string | null = null;

  while (Date.now() < timeoutAt) {
    const status = await caller.enrichment.getGenerationStatus({ enrichmentId });
    const stamp = {
      at: nowIso(),
      status: status.status,
      progress: status.progress,
      step: status.currentStep,
      estimatedTimeRemaining: status.estimatedTimeRemaining ?? null,
      error: status.error ?? null,
    };
    statusTimeline.push(stamp);

    if (status.status !== lastStatus) {
      console.log(
        `[stage7-smoke] status=${status.status}, progress=${status.progress}, step=${status.currentStep}`
      );
      lastStatus = status.status;
    }

    if (status.status === 'completed') {
      finalStatus = status.status;
      break;
    }

    if (status.status === 'failed' || status.status === 'cancelled') {
      finalStatus = status.status;
      failedError = status.error ?? null;
      break;
    }

    await sleep(args.pollIntervalSeconds * 1000);
  }

  report.timeline = statusTimeline;
  report.finalStatus = finalStatus;
  report.failedError = failedError;

  if (!finalStatus) {
    report.finishedAt = nowIso();
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    throw new Error(
      `Timed out waiting for completion after ${args.timeoutSeconds}s. Report: ${reportPath}`
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: enrichmentRow, error: enrichmentError } = await supabase
    .from('lesson_enrichments')
    .select('id, status, enrichment_type, asset_id, error_message, generation_attempt, updated_at')
    .eq('id', enrichmentId)
    .single();

  if (enrichmentError || !enrichmentRow) {
    throw new Error(`Failed to load enrichment row ${enrichmentId}: ${enrichmentError?.message}`);
  }

  report.enrichmentRow = enrichmentRow;

  if (enrichmentRow.asset_id) {
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('id, file_path, mime_type, size_bytes, metadata')
      .eq('id', enrichmentRow.asset_id)
      .single();

    if (!assetError && asset) {
      report.asset = asset;

      if (typeof asset.file_path === 'string' && asset.file_path.length > 0) {
        const pathCandidates = [
          process.env.ENRICHMENTS_LOCAL_PATH,
          path.join(repoRoot, 'data', 'enrichments'),
          '/app/data/enrichments',
        ].filter((value): value is string => !!value);

        const existingLocalPath = await (async () => {
          for (const basePath of pathCandidates) {
            const absolute = path.isAbsolute(asset.file_path)
              ? asset.file_path
              : path.join(basePath, asset.file_path);
            try {
              await fs.access(absolute);
              return absolute;
            } catch {
              // continue
            }
          }
          return null;
        })();

        report.localFilePath = existingLocalPath;
      }
    }
  }

  try {
    const playback = await caller.enrichment.getPlaybackUrl({ enrichmentId });
    report.playback = playback;
  } catch (error) {
    report.playbackError = error instanceof Error ? error.message : String(error);
  }

  report.finishedAt = nowIso();
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[stage7-smoke] Final status: ${finalStatus}`);
  if (report.playback && typeof report.playback === 'object') {
    const playback = report.playback as { url?: string | null };

    console.log(`[stage7-smoke] Playback URL: ${playback.url || 'null'}`);
  }
  if (report.localFilePath && typeof report.localFilePath === 'string') {
    console.log(`[stage7-smoke] Local file: ${report.localFilePath}`);
  }

  console.log(`[stage7-smoke] Report: ${reportPath}`);

  if (finalStatus !== 'completed') {
    throw new Error(`Stage7 smoke finished with status=${finalStatus}. Report: ${reportPath}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(
      `[stage7-smoke] ERROR: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
