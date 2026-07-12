import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { access, constants, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DocumentProcessingJobDataSchema,
  JobType,
  type DocumentProcessingJobData,
} from '@megacampus/shared-types';
import { z } from 'zod';
import { QueueEvents, type Job } from 'bullmq';
import {
  getUploadStorageRootPath,
  isPathInsideUploadStorageRoot,
  resolveUploadStoragePath,
} from '../../src/stages/stage1-document-upload/storage-paths';
import { QDRANT_COLLECTION_ALIAS } from '../../src/shared/qdrant/config';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { addJob, closeQueue, getQueue, QUEUE_NAME } from '../../src/orchestrator/queue';
import { getRedisClient } from '../../src/shared/cache/redis';
import { qdrantClient } from '../../src/shared/qdrant/client';
import { verifyPhysicalCourseEmbeddingsCollection } from '../../src/shared/qdrant/collection-manager';
import { hybridSearchNative } from '../../src/shared/qdrant/search-operations';
import {
  buildReindexPlan,
  calculateReindexVerificationFingerprint,
  COURSE_REINDEX_COLUMNS,
  FILE_CATALOG_REINDEX_COLUMNS,
  getReindexPlanExitCode,
  loadReindexSources,
  verifyReindexParity,
  type DatabaseCourseSourceRow,
  type DatabaseFileCatalogSourceRow,
  type IndexedDocumentIdentity,
  type ReindexPlan,
  type RecoveryReindexBinding,
  type ReindexRelevanceCheck,
  type ReindexSchemaVerification,
  type ReindexSourceDatabase,
  type ReindexSourceRow,
  type ReindexVerificationResult,
} from './reindex-plan';
import {
  validateRecoveryJournalTransition,
  type RecoveryProgressJournal,
} from './source-recovery-manifest';

export type ReindexCommandMode = 'plan' | 'execute' | 'verify';

export interface ReindexCommandOptions {
  mode: ReindexCommandMode;
  targetCollection?: string;
  concurrency?: number;
  jobTimeoutMs?: number;
  courseId?: string;
  runId?: string;
  artifactPath?: string;
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
  schemaVersion: 3;
  mode: 'execute';
  runId: string;
  targetCollection: string;
  recoveryRunId: string;
  recoveryManifestSha256: string;
  verificationFingerprint: string;
  status: 'planned' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  concurrency: number;
  jobTimeoutMs: number;
  counts: {
    eligible: number;
    recoverable: number;
    auditedFailed: number;
    unresolvedMissing: number;
    unresolvedInvalid: number;
    expectedDocuments: number;
    planned: number;
    accepted: number;
    completed: number;
    failed: number;
    pending: number;
    alreadyEnqueued: number;
    missingSource: number;
    invalidSourcePath: number;
    unsupported: number;
    gaps: number;
  };
  plannedJobIds: string[];
  acceptedJobIds: string[];
  completedJobIds: string[];
  failures: Array<{
    jobId: string;
    fileId: string;
    phase: 'enqueue' | 'terminal' | 'timeout';
  }>;
  gaps: ReindexPlan['gaps'];
}

export interface ReindexJobHandle {
  waitForTerminal: (timeoutMs: number) => Promise<void>;
}

export type ReindexRetainedJobState =
  | 'active'
  | 'waiting'
  | 'delayed'
  | 'prioritized'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'unknown';

export interface ReindexRetainedJob {
  jobId: string;
  state: ReindexRetainedJobState;
  data: unknown;
  waitForTerminal?: (timeoutMs: number) => Promise<void>;
}

export interface ReindexCommandDependencies {
  loadRecoveryBinding: () => Promise<RecoveryReindexBinding | null>;
  persistRecoveryJournalTransition: (input: {
    expectedRevision: number;
    next: RecoveryProgressJournal;
  }) => Promise<RecoveryProgressJournal>;
  loadSources: (courseId?: string) => Promise<ReindexSourceRow[]>;
  probeSources: (rows: readonly ReindexSourceRow[]) => Promise<ReindexSourceProbeResult>;
  inspectJobs: (jobIds: readonly string[]) => Promise<ReindexRetainedJob[]>;
  verifyPhysicalTarget: (targetCollection: string) => Promise<ReindexSchemaVerification>;
  enqueueJob: (jobId: string, data: DocumentProcessingJobData) => Promise<ReindexJobHandle>;
  removeJob: (jobId: string) => Promise<void>;
  loadArtifact: (artifactPath: string) => Promise<ReindexExecutionArtifact | null>;
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
  close?: () => Promise<void>;
}

export interface ReindexSourceProbeResult {
  availableFileIds: ReadonlySet<string>;
  invalidPathFileIds: ReadonlySet<string>;
  resolvedFilePaths: ReadonlyMap<string, string>;
}

export class ReindexJobTimeoutError extends Error {
  constructor(jobId: string, timeoutMs: number) {
    super(`Reindex job ${jobId} did not reach a terminal state within ${timeoutMs}ms`);
    this.name = 'ReindexJobTimeoutError';
  }
}

interface ReindexQueueJobLike {
  id?: string;
  data: unknown;
  getState: () => Promise<string>;
  remove: () => Promise<unknown>;
}

interface ReindexQueueAdapterInput {
  getJob: (jobId: string) => Promise<ReindexQueueJobLike | null>;
  addJob: (jobId: string, data: DocumentProcessingJobData) => Promise<ReindexQueueJobLike>;
  waitForJob: (job: ReindexQueueJobLike, timeoutMs: number) => Promise<void>;
  close?: () => Promise<void>;
}

export function createReindexQueueAdapter(
  input: ReindexQueueAdapterInput
): Pick<ReindexCommandDependencies, 'inspectJobs' | 'enqueueJob' | 'removeJob' | 'close'> {
  const toState = (state: string): ReindexRetainedJobState => {
    const supported: ReindexRetainedJobState[] = [
      'active',
      'waiting',
      'delayed',
      'prioritized',
      'paused',
      'completed',
      'failed',
    ];
    return supported.includes(state as ReindexRetainedJobState)
      ? (state as ReindexRetainedJobState)
      : 'unknown';
  };

  return {
    inspectJobs: async jobIds => {
      const retained = await Promise.all(
        jobIds.map(async jobId => ({ jobId, job: await input.getJob(jobId) }))
      );
      return Promise.all(
        retained.flatMap(({ jobId, job }) =>
          job
            ? [
                (async (): Promise<ReindexRetainedJob> => ({
                  jobId,
                  state: toState(await job.getState()),
                  data: job.data,
                  waitForTerminal: timeoutMs => input.waitForJob(job, timeoutMs),
                }))(),
              ]
            : []
        )
      );
    },
    enqueueJob: async (jobId, data) => {
      const job = await input.addJob(jobId, data);
      return { waitForTerminal: timeoutMs => input.waitForJob(job, timeoutMs) };
    },
    removeJob: async jobId => {
      const job = await input.getJob(jobId);
      if (job) await job.remove();
    },
    close: input.close,
  };
}

export type ReindexCommandReport =
  | ReindexPlan
  | (ReindexVerificationResult & { gaps: ReindexPlan['gaps'] })
  | {
      ok: boolean;
      runId: string;
      targetCollection: string;
      concurrency: number;
      jobTimeoutMs: number;
      enqueued: number;
      completed: number;
      failed: number;
      pending: number;
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
  sourceProbe: ReindexSourceProbeResult;
  recoveryBinding: RecoveryReindexBinding;
}

const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 16;
const DEFAULT_JOB_TIMEOUT_MS = 7_200_000;
const MIN_JOB_TIMEOUT_MS = 1_000;
const MAX_JOB_TIMEOUT_MS = 86_400_000;

function readCliValue(args: string[], index: number, option: string): [string, number] {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return [value, index + 1];
}

export function parseReindexCliArgs(args: string[]): ReindexCliOptions {
  const options: ReindexCliOptions = {
    mode: 'plan',
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
    const optionNames = [
      '--target-collection',
      '--concurrency',
      '--job-timeout-ms',
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
    if (option === '--job-timeout-ms') options.jobTimeoutMs = Number(value);
    if (option === '--course-id') options.courseId = value;
    if (option === '--run-id') options.runId = value;
    if (option === '--artifact') options.artifactPath = value;
    if (option === '--fixture') options.fixturePath = value;
  }

  if (!modeSeen && !options.help) {
    throw new Error('A mode is required: plan, execute, or verify');
  }
  if (options.concurrency !== undefined) resolveConcurrency(options.concurrency);
  if (options.jobTimeoutMs !== undefined) resolveJobTimeout(options.jobTimeoutMs);
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

function resolveJobTimeout(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_JOB_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < MIN_JOB_TIMEOUT_MS ||
    timeoutMs > MAX_JOB_TIMEOUT_MS
  ) {
    throw new Error(
      `--job-timeout-ms must be an integer between ${MIN_JOB_TIMEOUT_MS} and ${MAX_JOB_TIMEOUT_MS}`
    );
  }
  return timeoutMs;
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
  recoveryBinding: RecoveryReindexBinding,
  alreadyEnqueuedFileIds: ReadonlySet<string> = new Set()
): Promise<PreparedPlan> {
  const sourceRows = await dependencies.loadSources(options.courseId);
  const sourceProbe = await dependencies.probeSources(sourceRows);
  const rows = sourceRows.map(row => ({
    ...row,
    alreadyEnqueued: row.alreadyEnqueued || alreadyEnqueuedFileIds.has(row.id),
  }));
  return {
    rows,
    plan: buildReindexPlan(
      rows,
      row =>
        sourceProbe.invalidPathFileIds.has(row.id)
          ? 'invalid_source_path'
          : sourceProbe.availableFileIds.has(row.id),
      recoveryBinding
    ),
    sourceProbe,
    recoveryBinding,
  };
}

function rebuildPreparedPlan(
  prepared: PreparedPlan,
  alreadyEnqueuedFileIds: ReadonlySet<string>
): PreparedPlan {
  const rows = prepared.rows.map(row => ({
    ...row,
    alreadyEnqueued: row.alreadyEnqueued || alreadyEnqueuedFileIds.has(row.id),
  }));
  return {
    rows,
    sourceProbe: prepared.sourceProbe,
    plan: buildReindexPlan(
      rows,
      row =>
        prepared.sourceProbe.invalidPathFileIds.has(row.id)
          ? 'invalid_source_path'
          : prepared.sourceProbe.availableFileIds.has(row.id),
      prepared.recoveryBinding
    ),
    recoveryBinding: prepared.recoveryBinding,
  };
}

async function requireRecoveryBinding(
  dependencies: ReindexCommandDependencies
): Promise<RecoveryReindexBinding> {
  const binding = await dependencies.loadRecoveryBinding();
  if (!binding) throw new Error('A verified recovery binding is required');
  return binding;
}

function assertArtifactRecoveryBinding(
  artifact: ReindexExecutionArtifact,
  plan: ReindexPlan
): void {
  if (
    artifact.recoveryRunId !== plan.recoveryRunId ||
    artifact.recoveryManifestSha256 !== plan.recoveryManifestSha256 ||
    artifact.verificationFingerprint !== plan.verificationFingerprint
  ) {
    throw new Error('Run artifact recovery binding or verification fingerprint is stale');
  }
  if (
    artifact.counts.eligible !== plan.eligible ||
    artifact.counts.auditedFailed !== plan.auditedFailed ||
    artifact.counts.unresolvedMissing !== plan.unresolvedMissing ||
    artifact.counts.unresolvedInvalid !== plan.unresolvedInvalid ||
    artifact.counts.expectedDocuments !== plan.expectedDocuments ||
    artifact.counts.missingSource !== plan.missingSource ||
    artifact.counts.invalidSourcePath !== plan.invalidSourcePath ||
    artifact.counts.unsupported !== plan.unsupported
  ) {
    throw new Error('Run artifact audited recovery counts are stale');
  }
}

function assertRecoveryPhase(
  binding: RecoveryReindexBinding,
  artifact: ReindexExecutionArtifact | null
): void {
  if (artifact) {
    if (binding.journal.phase !== 'reindex_started') {
      throw new Error('A resumed reindex requires a reindex_started recovery journal');
    }
    return;
  }
  if (binding.journal.phase !== 'verified') {
    throw new Error('A fresh reindex requires a verified recovery journal');
  }
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
  targetCollection: string,
  recoveryBinding: RecoveryReindexBinding
): Promise<ReindexCommandResult> {
  const concurrency = resolveConcurrency(options.concurrency);
  const jobTimeoutMs = resolveJobTimeout(options.jobTimeoutMs);
  const runId = validateUuidOption(options.runId ?? dependencies.createRunId(), '--run-id')!;
  const artifactPath = options.artifactPath ?? `artifacts/qdrant-reindex/${runId}.json`;
  const loadedArtifact = await dependencies.loadArtifact(artifactPath);
  if (loadedArtifact && loadedArtifact.runId !== runId) {
    throw new Error(
      `Run artifact ${artifactPath} belongs to run ${loadedArtifact.runId}, not ${runId}`
    );
  }
  if (loadedArtifact && loadedArtifact.targetCollection !== targetCollection) {
    throw new Error(
      `Run ${runId} is bound to target ${loadedArtifact.targetCollection}, not ${targetCollection}`
    );
  }

  const basePrepared = await preparePlan(options, dependencies, recoveryBinding);
  if (getReindexPlanExitCode(basePrepared.plan) === 2) {
    return { exitCode: 2, report: basePrepared.plan };
  }
  assertRecoveryPhase(recoveryBinding, loadedArtifact);
  if (loadedArtifact) assertArtifactRecoveryBinding(loadedArtifact, basePrepared.plan);
  const schema = await dependencies.verifyPhysicalTarget(targetCollection);
  if (!schema.ok) {
    return {
      exitCode: 1,
      report: {
        ok: false,
        runId,
        targetCollection,
        concurrency,
        jobTimeoutMs,
        enqueued: 0,
        completed: 0,
        failed: 0,
        pending: basePrepared.plan.recoverable,
        alreadyEnqueued: basePrepared.plan.alreadyEnqueued,
        gaps: basePrepared.plan.gaps,
        schemaMismatches: schema.mismatches,
      },
    };
  }

  const createdAt = loadedArtifact?.createdAt ?? dependencies.now().toISOString();
  const currentCandidateIds = new Set(basePrepared.plan.candidateFileIds);
  const sourceByJobId = new Map(
    basePrepared.rows
      .filter(row => currentCandidateIds.has(row.id))
      .map(row => [buildReindexJobId(runId, row.id), row] as const)
  );
  const currentJobIds = [...sourceByJobId.keys()].sort();
  const retainedJobs = await dependencies.inspectJobs(currentJobIds);
  const retainedById = new Map(retainedJobs.map(job => [job.jobId, job]));
  const acceptedJobIds = new Set(loadedArtifact?.acceptedJobIds ?? []);
  const completedJobIds = new Set(loadedArtifact?.completedJobIds ?? []);
  const failures = new Map(
    (loadedArtifact?.failures ?? []).map(failure => [failure.jobId, { ...failure }])
  );
  const skipFileIds = new Set<string>();
  const failedRetainedJobIds = new Set<string>();
  const retainedWaitHandles = new Map<string, ReindexJobHandle>();

  for (const [jobId, row] of sourceByJobId) {
    const retained = retainedById.get(jobId);
    const recordedFailure = failures.has(jobId);
    if (retained) {
      const parsed = DocumentProcessingJobDataSchema.safeParse(retained.data);
      if (
        !parsed.success ||
        parsed.data.fileId !== row.id ||
        parsed.data.qdrantReindexRunId !== runId ||
        parsed.data.qdrantTargetCollection !== targetCollection
      ) {
        throw new Error(`Retained BullMQ job ${jobId} does not match this run target and file`);
      }
      if (retained.state === 'unknown') {
        throw new Error(`Retained BullMQ job ${jobId} has an unknown state`);
      }
      if (retained.state === 'failed') {
        failedRetainedJobIds.add(jobId);
        acceptedJobIds.delete(jobId);
        completedJobIds.delete(jobId);
        skipFileIds.delete(row.id);
        continue;
      }

      acceptedJobIds.add(jobId);
      skipFileIds.add(row.id);
      failures.delete(jobId);
      if (retained.state === 'completed') {
        completedJobIds.add(jobId);
      } else {
        if (!retained.waitForTerminal) {
          throw new Error(`Retained BullMQ job ${jobId} cannot be awaited safely`);
        }
        retainedWaitHandles.set(jobId, { waitForTerminal: retained.waitForTerminal });
      }
      continue;
    }

    if (completedJobIds.has(jobId) && !recordedFailure) {
      // Only terminal success checkpointed in the durable ledger proves that a
      // job removed by BullMQ retention is safe to skip. Accepted-only state is
      // ambiguous after Redis loss and is retried with deterministic point IDs.
      acceptedJobIds.add(jobId);
      skipFileIds.add(row.id);
    }
  }

  let prepared = rebuildPreparedPlan(basePrepared, skipFileIds);
  const plannedJobIds = new Set([...(loadedArtifact?.plannedJobIds ?? []), ...currentJobIds]);
  const artifact: ReindexExecutionArtifact = {
    schemaVersion: 3,
    mode: 'execute',
    runId,
    targetCollection,
    recoveryRunId: basePrepared.plan.recoveryRunId!,
    recoveryManifestSha256: basePrepared.plan.recoveryManifestSha256!,
    verificationFingerprint: calculateReindexVerificationFingerprint(basePrepared.plan),
    status: 'planned',
    createdAt,
    updatedAt: dependencies.now().toISOString(),
    concurrency,
    jobTimeoutMs,
    counts: {
      eligible: prepared.plan.eligible,
      recoverable: prepared.plan.recoverable,
      auditedFailed: prepared.plan.auditedFailed,
      unresolvedMissing: prepared.plan.unresolvedMissing,
      unresolvedInvalid: prepared.plan.unresolvedInvalid,
      expectedDocuments: prepared.plan.expectedDocuments,
      planned: plannedJobIds.size,
      accepted: 0,
      completed: 0,
      failed: 0,
      pending: plannedJobIds.size,
      alreadyEnqueued: prepared.plan.alreadyEnqueued,
      missingSource: prepared.plan.missingSource,
      invalidSourcePath: prepared.plan.invalidSourcePath,
      unsupported: prepared.plan.unsupported,
      gaps: prepared.plan.gaps.length,
    },
    plannedJobIds: [...plannedJobIds].sort(),
    acceptedJobIds: [],
    completedJobIds: [],
    failures: [],
    gaps: prepared.plan.gaps,
  };

  let checkpointChain = Promise.resolve();
  const checkpoint = async (status: ReindexExecutionArtifact['status']): Promise<void> => {
    artifact.status = artifact.status === 'failed' || status === 'failed' ? 'failed' : status;
    artifact.updatedAt = dependencies.now().toISOString();
    artifact.acceptedJobIds = [...acceptedJobIds].sort();
    artifact.completedJobIds = [...completedJobIds].sort();
    artifact.failures = [...failures.values()].sort((left, right) =>
      left.jobId.localeCompare(right.jobId)
    );
    artifact.counts.accepted = acceptedJobIds.size;
    artifact.counts.completed = completedJobIds.size;
    artifact.counts.failed = failures.size;
    artifact.counts.pending = artifact.plannedJobIds.filter(
      jobId => !completedJobIds.has(jobId) && !failures.has(jobId)
    ).length;
    const snapshot = structuredClone(artifact);
    checkpointChain = checkpointChain.then(() =>
      dependencies.persistArtifact(snapshot, artifactPath)
    );
    await checkpointChain;
  };

  await checkpoint('planned');

  if (!loadedArtifact) {
    const nextJournal = validateRecoveryJournalTransition(recoveryBinding.journal, {
      ...recoveryBinding.journal,
      revision: recoveryBinding.journal.revision + 1,
      phase: 'reindex_started',
    });
    const persisted = await dependencies.persistRecoveryJournalTransition({
      expectedRevision: recoveryBinding.journal.revision,
      next: nextJournal,
    });
    if (JSON.stringify(persisted) !== JSON.stringify(nextJournal)) {
      throw new Error('Persisted reindex_started recovery journal was not confirmed');
    }
    recoveryBinding.journal = persisted;
  }

  const freshCandidateIds = new Set(prepared.plan.candidateFileIds);
  const tasks = basePrepared.rows
    .filter(row => freshCandidateIds.has(row.id))
    .map(row => ({ row, retainedHandle: undefined as ReindexJobHandle | undefined }));
  for (const [jobId, handle] of retainedWaitHandles) {
    const row = sourceByJobId.get(jobId);
    if (row) tasks.push({ row, retainedHandle: handle });
  }
  tasks.sort((left, right) => left.row.id.localeCompare(right.row.id));

  let halted = false;
  let enqueuedThisRun = 0;
  await mapWithConcurrency(tasks, concurrency, async task => {
    if (halted) return;
    const row = task.row;
    const jobId = buildReindexJobId(runId, row.id);
    let handle = task.retainedHandle;
    if (!handle) {
      try {
        if (failedRetainedJobIds.has(jobId)) await dependencies.removeJob(jobId);
        const verifiedFilePath = basePrepared.sourceProbe.resolvedFilePaths.get(row.id);
        if (!verifiedFilePath) {
          throw new Error(`Canonical source path was not retained for ${row.id}`);
        }
        const jobData = DocumentProcessingJobDataSchema.parse({
          jobType: JobType.DOCUMENT_PROCESSING,
          organizationId: row.organizationId,
          courseId: row.courseId,
          userId: row.userId,
          fileId: row.id,
          filePath: verifiedFilePath,
          mimeType: row.mimeType,
          chunkSize: 512,
          chunkOverlap: 50,
          createdAt,
          locale: row.locale,
          qdrantTargetCollection: targetCollection,
          qdrantReindexRunId: runId,
        });
        handle = await dependencies.enqueueJob(jobId, jobData);
        enqueuedThisRun += 1;
        acceptedJobIds.add(jobId);
        failures.delete(jobId);
        await checkpoint('running');
      } catch {
        failures.set(jobId, { jobId, fileId: row.id, phase: 'enqueue' });
        halted = true;
        await checkpoint('failed');
        return;
      }
    }

    try {
      await handle.waitForTerminal(jobTimeoutMs);
      completedJobIds.add(jobId);
      failures.delete(jobId);
      await checkpoint('running');
    } catch (error) {
      failures.set(jobId, {
        jobId,
        fileId: row.id,
        phase: error instanceof ReindexJobTimeoutError ? 'timeout' : 'terminal',
      });
      halted = true;
      await checkpoint('failed');
    }
  });

  prepared = rebuildPreparedPlan(basePrepared, skipFileIds);
  const finalStatus = failures.size > 0 || artifact.counts.pending > 0 ? 'failed' : 'completed';
  await checkpoint(finalStatus);
  const failed = failures.size;
  const pending = artifact.counts.pending;

  return {
    exitCode: finalStatus === 'failed' ? 1 : getReindexPlanExitCode(prepared.plan),
    report: {
      ok: finalStatus === 'completed',
      runId,
      targetCollection,
      concurrency,
      jobTimeoutMs,
      enqueued: enqueuedThisRun,
      completed: completedJobIds.size,
      failed,
      pending,
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
  targetCollection: string,
  recoveryBinding: RecoveryReindexBinding
): Promise<ReindexCommandResult> {
  if (!options.runId) throw new Error('--run-id is required for recovery-bound verify');
  const artifactPath = options.artifactPath ?? `artifacts/qdrant-reindex/${options.runId}.json`;
  const artifact = await dependencies.loadArtifact(artifactPath);
  if (
    !artifact ||
    artifact.runId !== options.runId ||
    artifact.targetCollection !== targetCollection
  ) {
    throw new Error('Recovery-bound verify requires its exact durable run artifact');
  }
  const prepared = await preparePlan(options, dependencies, recoveryBinding);
  if (getReindexPlanExitCode(prepared.plan) === 2) {
    return { exitCode: 2, report: prepared.plan };
  }
  assertRecoveryPhase(recoveryBinding, artifact);
  assertArtifactRecoveryBinding(artifact, prepared.plan);
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
    exitCode: getReindexPlanExitCode(prepared.plan),
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
    const recoveryBinding = await requireRecoveryBinding(dependencies);
    let prepared = await preparePlan(options, dependencies, recoveryBinding);
    if (options.runId) {
      const artifactPath = options.artifactPath ?? `artifacts/qdrant-reindex/${options.runId}.json`;
      const ledger = await dependencies.loadArtifact(artifactPath);
      if (ledger && ledger.runId !== options.runId) {
        throw new Error(
          `Run artifact ${artifactPath} belongs to run ${ledger.runId}, not ${options.runId}`
        );
      }
      if (ledger) {
        assertRecoveryPhase(recoveryBinding, ledger);
        assertArtifactRecoveryBinding(ledger, prepared.plan);
        const failedJobIds = new Set(ledger.failures.map(failure => failure.jobId));
        const acceptedFileIds = new Set(
          prepared.rows.flatMap(row => {
            const jobId = buildReindexJobId(options.runId!, row.id);
            return ledger.acceptedJobIds.includes(jobId) && !failedJobIds.has(jobId)
              ? [row.id]
              : [];
          })
        );
        prepared = rebuildPreparedPlan(prepared, acceptedFileIds);
      }
      assertRecoveryPhase(recoveryBinding, ledger);
    } else {
      assertRecoveryPhase(recoveryBinding, null);
    }
    return {
      exitCode: getReindexPlanExitCode(prepared.plan),
      report: prepared.plan,
    };
  }

  const targetCollection = validatePhysicalCollectionTarget(options.targetCollection);
  const recoveryBinding = await requireRecoveryBinding(dependencies);
  return options.mode === 'execute'
    ? executeReindex(options, dependencies, targetCollection, recoveryBinding)
    : verifyReindex(options, dependencies, targetCollection, recoveryBinding);
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
  hash: z.string().regex(/^[a-f0-9]{64}$/u),
  vectorStatus: z.string().min(1),
  errorMessage: z.string().nullable(),
  chunkCount: z.number().int().min(0).nullable(),
  locale: z.enum(['ru', 'en']),
  alreadyEnqueued: z.boolean(),
  sourceAvailable: z.boolean(),
  invalidSourcePath: z.boolean().optional(),
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
      pointCount: z.number().int().nonnegative(),
    })
  ),
  relevanceChecks: z.array(
    z.object({
      language: z.enum(['ru', 'en']),
      passed: z.boolean(),
      nativeHybrid: z.boolean(),
    })
  ),
  recoveryBinding: z.custom<RecoveryReindexBinding>(
    value => typeof value === 'object' && value !== null,
    'recoveryBinding is required'
  ),
});

const ReindexExecutionArtifactSchema = z.object({
  schemaVersion: z.literal(3),
  mode: z.literal('execute'),
  runId: z.string().uuid(),
  targetCollection: z.string().min(1).max(255),
  recoveryRunId: z.string().uuid(),
  recoveryManifestSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  verificationFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  status: z.enum(['planned', 'running', 'completed', 'failed']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  concurrency: z.number().int().min(1).max(MAX_CONCURRENCY),
  jobTimeoutMs: z.number().int().min(MIN_JOB_TIMEOUT_MS).max(MAX_JOB_TIMEOUT_MS),
  counts: z.object({
    eligible: z.number().int().nonnegative(),
    recoverable: z.number().int().nonnegative(),
    auditedFailed: z.number().int().nonnegative(),
    unresolvedMissing: z.number().int().nonnegative(),
    unresolvedInvalid: z.number().int().nonnegative(),
    expectedDocuments: z.number().int().nonnegative(),
    planned: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    alreadyEnqueued: z.number().int().nonnegative(),
    missingSource: z.number().int().nonnegative(),
    invalidSourcePath: z.number().int().nonnegative(),
    unsupported: z.number().int().nonnegative(),
    gaps: z.number().int().nonnegative(),
  }),
  plannedJobIds: z.array(z.string().min(1)),
  acceptedJobIds: z.array(z.string().min(1)),
  completedJobIds: z.array(z.string().min(1)),
  failures: z.array(
    z.object({
      jobId: z.string().min(1),
      fileId: z.string().min(1),
      phase: z.enum(['enqueue', 'terminal', 'timeout']),
    })
  ),
  gaps: z.array(
    z.object({
      fileId: z.string().min(1),
      reason: z.enum([
        'missing_course',
        'missing_user',
        'organization_mismatch',
        'invalid_source_path',
        'source_missing',
        'unsupported_mime',
      ]),
    })
  ),
});

export async function persistExecutionArtifact(
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

export async function loadExecutionArtifact(
  artifactPath: string
): Promise<ReindexExecutionArtifact | null> {
  try {
    const parsed = JSON.parse(await readFile(artifactPath, 'utf8')) as unknown;
    return ReindexExecutionArtifactSchema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
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
  const invalidIds = new Set(
    fixture.sources.filter(source => source.invalidSourcePath).map(source => source.id)
  );
  const sources = fixture.sources.map(
    ({ sourceAvailable: _sourceAvailable, invalidSourcePath: _invalidSourcePath, ...source }) =>
      source
  );

  return {
    loadRecoveryBinding: () => Promise.resolve(fixture.recoveryBinding),
    persistRecoveryJournalTransition: ({ next }) => Promise.resolve(next),
    loadSources: courseId =>
      Promise.resolve(
        sources.filter(source => courseId === undefined || source.courseId === courseId)
      ),
    probeSources: rows =>
      Promise.resolve({
        availableFileIds: new Set(rows.filter(row => availableIds.has(row.id)).map(row => row.id)),
        invalidPathFileIds: new Set(rows.filter(row => invalidIds.has(row.id)).map(row => row.id)),
        resolvedFilePaths: new Map(
          rows.map(row => [row.id, resolveUploadStoragePath(row.storagePath)] as const)
        ),
      }),
    inspectJobs: () => Promise.resolve([]),
    verifyPhysicalTarget: () => Promise.resolve({ ...fixture.schemaVerification }),
    enqueueJob: () =>
      Promise.resolve({
        waitForTerminal: () => Promise.resolve(),
      }),
    removeJob: () => Promise.resolve(),
    loadArtifact: loadExecutionArtifact,
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
    close: () => Promise.resolve(),
  };
}

export function createSourceDatabase(
  client: ReturnType<typeof getSupabaseAdmin> = getSupabaseAdmin()
): ReindexSourceDatabase {
  return {
    countFileCatalogSources: async courseId => {
      let query = client.from('file_catalog').select('id', { count: 'exact', head: true });
      if (courseId) query = query.eq('course_id', courseId);
      const { count, error } = await query;
      if (error) throw new Error(`Unable to count file_catalog reindex sources: ${error.message}`);
      if (count === null) throw new Error('file_catalog exact source count was not returned');
      return count;
    },
    listFileCatalogSourcesPage: async ({ courseId, afterId, limit }) => {
      let query = client.from('file_catalog').select(FILE_CATALOG_REINDEX_COLUMNS);
      if (courseId) query = query.eq('course_id', courseId);
      if (afterId) query = query.gt('id', afterId);
      const { data, error } = await query.order('id').limit(limit);
      if (error) throw new Error(`Unable to read file_catalog reindex sources: ${error.message}`);
      return (data ?? []) as unknown as DatabaseFileCatalogSourceRow[];
    },
    listCourseSources: async courseIds => {
      if (courseIds.length === 0) return [];
      const { data, error } = await client
        .from('courses')
        .select(COURSE_REINDEX_COLUMNS)
        .in('id', [...courseIds])
        .order('id');
      if (error) throw new Error(`Unable to read course reindex ownership: ${error.message}`);
      return (data ?? []) as unknown as DatabaseCourseSourceRow[];
    },
  };
}

export async function probeSourceFiles(
  rows: readonly ReindexSourceRow[]
): Promise<ReindexSourceProbeResult> {
  const uploadRoot = await realpath(getUploadStorageRootPath());
  const availableFileIds = new Set<string>();
  const invalidPathFileIds = new Set<string>();
  const resolvedFilePaths = new Map<string, string>();

  await Promise.all(
    rows.map(async row => {
      const hasTraversal = row.storagePath.split(/[\\/]/).includes('..');
      const candidatePath = resolveUploadStoragePath(row.storagePath);
      if (
        isAbsolute(row.storagePath) ||
        hasTraversal ||
        !isPathInsideUploadStorageRoot(candidatePath)
      ) {
        invalidPathFileIds.add(row.id);
        return;
      }

      try {
        const candidateRealPath = await realpath(candidatePath);
        const relativePath = relative(uploadRoot, candidateRealPath);
        if (
          relativePath === '' ||
          relativePath === '..' ||
          relativePath.startsWith(`..${sep}`) ||
          isAbsolute(relativePath)
        ) {
          invalidPathFileIds.add(row.id);
          return;
        }
        await access(candidateRealPath, constants.R_OK);
        availableFileIds.add(row.id);
        resolvedFilePaths.set(row.id, candidateRealPath);
      } catch {
        // Missing or unreadable canonical sources remain explicit source gaps.
      }
    })
  );

  return { availableFileIds, invalidPathFileIds, resolvedFilePaths };
}

function createDefaultReindexQueueAdapter(): ReturnType<typeof createReindexQueueAdapter> {
  let queueEvents: QueueEvents | null = null;
  const ensureQueueEvents = async (): Promise<QueueEvents> => {
    if (!queueEvents) {
      queueEvents = new QueueEvents(QUEUE_NAME, { connection: getRedisClient() });
    }
    await queueEvents.waitUntilReady();
    return queueEvents;
  };

  return createReindexQueueAdapter({
    getJob: async jobId => {
      const job = await getQueue().getJob(jobId);
      return (job ?? null) as unknown as ReindexQueueJobLike | null;
    },
    addJob: async (jobId, data) => {
      await ensureQueueEvents();
      return (await addJob(JobType.DOCUMENT_PROCESSING, data, {
        jobId,
      })) as unknown as ReindexQueueJobLike;
    },
    waitForJob: async (job, timeoutMs) => {
      const events = await ensureQueueEvents();
      try {
        await (job as unknown as Job).waitUntilFinished(events, timeoutMs);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/timed?\s*out|timeout/i.test(message)) {
          throw new ReindexJobTimeoutError(String(job.id ?? 'unknown'), timeoutMs);
        }
        throw error;
      }
    },
    close: async () => {
      if (queueEvents) {
        await queueEvents.close();
        queueEvents = null;
      }
      await closeQueue();
    },
  });
}

type ScrollOptions = NonNullable<Parameters<typeof qdrantClient.scroll>[1]>;

export async function loadIndexedDocumentIdentities(
  targetCollection: string,
  courseId?: string,
  client: Pick<typeof qdrantClient, 'scroll'> = qdrantClient
): Promise<IndexedDocumentIdentity[]> {
  const documents = new Map<string, IndexedDocumentIdentity>();
  let offset: ScrollOptions['offset'];

  while (true) {
    const response = await client.scroll(targetCollection, {
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
      documents.set(documentId, {
        documentId,
        courseId: indexedCourseId,
        organizationId,
        pointCount: (previous?.pointCount ?? 0) + 1,
      });
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

export interface ReindexRelevanceFixture {
  language: 'ru' | 'en';
  source: ReindexSourceRow;
  query: string;
}

export async function selectRelevanceFixtures(
  expectedSources: readonly ReindexSourceRow[],
  loadMarkdown: (sourceIds: readonly string[]) => Promise<Array<{ id: string; markdown: string }>>
): Promise<ReindexRelevanceFixture[]> {
  const fixtures: ReindexRelevanceFixture[] = [];
  for (const language of ['ru', 'en'] as const) {
    const candidates = expectedSources
      .filter(source => source.locale === language)
      .sort((left, right) => left.id.localeCompare(right.id));
    for (let index = 0; index < candidates.length; index += 200) {
      const batch = candidates.slice(index, index + 200);
      const markdownById = new Map(
        (await loadMarkdown(batch.map(source => source.id))).map(row => [row.id, row.markdown])
      );
      const fixture = batch
        .map(source => ({ source, query: deriveRelevanceQuery(markdownById.get(source.id) ?? '') }))
        .find(candidate => candidate.query !== null);
      if (fixture?.query) {
        fixtures.push({ language, source: fixture.source, query: fixture.query });
        break;
      }
    }
  }
  return fixtures;
}

async function runNativeRelevanceChecks(
  targetCollection: string,
  expectedSources: readonly ReindexSourceRow[]
): Promise<ReindexRelevanceCheck[]> {
  const fixtures = await selectRelevanceFixtures(expectedSources, async sourceIds => {
    if (sourceIds.length === 0) return [];
    const { data, error } = await getSupabaseAdmin()
      .from('file_catalog')
      .select('id, markdown_content')
      .in('id', [...sourceIds]);
    if (error) throw new Error(`Unable to load relevance fixture text: ${error.message}`);
    return (data ?? []).flatMap(row =>
      typeof row.markdown_content === 'string'
        ? [{ id: row.id, markdown: row.markdown_content }]
        : []
    );
  });

  const checks: ReindexRelevanceCheck[] = [];
  for (const language of ['ru', 'en'] as const) {
    const fixture = fixtures.find(candidate => candidate.language === language);
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
  const queueAdapter = createDefaultReindexQueueAdapter();
  return {
    loadRecoveryBinding: () => Promise.resolve(null),
    persistRecoveryJournalTransition: () =>
      Promise.reject(new Error('Recovery journal persistence adapter is not configured')),
    loadSources: courseId => loadReindexSources(createSourceDatabase(), courseId),
    probeSources: probeSourceFiles,
    ...queueAdapter,
    verifyPhysicalTarget: async targetCollection => {
      const result = await verifyPhysicalCourseEmbeddingsCollection({
        physicalName: targetCollection,
      });
      return { ok: result.ok, mismatches: result.mismatches };
    },
    loadArtifact: loadExecutionArtifact,
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
  --concurrency <count>       Bounded in-flight Stage 2 jobs (default: 2, max: 16)
  --job-timeout-ms <ms>       Per-job terminal wait (default: 7200000, max: 86400000)
  --course-id <uuid>          Limit source and parity checks to one course
  --run-id <uuid>             Reuse a durable run identity for idempotent execute
  --artifact <path>           Execute artifact output path
  --fixture <path>            Fully local dry fixture; no live adapters are constructed
  -h, --help                  Show this help
`;

function formatHumanSummary(options: ReindexCommandOptions, report: ReindexCommandReport): string {
  if (options.mode !== 'plan' && 'candidateFileIds' in report) {
    const unresolved = report.unresolvedMissing + report.unresolvedInvalid;
    return `${options.mode.toUpperCase()} status=blocked eligible=${report.eligible} audited_failed=${report.auditedFailed} unresolved=${unresolved} action=repair-sources\n`;
  }
  if (options.mode === 'plan') {
    const plan = report as ReindexPlan;
    const unresolved = plan.unresolvedMissing + plan.unresolvedInvalid;
    return `PLAN status=${unresolved === 0 ? 'ok' : 'gaps'} eligible=${plan.eligible} recoverable=${plan.recoverable} audited_failed=${plan.auditedFailed} unresolved=${unresolved} action=${unresolved === 0 ? 'none' : 'review-gaps'}\n`;
  }
  if (options.mode === 'execute') {
    const execution = report as Extract<ReindexCommandReport, { runId: string; enqueued: number }>;
    return `EXECUTE status=${execution.ok ? 'ok' : 'failed'} target=${execution.targetCollection} run=${execution.runId} enqueued=${execution.enqueued} completed=${execution.completed} failed=${execution.failed} pending=${execution.pending} gaps=${execution.gaps.length} action=${execution.ok ? 'verify' : 'resume-run'}\n`;
  }
  const verification = report as ReindexVerificationResult & { gaps: ReindexPlan['gaps'] };
  return `VERIFY status=${verification.ok ? 'ok' : 'failed'} target=${options.targetCollection ?? 'missing'} expected_documents=${verification.expectedDocuments} indexed_documents=${verification.indexedDocuments} expected_points=${verification.expectedKnownPoints} indexed_points=${verification.indexedPoints} gaps=${verification.gaps.length} action=${verification.ok ? 'review-cutover' : 'repair'}\n`;
}

function countGapReasons(gaps: ReindexPlan['gaps']): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const gap of gaps) counts[gap.reason] = (counts[gap.reason] ?? 0) + 1;
  return counts;
}

function redactReportForCli(report: ReindexCommandReport): Record<string, unknown> {
  if ('candidateFileIds' in report) {
    return {
      eligible: report.eligible,
      recoverable: report.recoverable,
      auditedFailed: report.auditedFailed,
      unresolvedMissing: report.unresolvedMissing,
      unresolvedInvalid: report.unresolvedInvalid,
      missingSource: report.missingSource,
      invalidSourcePath: report.invalidSourcePath,
      unsupported: report.unsupported,
      alreadyEnqueued: report.alreadyEnqueued,
      expectedDocuments: report.expectedDocuments,
      gapReasons: countGapReasons(report.gaps),
    };
  }
  if ('enqueued' in report) {
    return {
      ok: report.ok,
      targetCollection: report.targetCollection,
      enqueued: report.enqueued,
      completed: report.completed,
      failed: report.failed,
      pending: report.pending,
      alreadyEnqueued: report.alreadyEnqueued,
      gapReasons: countGapReasons(report.gaps),
      schemaMismatches: report.schemaMismatches,
    };
  }
  return {
    ok: report.ok,
    expectedDocuments: report.expectedDocuments,
    indexedDocuments: report.indexedDocuments,
    expectedKnownPoints: report.expectedKnownPoints,
    indexedPoints: report.indexedPoints,
    missingDocuments: report.missingDocumentIds.length,
    extraDocuments: report.extraDocumentIds.length,
    contextMismatches: report.contextMismatches.length,
    countMismatches: report.countMismatches.length,
    pointCountMismatches: report.pointCountMismatches.length,
    schemaMismatches: report.schemaMismatches,
    relevanceFailures: report.relevanceFailures,
    gapReasons: countGapReasons(report.gaps),
  };
}

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
  try {
    const result = await runReindexCommand(options, dependencies);
    runtime.stderr(formatHumanSummary(options, result.report));
    runtime.stdout(
      `${JSON.stringify(
        {
          mode: options.mode,
          dryFixture: Boolean(options.fixturePath),
          report: redactReportForCli(result.report),
        },
        null,
        2
      )}\n`
    );
    return result.exitCode;
  } finally {
    await dependencies.close?.();
  }
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
