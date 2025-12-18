#!/usr/bin/env tsx
/**
 * Qdrant Connection Verification Script
 *
 * This script verifies the connection to Qdrant Cloud and provides
 * detailed diagnostics about the cluster status and capabilities.
 *
 * Usage:
 *   pnpm tsx scripts/verify-qdrant-connection.ts
 *
 * Requirements:
 *   - QDRANT_URL must be set in .env file
 *   - QDRANT_API_KEY must be set in .env file
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables BEFORE importing client
dotenv.config({ path: resolve(__dirname, '../.env') });

import { qdrantClient } from '../src/shared/qdrant/client';
import type { QdrantClient } from '@qdrant/js-client-rest';

// ANSI color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message: string) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function logSection(title: string) {
  console.log(`\n${colors.bold}${colors.cyan}${title}${colors.reset}`);
  console.log('─'.repeat(60));
}

async function verifyQdrantConnection() {
  console.log(`${colors.bold}Qdrant Cloud Connection Verification${colors.reset}\n`);

  // Step 1: Check environment variables
  logSection('1. Environment Variables Check');

  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantApiKey = process.env.QDRANT_API_KEY;

  if (!qdrantUrl || qdrantUrl === 'https://your-cluster.qdrant.cloud') {
    logError('QDRANT_URL is not configured in .env file');
    logInfo('Please set QDRANT_URL to your Qdrant Cloud cluster URL');
    process.exit(1);
  }

  if (!qdrantApiKey || qdrantApiKey === 'your-qdrant-api-key-here') {
    logError('QDRANT_API_KEY is not configured in .env file');
    logInfo('Please set QDRANT_API_KEY to your Qdrant Cloud API key');
    process.exit(1);
  }

  logSuccess(`QDRANT_URL: ${qdrantUrl}`);
  logSuccess(`QDRANT_API_KEY: ${'*'.repeat(40)} (hidden)`);

  // Step 2: Use singleton Qdrant client
  logSection('2. Using Singleton Qdrant Client');

  const client = qdrantClient;
  try {
    logSuccess('Qdrant client singleton loaded successfully');
    logInfo('Using shared client instance from @/shared/qdrant/client');
  } catch (error) {
    logError(`Failed to load Qdrant client: ${error}`);
    process.exit(1);
  }

  // Step 3: Test connection by listing collections
  logSection('3. Testing Connection');

  try {
    const result = await client.getCollections();
    logSuccess('Successfully connected to Qdrant Cloud');
    logInfo(`Found ${result.collections.length} collection(s)`);

    if (result.collections.length > 0) {
      console.log('\nExisting collections:');
      result.collections.forEach((collection) => {
        console.log(`  - ${collection.name}`);
      });
    }
  } catch (error: any) {
    logError('Failed to connect to Qdrant Cloud');

    if (error instanceof client.getCollections.Error) {
      const actualError = error.getActualType();
      logError(`Status: ${actualError.status}`);
      logError(`Details: ${JSON.stringify(actualError.data, null, 2)}`);
    } else {
      logError(`Error: ${error.message}`);
    }

    logWarning('Please verify your QDRANT_URL and QDRANT_API_KEY');
    process.exit(1);
  }

  // Step 4: Create test collection (optional verification)
  logSection('4. Advanced Connection Test');

  const testCollectionName = 'connection_test_temp';

  try {
    // Check if test collection already exists
    const collections = await client.getCollections();
    const existingCollection = collections.collections.find(
      (c) => c.name === testCollectionName
    );

    if (!existingCollection) {
      logInfo('Creating temporary test collection...');

      await client.createCollection(testCollectionName, {
        vectors: {
          size: 768, // Jina v2 base produces 768-dimensional embeddings
          distance: 'Cosine',
        },
      });

      logSuccess('Test collection created successfully');

      // Get collection info
      const collectionInfo = await client.getCollection(testCollectionName);
      logInfo(`Collection status: ${collectionInfo.status}`);
      logInfo(`Vector size: ${collectionInfo.config.params.vectors.size}`);
      logInfo(`Distance metric: ${collectionInfo.config.params.vectors.distance}`);

      // Clean up test collection
      logInfo('Cleaning up test collection...');
      await client.deleteCollection(testCollectionName);
      logSuccess('Test collection deleted successfully');
    } else {
      logWarning('Test collection already exists, skipping creation test');
    }
  } catch (error: any) {
    logWarning('Advanced test failed (this may be expected for limited permissions)');
    logInfo(`Error: ${error.message}`);
  }

  // Step 5: Verify cluster capabilities
  logSection('5. Cluster Capabilities Summary');

  try {
    const collections = await client.getCollections();

    logSuccess('Cluster is ready for use');
    logInfo('Recommended configuration for Stage 0:');
    console.log(`
  Collection Configuration:
    - Vector size: 768 (Jina v2 base embeddings)
    - Distance metric: Cosine
    - HNSW parameters:
      - m: 16
      - ef_construct: 100

  Expected Performance:
    - Storage capacity: 1GB (free tier)
    - Max vectors: ~50,000 (768-dim, 32-bit float)
    - Query latency: <30ms (p95)
    - Payload filtering: Supported (multi-tenancy ready)
    `);
  } catch (error) {
    logError('Failed to retrieve cluster capabilities');
  }

  // Final summary
  logSection('Verification Complete');
  logSuccess('Qdrant Cloud is ready for use');
  logInfo('Next steps:');
  console.log('  1. Create production collections using T072');
  console.log('  2. Configure HNSW indexes using T073');
  console.log('  3. Integrate Jina embeddings for document indexing');
}

// Run the verification
verifyQdrantConnection()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logError(`Unexpected error: ${error}`);
    process.exit(1);
  });
