import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { access, constants, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DocumentProcessingJobDataSchema,
  JobType,
  type DocumentProcessingJobData,
} from '@megacampus/shared-types';
import { z } from 'zod';
import { resolveUploadStoragePath } from '../../src/stages/stage1-document-upload/storage-paths';
import { QDRANT_COLLECTION_ALIAS } from '../../src/shared/qdrant/config';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { addJob, closeQueue, getQueue } from '../../src/orchestrator/queue';
import { qdrantClient } from '../../src/shared/qdrant/client';
import { verifyPhysicalCourseEmbeddingsCollection } from '../../src/shared/qdrant/collection-manager';
import { hybridSearchNative } from '../../src/shared/qdrant/search-operations';
import {
  buildReindexPlan,
  COURSE_REINDEX_COLUMNS,
  FILE_CATALOG_REINDEX_COLUMNS,
  getReindexPlanExitCode,
  loadReindexSources,
  verifyReindexParity,
  type DatabaseCourseSourceRow,
  type DatabaseFileCatalogSourceRow,
  type IndexedDocumentIdentity,
  type ReindexPlan,
  type ReindexRelevanceCheck,
  type ReindexSchemaVerification,
  type ReindexSourceDatabase,
  type ReindexSourceRow,
  type ReindexVerificationResult,
} from './reindex-plan';

export type ReindexCommandMode = 'plan' | 'execute' | 'verify';

export interface ReindexCommandOptions {
  mode: ReindexCommandMode;
  targetCollection?: string;
  concurrency?: number;
  courseId?: string;
  runId?: string;
  artifactPath?: string;
  allowGaps: boolean;
}

export interface ReindexCliOptions extends ReindexCommandOptions {
  fixturePath?: string;
  help: boolean;
}

export interface ReindexCliRuntime {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  createDefaultDependencies: () => ReindexCommandDependencies;
  loadFixtureDependencies: (path: string) => Promise<ReindexCommandDependencies>;
}

export interface ReindexExecutionArtifact {
  schemaVersion: 1;
  mode: 'execute';
  runId: string;
  targetCollection: string;
  createdAt: string;
  concurrency: number;
  counts: {
    eligible: number;
    recoverable: number;
    enqueued: number;
    alreadyEnqueued: number;
    missingSource: number;
    unsupported: number;
    gaps: number;
  };
  jobIds: string[];
  gaps: ReindexPlan['gaps'];
}

export interface ReindexCommandDependencies {
  loadSources: (courseId?: string) => Promise<ReindexSourceRow[]>;
  probeSources: (rows: readonly ReindexSourceRow[]) => Promise<ReadonlySet<string>>;
  findExistingJobs: (jobIds: readonly string[]) => Promise<ReadonlySet<string>>;
  verifyPhysicalTarget: (targetCollection: string) => Promise<ReindexSchemaVerification>;
  enqueueJob: (jobId: string, data: DocumentProcessingJobData) => Promise<void>;
  persistArtifact: (artifact: ReindexExecutionArtifact, artifactPath: string) => Promise<void>;
  loadIndexedDocuments: (
    targetCollection: string,
    courseId?: string
  ) => Promise<IndexedDocumentIdentity[]>;
  runRelevanceChecks: (
    targetCollection: string,
    expectedSources: readonly ReindexSourceRow[]
  ) => Promise<ReindexRelevanceCheck[]>;
  now: () => Date;
  createRunId: () => string;
}

export type ReindexCommandReport =
  | ReindexPlan
  | (ReindexVerificationResult & { gaps: ReindexPlan['gaps'] })
  | {
      ok: boolean;
      runId: string;
      targetCollection: string;
      concurrency: number;
      enqueued: number;
      alreadyEnqueued: number;
      gaps: ReindexPlan['gaps'];
      schemaMismatches: string[];
      artifactPath?: string;
    };

export interface ReindexCommandResult {
  exitCode: 0 | 1 | 2;
  report: ReindexCommandReport;
}

interface PreparedPlan {
  rows: ReindexSourceRow[];
  plan: ReindexPlan;
}

const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 16;

function readCliValue(args: string[], index: number, option: string): [string, number] {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return [value, index + 1];
}

export function parseReindexCliArgs(args: string[]): ReindexCliOptions {
  const options: ReindexCliOptions = {
    mode: 'plan',
    allowGaps: false,
    help: false,
  };
  let modeSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (!argument.startsWith('-')) {
      if (modeSeen || !['plan', 'execute', 'verify'].includes(argument)) {
        throw new Error(
          `Expected exactly one mode: plan, execute, or verify; received ${argument}`
        );
      }
      options.mode = argument as ReindexCommandMode;
      modeSeen = true;
      continue;
    }
    if (argument === '--allow-gaps') {
      options.allowGaps = true;
      continue;
    }

    const optionNames = [
      '--target-collection',
      '--concurrency',
      '--course-id',
      '--run-id',
      '--artifact',
      '--fixture',
    ] as const;
    const option = optionNames.find(name => argument === name || argument.startsWith(`${name}=`));
    if (!option) throw new Error(`Unknown option: ${argument}`);
    const inlineValue = argument.startsWith(`${option}=`)
      ? argument.slice(option.length + 1)
      : undefined;
    const [value, valueIndex] = inlineValue
      ? [inlineValue, index]
      : readCliValue(args, index, option);
    index = valueIndex;

    if (option === '--target-collection') options.targetCollection = value;
    if (option === '--concurrency') options.concurrency = Number(value);
    if (option === '--course-id') options.courseId = value;
    if (option === '--run-id') options.runId = value;
    if (option === '--artifact') options.artifactPath = value;
    if (option === '--fixture') options.fixturePath = value;
  }

  if (!modeSeen && !options.help) {
    throw new Error('A mode is required: plan, execute, or verify');
  }
  if (options.concurrency !== undefined) resolveConcurrency(options.concurrency);
  return options;
}

export function validatePhysicalCollectionTarget(targetCollection: string | undefined): string {
  if (targetCollection === undefined) {
    throw new Error('--target-collection is required and must name a physical collection');
  }
  const target = targetCollection.trim();
  if (!target) throw new Error('--target-collection must not be empty');
  if (target.length > 255) throw new Error('--target-collection must be at most 255 characters');
  if (target === QDRANT_COLLECTION_ALIAS) {
    throw new Error(
      `--target-collection must name a physical collection, not logical alias ${QDRANT_COLLECTION_ALIAS}`
    );
  }
  return target;
}

export function buildReindexJobId(runId: string, fileId: string): string {
  return `qdrant-reindex-${runId}-${fileId}`;
}

function resolveConcurrency(value: number | undefined): number {
  const concurrency = value ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new Error(`--concurrency must be an integer between 1 and ${MAX_CONCURRENCY}`);
  }
  return concurrency;
}

function validateUuidOption(value: string | undefined, option: string): string | undefined {
  if (value === undefined) return undefined;
  if (!z.string().uuid().safeParse(value).success) {
    throw new Error(`${option} must be a UUID`);
  }
  return value;
}

async function preparePlan(
  options: ReindexCommandOptions,
  dependencies: ReindexCommandDependencies,
  runId?: string
): Promise<PreparedPlan> {
  const sourceRows = await dependencies.loadSources(options.courseId);
  const availableSources = await dependencies.probeSources(sourceRows);
  let existingJobs: ReadonlySet<string> = new Set();
  if (runId) {
    existingJobs = await dependencies.findExistingJobs(
      sourceRows.map(row => buildReindexJobId(runId, row.id))
    );
  }
  const rows = sourceRows.map(row => ({
    ...row,
    alreadyEnqueued: runId
      ? existingJobs.has(buildReindexJobId(runId, row.id))
      : row.alreadyEnqueued,
  }));
  return {
    rows,
    plan: buildReindexPlan(rows, row => availableSources.has(row.id)),
  };
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await operation(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => worker())
  );
}

function selectExpectedSources(prepared: PreparedPlan): ReindexSourceRow[] {
  const expectedIds = new Set([
    ...prepared.plan.candidateFileIds,
    ...prepared.plan.alreadyEnqueuedFileIds,
  ]);
  return prepared.rows.filter(row => expectedIds.has(row.id));
}

async function executeReindex(
  options: ReindexCommandOptions,
  dependencies: ReindexCommandDependencies,
  targetCollection: string
): Promise<ReindexCommandResult> {
  const concurrency = resolveConcurrency(options.concurrency);
  const runId = validateUuidOption(options.runId ?? dependencies.createRunId(), '--run-id')!;
  const prepared = await preparePlan(options, dependencies, runId);
  const schema = await dependencies.verifyPhysicalTarget(targetCollection);
  if (!schema.ok) {
    return {
      exitCode: 1,
      report: {
        ok: false,
        runId,
        targetCollection,
        concurrency,
        enqueued: 0,
        alreadyEnqueued: prepared.plan.alreadyEnqueued,
        gaps: prepared.plan.gaps,
        schemaMismatches: schema.mismatches,
      },
    };
  }

  const candidateIds = new Set(prepared.plan.candidateFileIds);
  const candidates = prepared.rows.filter(row => candidateIds.has(row.id));
  const createdAt = dependencies.now().toISOString();
  const jobIds = candidates.map(row => buildReindexJobId(runId, row.id));

  await mapWithConcurrency(candidates, concurrency, async row => {
    const jobData = DocumentProcessingJobDataSchema.parse({
      jobType: JobType.DOCUMENT_PROCESSING,
      organizationId: row.organizationId,
      courseId: row.courseId,
      userId: row.userId,
      fileId: row.id,
      filePath: resolveUploadStoragePath(row.storagePath),
      mimeType: row.mimeType,
      chunkSize: 512,
      chunkOverlap: 50,
      createdAt,
      locale: row.locale,
      qdrantTargetCollection: targetCollection,
      qdrantReindexRunId: runId,
    });
    await dependencies.enqueueJob(buildReindexJobId(runId, row.id), jobData);
  });

  const artifactPath = options.artifactPath ?? `artifacts/qdrant-reindex/${runId}.json`;
  const artifact: ReindexExecutionArtifact = {
    schemaVersion: 1,
    mode: 'execute',
    runId,
    targetCollection,
    createdAt,
    concurrency,
    counts: {
      eligible: prepared.plan.eligible,
      recoverable: prepared.plan.recoverable,
      enqueued: candidates.length,
      alreadyEnqueued: prepared.plan.alreadyEnqueued,
      missingSource: prepared.plan.missingSource,
      unsupported: prepared.plan.unsupported,
      gaps: prepared.plan.gaps.length,
    },
    jobIds,
    gaps: prepared.plan.gaps,
  };
  await dependencies.persistArtifact(artifact, artifactPath);

  return {
    exitCode: getReindexPlanExitCode(prepared.plan, options.allowGaps),
    report: {
      ok: true,
      runId,
      targetCollection,
      concurrency,
      enqueued: candidates.length,
      alreadyEnqueued: prepared.plan.alreadyEnqueued,
      gaps: prepared.plan.gaps,
      schemaMismatches: [],
      artifactPath,
    },
  };
}

async function verifyReindex(
  options: ReindexCommandOptions,
  dependencies: ReindexCommandDependencies,
  targetCollection: string
): Promise<ReindexCommandResult> {
  const prepared = await preparePlan(options, dependencies);
  const expectedSources = selectExpectedSources(prepared);
  const [schemaVerification, indexedDocuments, relevanceChecks] = await Promise.all([
    dependencies.verifyPhysicalTarget(targetCollection),
    dependencies.loadIndexedDocuments(targetCollection, options.courseId),
    dependencies.runRelevanceChecks(targetCollection, expectedSources),
  ]);
  const verification = verifyReindexParity({
    expectedSources,
    indexedDocuments,
    schemaVerification,
    relevanceChecks,
  });
  const report = { ...verification, gaps: prepared.plan.gaps };
  if (!verification.ok) return { exitCode: 1, report };
  return {
    exitCode: getReindexPlanExitCode(prepared.plan, options.allowGaps),
    report,
  };
}

export async function runReindexCommand(
  options: ReindexCommandOptions,
  dependencies: ReindexCommandDependencies
): Promise<ReindexCommandResult> {
  validateUuidOption(options.runId, '--run-id');
  validateUuidOption(options.courseId, '--course-id');
  if (options.mode === 'plan') {
    const prepared = await preparePlan(options, dependencies, options.runId);
    return {
      exitCode: getReindexPlanExitCode(prepared.plan, options.allowGaps),
      report: prepared.plan,
    };
  }

  const targetCollection = validatePhysicalCollectionTarget(options.targetCollection);
  return options.mode === 'execute'
    ? executeReindex(options, dependencies, targetCollection)
    : verifyReindex(options, dependencies, targetCollection);
}

export function createReindexRunId(): string {
  return randomUUID();
}

const ReindexFixtureSourceSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  courseId: z.string().uuid().nullable(),
  courseOrganizationId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable(),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  priority: z.string().nullable(),
  vectorStatus: z.string().min(1),
  chunkCount: z.number().int().min(0).nullable(),
  locale: z.enum(['ru', 'en']),
  alreadyEnqueued: z.boolean(),
  sourceAvailable: z.boolean(),
});

const ReindexDryFixtureSchema = z.object({
  runId: z.string().uuid().optional(),
  now: z.string().datetime().optional(),
  sources: z.array(ReindexFixtureSourceSchema),
  schemaVerification: z.object({
    ok: z.boolean(),
    mismatches: z.array(z.string()),
  }),
  indexedDocuments: z.array(
    z.object({
      documentId: z.string().uuid(),
      courseId: z.string().uuid(),
      organizationId: z.string().uuid(),
    })
  ),
  relevanceChecks: z.array(
    z.object({
      language: z.enum(['ru', 'en']),
      passed: z.boolean(),
      nativeHybrid: z.boolean(),
    })
  ),
});

async function persistExecutionArtifact(
  artifact: ReindexExecutionArtifact,
  artifactPath: string
): Promise<void> {
  await mkdir(dirname(artifactPath), { recursive: true });
  const temporaryPath = `${artifactPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, artifactPath);
}

export async function loadReindexFixtureDependencies(
  fixturePath: string
): Promise<ReindexCommandDependencies> {
  const fixture = ReindexDryFixtureSchema.parse(
    JSON.parse(await readFile(fixturePath, 'utf8')) as unknown
  );
  const availableIds = new Set(
    fixture.sources.filter(source => source.sourceAvailable).map(source => source.id)
  );
  const alreadyEnqueuedIds = new Set(
    fixture.sources.filter(source => source.alreadyEnqueued).map(source => source.id)
  );
  const sources = fixture.sources.map(({ sourceAvailable: _sourceAvailable, ...source }) => source);

  return {
    loadSources: courseId =>
      Promise.resolve(
        sources.filter(source => courseId === undefined || source.courseId === courseId)
      ),
    probeSources: rows =>
      Promise.resolve(new Set(rows.filter(row => availableIds.has(row.id)).map(row => row.id))),
    findExistingJobs: jobIds =>
      Promise.resolve(
        new Set(
          jobIds.filter(jobId =>
            [...alreadyEnqueuedIds].some(fileId => jobId.endsWith(`-${fileId}`))
          )
        )
      ),
    verifyPhysicalTarget: () => Promise.resolve({ ...fixture.schemaVerification }),
    enqueueJob: () => Promise.resolve(),
    persistArtifact: persistExecutionArtifact,
    loadIndexedDocuments: (_targetCollection, courseId) =>
      Promise.resolve(
        fixture.indexedDocuments.filter(
          document => courseId === undefined || document.courseId === courseId
        )
      ),
    runRelevanceChecks: () => Promise.resolve([...fixture.relevanceChecks]),
    now: () => new Date(fixture.now ?? '2026-01-01T00:00:00.000Z'),
    createRunId: () => fixture.runId ?? randomUUID(),
  };
}

function createSourceDatabase(): ReindexSourceDatabase {
  return {
    listFileCatalogSources: async courseId => {
      const baseQuery = getSupabaseAdmin()
        .from('file_catalog')
        .select(FILE_CATALOG_REINDEX_COLUMNS)
        .order('id');
      const { data, error } = courseId
        ? await baseQuery.eq('course_id', courseId)
        : await baseQuery;
      if (error) throw new Error(`Unable to read file_catalog reindex sources: ${error.message}`);
      return (data ?? []) as unknown as DatabaseFileCatalogSourceRow[];
    },
    listCourseSources: async courseIds => {
      if (courseIds.length === 0) return [];
      const { data, error } = await getSupabaseAdmin()
        .from('courses')
        .select(COURSE_REINDEX_COLUMNS)
        .in('id', [...courseIds])
        .order('id');
      if (error) throw new Error(`Unable to read course reindex ownership: ${error.message}`);
      return (data ?? []) as unknown as DatabaseCourseSourceRow[];
    },
  };
}

async function probeSourceFiles(rows: readonly ReindexSourceRow[]): Promise<ReadonlySet<string>> {
  const results = await Promise.all(
    rows.map(async row => {
      try {
        await access(resolveUploadStoragePath(row.storagePath), constants.R_OK);
        return row.id;
      } catch {
        return null;
      }
    })
  );
  return new Set(results.filter((id): id is string => id !== null));
}

async function findExistingReindexJobs(jobIds: readonly string[]): Promise<ReadonlySet<string>> {
  const queue = getQueue();
  const jobs = await Promise.all(
    jobIds.map(async jobId => ({ jobId, job: await queue.getJob(jobId) }))
  );
  return new Set(jobs.flatMap(({ jobId, job }) => (job ? [jobId] : [])));
}

type ScrollOptions = NonNullable<Parameters<typeof qdrantClient.scroll>[1]>;

async function loadIndexedDocumentIdentities(
  targetCollection: string,
  courseId?: string
): Promise<IndexedDocumentIdentity[]> {
  const documents = new Map<string, IndexedDocumentIdentity>();
  let offset: ScrollOptions['offset'];

  while (true) {
    const response = await qdrantClient.scroll(targetCollection, {
      limit: 256,
      offset,
      with_payload: ['document_id', 'course_id', 'organization_id'],
      with_vector: false,
      ...(courseId ? { filter: { must: [{ key: 'course_id', match: { value: courseId } }] } } : {}),
    });

    for (const point of response.points) {
      const payload = point.payload ?? {};
      const documentId = payload.document_id;
      const indexedCourseId = payload.course_id;
      const organizationId = payload.organization_id;
      if (
        typeof documentId !== 'string' ||
        typeof indexedCourseId !== 'string' ||
        typeof organizationId !== 'string'
      ) {
        throw new Error('Qdrant point is missing document_id, course_id, or organization_id');
      }
      const previous = documents.get(documentId);
      if (
        previous &&
        (previous.courseId !== indexedCourseId || previous.organizationId !== organizationId)
      ) {
        throw new Error(`Qdrant document identity ${documentId} has conflicting tenant payloads`);
      }
      documents.set(documentId, { documentId, courseId: indexedCourseId, organizationId });
    }

    if (response.next_page_offset === undefined || response.next_page_offset === null) break;
    offset = response.next_page_offset;
  }

  return [...documents.values()].sort((left, right) =>
    left.documentId.localeCompare(right.documentId)
  );
}

function deriveRelevanceQuery(markdown: string): string | null {
  const query = markdown
    .replace(/[()[\]`#*_>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  return query.length >= 20 ? query : null;
}

async function runNativeRelevanceChecks(
  targetCollection: string,
  expectedSources: readonly ReindexSourceRow[]
): Promise<ReindexRelevanceCheck[]> {
  const sourceIds = expectedSources.map(source => source.id);
  const { data, error } = sourceIds.length
    ? await getSupabaseAdmin()
        .from('file_catalog')
        .select('id, markdown_content')
        .in('id', sourceIds)
    : { data: [], error: null };
  if (error) throw new Error(`Unable to load relevance fixture text: ${error.message}`);
  const markdownById = new Map(
    (data ?? []).flatMap(row =>
      typeof row.markdown_content === 'string' ? [[row.id, row.markdown_content] as const] : []
    )
  );

  const checks: ReindexRelevanceCheck[] = [];
  for (const language of ['ru', 'en'] as const) {
    const fixture = [...expectedSources]
      .filter(source => source.locale === language)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(source => ({ source, query: deriveRelevanceQuery(markdownById.get(source.id) ?? '') }))
      .find(candidate => candidate.query !== null);
    if (!fixture?.query || !fixture.source.courseId) {
      checks.push({ language, passed: false, nativeHybrid: false });
      continue;
    }

    try {
      const points = await hybridSearchNative(fixture.query, {
        limit: 5,
        score_threshold: 0,
        collection_name: targetCollection,
        enable_hybrid: true,
        include_payload: true,
        filters: {
          organization_id: fixture.source.organizationId,
          course_id: fixture.source.courseId,
        },
        enable_priority_boost: true,
        priority_boost_factor: 0.4,
        group_by_document: true,
        group_size: 2,
      });
      checks.push({
        language,
        passed: points.some(point => point.payload?.document_id === fixture.source.id),
        nativeHybrid: true,
      });
    } catch {
      checks.push({ language, passed: false, nativeHybrid: false });
    }
  }
  return checks;
}

export function createDefaultReindexDependencies(): ReindexCommandDependencies {
  return {
    loadSources: courseId => loadReindexSources(createSourceDatabase(), courseId),
    probeSources: probeSourceFiles,
    findExistingJobs: findExistingReindexJobs,
    verifyPhysicalTarget: async targetCollection => {
      const result = await verifyPhysicalCourseEmbeddingsCollection({
        physicalName: targetCollection,
      });
      return { ok: result.ok, mismatches: result.mismatches };
    },
    enqueueJob: async (jobId, data) => {
      await addJob(JobType.DOCUMENT_PROCESSING, data, { jobId });
    },
    persistArtifact: persistExecutionArtifact,
    loadIndexedDocuments: loadIndexedDocumentIdentities,
    runRelevanceChecks: runNativeRelevanceChecks,
    now: () => new Date(),
    createRunId: createReindexRunId,
  };
}

const REINDEX_HELP = `Usage: qdrant:reindex <plan|execute|verify> [options]

Source-driven Qdrant course-embedding recovery without alias mutation.

Options:
  --target-collection <name>  Required physical collection for execute/verify
  --concurrency <count>       Bounded enqueue concurrency (default: 2, max: 16)
  --course-id <uuid>          Limit source and parity checks to one course
  --run-id <uuid>             Reuse a durable run identity for idempotent execute
  --artifact <path>           Execute artifact output path
  --fixture <path>            Fully local dry fixture; no live adapters are constructed
  --allow-gaps                Change only the gap-related exit code
  -h, --help                  Show this help
`;

export async function runReindexCli(
  args: string[],
  runtime: ReindexCliRuntime
): Promise<0 | 1 | 2> {
  const options = parseReindexCliArgs(args);
  if (options.help) {
    runtime.stdout(REINDEX_HELP);
    return 0;
  }

  const dependencies = options.fixturePath
    ? await runtime.loadFixtureDependencies(options.fixturePath)
    : runtime.createDefaultDependencies();
  const result = await runReindexCommand(options, dependencies);
  runtime.stdout(
    `${JSON.stringify(
      {
        mode: options.mode,
        dryFixture: Boolean(options.fixturePath),
        report: result.report,
      },
      null,
      2
    )}\n`
  );
  return result.exitCode;
}

function isDirectExecution(metaUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) return false;
  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

if (isDirectExecution(import.meta.url)) {
  runReindexCli(process.argv.slice(2), {
    stdout: message => process.stdout.write(message),
    stderr: message => process.stderr.write(message),
    createDefaultDependencies: createDefaultReindexDependencies,
    loadFixtureDependencies: loadReindexFixtureDependencies,
  })
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(error => {
      process.stderr.write(
        `Qdrant reindex command failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
    })
    .finally(async () => closeQueue());
}
