import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
const MANAGED_RECREATE = process.env.QDRANT_TEST_MANAGED_RECREATE === '1';

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
  let snapshotTransportUrl: string;
  let directory: string;
  let metricsDirectory: string;
  let snapshotResult: SnapshotOperationResult;

  function runDocker(args: string[]): string {
    const result = spawnSync('docker', args, { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`Managed Qdrant Docker command failed: ${result.stderr.trim()}`);
    }
    return result.stdout.trim();
  }

  async function replaceManagedQdrant(deleteVolume = false): Promise<void> {
    const containerName = requireEnv('QDRANT_TEST_CONTAINER_NAME');
    const volumeName = requireEnv('QDRANT_TEST_VOLUME_NAME');
    const image = requireEnv('QDRANT_TEST_IMAGE');
    const hostPort = requireEnv('QDRANT_TEST_HOST_PORT');
    const wrapperPath = requireEnv('QDRANT_TEST_WRAPPER_PATH');
    const adminKeyPath = requireEnv('QDRANT_TEST_ADMIN_KEY_FILE');
    const readOnlyKeyPath = requireEnv('QDRANT_TEST_READ_ONLY_KEY_FILE');
    if (!/^mc2-q12-[a-z0-9_-]+$/u.test(containerName)) {
      throw new Error('Managed Qdrant container name is outside the owned test namespace');
    }
    if (!/^mc2_q12_[a-z0-9_-]+$/u.test(volumeName)) {
      throw new Error('Managed Qdrant volume name is outside the owned test namespace');
    }
    if (!/^\d{4,5}$/u.test(hostPort)) throw new Error('Managed Qdrant host port is invalid');

    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    if (deleteVolume) {
      spawnSync('docker', ['volume', 'rm', '-f', volumeName], { stdio: 'ignore' });
      runDocker(['volume', 'create', volumeName]);
    }
    runDocker([
      'run',
      '-d',
      '--name',
      containerName,
      '--platform',
      'linux/amd64',
      '--add-host',
      'host.docker.internal:host-gateway',
      '-p',
      `127.0.0.1:${hostPort}:6333`,
      '--entrypoint',
      '/opt/megacampus/qdrant-secret-entrypoint.sh',
      '-e',
      'QDRANT_API_KEY_FILE=/run/secrets/admin',
      '-e',
      'QDRANT_READ_ONLY_API_KEY_FILE=/run/secrets/read-only',
      '-e',
      'QDRANT_SNAPSHOT_STORAGE=local',
      '-e',
      'QDRANT__STORAGE__SNAPSHOTS_PATH=/qdrant/storage/snapshots',
      '--mount',
      `type=volume,source=${volumeName},target=/qdrant/storage`,
      '--mount',
      `type=bind,source=${wrapperPath},target=/opt/megacampus/qdrant-secret-entrypoint.sh,readonly`,
      '--mount',
      `type=bind,source=${adminKeyPath},target=/run/secrets/admin,readonly`,
      '--mount',
      `type=bind,source=${readOnlyKeyPath},target=/run/secrets/read-only,readonly`,
      image,
    ]);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(`${qdrantUrl}/readyz`);
        if (response.ok) break;
      } catch {
        // The replacement container is not accepting connections yet.
      }
      if (attempt === 59) throw new Error('Managed Qdrant replacement did not become ready');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    client = new QdrantClient({
      url: qdrantUrl,
      apiKey,
      checkCompatibility: false,
      timeout: 30_000,
    });
    expect((await client.versionInfo()).version).toBe('1.18.2');
  }

  beforeAll(async () => {
    apiKey = requireEnv('QDRANT_API_KEY');
    qdrantUrl = requireEnv('QDRANT_URL');
    const transport = new URL(requireEnv('QDRANT_SNAPSHOT_TRANSPORT_URL'));
    if (
      transport.protocol !== 'http:' ||
      transport.username ||
      transport.password ||
      transport.pathname !== '/' ||
      transport.search ||
      transport.hash
    ) {
      throw new Error('QDRANT_SNAPSHOT_TRANSPORT_URL must be a credential-free HTTP origin');
    }
    snapshotTransportUrl = transport.origin;
    if (MANAGED_RECREATE) {
      expect(transport.hostname).toBe('host.docker.internal');
      expect(transport.port).not.toBe('6333');
    }
    directory = await mkdtemp(join('/tmp', 'mc2-qdrant-recovery-integration-'));
    metricsDirectory = join(directory, 'qdrant-metrics');
    await mkdir(metricsDirectory, { mode: 0o700 });
    await chmod(metricsDirectory, 0o3775);
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
      manifestDirectory: join(directory, 'manifests'),
      metricStatePath: join(directory, 'metrics-state.json'),
      metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
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
    expect(snapshotResult.manifest.storage_mode).toBe('local');
    expect(snapshotResult.manifest).not.toHaveProperty('remote_object');
    expect((await client.listSnapshots(physical)).map(item => item.name)).toContain(
      snapshotResult.manifest.snapshot_name
    );
    expect(await readFile(snapshotResult.manifestPath, 'utf8')).not.toContain(apiKey);
  }, 60_000);

  it.runIf(MANAGED_RECREATE)(
    'keeps the checksummed snapshot after replacing the pinned wrapper container',
    async () => {
      await replaceManagedQdrant();

      const persisted = (await client.listSnapshots(physical)).find(
        item => item.name === snapshotResult.manifest.snapshot_name
      );
      expect(persisted).toMatchObject({
        name: snapshotResult.manifest.snapshot_name,
        checksum: snapshotResult.manifest.server_checksum,
      });
    },
    120_000
  );

  it('recovers, recreates an alias, verifies relevance/isolation, and cleans owned resources', async () => {
    const target = `qdrant_restore_drill_${runId}`;
    const drillAlias = `qdrant_restore_drill_alias_${runId}`;
    ownedCollections.add(target);
    ownedAliases.add(drillAlias);
    const stableBefore = (await client.getAliases()).aliases.find(
      candidate => candidate.alias_name === alias
    )?.collection_name;
    const recoverSpy = vi.spyOn(client, 'recoverSnapshot');

    let result;
    try {
      result = await runRestoreDrill({
        client,
        manifest: snapshotResult.manifest,
        probe: PROBE,
        apiKey,
        transportBaseUrl: snapshotTransportUrl,
        stableAlias: alias,
        targetCollection: target,
        drillAlias,
        evidenceDirectory: join(directory, 'restore-evidence'),
        metricStatePath: join(directory, 'metrics-state.json'),
        metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
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
    expect(recoverSpy).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        location: `${snapshotTransportUrl}/collections/${encodeURIComponent(physical)}/snapshots/${encodeURIComponent(snapshotResult.manifest.snapshot_name)}`,
      })
    );
    recoverSpy.mockRestore();
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
        transportBaseUrl: snapshotTransportUrl,
        stableAlias: alias,
        targetCollection: target,
        drillAlias,
        evidenceDirectory,
        metricStatePath: join(directory, 'metrics-state.json'),
        metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
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
    const location = `${snapshotTransportUrl}/collections/${encodeURIComponent(physical)}/snapshots/${encodeURIComponent(snapshotResult.manifest.snapshot_name)}`;

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
        transportBaseUrl: snapshotTransportUrl,
        stableAlias: alias,
        targetCollection: target,
        drillAlias,
        evidenceDirectory: join(directory, 'duplicate-evidence'),
        metricStatePath: join(directory, 'metrics-state.json'),
        metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
        lockPath: join(directory, 'recovery.lock'),
      })
    ).rejects.toThrow(/restore drill failed/iu);

    expect((await client.getCollections()).collections.map(item => item.name)).toContain(target);
  }, 60_000);

  it.runIf(MANAGED_RECREATE)(
    'fails visibly when the owned named volume and its local snapshot are deleted',
    async () => {
      await replaceManagedQdrant(true);
      const ensured = await ensureCourseEmbeddingsCollection({
        client,
        aliasName: alias,
        physicalName: physical,
      });
      if (!ensured.ok) throw new Error(ensured.mismatches.join('; '));

      expect(await client.listSnapshots(physical)).toEqual([]);
      const target = `qdrant_restore_drill_missing_volume_${runId}`;
      const drillAlias = `qdrant_restore_drill_alias_missing_volume_${runId}`;
      const evidenceDirectory = join(directory, 'missing-volume-evidence');
      ownedCollections.add(target);
      ownedAliases.add(drillAlias);

      await expect(
        runRestoreDrill({
          client,
          manifest: snapshotResult.manifest,
          probe: PROBE,
          apiKey,
          transportBaseUrl: snapshotTransportUrl,
          stableAlias: alias,
          targetCollection: target,
          drillAlias,
          evidenceDirectory,
          metricStatePath: join(directory, 'metrics-state.json'),
          metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
          lockPath: join(directory, 'recovery.lock'),
        })
      ).rejects.toThrow(/restore drill failed/iu);

      const evidenceFiles = await readdir(evidenceDirectory);
      const evidence = JSON.parse(
        await readFile(join(evidenceDirectory, evidenceFiles[0]), 'utf8')
      ) as { status: string; cleanup_failures: string[] };
      expect(evidence.status).toBe('failed');
      expect(evidence.cleanup_failures).toEqual([]);
      const metricState = JSON.parse(
        await readFile(join(directory, 'metrics-state.json'), 'utf8')
      ) as { lastOperationSuccess: boolean; restoreFailuresTotal: number };
      expect(metricState.lastOperationSuccess).toBe(false);
      expect(metricState.restoreFailuresTotal).toBeGreaterThan(0);
      expect(
        (await client.getAliases()).aliases.find(candidate => candidate.alias_name === alias)
          ?.collection_name
      ).toBe(physical);
    },
    120_000
  );
});
