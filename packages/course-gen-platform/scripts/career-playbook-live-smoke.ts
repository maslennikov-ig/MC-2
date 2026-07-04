import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/server/app-router';
import {
  type CareerPlaybookCleanupManifest,
  type CareerPlaybookCleanupScope,
  type CareerPlaybookLiveSmokeClient,
  type CareerPlaybookLiveSmokeMode,
  type CareerPlaybookLiveSmokeReport,
  type CareerPlaybookLiveSmokeTarget,
  formatCareerPlaybookLiveSmokeReport,
  runCareerPlaybookLiveSmoke,
} from '../src/smoke/career-playbook-live-smoke';

interface ParsedArgs {
  mode: CareerPlaybookLiveSmokeMode;
  targetEnvironment?: CareerPlaybookLiveSmokeTarget;
  trpcUrl?: string;
  expectedUserId?: string;
  expectedOrganizationId?: string;
  queueName?: string;
  cleanupScope?: CareerPlaybookCleanupScope;
  maxCostUsd?: number;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  resumePlaybookId?: string;
  confirmLiveMutation: boolean;
  includeCourseBridge: boolean;
  noArtifact: boolean;
  artifactDir?: string;
  json: boolean;
}

const TARGETS = ['local', 'development', 'dev', 'staging', 'production', 'prod'] as const;
const CLEANUP_SCOPES = ['playbook-only', 'playbook-and-course'] as const;

// --- Live-smoke artifact persistence (mc2-db696.104.5) ---------------------
// The runner snapshots what it validated (final_markdown + cost_breakdown +
// timings + evidence) into a gitignored artifacts dir so future A/B runs can
// compare content quality even after the source DB row is deleted. Only the
// whitelisted fields below are written: the bearer token, Supabase service key,
// and process env are never serialized into an artifact.

export const CAREER_PLAYBOOK_SMOKE_ARTIFACT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../artifacts/career-playbook-smoke'
);

type CareerPlaybookSmokeMarkdownSource = 'trpc-library-detail' | 'supabase-row' | 'none';
type CareerPlaybookSmokeCostSource = 'supabase-row' | 'unavailable';

export interface CareerPlaybookSmokeArtifactTimings {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  dbCreatedAt?: string | null;
  dbCompletedAt?: string | null;
}

export interface CareerPlaybookSmokeArtifactInput {
  generatedAt: string;
  report: CareerPlaybookLiveSmokeReport;
  finalMarkdown: string | null;
  finalMarkdownSource: CareerPlaybookSmokeMarkdownSource;
  costBreakdown: unknown;
  costSource: CareerPlaybookSmokeCostSource;
  language: string | null;
  timings: CareerPlaybookSmokeArtifactTimings;
}

export interface CareerPlaybookSmokeArtifactMeta {
  schemaVersion: 1;
  generatedAt: string;
  mode: CareerPlaybookLiveSmokeMode;
  targetEnvironment: CareerPlaybookLiveSmokeTarget;
  runStatus: CareerPlaybookLiveSmokeReport['status'];
  playbookId: string;
  courseId?: string;
  language: string | null;
  timings: CareerPlaybookSmokeArtifactTimings;
  costBreakdown: unknown;
  costSource: CareerPlaybookSmokeCostSource;
  finalMarkdownFile: string;
  finalMarkdownBytes: number;
  finalMarkdownSource: CareerPlaybookSmokeMarkdownSource;
  evidence: {
    status: string;
    checks: { id: string; status: string; note: string }[];
  } | null;
  cleanupManifest: CareerPlaybookCleanupManifest | null;
}

export interface CareerPlaybookSmokeArtifactFiles {
  markdownFileName: string;
  jsonFileName: string;
  markdown: string;
  json: string;
  meta: CareerPlaybookSmokeArtifactMeta;
}

function artifactBaseName(generatedAt: string, playbookId: string): string {
  // Colons and dots are not portable in filenames; keep the rest of the ISO
  // stamp so artifacts sort chronologically next to their playbook id.
  const stamp = generatedAt.replace(/[:.]/g, '-');
  return `${stamp}-${playbookId}`;
}

export function buildCareerPlaybookSmokeArtifact(
  input: CareerPlaybookSmokeArtifactInput
): CareerPlaybookSmokeArtifactFiles {
  const playbookId = input.report.playbookId ?? 'unknown-playbook';
  const base = artifactBaseName(input.generatedAt, playbookId);
  const markdownFileName = `${base}.md`;
  const jsonFileName = `${base}.json`;

  const hasMarkdown =
    typeof input.finalMarkdown === 'string' && input.finalMarkdown.trim().length > 0;
  const markdown = hasMarkdown
    ? (input.finalMarkdown as string)
    : `<!-- Career Playbook live smoke: no final_markdown captured for ${playbookId} ` +
      `(source=${input.finalMarkdownSource}, runStatus=${input.report.status}) -->\n`;

  const meta: CareerPlaybookSmokeArtifactMeta = {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    mode: input.report.mode,
    targetEnvironment: input.report.targetEnvironment,
    runStatus: input.report.status,
    playbookId,
    courseId: input.report.courseId,
    language: input.language,
    timings: input.timings,
    costBreakdown: input.costBreakdown ?? null,
    costSource: input.costSource,
    finalMarkdownFile: markdownFileName,
    finalMarkdownBytes: Buffer.byteLength(markdown, 'utf8'),
    finalMarkdownSource: input.finalMarkdownSource,
    evidence: input.report.evidence
      ? {
          status: input.report.evidence.status,
          checks: input.report.evidence.checks.map(check => ({
            id: check.id,
            status: check.status,
            note: check.note,
          })),
        }
      : null,
    cleanupManifest: input.report.cleanupManifest ?? null,
  };

  return {
    markdownFileName,
    jsonFileName,
    markdown,
    json: JSON.stringify(meta, null, 2),
    meta,
  };
}

export async function writeCareerPlaybookSmokeArtifact(
  files: CareerPlaybookSmokeArtifactFiles,
  baseDir: string
): Promise<{ markdownPath: string; jsonPath: string }> {
  await fs.mkdir(baseDir, { recursive: true });
  const markdownPath = path.join(baseDir, files.markdownFileName);
  const jsonPath = path.join(baseDir, files.jsonFileName);
  await fs.writeFile(markdownPath, files.markdown, 'utf8');
  await fs.writeFile(jsonPath, `${files.json}\n`, 'utf8');
  return { markdownPath, jsonPath };
}

interface CareerPlaybookRowSnapshot {
  finalMarkdown: string | null;
  costBreakdown: unknown;
  language: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

// cost_breakdown is not exposed by any tRPC surface, so read it (and use the DB
// row as a final_markdown fallback) directly. Best-effort: if Supabase admin env
// is absent or the read fails, the artifact still captures everything available
// from tRPC and records costSource='unavailable'.
async function loadCareerPlaybookRowSnapshot(
  playbookId: string
): Promise<CareerPlaybookRowSnapshot | null> {
  try {
    const { getSupabaseAdmin } = await import('../src/shared/supabase/admin');
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('career_playbooks')
      .select('final_markdown,cost_breakdown,language,created_at,completed_at')
      .eq('id', playbookId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      final_markdown: string | null;
      cost_breakdown: unknown;
      language: string | null;
      created_at: string | null;
      completed_at: string | null;
    };
    return {
      finalMarkdown: row.final_markdown ?? null,
      costBreakdown: row.cost_breakdown ?? null,
      language: row.language ?? null,
      createdAt: row.created_at ?? null,
      completedAt: row.completed_at ?? null,
    };
  } catch {
    return null;
  }
}

export interface CaptureCareerPlaybookSmokeArtifactArgs {
  report: CareerPlaybookLiveSmokeReport;
  client?: CareerPlaybookLiveSmokeClient;
  timings: Omit<CareerPlaybookSmokeArtifactTimings, 'dbCreatedAt' | 'dbCompletedAt'>;
  baseDir?: string;
  now?: () => Date;
}

export async function captureCareerPlaybookSmokeArtifact(
  args: CaptureCareerPlaybookSmokeArtifactArgs
): Promise<{ markdownPath: string; jsonPath: string } | null> {
  const playbookId = args.report.playbookId;
  if (!playbookId) return null;

  const row = await loadCareerPlaybookRowSnapshot(playbookId);

  // Prefer the tRPC library detail (what the UI actually renders); fall back to
  // the DB row so an artifact is still written when the client is unavailable.
  let finalMarkdown: string | null = null;
  let finalMarkdownSource: CareerPlaybookSmokeMarkdownSource = 'none';
  if (args.client) {
    try {
      const detail = await args.client.getLibraryDetail({ playbookId });
      if (typeof detail.finalMarkdown === 'string') {
        finalMarkdown = detail.finalMarkdown;
        finalMarkdownSource = 'trpc-library-detail';
      }
    } catch {
      // fall through to the DB snapshot below
    }
  }
  if (finalMarkdown === null && row?.finalMarkdown) {
    finalMarkdown = row.finalMarkdown;
    finalMarkdownSource = 'supabase-row';
  }

  const costBreakdown = row?.costBreakdown ?? null;
  const costSource: CareerPlaybookSmokeCostSource =
    costBreakdown !== null ? 'supabase-row' : 'unavailable';

  const files = buildCareerPlaybookSmokeArtifact({
    generatedAt: (args.now ?? (() => new Date()))().toISOString(),
    report: args.report,
    finalMarkdown,
    finalMarkdownSource,
    costBreakdown,
    costSource,
    language: row?.language ?? null,
    timings: {
      ...args.timings,
      dbCreatedAt: row?.createdAt ?? null,
      dbCompletedAt: row?.completedAt ?? null,
    },
  });

  return writeCareerPlaybookSmokeArtifact(
    files,
    args.baseDir ?? CAREER_PLAYBOOK_SMOKE_ARTIFACT_DIR
  );
}

function printUsage(): void {
  console.log(`Usage: pnpm --dir packages/course-gen-platform smoke:career-playbook:live [options]

Options:
  --mode <plan|mutation-smoke>            Runner mode (default: plan)
  --target <local|development|dev|staging|production|prod>
                                           Target environment label
  --trpc-url <url>                         Backend tRPC URL, for example https://api.example.com/trpc
  --expected-user-id <uuid>                Disposable user id expected in staging
  --expected-organization-id <uuid>        Disposable organization id expected in staging
  --queue <name>                           Dedicated BULLMQ_QUEUE_NAME used by API and worker
  --cleanup-scope <playbook-only|playbook-and-course>
                                           Exact cleanup scope after evidence capture
  --max-cost-usd <number>                  Numeric API/LLM budget cap for this run
  --poll-timeout-ms <number>               Max wait time for generated artifacts (default: 2700000)
  --poll-interval-ms <number>              Poll interval while waiting (default: 5000)
  --resume-playbook-id <uuid>              Resume post-generation evidence capture for an existing playbook
  --confirm-live-mutation                  Required for mutation-smoke
  --include-course-bridge                  Also create the bridge course; requires cleanup coverage
  --no-artifact                            Skip writing the final_markdown + cost_breakdown artifact
  --artifact-dir <path>                    Override the artifacts output directory
  --json                                   Print JSON report
  -h, --help                               Show help

Default plan mode does not call tRPC, enqueue jobs, start workers, write Supabase rows,
clean Redis, or call LLMs. Mutation mode reads the bearer token from TOKEN or
CAREER_PLAYBOOK_SMOKE_TOKEN; do not pass secrets as CLI arguments because package
managers can echo them. Mutation mode should only be used with disposable staging
fixtures, a dedicated queue, cleanup authorization, and a budget.`);
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseTarget(value: string): CareerPlaybookLiveSmokeTarget {
  if ((TARGETS as readonly string[]).includes(value)) return value as CareerPlaybookLiveSmokeTarget;
  throw new Error('--target must be local, development, dev, staging, production, or prod');
}

function parseCleanupScope(value: string): CareerPlaybookCleanupScope {
  if ((CLEANUP_SCOPES as readonly string[]).includes(value)) {
    return value as CareerPlaybookCleanupScope;
  }
  throw new Error('--cleanup-scope must be playbook-only or playbook-and-course');
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    mode: 'plan',
    confirmLiveMutation: false,
    includeCourseBridge: false,
    noArtifact: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--mode': {
        const value = readValue(argv, index, arg);
        if (value !== 'plan' && value !== 'mutation-smoke') {
          throw new Error('--mode must be plan or mutation-smoke');
        }
        parsed.mode = value;
        index += 1;
        break;
      }
      case '--target':
        parsed.targetEnvironment = parseTarget(readValue(argv, index, arg));
        index += 1;
        break;
      case '--trpc-url':
        parsed.trpcUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case '--expected-user-id':
        parsed.expectedUserId = readValue(argv, index, arg);
        index += 1;
        break;
      case '--expected-organization-id':
        parsed.expectedOrganizationId = readValue(argv, index, arg);
        index += 1;
        break;
      case '--queue':
        parsed.queueName = readValue(argv, index, arg);
        index += 1;
        break;
      case '--cleanup-scope':
        parsed.cleanupScope = parseCleanupScope(readValue(argv, index, arg));
        index += 1;
        break;
      case '--max-cost-usd': {
        const value = Number(readValue(argv, index, arg));
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error('--max-cost-usd must be a positive number');
        }
        parsed.maxCostUsd = value;
        index += 1;
        break;
      }
      case '--poll-timeout-ms': {
        const value = Number(readValue(argv, index, arg));
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error('--poll-timeout-ms must be a positive number');
        }
        parsed.pollTimeoutMs = value;
        index += 1;
        break;
      }
      case '--poll-interval-ms': {
        const value = Number(readValue(argv, index, arg));
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error('--poll-interval-ms must be a positive number');
        }
        parsed.pollIntervalMs = value;
        index += 1;
        break;
      }
      case '--resume-playbook-id':
        parsed.resumePlaybookId = readValue(argv, index, arg);
        index += 1;
        break;
      case '--confirm-live-mutation':
        parsed.confirmLiveMutation = true;
        break;
      case '--include-course-bridge':
        parsed.includeCourseBridge = true;
        break;
      case '--no-artifact':
        parsed.noArtifact = true;
        break;
      case '--artifact-dir':
        parsed.artifactDir = readValue(argv, index, arg);
        index += 1;
        break;
      case '--json':
        parsed.json = true;
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

  return parsed;
}

function createTrpcLiveSmokeClient(trpcUrl: string, token: string): CareerPlaybookLiveSmokeClient {
  const trpc = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: trpcUrl,
        headers() {
          return {
            Authorization: `Bearer ${token}`,
          };
        },
      }),
    ],
  });

  return {
    startSession: input => trpc.careerPlaybook.session.start.mutate(input),
    submitAnswer: input => trpc.careerPlaybook.session.submitAnswer.mutate(input),
    requestFollowups: input => trpc.careerPlaybook.generation.requestFollowups.mutate(input),
    approveAndGenerate: input => trpc.careerPlaybook.generation.approveAndGenerate.mutate(input),
    getStatus: input => trpc.careerPlaybook.generation.getStatus.query(input),
    getLibraryDetail: input => trpc.careerPlaybook.library.get.query(input),
    exportPdf: input => trpc.careerPlaybook.exportPdf.query(input),
    toggleShare: input => trpc.careerPlaybook.share.shareToggle.mutate(input),
    getPublicShare: input => trpc.careerPlaybook.share.getPublicBySlug.query(input),
    createCourseFromPlaybook: input =>
      trpc.careerPlaybook.courseBridge.createCourseFromPlaybook.mutate(input),
    getCourseStatus: input => trpc.generation.getStatus.query(input),
  };
}

function exitCodeFor(status: string): number {
  if (status === 'pass' || status === 'warn') return 0;
  if (status === 'blocked') return 2;
  return 1;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.TOKEN ?? process.env.CAREER_PLAYBOOK_SMOKE_TOKEN;
  const trpcUrl = args.trpcUrl ?? process.env.CAREER_PLAYBOOK_SMOKE_TRPC_URL;
  const client =
    args.mode === 'mutation-smoke' && token && trpcUrl
      ? createTrpcLiveSmokeClient(trpcUrl, token)
      : undefined;
  const startedAt = new Date();
  const report = await runCareerPlaybookLiveSmoke(
    {
      mode: args.mode,
      targetEnvironment: args.targetEnvironment,
      env: {
        ...process.env,
        BULLMQ_QUEUE_NAME: args.queueName ?? process.env.BULLMQ_QUEUE_NAME,
      },
      trpcUrl,
      token,
      expectedUserId: args.expectedUserId,
      expectedOrganizationId: args.expectedOrganizationId,
      queueName: args.queueName,
      cleanupScope: args.cleanupScope,
      maxCostUsd: args.maxCostUsd,
      pollTimeoutMs: args.pollTimeoutMs,
      pollIntervalMs: args.pollIntervalMs,
      resumePlaybookId: args.resumePlaybookId,
      confirmLiveMutation: args.confirmLiveMutation,
      includeCourseBridge: args.includeCourseBridge,
    },
    { client }
  );
  const finishedAt = new Date();

  // Persist the validated content on both evidence pass AND fail (report carries
  // a playbookId in either case). Artifact failure never fails the smoke run.
  let artifacts: { markdownPath: string; jsonPath: string } | null = null;
  if (!args.noArtifact && report.playbookId) {
    try {
      artifacts = await captureCareerPlaybookSmokeArtifact({
        report,
        client,
        baseDir: args.artifactDir,
        timings: {
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          pollTimeoutMs: args.pollTimeoutMs,
          pollIntervalMs: args.pollIntervalMs,
        },
      });
    } catch (error) {
      console.error(
        `Artifact capture failed (run result is still valid): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (args.json) {
    console.log(JSON.stringify(artifacts ? { ...report, artifacts } : report, null, 2));
  } else {
    const artifactLines = artifacts
      ? `\n\nArtifacts:\n- markdown: ${artifacts.markdownPath}\n- json: ${artifacts.jsonPath}`
      : '';
    console.log(formatCareerPlaybookLiveSmokeReport(report) + artifactLines);
  }
  process.exit(exitCodeFor(report.status));
}

function isRunAsCareerPlaybookLiveSmokeScript(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isRunAsCareerPlaybookLiveSmokeScript()) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
