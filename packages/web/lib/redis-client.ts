/**
 * Redis client singleton for Next.js web application
 * Follows the pattern from packages/course-gen-platform/src/shared/cache/redis.ts
 * @module lib/redis-client
 */

import Redis from 'ioredis'
import { logger } from './logger'

let redisClient: Redis | null = null

/**
 * Get or create Redis client singleton
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 10000,
      keepAlive: 30000,
      family: 4,
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000)
        if (times > 10) {
          logger.warn('Redis retry limit reached (10 attempts)')
          return null
        }
        return delay
      },
      reconnectOnError(err: Error) {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT']
        if (targetErrors.some(e => err.message.includes(e))) {
          logger.warn('Redis reconnecting on error', { error: err.message })
          return true
        }
        return false
      },
    })

    redisClient.on('error', (err: Error) => {
      logger.error('Redis connection error:', err)
    })

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully')
    })

    redisClient.on('reconnecting', (delay: number) => {
      logger.warn(`Redis reconnecting in ${delay}ms`)
    })

    redisClient.on('end', () => {
      logger.error('Redis connection ended, no more reconnections')
    })

    redisClient.on('close', () => {
      logger.warn('Redis connection closed')
    })
  }

  return redisClient
}

export interface CacheOptions {
  ttl?: number // Time to live in seconds
}

/**
 * Redis cache wrapper class with get/set/delete/exists operations
 */
export class RedisCache {
  private client: Redis
  private connected: boolean = false
  private connecting: Promise<void> | null = null

  constructor() {
    this.client = getRedisClient()
  }

  private async ensureConnection(): Promise<void> {
    if (this.connected) return

    // Prevent concurrent connection attempts
    if (this.connecting) {
      await this.connecting
      return
    }

    this.connecting = (async () => {
      try {
        await this.client.connect()
        this.connected = true
        logger.info('Redis connected successfully')
      } catch (error) {
        logger.error('Redis connection failed, degrading gracefully', {
          error: error instanceof Error ? error.message : String(error),
        })
        // Graceful degradation - app continues without Redis
      } finally {
        this.connecting = null
      }
    })()

    await this.connecting
  }

  /**
   * Get value from Redis
   * @param key - Redis key
   * @returns Parsed value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    await this.ensureConnection()
    if (!this.connected) return null

    try {
      const value = await this.client.get(key)
      return value ? (JSON.parse(value) as T) : null
    } catch (error) {
      logger.error('Redis GET error:', { key, error })
      return null
    }
  }

  /**
   * Set value in Redis with optional TTL
   * @param key - Redis key
   * @param value - Value to store (will be JSON stringified)
   * @param options - Optional TTL in seconds
   * @returns Success boolean
   */
  async set(key: string, value: unknown, options?: CacheOptions): Promise<boolean> {
    await this.ensureConnection()
    if (!this.connected) return false

    try {
      const serialized = JSON.stringify(value)
      if (options?.ttl) {
        await this.client.setex(key, options.ttl, serialized)
      } else {
        await this.client.set(key, serialized)
      }
      return true
    } catch (error) {
      logger.error('Redis SET error:', { key, error })
      return false
    }
  }

  /**
   * Delete key from Redis
   * @param key - Redis key
   * @returns Success boolean
   */
  async delete(key: string): Promise<boolean> {
    await this.ensureConnection()
    if (!this.connected) return false

    try {
      await this.client.del(key)
      return true
    } catch (error) {
      logger.error('Redis DELETE error:', { key, error })
      return false
    }
  }

  /**
   * Check if key exists in Redis
   * @param key - Redis key
   * @returns True if key exists
   */
  async exists(key: string): Promise<boolean> {
    await this.ensureConnection()
    if (!this.connected) return false

    try {
      const result = await this.client.exists(key)
      return result === 1
    } catch (error) {
      logger.error('Redis EXISTS error:', { key, error })
      return false
    }
  }
}

// Export singleton instance
export const redisCache = new RedisCache()
export default redisCache
