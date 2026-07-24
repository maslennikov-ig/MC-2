import 'dotenv/config';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin.js';
import { buildReindexPlan, loadReindexSources } from './reindex-plan.js';
import { createSourceDatabase, probeSourceFiles } from './reindex-course-embeddings.js';
import {
  applyDispositionEntry,
  createRecoveryDispositionDatabase,
  createSupabaseRecoveryGateway,
  type RecoveryDispositionDatabase,
  type RecoveryDispositionProgressState,
  type RecoverySupabaseClient,
} from './source-recovery-database.js';
import {
  preflightRecoveryCopies,
  preflightRecoveryExecution,
  publishNoReplace,
  reconcilePublishedTarget,
  reconcileRollbackTarget,
  rollbackPublished,
} from './source-recovery-filesystem.js';
import {
  RECOVERY_RUN_PHASES,
  calculateRecoveryManifestSha256,
  createInitialProgressJournal,
  normalizeRecoveryManifest,
  replaceProgressJournal,
  validateRecoveryJournalTransition,
  validateRecoveryProgressJournalBinding,
  writeImmutableManifest,
  type RecoveryCopyEntry,
  type RecoveryCounts,
  type RecoveryDispositionEntry,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from './source-recovery-manifest.js';

export type SourceRecoveryMode =
  | 'plan'
  | 'verify'
  | 'execute'
  | 'rollback'
  | 'apply-dispositions'
  | 'verify-dispositions';

export interface SourceRecoveryCliOptions {
  mode: SourceRecoveryMode;
  confirmRunId?: string;
  manifestPath?: string;
  journalPath?: string;
  planInputPath?: string;
  capabilityProbeDirectory?: string;
  help: boolean;
}

export interface ReviewedRecoveryState {
  manifest: SourceRecoveryManifest;
  manifestSha256: string;
  journal: RecoveryProgressJournal;
}

export type RecoveryCopyInspection = 'absent' | 'exact' | 'mismatch';

export interface RecoveryWorkflowDependencies {
  createPlan(): Promise<SourceRecoveryManifest>;
  preflightCopies(manifest: SourceRecoveryManifest): Promise<void>;
  preflightExecution(
    manifest: SourceRecoveryManifest,
    journal: RecoveryProgressJournal
  ): Promise<void>;
  writePlan(manifest: SourceRecoveryManifest): Promise<ReviewedRecoveryState>;
  loadReviewedState(): Promise<ReviewedRecoveryState>;
  persistJournal(
    current: RecoveryProgressJournal,
    next: RecoveryProgressJournal,
    manifest: SourceRecoveryManifest
  ): Promise<void>;
  readSourceCounts(): Promise<RecoveryCounts>;
  inspectCopy(
    entry: RecoveryCopyEntry,
    state: 'planned' | 'published' | 'rollback_planned' | 'rolled_back'
  ): Promise<RecoveryCopyInspection>;
  publishCopy(entry: RecoveryCopyEntry): Promise<void>;
  rollbackCopy(entry: RecoveryCopyEntry, journal: RecoveryProgressJournal): Promise<void>;
  applyDisposition(
    entry: RecoveryDispositionEntry,
    state: RecoveryDispositionProgressState,
    checkpoint: (
      state: RecoveryDispositionProgressState
    ) => Promise<RecoveryDispositionProgressState>
  ): Promise<RecoveryDispositionProgressState>;
  verifyDispositions(manifest: SourceRecoveryManifest): Promise<void>;
}

export interface RecoveryAggregateReport {
  ok: true;
  mode: SourceRecoveryMode;
  phase: RecoveryProgressJournal['phase'];
  copies: number;
  affectedRows: number;
  eligibleDispositions: number;
  careerPlaybookDispositions: number;
  counts?: RecoveryCounts;
  verifiedDispositions?: number;
  rolledBack?: number;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40,64}$/u;
const ENTRY_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const RELATIVE_PATH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\\)(?!.*\/\/).+$/u;

const CountsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    eligible: z.number().int().nonnegative(),
    recoverable: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    unsupported: z.number().int().nonnegative(),
  })
  .strict();

const CopySchema = z
  .object({
    entry_id: z.string().regex(ENTRY_ID_PATTERN),
    source_relative_path: z.string().regex(RELATIVE_PATH_PATTERN),
    target_relative_path: z.string().regex(RELATIVE_PATH_PATTERN),
    expected_size: z.number().int().nonnegative(),
    expected_sha256: z.string().regex(SHA256_PATTERN),
    affected_file_catalog_rows: z.number().int().positive(),
  })
  .strict();

const DispositionSchema = z
  .object({
    entry_id: z.string().regex(ENTRY_ID_PATTERN),
    kind: z.enum(['eligible_unrecoverable', 'career_playbook_retained_derived']),
    file_catalog_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    course_id: z.string().uuid().nullable(),
    expected_hash: z.string().regex(SHA256_PATTERN),
    expected_storage_path: z.string().regex(RELATIVE_PATH_PATTERN),
    expected_vector_status: z.enum(['pending', 'indexing', 'indexed', 'failed']),
    expected_file_error_message: z.string().max(1024).nullable(),
    reason: z.enum(['source_file_unrecoverable', 'retained-derived-only']),
  })
  .strict();

const ManifestSchema = z
  .object({
    schema_version: z.literal('megacampus.qdrant.source-recovery/v1'),
    run_id: z.string().regex(UUID_V4_PATTERN),
    release_sha: z.string().regex(RELEASE_SHA_PATTERN),
    generated_at: z.string().datetime(),
    operator_image_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    source_audit_version: z.string().min(1).max(128),
    development_root: z.string().refine(value => isAbsolute(value) && resolve(value) === value),
    production_root: z.string().refine(value => isAbsolute(value) && resolve(value) === value),
    pre_counts: CountsSchema,
    expected_post_counts: CountsSchema,
    copies: z.array(CopySchema),
    dispositions: z.array(DispositionSchema),
  })
  .strict();

const JournalSchema = z
  .object({
    schema_version: z.literal('megacampus.qdrant.source-recovery-progress/v1'),
    run_id: z.string().regex(UUID_V4_PATTERN),
    manifest_sha256: z.string().regex(SHA256_PATTERN),
    revision: z.number().int().nonnegative(),
    phase: z.enum(RECOVERY_RUN_PHASES),
    copy_states: z.record(
      z.string(),
      z.enum(['planned', 'published', 'rollback_planned', 'rolled_back'])
    ),
    disposition_kinds: z.record(
      z.string(),
      z.enum(['eligible_unrecoverable', 'career_playbook_retained_derived'])
    ),
    disposition_states: z.record(
      z.string(),
      z.enum(['disposition_planned', 'disposition_applied', 'disposition_verified'])
    ),
  })
  .strict();

const EXACT_PRE_COUNTS: RecoveryCounts = {
  total: 261,
  eligible: 240,
  recoverable: 109,
  missing: 129,
  invalid: 2,
  unsupported: 21,
};
const EXACT_POST_COUNTS: RecoveryCounts = {
  total: 261,
  eligible: 240,
  recoverable: 234,
  missing: 4,
  invalid: 2,
  unsupported: 21,
};

function sameCounts(left: RecoveryCounts, right: RecoveryCounts): boolean {
  return (Object.keys(left) as Array<keyof RecoveryCounts>).every(key => left[key] === right[key]);
}

function assertExactRecoveryContract(input: SourceRecoveryManifest): SourceRecoveryManifest {
  if (
    !sameCounts(input.pre_counts, EXACT_PRE_COUNTS) ||
    !sameCounts(input.expected_post_counts, EXACT_POST_COUNTS)
  ) {
    throw new Error('Manifest does not match the exact audited recovery totals');
  }
  const affectedRows = input.copies.reduce(
    (total, entry) => total + entry.affected_file_catalog_rows,
    0
  );
  const eligibleDispositions = input.dispositions.filter(
    entry => entry.kind === 'eligible_unrecoverable'
  ).length;
  const careerPlaybookDispositions = input.dispositions.filter(
    entry => entry.kind === 'career_playbook_retained_derived'
  ).length;
  if (
    input.copies.length !== 42 ||
    affectedRows !== 125 ||
    eligibleDispositions !== 6 ||
    careerPlaybookDispositions !== 18
  ) {
    throw new Error('Manifest does not match exact 42-copy/125-row/6+18 disposition totals');
  }
  return normalizeRecoveryManifest(input);
}

function validateLoadedJournal(
  manifest: SourceRecoveryManifest,
  manifestSha256: string,
  journal: RecoveryProgressJournal
): RecoveryProgressJournal {
  const validated = validateRecoveryProgressJournalBinding(manifest, manifestSha256, journal);
  return validateRecoveryJournalTransition(validated, {
    ...validated,
    revision: validated.revision + 1,
    copy_states: { ...validated.copy_states },
    disposition_kinds: { ...validated.disposition_kinds },
    disposition_states: { ...validated.disposition_states },
  });
}

function assertCurrentOwner(uid: number, label: string): void {
  if (process.getuid && uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the current UID`);
  }
}

async function assertOwnerOnlyStateDirectory(path: string, label: string): Promise<void> {
  const directory = dirname(path);
  const metadata = await lstat(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || (metadata.mode & 0o777) !== 0o700) {
    throw new Error(`${label} state directory must be a real mode-0700 owner-only directory`);
  }
  assertCurrentOwner(metadata.uid, `${label} state directory`);
  if ((await realpath(directory)) !== resolve(directory)) {
    throw new Error(`${label} state directory must not traverse a symbolic link`);
  }
}

async function readOwnerOnlyFile(path: string, label: string): Promise<string> {
  await assertOwnerOnlyStateDirectory(path, label);
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
    throw new Error(`${label} must be a non-symlink mode-0600 regular file`);
  }
  assertCurrentOwner(metadata.uid, label);

  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      (opened.mode & 0o777) !== 0o600 ||
      opened.dev !== metadata.dev ||
      opened.ino !== metadata.ino
    ) {
      throw new Error(`${label} changed during protected open`);
    }
    assertCurrentOwner(opened.uid, label);
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

export async function loadReviewedRecoveryState(input: {
  manifestPath: string;
  journalPath: string;
}): Promise<ReviewedRecoveryState> {
  const [manifestJson, journalJson] = await Promise.all([
    readOwnerOnlyFile(input.manifestPath, 'Recovery manifest'),
    readOwnerOnlyFile(input.journalPath, 'Recovery journal'),
  ]);
  const manifest = assertExactRecoveryContract(ManifestSchema.parse(JSON.parse(manifestJson)));
  const manifestSha256 = calculateRecoveryManifestSha256(manifest);
  const rawManifestSha256 = createHash('sha256').update(manifestJson).digest('hex');
  if (rawManifestSha256 !== manifestSha256) {
    throw new Error('Reviewed file does not contain canonical manifest bytes');
  }
  const journal = JournalSchema.parse(JSON.parse(journalJson));
  validateLoadedJournal(manifest, manifestSha256, journal);
  if (journal.run_id !== manifest.run_id || journal.manifest_sha256 !== manifestSha256) {
    throw new Error('Recovery journal binding does not match canonical reviewed manifest identity');
  }
  return { manifest, manifestSha256, journal };
}

export async function persistRecoveryJournalTransition(input: {
  journalPath: string;
  manifest: SourceRecoveryManifest;
  current: RecoveryProgressJournal;
  next: RecoveryProgressJournal;
}): Promise<void> {
  const manifest = assertExactRecoveryContract(input.manifest);
  const manifestSha256 = calculateRecoveryManifestSha256(manifest);
  validateRecoveryProgressJournalBinding(manifest, manifestSha256, input.current);
  const next = validateRecoveryJournalTransition(input.current, input.next);
  validateRecoveryProgressJournalBinding(manifest, manifestSha256, next);
  if (next.run_id !== manifest.run_id || next.manifest_sha256 !== manifestSha256) {
    throw new Error('Recovery journal transition is not bound to the canonical manifest');
  }
  await replaceProgressJournal(input.journalPath, input.current.revision, next, manifest);
}

const MODES = new Set<SourceRecoveryMode>([
  'plan',
  'verify',
  'execute',
  'rollback',
  'apply-dispositions',
  'verify-dispositions',
]);

function takeValue(args: readonly string[], index: number, option: string): [string, number] {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return [value, index + 1];
}

export function parseSourceRecoveryCliArgs(args: readonly string[]): SourceRecoveryCliOptions {
  let mode: SourceRecoveryMode = 'plan';
  let modeSeen = false;
  const options: SourceRecoveryCliOptions = { mode, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      if (modeSeen || !MODES.has(argument as SourceRecoveryMode)) {
        throw new Error(`Unknown source recovery mode: ${argument}`);
      }
      mode = argument as SourceRecoveryMode;
      options.mode = mode;
      modeSeen = true;
      continue;
    }
    if (
      argument !== '--confirm-run-id' &&
      argument !== '--manifest-path' &&
      argument !== '--journal-path' &&
      argument !== '--plan-input-path' &&
      argument !== '--capability-probe-directory'
    ) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const [value, nextIndex] = takeValue(args, index, argument);
    index = nextIndex;
    if (argument === '--confirm-run-id') options.confirmRunId = value;
    else if (argument === '--manifest-path') options.manifestPath = value;
    else if (argument === '--journal-path') options.journalPath = value;
    else if (argument === '--plan-input-path') options.planInputPath = value;
    else if (argument === '--capability-probe-directory') {
      options.capabilityProbeDirectory = value;
    }
  }
  return options;
}

function aggregateReport(
  mode: SourceRecoveryMode,
  manifest: SourceRecoveryManifest,
  phase: RecoveryProgressJournal['phase'],
  extra: Partial<
    Pick<RecoveryAggregateReport, 'counts' | 'verifiedDispositions' | 'rolledBack'>
  > = {}
): RecoveryAggregateReport {
  return {
    ok: true,
    mode,
    phase,
    copies: manifest.copies.length,
    affectedRows: manifest.copies.reduce(
      (total, entry) => total + entry.affected_file_catalog_rows,
      0
    ),
    eligibleDispositions: manifest.dispositions.filter(
      entry => entry.kind === 'eligible_unrecoverable'
    ).length,
    careerPlaybookDispositions: manifest.dispositions.filter(
      entry => entry.kind === 'career_playbook_retained_derived'
    ).length,
    ...extra,
  };
}

function requireConfirmation(
  options: SourceRecoveryCliOptions,
  manifest: SourceRecoveryManifest
): void {
  if (!options.confirmRunId) throw new Error('--confirm-run-id is required for mutating modes');
  if (options.confirmRunId !== manifest.run_id) {
    throw new Error('Run confirmation does not match the reviewed manifest');
  }
}

function nextJournal(
  journal: RecoveryProgressJournal,
  patch: Partial<Pick<RecoveryProgressJournal, 'phase' | 'copy_states' | 'disposition_states'>>
): RecoveryProgressJournal {
  return {
    ...journal,
    ...patch,
    revision: journal.revision + 1,
    copy_states: patch.copy_states ?? { ...journal.copy_states },
    disposition_kinds: { ...journal.disposition_kinds },
    disposition_states: patch.disposition_states ?? { ...journal.disposition_states },
  };
}

export async function runSourceRecoveryCommand(
  options: Pick<SourceRecoveryCliOptions, 'mode' | 'confirmRunId'>,
  dependencies: RecoveryWorkflowDependencies
): Promise<RecoveryAggregateReport> {
  if (options.mode === 'plan') {
    const manifest = assertExactRecoveryContract(await dependencies.createPlan());
    const counts = await dependencies.readSourceCounts();
    if (!sameCounts(counts, EXACT_PRE_COUNTS)) {
      throw new Error('Planner inventory does not match exact audited pre-copy totals');
    }
    await dependencies.preflightCopies(manifest);
    const written = await dependencies.writePlan(manifest);
    if (
      written.manifestSha256 !== calculateRecoveryManifestSha256(manifest) ||
      written.journal.run_id !== manifest.run_id ||
      written.journal.phase !== 'planned'
    ) {
      throw new Error('Written plan does not match canonical manifest/journal identity');
    }
    return aggregateReport('plan', manifest, 'planned', { counts });
  }

  const loaded = await dependencies.loadReviewedState();
  const manifest = assertExactRecoveryContract(loaded.manifest);
  if (loaded.manifestSha256 !== calculateRecoveryManifestSha256(manifest)) {
    throw new Error('Reviewed manifest SHA-256 is not canonical');
  }
  let journal = loaded.journal;
  validateLoadedJournal(manifest, loaded.manifestSha256, journal);

  const persist = async (next: RecoveryProgressJournal): Promise<void> => {
    validateRecoveryJournalTransition(journal, next);
    await dependencies.persistJournal(journal, next, manifest);
    journal = next;
  };

  if (options.mode === 'verify') {
    for (const entry of manifest.copies) {
      if (
        (await dependencies.inspectCopy(entry, journal.copy_states[entry.entry_id])) !== 'exact'
      ) {
        throw new Error('Recovery target verification mismatch');
      }
    }
    const counts = await dependencies.readSourceCounts();
    if (!sameCounts(counts, EXACT_POST_COUNTS)) {
      throw new Error('Recovery verification does not match exact post-copy totals');
    }
    return aggregateReport('verify', manifest, journal.phase, { counts });
  }

  requireConfirmation({ ...options, help: false }, manifest);

  if (options.mode === 'execute') {
    if (journal.phase !== 'planned' && journal.phase !== 'copying') {
      throw new Error(`Execute requires planned or copying phase, received ${journal.phase}`);
    }
    await dependencies.preflightExecution(manifest, journal);
    if (journal.phase === 'planned') await persist(nextJournal(journal, { phase: 'copying' }));
    for (const entry of manifest.copies) {
      const state = journal.copy_states[entry.entry_id];
      if (state !== 'planned' && state !== 'published') {
        throw new Error('Execute encountered a rollback copy state');
      }
      const inspection = await dependencies.inspectCopy(entry, state);
      if (state === 'published') {
        if (inspection !== 'exact') throw new Error('Published recovery target is not exact');
        continue;
      }
      if (inspection === 'mismatch') throw new Error('Planned recovery target mismatch');
      if (inspection === 'absent') await dependencies.publishCopy(entry);
      const copyStates = { ...journal.copy_states, [entry.entry_id]: 'published' as const };
      await persist(nextJournal(journal, { copy_states: copyStates }));
    }
    await persist(nextJournal(journal, { phase: 'copied' }));
    return aggregateReport('execute', manifest, journal.phase);
  }

  if (options.mode === 'rollback') {
    if (journal.phase === 'reindex_started' || journal.phase === 'complete') {
      throw new Error(`Rollback is forbidden at or after ${journal.phase}`);
    }
    let rolledBack = 0;
    for (const entry of [...manifest.copies].reverse()) {
      let state = journal.copy_states[entry.entry_id];
      if (state === 'planned' || state === 'rolled_back') continue;
      if (state === 'published') {
        const copyStates = {
          ...journal.copy_states,
          [entry.entry_id]: 'rollback_planned' as const,
        };
        await persist(nextJournal(journal, { copy_states: copyStates }));
        state = 'rollback_planned';
      }
      if (state === 'rollback_planned') {
        await dependencies.rollbackCopy(entry, journal);
        const copyStates = { ...journal.copy_states, [entry.entry_id]: 'rolled_back' as const };
        await persist(nextJournal(journal, { copy_states: copyStates }));
        rolledBack += 1;
      }
    }
    return aggregateReport('rollback', manifest, journal.phase, { rolledBack });
  }

  if (options.mode === 'apply-dispositions') {
    if (journal.phase !== 'copied') {
      throw new Error(`Disposition apply requires copied phase, received ${journal.phase}`);
    }
    const counts = await dependencies.readSourceCounts();
    if (!sameCounts(counts, EXACT_POST_COUNTS)) {
      throw new Error('Disposition apply requires exact post-copy source totals');
    }
    for (const entry of manifest.dispositions) {
      const checkpoint = async (
        state: RecoveryDispositionProgressState
      ): Promise<RecoveryDispositionProgressState> => {
        const dispositionStates = { ...journal.disposition_states, [entry.entry_id]: state };
        await persist(nextJournal(journal, { disposition_states: dispositionStates }));
        return state;
      };
      const result = await dependencies.applyDisposition(
        entry,
        journal.disposition_states[entry.entry_id],
        checkpoint
      );
      if (
        result !== 'disposition_applied' ||
        journal.disposition_states[entry.entry_id] !== result
      ) {
        throw new Error('Disposition did not persist its applied checkpoint');
      }
    }
    await persist(nextJournal(journal, { phase: 'dispositions_applied' }));
    return aggregateReport('apply-dispositions', manifest, journal.phase);
  }

  if (journal.phase !== 'dispositions_applied') {
    throw new Error(
      `Disposition verification requires dispositions_applied phase, received ${journal.phase}`
    );
  }
  const counts = await dependencies.readSourceCounts();
  if (!sameCounts(counts, EXACT_POST_COUNTS)) {
    throw new Error('Disposition verification requires exact post-copy source totals');
  }
  await dependencies.verifyDispositions(manifest);
  for (const entry of manifest.dispositions) {
    const dispositionStates = {
      ...journal.disposition_states,
      [entry.entry_id]: 'disposition_verified' as const,
    };
    await persist(nextJournal(journal, { disposition_states: dispositionStates }));
  }
  await persist(nextJournal(journal, { phase: 'verified' }));
  return aggregateReport('verify-dispositions', manifest, journal.phase, {
    verifiedDispositions: manifest.dispositions.length,
  });
}

function requirePath(value: string | undefined, label: string): string {
  if (!value || !isAbsolute(value)) throw new Error(`${label} must be an absolute path`);
  return value;
}

function expectedFileFromDisposition(entry: RecoveryDispositionEntry) {
  return {
    id: entry.file_catalog_id,
    organization_id: entry.organization_id,
    course_id: entry.course_id,
    storage_path: entry.expected_storage_path,
    hash: entry.expected_hash,
    vector_status: 'failed' as const,
    error_message: `${entry.reason}; recovery_run=`,
  };
}

async function verifyExactDispositions(
  database: RecoveryDispositionDatabase,
  manifest: SourceRecoveryManifest
): Promise<void> {
  const files = await database.listFileCatalogExpectedRows(
    manifest.dispositions.map(entry => entry.file_catalog_id)
  );
  const filesById = new Map(files.map(row => [row.id, row]));
  for (const entry of manifest.dispositions) {
    const expected = expectedFileFromDisposition(entry);
    const file = filesById.get(entry.file_catalog_id);
    if (
      !file ||
      file.organization_id !== expected.organization_id ||
      file.course_id !== expected.course_id ||
      file.storage_path !== expected.storage_path ||
      file.hash !== expected.hash ||
      file.vector_status !== 'failed' ||
      file.error_message !== `${entry.reason}; recovery_run=${manifest.run_id}`
    ) {
      throw new Error('Verified file_catalog disposition does not match the reviewed outcome');
    }
  }
  if (files.length !== 24) {
    throw new Error('Disposition verification did not return the exact 24-row file total');
  }
}

async function verifyReviewedPriorPredicates(
  database: RecoveryDispositionDatabase,
  manifest: SourceRecoveryManifest
): Promise<void> {
  const files = await database.listFileCatalogExpectedRows(
    manifest.dispositions.map(entry => entry.file_catalog_id)
  );
  const filesById = new Map(files.map(row => [row.id, row]));
  for (const entry of manifest.dispositions) {
    const file = filesById.get(entry.file_catalog_id);
    if (
      !file ||
      file.organization_id !== entry.organization_id ||
      file.course_id !== entry.course_id ||
      file.storage_path !== entry.expected_storage_path ||
      file.hash !== entry.expected_hash ||
      file.vector_status !== entry.expected_vector_status ||
      file.error_message !== entry.expected_file_error_message
    ) {
      throw new Error('Planner file_catalog predicates drifted from the protected audit input');
    }
  }
  if (files.length !== 24) {
    throw new Error('Planner disposition inventory does not match the exact 24-row file total');
  }
}

export function createDefaultRecoveryDependencies(
  options: SourceRecoveryCliOptions
): RecoveryWorkflowDependencies {
  const manifestPath = requirePath(
    options.manifestPath ?? process.env.SOURCE_RECOVERY_MANIFEST_PATH,
    'Recovery manifest path'
  );
  const journalPath = requirePath(
    options.journalPath ?? process.env.SOURCE_RECOVERY_JOURNAL_PATH,
    'Recovery journal path'
  );
  const planInputPath = options.planInputPath ?? process.env.SOURCE_RECOVERY_PLAN_INPUT_PATH;
  const capabilityProbeDirectory =
    options.capabilityProbeDirectory ?? process.env.SOURCE_RECOVERY_CAPABILITY_PROBE_DIRECTORY;
  let database: RecoveryDispositionDatabase | undefined;
  const getDatabase = (): RecoveryDispositionDatabase => {
    database ??= createRecoveryDispositionDatabase(
      createSupabaseRecoveryGateway(getSupabaseAdmin() as unknown as RecoverySupabaseClient)
    );
    return database;
  };
  let active: ReviewedRecoveryState | undefined;
  const load = async (): Promise<ReviewedRecoveryState> => {
    active = await loadReviewedRecoveryState({ manifestPath, journalPath });
    return active;
  };
  const currentManifest = (): SourceRecoveryManifest => {
    if (!active) throw new Error('Recovery state must be loaded first');
    return active.manifest;
  };
  const currentJournal = (): RecoveryProgressJournal => {
    if (!active) throw new Error('Recovery state must be loaded first');
    return active.journal;
  };
  const publishInput = (entry: RecoveryCopyEntry) => ({
    runId: currentManifest().run_id,
    developmentRoot: currentManifest().development_root,
    productionRoot: currentManifest().production_root,
    rootBinding: {
      development_root: currentManifest().development_root,
      production_root: currentManifest().production_root,
    },
    entry,
  });

  return {
    createPlan: async () => {
      const path = requirePath(planInputPath, 'Recovery protected plan input path');
      const manifest = assertExactRecoveryContract(
        ManifestSchema.parse(
          JSON.parse(await readOwnerOnlyFile(path, 'Recovery protected plan input'))
        )
      );
      await verifyReviewedPriorPredicates(getDatabase(), manifest);
      return manifest;
    },
    preflightCopies: async manifest => {
      const normalized = assertExactRecoveryContract(manifest);
      const directory = requirePath(
        capabilityProbeDirectory,
        'Recovery capability probe directory'
      );
      await preflightRecoveryCopies({
        runId: normalized.run_id,
        developmentRoot: normalized.development_root,
        productionRoot: normalized.production_root,
        rootBinding: {
          development_root: normalized.development_root,
          production_root: normalized.production_root,
        },
        entries: normalized.copies,
        capabilityDirectory: directory,
      });
    },
    preflightExecution: async (manifest, journal) => {
      const normalized = assertExactRecoveryContract(manifest);
      await preflightRecoveryExecution({
        runId: normalized.run_id,
        developmentRoot: normalized.development_root,
        productionRoot: normalized.production_root,
        rootBinding: {
          development_root: normalized.development_root,
          production_root: normalized.production_root,
        },
        entries: normalized.copies,
        copyStates: journal.copy_states,
        phase: journal.phase === 'planned' ? 'planned' : 'copying',
      });
    },
    writePlan: async manifest => {
      const normalized = assertExactRecoveryContract(manifest);
      const manifestSha256 = await writeImmutableManifest(manifestPath, normalized);
      const journal = createInitialProgressJournal(normalized, manifestSha256);
      await replaceProgressJournal(journalPath, -1, journal, normalized);
      return { manifest: normalized, manifestSha256, journal };
    },
    loadReviewedState: load,
    persistJournal: async (current, next, manifest) => {
      await persistRecoveryJournalTransition({ journalPath, manifest, current, next });
      active = {
        manifest,
        manifestSha256: calculateRecoveryManifestSha256(manifest),
        journal: next,
      };
    },
    readSourceCounts: async () => {
      const rows = await loadReindexSources(createSourceDatabase());
      const probe = await probeSourceFiles(rows);
      const plan = buildReindexPlan(rows, row =>
        probe.invalidPathFileIds.has(row.id)
          ? 'invalid_source_path'
          : probe.availableFileIds.has(row.id)
      );
      return {
        total: plan.eligible + plan.unsupported,
        eligible: plan.eligible,
        recoverable: plan.recoverable + plan.alreadyEnqueued,
        missing: plan.missingSource,
        invalid: plan.invalidSourcePath,
        unsupported: plan.unsupported,
      };
    },
    inspectCopy: async (entry, state) => {
      if (state === 'rolled_back') return 'absent';
      if (state === 'rollback_planned') {
        const result = await reconcileRollbackTarget(publishInput(entry), 'rollback_planned');
        return result === 'rolled_back' ? 'absent' : 'exact';
      }
      const result = await reconcilePublishedTarget(publishInput(entry), state, {
        executionStarted: currentJournal().phase === 'copying',
      });
      return result === 'ready_to_publish' ? 'absent' : 'exact';
    },
    publishCopy: entry => publishNoReplace(publishInput(entry)),
    rollbackCopy: async (entry, journal) => {
      const result = await reconcileRollbackTarget(publishInput(entry), 'rollback_planned');
      if (result === 'ready_to_rollback') {
        await rollbackPublished({
          ...publishInput(entry),
          phase: journal.phase,
          journalState: 'rollback_planned',
        });
      }
    },
    applyDisposition: async (entry, state, checkpoint) =>
      applyDispositionEntry({
        database: getDatabase(),
        entry,
        runId: currentManifest().run_id,
        state,
        persistCheckpoint: checkpoint,
      }),
    verifyDispositions: manifest => verifyExactDispositions(getDatabase(), manifest),
  };
}

function usage(): string {
  return [
    'Usage: source-recovery <plan|verify|execute|rollback|apply-dispositions|verify-dispositions>',
    '  --manifest-path <absolute path>',
    '  --journal-path <absolute path>',
    '  --plan-input-path <absolute path>  (plan only)',
    '  --capability-probe-directory <absolute path>  (plan only)',
    '  --confirm-run-id <uuid>            (mutating modes)',
  ].join('\n');
}

async function main(): Promise<void> {
  try {
    const options = parseSourceRecoveryCliArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = await runSourceRecoveryCommand(
      options,
      createDefaultRecoveryDependencies(options)
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write(`${JSON.stringify({ ok: false, error: 'source_recovery_failed' })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
