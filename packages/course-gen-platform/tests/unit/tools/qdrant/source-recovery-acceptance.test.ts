import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DocumentEvidenceCard } from '@megacampus/shared-types';

import {
  inspectRecoveryTarget,
  preflightRecoveryCopies,
  preflightRecoveryExecution,
  publishNoReplace,
  reconcilePublishedTarget,
  reconcileRollbackTarget,
  rollbackPublished,
} from '../../../../tools/qdrant/source-recovery-filesystem.js';
import {
  calculateRecoveryManifestSha256,
  createInitialProgressJournal,
  replaceProgressJournal,
  writeImmutableManifest,
  type RecoveryCounts,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest.js';
import {
  loadReviewedRecoveryState,
  persistRecoveryJournalTransition,
  runSourceRecoveryCommand,
  type RecoveryWorkflowDependencies,
} from '../../../../tools/qdrant/source-recovery.js';
import {
  buildReindexPlan,
  calculateAcceptedFailedCoverageFingerprint,
  getReindexPlanExitCode,
  type AcceptedFailedCoverageBinding,
  type ReindexSourceRow,
} from '../../../../tools/qdrant/reindex-plan.js';
import {
  applyDispositionEntry,
  createRecoveryDispositionDatabase,
  type RecoveryCatalogRow,
  type RecoveryDatabaseGateway,
  type RecoveryDispositionDatabase,
  type RecoveryPlaybookRow,
} from '../../../../tools/qdrant/source-recovery-database.js';
import {
  runDocumentEvidencePreflight,
  type DocumentEvidencePreflightRepository,
} from '../../../../src/stages/stage4-analysis/evidence/preflight.js';

const RUN_ID = '90000000-0000-4000-8000-000000000006';
const ORG_A = '30000000-0000-4000-8000-000000000001';
const ORG_B = '30000000-0000-4000-8000-000000000002';
const COURSE_A = '20000000-0000-4000-8000-000000000001';
const COURSE_B = '20000000-0000-4000-8000-000000000002';
const USER_ID = '40000000-0000-4000-8000-000000000001';
const PRE_COUNTS: RecoveryCounts = {
  total: 261,
  eligible: 240,
  recoverable: 109,
  missing: 129,
  invalid: 2,
  unsupported: 21,
};
const POST_COUNTS: RecoveryCounts = {
  total: 261,
  eligible: 240,
  recoverable: 234,
  missing: 4,
  invalid: 2,
  unsupported: 21,
};

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const uuid = (value: number): string =>
  `10000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;

interface AcceptanceFixture {
  root: string;
  developmentRoot: string;
  productionRoot: string;
  stateRoot: string;
  capabilityRoot: string;
  manifestPath: string;
  journalPath: string;
  manifest: SourceRecoveryManifest;
  rows: ReindexSourceRow[];
  invalidIds: Set<string>;
  catalogRows: Map<string, RecoveryCatalogRow>;
  playbookRows: Map<string, RecoveryPlaybookRow>;
  database: RecoveryDispositionDatabase;
  publishCalls: number;
  crashAfterPublish?: number;
}

describe('source recovery acceptance', () => {
  it('restores exact source truth and resumes a publish-before-checkpoint interruption', async () => {
    const fixture = await createAcceptanceFixture('forward');
    try {
      const dependencies = createWorkflowDependencies(fixture);
      await expect(runSourceRecoveryCommand({ mode: 'plan' }, dependencies)).resolves.toMatchObject(
        { phase: 'planned', copies: 42, affectedRows: 125, counts: PRE_COUNTS }
      );

      fixture.crashAfterPublish = 17;
      await expect(
        runSourceRecoveryCommand({ mode: 'execute', confirmRunId: RUN_ID }, dependencies)
      ).rejects.toThrow('simulated stop after physical publish');

      const interrupted = await loadReviewedRecoveryState({
        manifestPath: fixture.manifestPath,
        journalPath: fixture.journalPath,
      });
      expect(interrupted.journal.phase).toBe('copying');
      expect(
        Object.values(interrupted.journal.copy_states).filter(state => state === 'published')
      ).toHaveLength(16);
      expect(await countRecoveryTargets(fixture.productionRoot)).toBe(17);
      const reconciledPath = resolve(
        fixture.productionRoot,
        fixture.manifest.copies[16].target_relative_path
      );
      const interruptedInode = (await lstat(reconciledPath)).ino;

      fixture.crashAfterPublish = undefined;
      await expect(
        runSourceRecoveryCommand({ mode: 'execute', confirmRunId: RUN_ID }, dependencies)
      ).resolves.toMatchObject({ phase: 'copied', copies: 42, affectedRows: 125 });
      await expect(
        runSourceRecoveryCommand({ mode: 'verify' }, dependencies)
      ).resolves.toMatchObject({ phase: 'copied', counts: POST_COUNTS });

      expect(fixture.publishCalls).toBe(42);
      expect((await lstat(reconciledPath)).ino).toBe(interruptedInode);
      expect(await countRecoveryTargets(fixture.productionRoot)).toBe(42);
      expect(await findBoundRecoveryTemporaries(fixture.root)).toEqual([]);
      expect(readSourceCounts(fixture)).toEqual(POST_COUNTS);

      await proveCrossTenantCasRejectsWithoutPartialState(fixture);
      await expect(
        runSourceRecoveryCommand({ mode: 'apply-dispositions', confirmRunId: RUN_ID }, dependencies)
      ).resolves.toMatchObject({ phase: 'dispositions_applied' });
      await expect(
        runSourceRecoveryCommand(
          { mode: 'verify-dispositions', confirmRunId: RUN_ID },
          dependencies
        )
      ).resolves.toMatchObject({ phase: 'verified', verifiedDispositions: 24 });

      const verified = await loadReviewedRecoveryState({
        manifestPath: fixture.manifestPath,
        journalPath: fixture.journalPath,
      });
      expect(Object.values(verified.journal.disposition_states)).toEqual(
        Array.from({ length: 24 }, () => 'disposition_verified')
      );
      const acceptedFailedCoverage = await createAcceptedFailedCoverage(fixture);
      const boundRows = rowsWithDispositionTruth(fixture);
      const reindexPlan = buildReindexPlan(boundRows, row => sourceProbe(fixture, row), {
        manifest: fixture.manifest,
        manifestSha256: verified.manifestSha256,
        journal: verified.journal,
        acceptedFailedCoverage,
      });
      expect(reindexPlan).toMatchObject({
        eligible: 240,
        recoverable: 234,
        auditedFailed: 6,
        unresolvedMissing: 0,
        unresolvedInvalid: 0,
        missingSource: 4,
        invalidSourcePath: 2,
        unsupported: 21,
        expectedDocuments: 234,
        acceptedCoverageStatus: 'accepted',
        acceptedCoverageFingerprint: acceptedFailedCoverage.fingerprint,
      });
      expect(reindexPlan.recoverable + reindexPlan.auditedFailed).toBe(240);
      expect(reindexPlan.gaps).toHaveLength(21);
      expect(reindexPlan.gaps.every(gap => gap.reason === 'missing_course')).toBe(true);
      expect(reindexPlan.verificationFingerprint).toMatch(/^[a-f0-9]{64}$/u);
      expect(getReindexPlanExitCode(reindexPlan)).toBe(0);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
    expect(existsSync(fixture.root)).toBe(false);
  });

  it('guards rollback from replacement inodes and resumes from the exact journal state', async () => {
    const fixture = await createAcceptanceFixture('rollback');
    try {
      const dependencies = createWorkflowDependencies(fixture);
      await runSourceRecoveryCommand({ mode: 'plan' }, dependencies);
      await runSourceRecoveryCommand({ mode: 'execute', confirmRunId: RUN_ID }, dependencies);

      const lastEntry = fixture.manifest.copies.at(-1)!;
      const targetPath = resolve(fixture.productionRoot, lastEntry.target_relative_path);
      const originalPath = `${targetPath}.manifest-created`;
      await rename(targetPath, originalPath);
      await writeFile(targetPath, 'operator replacement inode with different bytes');
      const replacementInode = (await lstat(targetPath)).ino;

      await expect(
        runSourceRecoveryCommand({ mode: 'rollback', confirmRunId: RUN_ID }, dependencies)
      ).rejects.toThrow(/rollback target mismatch/iu);
      expect((await lstat(targetPath)).ino).toBe(replacementInode);
      expect(await countRecoveryTargets(fixture.productionRoot)).toBe(42);
      const interrupted = await loadReviewedRecoveryState({
        manifestPath: fixture.manifestPath,
        journalPath: fixture.journalPath,
      });
      expect(interrupted.journal.copy_states[lastEntry.entry_id]).toBe('rollback_planned');
      expect(
        Object.values(interrupted.journal.copy_states).filter(state => state === 'published')
      ).toHaveLength(41);

      await rm(targetPath);
      await rename(originalPath, targetPath);
      await expect(
        runSourceRecoveryCommand({ mode: 'rollback', confirmRunId: RUN_ID }, dependencies)
      ).resolves.toMatchObject({ phase: 'copied', rolledBack: 42 });
      const rolledBack = await loadReviewedRecoveryState({
        manifestPath: fixture.manifestPath,
        journalPath: fixture.journalPath,
      });
      expect(Object.values(rolledBack.journal.copy_states)).toEqual(
        Array.from({ length: 42 }, () => 'rolled_back')
      );
      expect(await countRecoveryTargets(fixture.productionRoot)).toBe(0);
      await expect(
        readFile(join(fixture.productionRoot, 'existing', 'shared.pdf'), 'utf8')
      ).resolves.toBe('existing source bytes');
      expect(await findBoundRecoveryTemporaries(fixture.root)).toEqual([]);
      expect(readSourceCounts(fixture)).toEqual(PRE_COUNTS);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
    expect(existsSync(fixture.root)).toBe(false);
  });
});

async function createAcceptanceFixture(label: string): Promise<AcceptanceFixture> {
  const root = await mkdtemp(`/tmp/mc2-source-recovery-acceptance-${label}-`);
  const developmentRoot = join(root, 'development');
  const productionRoot = join(root, 'production');
  const stateRoot = join(root, 'state');
  const capabilityRoot = join(root, 'capability');
  await Promise.all([
    mkdir(join(developmentRoot, 'recovery'), { recursive: true }),
    mkdir(join(productionRoot, 'recovery'), { recursive: true }),
    mkdir(join(productionRoot, 'existing'), { recursive: true }),
    mkdir(stateRoot, { recursive: true, mode: 0o700 }),
    mkdir(capabilityRoot, { recursive: true, mode: 0o700 }),
  ]);
  await Promise.all([chmod(stateRoot, 0o700), chmod(capabilityRoot, 0o700)]);
  await writeFile(join(productionRoot, 'existing', 'shared.pdf'), 'existing source bytes');

  const copies = await Promise.all(
    Array.from({ length: 42 }, async (_, index) => {
      const bytes = `reviewed development source ${index}\n`;
      const sourceRelativePath = `recovery/source-${index.toString().padStart(2, '0')}.pdf`;
      await writeFile(resolve(developmentRoot, sourceRelativePath), bytes);
      return {
        entry_id: `copy-${index.toString().padStart(2, '0')}`,
        source_relative_path: sourceRelativePath,
        target_relative_path: `recovery/target-${index.toString().padStart(2, '0')}.pdf`,
        expected_size: Buffer.byteLength(bytes),
        expected_sha256: sha256(bytes),
        affected_file_catalog_rows: index === 0 ? 84 : 1,
      };
    })
  );

  const eligibleDispositions = Array.from({ length: 6 }, (_, index) => {
    const scope =
      index < 4
        ? { organizationId: ORG_A, courseId: COURSE_A }
        : { organizationId: ORG_B, courseId: COURSE_B };
    return {
      entry_id: `disposition-eligible-${index.toString().padStart(2, '0')}`,
      kind: 'eligible_unrecoverable' as const,
      file_catalog_id: uuid(235 + index),
      organization_id: scope.organizationId,
      course_id: scope.courseId,
      expected_hash: sha256(`eligible-${index}`),
      expected_storage_path: `gaps/eligible-${index}.pdf`,
      expected_vector_status: 'indexed' as const,
      expected_file_error_message: null,
      reason: 'source_file_unrecoverable' as const,
    };
  });
  const playbookDispositions = Array.from({ length: 18 }, (_, index) => ({
    entry_id: `disposition-playbook-${index.toString().padStart(2, '0')}`,
    kind: 'career_playbook_retained_derived' as const,
    file_catalog_id: uuid(241 + index),
    career_playbook_source_id: uuid(501 + index),
    organization_id: ORG_A,
    course_id: null,
    expected_hash: sha256(`playbook-${index}`),
    expected_storage_path: `playbook/retained-${index}.pdf`,
    expected_vector_status: 'indexed' as const,
    expected_file_error_message: null,
    expected_career_playbook: {
      playbook_id: uuid(601 + index),
      user_id: USER_ID,
      status: 'ready' as const,
      error_message: null,
    },
    reason: 'retained-derived-only' as const,
  }));
  const manifest: SourceRecoveryManifest = {
    schema_version: 'megacampus.qdrant.source-recovery/v1',
    run_id: RUN_ID,
    release_sha: 'a'.repeat(40),
    generated_at: '2026-07-13T00:00:00.000Z',
    operator_image_digest: `sha256:${'b'.repeat(64)}`,
    source_audit_version: 'megacampus.q12-source-recovery-acceptance/v1',
    development_root: developmentRoot,
    production_root: productionRoot,
    pre_counts: PRE_COUNTS,
    expected_post_counts: POST_COUNTS,
    copies,
    dispositions: [...eligibleDispositions, ...playbookDispositions],
  };

  const recoveredRows: ReindexSourceRow[] = copies.flatMap((copy, copyIndex) =>
    Array.from({ length: copyIndex === 0 ? 84 : 1 }, (_, rowIndex) =>
      sourceRow(110 + (copyIndex === 0 ? rowIndex : 83 + copyIndex), {
        storagePath: copy.target_relative_path,
      })
    )
  );
  const eligibleRows = eligibleDispositions.map((entry, index) =>
    sourceRow(235 + index, {
      organizationId: entry.organization_id,
      courseId: entry.course_id,
      courseOrganizationId: entry.organization_id,
      storagePath: entry.expected_storage_path,
      hash: entry.expected_hash,
    })
  );
  const unsupportedRows = Array.from({ length: 21 }, (_, index) =>
    sourceRow(241 + index, {
      courseId: null,
      courseOrganizationId: null,
      storagePath:
        index < 18
          ? playbookDispositions[index].expected_storage_path
          : `unsupported/other-${index}.pdf`,
      hash: index < 18 ? playbookDispositions[index].expected_hash : sha256(`unsupported-${index}`),
    })
  );
  const rows = [
    ...Array.from({ length: 109 }, (_, index) =>
      sourceRow(index + 1, { storagePath: 'existing/shared.pdf' })
    ),
    ...recoveredRows,
    ...eligibleRows,
    ...unsupportedRows,
  ];
  if (rows.length !== 261 || new Set(rows.map(row => row.id)).size !== 261) {
    throw new Error('acceptance fixture row identity is not exact');
  }
  const catalogRows = new Map<string, RecoveryCatalogRow>(
    rows.map(row => [
      row.id,
      {
        id: row.id,
        organization_id: row.organizationId,
        course_id: row.courseId,
        storage_path: row.storagePath,
        hash: row.hash,
        vector_status: row.vectorStatus as RecoveryCatalogRow['vector_status'],
        error_message: row.errorMessage,
      },
    ])
  );
  const playbookRows = new Map<string, RecoveryPlaybookRow>(
    playbookDispositions.map(entry => [
      entry.career_playbook_source_id,
      {
        id: entry.career_playbook_source_id,
        playbook_id: entry.expected_career_playbook.playbook_id,
        organization_id: entry.organization_id,
        user_id: entry.expected_career_playbook.user_id,
        file_catalog_id: entry.file_catalog_id,
        status: entry.expected_career_playbook.status,
        error_message: entry.expected_career_playbook.error_message,
      },
    ])
  );

  return {
    root,
    developmentRoot,
    productionRoot,
    stateRoot,
    capabilityRoot,
    manifestPath: join(stateRoot, 'manifest.json'),
    journalPath: join(stateRoot, 'journal.json'),
    manifest,
    rows,
    invalidIds: new Set([eligibleRows[4].id, eligibleRows[5].id]),
    catalogRows,
    playbookRows,
    database: createMemoryDispositionDatabase(catalogRows, playbookRows),
    publishCalls: 0,
  };
}

function sourceRow(value: number, overrides: Partial<ReindexSourceRow> = {}): ReindexSourceRow {
  return {
    id: uuid(value),
    organizationId: ORG_A,
    courseId: COURSE_A,
    courseOrganizationId: ORG_A,
    userId: USER_ID,
    storagePath: `unused/${value}.pdf`,
    mimeType: 'application/pdf',
    priority: 'CORE',
    hash: sha256(`row-${value}`),
    vectorStatus: 'indexed',
    errorMessage: null,
    chunkCount: 1,
    locale: 'en',
    alreadyEnqueued: false,
    ...overrides,
  };
}

function sourceProbe(
  fixture: AcceptanceFixture,
  row: ReindexSourceRow
): boolean | 'invalid_source_path' {
  if (fixture.invalidIds.has(row.id)) return 'invalid_source_path';
  return existsSync(resolve(fixture.productionRoot, row.storagePath));
}

function readSourceCounts(fixture: AcceptanceFixture): RecoveryCounts {
  const plan = buildReindexPlan(fixture.rows, row => sourceProbe(fixture, row));
  return {
    total: fixture.rows.length,
    eligible: plan.eligible,
    recoverable: plan.recoverable + plan.alreadyEnqueued,
    missing: plan.missingSource,
    invalid: plan.invalidSourcePath,
    unsupported: plan.unsupported,
  };
}

function publishInput(fixture: AcceptanceFixture, entry: SourceRecoveryManifest['copies'][number]) {
  return {
    runId: fixture.manifest.run_id,
    developmentRoot: fixture.developmentRoot,
    productionRoot: fixture.productionRoot,
    rootBinding: fixture.manifest,
    entry,
  };
}

function createWorkflowDependencies(fixture: AcceptanceFixture): RecoveryWorkflowDependencies {
  return {
    createPlan: async () => fixture.manifest,
    readSourceCounts: async () => readSourceCounts(fixture),
    preflightCopies: async manifest =>
      preflightRecoveryCopies({
        runId: manifest.run_id,
        developmentRoot: fixture.developmentRoot,
        productionRoot: fixture.productionRoot,
        rootBinding: manifest,
        entries: manifest.copies,
        capabilityDirectory: fixture.capabilityRoot,
      }),
    writePlan: async manifest => {
      const manifestSha256 = await writeImmutableManifest(fixture.manifestPath, manifest);
      const journal = createInitialProgressJournal(manifest, manifestSha256);
      await replaceProgressJournal(fixture.journalPath, -1, journal, manifest);
      return loadReviewedRecoveryState({
        manifestPath: fixture.manifestPath,
        journalPath: fixture.journalPath,
      });
    },
    loadReviewedState: async () =>
      loadReviewedRecoveryState({
        manifestPath: fixture.manifestPath,
        journalPath: fixture.journalPath,
      }),
    persistJournal: async (current, next, manifest) =>
      persistRecoveryJournalTransition({
        journalPath: fixture.journalPath,
        manifest,
        current,
        next,
      }),
    preflightExecution: async (manifest, journal) =>
      preflightRecoveryExecution({
        runId: manifest.run_id,
        developmentRoot: fixture.developmentRoot,
        productionRoot: fixture.productionRoot,
        rootBinding: manifest,
        entries: manifest.copies,
        copyStates: journal.copy_states,
        phase: journal.phase === 'planned' ? 'planned' : 'copying',
      }),
    inspectCopy: async (entry, state) => {
      if (state === 'rollback_planned' || state === 'rolled_back') {
        return inspectRecoveryTarget(publishInput(fixture, entry));
      }
      const reviewed = await loadReviewedRecoveryState({
        manifestPath: fixture.manifestPath,
        journalPath: fixture.journalPath,
      });
      const result = await reconcilePublishedTarget(publishInput(fixture, entry), state, {
        executionStarted: reviewed.journal.phase === 'copying',
      });
      return result === 'published' ? 'exact' : 'absent';
    },
    publishCopy: async entry => {
      fixture.publishCalls += 1;
      await publishNoReplace(publishInput(fixture, entry));
      if (fixture.publishCalls === fixture.crashAfterPublish) {
        throw new Error('simulated stop after physical publish');
      }
    },
    rollbackCopy: async (entry, journal) => {
      const input = publishInput(fixture, entry);
      const reconciliation = await reconcileRollbackTarget(input, 'rollback_planned');
      if (reconciliation === 'rolled_back') return;
      await rollbackPublished({
        ...input,
        phase: journal.phase,
        journalState: 'rollback_planned',
      });
    },
    applyDisposition: async (entry, state, checkpoint) =>
      applyDispositionEntry({
        database: fixture.database,
        entry,
        runId: fixture.manifest.run_id,
        state,
        persistCheckpoint: async next => {
          await checkpoint(next);
        },
      }),
    verifyDispositions: async manifest => verifyExactDispositionTruth(fixture, manifest),
  };
}

async function countRecoveryTargets(productionRoot: string): Promise<number> {
  const names = await readdir(join(productionRoot, 'recovery'));
  return names.filter(name => name.startsWith('target-') && name.endsWith('.pdf')).length;
}

async function findBoundRecoveryTemporaries(root: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (
        entry.name.startsWith(`.source-recovery.${RUN_ID}.`) &&
        entry.name.endsWith('.tmp')
      ) {
        found.push(path);
      }
    }
  };
  await visit(root);
  return found.sort();
}

function createMemoryDispositionDatabase(
  catalogRows: Map<string, RecoveryCatalogRow>,
  playbookRows: Map<string, RecoveryPlaybookRow>
): RecoveryDispositionDatabase {
  const exact = <T>(left: T, right: T): boolean => JSON.stringify(left) === JSON.stringify(right);
  const gateway: RecoveryDatabaseGateway = {
    selectFileCatalog: async input =>
      [...catalogRows.values()]
        .filter(row => input.ids.includes(row.id))
        .filter(row => input.afterId === undefined || row.id > input.afterId)
        .filter(row => input.applied === undefined || exact(row, input.applied))
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, input.limit)
        .map(row => structuredClone(row)),
    selectCareerPlaybookSources: async input =>
      [...playbookRows.values()]
        .filter(row => input.fileCatalogIds.includes(row.file_catalog_id))
        .filter(row => input.afterId === undefined || row.id > input.afterId)
        .filter(row => input.applied === undefined || exact(row, input.applied))
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, input.limit)
        .map(row => structuredClone(row)),
    updateFileCatalog: async input => {
      const current = catalogRows.get(input.expected.id);
      if (!current || !exact(current, input.expected)) return [];
      const updated = { ...current, ...input.patch };
      catalogRows.set(updated.id, updated);
      return [structuredClone(updated)];
    },
    updateCareerPlaybookSource: async input => {
      const current = playbookRows.get(input.expected.id);
      if (!current || !exact(current, input.expected)) return [];
      const updated = { ...current, ...input.patch };
      playbookRows.set(updated.id, updated);
      return [structuredClone(updated)];
    },
  };
  return createRecoveryDispositionDatabase(gateway, { readBatchSize: 7 });
}

function dispositionSnapshot(
  catalogRows: Map<string, RecoveryCatalogRow>,
  playbookRows: Map<string, RecoveryPlaybookRow>
): string {
  return JSON.stringify({
    catalog: [...catalogRows.values()].sort((left, right) => left.id.localeCompare(right.id)),
    playbooks: [...playbookRows.values()].sort((left, right) => left.id.localeCompare(right.id)),
  });
}

async function proveCrossTenantCasRejectsWithoutPartialState(
  fixture: AcceptanceFixture
): Promise<void> {
  const catalog = new Map(
    [...fixture.catalogRows].map(([id, row]) => [id, structuredClone(row)] as const)
  );
  const playbooks = new Map(
    [...fixture.playbookRows].map(([id, row]) => [id, structuredClone(row)] as const)
  );
  const entry = fixture.manifest.dispositions.find(
    disposition => disposition.kind === 'eligible_unrecoverable'
  )!;
  catalog.get(entry.file_catalog_id)!.organization_id = ORG_B;
  const before = dispositionSnapshot(catalog, playbooks);
  const checkpoints: string[] = [];
  await expect(
    applyDispositionEntry({
      database: createMemoryDispositionDatabase(catalog, playbooks),
      entry,
      runId: fixture.manifest.run_id,
      state: 'disposition_planned',
      persistCheckpoint: async state => {
        checkpoints.push(state);
      },
    })
  ).rejects.toThrow(/CAS mismatch/iu);
  expect(dispositionSnapshot(catalog, playbooks)).toBe(before);
  expect(checkpoints).toEqual([]);
}

async function verifyExactDispositionTruth(
  fixture: AcceptanceFixture,
  manifest: SourceRecoveryManifest
): Promise<void> {
  const fileRows = await fixture.database.listFileCatalogExpectedRows(
    manifest.dispositions.map(entry => entry.file_catalog_id)
  );
  const playbookRows = await fixture.database.listCareerPlaybookExpectedRows(
    manifest.dispositions
      .filter(entry => entry.kind === 'career_playbook_retained_derived')
      .map(entry => entry.file_catalog_id)
  );
  expect(fileRows).toHaveLength(24);
  expect(playbookRows).toHaveLength(18);
  for (const entry of manifest.dispositions) {
    const expectedReason = `${entry.reason}; recovery_run=${manifest.run_id}`;
    expect(fileRows.find(row => row.id === entry.file_catalog_id)).toMatchObject({
      organization_id: entry.organization_id,
      course_id: entry.course_id,
      storage_path: entry.expected_storage_path,
      hash: entry.expected_hash,
      vector_status: 'failed',
      error_message: expectedReason,
    });
    if (entry.kind === 'career_playbook_retained_derived') {
      expect(playbookRows.find(row => row.file_catalog_id === entry.file_catalog_id)).toMatchObject(
        {
          id: entry.career_playbook_source_id,
          organization_id: entry.organization_id,
          playbook_id: entry.expected_career_playbook.playbook_id,
          user_id: entry.expected_career_playbook.user_id,
          status: 'failed',
          error_message: expectedReason,
        }
      );
    }
  }
}

class AcceptanceEvidenceRepository implements DocumentEvidencePreflightRepository {
  readonly runs = new Map<
    string,
    {
      id: string;
      status: 'processing' | 'accepted';
      source_manifest: unknown[];
      batch_count: number;
      model_calls: number;
      input_tokens: number;
      output_tokens: number;
      total_cost_usd: number;
    }
  >();
  readonly cards = new Map<string, DocumentEvidenceCard[]>();
  readonly checkpoints: Array<Record<string, unknown>> = [];

  async getOrCreateRun(
    input: Parameters<DocumentEvidencePreflightRepository['getOrCreateRun']>[0]
  ) {
    const key = `${input.organizationId}:${input.courseId}:${input.inputFingerprint}`;
    const existing = this.runs.get(key);
    if (existing) return { run: existing, reused: true };
    const run = {
      id: uuid(800 + this.runs.size),
      status: 'processing' as const,
      source_manifest: input.sourceManifest,
      batch_count: 0,
      model_calls: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_cost_usd: 0,
    };
    this.runs.set(key, run);
    return { run, reused: false };
  }

  async listItems(runId: string) {
    return structuredClone(this.cards.get(runId) ?? []);
  }

  async listBatchCheckpoints(runId: string) {
    return structuredClone(this.checkpoints.filter(row => row.run_id === runId));
  }

  async commitBatch(input: Parameters<DocumentEvidencePreflightRepository['commitBatch']>[0]) {
    const run = [...this.runs.values()].find(candidate => candidate.id === input.runId);
    if (!run) throw new Error('unknown acceptance evidence run');
    const expected = run.source_manifest
      .map(item => (item as { document_id: string }).document_id)
      .sort();
    const actual = input.cards.map(card => card.document_id).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('acceptance evidence checkpoint escaped the exact source set');
    }
    this.cards.set(input.runId, structuredClone(input.cards));
    Object.assign(run, {
      batch_count: input.batchCount,
      model_calls: input.modelCalls,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      total_cost_usd: input.totalCostUsd,
    });
    const checkpoint = {
      run_id: input.runId,
      batch_key: input.batchKey,
      input_hash: input.inputHash,
    };
    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  async finalizeRun(input: Parameters<DocumentEvidencePreflightRepository['finalizeRun']>[0]) {
    const run = [...this.runs.values()].find(candidate => candidate.id === input.runId);
    if (!run) throw new Error('unknown acceptance evidence run');
    run.status = 'accepted';
    return { id: input.runId, status: input.status };
  }
}

async function createAcceptedFailedCoverage(
  fixture: AcceptanceFixture
): Promise<AcceptedFailedCoverageBinding> {
  const repository = new AcceptanceEvidenceRepository();
  const eligible = fixture.manifest.dispositions.filter(
    entry => entry.kind === 'eligible_unrecoverable'
  );
  const scopes = new Map<string, typeof eligible>();
  for (const entry of eligible) {
    const key = `${entry.organization_id}:${entry.course_id}`;
    scopes.set(key, [...(scopes.get(key) ?? []), entry]);
  }
  const ledgers: AcceptedFailedCoverageBinding['ledgers'][number][] = [];
  for (const entries of scopes.values()) {
    const organizationId = entries[0].organization_id;
    const courseId = entries[0].course_id!;
    const result = await runDocumentEvidencePreflight(
      {
        organizationId,
        courseId,
        topic: 'Reviewed source recovery',
        language: 'en',
        evidenceVersion: 'source-recovery-acceptance-v1',
        modelContext: 32_000,
        promptReserve: 1_000,
        outputReserve: 1_000,
        maxBatchTokens: 4_000,
        maxRetries: 0,
        sources: entries.map((entry, index) => ({
          documentId: entry.file_catalog_id,
          documentName: `Unrecoverable source ${index + 1}.pdf`,
          sourceVersionHash: entry.expected_hash,
          priority: 'CORE' as const,
          authorityScope: 'course_source' as const,
          contentQuality: 0,
          originalTokens: 0,
          summaryTokens: 0,
          sourceFailure: {
            reason: 'source_file_unrecoverable' as const,
            recoveryRunId: fixture.manifest.run_id,
          },
        })),
      },
      {
        repository,
        generateCard: async () => {
          throw new Error('audited failed source must not invoke evidence generation');
        },
      }
    );
    expect(result.status).toBe('accepted');
    expect(result.coverage).toEqual({
      source_count: entries.length,
      assessed_count: 0,
      degraded_count: 0,
      failed_count: entries.length,
    });
    expect(result.cards).toHaveLength(entries.length);
    for (const card of result.cards) {
      expect(card).toMatchObject({
        coverage_status: 'failed',
        coverage_reason: 'source_file_unrecoverable',
        processing_mode: 'metadata_only',
        summary: null,
        key_claims: [],
        terminology: [],
        constraints: [],
        token_counts: { allocated: 0 },
      });
    }
    ledgers.push({
      ledgerId: result.runId!,
      status: 'accepted',
      organizationId,
      courseId,
      entries: result.cards.map(card => ({
        documentId: card.document_id,
        organizationId,
        courseId,
        coverageStatus: 'failed',
        coverageReason: 'source_file_unrecoverable',
        processingMode: 'metadata_only',
        summary: null,
        claims: [],
        terminology: [],
        constraints: [],
        allocatedTokens: 0,
      })),
    });
  }
  expect(ledgers).toHaveLength(2);
  expect(ledgers.flatMap(ledger => ledger.entries)).toHaveLength(6);
  const binding: AcceptedFailedCoverageBinding = {
    status: 'accepted',
    recoveryRunId: fixture.manifest.run_id,
    recoveryManifestSha256: calculateRecoveryManifestSha256(fixture.manifest),
    fingerprint: '',
    ledgers,
  };
  binding.fingerprint = calculateAcceptedFailedCoverageFingerprint(binding);
  return binding;
}

function rowsWithDispositionTruth(fixture: AcceptanceFixture): ReindexSourceRow[] {
  return fixture.rows.map(row => {
    const catalog = fixture.catalogRows.get(row.id)!;
    return {
      ...row,
      vectorStatus: catalog.vector_status,
      errorMessage: catalog.error_message,
    };
  });
}
