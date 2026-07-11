import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
  mismatched_course_id: 'course-en',
};

describe('Qdrant restore drill', () => {
  it('verifies schema, count, dense, RU/EN BM25, Formula priority, and isolation through alias', async () => {
    const query = vi.fn((_collection: string, request: Record<string, unknown>) => {
      const serialized = JSON.stringify(request);
      if (serialized.includes('course-en')) return Promise.resolve({ points: [] });
      if (serialized.includes('formula_fixture')) {
        return Promise.resolve({
          points: [
            {
              score: 1.2,
              payload: {
                document_priority: 'CORE',
                organization_id: 'org-ru',
                course_id: 'course-ru',
              },
            },
            {
              score: 1,
              payload: {
                document_priority: 'SUPPLEMENTARY',
                organization_id: 'org-ru',
                course_id: 'course-ru',
              },
            },
          ],
        });
      }
      return Promise.resolve({
        points: [{ score: 1, payload: { organization_id: 'org-ru', course_id: 'course-ru' } }],
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
    expect(query).toHaveBeenCalledTimes(5);
    expect(
      query.mock.calls.every(
        ([collection]) => collection === 'qdrant_restore_drill_alias_20260711_nonce'
      )
    ).toBe(true);
  });

  it('recovers by authenticated supported transport, recreates drill alias, and preserves stable alias', async () => {
    const directory = await mkdtemp(join('/tmp', 'mc2-qdrant-restore-'));
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
      metricsPath: join(directory, 'metrics.prom'),
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
    expect(await readFile(join(directory, 'metrics.prom'), 'utf8')).toContain(
      'megacampus_qdrant_last_successful_restore_drill_unixtime_seconds 1783771200'
    );
    await rm(directory, { recursive: true, force: true });
  });

  it('retains redacted failure and cleanup evidence while deleting only owned resources', async () => {
    const directory = await mkdtemp(join('/tmp', 'mc2-qdrant-restore-failure-'));
    const client = {
      getAliases: vi.fn(() =>
        Promise.resolve({
          aliases: [{ alias_name: 'course_embeddings', collection_name: 'course_embeddings_v7' }],
        })
      ),
      getCollections: vi.fn(() =>
        Promise.resolve({ collections: [{ name: 'course_embeddings_v7' }] })
      ),
      recoverSnapshot: vi.fn(() => Promise.resolve(true)),
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
        metricsPath: join(directory, 'metrics.prom'),
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
    expect(await readFile(join(directory, 'metrics.prom'), 'utf8')).toContain(
      'megacampus_qdrant_restore_drill_failures_total 1'
    );
    await rm(directory, { recursive: true, force: true });
  });
});
