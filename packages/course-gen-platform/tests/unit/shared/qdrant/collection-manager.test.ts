import type { QdrantClient } from '@qdrant/js-client-rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLLECTION_CREATE_PARAMS,
  PAYLOAD_INDEXES,
} from '../../../../src/shared/qdrant/collection-schema';
import {
  ensureCourseEmbeddingsCollection,
  verifyCourseEmbeddingsCollection,
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
        },
        sparse_vectors: {
          sparse: {
            ...COLLECTION_CREATE_PARAMS.sparse_vectors.sparse,
            modifier:
              overrides.sparseModifier ?? COLLECTION_CREATE_PARAMS.sparse_vectors.sparse.modifier,
          },
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
  } = {}
) {
  const calls: string[] = [];
  const mutations: string[] = [];
  const info = options.collectionInfo ?? collectionInfo();

  const client = {
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
      return Promise.resolve(true);
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
});
