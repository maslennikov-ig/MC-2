import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
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
  assertSharedMetricsDirectory,
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
  mismatched_organization_id: string;
  mismatched_course_id: string;
  expected_dense: RecoveryExpectedPoint;
  expected_ru_bm25: RecoveryExpectedPoint;
  expected_en_bm25: RecoveryExpectedPoint;
  expected_formula_order: [RecoveryExpectedPoint, RecoveryExpectedPoint];
}

export interface RecoveryExpectedPoint {
  point_id: string;
  document_id: string;
  chunk_id: string;
  content: string;
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
  for (const [name, value] of Object.entries({
    ru_query: probe.ru_query,
    en_query: probe.en_query,
    formula_query: probe.formula_query,
    organization_id: probe.organization_id,
    course_id: probe.course_id,
    mismatched_organization_id: probe.mismatched_organization_id,
    mismatched_course_id: probe.mismatched_course_id,
  })) {
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`Recovery probe ${name} is required`);
  }
  const expectations = [
    ['expected_dense', probe.expected_dense],
    ['expected_ru_bm25', probe.expected_ru_bm25],
    ['expected_en_bm25', probe.expected_en_bm25],
    ...probe.expected_formula_order.map(
      (expected, index) => [`expected_formula_order[${index}]`, expected] as const
    ),
  ] as const;
  for (const [name, expected] of expectations) {
    for (const [field, value] of Object.entries(expected ?? {})) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Recovery probe ${name}.${field} is required`);
      }
    }
    if (!expected || Object.keys(expected).length !== 4) {
      throw new Error(
        `Recovery probe ${name} must define exact point, document, chunk, and content`
      );
    }
  }
  if (probe.expected_formula_order.length !== 2) {
    throw new Error('Recovery probe expected_formula_order must contain exactly two points');
  }
  if (probe.organization_id === probe.mismatched_organization_id) {
    throw new Error('Recovery probe mismatched_organization_id must differ from organization_id');
  }
  if (probe.course_id === probe.mismatched_course_id) {
    throw new Error('Recovery probe mismatched_course_id must differ from course_id');
  }
}

function scopedFilter(
  probe: RecoveryProbe,
  courseId = probe.course_id,
  organizationId = probe.organization_id
) {
  return {
    must: [
      { key: 'organization_id', match: { value: organizationId } },
      { key: 'course_id', match: { value: courseId } },
    ],
  };
}

function assertExactPoint(
  label: string,
  point: Awaited<ReturnType<RestoreClient['query']>>['points'][number] | undefined,
  expected: RecoveryExpectedPoint
): void {
  if (!point) throw new Error(`${label} expected top identity is missing`);
  const actual = {
    point_id: String(point.id),
    document_id: point.payload?.document_id,
    chunk_id: point.payload?.chunk_id,
    content: point.payload?.content,
  };
  const mismatchedFields = (Object.keys(expected) as Array<keyof RecoveryExpectedPoint>).filter(
    field => actual[field] !== expected[field]
  );
  if (mismatchedFields.length > 0) {
    throw new Error(
      `${label} top identity/content mismatch in fields: ${mismatchedFields.join(', ')}`
    );
  }
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

type ProbeQueryPoints = Awaited<ReturnType<RestoreClient['query']>>['points'];

interface ObservedProbeIdentities {
  dense: ProbeQueryPoints;
  russian: ProbeQueryPoints;
  english: ProbeQueryPoints;
  formula: ProbeQueryPoints;
}

/**
 * Ask a collection (through an alias) the four ranking questions the probe pins: dense top,
 * RU BM25 top, EN BM25 top, and the two-rank hybrid Formula order. The same questions are asked
 * of the live collection before a restore and of the recovered copy after it, so a probe that
 * no longer describes the live data is reported as stale instead of as a broken backup.
 */
async function queryProbeIdentities(
  client: Pick<QdrantClient, 'query'>,
  alias: string,
  probe: RecoveryProbe
): Promise<ObservedProbeIdentities> {
  const dense = await client.query(alias, {
    query: probe.dense_vector,
    using: 'dense',
    filter: scopedFilter(probe),
    limit: 3,
    with_payload: true,
  });
  const russian = await client.query(alias, {
    query: createBm25Document(probe.ru_query),
    using: 'sparse',
    filter: scopedFilter(probe),
    limit: 3,
    with_payload: true,
  });
  const english = await client.query(alias, {
    query: createBm25Document(probe.en_query),
    using: 'sparse',
    filter: scopedFilter(probe),
    limit: 3,
    with_payload: true,
  });
  const searchOptions: ResolvedSearchOptions = {
    limit: 2,
    score_threshold: 0,
    collection_name: alias,
    enable_hybrid: true,
    include_payload: true,
    filters: {
      organization_id: probe.organization_id,
      course_id: probe.course_id,
    },
    enable_priority_boost: true,
    priority_boost_factor: 0.4,
    group_by_document: false,
    group_size: 2,
  };
  const formula = await client.query(alias, {
    prefetch: {
      prefetch: buildHybridPrefetch(probe.formula_query, probe.dense_vector, searchOptions),
      query: { rrf: {} },
      limit: 6,
    },
    query: buildPriorityFormula(0.4),
    limit: 2,
    with_payload: true,
  });
  return {
    dense: dense.points,
    russian: russian.points,
    english: english.points,
    formula: formula.points,
  };
}

function assertProbeExpectations(observed: ObservedProbeIdentities, probe: RecoveryProbe): void {
  assertScopedPoints('Dense', observed.dense, probe);
  assertExactPoint('Dense', observed.dense[0], probe.expected_dense);
  assertScopedPoints('RU BM25', observed.russian, probe);
  assertExactPoint('RU BM25', observed.russian[0], probe.expected_ru_bm25);
  assertScopedPoints('EN BM25', observed.english, probe);
  assertExactPoint('EN BM25', observed.english[0], probe.expected_en_bm25);
  assertScopedPoints('Formula', observed.formula, probe);
  probe.expected_formula_order.forEach((expected, index) => {
    assertExactPoint(`Formula rank ${index + 1}`, observed.formula[index], expected);
  });
  if (
    observed.formula.length < 2 ||
    observed.formula[0].payload?.document_priority !== 'CORE' ||
    observed.formula[1].payload?.document_priority !== 'SUPPLEMENTARY' ||
    observed.formula[0].score <= observed.formula[1].score
  ) {
    throw new Error('Formula recovery probe did not preserve CORE priority ordering');
  }
}

export const PROBE_REGENERATION_HINT =
  'regenerate it with deploy/qdrant/generate-recovery-probe.py and rerun the drill';

/**
 * The probe pins exact point identities, so any rewrite of the chosen course's vectors
 * (reindex, deduplication, alias cutover) invalidates it. On 2026-09-01 the monthly drill failed
 * on `RU BM25 top identity/content mismatch in fields: point_id, chunk_id` four weeks after a
 * deduplication halved the collection: the backup was fine, the expectation was not. Asking the
 * live collection first turns that into a message that names the actual repair.
 */
export async function verifyProbeAgainstSource(options: {
  client: Pick<QdrantClient, 'query'>;
  stableAlias: string;
  probe: RecoveryProbe;
}): Promise<void> {
  requireProbe(options.probe);
  const observed = await queryProbeIdentities(options.client, options.stableAlias, options.probe);
  try {
    assertProbeExpectations(observed, options.probe);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Recovery probe is stale against the live collection ${options.stableAlias}: ${detail}; ${PROBE_REGENERATION_HINT}`
    );
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

  assertProbeExpectations(
    await queryProbeIdentities(options.client, options.drillAlias, options.probe),
    options.probe
  );

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
  const mismatchedOrganization = await options.client.query(options.drillAlias, {
    query: createBm25Document(options.probe.ru_query),
    using: 'sparse',
    filter: scopedFilter(
      options.probe,
      options.probe.course_id,
      options.probe.mismatched_organization_id
    ),
    limit: 3,
    with_payload: true,
  });
  if (mismatchedOrganization.points.length !== 0) {
    throw new Error('Recovery probe crossed organization/tenant isolation boundary');
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
  await writeAtomicText(metricsPath, renderRecoveryMetrics(state), {
    mode: 0o644,
    createParent: false,
  });
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
  verifyProbeSource?: typeof verifyProbeAgainstSource;
  lockAlreadyHeld?: boolean;
}

export type ProbeSourceCheck = 'pass' | 'stale' | 'not-run';

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
  await assertSharedMetricsDirectory(dirname(options.metricsPath));

  let state = await readMetricState(options.metricStatePath);
  let lock: Awaited<ReturnType<typeof acquireRecoveryLock>> | undefined;
  let stableBefore = '';
  let stableAfter = '';
  let aliasOwned = false;
  let collectionOwned = false;
  let checks: RecoveryChecks | undefined;
  let probeSourceCheck: ProbeSourceCheck = 'not-run';
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
    // Ask the live collection before restoring anything: a probe that the source itself no
    // longer satisfies cannot prove a restore, and the throwaway restore would only report a
    // misleading "mismatch" for the backup. Nothing is created before this point, so a stale
    // probe leaves no cleanup work.
    probeSourceCheck = 'stale';
    await (options.verifyProbeSource ?? verifyProbeAgainstSource)({
      client: options.client,
      stableAlias: options.stableAlias,
      probe: options.probe,
    });
    probeSourceCheck = 'pass';
    if (initialAliases.some(alias => alias.alias_name === drillAlias)) {
      throw new Error('Generated drill alias already exists');
    }
    aliasOwned = true;
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

    const aliasCreated = await options.client.updateCollectionAliases({
      actions: [{ create_alias: { collection_name: targetCollection, alias_name: drillAlias } }],
    });
    if (!aliasCreated) {
      cleanupFailures.push('drill alias creation returned false');
      throw new Error('Qdrant refused drill alias creation');
    }
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
    if (aliasOwned) {
      try {
        const currentAlias = (await options.client.getAliases()).aliases.find(
          alias => alias.alias_name === drillAlias
        );
        if (!currentAlias) {
          cleanup.alias = 'already-absent';
        } else if (currentAlias.collection_name !== targetCollection) {
          cleanup.alias = 'failed';
          cleanupFailures.push(
            `owned drill alias points to unexpected collection ${currentAlias.collection_name}`
          );
        } else {
          const aliasDeleted = await options.client.updateCollectionAliases({
            actions: [{ delete_alias: { alias_name: drillAlias } }],
          });
          if (!aliasDeleted) {
            cleanup.alias = 'failed';
            cleanupFailures.push('drill alias cleanup returned false');
          } else {
            cleanup.alias = 'deleted';
          }
        }
      } catch (error) {
        cleanup.alias = 'failed';
        cleanupFailures.push(`drill alias cleanup: ${redact(error, [options.apiKey])}`);
      }
    }
    if (collectionOwned) {
      try {
        const collectionExists = (await options.client.getCollections()).collections.some(
          collection => collection.name === targetCollection
        );
        if (!collectionExists) {
          cleanup.collection = 'already-absent';
        } else {
          const collectionDeleted = await options.client.deleteCollection(targetCollection);
          if (!collectionDeleted) {
            cleanup.collection = 'failed';
            cleanupFailures.push('drill collection cleanup returned false');
          } else {
            cleanup.collection = 'deleted';
          }
        }
      } catch (error) {
        cleanup.collection = 'failed';
        cleanupFailures.push(`drill collection cleanup: ${redact(error, [options.apiKey])}`);
      }
    }
    let postCleanupAliases: Awaited<ReturnType<RestoreClient['getAliases']>>['aliases'] = [];
    try {
      postCleanupAliases = (await options.client.getAliases()).aliases;
      if (aliasOwned && postCleanupAliases.some(alias => alias.alias_name === drillAlias)) {
        cleanupFailures.push('drill alias still exists after cleanup');
      }
      stableAfter = resolvePhysicalCollection(postCleanupAliases, options.stableAlias);
      if (stableBefore && stableAfter !== stableBefore) {
        cleanupFailures.push(
          `stable alias changed from ${stableBefore} to ${stableAfter}; automatic mutation is forbidden`
        );
      }
    } catch (error) {
      cleanupFailures.push(`stable alias verification: ${redact(error, [options.apiKey])}`);
    }
    if (collectionOwned) {
      try {
        const postCleanupCollections = (await options.client.getCollections()).collections;
        if (postCleanupCollections.some(collection => collection.name === targetCollection)) {
          cleanupFailures.push('drill collection still exists after cleanup');
        }
      } catch (error) {
        cleanupFailures.push(`drill collection postcondition: ${redact(error, [options.apiKey])}`);
      }
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
    probe_source_check: probeSourceCheck,
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
  const metricsDirectory = requiredEnv('QDRANT_METRICS_TEXTFILE_DIR');
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
    metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
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
