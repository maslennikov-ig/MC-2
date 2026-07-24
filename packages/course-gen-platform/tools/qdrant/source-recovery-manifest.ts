import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40,64}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ENTRY_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const OPERATOR_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const RelativePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    value =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value
        .split('/')
        .some(component => component === '' || component === '.' || component === '..'),
    'must be a normalized relative POSIX path'
  );

const AbsoluteRootSchema = z
  .string()
  .min(2)
  .refine(
    value => isAbsolute(value) && resolve(value) === value,
    'must be a normalized absolute path'
  );

const RecoveryCountsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    eligible: z.number().int().nonnegative(),
    recoverable: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    unsupported: z.number().int().nonnegative(),
  })
  .strict();

const RecoveryCopyEntrySchema = z
  .object({
    entry_id: z.string().regex(ENTRY_ID_PATTERN),
    source_relative_path: RelativePathSchema,
    target_relative_path: RelativePathSchema,
    expected_size: z.number().int().nonnegative(),
    expected_sha256: z.string().regex(SHA256_PATTERN),
    affected_file_catalog_rows: z.number().int().positive(),
  })
  .strict();

// Career Playbook dispositions are file_catalog-only bookkeeping: the reviewed
// career_playbook_sources rows were legally cascade-deleted with their parent playbooks
// (owner-approved amendment, 2026-07-24), so disposition entries carry no live playbook
// predicates and the strict schema rejects any manifest that still does.
const RecoveryDispositionEntrySchema = z
  .object({
    entry_id: z.string().regex(ENTRY_ID_PATTERN),
    kind: z.enum(['eligible_unrecoverable', 'career_playbook_retained_derived']),
    file_catalog_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    course_id: z.string().uuid().nullable(),
    expected_hash: z.string().regex(SHA256_PATTERN),
    expected_storage_path: RelativePathSchema,
    expected_vector_status: z.enum(['pending', 'indexing', 'indexed', 'failed']),
    expected_file_error_message: z.string().max(1024).nullable(),
    reason: z.enum(['source_file_unrecoverable', 'retained-derived-only']),
  })
  .strict()
  .superRefine((entry, context) => {
    if (
      entry.kind === 'eligible_unrecoverable' &&
      (entry.reason !== 'source_file_unrecoverable' || entry.course_id === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'eligible unrecoverable disposition has an invalid reason or course',
      });
    }
    if (
      entry.kind === 'career_playbook_retained_derived' &&
      (entry.reason !== 'retained-derived-only' || entry.course_id !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'career playbook disposition requires a null course and retained-derived-only reason',
      });
    }
  });

const SourceRecoveryManifestSchema = z
  .object({
    schema_version: z.literal('megacampus.qdrant.source-recovery/v1'),
    run_id: z.string().regex(UUID_V4_PATTERN, 'run_id must be a UUIDv4'),
    release_sha: z.string().regex(RELEASE_SHA_PATTERN),
    generated_at: z.string().datetime(),
    operator_image_digest: z.string().regex(OPERATOR_DIGEST_PATTERN),
    source_audit_version: z.string().min(1).max(128),
    development_root: AbsoluteRootSchema,
    production_root: AbsoluteRootSchema,
    pre_counts: RecoveryCountsSchema,
    expected_post_counts: RecoveryCountsSchema,
    copies: z.array(RecoveryCopyEntrySchema),
    dispositions: z.array(RecoveryDispositionEntrySchema),
  })
  .strict();

export const RECOVERY_RUN_PHASES = [
  'planned',
  'copying',
  'copied',
  'dispositions_applied',
  'verified',
  'reindex_started',
  'complete',
] as const;

const CopyStateSchema = z.enum(['planned', 'published', 'rollback_planned', 'rolled_back']);
const DispositionStateSchema = z.enum([
  'disposition_planned',
  'disposition_applied',
  'disposition_verified',
]);

const RecoveryProgressJournalSchema = z
  .object({
    schema_version: z.literal('megacampus.qdrant.source-recovery-progress/v1'),
    run_id: z.string().regex(UUID_V4_PATTERN, 'run_id must be a UUIDv4'),
    manifest_sha256: z.string().regex(SHA256_PATTERN),
    revision: z.number().int().nonnegative(),
    phase: z.enum(RECOVERY_RUN_PHASES),
    copy_states: z.record(z.string().min(1), CopyStateSchema),
    disposition_kinds: z.record(
      z.string().min(1),
      z.enum(['eligible_unrecoverable', 'career_playbook_retained_derived'])
    ),
    disposition_states: z.record(z.string().min(1), DispositionStateSchema),
  })
  .strict();

export type RecoveryRunPhase = (typeof RECOVERY_RUN_PHASES)[number];
export type RecoveryCounts = z.infer<typeof RecoveryCountsSchema>;
export type RecoveryCopyEntry = z.infer<typeof RecoveryCopyEntrySchema>;
export type RecoveryDispositionEntry = z.infer<typeof RecoveryDispositionEntrySchema>;
export type SourceRecoveryManifest = z.infer<typeof SourceRecoveryManifestSchema>;
export type RecoveryProgressJournal = z.infer<typeof RecoveryProgressJournalSchema>;
export type RecoveryRootBinding = Pick<
  SourceRecoveryManifest,
  'development_root' | 'production_root'
>;

function assertCountShape(label: string, counts: RecoveryCounts): void {
  if (counts.total !== counts.eligible + counts.unsupported) {
    throw new Error(`${label} total must equal eligible plus unsupported`);
  }
  if (counts.eligible !== counts.recoverable + counts.missing + counts.invalid) {
    throw new Error(`${label} eligible must equal recoverable plus missing plus invalid`);
  }
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function isWithin(root: string, candidate: string): boolean {
  const offset = relative(root, candidate);
  return (
    offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset))
  );
}

export function normalizeRecoveryManifest(input: SourceRecoveryManifest): SourceRecoveryManifest {
  const parsed = SourceRecoveryManifestSchema.parse(input);
  const copies = [...parsed.copies].sort((left, right) =>
    left.entry_id.localeCompare(right.entry_id)
  );
  const dispositions = [...parsed.dispositions].sort((left, right) =>
    left.entry_id.localeCompare(right.entry_id)
  );

  assertUnique(
    copies.map(entry => entry.entry_id),
    'copy entry id'
  );
  assertUnique(
    copies.map(entry => entry.target_relative_path),
    'target path'
  );
  assertUnique(
    dispositions.map(entry => entry.entry_id),
    'disposition entry id'
  );
  assertUnique(
    dispositions.map(entry => entry.file_catalog_id),
    'file catalog id'
  );
  assertUnique(
    [...copies.map(entry => entry.entry_id), ...dispositions.map(entry => entry.entry_id)],
    'manifest entry id'
  );

  if (
    isWithin(parsed.development_root, parsed.production_root) ||
    isWithin(parsed.production_root, parsed.development_root)
  ) {
    throw new Error('Recovery root paths must not overlap');
  }

  assertCountShape('pre_counts', parsed.pre_counts);
  assertCountShape('expected_post_counts', parsed.expected_post_counts);
  for (const stableField of ['total', 'eligible', 'unsupported'] as const) {
    if (parsed.pre_counts[stableField] !== parsed.expected_post_counts[stableField]) {
      throw new Error(`${stableField} must remain stable across source recovery`);
    }
  }

  const copyCoverage = copies.reduce((total, entry) => total + entry.affected_file_catalog_rows, 0);
  const recoveredDelta = parsed.expected_post_counts.recoverable - parsed.pre_counts.recoverable;
  const rawGapDelta =
    parsed.pre_counts.missing +
    parsed.pre_counts.invalid -
    parsed.expected_post_counts.missing -
    parsed.expected_post_counts.invalid;
  if (copyCoverage !== recoveredDelta || copyCoverage !== rawGapDelta) {
    throw new Error('Manifest copy coverage does not match aggregate count deltas');
  }

  const eligibleFailures = dispositions.filter(
    entry => entry.kind === 'eligible_unrecoverable'
  ).length;
  if (
    eligibleFailures !==
    parsed.expected_post_counts.missing + parsed.expected_post_counts.invalid
  ) {
    throw new Error('Eligible disposition count must match remaining raw source gaps');
  }

  return { ...parsed, copies, dispositions };
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export interface DurableWriteHandle {
  writeFile(content: string, encoding: 'utf8'): Promise<void>;
  chmod(mode: number): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface DurableDirectoryHandle {
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface DurableWriteOperations {
  mkdir(directory: string): Promise<void>;
  assertSecureDirectory(directory: string): Promise<void>;
  assertAbsent(targetPath: string): Promise<void>;
  openTemporary(path: string, mode: number): Promise<DurableWriteHandle>;
  rename(from: string, to: string): Promise<void>;
  link(from: string, to: string): Promise<void>;
  openDirectory(directory: string): Promise<DurableDirectoryHandle>;
  unlink(path: string): Promise<void>;
}

const defaultDurableWriteOperations: DurableWriteOperations = {
  async mkdir(directory) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
  },
  async assertSecureDirectory(directory) {
    const metadata = await lstat(directory);
    const expectedUid = process.getuid?.();
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`Recovery state directory must be a real directory: ${directory}`);
    }
    if ((metadata.mode & 0o777) !== 0o700) {
      throw new Error(`Recovery state directory must have mode 0700: ${directory}`);
    }
    if (expectedUid !== undefined && metadata.uid !== expectedUid) {
      throw new Error(`Recovery state directory must be owned by uid ${expectedUid}: ${directory}`);
    }
    if ((await realpath(directory)) !== resolve(directory)) {
      throw new Error(`Recovery state directory must use a real directory boundary: ${directory}`);
    }
  },
  async assertAbsent(targetPath) {
    try {
      await lstat(targetPath);
      throw new Error(`Recovery manifest already exists: ${targetPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  },
  async openTemporary(path, mode) {
    return open(path, 'wx', mode);
  },
  async rename(from, to) {
    await rename(from, to);
  },
  async link(from, to) {
    await link(from, to);
  },
  async openDirectory(directory) {
    return open(directory, 'r');
  },
  async unlink(path) {
    await unlink(path);
  },
};

async function fsyncDirectory(
  directory: string,
  operations: DurableWriteOperations
): Promise<void> {
  const handle = await operations.openDirectory(directory);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

interface DurableFileIdentity {
  device: number;
  inode: number;
}

type DurableFileInspection = { status: 'absent' } | ({ status: 'exact' } & DurableFileIdentity);

function durableTemporaryPath(targetPath: string, content: string): string {
  const contentSha256 = createHash('sha256').update(content).digest('hex');
  return `${targetPath}.${contentSha256}.tmp`;
}

async function inspectOwnerOnlyContentFile(
  path: string,
  expectedContent: string,
  label: string
): Promise<DurableFileInspection> {
  let metadata: Awaited<ReturnType<typeof lstat>>;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent' };
    throw error;
  }
  const expectedUid = process.getuid?.();
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a non-symlink regular file`);
  }
  if ((metadata.mode & 0o777) !== 0o600) {
    throw new Error(`${label} must have mode 0600`);
  }
  if (expectedUid !== undefined && metadata.uid !== expectedUid) {
    throw new Error(`${label} must be owned by the current UID`);
  }

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
    if (expectedUid !== undefined && opened.uid !== expectedUid) {
      throw new Error(`${label} must be owned by the current UID`);
    }
    if ((await handle.readFile('utf8')) !== expectedContent) {
      throw new Error(`${label} mismatch requires operator investigation`);
    }
    return { status: 'exact', device: opened.dev, inode: opened.ino };
  } finally {
    await handle.close();
  }
}

async function assertStableOwnerOnlyFile(
  path: string,
  expected: DurableFileIdentity,
  label: string
): Promise<void> {
  const metadata = await lstat(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600 ||
    metadata.dev !== expected.device ||
    metadata.ino !== expected.inode
  ) {
    throw new Error(`${label} changed before publication`);
  }
  const expectedUid = process.getuid?.();
  if (expectedUid !== undefined && metadata.uid !== expectedUid) {
    throw new Error(`${label} must be owned by the current UID`);
  }
}

async function fsyncProtectedOwnerOnlyContentFile(
  path: string,
  expectedContent: string,
  expected: DurableFileIdentity,
  label: string
): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      (opened.mode & 0o777) !== 0o600 ||
      opened.dev !== expected.device ||
      opened.ino !== expected.inode
    ) {
      throw new Error(`${label} changed before protected fsync`);
    }
    const expectedUid = process.getuid?.();
    if (expectedUid !== undefined && opened.uid !== expectedUid) {
      throw new Error(`${label} must be owned by the current UID`);
    }
    if ((await handle.readFile('utf8')) !== expectedContent) {
      throw new Error(`${label} mismatch requires operator investigation`);
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function reconcileCommittedTemporary(targetPath: string, content: string): Promise<void> {
  const temporaryPath = durableTemporaryPath(targetPath, content);
  const temporary = await inspectOwnerOnlyContentFile(
    temporaryPath,
    content,
    'Recovery state temporary'
  );
  const target = await inspectOwnerOnlyContentFile(
    targetPath,
    content,
    'Recovery progress journal'
  );
  if (target.status === 'absent') return;

  const targetHandle = await open(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await targetHandle.stat();
    if (opened.dev !== target.device || opened.ino !== target.inode) {
      throw new Error('Recovery progress journal changed before reconciliation fsync');
    }
    await targetHandle.sync();
  } finally {
    await targetHandle.close();
  }
  const directory = dirname(targetPath);
  await fsyncDirectory(directory, defaultDurableWriteOperations);
  if (temporary.status === 'absent') return;
  await assertStableOwnerOnlyFile(temporaryPath, temporary, 'Recovery state temporary');
  await unlink(temporaryPath);
  await fsyncDirectory(directory, defaultDurableWriteOperations);
}

async function writeDurableReplacement(
  targetPath: string,
  content: string,
  options: { publication: 'immutable' | 'replace' },
  operations: DurableWriteOperations = defaultDurableWriteOperations
): Promise<void> {
  const directory = dirname(targetPath);
  await operations.mkdir(directory);
  await operations.assertSecureDirectory(directory);
  if (options.publication === 'immutable') await operations.assertAbsent(targetPath);

  const temporaryPath = durableTemporaryPath(targetPath, content);
  const existingTemporary = await inspectOwnerOnlyContentFile(
    temporaryPath,
    content,
    'Recovery state temporary'
  );
  let handle: DurableWriteHandle | undefined;
  let closed = true;
  let safeTemporary = false;
  try {
    if (existingTemporary.status === 'absent') {
      handle = await operations.openTemporary(temporaryPath, 0o600);
      safeTemporary = true;
      closed = false;
      await handle.writeFile(content, 'utf8');
      await handle.chmod(0o600);
      await handle.sync();
      await handle.close();
      closed = true;
    } else {
      await fsyncProtectedOwnerOnlyContentFile(
        temporaryPath,
        content,
        existingTemporary,
        'Recovery state temporary'
      );
      await assertStableOwnerOnlyFile(temporaryPath, existingTemporary, 'Recovery state temporary');
      safeTemporary = true;
    }
    if (options.publication === 'immutable') {
      try {
        await operations.link(temporaryPath, targetPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new Error(`Recovery manifest already exists: ${targetPath}`, { cause: error });
        }
        throw error;
      }
      await fsyncDirectory(directory, operations);
      await operations.unlink(temporaryPath);
      await fsyncDirectory(directory, operations);
    } else {
      await operations.rename(temporaryPath, targetPath);
      await fsyncDirectory(directory, operations);
    }
  } catch (error) {
    if (!closed) await handle?.close().catch(() => undefined);
    if (safeTemporary) await operations.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function writeImmutableManifest(
  targetPath: string,
  manifest: SourceRecoveryManifest,
  operations: DurableWriteOperations = defaultDurableWriteOperations
): Promise<string> {
  const normalized = normalizeRecoveryManifest(manifest);
  const content = serialize(normalized);
  const sha256 = createHash('sha256').update(content).digest('hex');
  await writeDurableReplacement(targetPath, content, { publication: 'immutable' }, operations);
  return sha256;
}

export function calculateRecoveryManifestSha256(manifest: SourceRecoveryManifest): string {
  return createHash('sha256')
    .update(serialize(normalizeRecoveryManifest(manifest)))
    .digest('hex');
}

export function createInitialProgressJournal(
  manifest: SourceRecoveryManifest,
  manifestSha256: string
): RecoveryProgressJournal {
  if (!SHA256_PATTERN.test(manifestSha256)) throw new Error('Invalid manifest SHA-256');
  const normalized = normalizeRecoveryManifest(manifest);
  const expectedManifestSha256 = calculateRecoveryManifestSha256(normalized);
  if (manifestSha256 !== expectedManifestSha256) {
    throw new Error('Progress journal manifest SHA-256 does not match canonical manifest bytes');
  }
  return {
    schema_version: 'megacampus.qdrant.source-recovery-progress/v1',
    run_id: normalized.run_id,
    manifest_sha256: manifestSha256,
    revision: 0,
    phase: 'planned',
    copy_states: Object.fromEntries(normalized.copies.map(entry => [entry.entry_id, 'planned'])),
    disposition_kinds: Object.fromEntries(
      normalized.dispositions.map(entry => [entry.entry_id, entry.kind])
    ),
    disposition_states: Object.fromEntries(
      normalized.dispositions.map(entry => [entry.entry_id, 'disposition_planned'])
    ),
  };
}

const phaseIndex = (phase: RecoveryRunPhase): number => RECOVERY_RUN_PHASES.indexOf(phase);

function assertSameKeys(
  current: Record<string, string>,
  next: Record<string, string>,
  label: string
): void {
  if (JSON.stringify(Object.keys(current).sort()) !== JSON.stringify(Object.keys(next).sort())) {
    throw new Error(`${label} keys cannot change`);
  }
}

function assertSameValues(
  current: Record<string, string>,
  next: Record<string, string>,
  label: string
): void {
  assertSameKeys(current, next, label);
  for (const [key, value] of Object.entries(current)) {
    if (next[key] !== value) throw new Error(`${label} values cannot change`);
  }
}

function allStatesAre(states: Record<string, string>, allowed: readonly string[]): boolean {
  return Object.values(states).every(state => allowed.includes(state));
}

function assertJournalPhaseCoherence(journal: RecoveryProgressJournal): void {
  if (
    journal.phase === 'planned' &&
    (!allStatesAre(journal.copy_states, ['planned']) ||
      !allStatesAre(journal.disposition_states, ['disposition_planned']))
  ) {
    throw new Error('Planned phase requires canonical initial entry states');
  }
  if (
    journal.phase === 'copying' &&
    !allStatesAre(journal.disposition_states, ['disposition_planned'])
  ) {
    throw new Error('Disposition updates cannot begin before copied phase');
  }
  if (
    journal.phase === 'copied' &&
    !allStatesAre(journal.copy_states, ['published', 'rollback_planned', 'rolled_back'])
  ) {
    throw new Error('Copied phase cannot contain planned copy entries');
  }
  if (
    journal.phase === 'dispositions_applied' &&
    !allStatesAre(journal.disposition_states, ['disposition_applied', 'disposition_verified'])
  ) {
    throw new Error('Dispositions must all be applied before dispositions_applied phase');
  }
  if (
    journal.phase === 'verified' &&
    !allStatesAre(journal.disposition_states, ['disposition_verified'])
  ) {
    throw new Error('Dispositions must all be verified before verified phase');
  }
  if (phaseIndex(journal.phase) >= phaseIndex('reindex_started')) {
    if (!allStatesAre(journal.copy_states, ['published'])) {
      throw new Error('All copies must be published before reindex_started');
    }
    if (!allStatesAre(journal.disposition_states, ['disposition_verified'])) {
      throw new Error('All dispositions must be verified before reindex_started');
    }
  }
}

export function validateRecoveryProgressJournalBinding(
  manifestInput: SourceRecoveryManifest,
  manifestSha256: string,
  journalInput: RecoveryProgressJournal
): RecoveryProgressJournal {
  const manifest = normalizeRecoveryManifest(manifestInput);
  const canonicalSha256 = calculateRecoveryManifestSha256(manifest);
  if (manifestSha256 !== canonicalSha256) {
    throw new Error('Progress journal manifest SHA-256 is not canonical');
  }
  const journal = RecoveryProgressJournalSchema.parse(journalInput);
  if (journal.run_id !== manifest.run_id || journal.manifest_sha256 !== canonicalSha256) {
    throw new Error('Progress journal binding does not match the canonical manifest identity');
  }

  const canonical = createInitialProgressJournal(manifest, canonicalSha256);
  assertSameKeys(canonical.copy_states, journal.copy_states, 'Manifest copy state');
  assertSameKeys(
    canonical.disposition_states,
    journal.disposition_states,
    'Manifest disposition state'
  );
  assertSameValues(
    canonical.disposition_kinds,
    journal.disposition_kinds,
    'Manifest disposition kind'
  );
  assertJournalPhaseCoherence(journal);
  return journal;
}

export function validateRecoveryJournalTransition(
  currentInput: RecoveryProgressJournal,
  nextInput: RecoveryProgressJournal
): RecoveryProgressJournal {
  const current = RecoveryProgressJournalSchema.parse(currentInput);
  const next = RecoveryProgressJournalSchema.parse(nextInput);
  assertJournalPhaseCoherence(current);
  if (next.run_id !== current.run_id || next.manifest_sha256 !== current.manifest_sha256) {
    throw new Error('Progress journal binding cannot change');
  }
  if (next.revision !== current.revision + 1) {
    throw new Error('Progress journal revision must advance exactly once');
  }
  const phaseDelta = phaseIndex(next.phase) - phaseIndex(current.phase);
  if (phaseDelta < 0 || phaseDelta > 1) {
    throw new Error(`Illegal recovery phase transition: ${current.phase} -> ${next.phase}`);
  }

  assertSameKeys(current.copy_states, next.copy_states, 'Copy state');
  assertSameValues(current.disposition_kinds, next.disposition_kinds, 'Disposition kind');
  assertSameKeys(current.disposition_states, next.disposition_states, 'Disposition state');

  if (
    current.phase === 'copying' &&
    next.phase === 'copied' &&
    !allStatesAre(next.copy_states, ['published'])
  ) {
    throw new Error('All copies must be published before copied phase');
  }

  const copyTransitions: Record<string, readonly string[]> = {
    planned: ['planned', 'published'],
    published: ['published', 'rollback_planned'],
    rollback_planned: ['rollback_planned', 'rolled_back'],
    rolled_back: ['rolled_back'],
  };
  for (const [entryId, currentState] of Object.entries(current.copy_states)) {
    const nextState = next.copy_states[entryId];
    if (!copyTransitions[currentState]?.includes(nextState)) {
      throw new Error(
        `Illegal copy state transition for ${entryId}: ${currentState} -> ${nextState}`
      );
    }
    if (
      (phaseIndex(current.phase) >= phaseIndex('reindex_started') ||
        phaseIndex(next.phase) >= phaseIndex('reindex_started')) &&
      currentState !== nextState
    ) {
      throw new Error('Copy state cannot change at or after reindex_started');
    }
  }

  const dispositionTransitions: Record<string, readonly string[]> = {
    disposition_planned: ['disposition_planned', 'disposition_applied'],
    disposition_applied: ['disposition_applied', 'disposition_verified'],
    disposition_verified: ['disposition_verified'],
  };
  for (const [entryId, currentState] of Object.entries(current.disposition_states)) {
    const nextState = next.disposition_states[entryId];
    if (!dispositionTransitions[currentState]?.includes(nextState)) {
      throw new Error(
        `Illegal disposition state transition for ${entryId}: ${currentState} -> ${nextState}`
      );
    }
    if (currentState !== nextState && phaseIndex(next.phase) < phaseIndex('copied')) {
      throw new Error('Disposition updates cannot begin before copied phase');
    }
    if (
      nextState === 'disposition_verified' &&
      phaseIndex(next.phase) < phaseIndex('dispositions_applied')
    ) {
      throw new Error('Disposition verification cannot begin before dispositions_applied phase');
    }
  }
  assertJournalPhaseCoherence(next);
  return next;
}

export async function replaceProgressJournal(
  targetPath: string,
  expectedRevision: number,
  nextInput: RecoveryProgressJournal,
  manifest?: SourceRecoveryManifest
): Promise<void> {
  const next = RecoveryProgressJournalSchema.parse(nextInput);
  let current: RecoveryProgressJournal | undefined;
  try {
    const metadata = await lstat(targetPath);
    if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
      throw new Error('Progress journal must be a non-symlink mode-0600 regular file');
    }
    const expectedUid = process.getuid?.();
    if (expectedUid !== undefined && metadata.uid !== expectedUid) {
      throw new Error(`Progress journal must be owned by uid ${expectedUid}`);
    }
    await defaultDurableWriteOperations.assertSecureDirectory(dirname(targetPath));
    const handle = await open(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        (opened.mode & 0o777) !== 0o600 ||
        opened.dev !== metadata.dev ||
        opened.ino !== metadata.ino
      ) {
        throw new Error('Progress journal changed during protected CAS open');
      }
      if (expectedUid !== undefined && opened.uid !== expectedUid) {
        throw new Error(`Progress journal must be owned by uid ${expectedUid}`);
      }
      current = RecoveryProgressJournalSchema.parse(JSON.parse(await handle.readFile('utf8')));
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const actualRevision = current?.revision ?? -1;
  const exactNextRevisionReplay =
    current !== undefined &&
    actualRevision === expectedRevision + 1 &&
    serialize(current) === serialize(next);
  if (actualRevision !== expectedRevision && !exactNextRevisionReplay) {
    throw new Error(
      `Progress journal revision mismatch: expected ${expectedRevision}, found ${actualRevision}`
    );
  }
  if (manifest) {
    if (current) {
      validateRecoveryProgressJournalBinding(manifest, current.manifest_sha256, current);
    }
    validateRecoveryProgressJournalBinding(manifest, next.manifest_sha256, next);
  }
  if (exactNextRevisionReplay) {
    await reconcileCommittedTemporary(targetPath, serialize(next));
    throw new Error(
      `Progress journal revision mismatch: expected ${expectedRevision}, found ${actualRevision}`
    );
  }
  if (current) validateRecoveryJournalTransition(current, next);
  else {
    if (!manifest) throw new Error('Initial progress journal requires its bound manifest');
    const canonical = createInitialProgressJournal(manifest, next.manifest_sha256);
    if (serialize(next) !== serialize(canonical)) {
      throw new Error('Initial progress journal must match the canonical initial manifest state');
    }
  }

  await writeDurableReplacement(targetPath, serialize(next), {
    publication: current ? 'replace' : 'immutable',
  });
}
