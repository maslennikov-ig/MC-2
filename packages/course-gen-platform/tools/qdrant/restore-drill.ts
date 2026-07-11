import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QdrantClient } from '@qdrant/js-client-rest';
import { verifyPhysicalCourseEmbeddingsCollection } from '../../src/shared/qdrant/collection-manager.js';
import { createBm25Document } from '../../src/shared/qdrant/config.js';
import {
  buildHybridPrefetch,
  buildPriorityFormula,
} from '../../src/shared/qdrant/search-operations.js';
import type { ResolvedSearchOptions } from '../../src/shared/qdrant/search-types.js';
import {
  acquireRecoveryLock,
  renderRecoveryMetrics,
  resolvePhysicalCollection,
  SNAPSHOT_MANIFEST_SCHEMA,
  writeAtomicText,
  type RecoveryMetricState,
  type SnapshotManifest,
} from './snapshot-recovery.js';

type RestoreClient = Pick<
  QdrantClient,
  | 'getAliases'
  | 'getCollections'
  | 'getCollection'
  | 'recoverSnapshot'
  | 'updateCollectionAliases'
  | 'deleteCollection'
  | 'query'
>;

export interface RecoveryProbe {
  dense_vector: number[];
  ru_query: string;
  en_query: string;
  formula_query: string;
  organization_id: string;
  course_id: string;
  mismatched_course_id: string;
}

export interface RecoveryChecks {
  schema: 'pass';
  count: 'pass';
  dense: 'pass';
  ru_bm25: 'pass';
  en_bm25: 'pass';
  formula_priority: 'pass';
  tenant_course_isolation: 'pass';
}

type VerifyPhysical = typeof verifyPhysicalCourseEmbeddingsCollection;

function requireProbe(probe: RecoveryProbe): void {
  if (
    probe.dense_vector.length === 0 ||
    probe.dense_vector.some(value => !Number.isFinite(value))
  ) {
    throw new Error('Recovery probe dense_vector must contain finite values');
  }
  for (const [name, value] of Object.entries(probe)) {
    if (name === 'dense_vector') continue;
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`Recovery probe ${name} is required`);
  }
  if (probe.course_id === probe.mismatched_course_id) {
    throw new Error('Recovery probe mismatched_course_id must differ from course_id');
  }
}

function scopedFilter(probe: RecoveryProbe, courseId = probe.course_id) {
  return {
    must: [
      { key: 'organization_id', match: { value: probe.organization_id } },
      { key: 'course_id', match: { value: courseId } },
    ],
  };
}

function assertScopedPoints(
  label: string,
  points: Awaited<ReturnType<RestoreClient['query']>>['points'],
  probe: RecoveryProbe
): void {
  if (points.length === 0) throw new Error(`${label} recovery probe returned no points`);
  if (
    points.some(
      point =>
        point.payload?.organization_id !== probe.organization_id ||
        point.payload?.course_id !== probe.course_id
    )
  ) {
    throw new Error(`${label} recovery probe crossed organization/course scope`);
  }
}

export async function verifyRecoveredCollection(options: {
  client: Pick<QdrantClient, 'getCollection' | 'query'>;
  physicalCollection: string;
  drillAlias: string;
  manifest: SnapshotManifest;
  probe: RecoveryProbe;
  verifyPhysical?: VerifyPhysical;
}): Promise<RecoveryChecks> {
  requireProbe(options.probe);
  const schema = await (options.verifyPhysical ?? verifyPhysicalCourseEmbeddingsCollection)({
    client: options.client as QdrantClient,
    physicalName: options.physicalCollection,
  });
  if (!schema.ok) throw new Error(`Recovered schema drift: ${schema.mismatches.join('; ')}`);

  const info = await options.client.getCollection(options.physicalCollection);
  if ((info.points_count ?? 0) !== options.manifest.point_count) {
    throw new Error(
      `Recovered point count mismatch: expected ${options.manifest.point_count}, received ${info.points_count ?? 0}`
    );
  }

  const dense = await options.client.query(options.drillAlias, {
    query: options.probe.dense_vector,
    using: 'dense',
    filter: scopedFilter(options.probe),
    limit: 3,
    with_payload: true,
  });
  assertScopedPoints('Dense', dense.points, options.probe);

  const russian = await options.client.query(options.drillAlias, {
    query: createBm25Document(options.probe.ru_query),
    using: 'sparse',
    filter: scopedFilter(options.probe),
    limit: 3,
    with_payload: true,
  });
  assertScopedPoints('RU BM25', russian.points, options.probe);

  const english = await options.client.query(options.drillAlias, {
    query: createBm25Document(options.probe.en_query),
    using: 'sparse',
    filter: scopedFilter(options.probe),
    limit: 3,
    with_payload: true,
  });
  assertScopedPoints('EN BM25', english.points, options.probe);

  const searchOptions: ResolvedSearchOptions = {
    limit: 2,
    score_threshold: 0,
    collection_name: options.drillAlias,
    enable_hybrid: true,
    include_payload: true,
    filters: {
      organization_id: options.probe.organization_id,
      course_id: options.probe.course_id,
    },
    enable_priority_boost: true,
    priority_boost_factor: 0.4,
    group_by_document: false,
    group_size: 2,
  };
  const formula = await options.client.query(options.drillAlias, {
    prefetch: {
      prefetch: buildHybridPrefetch(
        options.probe.formula_query,
        options.probe.dense_vector,
        searchOptions
      ),
      query: { rrf: {} },
      limit: 6,
    },
    query: buildPriorityFormula(0.4),
    limit: 2,
    with_payload: true,
  });
  assertScopedPoints('Formula', formula.points, options.probe);
  if (
    formula.points.length < 2 ||
    formula.points[0].payload?.document_priority !== 'CORE' ||
    formula.points[1].payload?.document_priority !== 'SUPPLEMENTARY' ||
    formula.points[0].score <= formula.points[1].score
  ) {
    throw new Error('Formula recovery probe did not preserve CORE priority ordering');
  }

  const mismatched = await options.client.query(options.drillAlias, {
    query: createBm25Document(options.probe.ru_query),
    using: 'sparse',
    filter: scopedFilter(options.probe, options.probe.mismatched_course_id),
    limit: 3,
    with_payload: true,
  });
  if (mismatched.points.length !== 0) {
    throw new Error('Recovery probe crossed tenant/course isolation boundary');
  }

  return {
    schema: 'pass',
    count: 'pass',
    dense: 'pass',
    ru_bm25: 'pass',
    en_bm25: 'pass',
    formula_priority: 'pass',
    tenant_course_isolation: 'pass',
  };
}

function initialMetrics(): RecoveryMetricState {
  return {
    snapshotFailuresTotal: 0,
    restoreFailuresTotal: 0,
    lockContentionsTotal: 0,
    lastOperationSuccess: false,
  };
}

async function readMetricState(path: string): Promise<RecoveryMetricState> {
  try {
    return {
      ...initialMetrics(),
      ...(JSON.parse(await readFile(path, 'utf8')) as Partial<RecoveryMetricState>),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initialMetrics();
    throw error;
  }
}

async function persistMetrics(
  statePath: string,
  metricsPath: string,
  state: RecoveryMetricState
): Promise<void> {
  await writeAtomicText(statePath, `${JSON.stringify(state, null, 2)}\n`);
  await writeAtomicText(metricsPath, renderRecoveryMetrics(state));
}

function redact(error: unknown, secrets: readonly string[]): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join('[REDACTED]');
  }
  return message.replace(/(api[_-]?key|secret|credential)=([^\s&]+)/giu, '$1=[REDACTED]');
}

function transportLocation(baseUrl: string, manifest: SnapshotManifest): string {
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Restore transport must use supported HTTP(S), not a raw storage URI');
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.pathname = `/collections/${encodeURIComponent(manifest.physical_collection)}/snapshots/${encodeURIComponent(manifest.snapshot_name)}`;
  return url.toString();
}

function validateOwnedNames(targetCollection: string, drillAlias: string): void {
  if (!/^qdrant_restore_drill_[a-zA-Z0-9_]+$/u.test(targetCollection)) {
    throw new Error('Restore target is not an owned drill collection name');
  }
  if (!/^qdrant_restore_drill_alias_[a-zA-Z0-9_]+$/u.test(drillAlias)) {
    throw new Error('Restore alias is not an owned drill alias name');
  }
}

export interface RestoreDrillOptions {
  client: RestoreClient;
  manifest: SnapshotManifest;
  probe: RecoveryProbe;
  apiKey: string;
  transportBaseUrl: string;
  stableAlias: string;
  targetCollection?: string;
  drillAlias?: string;
  evidenceDirectory: string;
  metricStatePath: string;
  metricsPath: string;
  lockPath: string;
  now?: Date;
  verifyRecovered?: typeof verifyRecoveredCollection;
  lockAlreadyHeld?: boolean;
}

export interface RestoreDrillResult {
  evidencePath: string;
  checks: RecoveryChecks;
}

export async function runRestoreDrill(options: RestoreDrillOptions): Promise<RestoreDrillResult> {
  if (options.manifest.schema_version !== SNAPSHOT_MANIFEST_SCHEMA) {
    throw new Error('Unsupported snapshot manifest schema');
  }
  const now = options.now ?? new Date();
  const nonce = randomUUID().replaceAll('-', '').slice(0, 12);
  const stamp = now
    .toISOString()
    .replaceAll(/[-:.TZ]/gu, '')
    .slice(0, 14);
  const targetCollection = options.targetCollection ?? `qdrant_restore_drill_${stamp}_${nonce}`;
  const drillAlias = options.drillAlias ?? `qdrant_restore_drill_alias_${stamp}_${nonce}`;
  validateOwnedNames(targetCollection, drillAlias);

  let state = await readMetricState(options.metricStatePath);
  let lock: Awaited<ReturnType<typeof acquireRecoveryLock>> | undefined;
  let stableBefore = '';
  let stableAfter = '';
  let aliasCreated = false;
  let collectionOwned = false;
  let checks: RecoveryChecks | undefined;
  let operationError: unknown;
  const cleanupFailures: string[] = [];
  const cleanup = { alias: 'not-created', collection: 'not-created' };

  try {
    if (!options.lockAlreadyHeld) {
      try {
        lock = await acquireRecoveryLock(options.lockPath);
      } catch (error) {
        state = { ...state, lockContentionsTotal: state.lockContentionsTotal + 1 };
        await persistMetrics(options.metricStatePath, options.metricsPath, state);
        throw error;
      }
    }

    const initialAliases = (await options.client.getAliases()).aliases;
    stableBefore = resolvePhysicalCollection(initialAliases, options.stableAlias);
    if (initialAliases.some(alias => alias.alias_name === drillAlias)) {
      throw new Error('Generated drill alias already exists');
    }
    const initialCollections = (await options.client.getCollections()).collections;
    if (initialCollections.some(collection => collection.name === targetCollection)) {
      throw new Error('Generated drill collection already exists');
    }
    collectionOwned = true;

    const recovered = await options.client.recoverSnapshot(targetCollection, {
      location: transportLocation(options.transportBaseUrl, options.manifest),
      priority: 'snapshot',
      checksum: options.manifest.sha256 ?? options.manifest.server_checksum,
      api_key: options.apiKey,
    });
    if (!recovered) throw new Error('Qdrant refused snapshot recovery');

    await options.client.updateCollectionAliases({
      actions: [{ create_alias: { collection_name: targetCollection, alias_name: drillAlias } }],
    });
    aliasCreated = true;
    checks = await (options.verifyRecovered ?? verifyRecoveredCollection)({
      client: options.client,
      physicalCollection: targetCollection,
      drillAlias,
      manifest: options.manifest,
      probe: options.probe,
    });
  } catch (error) {
    operationError = error;
  } finally {
    if (aliasCreated) {
      try {
        await options.client.updateCollectionAliases({
          actions: [{ delete_alias: { alias_name: drillAlias } }],
        });
        cleanup.alias = 'deleted';
      } catch (error) {
        cleanup.alias = 'failed';
        cleanupFailures.push(`drill alias cleanup: ${redact(error, [options.apiKey])}`);
      }
    }
    if (collectionOwned) {
      try {
        await options.client.deleteCollection(targetCollection);
        cleanup.collection = 'deleted';
      } catch (error) {
        cleanup.collection = 'failed';
        cleanupFailures.push(`drill collection cleanup: ${redact(error, [options.apiKey])}`);
      }
    }
    try {
      stableAfter = resolvePhysicalCollection(
        (await options.client.getAliases()).aliases,
        options.stableAlias
      );
      if (stableBefore && stableAfter !== stableBefore) {
        cleanupFailures.push(
          `stable alias changed from ${stableBefore} to ${stableAfter}; automatic mutation is forbidden`
        );
      }
    } catch (error) {
      cleanupFailures.push(`stable alias verification: ${redact(error, [options.apiKey])}`);
    }
    await lock?.release();
  }

  const passed =
    operationError === undefined && cleanupFailures.length === 0 && checks !== undefined;
  const evidence = {
    schema_version: 'megacampus.qdrant.restore-drill-evidence/v1',
    status: passed ? 'passed' : 'failed',
    occurred_at: now.toISOString(),
    snapshot_name: options.manifest.snapshot_name,
    source_physical_collection: options.manifest.physical_collection,
    target_collection: targetCollection,
    drill_alias: drillAlias,
    stable_alias: options.stableAlias,
    stable_alias_before: stableBefore,
    stable_alias_after: stableAfter,
    transport: 'authenticated_http',
    priority: 'snapshot',
    checks: checks ?? null,
    cleanup,
    ...(operationError === undefined ? {} : { error: redact(operationError, [options.apiKey]) }),
    cleanup_failures: cleanupFailures,
  };
  const evidencePath = join(
    options.evidenceDirectory,
    `${now.toISOString().replace(/[:.]/gu, '-')}-restore-drill.json`
  );
  await writeAtomicText(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  state = passed
    ? {
        ...state,
        lastOperationSuccess: true,
        lastSuccessfulRestoreDrillEpochSeconds: Math.floor(now.getTime() / 1000),
      }
    : {
        ...state,
        lastOperationSuccess: false,
        restoreFailuresTotal: state.restoreFailuresTotal + 1,
      };
  await persistMetrics(options.metricStatePath, options.metricsPath, state);

  if (!passed) {
    throw new Error(
      'Qdrant restore drill failed; redacted operation and cleanup evidence was retained'
    );
  }
  return { evidencePath, checks };
}

async function readOwnerOnly(path: string): Promise<string> {
  const metadata = await stat(path);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error('Recovery input file must be a regular owner-only file');
  }
  return readFile(path, 'utf8');
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function runCli(): Promise<void> {
  const qdrantUrl = requiredEnv('QDRANT_URL');
  const apiKey = (await readOwnerOnly(requiredEnv('QDRANT_API_KEY_FILE'))).trim();
  if (!apiKey || /[\r\n]/u.test(apiKey)) throw new Error('Qdrant credential file is invalid');
  const manifest = JSON.parse(
    await readOwnerOnly(requiredEnv('QDRANT_SNAPSHOT_MANIFEST_FILE'))
  ) as SnapshotManifest;
  const probe = JSON.parse(
    await readOwnerOnly(requiredEnv('QDRANT_RECOVERY_PROBE_FILE'))
  ) as RecoveryProbe;
  const root =
    process.env.QDRANT_RECOVERY_STATE_DIR?.trim() || '/var/lib/megacampus-qdrant-recovery';
  const client = new QdrantClient({
    url: qdrantUrl,
    apiKey,
    checkCompatibility: false,
    timeout: 120_000,
  });
  const result = await runRestoreDrill({
    client,
    manifest,
    probe,
    apiKey,
    transportBaseUrl: requiredEnv('QDRANT_SNAPSHOT_TRANSPORT_URL'),
    stableAlias: process.env.QDRANT_COLLECTION_NAME?.trim() || 'course_embeddings',
    evidenceDirectory: join(root, 'restore-evidence'),
    metricStatePath: join(root, 'metrics-state.json'),
    metricsPath: join(root, 'textfile', 'megacampus_qdrant_recovery.prom'),
    lockPath:
      process.env.QDRANT_RECOVERY_LOCK_PATH?.trim() || '/run/lock/megacampus-qdrant-recovery.lock',
    lockAlreadyHeld: process.env.QDRANT_RECOVERY_LOCK_HELD === '1',
  });
  process.stdout.write(`${JSON.stringify({ status: 'passed', evidence: result.evidencePath })}\n`);
}

function isDirectExecution(): boolean {
  return (
    process.argv[1] !== undefined &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  );
}

if (isDirectExecution()) {
  runCli().catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Qdrant restore drill failed'}\n`
    );
    process.exitCode = 1;
  });
}
