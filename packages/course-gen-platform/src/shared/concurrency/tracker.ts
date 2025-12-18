/**
 * Concurrency tracker with Redis-based atomic operations
 * @module concurrency/tracker
 */

import { Redis } from 'ioredis';
import { getRedisClient } from '../cache/redis';
import logger from '../logger';
import { UserTier, ConcurrencyCheckResult } from '../types/concurrency';

export const TIER_LIMITS = {
  TRIAL: 5,
  FREE: 1,
  BASIC: 2,
  STANDARD: 5,
  PREMIUM: 10,
} as const;

export const TIER_PRIORITY = {
  TRIAL: 5,
  FREE: 1,
  BASIC: 3,
  STANDARD: 5,
  PREMIUM: 10,
} as const;

export class ConcurrencyTracker {
  private redis: Redis;
  private globalLimit: number;

  constructor() {
    this.redis = getRedisClient();
    this.globalLimit = parseInt(process.env.GLOBAL_CONCURRENCY_LIMIT || '3');
  }

  async checkAndReserve(userId: string, tier: UserTier): Promise<ConcurrencyCheckResult> {
    const userLimit = TIER_LIMITS[tier];
    const globalLimit = this.globalLimit;

    // Lua script for atomic check-and-increment
    const script = `
      local user_key = KEYS[1]
      local global_key = KEYS[2]
      local user_limit = tonumber(ARGV[1])
      local global_limit = tonumber(ARGV[2])

      local user_count = tonumber(redis.call('GET', user_key) or 0)
      local global_count = tonumber(redis.call('GET', global_key) or 0)

      if user_count >= user_limit then
        return {'0', 'user_limit', tostring(user_count), tostring(user_limit), tostring(global_count), tostring(global_limit)}
      end

      if global_count >= global_limit then
        return {'0', 'global_limit', tostring(user_count), tostring(user_limit), tostring(global_count), tostring(global_limit)}
      end

      redis.call('INCR', user_key)
      redis.call('EXPIRE', user_key, 3600)  -- 1 hour TTL
      redis.call('INCR', global_key)

      return {'1', 'success', tostring(user_count + 1), tostring(user_limit), tostring(global_count + 1), tostring(global_limit)}
    `;

    try {
      const result = await this.redis.eval(
        script,
        2, // 2 keys
        `concurrency:user:${userId}`,
        'concurrency:global',
        userLimit,
        globalLimit
      ) as string[];

      const [success, reason, userCount, userLimitStr, globalCount, globalLimitStr] = result;

      if (success === '1') {
        return {
          allowed: true,
          reason: 'success' as const,
          current_user_jobs: parseInt(userCount),
          user_limit: parseInt(userLimitStr),
          current_global_jobs: parseInt(globalCount),
          global_limit: parseInt(globalLimitStr),
        };
      } else {
        return {
          allowed: false,
          reason: reason as 'user_limit' | 'global_limit',
          current_user_jobs: parseInt(userCount),
          user_limit: parseInt(userLimitStr),
          current_global_jobs: parseInt(globalCount),
          global_limit: parseInt(globalLimitStr),
        };
      }
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : String(error), userId, tier }, 'Concurrency check failed');
      throw error;
    }
  }

  async release(userId: string): Promise<void> {
    try {
      await Promise.all([
        this.redis.decr(`concurrency:user:${userId}`),
        this.redis.decr('concurrency:global')
      ]);

      logger.debug({ userId }, 'Concurrency slot released');
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : String(error), userId }, 'Failed to release concurrency slot');
      // Don't throw - log and continue (counters will reconcile)
    }
  }
}

export const concurrencyTracker = new ConcurrencyTracker();
