/**
 * Redis cache utility with TTL support
 * @module cache/redis
 */

import Redis from 'ioredis';
import logger from '../logger';

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/** Maximum reconnection attempts before circuit breaker triggers (~26 minutes) */
const REDIS_MAX_RECONNECT_ATTEMPTS = 60;

/** Base delay for exponential backoff (ms) */
const REDIS_BACKOFF_BASE_MS = 100;

/** Maximum delay between reconnection attempts (ms) */
const REDIS_BACKOFF_MAX_MS = 30000;

/** Log reconnection progress every N attempts */
const REDIS_LOG_INTERVAL = 10;

/** Warning threshold - approaching circuit breaker */
const REDIS_WARNING_THRESHOLD = 50;

/** Time to wait for graceful shutdown before forced exit (ms) */
const REDIS_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30000;

/**
 * Custom event emitted when Redis is unavailable for extended period
 * Workers should listen to this event to perform graceful shutdown
 */
export const REDIS_UNAVAILABLE_EVENT = 'REDIS_UNAVAILABLE';

// ============================================================================
// MODULE STATE
// ============================================================================

let redisClient: Redis | null = null;
let isConnected = false; // Module-level connection state (shared across all RedisCache instances)
let connectionPromise: Promise<void> | null = null; // Module-level connection promise
let isClosing = false; // Guard against concurrent close calls

// Health tracking
let reconnectionAttempts = 0;
let firstFailureTime: number | null = null;
let isShuttingDown = false; // Flag for graceful shutdown coordination

// ============================================================================
// SIGTERM/SIGINT HANDLING
// ============================================================================

/**
 * Handle graceful shutdown signals
 * Stops Redis reconnection attempts to allow clean worker shutdown
 */
function handleShutdownSignal(signal: string): void {
  if (isShuttingDown) return; // Already handling
  isShuttingDown = true;
  logger.info({ signal }, 'Shutdown signal received, stopping Redis reconnection attempts');
}

// Register once at module load (use process.once to prevent handler stacking on re-import)
process.once('SIGTERM', () => handleShutdownSignal('SIGTERM'));
process.once('SIGINT', () => handleShutdownSignal('SIGINT'));

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableOfflineQueue: true, // Always enable for resilience - allows commands to queue while reconnecting
      lazyConnect: true,
      connectTimeout: 10000,
      keepAlive: 30000,
      family: 4,
      retryStrategy(times) {
        // Track reconnection state for health monitoring
        reconnectionAttempts = times;
        if (times === 1) {
          firstFailureTime = Date.now();
        }

        // Stop retrying if graceful shutdown is in progress
        if (isShuttingDown) {
          logger.info({ attempts: times }, 'Shutdown in progress, stopping Redis reconnection');
          return null;
        }

        // Exponential backoff: 100ms, 200ms, 400ms... up to 30s max
        const delay = Math.min(
          REDIS_BACKOFF_BASE_MS * Math.pow(2, times - 1),
          REDIS_BACKOFF_MAX_MS
        );

        // Log progress at regular intervals
        if (times % REDIS_LOG_INTERVAL === 0) {
          const minutesElapsed = firstFailureTime
            ? ((Date.now() - firstFailureTime) / 60000).toFixed(1)
            : '0';
          logger.warn(
            { attempts: times, nextDelayMs: delay, minutesElapsed },
            'Redis reconnecting...'
          );
        }

        // After ~26 minutes of trying, initiate graceful shutdown
        if (times >= REDIS_MAX_RECONNECT_ATTEMPTS) {
          const minutesElapsed = firstFailureTime
            ? ((Date.now() - firstFailureTime) / 60000).toFixed(1)
            : '~26';
          logger.error(
            { attempts: times, minutesElapsed },
            'Redis unavailable for extended period, initiating graceful shutdown'
          );

          // Emit event for workers to perform graceful shutdown
          // Workers should listen: process.on('REDIS_UNAVAILABLE', () => gracefulShutdown())
          (process as NodeJS.EventEmitter).emit(REDIS_UNAVAILABLE_EVENT);

          // Give workers time to finish current jobs before forced exit
          setTimeout(() => {
            logger.error(
              { timeoutMs: REDIS_GRACEFUL_SHUTDOWN_TIMEOUT_MS },
              'Graceful shutdown timeout expired, forcing exit'
            );
            process.exit(1);
          }, REDIS_GRACEFUL_SHUTDOWN_TIMEOUT_MS);

          return null; // Stop retrying
        }

        return delay;
      },
      reconnectOnError(err) {
        // Check error code property first (for DNS/network errors)
        const errorCode = (err as NodeJS.ErrnoException).code;
        if (errorCode) {
          const networkErrors = ['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'];
          if (networkErrors.includes(errorCode)) {
            logger.warn(
              { error: err.message, code: errorCode },
              'Redis reconnecting on network error'
            );
            return true;
          }
        }

        // Fallback to message check for Redis-specific errors (READONLY has no code)
        if (err.message.includes('READONLY')) {
          logger.warn({ error: err.message }, 'Redis reconnecting on READONLY error');
          return true;
        }

        return false;
      },
    });

    redisClient.on('error', err => {
      logger.error({ err: err }, 'Redis connection error');
    });

    redisClient.on('connect', () => {
      // Reset health tracking on successful connection
      reconnectionAttempts = 0;
      firstFailureTime = null;
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
 * Health status for Redis connection
 */
export interface RedisHealthStatus {
  connected: boolean;
  status: string;
  reconnectionAttempts: number;
  minutesSinceFirstFailure: number | null;
  shutdownImminent: boolean;
  isShuttingDown: boolean;
}

/**
 * Get detailed Redis health status for monitoring
 *
 * Use this in health check endpoints to monitor reconnection state:
 * - shutdownImminent: true when approaching circuit breaker threshold
 * - minutesSinceFirstFailure: time since Redis became unreachable
 *
 * @example
 * const health = getRedisHealth();
 * if (health.shutdownImminent) {
 *   // Alert operations team
 * }
 */
export function getRedisHealth(): RedisHealthStatus {
  return {
    connected: isRedisConnected(),
    status: redisClient?.status || 'not-initialized',
    reconnectionAttempts,
    minutesSinceFirstFailure: firstFailureTime
      ? Math.round(((Date.now() - firstFailureTime) / 60000) * 10) / 10
      : null,
    shutdownImminent: reconnectionAttempts >= REDIS_WARNING_THRESHOLD,
    isShuttingDown,
  };
}

/**
 * Close the Redis client connection (idempotent)
 *
 * Should be called during test teardown or application shutdown
 * to prevent file handle leaks. Safe to call multiple times.
 */
export async function closeRedisClient(): Promise<void> {
  // Already closed or closing - safe to call multiple times
  if (!redisClient || isClosing) {
    return;
  }

  isClosing = true;
  const client = redisClient;

  try {
    await client.quit();
    logger.info('Redis client closed successfully');
  } catch (error) {
    // Force disconnect if quit fails
    client.disconnect();
    logger.warn({ error }, 'Redis quit failed, forced disconnect');
  } finally {
    redisClient = null;
    isConnected = false;
    connectionPromise = null;
    isClosing = false;
  }
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
      ),
    ]);

    return true;
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        timeout: timeoutMs,
      },
      'Redis connection check failed (graceful degradation)'
    );
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
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'Redis connection failed, degrading gracefully'
        );
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
      logger.error(
        { key, err: error instanceof Error ? error.message : String(error) },
        'Redis GET error'
      );
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
      logger.error(
        { key, err: error instanceof Error ? error.message : String(error) },
        'Redis SET error'
      );
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
      logger.error(
        { key, err: error instanceof Error ? error.message : String(error) },
        'Redis DELETE error'
      );
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
      logger.error(
        { key, err: error instanceof Error ? error.message : String(error) },
        'Redis EXISTS error'
      );
      return false;
    }
  }
}

export const cache = new RedisCache();
export default cache;
