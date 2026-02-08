/**
 * Express Server Entrypoint
 * @module server/index
 *
 * This is the main entry point for the MegaCampusAI tRPC API server.
 * It sets up Express with the following components:
 * - tRPC middleware on /trpc endpoint
 * - BullMQ Board UI on /admin/queues
 * - Metrics and health check endpoints
 * - CORS configuration for external clients
 * - Request logging middleware
 * - Global error handling
 *
 * ## Architecture
 *
 * The server integrates multiple subsystems:
 * - **tRPC API**: Type-safe API layer with Supabase Auth (T048, T054-T058)
 * - **BullMQ UI**: Job queue monitoring dashboard (T042)
 * - **Metrics**: Prometheus-style metrics and health checks (T042)
 * - **Logging**: Structured JSON logging for all requests (T011)
 *
 * ## Environment Variables
 *
 * Required environment variables (from .env):
 * - `PORT`: Server port (default: 3000)
 * - `NODE_ENV`: Environment (development/production)
 * - `CORS_ORIGIN`: Allowed CORS origins in production (comma-separated)
 * - `SUPABASE_URL`: Supabase project URL
 * - `SUPABASE_SERVICE_KEY`: Supabase service role key
 * - `REDIS_URL`: Redis connection URL for BullMQ
 *
 * ## Usage
 *
 * Development:
 * ```bash
 * pnpm dev
 * # or
 * pnpm tsx src/server/index.ts
 * ```
 *
 * Production:
 * ```bash
 * pnpm build
 * pnpm start
 * # or
 * node dist/server/index.js
 * ```
 *
 * ## Endpoints
 *
 * - `POST /trpc/*` - tRPC API procedures (batching supported)
 * - `GET /admin/queues` - BullMQ Board UI dashboard
 * - `GET /metrics` - Job metrics in JSON format
 * - `GET /health` - Health check endpoint
 *
 * @see {@link appRouter} - Main tRPC router (T058)
 * @see {@link createContext} - tRPC context with Supabase Auth (T048)
 */

import 'dotenv/config';
import { initSentry } from '../shared/sentry/init.js';
initSentry();
import { setMaxListeners } from 'events';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';

// Increase max listeners globally to prevent MaxListenersExceededWarning
// during parallel LLM requests with AbortSignal timeouts
setMaxListeners(30);
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './app-router';
import { createContext } from './trpc';
import { setupBullBoardUI, createMetricsRouter } from '../orchestrator/ui';
import logger from '../shared/logger';
import { validateEnvironment } from '../shared/config/env-validator';
import { warmupEmbeddingCache } from '../shared/validation/semantic-matching';
import { findAvailablePort } from '../shared/utils/find-available-port';
import { registerCleanupHandler, runCleanupHandlers } from '../shared/graceful-shutdown';
import { closeRedisClient } from '../shared/cache/redis';
import { closeQueue, stopWorker } from '../orchestrator';
import { generationLockService } from '../shared/locks';

// Validate all required environment variables at startup
// This ensures fail-fast behavior if critical configuration is missing
validateEnvironment();

/**
 * Startup initialization: Warm up embedding cache for semantic matching
 *
 * This runs asynchronously during server startup to pre-cache embeddings
 * for all enum values used in validation. This improves latency for the
 * first validation requests.
 */
async function initializeServices() {
  try {
    logger.info('[Startup] Warming up embedding cache for semantic matching...');

    await warmupEmbeddingCache({
      // Stage 4: exercise_types (advisory guidance)
      exercise_types: [
        'coding',
        'derivation',
        'interpretation',
        'debugging',
        'refactoring',
        'analysis',
      ],

      // Stage 5: exercise_type (database)
      exercise_type: [
        'self_assessment',
        'case_study',
        'hands_on',
        'discussion',
        'quiz',
        'simulation',
        'reflection',
      ],

      // target_audience
      target_audience: ['beginner', 'intermediate', 'advanced', 'mixed'],

      // difficulty_level
      difficulty_level: ['beginner', 'intermediate', 'advanced'],

      // importance
      importance: ['simple', 'normal', 'complex'],
    });

    logger.info('[Startup] Embedding cache ready');

    // Warm error_logs database cache
    // This prevents 8+ second cold cache timeout on first admin panel access (mc2-ahmo)
    await warmDatabaseCache();
  } catch (error) {
    // Non-critical - server can start without semantic matching
    logger.warn(
      { error },
      '[Startup] Failed to warm up embedding cache (semantic matching will be unavailable)'
    );
  }
}

/**
 * Warm database cache for error_logs grouped view
 *
 * The get_grouped_error_logs RPC takes 8+ seconds on cold cache because it
 * needs to read 118MB of data from disk. By running a minimal query at startup,
 * we load the index pages into PostgreSQL shared_buffers, reducing subsequent
 * queries to ~300-600ms.
 *
 * @see mc2-ahmo - Optimize get_grouped_error_logs RPC - statement timeout
 */
async function warmDatabaseCache(): Promise<void> {
  try {
    logger.info('[Startup] Warming database cache for error_logs...');
    const startTime = Date.now();

    // Dynamic import to avoid circular dependencies
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.warn('[Startup] Supabase credentials not available, skipping cache warmup');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Run minimal query to load index pages into shared_buffers
    await supabase.rpc('get_grouped_error_logs', {
      p_limit: 1,
      p_offset: 0,
    });

    const elapsed = Date.now() - startTime;
    logger.info({ elapsed_ms: elapsed }, '[Startup] Database cache warmed for error_logs');
  } catch (error) {
    // Non-critical - application continues even if warming fails
    logger.warn({ error }, '[Startup] Failed to warm database cache (non-fatal)');
  }
}

// Initialize services asynchronously (non-blocking)
void initializeServices().catch(err => logger.warn({ err }, 'Failed to initialize services'));

// Configuration constants
const PREFERRED_PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || '*';

// Module-level reference to shutdown timer for cleanup in global handlers
let forceShutdownTimerRef: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize Express application with middleware
 */
const app: express.Application = express();

/**
 * CORS Configuration
 *
 * In development: Allow localhost and private network IPs (LAN access)
 * In production: Use CORS_ORIGIN environment variable (comma-separated list)
 */
const isPrivateNetworkOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    // Allow localhost
    if (host === 'localhost' || host === '127.0.0.1') return true;
    // Allow private network ranges (RFC 1918)
    const ipMatch = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      // 10.x.x.x, 172.16-31.x.x, 192.168.x.x
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
    }
    return false;
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin: IS_PRODUCTION
      ? CORS_ORIGIN
      : (origin, callback) => {
          // Allow requests with no origin (e.g., mobile apps, curl)
          if (!origin || isPrivateNetworkOrigin(origin)) {
            callback(null, true);
          } else {
            callback(new Error('CORS not allowed'), false);
          }
        },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

// Parse JSON request bodies (for file upload metadata, etc.)
// Limit set to 100MB to support premium tier (max file size)
// Tier-based validation happens in frontend (FileUpload) and backend (tRPC)
app.use(express.json({ limit: '100mb' }));

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

/**
 * Request Logging Middleware
 *
 * Logs all requests with single aggregated entry containing:
 * - HTTP method and URL
 * - Response status code
 * - Request duration in milliseconds
 *
 * Design: Single log entry per request (not two) to reduce log noise.
 * Use LOG_LEVEL=trace to see polling and request start events.
 */

// Polling endpoints to log at trace level (reduce noise in dev)
const POLLING_ENDPOINTS = [
  'jobs.getStatus',
  'jobs.getBatchStatus',
  'generation.getProgress',
  'health',
];

app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const { method, url } = req;

  // Log request start only at trace level (reduces noise in dev)
  logger.trace(
    {
      method,
      url,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    },
    'Request started'
  );

  // Log single aggregated entry on response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { statusCode } = res;

    // Check if this is a polling endpoint (log at trace level)
    const isPolling = POLLING_ENDPOINTS.some(ep => url.includes(ep));

    // Use warn for errors, trace for polling, info for normal requests
    const logLevel = statusCode >= 400 ? 'warn' : isPolling ? 'trace' : 'info';
    logger[logLevel](
      {
        method,
        url,
        statusCode,
        duration,
      },
      `${method} ${url.split('?')[0]} ${statusCode} (${duration}ms)`
    );
  });

  next();
});

/**
 * Root Health Check
 *
 * Basic health check at root path for load balancers
 */
app.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'MegaCampusAI tRPC API Server',
    version: '1.0.0',
    endpoints: {
      trpc: '/trpc',
      adminQueues: '/admin/queues',
      metrics: '/metrics',
      health: '/health',
    },
  });
});

/**
 * tRPC Middleware
 *
 * Mounts the unified tRPC app router at /trpc endpoint.
 * Supports:
 * - Request batching for performance
 * - JWT authentication via Authorization header
 * - Role-based authorization (Admin, Instructor, Student)
 * - Type-safe input/output validation with Zod
 *
 * The createContext function extracts and validates JWT tokens
 * from the Authorization header and populates user context.
 *
 * @see {@link appRouter} - Combined router with 11 endpoints
 * @see {@link createContext} - JWT validation and user extraction
 */
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: async ({ req }) => {
      // Adapt Express req/res to Fetch API Request for createContext
      // The createContext function expects FetchCreateContextFnOptions
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const headers = new Headers();

      // Copy headers from Express request to Headers object
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach(v => headers.append(key, v));
          } else {
            headers.set(key, value);
          }
        }
      });

      // Create a Fetch API Request object
      const fetchRequest = new Request(url, {
        method: req.method,
        headers,
      });

      // Call the existing createContext with adapted request
      return createContext({
        req: fetchRequest,
        resHeaders: new Headers(),
        info: {
          isBatchCall: false,
          calls: [],
          accept: 'application/jsonl' as const,
          type: 'query' as const,
          connectionParams: null,
          signal: new AbortController().signal,
          url: new URL(url),
        },
      });
    },
    onError: ({ path, error, type, ctx }) => {
      // Log tRPC errors with context
      logger.error(
        {
          path,
          type,
          code: error.code,
          message: error.message,
          userId: ctx?.user?.id,
          organizationId: ctx?.user?.organizationId,
          stack: error.stack,
        },
        'tRPC error'
      );
    },
  })
);

/**
 * BullMQ Board UI
 *
 * Mounts the Bull Board UI at /admin/queues for job monitoring.
 * Provides a web interface to:
 * - View all jobs in the queue
 * - Inspect job data and results
 * - Retry failed jobs
 * - Clean old jobs
 *
 * Note: In production, this should be protected with authentication.
 * Consider adding middleware to check for admin role.
 */
try {
  const bullBoardRouter = setupBullBoardUI();
  app.use('/admin/queues', bullBoardRouter);
  logger.info({ path: '/admin/queues' }, 'BullMQ Board UI mounted');
} catch (error) {
  logger.error({ err: error }, 'Failed to setup BullMQ Board UI');
  // Non-critical - server can continue without UI
}

/**
 * Metrics and Health Check Endpoints
 *
 * Mounts additional monitoring endpoints:
 * - GET /metrics - Job metrics (counts, rates, durations)
 * - GET /health - Queue health status
 */
try {
  const metricsRouter = createMetricsRouter();
  app.use(metricsRouter);
  logger.info(
    {
      endpoints: ['/metrics', '/health'],
    },
    'Metrics router mounted'
  );
} catch (error) {
  logger.error({ err: error }, 'Failed to setup metrics router');
  // Non-critical - server can continue without metrics
}

/**
 * 404 Handler
 *
 * Handle requests to unknown endpoints
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
  });
});

/**
 * Global Error Handler
 *
 * Catches all unhandled errors in Express middleware chain.
 * Returns JSON error responses and logs errors with context.
 */
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error(
    {
      err,
      method: req.method,
      url: req.url,
      stack: err.stack,
    },
    'Unhandled Express error'
  );

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: IS_PRODUCTION ? 'An unexpected error occurred' : err.message, // Show error details in development
  });
});

/**
 * Start the server with dynamic port selection
 *
 * This async function finds an available port starting from the preferred
 * port and increments if necessary to avoid EADDRINUSE errors.
 */
async function startServer() {
  try {
    // Find an available port starting from the preferred port
    const port = await findAvailablePort(PREFERRED_PORT, 10);

    // Log a warning if we had to use a different port
    if (port !== PREFERRED_PORT) {
      logger.warn(
        {
          preferredPort: PREFERRED_PORT,
          actualPort: port,
          reason: 'Preferred port was already in use',
        },
        'Using alternative port'
      );
    }

    // Start the HTTP server
    const server = app.listen(port, () => {
      logger.info(
        {
          port,
          nodeEnv: NODE_ENV,
          endpoints: {
            api: `http://localhost:${port}/trpc`,
            adminUI: `http://localhost:${port}/admin/queues`,
            metrics: `http://localhost:${port}/metrics`,
            health: `http://localhost:${port}/health`,
          },
        },
        'Server started'
      );

      // Log CORS configuration
      logger.info(
        {
          origins: IS_PRODUCTION ? CORS_ORIGIN : 'All origins (development)',
        },
        'CORS configured'
      );
    });

    /**
     * Register cleanup handlers for graceful shutdown
     *
     * Priority order (lower = first):
     * 1. Release generation locks (priority 5) - prevent deadlocks
     * 2. Stop BullMQ workers (priority 10) - stop processing new jobs
     * 3. Close BullMQ queue (priority 20) - close queue connections
     * 4. Close Redis client (priority 100) - last since others depend on it
     *
     * Note: Supabase client doesn't need explicit cleanup - it uses HTTP
     * connections that close automatically.
     */
    registerCleanupHandler(
      'generation-locks',
      async () => {
        const released = await generationLockService.releaseAllLocks();
        logger.info({ released }, 'Generation locks released');
      },
      5
    );

    registerCleanupHandler(
      'bullmq-workers',
      async () => {
        await stopWorker(false); // graceful stop
      },
      10
    );

    registerCleanupHandler(
      'bullmq-queue',
      async () => {
        await closeQueue();
      },
      20
    );

    registerCleanupHandler(
      'redis',
      async () => {
        await closeRedisClient();
      },
      100
    );

    /**
     * Graceful Shutdown Handler
     *
     * Handles SIGTERM and SIGINT signals to gracefully shut down the server.
     * This ensures:
     * - Active requests are completed
     * - Generation locks are released
     * - BullMQ workers stop processing
     * - Queue and Redis connections are closed
     */
    let isShuttingDown = false;

    async function gracefulShutdown(signal: string): Promise<void> {
      // Prevent multiple shutdown attempts
      if (isShuttingDown) {
        logger.warn({ signal }, 'Shutdown already in progress, ignoring signal');
        return;
      }
      isShuttingDown = true;

      logger.info({ signal }, 'Shutdown signal received');

      // Set force shutdown timeout (30 seconds)
      forceShutdownTimerRef = setTimeout(() => {
        logger.error('Graceful shutdown timeout (30s), forcing exit');
        process.exit(1);
      }, 30000);

      // Close HTTP server first (stop accepting new requests)
      await new Promise<void>(resolve => {
        server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });

      // Run all cleanup handlers (with 25s timeout, leaving 5s buffer)
      const result = await runCleanupHandlers(25000);

      logger.info(
        {
          total: result.total,
          succeeded: result.succeeded,
          failed: result.failed,
          timedOut: result.timedOut,
        },
        'Graceful shutdown complete'
      );

      // Clear the force shutdown timer
      if (forceShutdownTimerRef) {
        clearTimeout(forceShutdownTimerRef);
        forceShutdownTimerRef = null;
      }

      // Exit with appropriate code
      process.exit(result.failed > 0 ? 1 : 0);
    }

    // Register shutdown handlers
    process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    // Failed to find an available port or start the server
    logger.error(
      {
        err: error,
        preferredPort: PREFERRED_PORT,
      },
      'Failed to start server'
    );
    process.exit(1);
  }
}

// Start the server
startServer().catch(err => {
  logger.error({ err }, 'Unhandled error during server startup');
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(
    {
      reason,
      promise,
    },
    'Unhandled Promise Rejection'
  );
  // In production, you might want to exit the process
  // process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  // Clear shutdown timer if running to prevent memory leak
  if (forceShutdownTimerRef) {
    clearTimeout(forceShutdownTimerRef);
    forceShutdownTimerRef = null;
  }

  logger.error(
    {
      err: error,
      stack: error.stack,
    },
    'Uncaught Exception'
  );
  // Exit process on uncaught exception
  process.exit(1);
});

// Export app for testing
export default app;
