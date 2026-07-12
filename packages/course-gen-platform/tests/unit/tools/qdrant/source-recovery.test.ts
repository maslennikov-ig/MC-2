import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  loadReviewedRecoveryState,
  parseSourceRecoveryCliArgs,
  runSourceRecoveryCommand,
  type RecoveryWorkflowDependencies,
} from '../../../../tools/qdrant/source-recovery.js';
import {
  calculateRecoveryManifestSha256,
  createInitialProgressJournal,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest.js';

const RUN_ID = 'ea25d26d-9dc3-4c2c-9e42-95ab8270cb6e';
const ORGANIZATION_ID = 'caacdf41-6267-471b-9331-02a45611a8a7';
const COURSE_ID = '5191a3cc-d417-4451-9bc6-240ac38e469c';

const uuid = (index: number): string =>
  `${index.toString(16).padStart(8, '0')}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;

function manifest(overrides: Partial<SourceRecoveryManifest> = {}): SourceRecoveryManifest {
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
    career_playbook_source_id: uuid(index + 201),
    organization_id: ORGANIZATION_ID,
    course_id: null,
    expected_hash: 'b'.repeat(64),
    expected_storage_path: `uploads/career/missing-${index}.pdf`,
    expected_vector_status: 'indexed' as const,
    expected_file_error_message: null,
    expected_career_playbook: {
      playbook_id: uuid(index + 301),
      user_id: uuid(index + 401),
      status: 'ready' as const,
      error_message: null,
    },
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

function journalFor(value = manifest()): RecoveryProgressJournal {
  return createInitialProgressJournal(value, calculateRecoveryManifestSha256(value));
}

function dependencies(
  overrides: Partial<RecoveryWorkflowDependencies> = {}
): RecoveryWorkflowDependencies {
  const value = manifest();
  const journal = journalFor(value);
  return {
    createPlan: () => Promise.resolve(value),
    preflightCopies: () => Promise.resolve(),
    preflightExecution: () => Promise.resolve(),
    writePlan: () =>
      Promise.resolve({
        manifest: value,
        manifestSha256: calculateRecoveryManifestSha256(value),
        journal,
      }),
    loadReviewedState: () =>
      Promise.resolve({
        manifest: value,
        manifestSha256: calculateRecoveryManifestSha256(value),
        journal,
      }),
    persistJournal: () => Promise.resolve(),
    readSourceCounts: () => Promise.resolve(value.pre_counts),
    inspectCopy: () => Promise.resolve('absent'),
    publishCopy: () => Promise.resolve(),
    rollbackCopy: () => Promise.resolve(),
    verifyDispositions: () => Promise.resolve(),
    applyDisposition: () => Promise.resolve('disposition_applied'),
    ...overrides,
  };
}

describe('source recovery workflow', () => {
  it('parses every approved mode and rejects unknown options', () => {
    for (const mode of [
      'plan',
      'verify',
      'execute',
      'rollback',
      'apply-dispositions',
      'verify-dispositions',
    ] as const) {
      expect(parseSourceRecoveryCliArgs([mode, '--confirm-run-id', RUN_ID])).toMatchObject({
        mode,
        confirmRunId: RUN_ID,
      });
    }
    expect(() => parseSourceRecoveryCliArgs(['execute', '--allow-gaps'])).toThrow(
      /unknown option/iu
    );
    expect(
      parseSourceRecoveryCliArgs([
        'plan',
        '--capability-probe-directory',
        '/opt/megacampus/recovery-capability',
      ])
    ).toMatchObject({
      mode: 'plan',
      capabilityProbeDirectory: '/opt/megacampus/recovery-capability',
    });
  });

  it('accepts only the exact audited plan totals and emits aggregate-only data', async () => {
    const written: SourceRecoveryManifest[] = [];
    const result = await runSourceRecoveryCommand(
      { mode: 'plan' },
      dependencies({
        writePlan: value => {
          written.push(value);
          return Promise.resolve({
            manifest: value,
            manifestSha256: calculateRecoveryManifestSha256(value),
            journal: journalFor(value),
          });
        },
      })
    );

    expect(written).toHaveLength(1);
    expect(result).toEqual({
      ok: true,
      mode: 'plan',
      phase: 'planned',
      copies: 42,
      affectedRows: 125,
      eligibleDispositions: 6,
      careerPlaybookDispositions: 18,
      counts: manifest().pre_counts,
    });
    const output = JSON.stringify(result);
    expect(output).not.toContain(RUN_ID);
    expect(output).not.toContain('target-');
    expect(output).not.toContain('a'.repeat(64));

    await expect(
      runSourceRecoveryCommand(
        { mode: 'plan' },
        dependencies({
          createPlan: () =>
            Promise.resolve(manifest({ pre_counts: { ...manifest().pre_counts, total: 262 } })),
        })
      )
    ).rejects.toThrow(/exact audited recovery totals/iu);
  });

  it.each([
    ['late source drift', 'source identity mismatch'],
    ['pre-existing exact target', 'target already exists'],
  ])('writes no immutable plan when all-copy preflight finds %s', async (_label, failure) => {
    const order: string[] = [];
    const deps = dependencies({
      createPlan: () => {
        order.push('create');
        return Promise.resolve(manifest());
      },
      readSourceCounts: () => {
        order.push('counts');
        return Promise.resolve(manifest().pre_counts);
      },
      preflightCopies: () => {
        order.push('preflight');
        return Promise.reject(new Error(failure));
      },
      writePlan: () => {
        order.push('write');
        return Promise.reject(new Error('immutable plan must not be written'));
      },
    } as Partial<RecoveryWorkflowDependencies>);

    await expect(runSourceRecoveryCommand({ mode: 'plan' }, deps)).rejects.toThrow(failure);
    expect(order).toEqual(['create', 'counts', 'preflight']);
  });

  it('loads strict reviewed JSON, recomputes canonical SHA, and rejects journal drift', async () => {
    const directory = await mkdtemp('/tmp/mc2-source-recovery-state-');
    const manifestPath = join(directory, 'manifest.json');
    const journalPath = join(directory, 'journal.json');
    const value = manifest();
    const journal = journalFor(value);
    try {
      await chmod(directory, 0o700);
      await writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
      await expect(loadReviewedRecoveryState({ manifestPath, journalPath })).resolves.toMatchObject(
        {
          manifestSha256: calculateRecoveryManifestSha256(value),
          journal: { run_id: RUN_ID, phase: 'planned' },
        }
      );

      await writeFile(manifestPath, `${JSON.stringify(value, null, 2)} \n`, { mode: 0o600 });
      await expect(loadReviewedRecoveryState({ manifestPath, journalPath })).rejects.toThrow(
        /canonical manifest bytes/iu
      );
      await writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });

      await writeFile(
        journalPath,
        `${JSON.stringify({ ...journal, manifest_sha256: 'f'.repeat(64) }, null, 2)}\n`,
        { mode: 0o600 }
      );
      await expect(loadReviewedRecoveryState({ manifestPath, journalPath })).rejects.toThrow(
        /binding|canonical/iu
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('binds every loaded journal identity and disposition kind to the reviewed manifest', async () => {
    const directory = await mkdtemp('/tmp/mc2-source-recovery-binding-');
    const manifestPath = join(directory, 'manifest.json');
    const journalPath = join(directory, 'journal.json');
    const value = manifest();
    const canonical = journalFor(value);
    const eligibleId = value.dispositions.find(
      entry => entry.kind === 'eligible_unrecoverable'
    )!.entry_id;
    const playbookId = value.dispositions.find(
      entry => entry.kind === 'career_playbook_retained_derived'
    )!.entry_id;
    const cases: Array<{ label: string; journal: RecoveryProgressJournal }> = [
      {
        label: 'extra copy identity',
        journal: {
          ...canonical,
          copy_states: { ...canonical.copy_states, 'copy-unreviewed': 'planned' },
        },
      },
      {
        label: 'missing disposition identity',
        journal: {
          ...canonical,
          disposition_states: Object.fromEntries(
            Object.entries(canonical.disposition_states).filter(
              ([entryId]) => entryId !== eligibleId
            )
          ),
        },
      },
      {
        label: 'swapped copy identity',
        journal: {
          ...canonical,
          copy_states: {
            ...Object.fromEntries(
              Object.entries(canonical.copy_states).filter(([entryId]) => entryId !== 'copy-00')
            ),
            'copy-unreviewed': 'planned',
          },
        },
      },
      {
        label: 'swapped disposition kinds',
        journal: {
          ...canonical,
          disposition_kinds: {
            ...canonical.disposition_kinds,
            [eligibleId]: canonical.disposition_kinds[playbookId],
            [playbookId]: canonical.disposition_kinds[eligibleId],
          },
        },
      },
      {
        label: 'altered disposition kind',
        journal: {
          ...canonical,
          disposition_kinds: {
            ...canonical.disposition_kinds,
            [eligibleId]: 'career_playbook_retained_derived',
          },
        },
      },
    ];

    try {
      await chmod(directory, 0o700);
      await writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      for (const testCase of cases) {
        await writeFile(journalPath, `${JSON.stringify(testCase.journal, null, 2)}\n`, {
          mode: 0o600,
        });
        await expect(
          loadReviewedRecoveryState({ manifestPath, journalPath }),
          testCase.label
        ).rejects.toThrow(/manifest|journal|identity|keys|kind/iu);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requires protected files and their real state directory to be owner-only', async () => {
    const root = await mkdtemp('/tmp/mc2-source-recovery-protected-');
    const stateDirectory = join(root, 'state');
    const linkedStateDirectory = join(root, 'linked-state');
    const manifestPath = join(stateDirectory, 'manifest.json');
    const journalPath = join(stateDirectory, 'journal.json');
    const manifestLinkPath = join(stateDirectory, 'manifest-link.json');
    const value = manifest();
    const journal = journalFor(value);
    const writeCanonicalState = async (): Promise<void> => {
      await chmod(stateDirectory, 0o700);
      await writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      await chmod(manifestPath, 0o600);
      await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
      await chmod(journalPath, 0o600);
    };

    try {
      await mkdir(stateDirectory, { mode: 0o700 });
      await writeCanonicalState();

      await symlink('manifest.json', manifestLinkPath);
      await expect(
        loadReviewedRecoveryState({ manifestPath: manifestLinkPath, journalPath })
      ).rejects.toThrow(/symbolic link|symlink|owner-only/iu);

      await chmod(manifestPath, 0o640);
      await expect(loadReviewedRecoveryState({ manifestPath, journalPath })).rejects.toThrow(
        /0600|owner-only/iu
      );
      await writeCanonicalState();

      await expect(
        loadReviewedRecoveryState({ manifestPath: stateDirectory, journalPath })
      ).rejects.toThrow(/regular file|owner-only/iu);

      await chmod(stateDirectory, 0o755);
      await expect(loadReviewedRecoveryState({ manifestPath, journalPath })).rejects.toThrow(
        /0700|state directory|owner-only/iu
      );
      await writeCanonicalState();

      await symlink(stateDirectory, linkedStateDirectory, 'dir');
      await expect(
        loadReviewedRecoveryState({
          manifestPath: join(linkedStateDirectory, 'manifest.json'),
          journalPath: join(linkedStateDirectory, 'journal.json'),
        })
      ).rejects.toThrow(/real state directory|symbolic link|owner-only/iu);

      if (process.getuid) {
        const getuid = vi.spyOn(process, 'getuid').mockReturnValue(process.getuid() + 1);
        try {
          await expect(loadReviewedRecoveryState({ manifestPath, journalPath })).rejects.toThrow(
            /owner|uid/iu
          );
        } finally {
          getuid.mockRestore();
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('requires exact run confirmation, reconciles copies, and checkpoints every advance', async () => {
    const value = manifest();
    const initial = journalFor(value);
    const persisted: RecoveryProgressJournal[] = [];
    let current = initial;
    const deps = dependencies({
      loadReviewedState: () =>
        Promise.resolve({
          manifest: value,
          manifestSha256: calculateRecoveryManifestSha256(value),
          journal: current,
        }),
      persistJournal: (_previous, next) => {
        persisted.push(next);
        current = next;
        return Promise.resolve();
      },
      inspectCopy: (_entry, state) => Promise.resolve(state === 'planned' ? 'exact' : 'exact'),
      readSourceCounts: () => Promise.resolve(value.expected_post_counts),
    });

    await expect(runSourceRecoveryCommand({ mode: 'execute' }, deps)).rejects.toThrow(
      /confirm-run-id/iu
    );
    await expect(
      runSourceRecoveryCommand({ mode: 'execute', confirmRunId: uuid(999) }, deps)
    ).rejects.toThrow(/confirmation.*match/iu);

    const result = await runSourceRecoveryCommand({ mode: 'execute', confirmRunId: RUN_ID }, deps);
    expect(result).toMatchObject({ mode: 'execute', phase: 'copied', copies: 42 });
    expect(persisted[0].phase).toBe('copying');
    expect(
      persisted.filter(item => Object.values(item.copy_states).includes('published'))
    ).toHaveLength(43);
    expect(persisted.at(-1)?.phase).toBe('copied');
  });

  it.each([
    ['fresh execute', 'planned' as const, false],
    ['copying resume', 'copying' as const, true],
  ])(
    'runs an all-remaining execution preflight before any new publication for %s',
    async (_label, phase, firstPublished) => {
      const value = manifest();
      const journal = journalFor(value);
      journal.phase = phase;
      if (firstPublished) journal.copy_states[value.copies[0].entry_id] = 'published';
      let persisted = 0;
      let published = 0;
      const deps = dependencies({
        loadReviewedState: () =>
          Promise.resolve({
            manifest: value,
            manifestSha256: calculateRecoveryManifestSha256(value),
            journal,
          }),
        preflightExecution: () => Promise.reject(new Error('remaining source identity mismatch')),
        persistJournal: () => {
          persisted += 1;
          return Promise.resolve();
        },
        publishCopy: () => {
          published += 1;
          return Promise.resolve();
        },
      } as Partial<RecoveryWorkflowDependencies>);

      await expect(
        runSourceRecoveryCommand({ mode: 'execute', confirmRunId: RUN_ID }, deps)
      ).rejects.toThrow(/remaining source identity mismatch/iu);
      expect(persisted).toBe(0);
      expect(published).toBe(0);
    }
  );

  it('persists disposition substates and verifies all 24 exact outcomes before verified', async () => {
    const value = manifest();
    const copied = journalFor(value);
    copied.phase = 'copied';
    copied.copy_states = Object.fromEntries(
      value.copies.map(entry => [entry.entry_id, 'published'])
    );
    let current = copied;
    const persisted: RecoveryProgressJournal[] = [];
    const deps = dependencies({
      loadReviewedState: () =>
        Promise.resolve({
          manifest: value,
          manifestSha256: calculateRecoveryManifestSha256(value),
          journal: current,
        }),
      persistJournal: (_previous, next) => {
        persisted.push(next);
        current = next;
        return Promise.resolve();
      },
      applyDisposition: (entry, state, checkpoint) => {
        if (entry.kind === 'career_playbook_retained_derived' && state === 'disposition_planned') {
          return checkpoint('career_playbook_source_applied').then(() =>
            checkpoint('disposition_applied')
          );
        }
        return checkpoint('disposition_applied');
      },
      readSourceCounts: () => Promise.resolve(value.expected_post_counts),
    });

    await runSourceRecoveryCommand({ mode: 'apply-dispositions', confirmRunId: RUN_ID }, deps);
    expect(current.phase).toBe('dispositions_applied');
    expect(
      persisted.some(item =>
        Object.values(item.disposition_states).includes('career_playbook_source_applied')
      )
    ).toBe(true);

    const verified = await runSourceRecoveryCommand(
      { mode: 'verify-dispositions', confirmRunId: RUN_ID },
      deps
    );
    expect(verified).toMatchObject({ phase: 'verified', verifiedDispositions: 24 });
    expect(current.phase).toBe('verified');
  });

  it('rejects rollback at or after reindex_started before touching a target', async () => {
    const value = manifest();
    const journal = journalFor(value);
    journal.phase = 'reindex_started';
    journal.copy_states = Object.fromEntries(
      value.copies.map(entry => [entry.entry_id, 'published'])
    );
    journal.disposition_states = Object.fromEntries(
      value.dispositions.map(entry => [entry.entry_id, 'disposition_verified'])
    );
    let rollbackCalls = 0;
    await expect(
      runSourceRecoveryCommand(
        { mode: 'rollback', confirmRunId: RUN_ID },
        dependencies({
          loadReviewedState: () =>
            Promise.resolve({
              manifest: value,
              manifestSha256: calculateRecoveryManifestSha256(value),
              journal,
            }),
          rollbackCopy: () => {
            rollbackCalls += 1;
            return Promise.resolve();
          },
        })
      )
    ).rejects.toThrow(/rollback.*forbidden/iu);
    expect(rollbackCalls).toBe(0);
  });
});
