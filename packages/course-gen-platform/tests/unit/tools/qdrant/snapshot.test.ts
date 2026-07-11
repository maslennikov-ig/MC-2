import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  acquireRecoveryLock,
  buildSnapshotManifest,
  renderRecoveryMetrics,
  resolvePhysicalCollection,
  SNAPSHOT_MANIFEST_SCHEMA,
  selectRetentionDeletions,
  writeAtomicText,
  type SnapshotManifest,
} from '../../../../tools/qdrant/snapshot-recovery.js';
import { runSnapshotOperation } from '../../../../tools/qdrant/snapshot.js';

async function createSharedMetricsDirectory(root: string): Promise<string> {
  const directory = join(root, 'qdrant-metrics');
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o2775);
  return directory;
}

describe('Qdrant snapshot recovery contract', () => {
  it('provides a dedicated recovery helper module', async () => {
    const modulePath = fileURLToPath(
      new URL('../../../../tools/qdrant/snapshot-recovery.ts', import.meta.url)
    );

    await expect(access(modulePath)).resolves.toBeUndefined();
  });

  it('resolves an alias to exactly one physical collection', () => {
    const aliases = [
      { alias_name: 'other', collection_name: 'foreign_v1' },
      { alias_name: 'course_embeddings', collection_name: 'course_embeddings_v7' },
    ];

    expect(resolvePhysicalCollection(aliases, 'course_embeddings')).toBe('course_embeddings_v7');
    expect(() => resolvePhysicalCollection(aliases, 'missing')).toThrow(/exactly one/iu);
    expect(() =>
      resolvePhysicalCollection(
        [...aliases, { alias_name: 'course_embeddings', collection_name: 'duplicate_v8' }],
        'course_embeddings'
      )
    ).toThrow(/exactly one/iu);
  });

  it('builds a deterministic redacted durable manifest with checksums', () => {
    const manifest = buildSnapshotManifest({
      logicalAlias: 'course_embeddings',
      physicalCollection: 'course_embeddings_v7',
      snapshot: {
        name: 'course_embeddings_v7-2026-07-11.snapshot',
        creation_time: '2026-07-11T12:00:00Z',
        size: 1234,
        checksum: 'server-checksum',
      },
      pointCount: 42,
      createdAt: new Date('2026-07-11T12:00:00Z'),
      storageMode: 's3',
      remotePrefix: 'megacampus/qdrant/course_embeddings_v7',
      locallyVerifiedSha256: 'a'.repeat(64),
      serverVersion: '1.18.2',
      clientVersion: '1.18.0',
    });

    expect(manifest).toEqual({
      schema_version: 'megacampus.qdrant.snapshot-manifest/v1',
      status: 'success',
      logical_alias: 'course_embeddings',
      physical_collection: 'course_embeddings_v7',
      snapshot_name: 'course_embeddings_v7-2026-07-11.snapshot',
      point_count: 42,
      size_bytes: 1234,
      server_checksum: 'server-checksum',
      sha256: 'a'.repeat(64),
      created_at: '2026-07-11T12:00:00.000Z',
      storage_mode: 's3',
      remote_object:
        'megacampus/qdrant/course_embeddings_v7/course_embeddings_v7-2026-07-11.snapshot',
      server_version: '1.18.2',
      client_version: '1.18.0',
    });
    expect(JSON.stringify(manifest)).not.toMatch(/bucket|access|secret|api[_-]?key/iu);
  });

  it('selects deterministic 30-day retention without deleting newest or foreign prefixes', () => {
    const base = {
      schema_version: 'megacampus.qdrant.snapshot-manifest/v1',
      status: 'success',
      logical_alias: 'course_embeddings',
      physical_collection: 'course_embeddings_v7',
      point_count: 1,
      size_bytes: 1,
      storage_mode: 's3',
      server_version: '1.18.2',
      client_version: '1.18.0',
    } as const;
    const manifests: SnapshotManifest[] = [
      {
        ...base,
        snapshot_name: 'owned-newest.snapshot',
        created_at: '2026-07-01T00:00:00.000Z',
        remote_object: 'owned/owned-newest.snapshot',
      },
      {
        ...base,
        snapshot_name: 'owned-old-b.snapshot',
        created_at: '2026-05-02T00:00:00.000Z',
        remote_object: 'owned/owned-old-b.snapshot',
      },
      {
        ...base,
        snapshot_name: 'owned-old-a.snapshot',
        created_at: '2026-05-01T00:00:00.000Z',
        remote_object: 'owned/owned-old-a.snapshot',
      },
      {
        ...base,
        snapshot_name: 'owned-boundary.snapshot',
        created_at: '2026-06-11T00:00:00.000Z',
        remote_object: 'owned/owned-boundary.snapshot',
      },
      {
        ...base,
        snapshot_name: 'foreign.snapshot',
        created_at: '2026-01-01T00:00:00.000Z',
        remote_object: 'foreign/foreign.snapshot',
      },
    ];

    expect(
      selectRetentionDeletions(manifests, {
        now: new Date('2026-07-11T00:00:00.000Z'),
        retentionDays: 30,
        physicalCollection: 'course_embeddings_v7',
        ownedPrefix: 'owned/',
      })
    ).toEqual(['owned-old-a.snapshot', 'owned-old-b.snapshot']);

    expect(
      selectRetentionDeletions(manifests.slice(1, 3), {
        now: new Date('2026-07-11T00:00:00.000Z'),
        retentionDays: 30,
        physicalCollection: 'course_embeddings_v7',
        ownedPrefix: 'owned/',
      })
    ).toEqual(['owned-old-a.snapshot']);
  });

  it('renders observable failure and lock metrics without advancing success time', () => {
    const metrics = renderRecoveryMetrics({
      snapshotFailuresTotal: 3,
      restoreFailuresTotal: 2,
      lockContentionsTotal: 1,
      lastOperationSuccess: false,
      lastSuccessfulSnapshotEpochSeconds: 100,
      lastSuccessfulRestoreDrillEpochSeconds: 200,
    });

    expect(metrics).toContain('megacampus_qdrant_snapshot_failures_total 3');
    expect(metrics).toContain('megacampus_qdrant_restore_drill_failures_total 2');
    expect(metrics).toContain('megacampus_qdrant_recovery_lock_contentions_total 1');
    expect(metrics).toContain('megacampus_qdrant_recovery_last_operation_success 0');
    expect(metrics).toContain('megacampus_qdrant_last_successful_snapshot_unixtime_seconds 100');
    expect(metrics).toContain(
      'megacampus_qdrant_last_successful_restore_drill_unixtime_seconds 200'
    );
  });

  it('writes manifest and metrics atomically with owner-only permissions', async () => {
    const directory = await mkdtemp(join('/tmp', 'mc2-qdrant-atomic-'));
    const target = join(directory, 'nested', 'manifest.json');

    await writeAtomicText(target, '{"status":"success"}\n');

    expect(await readFile(target, 'utf8')).toBe('{"status":"success"}\n');
    expect((await stat(target)).mode & 0o777).toBe(0o600);
    expect(await readdir(join(directory, 'nested'))).toEqual(['manifest.json']);
    await rm(directory, { recursive: true, force: true });
  });

  it('makes a metric node_exporter-readable before atomic visibility under umask 0077', async () => {
    const directory = await mkdtemp(join('/tmp', 'mc2-qdrant-metric-atomic-'));
    const metricsDirectory = await createSharedMetricsDirectory(directory);
    const target = join(metricsDirectory, 'megacampus_qdrant_recovery.prom');
    const previousUmask = process.umask(0o077);
    try {
      await writeAtomicText(target, 'megacampus_qdrant_snapshot_failures_total 0\n', {
        mode: 0o644,
        createParent: false,
      });
    } finally {
      process.umask(previousUmask);
    }

    expect((await stat(target)).mode & 0o777).toBe(0o644);
    expect(await readFile(target, 'utf8')).toContain('snapshot_failures_total 0');
    expect(await readdir(metricsDirectory)).toEqual(['megacampus_qdrant_recovery.prom']);
    await rm(directory, { recursive: true, force: true });
  });

  it('holds one nonblocking recovery lock and rejects a duplicate run', async () => {
    const directory = await mkdtemp(join('/tmp', 'mc2-qdrant-lock-'));
    const lockPath = join(directory, 'recovery.lock');
    const first = await acquireRecoveryLock(lockPath);

    await expect(acquireRecoveryLock(lockPath)).rejects.toThrow(/already running/iu);
    await first.release();
    const afterRelease = await acquireRecoveryLock(lockPath);
    await afterRelease.release();
    await rm(directory, { recursive: true, force: true });
  });

  it('creates, re-lists, downloads, checksums, persists, then applies owned retention', async () => {
    const directory = await mkdtemp(join('/tmp', 'mc2-qdrant-snapshot-run-'));
    const manifestDir = join(directory, 'manifests');
    const metricsDirectory = await createSharedMetricsDirectory(directory);
    const snapshot = {
      name: 'course_embeddings_v7-2026-07-11.snapshot',
      creation_time: '2026-07-11T12:00:00Z',
      size: 14,
      checksum: '7783d47a378f6c3ca8d1b29aa1b688ff6b14d26bd3bf8bae14785138db1eff0c',
    };
    const callOrder: string[] = [];
    const client = {
      getAliases: vi.fn(() =>
        Promise.resolve({
          aliases: [{ alias_name: 'course_embeddings', collection_name: 'course_embeddings_v7' }],
        })
      ),
      getCollection: vi.fn(() => Promise.resolve({ points_count: 42 })),
      versionInfo: vi.fn(() => Promise.resolve({ version: '1.18.2' })),
      createSnapshot: vi.fn(() => {
        callOrder.push('create');
        return Promise.resolve(snapshot);
      }),
      listSnapshots: vi.fn(() => {
        callOrder.push('list');
        return Promise.resolve([
          snapshot,
          {
            name: 'owned-old.snapshot',
            creation_time: '2026-01-01T00:00:00Z',
            size: 10,
            checksum: null,
          },
        ]);
      }),
      deleteSnapshot: vi.fn(() => {
        callOrder.push('delete');
        return Promise.resolve(true);
      }),
    };
    const fetchSnapshot = vi.fn((_url: string | URL, init?: RequestInit) => {
      callOrder.push('download');
      expect(new Headers(init?.headers).get('api-key')).toBe('local-test-key');
      const response = new Response('snapshot-bytes', { status: 200 });
      Object.defineProperty(response, 'arrayBuffer', {
        value: () => {
          throw new Error('snapshot checksum must stream without whole-file buffering');
        },
      });
      return Promise.resolve(response);
    });

    await writeFile(
      join(directory, 'old.json'),
      JSON.stringify({
        schema_version: SNAPSHOT_MANIFEST_SCHEMA,
        status: 'success',
        logical_alias: 'course_embeddings',
        physical_collection: 'course_embeddings_v7',
        snapshot_name: 'owned-old.snapshot',
        point_count: 40,
        size_bytes: 10,
        created_at: '2026-01-01T00:00:00.000Z',
        storage_mode: 'local',
        remote_object: 'owned/owned-old.snapshot',
        server_version: '1.18.2',
        client_version: '1.18.0',
      })
    );

    const result = await runSnapshotOperation({
      client: client as never,
      logicalAlias: 'course_embeddings',
      qdrantUrl: 'http://127.0.0.1:6333',
      apiKey: 'local-test-key',
      storageMode: 'local',
      remotePrefix: 'owned',
      manifestDirectory: manifestDir,
      metricStatePath: join(directory, 'metrics-state.json'),
      metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
      failureDirectory: join(directory, 'failures'),
      lockPath: join(directory, 'recovery.lock'),
      now: new Date('2026-07-11T12:00:00.000Z'),
      fetchSnapshot,
      existingManifests: [
        JSON.parse(await readFile(join(directory, 'old.json'), 'utf8')) as SnapshotManifest,
      ],
    });

    expect(result.manifest.sha256).toBe(snapshot.checksum);
    expect(callOrder).toEqual(['create', 'list', 'download', 'delete']);
    expect(await readFile(result.manifestPath, 'utf8')).toContain(snapshot.name);
    expect(await readFile(join(manifestDir, 'latest-manifest.json'), 'utf8')).toBe(
      await readFile(result.manifestPath, 'utf8')
    );
    expect(
      await readFile(join(metricsDirectory, 'megacampus_qdrant_recovery.prom'), 'utf8')
    ).toContain('megacampus_qdrant_last_successful_snapshot_unixtime_seconds 1783771200');
    expect(client.deleteSnapshot).toHaveBeenCalledWith(
      'course_embeddings_v7',
      'owned-old.snapshot',
      { wait: true }
    );
    expect(
      `${await readFile(result.manifestPath, 'utf8')} ${await readFile(join(metricsDirectory, 'megacampus_qdrant_recovery.prom'), 'utf8')}`
    ).not.toContain('local-test-key');
    expect(
      (await stat(join(metricsDirectory, 'megacampus_qdrant_recovery.prom'))).mode & 0o777
    ).toBe(0o644);
    expect((await stat(join(directory, 'metrics-state.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(result.manifestPath)).mode & 0o777).toBe(0o600);
    expect((await stat(join(manifestDir, 'latest-manifest.json'))).mode & 0o777).toBe(0o600);
    await rm(directory, { recursive: true, force: true });
  });

  it('records a redacted failure metric and leaves success age unchanged', async () => {
    const directory = await mkdtemp(join('/tmp', 'mc2-qdrant-snapshot-failure-'));
    const metricsDirectory = await createSharedMetricsDirectory(directory);
    const client = {
      getAliases: vi.fn(() =>
        Promise.resolve({
          aliases: [{ alias_name: 'course_embeddings', collection_name: 'course_embeddings_v7' }],
        })
      ),
      getCollection: vi.fn(() => Promise.resolve({ points_count: 42 })),
      versionInfo: vi.fn(() => Promise.resolve({ version: '1.18.2' })),
      createSnapshot: vi.fn(() => Promise.reject(new Error('upstream rejected secret-value'))),
    };
    const metricStatePath = join(directory, 'metrics-state.json');
    await writeFile(
      metricStatePath,
      JSON.stringify({
        snapshotFailuresTotal: 4,
        restoreFailuresTotal: 0,
        lockContentionsTotal: 0,
        lastOperationSuccess: true,
        lastSuccessfulSnapshotEpochSeconds: 100,
      })
    );

    await expect(
      runSnapshotOperation({
        client: client as never,
        logicalAlias: 'course_embeddings',
        qdrantUrl: 'http://127.0.0.1:6333',
        apiKey: 'secret-value',
        storageMode: 'local',
        remotePrefix: 'owned',
        manifestDirectory: join(directory, 'manifests'),
        metricStatePath,
        metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
        failureDirectory: join(directory, 'failures'),
        lockPath: join(directory, 'recovery.lock'),
        now: new Date('2026-07-11T12:00:00.000Z'),
      })
    ).rejects.toThrow(/snapshot operation failed/iu);

    const metrics = await readFile(
      join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
      'utf8'
    );
    expect(metrics).toContain('megacampus_qdrant_snapshot_failures_total 5');
    expect(metrics).toContain('megacampus_qdrant_last_successful_snapshot_unixtime_seconds 100');
    expect(metrics).not.toContain('secret-value');
    const failureFiles = await readdir(join(directory, 'failures'));
    expect(failureFiles).toHaveLength(1);
    expect(await readFile(join(directory, 'failures', failureFiles[0]), 'utf8')).not.toContain(
      'secret-value'
    );
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['missing', 'wrong-mode'] as const)(
    'fails before Qdrant mutation when the shared metrics directory is %s',
    async condition => {
      const directory = await mkdtemp(join('/tmp', `mc2-qdrant-metrics-${condition}-`));
      const metricsDirectory = join(directory, 'qdrant-metrics');
      if (condition === 'wrong-mode') {
        await mkdir(metricsDirectory, { mode: 0o700 });
      }
      const client = {
        getAliases: vi.fn(() => Promise.resolve({ aliases: [] })),
        getCollection: vi.fn(),
        versionInfo: vi.fn(),
        createSnapshot: vi.fn(),
        listSnapshots: vi.fn(),
        deleteSnapshot: vi.fn(),
      };

      await expect(
        runSnapshotOperation({
          client: client as never,
          logicalAlias: 'course_embeddings',
          qdrantUrl: 'http://127.0.0.1:6333',
          apiKey: 'local-test-key',
          storageMode: 'local',
          remotePrefix: 'owned',
          manifestDirectory: join(directory, 'manifests'),
          metricStatePath: join(directory, 'metrics-state.json'),
          metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
          failureDirectory: join(directory, 'failures'),
          lockPath: join(directory, 'recovery.lock'),
        })
      ).rejects.toThrow(/metrics.*directory|directory.*metrics/iu);

      expect(client.getAliases).not.toHaveBeenCalled();
      expect(client.createSnapshot).not.toHaveBeenCalled();
      if (condition === 'missing') {
        await expect(access(metricsDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
      } else {
        expect((await stat(metricsDirectory)).mode & 0o7777).toBe(0o700);
      }
      await rm(directory, { recursive: true, force: true });
    }
  );
});
