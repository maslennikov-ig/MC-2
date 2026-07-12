import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createInitialProgressJournal,
  normalizeRecoveryManifest,
  replaceProgressJournal,
  validateRecoveryJournalTransition,
  writeImmutableManifest,
  type DurableWriteOperations,
  type RecoveryCopyEntry,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest.js';

const copy = (overrides: Partial<RecoveryCopyEntry> = {}): RecoveryCopyEntry => ({
  entry_id: 'copy-b',
  source_relative_path: 'development/b.pdf',
  target_relative_path: 'production/b.pdf',
  expected_size: 2,
  expected_sha256: 'b'.repeat(64),
  affected_file_catalog_rows: 1,
  ...overrides,
});

const manifest = (overrides: Partial<SourceRecoveryManifest> = {}): SourceRecoveryManifest => ({
  schema_version: 'megacampus.qdrant.source-recovery/v1',
  run_id: 'ea25d26d-9dc3-4c2c-9e42-95ab8270cb6e',
  release_sha: 'a'.repeat(40),
  pre_counts: {
    total: 5,
    eligible: 4,
    recoverable: 1,
    missing: 2,
    invalid: 1,
    unsupported: 1,
  },
  expected_post_counts: {
    total: 5,
    eligible: 4,
    recoverable: 3,
    missing: 1,
    invalid: 0,
    unsupported: 1,
  },
  copies: [
    copy(),
    copy({
      entry_id: 'copy-a',
      source_relative_path: 'development/a.pdf',
      target_relative_path: 'production/a.pdf',
      expected_size: 1,
      expected_sha256: 'a'.repeat(64),
      affected_file_catalog_rows: 1,
    }),
  ],
  dispositions: [
    {
      entry_id: 'disposition-b',
      kind: 'career_playbook_retained_derived',
      file_catalog_id: 'b88a28b8-3638-49d9-829a-4ab18ad3c613',
      career_playbook_source_id: '96b5a9fb-fb09-4bd7-b3de-fd70319d5dc8',
      organization_id: 'caacdf41-6267-471b-9331-02a45611a8a7',
      course_id: null,
      expected_hash: 'b'.repeat(64),
      expected_storage_path: 'career/b.pdf',
      reason: 'retained-derived-only',
    },
    {
      entry_id: 'disposition-a',
      kind: 'eligible_unrecoverable',
      file_catalog_id: '2e31f684-67a8-48b5-9c49-cc385fc04b37',
      organization_id: 'caacdf41-6267-471b-9331-02a45611a8a7',
      course_id: '5191a3cc-d417-4451-9bc6-240ac38e469c',
      expected_hash: 'a'.repeat(64),
      expected_storage_path: 'course/a.pdf',
      reason: 'source_file_unrecoverable',
    },
  ],
  ...overrides,
});

describe('source recovery manifest', () => {
  it('normalizes entries deterministically and rejects duplicate targets', () => {
    const normalized = normalizeRecoveryManifest(manifest());

    expect(normalized.copies.map(entry => entry.entry_id)).toEqual(['copy-a', 'copy-b']);
    expect(normalized.dispositions.map(entry => entry.entry_id)).toEqual([
      'disposition-a',
      'disposition-b',
    ]);

    expect(() =>
      normalizeRecoveryManifest(
        manifest({
          copies: [copy(), copy({ entry_id: 'copy-c', source_relative_path: 'other/c.pdf' })],
        })
      )
    ).toThrow(/duplicate target/iu);
  });

  it('rejects aggregate counts that do not match copy coverage', () => {
    expect(() =>
      normalizeRecoveryManifest(
        manifest({
          expected_post_counts: {
            total: 5,
            eligible: 4,
            recoverable: 4,
            missing: 0,
            invalid: 0,
            unsupported: 1,
          },
        })
      )
    ).toThrow(/copy coverage/iu);
  });

  it('writes an immutable owner-only manifest and binds the journal to its hash', async () => {
    const directory = await mkdtemp('/tmp/mc2-source-recovery-manifest-');
    const target = join(directory, 'manifest.json');

    try {
      const sha256 = await writeImmutableManifest(target, manifest());
      const content = await readFile(target, 'utf8');
      const journal = createInitialProgressJournal(normalizeRecoveryManifest(manifest()), sha256);

      expect(sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(content.indexOf('copy-a')).toBeLessThan(content.indexOf('copy-b'));
      expect((await stat(target)).mode & 0o777).toBe(0o600);
      expect(journal.manifest_sha256).toBe(sha256);
      expect(journal.copy_states).toEqual({ 'copy-a': 'planned', 'copy-b': 'planned' });
      await expect(writeImmutableManifest(target, manifest())).rejects.toThrow(/already exists/iu);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fsyncs the file before rename and the parent directory after rename', async () => {
    const calls: string[] = [];
    const operations: DurableWriteOperations = {
      async mkdir() {},
      async assertAbsent() {},
      async openTemporary() {
        calls.push('open-temp');
        return {
          async writeFile() {
            calls.push('write');
          },
          async chmod() {},
          async sync() {
            calls.push('fsync-file');
          },
          async close() {
            calls.push('close');
          },
        };
      },
      async rename() {
        calls.push('rename');
      },
      async openDirectory() {
        calls.push('open-parent');
        return {
          async sync() {
            calls.push('fsync-parent');
          },
          async close() {
            calls.push('close-parent');
          },
        };
      },
      async unlink() {},
    };

    await writeImmutableManifest('/state/manifest.json', manifest(), operations);

    expect(calls).toEqual([
      'open-temp',
      'write',
      'fsync-file',
      'close',
      'rename',
      'open-parent',
      'fsync-parent',
      'close-parent',
    ]);
  });

  it('rejects skipped phases and per-entry state transitions', () => {
    const current = createInitialProgressJournal(
      normalizeRecoveryManifest(manifest()),
      'c'.repeat(64)
    );

    expect(() =>
      validateRecoveryJournalTransition(current, {
        ...current,
        revision: 1,
        phase: 'copied',
      })
    ).toThrow(/phase transition/iu);

    expect(() =>
      validateRecoveryJournalTransition(current, {
        ...current,
        revision: 1,
        copy_states: { ...current.copy_states, 'copy-a': 'rolled_back' },
      })
    ).toThrow(/copy state transition/iu);
  });

  it('atomically replaces only the expected journal revision', async () => {
    const directory = await mkdtemp('/tmp/mc2-source-recovery-journal-');
    const target = join(directory, 'progress.json');
    const current = createInitialProgressJournal(
      normalizeRecoveryManifest(manifest()),
      'd'.repeat(64)
    );

    try {
      await replaceProgressJournal(target, -1, current);
      await replaceProgressJournal(target, 0, {
        ...current,
        revision: 1,
        phase: 'copying',
      });
      await expect(
        replaceProgressJournal(target, 0, {
          ...current,
          revision: 1,
          phase: 'copying',
        })
      ).rejects.toThrow(/revision mismatch/iu);
      expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({
        revision: 1,
        phase: 'copying',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
