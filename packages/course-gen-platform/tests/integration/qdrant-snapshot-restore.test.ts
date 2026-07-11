import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';
import { ensureCourseEmbeddingsCollection } from '../../src/shared/qdrant/collection-manager';
import { COLLECTION_CREATE_PARAMS } from '../../src/shared/qdrant/collection-schema';
import { createBm25Document } from '../../src/shared/qdrant/config';
import { runRestoreDrill, type RecoveryProbe } from '../../tools/qdrant/restore-drill';
import { runSnapshotOperation, type SnapshotOperationResult } from '../../tools/qdrant/snapshot';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Qdrant recovery integration`);
  return value;
}

function unitVector(axis: number): number[] {
  const vector = Array<number>(768).fill(0);
  vector[axis] = 1;
  return vector;
}

const ORG = '81000000-0000-4000-8000-000000000001';
const FOREIGN_ORG = '81000000-0000-4000-8000-000000000002';
const COURSE = '82000000-0000-4000-8000-000000000001';
const FOREIGN_COURSE = '82000000-0000-4000-8000-000000000002';
const RU_CORE_POINT = '83000000-0000-4000-8000-000000000001';
const RU_SUPPLEMENTARY_POINT = '83000000-0000-4000-8000-000000000002';
const EN_CORE_POINT = '83000000-0000-4000-8000-000000000003';
const RU_CORE_DOCUMENT = '84000000-0000-4000-8000-000000000001';
const RU_SUPPLEMENTARY_DOCUMENT = '84000000-0000-4000-8000-000000000002';
const EN_CORE_DOCUMENT = '84000000-0000-4000-8000-000000000003';
const RU_CORE_CHUNK = '85000000-0000-4000-8000-000000000001';
const RU_SUPPLEMENTARY_CHUNK = '85000000-0000-4000-8000-000000000002';
const EN_CORE_CHUNK = '85000000-0000-4000-8000-000000000003';
const RU_CORE_CONTENT = 'ru_restore_probe_unique formula_fixture neutral evidence';
const RU_SUPPLEMENTARY_CONTENT = 'formula_fixture formula_fixture supplementary evidence';
const EN_CORE_CONTENT = 'en_restore_probe_unique controlled english evidence';
const FORMULA_VECTOR = unitVector(0);
const CONTEXT_VECTOR = unitVector(1);
const SUPPLEMENTARY_VECTOR = (() => {
  const vector = Array<number>(768).fill(0);
  vector[0] = 0.99;
  vector[1] = Math.sqrt(1 - 0.99 ** 2);
  return vector;
})();

const PROBE: RecoveryProbe = {
  dense_vector: FORMULA_VECTOR,
  ru_query: 'ru_restore_probe_unique',
  en_query: 'en_restore_probe_unique',
  formula_query: 'formula_fixture',
  organization_id: ORG,
  course_id: COURSE,
  mismatched_organization_id: FOREIGN_ORG,
  mismatched_course_id: FOREIGN_COURSE,
  expected_dense: {
    point_id: RU_CORE_POINT,
    document_id: RU_CORE_DOCUMENT,
    chunk_id: RU_CORE_CHUNK,
    content: RU_CORE_CONTENT,
  },
  expected_ru_bm25: {
    point_id: RU_CORE_POINT,
    document_id: RU_CORE_DOCUMENT,
    chunk_id: RU_CORE_CHUNK,
    content: RU_CORE_CONTENT,
  },
  expected_en_bm25: {
    point_id: EN_CORE_POINT,
    document_id: EN_CORE_DOCUMENT,
    chunk_id: EN_CORE_CHUNK,
    content: EN_CORE_CONTENT,
  },
  expected_formula_order: [
    {
      point_id: RU_CORE_POINT,
      document_id: RU_CORE_DOCUMENT,
      chunk_id: RU_CORE_CHUNK,
      content: RU_CORE_CONTENT,
    },
    {
      point_id: RU_SUPPLEMENTARY_POINT,
      document_id: RU_SUPPLEMENTARY_DOCUMENT,
      chunk_id: RU_SUPPLEMENTARY_CHUNK,
      content: RU_SUPPLEMENTARY_CONTENT,
    },
  ],
};

describe.sequential('Qdrant 1.18.2 snapshot and restore recovery', () => {
  const runId = randomUUID().replaceAll('-', '_');
  const alias = `recovery_alias_${runId}`;
  const physical = `recovery_physical_${runId}`;
  const ownedCollections = new Set<string>();
  const ownedAliases = new Set<string>([alias]);
  let client: QdrantClient;
  let apiKey: string;
  let qdrantUrl: string;
  let directory: string;
  let snapshotResult: SnapshotOperationResult;

  beforeAll(async () => {
    apiKey = requireEnv('QDRANT_API_KEY');
    qdrantUrl = requireEnv('QDRANT_URL');
    directory = await mkdtemp(join('/tmp', 'mc2-qdrant-recovery-integration-'));
    client = new QdrantClient({
      url: qdrantUrl,
      apiKey,
      checkCompatibility: false,
      timeout: 30_000,
    });
    expect((await client.versionInfo()).version).toBe('1.18.2');
    const ensured = await ensureCourseEmbeddingsCollection({
      client,
      aliasName: alias,
      physicalName: physical,
    });
    if (!ensured.ok) throw new Error(ensured.mismatches.join('; '));
    ownedCollections.add(physical);

    await client.upsert(alias, {
      wait: true,
      points: [
        {
          id: RU_CORE_POINT,
          vector: {
            dense: FORMULA_VECTOR,
            sparse: createBm25Document(RU_CORE_CONTENT),
          },
          payload: {
            organization_id: ORG,
            course_id: COURSE,
            document_id: RU_CORE_DOCUMENT,
            chunk_id: RU_CORE_CHUNK,
            content: RU_CORE_CONTENT,
            document_priority: 'CORE',
            document_weight: 1,
          },
        },
        {
          id: RU_SUPPLEMENTARY_POINT,
          vector: {
            dense: SUPPLEMENTARY_VECTOR,
            sparse: createBm25Document(RU_SUPPLEMENTARY_CONTENT),
          },
          payload: {
            organization_id: ORG,
            course_id: COURSE,
            document_id: RU_SUPPLEMENTARY_DOCUMENT,
            chunk_id: RU_SUPPLEMENTARY_CHUNK,
            content: RU_SUPPLEMENTARY_CONTENT,
            document_priority: 'SUPPLEMENTARY',
            document_weight: 0.5,
          },
        },
        {
          id: EN_CORE_POINT,
          vector: {
            dense: CONTEXT_VECTOR,
            sparse: createBm25Document(EN_CORE_CONTENT),
          },
          payload: {
            organization_id: ORG,
            course_id: COURSE,
            document_id: EN_CORE_DOCUMENT,
            chunk_id: EN_CORE_CHUNK,
            content: EN_CORE_CONTENT,
            document_priority: 'CORE',
            document_weight: 1,
          },
        },
        {
          id: '83000000-0000-4000-8000-000000000004',
          vector: {
            dense: CONTEXT_VECTOR,
            sparse: createBm25Document('photosynthesis supplementary english context'),
          },
          payload: {
            organization_id: ORG,
            course_id: COURSE,
            document_id: '84000000-0000-4000-8000-000000000004',
            chunk_id: '85000000-0000-4000-8000-000000000004',
            content: 'photosynthesis supplementary english context',
            document_priority: 'SUPPLEMENTARY',
            document_weight: 0.5,
          },
        },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    if (client) {
      const aliases = await client.getAliases().catch(() => ({ aliases: [] }));
      for (const candidate of aliases.aliases) {
        if (ownedAliases.has(candidate.alias_name)) {
          await client
            .updateCollectionAliases({
              actions: [{ delete_alias: { alias_name: candidate.alias_name } }],
            })
            .catch(() => undefined);
        }
      }
      const collections = await client.getCollections().catch(() => ({ collections: [] }));
      for (const candidate of collections.collections) {
        if (ownedCollections.has(candidate.name)) {
          await client.deleteCollection(candidate.name).catch(() => undefined);
        }
      }
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  }, 60_000);

  it('creates, lists, downloads, and checksums a durable snapshot manifest', async () => {
    snapshotResult = await runSnapshotOperation({
      client,
      logicalAlias: alias,
      qdrantUrl,
      apiKey,
      storageMode: 'local',
      remotePrefix: `integration/${physical}`,
      manifestDirectory: join(directory, 'manifests'),
      metricStatePath: join(directory, 'metrics-state.json'),
      metricsPath: join(directory, 'metrics.prom'),
      failureDirectory: join(directory, 'failures'),
      lockPath: join(directory, 'recovery.lock'),
    });

    expect(snapshotResult.manifest).toMatchObject({
      status: 'success',
      logical_alias: alias,
      physical_collection: physical,
      point_count: 4,
      server_version: '1.18.2',
      client_version: '1.18.0',
    });
    expect(snapshotResult.manifest.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(snapshotResult.manifest.sha256).toBe(snapshotResult.manifest.server_checksum);
    expect((await client.listSnapshots(physical)).map(item => item.name)).toContain(
      snapshotResult.manifest.snapshot_name
    );
    expect(await readFile(snapshotResult.manifestPath, 'utf8')).not.toContain(apiKey);
  }, 60_000);

  it('recovers, recreates an alias, verifies relevance/isolation, and cleans owned resources', async () => {
    const target = `qdrant_restore_drill_${runId}`;
    const drillAlias = `qdrant_restore_drill_alias_${runId}`;
    ownedCollections.add(target);
    ownedAliases.add(drillAlias);
    const stableBefore = (await client.getAliases()).aliases.find(
      candidate => candidate.alias_name === alias
    )?.collection_name;

    let result;
    try {
      result = await runRestoreDrill({
        client,
        manifest: snapshotResult.manifest,
        probe: PROBE,
        apiKey,
        transportBaseUrl: 'http://127.0.0.1:6333',
        stableAlias: alias,
        targetCollection: target,
        drillAlias,
        evidenceDirectory: join(directory, 'restore-evidence'),
        metricStatePath: join(directory, 'metrics-state.json'),
        metricsPath: join(directory, 'metrics.prom'),
        lockPath: join(directory, 'recovery.lock'),
      });
    } catch (error) {
      const files = await readdir(join(directory, 'restore-evidence'));
      const evidence = await readFile(join(directory, 'restore-evidence', files[0]), 'utf8');
      throw new Error(`Restore evidence: ${evidence}`, { cause: error });
    }

    expect(result.checks).toEqual({
      schema: 'pass',
      count: 'pass',
      dense: 'pass',
      ru_bm25: 'pass',
      en_bm25: 'pass',
      formula_priority: 'pass',
      tenant_course_isolation: 'pass',
    });
    expect((await client.getCollections()).collections.map(item => item.name)).not.toContain(
      target
    );
    expect((await client.getAliases()).aliases.map(item => item.alias_name)).not.toContain(
      drillAlias
    );
    expect(
      (await client.getAliases()).aliases.find(candidate => candidate.alias_name === alias)
        ?.collection_name
    ).toBe(stableBefore);
    expect(await readFile(result.evidencePath, 'utf8')).not.toContain(apiKey);
  }, 120_000);

  it('fails an intentional identity mismatch without leaking or altering the stable alias', async () => {
    const target = `qdrant_restore_drill_identity_mismatch_${runId}`;
    const drillAlias = `qdrant_restore_drill_alias_identity_mismatch_${runId}`;
    const evidenceDirectory = join(directory, 'identity-mismatch-evidence');
    ownedCollections.add(target);
    ownedAliases.add(drillAlias);
    const stableBefore = (await client.getAliases()).aliases.find(
      candidate => candidate.alias_name === alias
    )?.collection_name;

    await expect(
      runRestoreDrill({
        client,
        manifest: snapshotResult.manifest,
        probe: {
          ...PROBE,
          expected_dense: {
            ...PROBE.expected_dense,
            content: 'intentional wrong dense content',
          },
        },
        apiKey,
        transportBaseUrl: 'http://127.0.0.1:6333',
        stableAlias: alias,
        targetCollection: target,
        drillAlias,
        evidenceDirectory,
        metricStatePath: join(directory, 'metrics-state.json'),
        metricsPath: join(directory, 'metrics.prom'),
        lockPath: join(directory, 'recovery.lock'),
      })
    ).rejects.toThrow(/restore drill failed/iu);

    expect(
      (await client.getAliases()).aliases.find(candidate => candidate.alias_name === alias)
        ?.collection_name
    ).toBe(stableBefore);
    expect((await client.getCollections()).collections.map(item => item.name)).not.toContain(
      target
    );
    expect((await client.getAliases()).aliases.map(item => item.alias_name)).not.toContain(
      drillAlias
    );
    const evidenceFiles = await readdir(evidenceDirectory);
    const evidence = await readFile(join(evidenceDirectory, evidenceFiles[0]), 'utf8');
    expect(evidence).toMatch(/dense.*identity\/content mismatch/iu);
    expect(evidence).not.toContain(apiKey);
    expect(evidence).not.toContain(RU_CORE_CONTENT);
    expect(evidence).not.toContain('intentional wrong dense content');
  }, 120_000);

  it('rejects corrupt checksum and wrong transport key without changing the stable alias', async () => {
    const stableBefore = (await client.getAliases()).aliases.find(
      candidate => candidate.alias_name === alias
    )?.collection_name;
    const location = `http://127.0.0.1:6333/collections/${encodeURIComponent(physical)}/snapshots/${encodeURIComponent(snapshotResult.manifest.snapshot_name)}`;

    for (const [suffix, checksum, transportKey] of [
      ['corrupt', '0'.repeat(64), apiKey],
      ['wrong_key', snapshotResult.manifest.sha256!, 'wrong-local-key'],
    ] as const) {
      const target = `qdrant_restore_drill_${suffix}_${runId}`;
      ownedCollections.add(target);
      let succeeded = false;
      try {
        succeeded = await client.recoverSnapshot(target, {
          location,
          priority: 'snapshot',
          checksum,
          api_key: transportKey,
        });
      } catch {
        succeeded = false;
      }
      expect(succeeded).toBe(false);
    }

    expect(
      (await client.getAliases()).aliases.find(candidate => candidate.alias_name === alias)
        ?.collection_name
    ).toBe(stableBefore);
  }, 120_000);

  it('refuses a duplicate target and never deletes the pre-existing collection', async () => {
    const target = `qdrant_restore_drill_duplicate_${runId}`;
    const drillAlias = `qdrant_restore_drill_alias_duplicate_${runId}`;
    ownedCollections.add(target);
    await client.createCollection(target, COLLECTION_CREATE_PARAMS);

    await expect(
      runRestoreDrill({
        client,
        manifest: snapshotResult.manifest,
        probe: PROBE,
        apiKey,
        transportBaseUrl: 'http://127.0.0.1:6333',
        stableAlias: alias,
        targetCollection: target,
        drillAlias,
        evidenceDirectory: join(directory, 'duplicate-evidence'),
        metricStatePath: join(directory, 'metrics-state.json'),
        metricsPath: join(directory, 'metrics.prom'),
        lockPath: join(directory, 'recovery.lock'),
      })
    ).rejects.toThrow(/restore drill failed/iu);

    expect((await client.getCollections()).collections.map(item => item.name)).toContain(target);
  }, 60_000);
});
