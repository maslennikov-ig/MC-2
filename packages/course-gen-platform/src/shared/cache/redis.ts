/**
 * Redis cache utility with TTL support
 * @module cache/redis
 */

import Redis from 'ioredis';
import logger from '../logger';

let redisClient: Redis | null = null;
let isConnected = false; // Module-level connection state (shared across all RedisCache instances)
let connectionPromise: Promise<void> | null = null; // Module-level connection promise

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,  // Required for BullMQ
      enableOfflineQueue: true,  // Always enable for resilience - allows commands to queue while reconnecting
      lazyConnect: true,
      connectTimeout: 10000,
      keepAlive: 30000,
      family: 4,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        if (times > 10) {
          logger.warn('Redis retry limit reached (10 attempts)');
          return null;
        }
        return delay;
      },
      reconnectOnError(err) {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        if (targetErrors.some(e => err.message.includes(e))) {
          logger.warn({ error: err.message }, 'Redis reconnecting on error');
          return true;
        }
        return false;
      },
    });

    redisClient.on('error', err => {
      logger.error({ err: err }, 'Redis connection error');
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('reconnecting', (delay: number) => {
      logger.warn(`Redis reconnecting in ${delay}ms`);
    });

    redisClient.on('end', () => {
      logger.error('Redis connection ended, no more reconnections');
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redisClient;
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient !== null && redisClient.status === 'ready';
}

/**
 * Ensure Redis connection with timeout
 * Useful for graceful startup where Redis might not be immediately available
 */
export async function ensureRedisConnection(timeoutMs: number = 5000): Promise<boolean> {
  const client = getRedisClient();

  try {
    if (client.status === 'ready') {
      return true;
    }

    if (client.status === 'wait') {
      await client.connect();
    }

    // Ping with timeout
    await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis ping timeout')), timeoutMs)
      )
    ]);

    return true;
  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
      timeout: timeoutMs,
    }, 'Redis connection check failed (graceful degradation)');
    return false;
  }
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
}

export class RedisCache {
  private client: Redis;

  constructor() {
    this.client = getRedisClient();
  }

  private async ensureConnection(): Promise<void> {
    // Check client status first - if already connected, update module state
    if (this.client.status === 'ready' || this.client.status === 'connect') {
      isConnected = true;
      return;
    }

    // Already marked as connected at module level
    if (isConnected) return;

    // Prevent concurrent connection attempts across all instances
    if (connectionPromise) {
      await connectionPromise;
      return;
    }

    connectionPromise = (async () => {
      try {
        // Double-check status before attempting connect
        if (this.client.status !== 'ready' && this.client.status !== 'connect') {
          await this.client.connect();
        }
        isConnected = true;
      } catch (error) {
        // Handle "already connecting/connected" gracefully - this is not an error
        if (error instanceof Error && error.message.includes('already')) {
          isConnected = true;
          return;
        }
        logger.error({
          error: error instanceof Error ? error.message : String(error),
        }, 'Redis connection failed, degrading gracefully');
        // Graceful degradation - app continues without Redis
      } finally {
        connectionPromise = null;
      }
    })();

    await connectionPromise;
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ensureConnection();
    if (!isConnected) return null;

    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      logger.error({ key, err: error instanceof Error ? error.message : String(error) }, 'Redis GET error');
      return null;
    }
  }

  async set(key: string, value: unknown, options?: CacheOptions): Promise<boolean> {
    await this.ensureConnection();
    if (!isConnected) return false;

    try {
      const serialized = JSON.stringify(value);
      if (options?.ttl) {
        await this.client.setex(key, options.ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error({ key, err: error instanceof Error ? error.message : String(error) }, 'Redis SET error');
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    await this.ensureConnection();
    if (!isConnected) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error({ key, err: error instanceof Error ? error.message : String(error) }, 'Redis DELETE error');
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnection();
    if (!isConnected) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ key, err: error instanceof Error ? error.message : String(error) }, 'Redis EXISTS error');
      return false;
    }
  }
}

export const cache = new RedisCache();
export default cache;
