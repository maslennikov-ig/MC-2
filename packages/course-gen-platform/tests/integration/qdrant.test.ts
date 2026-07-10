/**
 * Broad Qdrant adapter integration coverage.
 *
 * The suite is skipped only when no Qdrant configuration was supplied. Once
 * configured, connection or bootstrap failures are blocking hook failures.
 */

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
import { deleteChunksByCourseId, uploadChunksToQdrant } from '../../src/shared/qdrant/upload';
import { generateNumericId } from '../../src/shared/qdrant/upload-helpers';

const TEST_ORG_1 = '81000000-0000-4000-8000-000000000001';
const TEST_ORG_2 = '81000000-0000-4000-8000-000000000002';
const TEST_COURSE_1 = '82000000-0000-4000-8000-000000000001';
const TEST_COURSE_2 = '82000000-0000-4000-8000-000000000002';
const TEST_DOCUMENT_1 = '83000000-0000-4000-8000-000000000001';
const TEST_DOCUMENT_2 = '83000000-0000-4000-8000-000000000002';

const hasQdrantConfig = Boolean(
  process.env.QDRANT_URL?.trim() && process.env.QDRANT_API_KEY?.trim()
);
const qdrantDescribe = hasQdrantConfig ? describe : describe.skip;

function unitVector(axis: number): number[] {
  const vector = Array<number>(768).fill(0);
  vector[axis] = 1;
  return vector;
}

function createChunk(
  index: number,
  organizationId: string,
  courseId: string,
  documentId: string,
  content: string
): EnrichedChunk {
  return {
    chunk_id: `84000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    parent_chunk_id: null,
    sibling_chunk_ids: [],
    level: 'child',
    content,
    token_count: content.split(/\s+/u).length,
    char_count: content.length,
    chunk_index: index,
    total_chunks: 4,
    heading_path: 'Integration > Qdrant',
    chapter: 'Integration',
    section: 'Qdrant',
    chunk_strategy: 'hierarchical_markdown',
    overlap_tokens: 0,
    document_id: documentId,
    document_name: `${documentId}.pdf`,
    document_version: '1.0',
    version_hash: `broad-${index}`,
    page_number: index + 1,
    page_range: [index + 1, index + 1],
    has_code: index === 0,
    has_formulas: false,
    has_tables: false,
    has_images: false,
    organization_id: organizationId,
    course_id: courseId,
    indexed_at: '2026-07-10T00:00:00.000Z',
    last_updated: '2026-07-10T00:00:00.000Z',
    image_refs: [],
    table_refs: [],
    document_priority: index < 2 ? 'CORE' : 'SUPPLEMENTARY',
    document_weight: index < 2 ? 1 : 0.5,
  };
}

const EMBEDDINGS: EmbeddingResult[] = [
  {
    chunk: createChunk(
      0,
      TEST_ORG_1,
      TEST_COURSE_1,
      TEST_DOCUMENT_1,
      'broadfixture российский семантический поиск'
    ),
    dense_vector: unitVector(0),
    token_count: 4,
  },
  {
    chunk: createChunk(
      1,
      TEST_ORG_1,
      TEST_COURSE_1,
      TEST_DOCUMENT_1,
      'broadfixture дополнительный русский контекст'
    ),
    dense_vector: unitVector(1),
    token_count: 4,
  },
  {
    chunk: createChunk(
      2,
      TEST_ORG_2,
      TEST_COURSE_2,
      TEST_DOCUMENT_2,
      'broadfixture english semantic retrieval'
    ),
    dense_vector: unitVector(0),
    token_count: 4,
  },
  {
    chunk: createChunk(
      3,
      TEST_ORG_2,
      TEST_COURSE_2,
      TEST_DOCUMENT_2,
      'broadfixture additional english context'
    ),
    dense_vector: unitVector(1),
    token_count: 4,
  },
];

async function uploadWithoutSupabaseMutation(collectionName: string): Promise<void> {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;

  try {
    const result = await uploadChunksToQdrant(EMBEDDINGS, {
      collection_name: collectionName,
      batch_size: 4,
      enable_sparse: true,
      wait: true,
    });
    if (!result.success || result.points_uploaded !== EMBEDDINGS.length) {
      throw new Error(`Broad Qdrant fixture upload failed: ${JSON.stringify(result)}`);
    }
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = previousKey;
  }
}

qdrantDescribe('Qdrant Vector Database Integration Tests', () => {
  const runId = randomUUID().replaceAll('-', '_');
  const aliasName = `broad_qdrant_alias_${runId}`;
  const physicalName = `broad_qdrant_physical_${runId}`;
  let client: QdrantClient;
  let bootstrapStarted = false;

  beforeAll(async () => {
    client = new QdrantClient({
      url: process.env.QDRANT_URL!,
      apiKey: process.env.QDRANT_API_KEY!,
      checkCompatibility: false,
      timeout: 10000,
    });

    // Configuration means the suite must execute; unreachable Qdrant fails here.
    await client.getCollections();
    bootstrapStarted = true;
    const ensured = await ensureCourseEmbeddingsCollection({ client, aliasName, physicalName });
    if (!ensured.ok) {
      throw new Error(`Broad Qdrant bootstrap drifted: ${ensured.mismatches.join('; ')}`);
    }
    await uploadWithoutSupabaseMutation(aliasName);
  }, 30000);

  afterAll(async () => {
    if (!client || !bootstrapStarted) return;

    const failures: string[] = [];
    const aliases = await client.getAliases().catch(error => {
      failures.push(`list aliases: ${String(error)}`);
      return { aliases: [] };
    });
    if (aliases.aliases.some(alias => alias.alias_name === aliasName)) {
      await client
        .updateCollectionAliases({ actions: [{ delete_alias: { alias_name: aliasName } }] })
        .catch(error => failures.push(`delete alias: ${String(error)}`));
    }

    const collections = await client.getCollections().catch(error => {
      failures.push(`list collections: ${String(error)}`);
      return { collections: [] };
    });
    if (collections.collections.some(collection => collection.name === physicalName)) {
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
    if (failures.length > 0) throw new AggregateError(failures, 'Broad Qdrant cleanup failed');
  }, 30000);

  it('creates the pinned physical schema and stable alias', async () => {
    await expect(client.versionInfo()).resolves.toMatchObject({ version: '1.18.2' });
    await expect(
      verifyCourseEmbeddingsCollection({ client, aliasName, physicalName })
    ).resolves.toMatchObject({ ok: true, mismatches: [] });

    const info = await client.getCollection(physicalName);
    expect(info.config.params.vectors).toMatchObject({ dense: { size: 768, distance: 'Cosine' } });
    expect(Object.keys(info.payload_schema).sort()).toEqual(
      PAYLOAD_INDEXES.map(index => index.field_name).sort()
    );
  });

  it('uploads deterministic native sparse points with complete metadata', async () => {
    const source = EMBEDDINGS[0].chunk;
    const points = await client.retrieve(aliasName, {
      ids: [generateNumericId(source.chunk_id)],
      with_payload: true,
      with_vector: true,
    });

    expect(points).toHaveLength(1);
    expect(points[0].payload).toMatchObject({
      chunk_id: source.chunk_id,
      document_id: source.document_id,
      document_priority: 'CORE',
      document_weight: 1,
      organization_id: TEST_ORG_1,
      course_id: TEST_COURSE_1,
    });
    expect(points[0].vector).toMatchObject({
      dense: expect.any(Array),
      sparse: expect.any(Object),
    });
  });

  it('returns sorted dense top-K results through the alias', async () => {
    const results = await client.search(aliasName, {
      vector: { name: 'dense', vector: unitVector(0) },
      filter: {
        must: [
          { key: 'organization_id', match: { value: TEST_ORG_1 } },
          { key: 'course_id', match: { value: TEST_COURSE_1 } },
        ],
      },
      limit: 2,
      with_payload: true,
    });

    expect(results).toHaveLength(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    expect(results.every(result => result.payload?.organization_id === TEST_ORG_1)).toBe(true);
  });

  it('keeps tenant and course BM25 queries isolated', async () => {
    const org1 = await client.query(aliasName, {
      query: createBm25Document('broadfixture'),
      using: 'sparse',
      filter: {
        must: [
          { key: 'organization_id', match: { value: TEST_ORG_1 } },
          { key: 'course_id', match: { value: TEST_COURSE_1 } },
        ],
      },
      limit: 4,
      with_payload: true,
    });
    const wrongCourse = await client.query(aliasName, {
      query: createBm25Document('broadfixture'),
      using: 'sparse',
      filter: {
        must: [
          { key: 'organization_id', match: { value: TEST_ORG_1 } },
          { key: 'course_id', match: { value: TEST_COURSE_2 } },
        ],
      },
      limit: 4,
      with_payload: true,
    });

    expect(org1.points).toHaveLength(2);
    expect(org1.points.every(point => point.payload?.organization_id === TEST_ORG_1)).toBe(true);
    expect(wrongCourse.points).toHaveLength(0);
  });

  it('deletes one course without removing the other tenant', async () => {
    await deleteChunksByCourseId(TEST_COURSE_1, aliasName);

    const deleted = await client.count(aliasName, {
      filter: { must: [{ key: 'course_id', match: { value: TEST_COURSE_1 } }] },
      exact: true,
    });
    const preserved = await client.count(aliasName, {
      filter: { must: [{ key: 'course_id', match: { value: TEST_COURSE_2 } }] },
      exact: true,
    });

    expect(deleted.count).toBe(0);
    expect(preserved.count).toBe(2);
  });
});
