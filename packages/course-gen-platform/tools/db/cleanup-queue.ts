/**
 * Cleanup script for BullMQ queue and Redis concurrency trackers
 * Used for testing to ensure clean state
 */

import { Queue } from 'bullmq';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QUEUE_NAME = 'course-generation';

async function cleanup() {
  console.log('🧹 Starting cleanup...');

  // Initialize Redis client
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  // Initialize Queue
  const queue = new Queue(QUEUE_NAME, {
    connection: redis,
  });

  try {
    // 1. Obliterate the entire queue (removes all jobs and queue metadata)
    console.log('🗑️  Obliterating queue...');
    await queue.obliterate({ force: true });
    console.log('✅ Queue obliterated');

    // 2. Clean up concurrency tracker keys
    console.log('🔍 Cleaning concurrency keys...');
    const keys = await redis.keys('concurrency:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`✅ Deleted ${keys.length} concurrency keys`);
    } else {
      console.log('✅ No concurrency keys to clean');
    }

    // 3. Verify cleanup
    const remainingJobs = await queue.count();
    console.log(`📊 Remaining jobs: ${remainingJobs}`);

    console.log('🎉 Cleanup complete!');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await queue.close();
    await redis.quit();
  }
}

cleanup();
