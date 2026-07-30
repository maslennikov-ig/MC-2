/* eslint-disable @typescript-eslint/restrict-plus-operands -- lstat uid arithmetic on fixture metadata is number-typed at runtime */
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fault = vi.hoisted(() => ({
  rule: null as null | {
    boundary: string;
    phase: 'before' | 'after';
    occurrence: number;
    triggered: boolean;
  },
  occurrences: new Map<string, number>(),
  crashed: false,
  recoveryTarget: '',
  recoveryDirectory: '',
  journalTarget: '',
  journalDirectory: '',
  replaceTargetOnLstat: false,
  replacementBytes: '',
  journalTemporaryUidDelta: 0,
  journalEvents: [] as string[],
  rollbackUnlinkCount: 0,
}));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();

  const simulatedCrash = (boundary: string, phase: 'before' | 'after'): Error => {
    const error = new Error(`simulated crash ${phase} ${boundary}`) as NodeJS.ErrnoException;
    error.code = 'SIMULATED_CRASH';
    return error;
  };

  const around = async <T>(boundary: string, operation: () => Promise<T>): Promise<T> => {
    const occurrence = (fault.occurrences.get(boundary) ?? 0) + 1;
    fault.occurrences.set(boundary, occurrence);
    const matches =
      fault.rule?.boundary === boundary &&
      fault.rule.occurrence === occurrence &&
      !fault.rule.triggered;
    if (matches && fault.rule?.phase === 'before') {
      fault.rule.triggered = true;
      fault.crashed = true;
      throw simulatedCrash(boundary, 'before');
    }
    const result = await operation();
    if (matches && fault.rule?.phase === 'after') {
      fault.rule.triggered = true;
      fault.crashed = true;
      throw simulatedCrash(boundary, 'after');
    }
    return result;
  };

  const isRecoveryTemporary = (path: string): boolean =>
    basename(path).startsWith('.source-recovery.') && path.endsWith('.tmp');
  const isJournalTemporary = (path: string): boolean =>
    Boolean(fault.journalTarget) &&
    path.startsWith(`${fault.journalTarget}.`) &&
    path.endsWith('.tmp');

  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const path = String(args[0]);
      const handle = await actual.open(...args);
      return new Proxy(handle, {
        get(target, property, receiver) {
          if (property === 'write' && isRecoveryTemporary(path)) {
            return (...writeArgs: Parameters<typeof target.write>) =>
              around('temp-write', () => target.write(...writeArgs));
          }
          if (property === 'writeFile' && isJournalTemporary(path)) {
            return (...writeArgs: Parameters<typeof target.writeFile>) =>
              around('journal-temp-write', () => target.writeFile(...writeArgs));
          }
          if (property === 'sync') {
            if (isRecoveryTemporary(path)) {
              return () => around('temp-fsync', () => target.sync());
            }
            if (path === fault.recoveryTarget) {
              return () => around('target-fsync', () => target.sync());
            }
            if (path === fault.recoveryDirectory) {
              return () => around('parent-fsync', () => target.sync());
            }
            if (isJournalTemporary(path)) {
              return () => {
                fault.journalEvents.push('journal-temp-fsync');
                return around('journal-temp-fsync', () => target.sync());
              };
            }
            if (path === fault.journalDirectory) {
              return () => around('journal-parent-fsync', () => target.sync());
            }
          }
          const value = Reflect.get(target, property, receiver) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
    link: async (
      existingPath: Parameters<typeof actual.link>[0],
      newPath: Parameters<typeof actual.link>[1]
    ) => {
      const targetPath = String(newPath);
      if (targetPath === fault.recoveryTarget) {
        return around('publish-link', () => actual.link(existingPath, newPath));
      }
      if (targetPath === fault.journalTarget) {
        fault.journalEvents.push('journal-link');
        return around('journal-link', () => actual.link(existingPath, newPath));
      }
      return actual.link(existingPath, newPath);
    },
    rename: async (
      oldPath: Parameters<typeof actual.rename>[0],
      newPath: Parameters<typeof actual.rename>[1]
    ) => {
      if (String(newPath) === fault.journalTarget) {
        fault.journalEvents.push('journal-rename');
        return around('journal-rename', () => actual.rename(oldPath, newPath));
      }
      return actual.rename(oldPath, newPath);
    },
    unlink: async (path: Parameters<typeof actual.unlink>[0]) => {
      const value = String(path);
      if (fault.crashed && (isRecoveryTemporary(value) || isJournalTemporary(value))) {
        const error = new Error(
          'simulated process termination before cleanup'
        ) as NodeJS.ErrnoException;
        error.code = 'EIO';
        throw error;
      }
      if (isRecoveryTemporary(value)) {
        return around('temp-unlink', () => actual.unlink(path));
      }
      if (value === fault.recoveryTarget) {
        fault.rollbackUnlinkCount += 1;
        return around('rollback-unlink', () => actual.unlink(path));
      }
      if (isJournalTemporary(value)) {
        return around('journal-temp-unlink', () => actual.unlink(path));
      }
      return actual.unlink(path);
    },
    lstat: async (...args: Parameters<typeof actual.lstat>) => {
      const path = String(args[0]);
      if (fault.journalTemporaryUidDelta !== 0 && isJournalTemporary(path)) {
        const metadata = await actual.lstat(...args);
        return Object.assign(Object.create(Object.getPrototypeOf(metadata)), metadata, {
          uid: metadata.uid + fault.journalTemporaryUidDelta,
        });
      }
      if (fault.replaceTargetOnLstat && path === fault.recoveryTarget) {
        fault.replaceTargetOnLstat = false;
        const staleMetadata = await actual.lstat(...args);
        const replacement = `${path}.replacement`;
        await actual.writeFile(replacement, fault.replacementBytes);
        await actual.rename(replacement, path);
        if (process.env.SOURCE_RECOVERY_TEST_MUTATION_STALE_LSTAT === '1') {
          return staleMetadata;
        }
      }
      return actual.lstat(...args);
    },
  };
});

import {
  inspectRecoveryTarget,
  preflightRecoveryExecution,
  publishNoReplace,
  reconcilePublishedTarget,
  reconcileRollbackTarget,
  rollbackPublished,
  type PublishInput,
} from '../../../../tools/qdrant/source-recovery-filesystem.js';
import {
  calculateRecoveryManifestSha256,
  createInitialProgressJournal,
  replaceProgressJournal,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest.js';
import {
  runSourceRecoveryCommand,
  type RecoveryWorkflowDependencies,
} from '../../../../tools/qdrant/source-recovery.js';

const RUN_ID = 'ea25d26d-9dc3-4c2c-9e42-95ab8270cb6e';
const ORGANIZATION_ID = 'caacdf41-6267-471b-9331-02a45611a8a7';
const COURSE_ID = '5191a3cc-d417-4451-9bc6-240ac38e469c';
const ORIGINAL_BYTES = 'exact original bytes';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const uuid = (index: number): string =>
  `${index.toString(16).padStart(8, '0')}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;

function recoveryManifest(overrides: Partial<SourceRecoveryManifest> = {}): SourceRecoveryManifest {
  const copies = Array.from({ length: 42 }, (_, index) => ({
    entry_id: `copy-${index.toString().padStart(2, '0')}`,
    source_relative_path: `tenant/source-${index}.pdf`,
    target_relative_path: `tenant/target-${index}.pdf`,
    expected_size: index + 1,
    expected_sha256: ((index % 15) + 1).toString(16).repeat(64),
    affected_file_catalog_rows: index === 0 ? 84 : 1,
  }));
  const eligible = Array.from({ length: 6 }, (_, index) => ({
    entry_id: `disposition-eligible-${index}`,
    kind: 'eligible_unrecoverable' as const,
    file_catalog_id: uuid(index + 1),
    organization_id: ORGANIZATION_ID,
    course_id: COURSE_ID,
    expected_hash: 'a'.repeat(64),
    expected_storage_path: `uploads/course/missing-${index}.pdf`,
    expected_vector_status: 'indexed' as const,
    expected_file_error_message: null,
    reason: 'source_file_unrecoverable' as const,
  }));
  const playbooks = Array.from({ length: 18 }, (_, index) => ({
    entry_id: `disposition-playbook-${index.toString().padStart(2, '0')}`,
    kind: 'career_playbook_retained_derived' as const,
    file_catalog_id: uuid(index + 101),
    organization_id: ORGANIZATION_ID,
    course_id: null,
    expected_hash: 'b'.repeat(64),
    expected_storage_path: `uploads/career/missing-${index}.pdf`,
    expected_vector_status: 'indexed' as const,
    expected_file_error_message: null,
    reason: 'retained-derived-only' as const,
  }));
  return {
    schema_version: 'megacampus.qdrant.source-recovery/v1',
    run_id: RUN_ID,
    release_sha: 'a'.repeat(40),
    generated_at: '2026-07-12T18:00:00.000Z',
    operator_image_digest: `sha256:${'e'.repeat(64)}`,
    source_audit_version: 'megacampus.q12-source-audit/v1',
    development_root: '/opt/megacampus/data/uploads-dev',
    production_root: '/opt/megacampus/data/uploads',
    pre_counts: {
      total: 261,
      eligible: 240,
      recoverable: 109,
      missing: 129,
      invalid: 2,
      unsupported: 21,
    },
    expected_post_counts: {
      total: 261,
      eligible: 240,
      recoverable: 234,
      missing: 4,
      invalid: 2,
      unsupported: 21,
    },
    copies,
    dispositions: [...eligible, ...playbooks],
    ...overrides,
  };
}

async function filesystemFixture(): Promise<{
  root: string;
  input: PublishInput;
  target: string;
  temporary: string;
}> {
  const root = await mkdtemp('/tmp/mc2-source-recovery-crash-');
  const developmentRoot = join(root, 'development');
  const productionRoot = join(root, 'production');
  const source = join(developmentRoot, 'tenant', 'source.pdf');
  const target = join(productionRoot, 'tenant', 'target.pdf');
  await mkdir(dirname(source), { recursive: true });
  await mkdir(dirname(target), { recursive: true });
  await writeFile(source, ORIGINAL_BYTES);
  const input: PublishInput = {
    runId: RUN_ID,
    developmentRoot,
    productionRoot,
    rootBinding: { development_root: developmentRoot, production_root: productionRoot },
    entry: {
      entry_id: 'copy-1',
      source_relative_path: 'tenant/source.pdf',
      target_relative_path: 'tenant/target.pdf',
      expected_size: Buffer.byteLength(ORIGINAL_BYTES),
      expected_sha256: sha256(ORIGINAL_BYTES),
      affected_file_catalog_rows: 1,
    },
  };
  return {
    root,
    input,
    target,
    temporary: join(dirname(target), `.source-recovery.${RUN_ID}.copy-1.tmp`),
  };
}

function arm(
  boundary: string,
  phase: 'before' | 'after',
  options: { occurrence?: number; target?: string; journal?: string } = {}
): void {
  fault.rule = {
    boundary,
    phase,
    occurrence: options.occurrence ?? 1,
    triggered: false,
  };
  fault.occurrences.clear();
  fault.crashed = false;
  fault.recoveryTarget = options.target ?? '';
  fault.recoveryDirectory = options.target ? dirname(options.target) : '';
  fault.journalTarget = options.journal ?? '';
  fault.journalDirectory = options.journal ? dirname(options.journal) : '';
}

function disarm(): void {
  fault.rule = null;
  fault.occurrences.clear();
  fault.crashed = false;
  fault.recoveryTarget = '';
  fault.recoveryDirectory = '';
  fault.journalTarget = '';
  fault.journalDirectory = '';
  fault.replaceTargetOnLstat = false;
  fault.replacementBytes = '';
  fault.journalTemporaryUidDelta = 0;
  fault.journalEvents = [];
  fault.rollbackUnlinkCount = 0;
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  );
}

async function journalTemporaryPaths(directory: string): Promise<string[]> {
  return (await readdir(directory))
    .filter(name => name.startsWith('journal.json.') && name.endsWith('.tmp'))
    .map(name => join(directory, name));
}

afterEach(() => disarm());

const publicationBoundaries = [
  { boundary: 'temp-write', occurrence: 1 },
  { boundary: 'temp-fsync', occurrence: 1 },
  { boundary: 'temp-fsync', occurrence: 2 },
  { boundary: 'publish-link', occurrence: 1 },
  { boundary: 'target-fsync', occurrence: 1 },
  { boundary: 'parent-fsync', occurrence: 1 },
  { boundary: 'temp-unlink', occurrence: 1 },
  { boundary: 'parent-fsync', occurrence: 2 },
] as const;

describe('source recovery crash-order and inode acceptance matrix', () => {
  it.each(
    publicationBoundaries.flatMap(item =>
      (['before', 'after'] as const).map(phase => ({ ...item, phase }))
    )
  )(
    'recovers deterministically from $phase $boundary occurrence $occurrence',
    async ({ boundary, occurrence, phase }) => {
      const value = await filesystemFixture();
      try {
        arm(boundary, phase, { occurrence, target: value.target });
        await expect(publishNoReplace(value.input)).rejects.toThrow(/simulated crash/iu);
        expect(fault.rule?.triggered).toBe(true);
        disarm();

        const targetInspection = await inspectRecoveryTarget(value.input);
        const temporaryExists = await exists(value.temporary);
        if (targetInspection === 'exact') {
          await expect(publishNoReplace(value.input)).rejects.toThrow(/target already exists/iu);
          await expect(
            reconcilePublishedTarget(value.input, 'planned', { executionStarted: true })
          ).resolves.toBe('published');
        } else if (temporaryExists) {
          const temporaryBytes = await readFile(value.temporary, 'utf8');
          if (temporaryBytes === ORIGINAL_BYTES) {
            await expect(
              preflightRecoveryExecution({
                runId: RUN_ID,
                developmentRoot: value.input.developmentRoot,
                productionRoot: value.input.productionRoot,
                rootBinding: value.input.rootBinding,
                entries: [value.input.entry],
                copyStates: { [value.input.entry.entry_id]: 'planned' },
                phase: 'planned',
              })
            ).rejects.toThrow(/temporary.*pre-existing|execution.*start/iu);
            await expect(
              preflightRecoveryExecution({
                runId: RUN_ID,
                developmentRoot: value.input.developmentRoot,
                productionRoot: value.input.productionRoot,
                rootBinding: value.input.rootBinding,
                entries: [value.input.entry],
                copyStates: { [value.input.entry.entry_id]: 'planned' },
                phase: 'copying',
              })
            ).resolves.toBeUndefined();
            await publishNoReplace(value.input);
          } else {
            await expect(publishNoReplace(value.input)).rejects.toThrow(/temporary.*mismatch/iu);
          }
        } else {
          await publishNoReplace(value.input);
        }

        if ((await inspectRecoveryTarget(value.input)) === 'exact') {
          expect(await readFile(value.target, 'utf8')).toBe(ORIGINAL_BYTES);
          expect((await readdir(dirname(value.target))).sort()).toEqual(['target.pdf']);
        } else {
          expect(await exists(value.target)).toBe(false);
        }
      } finally {
        disarm();
        await rm(value.root, { recursive: true, force: true });
      }
    }
  );

  it('never deletes a same-byte replacement inode during rollback', async () => {
    const value = await filesystemFixture();
    try {
      await publishNoReplace(value.input);
      const original = await stat(value.target, { bigint: true });
      fault.recoveryTarget = value.target;
      fault.replaceTargetOnLstat = true;
      fault.replacementBytes = ORIGINAL_BYTES;

      await expect(
        rollbackPublished({
          ...value.input,
          phase: 'copied',
          journalState: 'rollback_planned',
        })
      ).rejects.toThrow(/inode changed/iu);

      const replacement = await stat(value.target, { bigint: true });
      expect(replacement.ino).not.toBe(original.ino);
      expect(await readFile(value.target, 'utf8')).toBe(ORIGINAL_BYTES);
    } finally {
      disarm();
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it('never deletes changed, mismatched, or untracked targets', async () => {
    const changed = await filesystemFixture();
    const untracked = await filesystemFixture();
    try {
      await publishNoReplace(changed.input);
      await writeFile(changed.target, 'changed bytes');
      await expect(
        rollbackPublished({
          ...changed.input,
          phase: 'copied',
          journalState: 'rollback_planned',
        })
      ).rejects.toThrow(/size mismatch|hash mismatch/iu);
      expect(await readFile(changed.target, 'utf8')).toBe('changed bytes');

      await writeFile(untracked.target, ORIGINAL_BYTES);
      await expect(
        rollbackPublished({
          ...untracked.input,
          phase: 'copied',
          journalState: 'published',
        })
      ).rejects.toThrow(/rollback_planned/iu);
      expect(await readFile(untracked.target, 'utf8')).toBe(ORIGINAL_BYTES);
    } finally {
      await Promise.all(
        [changed.root, untracked.root].map(root => rm(root, { recursive: true, force: true }))
      );
    }
  });

  it.each(['before', 'after'] as const)(
    'reconciles a %s crash at rollback unlink without a second deletion',
    async phase => {
      const value = await filesystemFixture();
      try {
        await publishNoReplace(value.input);
        arm('rollback-unlink', phase, { target: value.target });
        await expect(
          rollbackPublished({
            ...value.input,
            phase: 'copied',
            journalState: 'rollback_planned',
          })
        ).rejects.toThrow(/simulated crash/iu);
        expect(fault.rule?.triggered).toBe(true);
        disarm();

        if (await exists(value.target)) {
          await rollbackPublished({
            ...value.input,
            phase: 'copied',
            journalState: 'rollback_planned',
          });
        }
        expect(await exists(value.target)).toBe(false);
        expect((await readdir(dirname(value.target))).sort()).toEqual([]);
      } finally {
        disarm();
        await rm(value.root, { recursive: true, force: true });
      }
    }
  );

  it.each(['before', 'after'] as const)(
    'restarts the public rollback workflow after a %s parent-fsync crash',
    async phase => {
      const value = await filesystemFixture();
      const base = recoveryManifest();
      const entry = {
        ...value.input.entry,
        entry_id: base.copies[0].entry_id,
        affected_file_catalog_rows: base.copies[0].affected_file_catalog_rows,
      };
      const manifest = recoveryManifest({
        development_root: value.input.developmentRoot,
        production_root: value.input.productionRoot,
        copies: [entry, ...base.copies.slice(1)],
      });
      const publishInput: PublishInput = { ...value.input, entry };
      let journal = createInitialProgressJournal(
        manifest,
        calculateRecoveryManifestSha256(manifest)
      );
      journal = {
        ...journal,
        phase: 'copied',
        copy_states: Object.fromEntries(
          manifest.copies.map(copyEntry => [
            copyEntry.entry_id,
            copyEntry.entry_id === entry.entry_id ? 'rollback_planned' : 'rolled_back',
          ])
        ),
      };
      const dependencies: RecoveryWorkflowDependencies = {
        createPlan: () => Promise.resolve(manifest),
        preflightCopies: () => Promise.resolve(),
        preflightExecution: () => Promise.resolve(),
        writePlan: () =>
          Promise.resolve({
            manifest,
            manifestSha256: calculateRecoveryManifestSha256(manifest),
            journal,
          }),
        loadReviewedState: () =>
          Promise.resolve({
            manifest,
            manifestSha256: calculateRecoveryManifestSha256(manifest),
            journal,
          }),
        persistJournal: (_current, next) => {
          journal = next;
          return Promise.resolve();
        },
        readSourceCounts: () => Promise.resolve(manifest.expected_post_counts),
        inspectCopy: () => Promise.resolve('absent'),
        publishCopy: () => Promise.reject(new Error('rollback must not publish')),
        rollbackCopy: async (_entry, current) => {
          const reconciliation = await reconcileRollbackTarget(publishInput, 'rollback_planned');
          if (reconciliation === 'ready_to_rollback') {
            await rollbackPublished({
              ...publishInput,
              phase: current.phase,
              journalState: 'rollback_planned',
            });
          }
        },
        applyDisposition: () => Promise.resolve('disposition_applied'),
        verifyDispositions: () => Promise.resolve(),
      };

      try {
        await publishNoReplace(publishInput);
        arm('parent-fsync', phase, { target: value.target });
        await expect(
          runSourceRecoveryCommand({ mode: 'rollback', confirmRunId: RUN_ID }, dependencies)
        ).rejects.toThrow(/simulated crash/iu);
        expect(journal.copy_states[entry.entry_id]).toBe('rollback_planned');
        expect(await exists(value.target)).toBe(false);
        const unlinkCount = fault.rollbackUnlinkCount;

        disarm();
        fault.recoveryTarget = value.target;
        fault.recoveryDirectory = dirname(value.target);
        fault.rollbackUnlinkCount = unlinkCount;
        await expect(
          runSourceRecoveryCommand({ mode: 'rollback', confirmRunId: RUN_ID }, dependencies)
        ).resolves.toMatchObject({ mode: 'rollback', rolledBack: 1 });

        expect(fault.rollbackUnlinkCount).toBe(1);
        expect(journal.copy_states[entry.entry_id]).toBe('rolled_back');
        expect((await readdir(dirname(value.target))).sort()).toEqual([]);
      } finally {
        disarm();
        await rm(value.root, { recursive: true, force: true });
      }
    }
  );
});

const journalInitialBoundaries = [
  { boundary: 'journal-temp-write', occurrence: 1 },
  { boundary: 'journal-temp-fsync', occurrence: 1 },
  { boundary: 'journal-link', occurrence: 1 },
  { boundary: 'journal-parent-fsync', occurrence: 1 },
  { boundary: 'journal-temp-unlink', occurrence: 1 },
  { boundary: 'journal-parent-fsync', occurrence: 2 },
] as const;

describe('source recovery journal persistence crash matrix', () => {
  it.each(
    (['initial', 'replacement'] as const).flatMap(publication => [
      { publication, boundary: 'journal-temp-write', phase: 'after' as const },
      { publication, boundary: 'journal-temp-fsync', phase: 'before' as const },
    ])
  )(
    'fsyncs the reused $publication temporary before publication following $phase $boundary',
    async ({ publication, boundary, phase }) => {
      const directory = await mkdtemp('/tmp/mc2-source-recovery-journal-reuse-');
      const journalPath = join(directory, 'journal.json');
      const manifest = recoveryManifest();
      const initial = createInitialProgressJournal(
        manifest,
        calculateRecoveryManifestSha256(manifest)
      );
      const next: RecoveryProgressJournal =
        publication === 'initial' ? initial : { ...initial, revision: 1, phase: 'copying' };
      const expectedRevision = publication === 'initial' ? -1 : initial.revision;
      const publicationEvent = publication === 'initial' ? 'journal-link' : 'journal-rename';

      try {
        await chmod(directory, 0o700);
        if (publication === 'replacement') {
          await replaceProgressJournal(journalPath, -1, initial, manifest);
        }
        arm(boundary, phase, { journal: journalPath });
        await expect(
          replaceProgressJournal(journalPath, expectedRevision, next, manifest)
        ).rejects.toThrow(/simulated crash/iu);
        const residue = await journalTemporaryPaths(directory);
        expect(residue).toHaveLength(1);
        expect(await readFile(residue[0], 'utf8')).toBe(`${JSON.stringify(next, null, 2)}\n`);

        disarm();
        fault.journalTarget = journalPath;
        fault.journalDirectory = directory;
        await expect(
          replaceProgressJournal(journalPath, expectedRevision, next, manifest)
        ).resolves.toBeUndefined();

        const reusedTemporaryFsync = fault.journalEvents.indexOf('journal-temp-fsync');
        const publicationIndex = fault.journalEvents.indexOf(publicationEvent);
        expect(reusedTemporaryFsync).toBeGreaterThanOrEqual(0);
        expect(publicationIndex).toBeGreaterThan(reusedTemporaryFsync);
      } finally {
        disarm();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );

  it.each(
    journalInitialBoundaries.flatMap(item =>
      (['before', 'after'] as const).map(phase => ({ ...item, phase }))
    )
  )(
    'reconciles initial journal failure $phase $boundary',
    async ({ boundary, occurrence, phase }) => {
      const directory = await mkdtemp('/tmp/mc2-source-recovery-journal-initial-');
      const journalPath = join(directory, 'journal.json');
      const manifest = recoveryManifest();
      const journal = createInitialProgressJournal(
        manifest,
        calculateRecoveryManifestSha256(manifest)
      );
      try {
        await chmod(directory, 0o700);
        arm(boundary, phase, { occurrence, journal: journalPath });
        await expect(replaceProgressJournal(journalPath, -1, journal, manifest)).rejects.toThrow(
          /simulated crash/iu
        );
        const residue = await journalTemporaryPaths(directory);
        const expectsResidue =
          !(boundary === 'journal-parent-fsync' && occurrence === 2) &&
          !(boundary === 'journal-temp-unlink' && phase === 'after');
        expect(residue).toHaveLength(expectsResidue ? 1 : 0);
        disarm();

        const expectedContent = `${JSON.stringify(journal, null, 2)}\n`;
        const committedBeforeRestart = await exists(journalPath);
        if (residue.length > 0 && (await readFile(residue[0], 'utf8')) !== expectedContent) {
          await expect(replaceProgressJournal(journalPath, -1, journal, manifest)).rejects.toThrow(
            /temporary.*mismatch/iu
          );
          expect(await journalTemporaryPaths(directory)).toEqual(residue);
          return;
        } else if (committedBeforeRestart) {
          await expect(replaceProgressJournal(journalPath, -1, journal, manifest)).rejects.toThrow(
            /revision mismatch/iu
          );
        } else {
          await expect(
            replaceProgressJournal(journalPath, -1, journal, manifest)
          ).resolves.toBeUndefined();
        }
        expect(JSON.parse(await readFile(journalPath, 'utf8'))).toEqual(journal);
        expect((await readdir(directory)).sort()).toEqual(['journal.json']);
      } finally {
        disarm();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );

  it.each(
    [
      { boundary: 'journal-temp-write', occurrence: 1 },
      { boundary: 'journal-temp-fsync', occurrence: 1 },
      { boundary: 'journal-rename', occurrence: 1 },
      { boundary: 'journal-parent-fsync', occurrence: 1 },
    ].flatMap(item => (['before', 'after'] as const).map(phase => ({ ...item, phase })))
  )(
    'reconciles replacement journal failure $phase $boundary',
    async ({ boundary, occurrence, phase }) => {
      const directory = await mkdtemp('/tmp/mc2-source-recovery-journal-replace-');
      const journalPath = join(directory, 'journal.json');
      const manifest = recoveryManifest();
      const initial = createInitialProgressJournal(
        manifest,
        calculateRecoveryManifestSha256(manifest)
      );
      const copying: RecoveryProgressJournal = { ...initial, revision: 1, phase: 'copying' };
      try {
        await chmod(directory, 0o700);
        await replaceProgressJournal(journalPath, -1, initial, manifest);
        arm(boundary, phase, { occurrence, journal: journalPath });
        await expect(
          replaceProgressJournal(journalPath, initial.revision, copying, manifest)
        ).rejects.toThrow(/simulated crash/iu);
        const residue = await journalTemporaryPaths(directory);
        expect(residue).toHaveLength(
          boundary === 'journal-parent-fsync' ||
            (boundary === 'journal-rename' && phase === 'after')
            ? 0
            : 1
        );
        disarm();

        const expectedContent = `${JSON.stringify(copying, null, 2)}\n`;
        const durableBeforeRestart = JSON.parse(
          await readFile(journalPath, 'utf8')
        ) as RecoveryProgressJournal;
        if (residue.length > 0 && (await readFile(residue[0], 'utf8')) !== expectedContent) {
          await expect(
            replaceProgressJournal(journalPath, initial.revision, copying, manifest)
          ).rejects.toThrow(/temporary.*mismatch/iu);
          expect(await journalTemporaryPaths(directory)).toEqual(residue);
          return;
        } else if (durableBeforeRestart.revision === copying.revision) {
          await expect(
            replaceProgressJournal(journalPath, initial.revision, copying, manifest)
          ).rejects.toThrow(/revision mismatch/iu);
        } else {
          await expect(
            replaceProgressJournal(journalPath, initial.revision, copying, manifest)
          ).resolves.toBeUndefined();
        }
        expect(JSON.parse(await readFile(journalPath, 'utf8'))).toEqual(copying);
        expect((await readdir(directory)).sort()).toEqual(['journal.json']);
      } finally {
        disarm();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );

  it.each(['mismatch', 'mode', 'symlink', 'owner'] as const)(
    'fails closed for a %s journal crash temporary',
    async corruption => {
      const directory = await mkdtemp('/tmp/mc2-source-recovery-journal-corrupt-');
      const journalPath = join(directory, 'journal.json');
      const manifest = recoveryManifest();
      const journal = createInitialProgressJournal(
        manifest,
        calculateRecoveryManifestSha256(manifest)
      );
      try {
        await chmod(directory, 0o700);
        arm('journal-temp-write', 'after', { journal: journalPath });
        await expect(replaceProgressJournal(journalPath, -1, journal, manifest)).rejects.toThrow(
          /simulated crash/iu
        );
        const [temporaryPath] = await journalTemporaryPaths(directory);
        expect(temporaryPath).toBeTruthy();
        disarm();

        if (corruption === 'mismatch') await writeFile(temporaryPath, 'wrong bytes');
        if (corruption === 'mode') await chmod(temporaryPath, 0o640);
        if (corruption === 'symlink') {
          const exact = await readFile(temporaryPath);
          const external = join(directory, 'external.json');
          await rm(temporaryPath);
          await writeFile(external, exact, { mode: 0o600 });
          await symlink(external, temporaryPath);
        }
        if (corruption === 'owner') {
          fault.journalTarget = journalPath;
          fault.journalDirectory = directory;
          fault.journalTemporaryUidDelta = 1;
        }

        await expect(replaceProgressJournal(journalPath, -1, journal, manifest)).rejects.toThrow(
          /temporary.*(mismatch|0600|own|symlink|regular)/iu
        );
        expect(await exists(temporaryPath)).toBe(true);
      } finally {
        disarm();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );
});

type PersistBoundary =
  | { kind: 'copying'; phase: 'before' | 'after' }
  | { kind: 'published'; entryId: string; phase: 'before' | 'after' }
  | { kind: 'copied'; phase: 'before' | 'after' }
  | { kind: 'rollback_planned'; entryId: string; phase: 'before' | 'after' }
  | { kind: 'rolled_back'; entryId: string; phase: 'before' | 'after' };

function persistBoundary(
  current: RecoveryProgressJournal,
  next: RecoveryProgressJournal
): Omit<PersistBoundary, 'phase'> | undefined {
  if (current.phase === 'planned' && next.phase === 'copying') return { kind: 'copying' };
  if (current.phase === 'copying' && next.phase === 'copied') return { kind: 'copied' };
  for (const [entryId, state] of Object.entries(next.copy_states)) {
    const prior = current.copy_states[entryId];
    if (prior === state) continue;
    if (prior === 'planned' && state === 'published') return { kind: 'published', entryId };
    if (prior === 'published' && state === 'rollback_planned') {
      return { kind: 'rollback_planned', entryId };
    }
    if (prior === 'rollback_planned' && state === 'rolled_back') {
      return { kind: 'rolled_back', entryId };
    }
  }
  return undefined;
}

function matchesBoundary(
  actual: Omit<PersistBoundary, 'phase'> | undefined,
  expected: PersistBoundary
): boolean {
  return (
    actual?.kind === expected.kind &&
    (!('entryId' in expected) || ('entryId' in actual && actual.entryId === expected.entryId))
  );
}

function workflowHarness(input: {
  initial: RecoveryProgressJournal;
  boundary: PersistBoundary;
  published?: Set<string>;
}) {
  const manifest = recoveryManifest();
  let durable = structuredClone(input.initial);
  let armed = true;
  const targets = input.published ?? new Set<string>();
  const publishCounts = new Map<string, number>();
  const rollbackCounts = new Map<string, number>();
  const dependencies: RecoveryWorkflowDependencies = {
    createPlan: () => Promise.resolve(manifest),
    preflightCopies: () => Promise.resolve(),
    preflightExecution: () => Promise.resolve(),
    writePlan: () =>
      Promise.resolve({
        manifest,
        manifestSha256: calculateRecoveryManifestSha256(manifest),
        journal: durable,
      }),
    loadReviewedState: () =>
      Promise.resolve({
        manifest,
        manifestSha256: calculateRecoveryManifestSha256(manifest),
        journal: structuredClone(durable),
      }),
    persistJournal: (current, next) => {
      const boundary = persistBoundary(current, next);
      if (armed && matchesBoundary(boundary, input.boundary)) {
        armed = false;
        if (input.boundary.phase === 'after') durable = structuredClone(next);
        return Promise.reject(new Error(`simulated journal crash ${input.boundary.phase}`));
      }
      durable = structuredClone(next);
      return Promise.resolve();
    },
    readSourceCounts: () => Promise.resolve(manifest.expected_post_counts),
    inspectCopy: entry => Promise.resolve(targets.has(entry.entry_id) ? 'exact' : 'absent'),
    publishCopy: entry => {
      publishCounts.set(entry.entry_id, (publishCounts.get(entry.entry_id) ?? 0) + 1);
      if (targets.has(entry.entry_id)) return Promise.reject(new Error('duplicate publication'));
      targets.add(entry.entry_id);
      return Promise.resolve();
    },
    rollbackCopy: entry => {
      if (targets.delete(entry.entry_id)) {
        rollbackCounts.set(entry.entry_id, (rollbackCounts.get(entry.entry_id) ?? 0) + 1);
      }
      return Promise.resolve();
    },
    applyDisposition: () => Promise.resolve('disposition_applied'),
    verifyDispositions: () => Promise.resolve(),
  };
  return {
    dependencies,
    durable: () => structuredClone(durable),
    targets,
    publishCounts,
    rollbackCounts,
  };
}

describe('source recovery workflow write-ahead crash matrix', () => {
  it.each((['before', 'after'] as const).map(phase => ({ kind: 'copying' as const, phase })))(
    'persists copying before any publication across a $phase crash',
    async boundary => {
      const initial = createInitialProgressJournal(
        recoveryManifest(),
        calculateRecoveryManifestSha256(recoveryManifest())
      );
      const harness = workflowHarness({ initial, boundary });
      await expect(
        runSourceRecoveryCommand({ mode: 'execute', confirmRunId: RUN_ID }, harness.dependencies)
      ).rejects.toThrow(/simulated journal crash/iu);
      expect(harness.targets.size).toBe(0);
      await runSourceRecoveryCommand(
        { mode: 'execute', confirmRunId: RUN_ID },
        harness.dependencies
      );
      expect(harness.durable().phase).toBe('copied');
      expect([...harness.publishCounts.values()].every(count => count === 1)).toBe(true);
    }
  );

  it.each(
    recoveryManifest().copies.flatMap(entry =>
      (['before', 'after'] as const).map(phase => ({
        kind: 'published' as const,
        entryId: entry.entry_id,
        phase,
      }))
    )
  )('never republishes $entryId across a $phase published-state crash', async boundary => {
    const manifest = recoveryManifest();
    const initial = createInitialProgressJournal(
      manifest,
      calculateRecoveryManifestSha256(manifest)
    );
    const harness = workflowHarness({ initial, boundary });
    await expect(
      runSourceRecoveryCommand({ mode: 'execute', confirmRunId: RUN_ID }, harness.dependencies)
    ).rejects.toThrow(/simulated journal crash/iu);
    await runSourceRecoveryCommand({ mode: 'execute', confirmRunId: RUN_ID }, harness.dependencies);
    expect(harness.durable().phase).toBe('copied');
    expect(harness.publishCounts.get(boundary.entryId)).toBe(1);
    expect(harness.targets.size).toBe(42);
  });

  it.each((['before', 'after'] as const).map(phase => ({ kind: 'copied' as const, phase })))(
    'leaves an unambiguous copied terminal after a $phase copied transition crash',
    async boundary => {
      const manifest = recoveryManifest();
      const initial = createInitialProgressJournal(
        manifest,
        calculateRecoveryManifestSha256(manifest)
      );
      const harness = workflowHarness({ initial, boundary });
      await expect(
        runSourceRecoveryCommand({ mode: 'execute', confirmRunId: RUN_ID }, harness.dependencies)
      ).rejects.toThrow(/simulated journal crash/iu);
      if (harness.durable().phase === 'copying') {
        await runSourceRecoveryCommand(
          { mode: 'execute', confirmRunId: RUN_ID },
          harness.dependencies
        );
      }
      expect(harness.durable().phase).toBe('copied');
      expect([...harness.publishCounts.values()].every(count => count === 1)).toBe(true);
      expect(harness.targets.size).toBe(42);
    }
  );

  it.each(
    recoveryManifest().copies.flatMap(entry =>
      (['rollback_planned', 'rolled_back'] as const).flatMap(kind =>
        (['before', 'after'] as const).map(phase => ({ kind, entryId: entry.entry_id, phase }))
      )
    )
  )('never deletes $entryId twice across $phase $kind crash', async boundary => {
    const manifest = recoveryManifest();
    const copied = createInitialProgressJournal(
      manifest,
      calculateRecoveryManifestSha256(manifest)
    );
    copied.phase = 'copied';
    copied.copy_states = Object.fromEntries(
      manifest.copies.map(entry => [entry.entry_id, 'published'])
    );
    const targets = new Set(manifest.copies.map(entry => entry.entry_id));
    const harness = workflowHarness({ initial: copied, boundary, published: targets });
    await expect(
      runSourceRecoveryCommand({ mode: 'rollback', confirmRunId: RUN_ID }, harness.dependencies)
    ).rejects.toThrow(/simulated journal crash/iu);
    await runSourceRecoveryCommand(
      { mode: 'rollback', confirmRunId: RUN_ID },
      harness.dependencies
    );
    expect(harness.targets.size).toBe(0);
    expect(harness.durable().copy_states[boundary.entryId]).toBe('rolled_back');
    expect(harness.rollbackCounts.get(boundary.entryId)).toBe(1);
  });
});
