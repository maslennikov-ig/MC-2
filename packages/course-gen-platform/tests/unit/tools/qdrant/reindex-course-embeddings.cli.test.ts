import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildReindexJobId,
  createDefaultReindexDependencies,
  loadReindexFixtureDependencies,
  parseReindexCliArgs,
  runReindexCli,
  runReindexCommand,
  validatePhysicalCollectionTarget,
} from '../../../../tools/qdrant/reindex-course-embeddings';
import { calculateAcceptedFailedCoverageFingerprint } from '../../../../tools/qdrant/reindex-plan';
import {
  RUN_ID,
  TARGET,
  completedExecutionLedger,
  dependencies,
  indexed,
  recoveryFixture,
  source,
  verifiedCoverageIds,
} from './reindex-course-embeddings.fixtures';

describe('physical target validation', () => {
  it('accepts only a non-alias bounded physical collection name', () => {
    expect(validatePhysicalCollectionTarget(TARGET)).toBe(TARGET);
    expect(() => validatePhysicalCollectionTarget('course_embeddings')).toThrow(
      'physical collection'
    );
    expect(() => validatePhysicalCollectionTarget('   ')).toThrow('must not be empty');
    expect(() => validatePhysicalCollectionTarget('x'.repeat(256))).toThrow('255');
  });
});

describe('reindex CLI parsing', () => {
  it('parses bounded execute options and explicit dry fixture paths', () => {
    expect(
      parseReindexCliArgs([
        'execute',
        '--target-collection',
        TARGET,
        '--concurrency=4',
        '--run-id',
        RUN_ID,
        '--artifact',
        '/tmp/reindex-artifact.json',
        '--fixture',
        '/tmp/reindex-fixture.json',
      ])
    ).toEqual({
      mode: 'execute',
      targetCollection: TARGET,
      concurrency: 4,
      runId: RUN_ID,
      artifactPath: '/tmp/reindex-artifact.json',
      fixturePath: '/tmp/reindex-fixture.json',
      help: false,
    });
    expect(() => parseReindexCliArgs(['plan', '--allow-gaps'])).toThrow('Unknown option');
    expect(() =>
      parseReindexCliArgs(['plan', '--course-id', '20000000-0000-4000-8000-000000000002'])
    ).toThrow('Unknown option');
  });

  it('parses exact recovery paths, identity, fingerprint, and the catalog coverage authority', () => {
    expect(
      parseReindexCliArgs([
        'plan',
        '--recovery-manifest-path',
        '/secure/recovery/manifest.json',
        '--recovery-journal-path',
        '/secure/recovery/journal.json',
        '--recovery-run-id',
        '51000000-0000-4000-8000-000000000005',
        '--recovery-manifest-sha256',
        'a'.repeat(64),
        '--accepted-coverage-fingerprint',
        'b'.repeat(64),
        '--accepted-coverage-run',
        'catalog:51000000-0000-4000-8000-000000000005',
      ])
    ).toMatchObject({
      recoveryAdapterConfig: {
        manifestPath: '/secure/recovery/manifest.json',
        journalPath: '/secure/recovery/journal.json',
        expectedRecoveryRunId: '51000000-0000-4000-8000-000000000005',
        expectedRecoveryManifestSha256: 'a'.repeat(64),
        expectedCoverageFingerprint: 'b'.repeat(64),
        acceptedCoverageAuthority: 'catalog:51000000-0000-4000-8000-000000000005',
      },
    });
    expect(() =>
      parseReindexCliArgs([
        'plan',
        '--accepted-coverage-run',
        '10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000002:52000000-0000-4000-8000-000000000005',
      ])
    ).toThrow(/must be catalog:<recovery-run-id>/iu);
  });

  it('fails closed when default live dependencies lack exact recovery configuration', () => {
    expect(() => createDefaultReindexDependencies()).toThrow(/recovery.*configuration/iu);
  });

  it('loads and validates a complete dry fixture without live services', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mc2-qdrant-reindex-'));
    const fixturePath = join(directory, 'fixture.json');
    const row = source('60000000-0000-4000-8000-000000000006');
    const recovery = recoveryFixture([row]);
    await writeFile(
      fixturePath,
      JSON.stringify({
        runId: RUN_ID,
        now: '2026-07-10T12:00:00.000Z',
        recoveryBinding: recovery.binding,
        sources: recovery.rows.map(sourceRow => ({
          ...sourceRow,
          sourceAvailable: sourceRow.id === row.id,
          invalidSourcePath: verifiedCoverageIds(recovery.binding).slice(4).includes(sourceRow.id),
        })),
        schemaVerification: { ok: true, mismatches: [] },
        indexedDocuments: [indexed(row)],
        relevanceChecks: [
          { language: 'ru', passed: true, nativeHybrid: true },
          { language: 'en', passed: true, nativeHybrid: true },
        ],
      })
    );

    try {
      const deps = await loadReindexFixtureDependencies(fixturePath);
      const result = await runReindexCommand({ mode: 'plan' }, deps);
      expect(result.exitCode).toBe(0);
      expect(result.report).toMatchObject({ recoverable: 1, auditedFailed: 6 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unrelated empty dry-fixture coverage scope before artifact publication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mc2-qdrant-reindex-scope-'));
    const fixturePath = join(directory, 'fixture.json');
    const artifactPath = join(directory, 'artifact.json');
    const row = source('60000000-0000-4000-8000-000000000006');
    const recovery = recoveryFixture([row]);
    (
      recovery.binding.acceptedFailedCoverage.scopes as {
        organizationId: string;
        courseId: string;
        entries: unknown[];
      }[]
    ).push({
      organizationId: row.organizationId,
      courseId: '22000000-0000-4000-8000-000000000002',
      entries: [],
    });
    recovery.binding.acceptedFailedCoverage.fingerprint =
      calculateAcceptedFailedCoverageFingerprint(recovery.binding.acceptedFailedCoverage);
    await writeFile(
      fixturePath,
      JSON.stringify({
        runId: RUN_ID,
        now: '2026-07-10T12:00:00.000Z',
        recoveryBinding: recovery.binding,
        sources: recovery.rows.map(sourceRow => ({
          ...sourceRow,
          sourceAvailable: sourceRow.id === row.id,
          invalidSourcePath: verifiedCoverageIds(recovery.binding).slice(4).includes(sourceRow.id),
        })),
        schemaVerification: { ok: true, mismatches: [] },
        indexedDocuments: [indexed(row)],
        relevanceChecks: [
          { language: 'ru', passed: true, nativeHybrid: true },
          { language: 'en', passed: true, nativeHybrid: true },
        ],
      })
    );

    try {
      const deps = await loadReindexFixtureDependencies(fixturePath);
      await expect(
        runReindexCommand(
          {
            mode: 'execute',
            targetCollection: TARGET,
            runId: RUN_ID,
            artifactPath,
          },
          deps
        )
      ).rejects.toThrow(/coverage scopes must exactly match/iu);
      await expect(stat(artifactPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects unknown modes and options', () => {
    expect(() => parseReindexCliArgs(['mutate'])).toThrow('mode');
    expect(() => parseReindexCliArgs(['plan', '--unsafe'])).toThrow('Unknown option');
  });

  it('routes fixture mode without constructing live dependencies or printing source paths', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const deps = dependencies(rows);
    const stdout = vi.fn();
    const stderr = vi.fn();
    const createDefaultDependencies = vi.fn();
    const loadFixtureDependencies = vi.fn().mockResolvedValue(deps);

    const exitCode = await runReindexCli(['plan', '--fixture', '/tmp/reindex-fixture.json'], {
      stdout,
      stderr,
      createDefaultDependencies,
      loadFixtureDependencies,
    });

    expect(exitCode).toBe(0);
    expect(loadFixtureDependencies).toHaveBeenCalledWith('/tmp/reindex-fixture.json');
    expect(createDefaultDependencies).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledOnce();
    const output = stdout.mock.calls[0][0] as string;
    const summary = stderr.mock.calls[0][0] as string;
    expect(output).toContain('"dryFixture": true');
    expect(output).not.toContain('storagePath');
    expect(output).not.toContain('/uploads/');
    expect(summary).toMatch(
      /^PLAN status=ok eligible=7 recoverable=1 audited_failed=6 unresolved=0 action=none\n$/
    );
    expect(summary).not.toContain('/uploads/');
    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });

  it('reports an unresolved execute as blocked without undefined or sensitive fields', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
    ];
    const recovery = recoveryFixture(rows);
    const deps = dependencies(rows, {
      probeSources: vi.fn().mockResolvedValue({
        availableFileIds: new Set([rows[0].id]),
        invalidPathFileIds: new Set(verifiedCoverageIds(recovery.binding).slice(4)),
        resolvedFilePaths: new Map([[rows[0].id, `/safe/uploads/${rows[0].id}.pdf`]]),
      }),
    });
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runReindexCli(
      ['execute', '--target-collection', TARGET, '--run-id', RUN_ID],
      {
        stdout,
        stderr,
        createDefaultDependencies: () => deps,
        loadFixtureDependencies: vi.fn(),
      }
    );

    expect(exitCode).toBe(2);
    expect(stderr).toHaveBeenCalledWith(
      'EXECUTE status=blocked eligible=8 audited_failed=6 unresolved=1 action=repair-sources\n'
    );
    expect(stderr.mock.calls[0][0]).not.toContain('undefined');
    expect(stdout.mock.calls[0][0]).not.toContain('/safe/uploads/');
    expect(stdout.mock.calls[0][0]).not.toContain(rows[0].id);
    expect(stdout.mock.calls[0][0]).not.toContain(rows[1].id);
    expect(stdout.mock.calls[0][0]).not.toContain(recovery.binding.manifestSha256);
    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });

  it('reports execute schema failures with aggregate counts and no target or raw mismatch text', async () => {
    const row = source('60000000-0000-4000-8000-000000000006');
    const sensitive = `/private/${RUN_ID}/${row.id}/${row.hash}/${TARGET}`;
    const deps = dependencies([row], {
      verifyPhysicalTarget: vi.fn().mockResolvedValue({ ok: false, mismatches: [sensitive] }),
    });
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runReindexCli(
      ['execute', '--target-collection', TARGET, '--run-id', RUN_ID],
      {
        stdout,
        stderr,
        createDefaultDependencies: () => deps,
        loadFixtureDependencies: vi.fn(),
      }
    );

    expect(exitCode).toBe(1);
    const output = JSON.parse(stdout.mock.calls[0][0] as string) as {
      report: Record<string, unknown>;
    };
    expect(output.report).toMatchObject({ schemaMismatchCount: 1 });
    expect(output.report).not.toHaveProperty('targetCollection');
    expect(output.report).not.toHaveProperty('schemaMismatches');
    const combined = `${stdout.mock.calls[0][0]}${stderr.mock.calls[0][0]}`;
    expect(combined).not.toContain(TARGET);
    expect(combined).not.toContain(sensitive);
  });

  it('reports verify failures with counts only and no raw target, schema, or relevance strings', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006', 'ru'),
      source('70000000-0000-4000-8000-000000000007', 'en'),
    ];
    const sensitive = `/private/${RUN_ID}/${rows[0].id}/${rows[0].hash}/${TARGET}`;
    const resumed = recoveryFixture(rows, 'reindex_started');
    const deps = dependencies(rows, {
      loadRecoveryBinding: vi.fn().mockResolvedValue(resumed.binding),
      loadArtifact: vi.fn().mockResolvedValue(completedExecutionLedger(rows)),
      verifyPhysicalTarget: vi.fn().mockResolvedValue({ ok: false, mismatches: [sensitive] }),
      loadIndexedDocuments: vi.fn().mockResolvedValue([indexed(rows[0])]),
      runRelevanceChecks: vi.fn().mockResolvedValue([
        { language: 'ru', passed: true, nativeHybrid: true },
        { language: 'en', passed: false, nativeHybrid: true },
      ]),
    });
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runReindexCli(
      ['verify', '--target-collection', TARGET, '--run-id', RUN_ID],
      {
        stdout,
        stderr,
        createDefaultDependencies: () => deps,
        loadFixtureDependencies: vi.fn(),
      }
    );

    expect(exitCode).toBe(1);
    const output = JSON.parse(stdout.mock.calls[0][0] as string) as {
      report: Record<string, unknown>;
    };
    expect(output.report).toMatchObject({
      schemaMismatchCount: 1,
      relevanceFailureCount: 1,
      missingDocuments: 1,
    });
    expect(output.report).not.toHaveProperty('targetCollection');
    expect(output.report).not.toHaveProperty('schemaMismatches');
    expect(output.report).not.toHaveProperty('relevanceFailures');
    const combined = `${stdout.mock.calls[0][0]}${stderr.mock.calls[0][0]}`;
    expect(combined).not.toContain(TARGET);
    expect(combined).not.toContain(sensitive);
  });

  it.each([
    ['retained_job_mismatch', `Retained BullMQ job ${RUN_ID}-sensitive does not match this file`],
    ['artifact_binding_mismatch', `Run artifact /private/${RUN_ID}.json belongs to another run`],
    ['source_inventory_invalid', `Non-increasing file_catalog keyset page at ${RUN_ID}`],
    ['fixture_invalid', `Malformed fixture /private/${RUN_ID}.json`],
  ])('maps sensitive CLI failures to bounded code %s', async (reasonCode, message) => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const deps = dependencies([]);

    const exitCode = await runReindexCli(['plan'], {
      stdout,
      stderr,
      createDefaultDependencies: () => ({
        ...deps,
        loadRecoveryBinding: vi.fn().mockRejectedValue(new Error(message)),
      }),
      loadFixtureDependencies: vi.fn(),
    });

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining(`REINDEX_ERROR code=${reasonCode} detail=`)
    );
    expect(stderr.mock.calls[0][0]).not.toContain(RUN_ID);
    expect(stderr.mock.calls[0][0]).not.toContain('/private/');
    expect(stdout).not.toHaveBeenCalled();
  });

  it('bounds dependency cleanup failures without exposing their message', async () => {
    const sensitive = `/private/${RUN_ID}/redis.sock`;
    const deps = dependencies([]);
    deps.close = vi.fn().mockRejectedValue(new Error(`close failed at ${sensitive}`));
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runReindexCli(['plan'], {
      stdout,
      stderr,
      createDefaultDependencies: () => deps,
      loadFixtureDependencies: vi.fn(),
    });

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenLastCalledWith('REINDEX_ERROR code=internal\n');
    expect(JSON.stringify(stderr.mock.calls)).not.toContain(sensitive);
  });

  it('omits run, job, file, path, and hash identities from successful execute output', async () => {
    const row = source('60000000-0000-4000-8000-000000000006');
    const deps = dependencies([row]);
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runReindexCli(
      ['execute', '--target-collection', TARGET, '--run-id', RUN_ID],
      {
        stdout,
        stderr,
        createDefaultDependencies: () => deps,
        loadFixtureDependencies: vi.fn(),
      }
    );

    expect(exitCode).toBe(0);
    const combined = `${stdout.mock.calls[0][0]}${stderr.mock.calls[0][0]}`;
    for (const sensitive of [
      RUN_ID,
      row.id,
      row.storagePath,
      row.hash,
      buildReindexJobId(RUN_ID, row.id),
    ]) {
      expect(combined).not.toContain(sensitive);
    }
  });
});
