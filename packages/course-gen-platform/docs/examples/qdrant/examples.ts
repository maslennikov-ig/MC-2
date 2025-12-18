/**
 * Qdrant Client Usage Examples
 *
 * This file demonstrates common patterns for using the Qdrant client singleton.
 * These examples are for reference and documentation purposes.
 *
 * @module shared/qdrant/examples
 */

import { qdrantClient } from './client';

/**
 * Example: List all collections
 */
export async function exampleListCollections() {
  try {
    const result = await qdrantClient.getCollections();
    console.log('Collections:', result.collections);
    return result.collections;
  } catch (error) {
    console.error('Failed to list collections:', error);
    throw error;
  }
}

/**
 * Example: Get collection information
 */
export async function exampleGetCollection(collectionName: string) {
  try {
    const info = await qdrantClient.getCollection(collectionName);
    console.log(`Collection ${collectionName} info:`, {
      status: info.status,
      vectorCount: info.vectors_count,
      pointsCount: info.points_count,
    });
    return info;
  } catch (error: unknown) {
    // Type-safe error handling
    const err = error as { status?: number; message?: string };
    if (err.status === 404) {
      console.error(`Collection ${collectionName} not found`);
    }
    throw error;
  }
}

/**
 * Example: Search for similar vectors
 */
export async function exampleVectorSearch(
  collectionName: string,
  queryVector: number[],
  limit: number = 10
) {
  try {
    const result = await qdrantClient.search(collectionName, {
      vector: queryVector,
      limit,
    });

    console.log(`Found ${result.length} similar vectors`);
    return result;
  } catch (error) {
    console.error('Vector search failed:', error);
    throw error;
  }
}

/**
 * Example: Upsert vectors with payload
 */
export async function exampleUpsertVectors(
  collectionName: string,
  points: Array<{
    id: string | number;
    vector: number[];
    payload: Record<string, any>;
  }>
) {
  try {
    const result = await qdrantClient.upsert(collectionName, {
      wait: true,
      points,
    });

    console.log(`Upserted ${points.length} points, status: ${result.status}`);
    return result;
  } catch (error) {
    console.error('Failed to upsert vectors:', error);
    throw error;
  }
}

/**
 * Example: Search with payload filtering
 */
export async function exampleSearchWithFilter(
  collectionName: string,
  queryVector: number[],
  filter: Record<string, any>
) {
  try {
    const result = await qdrantClient.search(collectionName, {
      vector: queryVector,
      filter,
      limit: 10,
    });

    console.log(`Found ${result.length} filtered results`);
    return result;
  } catch (error) {
    console.error('Filtered search failed:', error);
    throw error;
  }
}

/**
 * Example: Delete points by filter
 */
export async function exampleDeleteByFilter(
  collectionName: string,
  filter: Record<string, any>
) {
  try {
    const result = await qdrantClient.delete(collectionName, {
      wait: true,
      filter,
    });

    console.log('Delete operation completed:', result.status);
    return result;
  } catch (error) {
    console.error('Failed to delete points:', error);
    throw error;
  }
}

/**
 * Example: Scroll through all points
 */
export async function exampleScrollPoints(collectionName: string) {
  try {
    let allPoints: any[] = [];
    let offset: string | number | Record<string, unknown> | null | undefined = undefined;

    do {
      const result = await qdrantClient.scroll(collectionName, {
        limit: 100,
        offset,
        with_payload: true,
        with_vector: false,
      });

      allPoints = allPoints.concat(result.points);
      offset = result.next_page_offset;
    } while (offset !== null && offset !== undefined);

    console.log(`Retrieved ${allPoints.length} total points`);
    return allPoints;
  } catch (error) {
    console.error('Failed to scroll points:', error);
    throw error;
  }
}

/**
 * Example: Use raw API for advanced operations
 */
export async function exampleRawApiUsage() {
  try {
    // Access the raw collections API
    const collections = await qdrantClient.getCollections();
    console.log('Raw API result:', collections);
    return collections;
  } catch (error) {
    console.error('Raw API call failed:', error);
    throw error;
  }
}

/**
 * Example: Error handling with typed errors
 */
export async function exampleErrorHandling(collectionName: string) {
  try {
    const info = await qdrantClient.getCollection(collectionName);
    return info;
  } catch (error: unknown) {
    // Type-safe error handling
    const err = error as { status?: number; data?: unknown; message?: string };

    // Handle different status codes
    switch (err.status) {
      case 404:
        console.error('Collection not found');
        break;
      case 400:
        console.error('Bad request:', err.data);
        break;
      case 500:
        console.error('Server error:', err.data);
        break;
      default:
        console.error('Unknown error:', err.message || error);
    }

    throw error;
  }
}
