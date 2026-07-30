/* eslint-disable @typescript-eslint/require-await -- synchronous in-memory fixtures implement Promise-returning filesystem interfaces */
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateRecoveryManifestSha256,
  createInitialProgressJournal,
  normalizeRecoveryManifest,
  replaceProgressJournal,
  validateRecoveryJournalTransition,
  writeImmutableManifest,
  type DurableWriteOperations,
  type RecoveryCopyEntry,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest.js';

const canonicalManifestSha256 = (): string => calculateRecoveryManifestSha256(manifest());

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
  generated_at: '2026-07-12T18:00:00.000Z',
  operator_image_digest: `sha256:${'e'.repeat(64)}`,
  source_audit_version: 'megacampus.q12-source-audit/v1',
  development_root: '/opt/megacampus/data/uploads-development',
  production_root: '/opt/megacampus/data/uploads',
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
      organization_id: 'caacdf41-6267-471b-9331-02a45611a8a7',
      course_id: null,
      expected_hash: 'b'.repeat(64),
      expected_storage_path: 'career/b.pdf',
      expected_vector_status: 'indexed',
      expected_file_error_message: null,
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
      expected_vector_status: 'indexed',
      expected_file_error_message: null,
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

  it('binds execution roots and rejects duplicate database identities', () => {
    expect(() =>
      normalizeRecoveryManifest(
        manifest({
          production_root: '/opt/megacampus/data/uploads-development/nested',
        })
      )
    ).toThrow(/root.*overlap/iu);

    const entries = manifest().dispositions;
    expect(() =>
      normalizeRecoveryManifest(
        manifest({
          dispositions: [
            entries[0],
            { ...entries[1], file_catalog_id: entries[0].file_catalog_id },
          ],
        })
      )
    ).toThrow(/file catalog/iu);
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

  it('rejects an existing recovery state directory that is not mode 0700', async () => {
    const directory = await mkdtemp('/tmp/mc2-source-recovery-state-mode-');
    const state = join(directory, 'state');
    await mkdir(state, { recursive: true, mode: 0o700 });
    await chmod(state, 0o755);
    try {
      await expect(
        writeImmutableManifest(join(state, 'manifest.json'), manifest())
      ).rejects.toThrow(/mode 0700/iu);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a mode-0700 state directory reached through a symbolic-link boundary', async () => {
    const directory = await mkdtemp('/tmp/mc2-source-recovery-state-link-');
    const actualRoot = join(directory, 'actual');
    const linkedRoot = join(directory, 'linked-root');
    const state = join(actualRoot, 'state');
    await mkdir(state, { recursive: true, mode: 0o700 });
    await symlink(actualRoot, linkedRoot, 'dir');
    try {
      await expect(
        writeImmutableManifest(join(linkedRoot, 'state', 'manifest.json'), manifest())
      ).rejects.toThrow(/real directory|symbolic link/iu);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('publishes the immutable manifest no-replace and fsyncs both directory changes', async () => {
    const calls: string[] = [];
    const operations: DurableWriteOperations = {
      async mkdir() {},
      async assertSecureDirectory() {},
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
      async link() {
        calls.push('link-no-replace');
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
      async unlink() {
        calls.push('unlink-temp');
      },
    };

    await writeImmutableManifest('/state/manifest.json', manifest(), operations);

    expect(calls).toEqual([
      'open-temp',
      'write',
      'fsync-file',
      'close',
      'link-no-replace',
      'open-parent',
      'fsync-parent',
      'close-parent',
      'unlink-temp',
      'open-parent',
      'fsync-parent',
      'close-parent',
    ]);
  });

  it('does not replace a manifest that appears after the absence precheck', async () => {
    const calls: string[] = [];
    const operations: DurableWriteOperations = {
      async mkdir() {},
      async assertSecureDirectory() {},
      async assertAbsent() {},
      async openTemporary() {
        return {
          async writeFile() {},
          async chmod() {},
          async sync() {},
          async close() {},
        };
      },
      async rename() {
        throw new Error('journal replacement should not be used');
      },
      async link() {
        const error = Object.assign(new Error('target raced'), { code: 'EEXIST' });
        throw error;
      },
      async openDirectory() {
        return { async sync() {}, async close() {} };
      },
      async unlink() {
        calls.push('cleanup-temp');
      },
    };

    await expect(
      writeImmutableManifest('/state/manifest.json', manifest(), operations)
    ).rejects.toThrow(/already exists/iu);
    expect(calls).toEqual(['cleanup-temp']);
  });

  it('does not unlink a deterministic temporary that races its exclusive open', async () => {
    let unlinkCalls = 0;
    const operations: DurableWriteOperations = {
      async mkdir() {},
      async assertSecureDirectory() {},
      async assertAbsent() {},
      async openTemporary() {
        throw Object.assign(new Error('temporary raced'), { code: 'EEXIST' });
      },
      async rename() {},
      async link() {},
      async openDirectory() {
        return { async sync() {}, async close() {} };
      },
      async unlink() {
        unlinkCalls += 1;
      },
    };

    await expect(
      writeImmutableManifest('/state/manifest.json', manifest(), operations)
    ).rejects.toMatchObject({ code: 'EEXIST' });
    expect(unlinkCalls).toBe(0);
  });

  it('rejects skipped phases and per-entry state transitions', () => {
    const current = createInitialProgressJournal(
      normalizeRecoveryManifest(manifest()),
      canonicalManifestSha256()
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

    const allPublished = {
      ...current,
      revision: 1,
      phase: 'copying' as const,
      copy_states: { 'copy-a': 'published' as const, 'copy-b': 'published' as const },
    };
    const copying = validateRecoveryJournalTransition(current, allPublished);
    const copied = validateRecoveryJournalTransition(copying, {
      ...copying,
      revision: 2,
      phase: 'copied',
    });

    expect(() =>
      validateRecoveryJournalTransition(copied, {
        ...copied,
        revision: 3,
        phase: 'dispositions_applied',
      })
    ).toThrow(/dispositions.*applied/iu);

    expect(() =>
      validateRecoveryJournalTransition(
        {
          ...copied,
          revision: 3,
          phase: 'verified',
          disposition_states: {
            'disposition-a': 'disposition_verified',
            'disposition-b': 'disposition_verified',
          },
        },
        {
          ...copied,
          revision: 4,
          phase: 'reindex_started',
          copy_states: { ...copied.copy_states, 'copy-a': 'rollback_planned' },
          disposition_states: {
            'disposition-a': 'disposition_verified',
            'disposition-b': 'disposition_verified',
          },
        }
      )
    ).toThrow(/reindex_started|copy states.*frozen/iu);
  });

  it('treats Career Playbook dispositions as file_catalog-only bookkeeping', () => {
    const initial = createInitialProgressJournal(
      normalizeRecoveryManifest(manifest()),
      canonicalManifestSha256()
    );
    const copying = validateRecoveryJournalTransition(initial, {
      ...initial,
      revision: 1,
      phase: 'copying',
      copy_states: { 'copy-a': 'published', 'copy-b': 'published' },
    });
    const copied = validateRecoveryJournalTransition(copying, {
      ...copying,
      revision: 2,
      phase: 'copied',
    });

    expect(
      validateRecoveryJournalTransition(copied, {
        ...copied,
        revision: 3,
        disposition_states: {
          ...copied.disposition_states,
          'disposition-b': 'disposition_applied',
        },
      }).disposition_states['disposition-b']
    ).toBe('disposition_applied');

    expect(() =>
      validateRecoveryJournalTransition(copied, {
        ...copied,
        revision: 3,
        disposition_states: {
          ...copied.disposition_states,
          'disposition-b': 'career_playbook_source_applied',
        },
      } as never)
    ).toThrow();
  });

  it('accepts legacy non-sha256 catalog hashes as byte-exact disposition predicates', () => {
    // The two audited invalid-path rows carry a 23-character legacy catalog hash. The
    // disposition predicate is byte-exact equality against file_catalog, not a physical
    // file digest, so the schema accepts any bounded printable token — but never whitespace.
    const legacy = manifest();
    legacy.dispositions = legacy.dispositions.map(entry =>
      entry.entry_id === 'disposition-a'
        ? { ...entry, expected_hash: 'legacy:txt-0123456789ab' }
        : entry
    );
    expect(
      normalizeRecoveryManifest(legacy).dispositions.find(
        entry => entry.entry_id === 'disposition-a'
      )?.expected_hash
    ).toBe('legacy:txt-0123456789ab');

    const withWhitespace = manifest();
    withWhitespace.dispositions = withWhitespace.dispositions.map(entry =>
      entry.entry_id === 'disposition-a' ? { ...entry, expected_hash: 'legacy hash' } : entry
    );
    expect(() => normalizeRecoveryManifest(withWhitespace)).toThrow();
  });

  it('rejects disposition entries that still carry live career_playbook_sources predicates', () => {
    const withLegacyPlaybookFields = manifest();
    withLegacyPlaybookFields.dispositions = withLegacyPlaybookFields.dispositions.map(entry =>
      entry.kind === 'career_playbook_retained_derived'
        ? ({
            ...entry,
            career_playbook_source_id: '96b5a9fb-fb09-4bd7-b3de-fd70319d5dc8',
            expected_career_playbook: {
              playbook_id: 'e49be5a4-519f-4ef7-9315-f9596ff911cf',
              user_id: 'f303c89a-1567-4797-bd28-66bcd4b76425',
              status: 'ready',
              error_message: null,
            },
          } as never)
        : entry
    );

    expect(() => normalizeRecoveryManifest(withLegacyPlaybookFields)).toThrow();
  });

  it('accepts the complete write-ahead phase and paired-disposition sequence', () => {
    let journal = createInitialProgressJournal(
      normalizeRecoveryManifest(manifest()),
      canonicalManifestSha256()
    );
    journal = validateRecoveryJournalTransition(journal, {
      ...journal,
      revision: 1,
      phase: 'copying',
      copy_states: { 'copy-a': 'published', 'copy-b': 'published' },
    });
    journal = validateRecoveryJournalTransition(journal, {
      ...journal,
      revision: 2,
      phase: 'copied',
    });
    journal = validateRecoveryJournalTransition(journal, {
      ...journal,
      revision: 3,
      disposition_states: {
        'disposition-a': 'disposition_applied',
        'disposition-b': 'disposition_planned',
      },
    });
    journal = validateRecoveryJournalTransition(journal, {
      ...journal,
      revision: 4,
      disposition_states: {
        ...journal.disposition_states,
        'disposition-b': 'disposition_applied',
      },
    });
    journal = validateRecoveryJournalTransition(journal, {
      ...journal,
      revision: 5,
      phase: 'dispositions_applied',
    });
    journal = validateRecoveryJournalTransition(journal, {
      ...journal,
      revision: 6,
      disposition_states: {
        'disposition-a': 'disposition_verified',
        'disposition-b': 'disposition_verified',
      },
    });
    journal = validateRecoveryJournalTransition(journal, {
      ...journal,
      revision: 7,
      phase: 'verified',
    });
    journal = validateRecoveryJournalTransition(journal, {
      ...journal,
      revision: 8,
      phase: 'reindex_started',
    });
    journal = validateRecoveryJournalTransition(journal, {
      ...journal,
      revision: 9,
      phase: 'complete',
    });

    expect(journal).toMatchObject({ revision: 9, phase: 'complete' });
  });

  it('atomically replaces only the expected journal revision', async () => {
    const directory = await mkdtemp('/tmp/mc2-source-recovery-journal-');
    const target = join(directory, 'progress.json');
    const current = createInitialProgressJournal(
      normalizeRecoveryManifest(manifest()),
      canonicalManifestSha256()
    );

    try {
      await replaceProgressJournal(target, -1, current, normalizeRecoveryManifest(manifest()));
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

  it('rejects a progress journal replaced by a symbolic link before CAS load', async () => {
    const directory = await mkdtemp('/tmp/mc2-source-recovery-journal-link-');
    const target = join(directory, 'progress.json');
    const external = join(directory, 'external.json');
    const normalized = normalizeRecoveryManifest(manifest());
    const current = createInitialProgressJournal(normalized, canonicalManifestSha256());
    try {
      await writeFile(external, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
      await symlink(external, target);
      await expect(
        replaceProgressJournal(target, 0, { ...current, revision: 1, phase: 'copying' }, normalized)
      ).rejects.toThrow(/symbolic link|non-symlink|regular file/iu);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a non-canonical initial journal even when its manifest hash matches', async () => {
    const directory = await mkdtemp('/tmp/mc2-source-recovery-initial-journal-');
    const target = join(directory, 'progress.json');
    const normalized = normalizeRecoveryManifest(manifest());
    const current = createInitialProgressJournal(normalized, canonicalManifestSha256());

    try {
      await expect(
        replaceProgressJournal(
          target,
          -1,
          {
            ...current,
            copy_states: { ...current.copy_states, 'copy-a': 'rolled_back' },
            disposition_states: {
              ...current.disposition_states,
              'disposition-a': 'disposition_verified',
            },
          },
          normalized
        )
      ).rejects.toThrow(/canonical initial/iu);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a format-valid hash that is not the canonical manifest SHA-256', () => {
    expect(() =>
      createInitialProgressJournal(normalizeRecoveryManifest(manifest()), '9'.repeat(64))
    ).toThrow(/does not match/iu);
  });
});
