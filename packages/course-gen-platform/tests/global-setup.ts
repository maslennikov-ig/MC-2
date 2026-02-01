/**
 * Vitest global setup - runs once before all tests
 * Starts BullMQ workers for integration tests
 */
import { config } from 'dotenv';
import path from 'path';
import { startWorker, stopWorker } from '../src/orchestrator/worker.js';
import { closeRedisClient } from '../src/shared/cache/redis.js';

// Load environment variables
config({ path: path.resolve(__dirname, '../.env') });

export async function setup() {
  console.log('\n=== GLOBAL SETUP: Starting BullMQ Worker ===');

  try {
    // Start generic worker with production-like concurrency for tests
    // This worker now handles ALL job types including STAGE_3_SUMMARIZATION
    // Concurrency=5 enables parallel processing of Stage 2 and Stage 3 jobs
    await startWorker(5);
    console.log('✅ Generic BullMQ worker started successfully (handles all job types)\n');
  } catch (error) {
    console.error('❌ Failed to start BullMQ worker:', error);
    throw error;
  }
}

/** Timeout guard for async operations - prevents CI from hanging forever */
const CLEANUP_TIMEOUT_MS = 30000; // 30 seconds for cleanup (worker.close() can be slow)

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

export async function teardown() {
  console.log('\n=== GLOBAL TEARDOWN: Stopping BullMQ Worker ===');

  let cleanupFailed = false;

  // Stop worker with timeout guard - prevents CI hanging if worker.close() freezes
  try {
    await withTimeout(stopWorker(true), CLEANUP_TIMEOUT_MS, 'Worker stop');
    console.log('✅ Generic BullMQ worker stopped successfully');
  } catch (error) {
    console.error('❌ Error stopping generic worker:', error);
    cleanupFailed = true;
  }

  // Close Redis connection with timeout guard
  try {
    await withTimeout(closeRedisClient(), CLEANUP_TIMEOUT_MS, 'Redis close');
    console.log('✅ Redis connection closed successfully');
  } catch (error) {
    console.error('❌ Error closing Redis connection:', error);
    cleanupFailed = true;
  }

  // Give async cleanup time to complete
  await new Promise(resolve => setTimeout(resolve, 100));

  // Force exit if cleanup timed out - prevents CI from hanging
  if (cleanupFailed) {
    console.log('⚠️ Cleanup had issues, forcing exit to prevent CI hang...');
    // Give a moment for logs to flush
    await new Promise(resolve => setTimeout(resolve, 500));
    process.exit(0);
  }

  console.log('✅ Teardown complete\n');
}
