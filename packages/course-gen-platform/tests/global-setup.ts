/**
 * Vitest global setup - runs once before all tests
 * Starts BullMQ workers for integration tests
 */
import { config } from 'dotenv';
import path from 'path';
import { startWorker } from '../src/orchestrator/worker.js';
import type { Worker } from 'bullmq';

// Load environment variables
config({ path: path.resolve(__dirname, '../.env') });

let worker: Worker | null = null;

export async function setup() {
  console.log('\n=== GLOBAL SETUP: Starting BullMQ Worker ===');

  try {
    // Start generic worker with production-like concurrency for tests
    // This worker now handles ALL job types including STAGE_3_SUMMARIZATION
    // Concurrency=5 enables parallel processing of Stage 2 and Stage 3 jobs
    worker = await startWorker(5);
    console.log('✅ Generic BullMQ worker started successfully (handles all job types)\n');

    // Store worker instance globally for teardown
    (global as any).__WORKER__ = worker;
  } catch (error) {
    console.error('❌ Failed to start BullMQ worker:', error);
    throw error;
  }
}

export async function teardown() {
  console.log('\n=== GLOBAL TEARDOWN: Stopping BullMQ Worker ===');

  const worker = (global as any).__WORKER__ as Worker | undefined;

  // Stop generic worker
  if (worker) {
    try {
      await worker.close();
      console.log('✅ Generic BullMQ worker stopped successfully\n');
    } catch (error) {
      console.error('❌ Error stopping generic worker:', error);
    }
  }
}
