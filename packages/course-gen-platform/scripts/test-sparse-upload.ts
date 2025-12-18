#!/usr/bin/env tsx
/**
 * Simple Test for Sparse Vector Upload Format
 *
 * Tests the exact format that Qdrant expects for sparse vectors
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

import { qdrantClient } from '../src/shared/qdrant/client';
import { COLLECTION_CONFIG } from '../src/shared/qdrant/create-collection';

async function testSparseVectorFormat() {
  console.log('Testing Sparse Vector Upload Format...\n');

  const collectionName = COLLECTION_CONFIG.name;

  // Test data - simple sparse vector
  const testPoint = {
    id: 999999,
    vector: {
      dense: new Array(768).fill(0.1), // 768D dense vector
      sparse: {
        indices: [1, 3, 5, 7],
        values: [0.1, 0.2, 0.3, 0.4],
      },
    },
    payload: {
      test: true,
      text: 'test sparse vector upload',
    },
  };

  console.log('Test point structure:');
  console.log(JSON.stringify(testPoint, null, 2).substring(0, 500) + '...');

  try {
    console.log('\nAttempting to upload...');
    await qdrantClient.upsert(collectionName, {
      wait: true,
      points: [testPoint],
    });

    console.log('✅ SUCCESS! Sparse vector uploaded correctly');

    // Clean up
    await qdrantClient.delete(collectionName, {
      wait: true,
      points: [999999],
    });

    console.log('✅ Cleanup complete');
  } catch (error: any) {
    console.log('❌ FAILED with error:');
    console.log(`Status: ${error.status || 'N/A'}`);
    console.log(`Message: ${error.message}`);

    if (error.data) {
      console.log('Error data:', JSON.stringify(error.data, null, 2));
    }

    throw error;
  }
}

testSparseVectorFormat().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
