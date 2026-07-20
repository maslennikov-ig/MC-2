import { logger } from '../logger/index.js';
import { qdrantClient, type QdrantClient } from './client';
import { COLLECTION_CREATE_PARAMS, PAYLOAD_INDEXES } from './collection-schema';
import { QDRANT_COLLECTION_ALIAS, QDRANT_PHYSICAL_COLLECTION } from './config';

export interface EnsureCollectionOptions {
  client?: QdrantClient;
  aliasName?: string;
  physicalName?: string;
  allowDropLegacy?: boolean;
}

export interface SchemaVerificationResult {
  ok: boolean;
  aliasName: string;
  physicalName: string;
  mismatches: string[];
}

export interface VerifyPhysicalCollectionOptions {
  client?: QdrantClient;
  physicalName?: string;
}

export interface PhysicalSchemaVerificationResult {
  ok: boolean;
  physicalName: string;
  mismatches: string[];
}

interface ResolvedOptions {
  client: QdrantClient;
  aliasName: string;
  physicalName: string;
  allowDropLegacy: boolean;
}

type CollectionInfo = Awaited<ReturnType<QdrantClient['getCollection']>>;
type AliasInfo = Awaited<ReturnType<QdrantClient['getAliases']>>['aliases'];

const REQUIRED_QDRANT_SERVER_VERSION = '1.18.2';
const PINNED_QDRANT_CLIENT_VERSION = '1.18.0';

function resolveName(value: string | undefined, fallback: string, optionName: string): string {
  const resolved = value === undefined ? fallback : value.trim();
  if (!resolved) {
    throw new Error(`${optionName} must not be empty`);
  }
  return resolved;
}

function resolveOptions(options: EnsureCollectionOptions): ResolvedOptions {
  return {
    client: options.client ?? qdrantClient,
    aliasName: resolveName(options.aliasName, QDRANT_COLLECTION_ALIAS, 'aliasName'),
    physicalName: resolveName(options.physicalName, QDRANT_PHYSICAL_COLLECTION, 'physicalName'),
    allowDropLegacy: options.allowDropLegacy === true,
  };
}

async function assertPinnedQdrantCompatibility(client: QdrantClient): Promise<void> {
  let serverVersion: string;
  try {
    serverVersion = (await client.versionInfo()).version;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to verify required Qdrant server ${REQUIRED_QDRANT_SERVER_VERSION} for @qdrant/js-client-rest ${PINNED_QDRANT_CLIENT_VERSION}: ${message}`
    );
  }

  if (serverVersion !== REQUIRED_QDRANT_SERVER_VERSION) {
    throw new Error(
      `Unsupported Qdrant server version ${serverVersion}; required ${REQUIRED_QDRANT_SERVER_VERSION} for @qdrant/js-client-rest ${PINNED_QDRANT_CLIENT_VERSION}`
    );
  }
}

function formatValue(value: unknown): string {
  return value === undefined ? 'missing' : JSON.stringify(value);
}

function addMismatch(mismatches: string[], path: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    mismatches.push(`${path}: expected ${formatValue(expected)}, received ${formatValue(actual)}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    current = asRecord(current)?.[key];
  }
  return current;
}

function addUnexpectedKeysMismatch(
  mismatches: string[],
  path: string,
  actual: unknown,
  expectedKeys: readonly string[]
): void {
  const expected = new Set(expectedKeys);
  const unexpected = Object.keys(asRecord(actual) ?? {})
    .filter(key => !expected.has(key))
    .sort();

  if (unexpected.length > 0) {
    mismatches.push(`${path}: unexpected names ${formatValue(unexpected)}`);
  }
}

const OPTIONAL_STRICT_MODE_OUTPUT_KEYS = new Set([
  'search_max_hnsw_ef',
  'search_allow_exact',
  'search_max_oversampling',
  'max_collection_vector_size_bytes',
  'read_rate_limit',
  'write_rate_limit',
  'max_collection_payload_size_bytes',
  'max_points_count',
  'multivector_config',
  'sparse_config',
]);

function isNeutralStrictModeOutput(key: string, value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (key === 'search_allow_exact') {
    return value === true;
  }
  if (key === 'multivector_config' || key === 'sparse_config') {
    return Object.keys(asRecord(value) ?? {}).length === 0;
  }
  return false;
}

function schemaMismatches(info: CollectionInfo): string[] {
  const mismatches: string[] = [];
  const expectedPaths: Array<{ path: readonly string[]; expected: unknown }> = [
    {
      path: ['config', 'params', 'vectors', 'dense', 'size'],
      expected: COLLECTION_CREATE_PARAMS.vectors.dense.size,
    },
    {
      path: ['config', 'params', 'vectors', 'dense', 'distance'],
      expected: COLLECTION_CREATE_PARAMS.vectors.dense.distance,
    },
    {
      path: ['config', 'params', 'vectors', 'dense', 'hnsw_config', 'm'],
      expected: COLLECTION_CREATE_PARAMS.vectors.dense.hnsw_config.m,
    },
    {
      path: ['config', 'params', 'vectors', 'dense', 'hnsw_config', 'ef_construct'],
      expected: COLLECTION_CREATE_PARAMS.vectors.dense.hnsw_config.ef_construct,
    },
    {
      path: ['config', 'params', 'vectors', 'dense', 'on_disk'],
      expected: COLLECTION_CREATE_PARAMS.vectors.dense.on_disk,
    },
    {
      path: ['config', 'params', 'sparse_vectors', 'sparse', 'index', 'on_disk'],
      expected: COLLECTION_CREATE_PARAMS.sparse_vectors.sparse.index.on_disk,
    },
    {
      path: ['config', 'params', 'sparse_vectors', 'sparse', 'modifier'],
      expected: COLLECTION_CREATE_PARAMS.sparse_vectors.sparse.modifier,
    },
    {
      path: ['config', 'params', 'shard_number'],
      expected: COLLECTION_CREATE_PARAMS.shard_number,
    },
    {
      path: ['config', 'params', 'replication_factor'],
      expected: COLLECTION_CREATE_PARAMS.replication_factor,
    },
    {
      path: ['config', 'params', 'write_consistency_factor'],
      expected: COLLECTION_CREATE_PARAMS.write_consistency_factor,
    },
    {
      path: ['config', 'optimizer_config', 'indexing_threshold'],
      expected: COLLECTION_CREATE_PARAMS.optimizers_config.indexing_threshold,
    },
  ];

  for (const [key, expected] of Object.entries(COLLECTION_CREATE_PARAMS.strict_mode_config)) {
    expectedPaths.push({
      path: ['config', 'strict_mode_config', key],
      expected,
    });
  }

  for (const { path, expected } of expectedPaths) {
    addMismatch(mismatches, path.slice(1).join('.'), valueAt(info, path), expected);
  }

  addUnexpectedKeysMismatch(
    mismatches,
    'vectors',
    info.config.params.vectors,
    Object.keys(COLLECTION_CREATE_PARAMS.vectors)
  );
  addUnexpectedKeysMismatch(
    mismatches,
    'sparse_vectors',
    info.config.params.sparse_vectors,
    Object.keys(COLLECTION_CREATE_PARAMS.sparse_vectors)
  );
  addUnexpectedKeysMismatch(
    mismatches,
    'payload_schema',
    info.payload_schema,
    PAYLOAD_INDEXES.map(index => index.field_name)
  );

  const expectedStrictKeys = new Set(Object.keys(COLLECTION_CREATE_PARAMS.strict_mode_config));
  for (const [key, value] of Object.entries(info.config.strict_mode_config ?? {})) {
    if (expectedStrictKeys.has(key)) {
      continue;
    }
    if (!OPTIONAL_STRICT_MODE_OUTPUT_KEYS.has(key)) {
      mismatches.push(`strict_mode_config.${key}: unexpected output field`);
    } else if (!isNeutralStrictModeOutput(key, value)) {
      mismatches.push(
        `strict_mode_config.${key}: unexpected active restriction ${formatValue(value)}`
      );
    }
  }

  for (const index of PAYLOAD_INDEXES) {
    const basePath = `payload_schema.${index.field_name}`;
    const actual = info.payload_schema[index.field_name];
    const expectedType =
      typeof index.field_schema === 'string' ? index.field_schema : index.field_schema.type;

    addMismatch(mismatches, basePath, actual === undefined ? undefined : 'present', 'present');
    if (!actual) {
      continue;
    }

    addMismatch(mismatches, `${basePath}.data_type`, actual.data_type, expectedType);
    if (typeof index.field_schema !== 'string') {
      addMismatch(
        mismatches,
        `${basePath}.params.type`,
        valueAt(actual.params, ['type']),
        index.field_schema.type
      );
      addMismatch(
        mismatches,
        `${basePath}.params.is_tenant`,
        valueAt(actual.params, ['is_tenant']),
        index.field_schema.is_tenant
      );
    }
  }

  return mismatches;
}

function aliasMismatches(aliases: AliasInfo, aliasName: string, physicalName: string): string[] {
  const alias = aliases.find(candidate => candidate.alias_name === aliasName);
  if (!alias) {
    return [`alias ${aliasName} is missing`];
  }
  if (alias.collection_name !== physicalName) {
    return [`alias ${aliasName} points to ${alias.collection_name}; expected ${physicalName}`];
  }
  return [];
}

function result(
  aliasName: string,
  physicalName: string,
  mismatches: string[]
): SchemaVerificationResult {
  return {
    ok: mismatches.length === 0,
    aliasName,
    physicalName,
    mismatches,
  };
}

async function readAliases(client: QdrantClient): Promise<AliasInfo> {
  return (await client.getAliases()).aliases;
}

export async function verifyCourseEmbeddingsCollection(
  options: EnsureCollectionOptions = {}
): Promise<SchemaVerificationResult> {
  const { client, aliasName, physicalName } = resolveOptions(options);
  await assertPinnedQdrantCompatibility(client);
  const collections = (await client.getCollections()).collections;
  const collectionNames = new Set(collections.map(collection => collection.name));
  const mismatches: string[] = [];

  if (!collectionNames.has(physicalName)) {
    mismatches.push(`physical collection ${physicalName} is missing`);
  } else {
    mismatches.push(...schemaMismatches(await client.getCollection(physicalName)));
  }

  mismatches.push(...aliasMismatches(await readAliases(client), aliasName, physicalName));

  if (aliasName !== physicalName && collectionNames.has(aliasName)) {
    mismatches.push(
      `legacy physical collection ${aliasName} conflicts with the required alias name`
    );
  }

  return result(aliasName, physicalName, mismatches);
}

/**
 * Verify an exact physical collection before an alias cutover.
 *
 * Unlike verifyCourseEmbeddingsCollection(), this read-only check deliberately
 * does not inspect alias state. Version compatibility and the complete physical
 * schema contract remain mandatory.
 */
export async function verifyPhysicalCourseEmbeddingsCollection(
  options: VerifyPhysicalCollectionOptions = {}
): Promise<PhysicalSchemaVerificationResult> {
  const client = options.client ?? qdrantClient;
  const physicalName = resolveName(
    options.physicalName,
    QDRANT_PHYSICAL_COLLECTION,
    'physicalName'
  );

  await assertPinnedQdrantCompatibility(client);
  const collections = (await client.getCollections()).collections;
  const collectionNames = new Set(collections.map(collection => collection.name));
  const mismatches = collectionNames.has(physicalName)
    ? schemaMismatches(await client.getCollection(physicalName))
    : [`physical collection ${physicalName} is missing`];

  return {
    ok: mismatches.length === 0,
    physicalName,
    mismatches,
  };
}

async function deleteLegacyCollection(client: QdrantClient, collectionName: string): Promise<void> {
  const legacyInfo = await client.getCollection(collectionName);
  logger.warn(
    {
      collectionName,
      pointsCount: legacyInfo.points_count ?? 0,
    },
    'Deleting explicitly allowed legacy Qdrant collection'
  );
  await client.deleteCollection(collectionName);
}

export async function ensureCourseEmbeddingsCollection(
  options: EnsureCollectionOptions = {}
): Promise<SchemaVerificationResult> {
  const { client, aliasName, physicalName, allowDropLegacy } = resolveOptions(options);

  if (aliasName === physicalName) {
    return result(aliasName, physicalName, [
      'aliasName and physicalName must identify different Qdrant resources',
    ]);
  }

  await assertPinnedQdrantCompatibility(client);

  const collections = (await client.getCollections()).collections;
  const collectionNames = new Set(collections.map(collection => collection.name));
  const physicalExists = collectionNames.has(physicalName);
  const legacyExists = collectionNames.has(aliasName);

  if (legacyExists && !allowDropLegacy) {
    return result(aliasName, physicalName, [
      `legacy physical collection ${aliasName} conflicts with the required alias name; rerun with allowDropLegacy only after confirming it is disposable`,
    ]);
  }

  let aliases: AliasInfo | undefined;
  let info: CollectionInfo | undefined;

  if (physicalExists) {
    info = await client.getCollection(physicalName);
    const mismatches = schemaMismatches(info);
    if (mismatches.length > 0) {
      return result(aliasName, physicalName, mismatches);
    }
  }

  // Any pre-existing collection can be the target of an alias. Check before the
  // first mutation when the desired physical collection has not been created yet.
  if (!physicalExists && collectionNames.size > 0) {
    aliases = await readAliases(client);
    const alias = aliases.find(candidate => candidate.alias_name === aliasName);
    if (alias && alias.collection_name !== physicalName) {
      return result(aliasName, physicalName, [
        `alias ${aliasName} points to ${alias.collection_name}; expected ${physicalName}`,
      ]);
    }
  }

  if (physicalExists) {
    aliases = await readAliases(client);
    const existingAliasMismatch = aliasMismatches(aliases, aliasName, physicalName).filter(
      mismatch => !mismatch.endsWith('is missing')
    );
    if (existingAliasMismatch.length > 0) {
      return result(aliasName, physicalName, existingAliasMismatch);
    }
  }

  if (!physicalExists) {
    await client.createCollection(physicalName, { ...COLLECTION_CREATE_PARAMS });
    for (const index of PAYLOAD_INDEXES) {
      await client.createPayloadIndex(physicalName, { ...index, wait: true });
    }

    info = await client.getCollection(physicalName);
    const mismatches = schemaMismatches(info);
    if (mismatches.length > 0) {
      return result(aliasName, physicalName, mismatches);
    }
  }

  if (legacyExists) {
    await deleteLegacyCollection(client, aliasName);
  }

  aliases ??= await readAliases(client);
  const existingAlias = aliases.find(candidate => candidate.alias_name === aliasName);
  if (!existingAlias) {
    const aliasCreated = await client.updateCollectionAliases({
      actions: [
        {
          create_alias: {
            alias_name: aliasName,
            collection_name: physicalName,
          },
        },
      ],
    });
    if (!aliasCreated) {
      throw new Error(`Qdrant refused to create alias ${aliasName} for ${physicalName}`);
    }
  }

  return result(aliasName, physicalName, []);
}
