import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  SNAPSHOT_MANIFEST_SCHEMA,
  type SnapshotManifest,
} from '../../../../tools/qdrant/snapshot-recovery.js';
import {
  runRestoreDrill,
  verifyRecoveredCollection,
  type RecoveryProbe,
} from '../../../../tools/qdrant/restore-drill.js';

const MANIFEST: SnapshotManifest = {
  schema_version: SNAPSHOT_MANIFEST_SCHEMA,
  status: 'success',
  logical_alias: 'course_embeddings',
  physical_collection: 'course_embeddings_v7',
  snapshot_name: 'course embeddings v7.snapshot',
  point_count: 42,
  size_bytes: 100,
  server_checksum: 'a'.repeat(64),
  sha256: 'b'.repeat(64),
  created_at: '2026-07-11T12:00:00.000Z',
  storage_mode: 'local',
  remote_object: 'owned/course embeddings v7.snapshot',
  server_version: '1.18.2',
  client_version: '1.18.0',
};

const PROBE: RecoveryProbe = {
  dense_vector: [1, 0, 0],
  ru_query: 'спектроскопия',
  en_query: 'photosynthesis',
  formula_query: 'formula_fixture',
  organization_id: 'org-ru',
  course_id: 'course-ru',
  mismatched_organization_id: 'org-en',
  mismatched_course_id: 'course-en',
  expected_dense: {
    point_id: 'dense-point',
    document_id: 'dense-document',
    chunk_id: 'dense-chunk',
    content: 'dense exact content',
  },
  expected_ru_bm25: {
    point_id: 'ru-point',
    document_id: 'ru-document',
    chunk_id: 'ru-chunk',
    content: 'ru exact content',
  },
  expected_en_bm25: {
    point_id: 'en-point',
    document_id: 'en-document',
    chunk_id: 'en-chunk',
    content: 'en exact content',
  },
  expected_formula_order: [
    {
      point_id: 'formula-core-point',
      document_id: 'formula-core-document',
      chunk_id: 'formula-core-chunk',
      content: 'formula core exact content',
    },
    {
      point_id: 'formula-supplementary-point',
      document_id: 'formula-supplementary-document',
      chunk_id: 'formula-supplementary-chunk',
      content: 'formula supplementary exact content',
    },
  ],
};

async function createSharedMetricsDirectory(root: string): Promise<string> {
  const directory = join(root, 'qdrant-metrics');
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o2775);
  return directory;
}

function recoveryPoint(
  id: string,
  documentId: string,
  chunkId: string,
  content: string,
  priority = 'CORE',
  score = 1
) {
  return {
    id,
    score,
    payload: {
      organization_id: 'org-ru',
      course_id: 'course-ru',
      document_id: documentId,
      chunk_id: chunkId,
      content,
      document_priority: priority,
    },
  };
}

describe('Qdrant restore drill', () => {
  it('verifies schema, count, dense, RU/EN BM25, Formula priority, and isolation through alias', async () => {
    const query = vi.fn((_collection: string, request: Record<string, unknown>) => {
      const serialized = JSON.stringify(request);
      if (serialized.includes('course-en') || serialized.includes('org-en')) {
        return Promise.resolve({ points: [] });
      }
      if (serialized.includes('"prefetch"') && serialized.includes('formula_fixture')) {
        return Promise.resolve({
          points: [
            recoveryPoint(
              'formula-core-point',
              'formula-core-document',
              'formula-core-chunk',
              'formula core exact content',
              'CORE',
              1.2
            ),
            recoveryPoint(
              'formula-supplementary-point',
              'formula-supplementary-document',
              'formula-supplementary-chunk',
              'formula supplementary exact content',
              'SUPPLEMENTARY',
              1
            ),
          ],
        });
      }
      if (serialized.includes('"using":"dense"')) {
        return Promise.resolve({
          points: [
            recoveryPoint('dense-point', 'dense-document', 'dense-chunk', 'dense exact content'),
          ],
        });
      }
      if (serialized.includes('спектроскопия')) {
        return Promise.resolve({
          points: [recoveryPoint('ru-point', 'ru-document', 'ru-chunk', 'ru exact content')],
        });
      }
      return Promise.resolve({
        points: [recoveryPoint('en-point', 'en-document', 'en-chunk', 'en exact content')],
      });
    });
    const client = {
      getCollection: vi.fn(() => Promise.resolve({ points_count: 42 })),
      query,
    };
    const verifyPhysical = vi.fn(() =>
      Promise.resolve({
        ok: true,
        physicalName: 'qdrant_restore_drill_20260711_nonce',
        mismatches: [],
      })
    );

    const checks = await verifyRecoveredCollection({
      client: client as never,
      physicalCollection: 'qdrant_restore_drill_20260711_nonce',
      drillAlias: 'qdrant_restore_drill_alias_20260711_nonce',
      manifest: MANIFEST,
      probe: PROBE,
      verifyPhysical,
    });

    expect(checks).toEqual({
      schema: 'pass',
      count: 'pass',
      dense: 'pass',
      ru_bm25: 'pass',
      en_bm25: 'pass',
      formula_priority: 'pass',
      tenant_course_isolation: 'pass',
    });
    expect(verifyPhysical).toHaveBeenCalledWith({
      client,
      physicalName: 'qdrant_restore_drill_20260711_nonce',
    });
    expect(query).toHaveBeenCalledTimes(6);
    expect(
      query.mock.calls.every(
        ([collection]) => collection === 'qdrant_restore_drill_alias_20260711_nonce'
      )
    ).toBe(true);
  });

  it('fails when a recovered top identity or content differs from the probe', async () => {
    const client = {
      getCollection: vi.fn(() => Promise.resolve({ points_count: 42 })),
      query: vi.fn(() =>
        Promise.resolve({
          points: [
            recoveryPoint('dense-point', 'dense-document', 'dense-chunk', 'dense exact content'),
          ],
        })
      ),
    };

    let mismatchError: unknown;
    try {
      await verifyRecoveredCollection({
        client: client as never,
        physicalCollection: 'qdrant_restore_drill_identity_mismatch',
        drillAlias: 'qdrant_restore_drill_alias_identity_mismatch',
        manifest: MANIFEST,
        probe: {
          ...PROBE,
          expected_dense: { ...PROBE.expected_dense, point_id: 'wrong-dense-point' },
        },
        verifyPhysical: vi.fn(() =>
          Promise.resolve({
            ok: true,
            physicalName: 'qdrant_restore_drill_identity_mismatch',
            mismatches: [],
          })
        ),
      });
    } catch (error) {
      mismatchError = error;
    }
    expect(mismatchError).toBeInstanceOf(Error);
    expect((mismatchError as Error).message).toMatch(/dense.*identity|identity.*dense/iu);
    expect((mismatchError as Error).message).not.toContain('dense exact content');
    expect((mismatchError as Error).message).not.toContain('wrong-dense-point');
  });

  it('recovers by authenticated supported transport, recreates drill alias, and preserves stable alias', async () => {
    const directory = await mkdtemp(join('/tmp', 'mc2-qdrant-restore-'));
    const metricsDirectory = await createSharedMetricsDirectory(directory);
    const aliases = new Map([['course_embeddings', 'course_embeddings_v7']]);
    const collections = new Set(['course_embeddings_v7']);
    const client = {
      getAliases: vi.fn(() =>
        Promise.resolve({
          aliases: [...aliases].map(([alias_name, collection_name]) => ({
            alias_name,
            collection_name,
          })),
        })
      ),
      getCollections: vi.fn(() =>
        Promise.resolve({
          collections: [...collections].map(name => ({ name })),
        })
      ),
      recoverSnapshot: vi.fn((name: string) => {
        collections.add(name);
        return Promise.resolve(true);
      }),
      updateCollectionAliases: vi.fn(({ actions }: { actions: Array<Record<string, never>> }) => {
        for (const action of actions as Array<{
          create_alias?: { alias_name: string; collection_name: string };
          delete_alias?: { alias_name: string };
        }>) {
          if (action.create_alias)
            aliases.set(action.create_alias.alias_name, action.create_alias.collection_name);
          if (action.delete_alias) aliases.delete(action.delete_alias.alias_name);
        }
        return Promise.resolve(true);
      }),
      deleteCollection: vi.fn((name: string) => Promise.resolve(collections.delete(name))),
    };
    const verifyRecovered = vi.fn(() =>
      Promise.resolve({
        schema: 'pass' as const,
        count: 'pass' as const,
        dense: 'pass' as const,
        ru_bm25: 'pass' as const,
        en_bm25: 'pass' as const,
        formula_priority: 'pass' as const,
        tenant_course_isolation: 'pass' as const,
      })
    );

    const result = await runRestoreDrill({
      client: client as never,
      manifest: MANIFEST,
      probe: PROBE,
      apiKey: 'local-test-key',
      transportBaseUrl: 'http://127.0.0.1:6333',
      stableAlias: 'course_embeddings',
      targetCollection: 'qdrant_restore_drill_20260711_nonce',
      drillAlias: 'qdrant_restore_drill_alias_20260711_nonce',
      evidenceDirectory: join(directory, 'evidence'),
      metricStatePath: join(directory, 'metrics-state.json'),
      metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
      lockPath: join(directory, 'recovery.lock'),
      now: new Date('2026-07-11T12:00:00.000Z'),
      verifyRecovered,
    });

    expect(client.recoverSnapshot).toHaveBeenCalledWith('qdrant_restore_drill_20260711_nonce', {
      location:
        'http://127.0.0.1:6333/collections/course_embeddings_v7/snapshots/course%20embeddings%20v7.snapshot',
      priority: 'snapshot',
      checksum: MANIFEST.sha256,
      api_key: 'local-test-key',
    });
    expect(verifyRecovered).toHaveBeenCalledWith(
      expect.objectContaining({
        physicalCollection: 'qdrant_restore_drill_20260711_nonce',
        drillAlias: 'qdrant_restore_drill_alias_20260711_nonce',
      })
    );
    expect(aliases.get('course_embeddings')).toBe('course_embeddings_v7');
    expect(aliases.has('qdrant_restore_drill_alias_20260711_nonce')).toBe(false);
    expect(collections).toEqual(new Set(['course_embeddings_v7']));
    expect(client.deleteCollection).toHaveBeenCalledWith('qdrant_restore_drill_20260711_nonce');
    expect(JSON.parse(await readFile(result.evidencePath, 'utf8'))).toMatchObject({
      status: 'passed',
      stable_alias_before: 'course_embeddings_v7',
      stable_alias_after: 'course_embeddings_v7',
      cleanup: { alias: 'deleted', collection: 'deleted' },
    });
    const metricsPath = join(metricsDirectory, 'megacampus_qdrant_recovery.prom');
    expect(await readFile(metricsPath, 'utf8')).toContain(
      'megacampus_qdrant_last_successful_restore_drill_unixtime_seconds 1783771200'
    );
    expect((await stat(metricsPath)).mode & 0o777).toBe(0o644);
    expect((await stat(join(directory, 'metrics-state.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(result.evidencePath)).mode & 0o777).toBe(0o600);
    await rm(directory, { recursive: true, force: true });
  });

  it('retains redacted failure and cleanup evidence while deleting only owned resources', async () => {
    const directory = await mkdtemp(join('/tmp', 'mc2-qdrant-restore-failure-'));
    const metricsDirectory = await createSharedMetricsDirectory(directory);
    const collections = new Set(['course_embeddings_v7']);
    const client = {
      getAliases: vi.fn(() =>
        Promise.resolve({
          aliases: [{ alias_name: 'course_embeddings', collection_name: 'course_embeddings_v7' }],
        })
      ),
      getCollections: vi.fn(() =>
        Promise.resolve({ collections: [...collections].map(name => ({ name })) })
      ),
      recoverSnapshot: vi.fn((name: string) => {
        collections.add(name);
        return Promise.resolve(true);
      }),
      updateCollectionAliases: vi.fn(() => Promise.resolve(true)),
      deleteCollection: vi.fn(() => Promise.reject(new Error('cleanup failed secret-value'))),
    };

    await expect(
      runRestoreDrill({
        client: client as never,
        manifest: MANIFEST,
        probe: PROBE,
        apiKey: 'secret-value',
        transportBaseUrl: 'http://127.0.0.1:6333',
        stableAlias: 'course_embeddings',
        targetCollection: 'qdrant_restore_drill_owned',
        drillAlias: 'qdrant_restore_drill_alias_owned',
        evidenceDirectory: join(directory, 'evidence'),
        metricStatePath: join(directory, 'metrics-state.json'),
        metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
        lockPath: join(directory, 'recovery.lock'),
        now: new Date('2026-07-11T12:00:00.000Z'),
        verifyRecovered: vi.fn(() => Promise.reject(new Error('verification failed secret-value'))),
      })
    ).rejects.toThrow(/restore drill failed/iu);

    expect(client.deleteCollection).toHaveBeenCalledTimes(1);
    expect(client.deleteCollection).toHaveBeenCalledWith('qdrant_restore_drill_owned');
    expect(client.deleteCollection).not.toHaveBeenCalledWith('course_embeddings_v7');
    const evidenceFiles = await readdir(join(directory, 'evidence'));
    const evidence = await readFile(join(directory, 'evidence', evidenceFiles[0]), 'utf8');
    expect(evidence).toContain('cleanup failed [REDACTED]');
    expect(evidence).toContain('verification failed [REDACTED]');
    expect(evidence).not.toContain('secret-value');
    expect(
      await readFile(join(metricsDirectory, 'megacampus_qdrant_recovery.prom'), 'utf8')
    ).toContain('megacampus_qdrant_restore_drill_failures_total 1');
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['create-alias', 'delete-alias', 'delete-collection'] as const)(
    'fails closed when %s returns false',
    async falseOperation => {
      const directory = await mkdtemp(join('/tmp', `mc2-qdrant-${falseOperation}-`));
      const metricsDirectory = await createSharedMetricsDirectory(directory);
      const stableAlias = 'course_embeddings';
      const stablePhysical = 'course_embeddings_v7';
      const target = `qdrant_restore_drill_${falseOperation.replaceAll('-', '_')}`;
      const drillAlias = `qdrant_restore_drill_alias_${falseOperation.replaceAll('-', '_')}`;
      const aliases = new Map([[stableAlias, stablePhysical]]);
      const collections = new Set([stablePhysical]);
      const client = {
        getAliases: vi.fn(() =>
          Promise.resolve({
            aliases: [...aliases].map(([alias_name, collection_name]) => ({
              alias_name,
              collection_name,
            })),
          })
        ),
        getCollections: vi.fn(() =>
          Promise.resolve({ collections: [...collections].map(name => ({ name })) })
        ),
        recoverSnapshot: vi.fn((name: string) => {
          collections.add(name);
          return Promise.resolve(true);
        }),
        updateCollectionAliases: vi.fn(({ actions }: { actions: Array<Record<string, never>> }) => {
          const action = actions[0] as {
            create_alias?: { alias_name: string; collection_name: string };
            delete_alias?: { alias_name: string };
          };
          if (action.create_alias) {
            if (falseOperation === 'create-alias') return Promise.resolve(false);
            aliases.set(action.create_alias.alias_name, action.create_alias.collection_name);
          }
          if (action.delete_alias) {
            if (falseOperation === 'delete-alias') return Promise.resolve(false);
            aliases.delete(action.delete_alias.alias_name);
          }
          return Promise.resolve(true);
        }),
        deleteCollection: vi.fn((name: string) => {
          if (falseOperation === 'delete-collection') return Promise.resolve(false);
          return Promise.resolve(collections.delete(name));
        }),
      };

      await expect(
        runRestoreDrill({
          client: client as never,
          manifest: MANIFEST,
          probe: PROBE,
          apiKey: 'local-test-key',
          transportBaseUrl: 'http://127.0.0.1:6333',
          stableAlias,
          targetCollection: target,
          drillAlias,
          evidenceDirectory: join(directory, 'evidence'),
          metricStatePath: join(directory, 'metrics-state.json'),
          metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
          lockPath: join(directory, 'recovery.lock'),
          verifyRecovered: vi.fn(() =>
            Promise.resolve({
              schema: 'pass' as const,
              count: 'pass' as const,
              dense: 'pass' as const,
              ru_bm25: 'pass' as const,
              en_bm25: 'pass' as const,
              formula_priority: 'pass' as const,
              tenant_course_isolation: 'pass' as const,
            })
          ),
        })
      ).rejects.toThrow(/restore drill failed/iu);

      const evidenceFiles = await readdir(join(directory, 'evidence'));
      const evidence = JSON.parse(
        await readFile(join(directory, 'evidence', evidenceFiles[0]), 'utf8')
      ) as {
        status: string;
        stable_alias_before: string;
        stable_alias_after: string;
        cleanup_failures: string[];
      };
      expect(evidence.status).toBe('failed');
      expect(evidence.stable_alias_before).toBe(stablePhysical);
      expect(evidence.stable_alias_after).toBe(stablePhysical);
      expect(evidence.cleanup_failures.join(' ')).toMatch(/false|still exists/iu);
      expect(
        await readFile(join(metricsDirectory, 'megacampus_qdrant_recovery.prom'), 'utf8')
      ).toContain('megacampus_qdrant_restore_drill_failures_total 1');
      await rm(directory, { recursive: true, force: true });
    }
  );

  it('fails when cleanup reports success but owned resources still exist', async () => {
    const directory = await mkdtemp(join('/tmp', 'mc2-qdrant-cleanup-postcondition-'));
    const metricsDirectory = await createSharedMetricsDirectory(directory);
    const aliases = new Map([['course_embeddings', 'course_embeddings_v7']]);
    const collections = new Set(['course_embeddings_v7']);
    const target = 'qdrant_restore_drill_postcondition';
    const drillAlias = 'qdrant_restore_drill_alias_postcondition';
    const client = {
      getAliases: vi.fn(() =>
        Promise.resolve({
          aliases: [...aliases].map(([alias_name, collection_name]) => ({
            alias_name,
            collection_name,
          })),
        })
      ),
      getCollections: vi.fn(() =>
        Promise.resolve({ collections: [...collections].map(name => ({ name })) })
      ),
      recoverSnapshot: vi.fn((name: string) => {
        collections.add(name);
        return Promise.resolve(true);
      }),
      updateCollectionAliases: vi.fn(({ actions }: { actions: Array<Record<string, never>> }) => {
        const action = actions[0] as {
          create_alias?: { alias_name: string; collection_name: string };
        };
        if (action.create_alias) {
          aliases.set(action.create_alias.alias_name, action.create_alias.collection_name);
        }
        return Promise.resolve(true);
      }),
      deleteCollection: vi.fn(() => Promise.resolve(true)),
    };

    await expect(
      runRestoreDrill({
        client: client as never,
        manifest: MANIFEST,
        probe: PROBE,
        apiKey: 'local-test-key',
        transportBaseUrl: 'http://127.0.0.1:6333',
        stableAlias: 'course_embeddings',
        targetCollection: target,
        drillAlias,
        evidenceDirectory: join(directory, 'evidence'),
        metricStatePath: join(directory, 'metrics-state.json'),
        metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
        lockPath: join(directory, 'recovery.lock'),
        verifyRecovered: vi.fn(() =>
          Promise.resolve({
            schema: 'pass' as const,
            count: 'pass' as const,
            dense: 'pass' as const,
            ru_bm25: 'pass' as const,
            en_bm25: 'pass' as const,
            formula_priority: 'pass' as const,
            tenant_course_isolation: 'pass' as const,
          })
        ),
      })
    ).rejects.toThrow(/restore drill failed/iu);

    const evidenceFiles = await readdir(join(directory, 'evidence'));
    const evidence = await readFile(join(directory, 'evidence', evidenceFiles[0]), 'utf8');
    expect(evidence).toMatch(/drill alias.*still exists/iu);
    expect(evidence).toMatch(/drill collection.*still exists/iu);
    expect(aliases.get('course_embeddings')).toBe('course_embeddings_v7');
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['missing', 'wrong-mode'] as const)(
    'fails before restore client mutation when the shared metrics directory is %s',
    async directoryState => {
      const directory = await mkdtemp(join('/tmp', `mc2-qdrant-restore-${directoryState}-`));
      const metricsDirectory = join(directory, 'qdrant-metrics');
      if (directoryState === 'wrong-mode') {
        await mkdir(metricsDirectory, { mode: 0o700 });
      }
      const client = {
        getAliases: vi.fn(),
        getCollections: vi.fn(),
        recoverSnapshot: vi.fn(),
        updateCollectionAliases: vi.fn(),
        deleteCollection: vi.fn(),
      };

      await expect(
        runRestoreDrill({
          client: client as never,
          manifest: MANIFEST,
          probe: PROBE,
          apiKey: 'local-test-key',
          transportBaseUrl: 'http://127.0.0.1:6333',
          stableAlias: 'course_embeddings',
          targetCollection: 'qdrant_restore_drill_shared_dir',
          drillAlias: 'qdrant_restore_drill_alias_shared_dir',
          evidenceDirectory: join(directory, 'evidence'),
          metricStatePath: join(directory, 'metrics-state.json'),
          metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
          lockPath: join(directory, 'recovery.lock'),
        })
      ).rejects.toThrow(/shared metrics directory/iu);

      expect(client.getAliases).not.toHaveBeenCalled();
      expect(client.getCollections).not.toHaveBeenCalled();
      expect(client.recoverSnapshot).not.toHaveBeenCalled();
      if (directoryState === 'missing') {
        await expect(stat(metricsDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
      } else {
        expect((await stat(metricsDirectory)).mode & 0o7777).toBe(0o700);
      }
      await rm(directory, { recursive: true, force: true });
    }
  );
});
