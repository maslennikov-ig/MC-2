/**
 * Vitest global setup - runs once before all tests
 * Starts BullMQ workers for integration tests
 */
import { config } from 'dotenv';
import path from 'path';
import { startWorker, stopWorker } from '../src/orchestrator/worker.js';
import { closeRedisClient } from '../src/shared/cache/redis.js';
import { createCourseEmbeddingsCollection } from '../src/shared/qdrant/create-collection.js';

export const QDRANT_TEST_SETUP_OPT_OUT = 'SKIP_QDRANT_TEST_SETUP';

export interface GlobalSetupDependencies {
  createCourseEmbeddingsCollection: () => Promise<void>;
  startWorker: (concurrency: number) => Promise<unknown>;
}

export async function runGlobalSetup(
  dependencies: GlobalSetupDependencies,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (env[QDRANT_TEST_SETUP_OPT_OUT] === '1') {
    console.warn(
      `⚠️ ${QDRANT_TEST_SETUP_OPT_OUT}=1: skipping the Qdrant collection precondition explicitly`
    );
  } else {
    // Ensure Qdrant collection exists (idempotent — skips if already created)
    console.log('Creating Qdrant course_embeddings collection if needed...');
    await dependencies.createCourseEmbeddingsCollection();
    console.log('✅ Qdrant collection ready');
  }

  // Start generic worker with production-like concurrency for tests
  // This worker now handles ALL job types including STAGE_3_SUMMARIZATION
  // Concurrency=5 enables parallel processing of Stage 2 and Stage 3 jobs
  await dependencies.startWorker(5);
  console.log('✅ Generic BullMQ worker started successfully (handles all job types)\n');
}

export async function setup() {
  // Load environment variables only when Vitest invokes the real global setup.
  config({ path: path.resolve(__dirname, '../.env') });
  console.log('\n=== GLOBAL SETUP: Starting BullMQ Worker ===');

  try {
    await runGlobalSetup({ createCourseEmbeddingsCollection, startWorker });
  } catch (error) {
    console.error('❌ Failed to start BullMQ worker:', error);
    throw error;
  }
}

/** Timeout guard for async operations - prevents CI from hanging forever */
const CLEANUP_TIMEOUT_MS = 30000; // 30 seconds for cleanup (worker.close() can be slow)

export interface GlobalTeardownDependencies {
  stopWorker: () => Promise<void>;
  closeRedisClient: () => Promise<void>;
  sleep: (milliseconds: number) => Promise<void>;
  exit: (code: number) => never;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

export async function runGlobalTeardown(dependencies: GlobalTeardownDependencies): Promise<void> {
  console.log('\n=== GLOBAL TEARDOWN: Stopping BullMQ Worker ===');

  let cleanupFailed = false;

  // Stop worker with timeout guard - prevents CI hanging if worker.close() freezes
  try {
    await withTimeout(dependencies.stopWorker(), CLEANUP_TIMEOUT_MS, 'Worker stop');
    console.log('✅ Generic BullMQ worker stopped successfully');
  } catch (error) {
    console.error('❌ Error stopping generic worker:', error);
    cleanupFailed = true;
  }

  // Close Redis connection with timeout guard
  try {
    await withTimeout(dependencies.closeRedisClient(), CLEANUP_TIMEOUT_MS, 'Redis close');
    console.log('✅ Redis connection closed successfully');
  } catch (error) {
    console.error('❌ Error closing Redis connection:', error);
    cleanupFailed = true;
  }

  // Give async cleanup time to complete
  await dependencies.sleep(100);

  // Force exit if cleanup timed out - prevents CI from hanging
  if (cleanupFailed) {
    console.error('❌ Cleanup had issues, forcing a failing exit to prevent CI hang...');
    // Give a moment for logs to flush
    await dependencies.sleep(500);
    dependencies.exit(1);
  }

  console.log('✅ Teardown complete\n');
}

export async function teardown() {
  return runGlobalTeardown({
    stopWorker: () => stopWorker(true),
    closeRedisClient,
    sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    exit: code => process.exit(code),
  });
}
