import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { EmbeddingResult } from '../../src/shared/embeddings/generate';
import type { EnrichedChunk } from '../../src/shared/embeddings/metadata-enricher';
import {
  ensureCourseEmbeddingsCollection,
  verifyCourseEmbeddingsCollection,
} from '../../src/shared/qdrant/collection-manager';
import { PAYLOAD_INDEXES } from '../../src/shared/qdrant/collection-schema';
import { createBm25Document } from '../../src/shared/qdrant/config';
import { generateNumericId } from '../../src/shared/qdrant/upload-helpers';
import { uploadChunksToQdrant } from '../../src/shared/qdrant/upload';
import {
  buildHybridPrefetch,
  buildPriorityFormula,
  flattenDocumentGroups,
} from '../../src/shared/qdrant/search-operations';
import type { ResolvedSearchOptions, SearchFilters } from '../../src/shared/qdrant/search-types';

const ORG_RU = '10000000-0000-4000-8000-000000000001';
const ORG_EN = '20000000-0000-4000-8000-000000000002';
const COURSE_RU = '30000000-0000-4000-8000-000000000001';
const COURSE_EN = '40000000-0000-4000-8000-000000000002';

const DOCUMENTS = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    name: 'ru-core.pdf',
    language: 'ru',
    organizationId: ORG_RU,
    courseId: COURSE_RU,
    priority: 'CORE',
    weight: 1,
  },
  {
    id: '50000000-0000-4000-8000-000000000002',
    name: 'ru-supplementary.pdf',
    language: 'ru',
    organizationId: ORG_RU,
    courseId: COURSE_RU,
    priority: 'SUPPLEMENTARY',
    weight: 0.5,
  },
  {
    id: '60000000-0000-4000-8000-000000000001',
    name: 'en-core.pdf',
    language: 'en',
    organizationId: ORG_EN,
    courseId: COURSE_EN,
    priority: 'CORE',
    weight: 1,
  },
  {
    id: '60000000-0000-4000-8000-000000000002',
    name: 'en-supplementary.pdf',
    language: 'en',
    organizationId: ORG_EN,
    courseId: COURSE_EN,
    priority: 'SUPPLEMENTARY',
    weight: 0.5,
  },
] as const;

// Stabilize any residual equal-score tie by point identity. The Formula test
// separately forces opposite dense/BM25 source ranks and asserts equal fused
// scores, so its causal boost proof does not depend on this ordering alone.
const POINT_ID_ORDER = [1, 0, 2, 3] as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for blocking Qdrant integration tests`);
  }
  return value;
}

function unitVector(axis: number): number[] {
  const vector = Array<number>(768).fill(0);
  vector[axis] = 1;
  return vector;
}

const FORMULA_VECTOR = unitVector(0);
const CONTEXT_VECTOR = unitVector(1);
const SUPPLEMENTARY_FORMULA_VECTOR = (() => {
  const vector = Array<number>(768).fill(0);
  vector[0] = 0.99;
  vector[1] = Math.sqrt(1 - 0.99 ** 2);
  return vector;
})();
const GROUP_VECTOR = (() => {
  const vector = Array<number>(768).fill(0);
  vector[0] = Math.SQRT1_2;
  vector[1] = Math.SQRT1_2;
  return vector;
})();

function fixtureContent(language: 'ru' | 'en', chunkIndex: number): string {
  if (language === 'ru') {
    return chunkIndex === 0
      ? 'megacampusfixture спектроскопия formula_fixture нейтральное доказательство'
      : `megacampusfixture спектроскопия русский учебный контекст ${chunkIndex}`;
  }

  return chunkIndex === 0
    ? 'megacampusfixture photosynthesis controlled evidence'
    : `megacampusfixture photosynthesis english learning context ${chunkIndex}`;
}

function createFixtureEmbedding(
  document: (typeof DOCUMENTS)[number],
  documentIndex: number,
  chunkIndex: number
): EmbeddingResult {
  const baseContent = fixtureContent(document.language, chunkIndex);
  const content =
    document.language === 'ru' && document.priority === 'SUPPLEMENTARY' && chunkIndex === 0
      ? baseContent.replace('formula_fixture', 'formula_fixture formula_fixture')
      : baseContent;
  const pointOrder = POINT_ID_ORDER[documentIndex];
  const chunk: EnrichedChunk = {
    chunk_id: `70000000-0000-4000-8${pointOrder.toString().padStart(3, '0')}-${chunkIndex
      .toString()
      .padStart(12, '0')}`,
    parent_chunk_id: null,
    sibling_chunk_ids: [],
    level: 'child',
    content,
    token_count: content.split(/\s+/u).length,
    char_count: content.length,
    chunk_index: chunkIndex,
    total_chunks: 3,
    heading_path: `${document.language.toUpperCase()} > Fixture`,
    chapter: document.language === 'ru' ? 'Физика' : 'Biology',
    section: chunkIndex === 0 ? 'Core evidence' : 'Context',
    chunk_strategy: 'hierarchical_markdown',
    overlap_tokens: 0,
    document_id: document.id,
    document_name: document.name,
    document_version: '1.0',
    version_hash: `fixture-${documentIndex}`,
    page_number: chunkIndex + 1,
    page_range: [chunkIndex + 1, chunkIndex + 1],
    has_code: false,
    has_formulas: chunkIndex === 0,
    has_tables: false,
    has_images: false,
    organization_id: document.organizationId,
    course_id: document.courseId,
    indexed_at: '2026-07-10T00:00:00.000Z',
    last_updated: '2026-07-10T00:00:00.000Z',
    image_refs: [],
    table_refs: [],
    document_priority: document.priority,
    document_weight: document.weight,
  };

  return {
    chunk,
    dense_vector:
      chunkIndex === 0
        ? document.language === 'ru' && document.priority === 'SUPPLEMENTARY'
          ? SUPPLEMENTARY_FORMULA_VECTOR
          : FORMULA_VECTOR
        : CONTEXT_VECTOR,
    token_count: chunk.token_count,
  };
}

const FIXTURE_EMBEDDINGS = DOCUMENTS.flatMap((document, documentIndex) =>
  [0, 1, 2].map(chunkIndex => createFixtureEmbedding(document, documentIndex, chunkIndex))
);

function resolvedOptions(
  filters: SearchFilters = {},
  overrides: Partial<ResolvedSearchOptions> = {}
): ResolvedSearchOptions {
  return {
    limit: 12,
    score_threshold: 0,
    collection_name: '',
    enable_hybrid: true,
    include_payload: true,
    filters,
    enable_priority_boost: false,
    priority_boost_factor: 0.4,
    group_by_document: false,
    group_size: 2,
    ...overrides,
  };
}

async function uploadWithoutSupabaseMutation(collectionName: string): Promise<void> {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;

  try {
    const upload = await uploadChunksToQdrant(FIXTURE_EMBEDDINGS, {
      collection_name: collectionName,
      batch_size: 12,
      enable_sparse: true,
      wait: true,
    });
    if (!upload.success || upload.points_uploaded !== FIXTURE_EMBEDDINGS.length) {
      throw new Error(`Fixture upload was incomplete: ${JSON.stringify(upload)}`);
    }
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = previousKey;
  }
}

describe('CI Qdrant native retrieval gate', () => {
  const runId = randomUUID().replaceAll('-', '_');
  const aliasName = `ci_qdrant_alias_${runId}`;
  const physicalName = `ci_qdrant_physical_${runId}`;
  const createdSnapshots = new Set<string>();
  let client: QdrantClient;
  let bootstrapStarted = false;

  beforeAll(async () => {
    client = new QdrantClient({
      url: requireEnv('QDRANT_URL'),
      apiKey: requireEnv('QDRANT_API_KEY'),
      checkCompatibility: false,
      timeout: 10000,
    });

    // This is deliberately unconditional: configured-but-unreachable Qdrant must fail.
    await client.getCollections();
    bootstrapStarted = true;
    const ensured = await ensureCourseEmbeddingsCollection({ client, aliasName, physicalName });
    if (!ensured.ok) {
      throw new Error(`Pinned Qdrant fixture bootstrap drifted: ${ensured.mismatches.join('; ')}`);
    }
    await uploadWithoutSupabaseMutation(aliasName);
  }, 30000);

  afterAll(async () => {
    if (!client || !bootstrapStarted) return;

    const failures: string[] = [];
    const collections = await client.getCollections().catch(error => {
      failures.push(`list collections: ${String(error)}`);
      return { collections: [] };
    });
    const physicalExists = collections.collections.some(
      collection => collection.name === physicalName
    );

    if (physicalExists) {
      const snapshots = await client.listSnapshots(physicalName).catch(error => {
        failures.push(`list snapshots: ${String(error)}`);
        return [];
      });
      for (const snapshot of snapshots) {
        if (createdSnapshots.has(snapshot.name)) {
          await client.deleteSnapshot(physicalName, snapshot.name, { wait: true }).catch(error => {
            failures.push(`delete snapshot ${snapshot.name}: ${String(error)}`);
          });
        }
      }
    }

    const aliases = await client.getAliases().catch(error => {
      failures.push(`list aliases: ${String(error)}`);
      return { aliases: [] };
    });
    if (aliases.aliases.some(alias => alias.alias_name === aliasName)) {
      await client
        .updateCollectionAliases({ actions: [{ delete_alias: { alias_name: aliasName } }] })
        .catch(error => failures.push(`delete alias: ${String(error)}`));
    }
    if (physicalExists) {
      await client
        .deleteCollection(physicalName)
        .catch(error => failures.push(`delete physical collection: ${String(error)}`));
    }

    const remainingCollections = await client.getCollections().catch(() => ({ collections: [] }));
    const remainingAliases = await client.getAliases().catch(() => ({ aliases: [] }));
    if (remainingCollections.collections.some(collection => collection.name === physicalName)) {
      failures.push('physical collection still exists after cleanup');
    }
    if (remainingAliases.aliases.some(alias => alias.alias_name === aliasName)) {
      failures.push('alias still exists after cleanup');
    }
    if (failures.length > 0) throw new AggregateError(failures, 'Qdrant fixture cleanup failed');
  }, 30000);

  it('bootstraps the physical collection, alias, indexes, and strict mode', async () => {
    const verification = await verifyCourseEmbeddingsCollection({
      client,
      aliasName,
      physicalName,
    });
    expect(verification).toMatchObject({ ok: true, aliasName, physicalName, mismatches: [] });

    const info = await client.getCollection(physicalName);
    expect(info.config.params.sparse_vectors?.sparse?.modifier).toBe('idf');
    expect(info.config.strict_mode_config).toMatchObject({
      enabled: true,
      unindexed_filtering_retrieve: false,
      unindexed_filtering_update: false,
    });
    expect(Object.keys(info.payload_schema).sort()).toEqual(
      PAYLOAD_INDEXES.map(index => index.field_name).sort()
    );
  });

  it('persists the complete production payload including priority', async () => {
    const source = FIXTURE_EMBEDDINGS[0].chunk;
    const points = await client.retrieve(aliasName, {
      ids: [generateNumericId(source.chunk_id)],
      with_payload: true,
      with_vector: true,
    });

    expect(points).toHaveLength(1);
    expect(points[0].payload).toMatchObject({
      chunk_id: source.chunk_id,
      document_id: source.document_id,
      organization_id: source.organization_id,
      course_id: source.course_id,
      document_priority: 'CORE',
      document_weight: 1,
    });
  });

  it('matches Russian and English evidence with native BM25', async () => {
    const russian = await client.query(aliasName, {
      query: createBm25Document('спектроскопия'),
      using: 'sparse',
      filter: { must: [{ key: 'organization_id', match: { value: ORG_RU } }] },
      limit: 6,
      with_payload: true,
    });
    const english = await client.query(aliasName, {
      query: createBm25Document('photosynthesis'),
      using: 'sparse',
      filter: { must: [{ key: 'organization_id', match: { value: ORG_EN } }] },
      limit: 6,
      with_payload: true,
    });

    expect(russian.points.length).toBeGreaterThan(0);
    expect(english.points.length).toBeGreaterThan(0);
    expect(russian.points.every(point => point.payload?.organization_id === ORG_RU)).toBe(true);
    expect(english.points.every(point => point.payload?.organization_id === ORG_EN)).toBe(true);
  });

  it('returns evidence from native dense plus sparse RRF', async () => {
    const options = resolvedOptions(
      { organization_id: ORG_RU, course_id: COURSE_RU },
      { collection_name: aliasName, limit: 6 }
    );
    const results = await client.query(aliasName, {
      prefetch: buildHybridPrefetch('спектроскопия', GROUP_VECTOR, options),
      query: { rrf: {} },
      limit: 6,
      with_payload: true,
    });

    expect(results.points.length).toBeGreaterThan(0);
    expect(results.points.every(point => point.payload?.organization_id === ORG_RU)).toBe(true);
    expect(
      results.points.some(point => String(point.payload?.content).includes('спектроскопия'))
    ).toBe(true);
  });

  it('applies Formula after RRF so CORE outranks equivalent SUPPLEMENTARY evidence', async () => {
    const options = resolvedOptions(
      { organization_id: ORG_RU, course_id: COURSE_RU },
      { collection_name: aliasName, limit: 2, score_threshold: 0.9 }
    );
    const prefetch = buildHybridPrefetch('formula_fixture', FORMULA_VECTOR, options);
    const dense = await client.query(aliasName, {
      query: FORMULA_VECTOR,
      using: 'dense',
      filter: prefetch[1].filter,
      score_threshold: 0.9,
      limit: 2,
      with_payload: true,
    });
    const sparse = await client.query(aliasName, {
      query: createBm25Document('formula_fixture'),
      using: 'sparse',
      filter: prefetch[0].filter,
      limit: 2,
      with_payload: true,
    });
    expect(dense.points[0].payload?.document_priority).toBe('CORE');
    expect(sparse.points[0].payload?.document_priority).toBe('SUPPLEMENTARY');

    const unboosted = await client.query(aliasName, {
      prefetch,
      query: { rrf: {} },
      limit: 2,
      with_payload: true,
    });
    const unboostedByPriority = new Map(
      unboosted.points.map(point => [point.payload?.document_priority, point.score])
    );
    const unboostedCore = unboostedByPriority.get('CORE');
    const unboostedSupplementary = unboostedByPriority.get('SUPPLEMENTARY');
    expect(unboostedCore).toBeDefined();
    expect(unboostedSupplementary).toBeDefined();
    expect(unboostedCore).toBeCloseTo(unboostedSupplementary!, 6);

    let results;
    try {
      results = await client.query(aliasName, {
        prefetch: { prefetch, query: { rrf: {} }, limit: 6 },
        query: buildPriorityFormula(0.4),
        limit: 2,
        with_payload: true,
      });
    } catch (error) {
      const details = error as {
        message?: unknown;
        status?: unknown;
        data?: unknown;
        cause?: unknown;
      };
      throw new Error(
        `Pinned RRF to Formula request failed: ${JSON.stringify({
          message: details.message,
          status: details.status,
          data: details.data,
          cause: details.cause,
        })}`,
        { cause: error }
      );
    }

    expect(results.points).toHaveLength(2);
    expect(results.points[0].payload?.document_priority).toBe('CORE');
    expect(results.points[1].payload?.document_priority).toBe('SUPPLEMENTARY');
    expect(results.points[0].score).toBeGreaterThan(results.points[1].score);
    expect(results.points[0].score).toBeCloseTo(unboostedCore! * 1.2, 5);
    expect(results.points[1].score).toBeCloseTo(unboostedSupplementary!, 5);
  });

  it('groups at most two chunks per document and preserves document diversity', async () => {
    const options = resolvedOptions({}, { collection_name: aliasName, limit: 12 });
    const grouped = await client.queryGroups(aliasName, {
      prefetch: buildHybridPrefetch('megacampusfixture', GROUP_VECTOR, options),
      query: { rrf: {} },
      group_by: 'document_id',
      group_size: 2,
      limit: 4,
      with_payload: true,
    });

    expect(grouped.groups).toHaveLength(4);
    expect(grouped.groups.every(group => group.hits.length > 0 && group.hits.length <= 2)).toBe(
      true
    );
    expect(new Set(grouped.groups.map(group => group.id)).size).toBe(4);

    const flattened = flattenDocumentGroups(grouped.groups, 8);
    expect(flattened).toHaveLength(8);
    expect(new Set(flattened.slice(0, 4).map(point => point.payload?.document_id)).size).toBe(4);
  });

  it('keeps organization and course filters isolated', async () => {
    const isolated = await client.query(aliasName, {
      query: createBm25Document('megacampusfixture'),
      using: 'sparse',
      filter: {
        must: [
          { key: 'organization_id', match: { value: ORG_RU } },
          { key: 'course_id', match: { value: COURSE_RU } },
        ],
      },
      limit: 12,
      with_payload: true,
    });
    const mismatched = await client.query(aliasName, {
      query: createBm25Document('megacampusfixture'),
      using: 'sparse',
      filter: {
        must: [
          { key: 'organization_id', match: { value: ORG_RU } },
          { key: 'course_id', match: { value: COURSE_EN } },
        ],
      },
      limit: 12,
      with_payload: true,
    });

    expect(isolated.points).toHaveLength(6);
    expect(
      isolated.points.every(
        point => point.payload?.organization_id === ORG_RU && point.payload?.course_id === COURSE_RU
      )
    ).toBe(true);
    expect(mismatched.points).toHaveLength(0);
  });

  it('rejects an unindexed filter in strict mode', async () => {
    let rejection: unknown;
    try {
      await client.scroll(aliasName, {
        filter: { must: [{ key: 'unindexed_fixture_field', match: { value: 'forbidden' } }] },
        limit: 1,
        with_payload: true,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeDefined();
    expect(rejection).toMatchObject({ status: 400 });
    expect(JSON.stringify(rejection)).toMatch(/index required|strict mode|unindexed/iu);
  });

  it('creates, lists, and deletes a physical collection snapshot', async () => {
    const snapshot = await client.createSnapshot(physicalName, { wait: true });
    expect(snapshot).not.toBeNull();
    createdSnapshots.add(snapshot!.name);

    const listed = await client.listSnapshots(physicalName);
    expect(listed.map(candidate => candidate.name)).toContain(snapshot!.name);

    await expect(client.deleteSnapshot(physicalName, snapshot!.name, { wait: true })).resolves.toBe(
      true
    );
    createdSnapshots.delete(snapshot!.name);
    await expect(client.listSnapshots(physicalName)).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: snapshot!.name })])
    );
  });
});
