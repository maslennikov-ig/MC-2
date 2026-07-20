import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  access,
  constants,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
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
import {
  createDefaultSourceRecoveryReindexAdapters,
  normalizeSourceRecoveryReindexAdapterConfig,
  type AcceptedCoverageRunConfig,
  type SourceRecoveryReindexAdapterConfig,
} from './source-recovery-reindex-adapters';
import { requireQ12CapabilityFetchInstalled } from './source-recovery-database';

export type ReindexCommandMode = 'plan' | 'execute' | 'verify';

export interface ReindexCommandOptions {
  mode: ReindexCommandMode;
  targetCollection?: string;
  concurrency?: number;
  jobTimeoutMs?: number;
  runId?: string;
  artifactPath?: string;
}

export interface ReindexCliOptions extends ReindexCommandOptions {
  fixturePath?: string;
  recoveryAdapterConfig?: SourceRecoveryReindexAdapterConfig;
  help: boolean;
}

export interface ReindexCliRuntime {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  createDefaultDependencies: (
    config?: SourceRecoveryReindexAdapterConfig
  ) => ReindexCommandDependencies;
  loadFixtureDependencies: (path: string) => Promise<ReindexCommandDependencies>;
}

export interface ReindexExecutionArtifact {
  schemaVersion: 4;
  mode: 'execute';
  runId: string;
  targetCollection: string;
  recoveryRunId: string;
  recoveryManifestSha256: string;
  acceptedCoverageLedgerIds: string[];
  acceptedCoverageStatus: 'accepted';
  acceptedCoverageFingerprint: string;
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
  }) => Promise<void>;
  loadSources: () => Promise<ReindexSourceRow[]>;
  probeSources: (rows: readonly ReindexSourceRow[]) => Promise<ReindexSourceProbeResult>;
  inspectJobs: (jobIds: readonly string[]) => Promise<ReindexRetainedJob[]>;
  verifyPhysicalTarget: (targetCollection: string) => Promise<ReindexSchemaVerification>;
  enqueueJob: (jobId: string, data: DocumentProcessingJobData) => Promise<ReindexJobHandle>;
  removeJob: (jobId: string) => Promise<void>;
  loadArtifact: (artifactPath: string) => Promise<ReindexExecutionArtifact | null>;
  persistArtifact: (
    artifact: ReindexExecutionArtifact,
    artifactPath: string,
    options: { publication: 'initial' | 'replace' }
  ) => Promise<void>;
  loadIndexedDocuments: (targetCollection: string) => Promise<IndexedDocumentIdentity[]>;
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
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UUID_V4_SCHEMA = z.string().regex(UUID_V4_PATTERN, 'must be a lowercase UUIDv4');

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
  const acceptedCoverageRuns: AcceptedCoverageRunConfig[] = [];
  const recoveryConfig: Partial<SourceRecoveryReindexAdapterConfig> = {};
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
      '--run-id',
      '--artifact',
      '--fixture',
      '--recovery-manifest-path',
      '--recovery-journal-path',
      '--recovery-run-id',
      '--recovery-manifest-sha256',
      '--accepted-coverage-fingerprint',
      '--accepted-coverage-run',
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
    if (option === '--run-id') options.runId = value;
    if (option === '--artifact') options.artifactPath = value;
    if (option === '--fixture') options.fixturePath = value;
    if (option === '--recovery-manifest-path') recoveryConfig.manifestPath = value;
    if (option === '--recovery-journal-path') recoveryConfig.journalPath = value;
    if (option === '--recovery-run-id') recoveryConfig.expectedRecoveryRunId = value;
    if (option === '--recovery-manifest-sha256') {
      recoveryConfig.expectedRecoveryManifestSha256 = value;
    }
    if (option === '--accepted-coverage-fingerprint') {
      recoveryConfig.expectedCoverageFingerprint = value;
    }
    if (option === '--accepted-coverage-run') {
      const parts = value.split(':');
      if (parts.length !== 3) {
        throw new Error('--accepted-coverage-run must be organization:course:run UUIDs');
      }
      acceptedCoverageRuns.push({
        organizationId: parts[0],
        courseId: parts[1],
        runId: parts[2],
      });
    }
  }

  if (!modeSeen && !options.help) {
    throw new Error('A mode is required: plan, execute, or verify');
  }
  if (options.concurrency !== undefined) resolveConcurrency(options.concurrency);
  if (options.jobTimeoutMs !== undefined) resolveJobTimeout(options.jobTimeoutMs);
  const recoveryConfigured =
    Object.keys(recoveryConfig).length > 0 || acceptedCoverageRuns.length > 0;
  if (recoveryConfigured) {
    if (
      !recoveryConfig.manifestPath ||
      !recoveryConfig.journalPath ||
      !recoveryConfig.expectedRecoveryRunId ||
      !recoveryConfig.expectedRecoveryManifestSha256 ||
      !recoveryConfig.expectedCoverageFingerprint ||
      acceptedCoverageRuns.length === 0
    ) {
      throw new Error('Exact source recovery adapter configuration is incomplete');
    }
    options.recoveryAdapterConfig = normalizeSourceRecoveryReindexAdapterConfig({
      manifestPath: recoveryConfig.manifestPath,
      journalPath: recoveryConfig.journalPath,
      expectedRecoveryRunId: recoveryConfig.expectedRecoveryRunId,
      expectedRecoveryManifestSha256: recoveryConfig.expectedRecoveryManifestSha256,
      expectedCoverageFingerprint: recoveryConfig.expectedCoverageFingerprint,
      acceptedCoverageRuns,
    });
  }
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
  if (!UUID_V4_PATTERN.test(value)) {
    throw new Error(`${option} must be a lowercase UUIDv4`);
  }
  return value;
}

async function preparePlan(
  options: ReindexCommandOptions,
  dependencies: ReindexCommandDependencies,
  recoveryBinding: RecoveryReindexBinding,
  alreadyEnqueuedFileIds: ReadonlySet<string> = new Set()
): Promise<PreparedPlan> {
  const sourceRows = await dependencies.loadSources();
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
  ReindexExecutionArtifactSchema.parse(artifact);
  if (
    artifact.recoveryRunId !== plan.recoveryRunId ||
    artifact.recoveryManifestSha256 !== plan.recoveryManifestSha256 ||
    JSON.stringify(artifact.acceptedCoverageLedgerIds) !==
      JSON.stringify(plan.acceptedCoverageLedgerIds) ||
    artifact.acceptedCoverageStatus !== plan.acceptedCoverageStatus ||
    artifact.acceptedCoverageFingerprint !== plan.acceptedCoverageFingerprint ||
    artifact.verificationFingerprint !== plan.verificationFingerprint
  ) {
    throw new Error('Run artifact recovery binding or verification fingerprint is stale');
  }
  if (
    artifact.counts.eligible !== plan.eligible ||
    artifact.counts.recoverable !== plan.recoverable ||
    artifact.counts.auditedFailed !== plan.auditedFailed ||
    artifact.counts.unresolvedMissing !== plan.unresolvedMissing ||
    artifact.counts.unresolvedInvalid !== plan.unresolvedInvalid ||
    artifact.counts.expectedDocuments !== plan.expectedDocuments ||
    artifact.counts.alreadyEnqueued !== plan.alreadyEnqueued ||
    artifact.counts.missingSource !== plan.missingSource ||
    artifact.counts.invalidSourcePath !== plan.invalidSourcePath ||
    artifact.counts.unsupported !== plan.unsupported ||
    artifact.counts.gaps !== plan.gaps.length
  ) {
    throw new Error('Run artifact audited recovery counts are stale');
  }
  const expectedPlannedJobIds = plan.candidateFileIds
    .map(fileId => buildReindexJobId(artifact.runId, fileId))
    .sort();
  if (JSON.stringify(artifact.plannedJobIds) !== JSON.stringify(expectedPlannedJobIds)) {
    throw new Error('Run artifact planned ledger IDs do not match the current fingerprint');
  }
}

function assertRecoveryPhase(
  binding: RecoveryReindexBinding,
  artifact: ReindexExecutionArtifact | null,
  mode: ReindexCommandMode
): void {
  if (mode === 'plan') {
    if (!artifact && binding.journal.phase !== 'verified') {
      throw new Error('A fresh plan requires a verified recovery journal');
    }
    if (
      artifact &&
      binding.journal.phase !== 'reindex_started' &&
      binding.journal.phase !== 'complete'
    ) {
      throw new Error('A resumed plan requires reindex_started or complete recovery state');
    }
    return;
  }
  if (mode === 'execute') {
    if (!artifact && binding.journal.phase === 'verified') return;
    if (artifact?.status === 'planned' && binding.journal.phase === 'verified') return;
    if (artifact && binding.journal.phase === 'reindex_started') return;
    if (binding.journal.phase === 'complete') {
      throw new Error('Execute is forbidden after the recovery run is complete');
    }
    throw new Error('Execute recovery phase does not match its durable ledger');
  }
  if (!artifact || artifact.status !== 'completed') {
    throw new Error('Verify requires an exact terminal-success ledger');
  }
  if (binding.journal.phase !== 'reindex_started' && binding.journal.phase !== 'complete') {
    throw new Error('Verify requires reindex_started or complete recovery state');
  }
}

function canonicalJournal(journal: RecoveryProgressJournal): string {
  const sortRecord = (record: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
  return JSON.stringify({
    ...journal,
    copy_states: sortRecord(journal.copy_states),
    disposition_kinds: sortRecord(journal.disposition_kinds),
    disposition_states: sortRecord(journal.disposition_states),
  });
}

async function persistAndReloadRecoveryJournal(
  dependencies: ReindexCommandDependencies,
  prepared: PreparedPlan,
  current: RecoveryReindexBinding,
  next: RecoveryProgressJournal
): Promise<RecoveryReindexBinding> {
  await dependencies.persistRecoveryJournalTransition({
    expectedRevision: current.journal.revision,
    next,
  });
  const reloaded = await dependencies.loadRecoveryBinding();
  if (!reloaded || canonicalJournal(reloaded.journal) !== canonicalJournal(next)) {
    throw new Error('Persisted recovery journal reload did not confirm the exact transition');
  }
  const confirmedPlan = buildReindexPlan(
    prepared.rows,
    row =>
      prepared.sourceProbe.invalidPathFileIds.has(row.id)
        ? 'invalid_source_path'
        : prepared.sourceProbe.availableFileIds.has(row.id),
    reloaded
  );
  if (confirmedPlan.verificationFingerprint !== prepared.plan.verificationFingerprint) {
    throw new Error('Persisted recovery journal reload changed the verified recovery binding');
  }
  return reloaded;
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
  assertRecoveryPhase(recoveryBinding, loadedArtifact, 'execute');
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
    schemaVersion: 4,
    mode: 'execute',
    runId,
    targetCollection,
    recoveryRunId: basePrepared.plan.recoveryRunId!,
    recoveryManifestSha256: basePrepared.plan.recoveryManifestSha256!,
    acceptedCoverageLedgerIds: basePrepared.plan.acceptedCoverageLedgerIds!,
    acceptedCoverageStatus: basePrepared.plan.acceptedCoverageStatus!,
    acceptedCoverageFingerprint: basePrepared.plan.acceptedCoverageFingerprint!,
    verificationFingerprint: calculateReindexVerificationFingerprint(basePrepared.plan),
    status: loadedArtifact?.status ?? 'planned',
    createdAt,
    updatedAt: dependencies.now().toISOString(),
    concurrency,
    jobTimeoutMs,
    counts: {
      eligible: basePrepared.plan.eligible,
      recoverable: basePrepared.plan.recoverable,
      auditedFailed: basePrepared.plan.auditedFailed,
      unresolvedMissing: basePrepared.plan.unresolvedMissing,
      unresolvedInvalid: basePrepared.plan.unresolvedInvalid,
      expectedDocuments: basePrepared.plan.expectedDocuments,
      planned: plannedJobIds.size,
      accepted: 0,
      completed: 0,
      failed: 0,
      pending: plannedJobIds.size,
      alreadyEnqueued: basePrepared.plan.alreadyEnqueued,
      missingSource: basePrepared.plan.missingSource,
      invalidSourcePath: basePrepared.plan.invalidSourcePath,
      unsupported: basePrepared.plan.unsupported,
      gaps: basePrepared.plan.gaps.length,
    },
    plannedJobIds: [...plannedJobIds].sort(),
    acceptedJobIds: [],
    completedJobIds: [],
    failures: [],
    gaps: basePrepared.plan.gaps,
  };

  let checkpointChain = Promise.resolve();
  let artifactPublished = loadedArtifact !== null;
  const checkpoint = async (status: ReindexExecutionArtifact['status']): Promise<void> => {
    artifact.status = failures.size > 0 || status === 'failed' ? 'failed' : status;
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
    checkpointChain = checkpointChain.then(async () => {
      await dependencies.persistArtifact(snapshot, artifactPath, {
        publication: artifactPublished ? 'replace' : 'initial',
      });
      artifactPublished = true;
    });
    await checkpointChain;
  };

  await checkpoint(loadedArtifact?.status ?? 'planned');

  if (recoveryBinding.journal.phase === 'verified') {
    const nextJournal = validateRecoveryJournalTransition(recoveryBinding.journal, {
      ...recoveryBinding.journal,
      revision: recoveryBinding.journal.revision + 1,
      phase: 'reindex_started',
    });
    recoveryBinding = await persistAndReloadRecoveryJournal(
      dependencies,
      basePrepared,
      recoveryBinding,
      nextJournal
    );
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
  assertRecoveryPhase(recoveryBinding, artifact, 'verify');
  assertArtifactRecoveryBinding(artifact, prepared.plan);
  const expectedSources = selectExpectedSources(prepared);
  const [schemaVerification, indexedDocuments, relevanceChecks] = await Promise.all([
    dependencies.verifyPhysicalTarget(targetCollection),
    dependencies.loadIndexedDocuments(targetCollection),
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
  if (recoveryBinding.journal.phase === 'reindex_started') {
    const completeJournal = validateRecoveryJournalTransition(recoveryBinding.journal, {
      ...recoveryBinding.journal,
      revision: recoveryBinding.journal.revision + 1,
      phase: 'complete',
    });
    await persistAndReloadRecoveryJournal(dependencies, prepared, recoveryBinding, completeJournal);
  }
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
        assertRecoveryPhase(recoveryBinding, ledger, 'plan');
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
      assertRecoveryPhase(recoveryBinding, ledger, 'plan');
    } else {
      assertRecoveryPhase(recoveryBinding, null, 'plan');
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
  runId: UUID_V4_SCHEMA.optional(),
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

function isUniqueSorted(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1] < value)
  );
}

const ReindexExecutionArtifactSchema = z
  .object({
    schemaVersion: z.literal(4),
    mode: z.literal('execute'),
    runId: UUID_V4_SCHEMA,
    targetCollection: z.string().min(1).max(255),
    recoveryRunId: UUID_V4_SCHEMA,
    recoveryManifestSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    acceptedCoverageLedgerIds: z.array(UUID_V4_SCHEMA).min(1),
    acceptedCoverageStatus: z.literal('accepted'),
    acceptedCoverageFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    verificationFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    status: z.enum(['planned', 'running', 'completed', 'failed']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    concurrency: z.number().int().min(1).max(MAX_CONCURRENCY),
    jobTimeoutMs: z.number().int().min(MIN_JOB_TIMEOUT_MS).max(MAX_JOB_TIMEOUT_MS),
    counts: z
      .object({
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
      })
      .strict(),
    plannedJobIds: z.array(z.string().min(1)),
    acceptedJobIds: z.array(z.string().min(1)),
    completedJobIds: z.array(z.string().min(1)),
    failures: z.array(
      z
        .object({
          jobId: z.string().min(1),
          fileId: z.string().min(1),
          phase: z.enum(['enqueue', 'terminal', 'timeout']),
        })
        .strict()
    ),
    gaps: z.array(
      z
        .object({
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
        .strict()
    ),
  })
  .strict()
  .superRefine((artifact, context) => {
    const issue = (message: string): void => {
      context.addIssue({ code: 'custom', message });
    };
    if (!isUniqueSorted(artifact.acceptedCoverageLedgerIds)) {
      issue('accepted coverage ledger IDs must be unique and sorted');
    }
    if (!isUniqueSorted(artifact.plannedJobIds))
      issue('planned ledger IDs must be unique and sorted');
    if (!isUniqueSorted(artifact.acceptedJobIds))
      issue('accepted ledger IDs must be unique and sorted');
    if (!isUniqueSorted(artifact.completedJobIds))
      issue('completed ledger IDs must be unique and sorted');
    const planned = new Set(artifact.plannedJobIds);
    const accepted = new Set(artifact.acceptedJobIds);
    const completed = new Set(artifact.completedJobIds);
    if ([...accepted].some(jobId => !planned.has(jobId)))
      issue('accepted ledger IDs must be planned');
    if ([...completed].some(jobId => !accepted.has(jobId)))
      issue('completed ledger IDs must be accepted');
    const failureIds = artifact.failures.map(failure => failure.jobId);
    if (!isUniqueSorted(failureIds)) issue('failure ledger IDs must be unique and sorted');
    if (failureIds.some(jobId => !planned.has(jobId))) issue('failure ledger IDs must be planned');
    if (failureIds.some(jobId => completed.has(jobId)))
      issue('completed and failed ledger IDs must be disjoint');
    for (const failure of artifact.failures) {
      if (failure.phase === 'enqueue' && accepted.has(failure.jobId)) {
        issue('enqueue failures cannot be accepted');
      }
      if (failure.phase !== 'enqueue' && !accepted.has(failure.jobId)) {
        issue('terminal failures must have been accepted');
      }
    }
    const pending = artifact.plannedJobIds.filter(
      jobId => !completed.has(jobId) && !failureIds.includes(jobId)
    ).length;
    if (
      artifact.counts.planned !== artifact.plannedJobIds.length ||
      artifact.counts.accepted !== artifact.acceptedJobIds.length ||
      artifact.counts.completed !== artifact.completedJobIds.length ||
      artifact.counts.failed !== artifact.failures.length ||
      artifact.counts.pending !== pending ||
      artifact.counts.gaps !== artifact.gaps.length
    ) {
      issue('ledger counts must exactly match durable arrays');
    }
    if (
      artifact.status === 'planned' &&
      (artifact.counts.accepted !== 0 ||
        artifact.counts.completed !== 0 ||
        artifact.counts.failed !== 0)
    ) {
      issue('planned ledger status requires untouched jobs');
    }
    if (artifact.status === 'running' && artifact.counts.failed !== 0) {
      issue('running ledger status cannot contain failures');
    }
    if (
      artifact.status === 'completed' &&
      (artifact.counts.failed !== 0 ||
        artifact.counts.pending !== 0 ||
        artifact.counts.completed !== artifact.counts.planned)
    ) {
      issue('completed ledger status requires exact terminal success');
    }
    if (
      artifact.status === 'failed' &&
      artifact.counts.failed === 0 &&
      artifact.counts.pending === 0
    ) {
      issue('failed ledger status requires a failure or pending work');
    }
  });

export interface ReindexArtifactWriteHandle {
  writeFile(content: string, encoding: 'utf8'): Promise<void>;
  chmod(mode: number): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface ReindexArtifactDirectoryHandle {
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface ReindexArtifactWriteOperations {
  mkdir(directory: string): Promise<unknown>;
  assertSecureDirectory(directory: string): Promise<void>;
  openTemporary(path: string, mode: number): Promise<ReindexArtifactWriteHandle>;
  link(from: string, to: string): Promise<unknown>;
  rename(from: string, to: string): Promise<unknown>;
  openDirectory(directory: string): Promise<ReindexArtifactDirectoryHandle>;
  unlink(path: string): Promise<unknown>;
}

const defaultArtifactWriteOperations: ReindexArtifactWriteOperations = {
  mkdir: directory => mkdir(directory, { recursive: true, mode: 0o700 }),
  async assertSecureDirectory(directory) {
    const metadata = await lstat(directory);
    const expectedUid = process.getuid?.();
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('Reindex state directory must be a secure real directory');
    }
    if ((metadata.mode & 0o777) !== 0o700) {
      throw new Error('Reindex state directory must have mode 0700');
    }
    if (expectedUid !== undefined && metadata.uid !== expectedUid) {
      throw new Error('Reindex state directory must be owned by the current executor');
    }
    if ((await realpath(directory)) !== resolve(directory)) {
      throw new Error('Reindex state directory must use a real parent boundary');
    }
  },
  openTemporary: (path, mode) => open(path, 'wx', mode),
  link,
  rename,
  openDirectory: directory => open(directory, 'r'),
  unlink,
};

async function fsyncArtifactDirectory(
  directory: string,
  operations: ReindexArtifactWriteOperations
): Promise<void> {
  const handle = await operations.openDirectory(directory);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function persistExecutionArtifact(
  artifact: ReindexExecutionArtifact,
  artifactPath: string,
  options: {
    publication: 'initial' | 'replace';
    operations?: ReindexArtifactWriteOperations;
  }
): Promise<void> {
  const normalized = ReindexExecutionArtifactSchema.parse(artifact);
  const operations = options.operations ?? defaultArtifactWriteOperations;
  const directory = dirname(artifactPath);
  await operations.mkdir(directory);
  await operations.assertSecureDirectory(directory);
  const temporaryPath = `${artifactPath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await operations.openTemporary(temporaryPath, 0o600);
  let closed = false;
  try {
    await handle.writeFile(`${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    closed = true;
    if (options.publication === 'initial') {
      try {
        await operations.link(temporaryPath, artifactPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new Error('Reindex run ledger already exists', { cause: error });
        }
        throw error;
      }
      await fsyncArtifactDirectory(directory, operations);
      await operations.unlink(temporaryPath);
      await fsyncArtifactDirectory(directory, operations);
    } else {
      await operations.rename(temporaryPath, artifactPath);
      await fsyncArtifactDirectory(directory, operations);
    }
  } catch (error) {
    if (!closed) await handle.close().catch(() => undefined);
    await operations.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function loadExecutionArtifact(
  artifactPath: string
): Promise<ReindexExecutionArtifact | null> {
  let metadata: Awaited<ReturnType<typeof lstat>>;
  try {
    metadata = await lstat(artifactPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
    throw new Error('Reindex artifact must be a non-symlink mode-0600 regular file');
  }
  const expectedUid = process.getuid?.();
  if (expectedUid !== undefined && metadata.uid !== expectedUid) {
    throw new Error('Reindex artifact must be owned by the current executor UID');
  }
  await defaultArtifactWriteOperations.assertSecureDirectory(dirname(artifactPath));
  const handle = await open(artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      (opened.mode & 0o777) !== 0o600 ||
      opened.dev !== metadata.dev ||
      opened.ino !== metadata.ino
    ) {
      throw new Error('Reindex artifact changed during protected open');
    }
    if (expectedUid !== undefined && opened.uid !== expectedUid) {
      throw new Error('Reindex artifact must be owned by the current executor UID');
    }
    const parsed = JSON.parse(await handle.readFile('utf8')) as unknown;
    return ReindexExecutionArtifactSchema.parse(parsed);
  } finally {
    await handle.close();
  }
}

export async function loadReindexFixtureDependencies(
  fixturePath: string
): Promise<ReindexCommandDependencies> {
  const fixture = ReindexDryFixtureSchema.parse(
    JSON.parse(await readFile(fixturePath, 'utf8')) as unknown
  );
  let currentRecoveryBinding = structuredClone(fixture.recoveryBinding);
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
    loadRecoveryBinding: () => Promise.resolve(structuredClone(currentRecoveryBinding)),
    persistRecoveryJournalTransition: ({ next }) => {
      currentRecoveryBinding = { ...currentRecoveryBinding, journal: structuredClone(next) };
      return Promise.resolve();
    },
    loadSources: () => Promise.resolve(sources),
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
    loadIndexedDocuments: () => Promise.resolve(fixture.indexedDocuments),
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

export function createDefaultReindexDependencies(
  recoveryAdapterConfig?: SourceRecoveryReindexAdapterConfig
): ReindexCommandDependencies {
  requireQ12CapabilityFetchInstalled();
  if (!recoveryAdapterConfig) {
    throw new Error('Exact source recovery adapter configuration is required');
  }
  const queueAdapter = createDefaultReindexQueueAdapter();
  const recoveryAdapters = createDefaultSourceRecoveryReindexAdapters(recoveryAdapterConfig);
  return {
    ...recoveryAdapters,
    loadSources: () => loadReindexSources(createSourceDatabase()),
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
  --run-id <uuid>             Reuse a durable run identity for idempotent execute
  --artifact <path>           Execute artifact output path
  --fixture <path>            Fully local dry fixture; no live adapters are constructed
  --recovery-manifest-path <absolute path>
  --recovery-journal-path <absolute path>
  --recovery-run-id <uuid>    Exact reviewed lower-case UUIDv4 recovery run
  --recovery-manifest-sha256 <sha256>
  --accepted-coverage-fingerprint <sha256>
  --accepted-coverage-run <organization_uuid:course_uuid:run_uuid> (repeat per course)
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
    return `EXECUTE status=${execution.ok ? 'ok' : 'failed'} enqueued=${execution.enqueued} completed=${execution.completed} failed=${execution.failed} pending=${execution.pending} gaps=${execution.gaps.length} schema_mismatches=${execution.schemaMismatches.length} action=${execution.ok ? 'verify' : 'resume-run'}\n`;
  }
  const verification = report as ReindexVerificationResult & { gaps: ReindexPlan['gaps'] };
  return `VERIFY status=${verification.ok ? 'ok' : 'failed'} expected_documents=${verification.expectedDocuments} indexed_documents=${verification.indexedDocuments} expected_points=${verification.expectedKnownPoints} indexed_points=${verification.indexedPoints} gaps=${verification.gaps.length} schema_mismatches=${verification.schemaMismatches.length} relevance_failures=${verification.relevanceFailures.length} action=${verification.ok ? 'review-cutover' : 'repair'}\n`;
}

function classifyCliError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('retained bullmq job')) return 'retained_job_mismatch';
  if (message.includes('run artifact') || message.includes('ledger')) {
    return 'artifact_binding_mismatch';
  }
  if (
    message.includes('file_catalog') ||
    message.includes('source count') ||
    message.includes('source inventory')
  ) {
    return 'source_inventory_invalid';
  }
  if (message.includes('fixture') || error instanceof z.ZodError) return 'fixture_invalid';
  if (message.includes('recovery journal') || message.includes('persisted')) {
    return 'journal_persistence_failed';
  }
  if (message.includes('recovery binding') || message.includes('coverage')) {
    return 'recovery_binding_invalid';
  }
  if (
    message.includes('unknown option') ||
    message.includes('mode') ||
    message.includes('run-id') ||
    message.includes('target-collection')
  ) {
    return 'invalid_arguments';
  }
  return 'internal';
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
      enqueued: report.enqueued,
      completed: report.completed,
      failed: report.failed,
      pending: report.pending,
      alreadyEnqueued: report.alreadyEnqueued,
      gapReasons: countGapReasons(report.gaps),
      schemaMismatchCount: report.schemaMismatches.length,
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
    schemaMismatchCount: report.schemaMismatches.length,
    relevanceFailureCount: report.relevanceFailures.length,
    gapReasons: countGapReasons(report.gaps),
  };
}

export async function runReindexCli(
  args: string[],
  runtime: ReindexCliRuntime
): Promise<0 | 1 | 2> {
  let dependencies: ReindexCommandDependencies | undefined;
  let exitCode: 0 | 1 | 2 = 1;
  let errorReported = false;
  try {
    const options = parseReindexCliArgs(args);
    if (options.help) {
      runtime.stdout(REINDEX_HELP);
      return 0;
    }
    dependencies = options.fixturePath
      ? await runtime.loadFixtureDependencies(options.fixturePath)
      : runtime.createDefaultDependencies(options.recoveryAdapterConfig);
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
    exitCode = result.exitCode;
  } catch (error) {
    runtime.stderr(`REINDEX_ERROR code=${classifyCliError(error)}\n`);
    errorReported = true;
  }
  try {
    await dependencies?.close?.();
  } catch {
    if (!errorReported) runtime.stderr('REINDEX_ERROR code=internal\n');
    exitCode = 1;
  }
  return exitCode;
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
      process.stderr.write(`REINDEX_ERROR code=${classifyCliError(error)}\n`);
      process.exitCode = 1;
    })
    .finally(async () => closeQueue());
}
