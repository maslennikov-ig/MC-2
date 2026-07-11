import type { QdrantClient } from '@qdrant/js-client-rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLLECTION_CREATE_PARAMS,
  PAYLOAD_INDEXES,
} from '../../../../src/shared/qdrant/collection-schema';
import {
  ensureCourseEmbeddingsCollection,
  verifyCourseEmbeddingsCollection,
  verifyPhysicalCourseEmbeddingsCollection,
} from '../../../../src/shared/qdrant/collection-manager';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

const PHYSICAL_NAME = 'course_embeddings_v1';
const ALIAS_NAME = 'course_embeddings';

function collectionInfo(
  overrides: {
    denseSize?: number;
    sparseModifier?: string;
    missingIndex?: string;
    strictMaxQueryLimit?: number;
    pointsCount?: number;
    unexpectedDense?: boolean;
    unexpectedSparse?: boolean;
    unexpectedIndex?: boolean;
    unexpectedStrictRestriction?: boolean;
  } = {}
) {
  const payloadSchema = Object.fromEntries(
    PAYLOAD_INDEXES.filter(index => index.field_name !== overrides.missingIndex).map(index => [
      index.field_name,
      {
        data_type:
          typeof index.field_schema === 'string' ? index.field_schema : index.field_schema.type,
        params:
          typeof index.field_schema === 'string'
            ? { type: index.field_schema }
            : { ...index.field_schema },
        points: 0,
      },
    ])
  );
  if (overrides.unexpectedIndex) {
    payloadSchema.unexpected_index = {
      data_type: 'keyword',
      params: { type: 'keyword' },
      points: 0,
    };
  }

  return {
    status: 'green',
    optimizer_status: 'ok',
    points_count: overrides.pointsCount ?? 0,
    segments_count: 1,
    config: {
      params: {
        vectors: {
          dense: {
            ...COLLECTION_CREATE_PARAMS.vectors.dense,
            size: overrides.denseSize ?? COLLECTION_CREATE_PARAMS.vectors.dense.size,
          },
          ...(overrides.unexpectedDense
            ? {
                unexpected_dense: COLLECTION_CREATE_PARAMS.vectors.dense,
              }
            : {}),
        },
        sparse_vectors: {
          sparse: {
            ...COLLECTION_CREATE_PARAMS.sparse_vectors.sparse,
            modifier:
              overrides.sparseModifier ?? COLLECTION_CREATE_PARAMS.sparse_vectors.sparse.modifier,
          },
          ...(overrides.unexpectedSparse
            ? {
                unexpected_sparse: COLLECTION_CREATE_PARAMS.sparse_vectors.sparse,
              }
            : {}),
        },
        shard_number: COLLECTION_CREATE_PARAMS.shard_number,
        replication_factor: COLLECTION_CREATE_PARAMS.replication_factor,
        write_consistency_factor: COLLECTION_CREATE_PARAMS.write_consistency_factor,
      },
      optimizer_config: {
        indexing_threshold: COLLECTION_CREATE_PARAMS.optimizers_config.indexing_threshold,
      },
      strict_mode_config: {
        ...COLLECTION_CREATE_PARAMS.strict_mode_config,
        max_query_limit:
          overrides.strictMaxQueryLimit ??
          COLLECTION_CREATE_PARAMS.strict_mode_config.max_query_limit,
        ...(overrides.unexpectedStrictRestriction ? { search_allow_exact: false } : {}),
      },
    },
    payload_schema: payloadSchema,
  };
}

function createClient(
  options: {
    collections?: string[];
    collectionInfo?: ReturnType<typeof collectionInfo>;
    legacyInfo?: ReturnType<typeof collectionInfo>;
    aliases?: Array<{ alias_name: string; collection_name: string }>;
    aliasUpdateResult?: boolean;
    serverVersion?: string;
    versionError?: Error;
  } = {}
) {
  const calls: string[] = [];
  const mutations: string[] = [];
  const info = options.collectionInfo ?? collectionInfo();
  const serverVersion = options.serverVersion ?? '1.18.2';

  const client = {
    versionInfo: vi.fn(() => {
      calls.push(`versionInfo:${options.versionError ? 'error' : serverVersion}`);
      if (options.versionError) {
        return Promise.reject(options.versionError);
      }
      return Promise.resolve({ title: 'qdrant', version: serverVersion });
    }),
    getCollections: vi.fn(() => {
      calls.push('getCollections');
      return Promise.resolve({
        collections: (options.collections ?? []).map(name => ({ name })),
      });
    }),
    createCollection: vi.fn((name: string) => {
      calls.push(`createCollection:${name}`);
      mutations.push(`createCollection:${name}`);
      return Promise.resolve(true);
    }),
    createPayloadIndex: vi.fn((_name: string, index: { field_name: string }) => {
      calls.push(`createPayloadIndex:${index.field_name}`);
      mutations.push(`createPayloadIndex:${index.field_name}`);
      return Promise.resolve({ operation_id: 1, status: 'completed' });
    }),
    getCollection: vi.fn((name: string) => {
      calls.push(`getCollection:${name}`);
      return Promise.resolve(name === ALIAS_NAME && options.legacyInfo ? options.legacyInfo : info);
    }),
    getAliases: vi.fn(() => {
      calls.push('getAliases');
      return Promise.resolve({ aliases: options.aliases ?? [] });
    }),
    updateCollectionAliases: vi.fn(({ actions }: { actions: Array<{ create_alias?: object }> }) => {
      const create = actions[0]?.create_alias as
        | { alias_name: string; collection_name: string }
        | undefined;
      const call = `updateCollectionAliases:${create?.alias_name}->${create?.collection_name}`;
      calls.push(call);
      mutations.push(call);
      return Promise.resolve(options.aliasUpdateResult ?? true);
    }),
    deleteCollection: vi.fn((name: string) => {
      calls.push(`deleteCollection:${name}`);
      mutations.push(`deleteCollection:${name}`);
      return Promise.resolve(true);
    }),
  };

  return { client: client as unknown as QdrantClient, calls, mutations };
}

describe('Qdrant collection manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the physical collection, all indexes, verifies it, then creates the alias', async () => {
    const { client, calls } = createClient();

    const result = await ensureCourseEmbeddingsCollection({ client });

    expect(result).toEqual({
      ok: true,
      aliasName: ALIAS_NAME,
      physicalName: PHYSICAL_NAME,
      mismatches: [],
    });
    expect(calls).toEqual([
      'versionInfo:1.18.2',
      'getCollections',
      `createCollection:${PHYSICAL_NAME}`,
      ...PAYLOAD_INDEXES.map(index => `createPayloadIndex:${index.field_name}`),
      `getCollection:${PHYSICAL_NAME}`,
      'getAliases',
      `updateCollectionAliases:${ALIAS_NAME}->${PHYSICAL_NAME}`,
    ]);
  });

  it('is idempotent when the physical collection and correct alias already exist', async () => {
    const { client, mutations } = createClient({
      collections: [PHYSICAL_NAME],
      aliases: [{ alias_name: ALIAS_NAME, collection_name: PHYSICAL_NAME }],
    });

    const result = await ensureCourseEmbeddingsCollection({ client });

    expect(result.ok).toBe(true);
    expect(mutations).toEqual([]);
  });

  it('refuses an alias that points to the wrong physical collection without mutation', async () => {
    const { client, mutations } = createClient({
      collections: [PHYSICAL_NAME, 'course_embeddings_v0'],
      aliases: [{ alias_name: ALIAS_NAME, collection_name: 'course_embeddings_v0' }],
    });

    const result = await ensureCourseEmbeddingsCollection({ client });

    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([expect.stringContaining('points to course_embeddings_v0')]);
    expect(mutations).toEqual([]);
  });

  it('refuses a legacy physical collection that occupies the alias name by default', async () => {
    const { client, mutations } = createClient({ collections: [ALIAS_NAME] });

    const result = await ensureCourseEmbeddingsCollection({ client });

    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([
      expect.stringContaining('legacy physical collection course_embeddings'),
    ]);
    expect(mutations).toEqual([]);
  });

  it('drops the legacy physical collection only with the explicit gate and logs its point count', async () => {
    const { client, calls } = createClient({
      collections: [ALIAS_NAME],
      legacyInfo: collectionInfo({ pointsCount: 42 }),
    });

    const result = await ensureCourseEmbeddingsCollection({ client, allowDropLegacy: true });

    expect(result.ok).toBe(true);
    expect(calls).toContain(`deleteCollection:${ALIAS_NAME}`);
    expect(calls.indexOf(`deleteCollection:${ALIAS_NAME}`)).toBeGreaterThan(
      calls.indexOf(`getCollection:${PHYSICAL_NAME}`)
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { collectionName: ALIAS_NAME, pointsCount: 42 },
      'Deleting explicitly allowed legacy Qdrant collection'
    );
  });

  it('fails bootstrap when Qdrant returns false for alias creation', async () => {
    const { client } = createClient({ aliasUpdateResult: false });

    await expect(ensureCourseEmbeddingsCollection({ client })).rejects.toThrow(
      `Qdrant refused to create alias ${ALIAS_NAME} for ${PHYSICAL_NAME}`
    );
  });

  it('blocks every mutation when the server is not the pinned Qdrant version', async () => {
    const { client, calls, mutations } = createClient({ serverVersion: '1.18.1' });

    await expect(ensureCourseEmbeddingsCollection({ client })).rejects.toThrow(
      'Unsupported Qdrant server version 1.18.1; required 1.18.2 for @qdrant/js-client-rest 1.18.0'
    );

    expect(calls).toEqual(['versionInfo:1.18.1']);
    expect(mutations).toEqual([]);
  });

  it('blocks every mutation when the server version cannot be read', async () => {
    const { client, calls, mutations } = createClient({
      versionError: new Error('connection refused'),
    });

    await expect(ensureCourseEmbeddingsCollection({ client })).rejects.toThrow(
      'Unable to verify required Qdrant server 1.18.2 for @qdrant/js-client-rest 1.18.0: connection refused'
    );

    expect(calls).toEqual(['versionInfo:error']);
    expect(mutations).toEqual([]);
  });

  it.each([
    ['dense vector size', { denseSize: 384 }, 'vectors.dense.size'],
    ['sparse modifier', { sparseModifier: 'none' }, 'sparse_vectors.sparse.modifier'],
    ['payload index', { missingIndex: 'course_id' }, 'payload_schema.course_id'],
    ['strict mode', { strictMaxQueryLimit: 999 }, 'strict_mode_config.max_query_limit'],
  ] as const)('reports %s drift and performs no mutation', async (_label, drift, path) => {
    const { client, mutations } = createClient({
      collections: [PHYSICAL_NAME],
      collectionInfo: collectionInfo(drift),
      aliases: [{ alias_name: ALIAS_NAME, collection_name: PHYSICAL_NAME }],
    });

    const result = await ensureCourseEmbeddingsCollection({ client });

    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([expect.stringContaining(path)]);
    expect(mutations).toEqual([]);
  });

  it('reports an unexpected dense vector name without mutation', async () => {
    const { client, mutations } = createClient({
      collections: [PHYSICAL_NAME],
      collectionInfo: collectionInfo({ unexpectedDense: true }),
      aliases: [{ alias_name: ALIAS_NAME, collection_name: PHYSICAL_NAME }],
    });

    const verification = await ensureCourseEmbeddingsCollection({ client });

    expect(verification.ok).toBe(false);
    expect(verification.mismatches).toEqual([expect.stringContaining('unexpected_dense')]);
    expect(mutations).toEqual([]);
  });

  it('reports an unexpected sparse vector name without mutation', async () => {
    const { client, mutations } = createClient({
      collections: [PHYSICAL_NAME],
      collectionInfo: collectionInfo({ unexpectedSparse: true }),
      aliases: [{ alias_name: ALIAS_NAME, collection_name: PHYSICAL_NAME }],
    });

    const verification = await ensureCourseEmbeddingsCollection({ client });

    expect(verification.ok).toBe(false);
    expect(verification.mismatches).toEqual([expect.stringContaining('unexpected_sparse')]);
    expect(mutations).toEqual([]);
  });

  it('reports an unexpected payload index without mutation', async () => {
    const { client, mutations } = createClient({
      collections: [PHYSICAL_NAME],
      collectionInfo: collectionInfo({ unexpectedIndex: true }),
      aliases: [{ alias_name: ALIAS_NAME, collection_name: PHYSICAL_NAME }],
    });

    const verification = await ensureCourseEmbeddingsCollection({ client });

    expect(verification.ok).toBe(false);
    expect(verification.mismatches).toEqual([expect.stringContaining('unexpected_index')]);
    expect(mutations).toEqual([]);
  });

  it('reports an unexpected active strict-mode restriction without mutation', async () => {
    const { client, mutations } = createClient({
      collections: [PHYSICAL_NAME],
      collectionInfo: collectionInfo({ unexpectedStrictRestriction: true }),
      aliases: [{ alias_name: ALIAS_NAME, collection_name: PHYSICAL_NAME }],
    });

    const verification = await ensureCourseEmbeddingsCollection({ client });

    expect(verification.ok).toBe(false);
    expect(verification.mismatches).toEqual([
      expect.stringContaining('strict_mode_config.search_allow_exact'),
    ]);
    expect(mutations).toEqual([]);
  });

  it('verify-only reports missing resources without creating or deleting anything', async () => {
    const { client, mutations } = createClient();

    const result = await verifyCourseEmbeddingsCollection({ client });

    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([
      expect.stringContaining(`physical collection ${PHYSICAL_NAME} is missing`),
      expect.stringContaining(`alias ${ALIAS_NAME} is missing`),
    ]);
    expect(mutations).toEqual([]);
  });

  it('verifies an exact physical target before alias cutover without reading alias state', async () => {
    const nextPhysicalName = 'course_embeddings_v2';
    const { client, calls, mutations } = createClient({
      collections: [PHYSICAL_NAME, nextPhysicalName],
      aliases: [{ alias_name: ALIAS_NAME, collection_name: PHYSICAL_NAME }],
    });

    const result = await verifyPhysicalCourseEmbeddingsCollection({
      client,
      physicalName: nextPhysicalName,
    });

    expect(result).toEqual({
      ok: true,
      physicalName: nextPhysicalName,
      mismatches: [],
    });
    expect(calls).toEqual([
      'versionInfo:1.18.2',
      'getCollections',
      `getCollection:${nextPhysicalName}`,
    ]);
    expect(mutations).toEqual([]);
  });

  it('reports exact physical target schema drift without mutation', async () => {
    const nextPhysicalName = 'course_embeddings_v2';
    const { client, mutations } = createClient({
      collections: [nextPhysicalName],
      collectionInfo: collectionInfo({ missingIndex: 'document_id' }),
    });

    const result = await verifyPhysicalCourseEmbeddingsCollection({
      client,
      physicalName: nextPhysicalName,
    });

    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([expect.stringContaining('payload_schema.document_id')]);
    expect(mutations).toEqual([]);
  });
});
