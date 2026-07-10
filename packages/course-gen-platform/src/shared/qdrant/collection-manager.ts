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

interface ResolvedOptions {
  client: QdrantClient;
  aliasName: string;
  physicalName: string;
  allowDropLegacy: boolean;
}

type CollectionInfo = Awaited<ReturnType<QdrantClient['getCollection']>>;
type AliasInfo = Awaited<ReturnType<QdrantClient['getAliases']>>['aliases'];

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
    await client.updateCollectionAliases({
      actions: [
        {
          create_alias: {
            alias_name: aliasName,
            collection_name: physicalName,
          },
        },
      ],
    });
  }

  return result(aliasName, physicalName, []);
}
