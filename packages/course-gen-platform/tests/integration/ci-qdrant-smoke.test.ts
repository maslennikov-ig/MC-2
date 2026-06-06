import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for CI Qdrant smoke tests`);
  }
  return value;
}

describe('CI Qdrant smoke', () => {
  const collectionName = `ci_qdrant_smoke_${randomUUID().replaceAll('-', '_')}`;
  const pointId = randomUUID();
  let client: QdrantClient;

  beforeAll(async () => {
    client = new QdrantClient({
      url: requireEnv('QDRANT_URL'),
      apiKey: requireEnv('QDRANT_API_KEY'),
      checkCompatibility: false,
      timeout: 10000,
    });

    await client.getCollections();
    await client.createCollection(collectionName, {
      vectors: {
        size: 4,
        distance: 'Cosine',
      },
    });
  });

  afterAll(async () => {
    if (!client) return;

    try {
      await client.deleteCollection(collectionName);
    } catch {
      // Best-effort cleanup: a failed assertion should remain the primary signal.
    }
  });

  it('creates a collection, writes a point, and reads it back', async () => {
    await client.upsert(collectionName, {
      wait: true,
      points: [
        {
          id: pointId,
          vector: [0.1, 0.2, 0.3, 0.4],
          payload: {
            source: 'ci-qdrant-smoke',
          },
        },
      ],
    });

    const points = await client.retrieve(collectionName, {
      ids: [pointId],
      with_payload: true,
      with_vector: true,
    });

    expect(points).toHaveLength(1);
    expect(points[0].id).toBe(pointId);
    expect(points[0].payload?.source).toBe('ci-qdrant-smoke');
  });
});
