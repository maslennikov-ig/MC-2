/**
 * Vitest global setup/teardown for UNIT tests
 * Only teardown is needed - closes any open connections
 */
import { closeRedisClient } from '../src/shared/cache/redis.js';

// Empty setup - unit tests don't need BullMQ worker
export async function setup() {
  // No setup needed for unit tests
}

export async function teardown() {
  console.log('\n=== UNIT TESTS TEARDOWN ===');

  // Close Redis connection if open (some unit tests import modules that connect)
  try {
    await closeRedisClient();
    console.log('✅ Redis connection closed');
  } catch {
    // Ignore - connection may not exist
  }

  console.log('✅ Teardown complete\n');
}
