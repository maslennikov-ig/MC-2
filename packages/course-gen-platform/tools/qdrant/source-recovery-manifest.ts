import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40,64}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const RelativePathSchema = z
  .string()
  .min(1)
  .refine(
    value =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value
        .split('/')
        .some(component => component === '' || component === '.' || component === '..'),
    'must be a normalized relative POSIX path'
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
    entry_id: z.string().min(1),
    source_relative_path: RelativePathSchema,
    target_relative_path: RelativePathSchema,
    expected_size: z.number().int().nonnegative(),
    expected_sha256: z.string().regex(SHA256_PATTERN),
    affected_file_catalog_rows: z.number().int().positive(),
  })
  .strict();

const RecoveryDispositionEntrySchema = z
  .object({
    entry_id: z.string().min(1),
    kind: z.enum(['eligible_unrecoverable', 'career_playbook_retained_derived']),
    file_catalog_id: z.string().uuid(),
    career_playbook_source_id: z.string().uuid().optional(),
    organization_id: z.string().uuid(),
    course_id: z.string().uuid().nullable(),
    expected_hash: z.string().regex(SHA256_PATTERN),
    expected_storage_path: RelativePathSchema,
    reason: z.enum(['source_file_unrecoverable', 'retained-derived-only']),
  })
  .strict()
  .superRefine((entry, context) => {
    if (
      entry.kind === 'eligible_unrecoverable' &&
      (entry.reason !== 'source_file_unrecoverable' ||
        entry.career_playbook_source_id !== undefined ||
        entry.course_id === null)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'eligible unrecoverable disposition has an invalid reason, course, or playbook source',
      });
    }
    if (
      entry.kind === 'career_playbook_retained_derived' &&
      (entry.reason !== 'retained-derived-only' || entry.career_playbook_source_id === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'career playbook disposition requires its source id and retained-derived-only reason',
      });
    }
  });

const SourceRecoveryManifestSchema = z
  .object({
    schema_version: z.literal('megacampus.qdrant.source-recovery/v1'),
    run_id: z.string().regex(UUID_V4_PATTERN, 'run_id must be a UUIDv4'),
    release_sha: z.string().regex(RELEASE_SHA_PATTERN),
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
    disposition_states: z.record(z.string().min(1), DispositionStateSchema),
  })
  .strict();

export type RecoveryRunPhase = (typeof RECOVERY_RUN_PHASES)[number];
export type RecoveryCounts = z.infer<typeof RecoveryCountsSchema>;
export type RecoveryCopyEntry = z.infer<typeof RecoveryCopyEntrySchema>;
export type RecoveryDispositionEntry = z.infer<typeof RecoveryDispositionEntrySchema>;
export type SourceRecoveryManifest = z.infer<typeof SourceRecoveryManifestSchema>;
export type RecoveryProgressJournal = z.infer<typeof RecoveryProgressJournalSchema>;

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
    [...copies.map(entry => entry.entry_id), ...dispositions.map(entry => entry.entry_id)],
    'manifest entry id'
  );

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
  assertAbsent(targetPath: string): Promise<void>;
  openTemporary(path: string, mode: number): Promise<DurableWriteHandle>;
  rename(from: string, to: string): Promise<void>;
  openDirectory(directory: string): Promise<DurableDirectoryHandle>;
  unlink(path: string): Promise<void>;
}

const defaultDurableWriteOperations: DurableWriteOperations = {
  async mkdir(directory) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
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

async function writeDurableReplacement(
  targetPath: string,
  content: string,
  options: { requireAbsent: boolean },
  operations: DurableWriteOperations = defaultDurableWriteOperations
): Promise<void> {
  const directory = dirname(targetPath);
  await operations.mkdir(directory);
  if (options.requireAbsent) await operations.assertAbsent(targetPath);

  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await operations.openTemporary(temporaryPath, 0o600);
  let closed = false;
  try {
    await handle.writeFile(content, 'utf8');
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    closed = true;
    await operations.rename(temporaryPath, targetPath);
    await fsyncDirectory(directory, operations);
  } catch (error) {
    if (!closed) await handle.close().catch(() => undefined);
    await operations.unlink(temporaryPath).catch(() => undefined);
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
  await writeDurableReplacement(targetPath, content, { requireAbsent: true }, operations);
  return sha256;
}

export function createInitialProgressJournal(
  manifest: SourceRecoveryManifest,
  manifestSha256: string
): RecoveryProgressJournal {
  if (!SHA256_PATTERN.test(manifestSha256)) throw new Error('Invalid manifest SHA-256');
  const normalized = normalizeRecoveryManifest(manifest);
  return {
    schema_version: 'megacampus.qdrant.source-recovery-progress/v1',
    run_id: normalized.run_id,
    manifest_sha256: manifestSha256,
    revision: 0,
    phase: 'planned',
    copy_states: Object.fromEntries(normalized.copies.map(entry => [entry.entry_id, 'planned'])),
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

export function validateRecoveryJournalTransition(
  currentInput: RecoveryProgressJournal,
  nextInput: RecoveryProgressJournal
): RecoveryProgressJournal {
  const current = RecoveryProgressJournalSchema.parse(currentInput);
  const next = RecoveryProgressJournalSchema.parse(nextInput);
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
  assertSameKeys(current.disposition_states, next.disposition_states, 'Disposition state');

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
    if (phaseIndex(current.phase) >= phaseIndex('reindex_started') && currentState !== nextState) {
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
  }
  return next;
}

export async function replaceProgressJournal(
  targetPath: string,
  expectedRevision: number,
  nextInput: RecoveryProgressJournal
): Promise<void> {
  const next = RecoveryProgressJournalSchema.parse(nextInput);
  let current: RecoveryProgressJournal | undefined;
  try {
    current = RecoveryProgressJournalSchema.parse(JSON.parse(await readFile(targetPath, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const actualRevision = current?.revision ?? -1;
  if (actualRevision !== expectedRevision) {
    throw new Error(
      `Progress journal revision mismatch: expected ${expectedRevision}, found ${actualRevision}`
    );
  }
  if (current) validateRecoveryJournalTransition(current, next);
  else if (next.revision !== 0 || next.phase !== 'planned') {
    throw new Error('Initial progress journal must start at revision 0 in planned phase');
  }

  await writeDurableReplacement(targetPath, serialize(next), { requireAbsent: false });
}
