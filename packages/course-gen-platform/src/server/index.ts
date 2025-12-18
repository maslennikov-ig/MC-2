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
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './app-router';
import { createContext } from './trpc';
import { setupBullBoardUI, createMetricsRouter } from '../orchestrator/ui';
import logger from '../shared/logger';
import { validateEnvironment } from '../shared/config/env-validator';
import { warmupEmbeddingCache } from '../shared/validation/semantic-matching';
import { findAvailablePort } from '../shared/utils/find-available-port';

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
      exercise_types: ['coding', 'derivation', 'interpretation', 'debugging', 'refactoring', 'analysis'],

      // Stage 5: exercise_type (database)
      exercise_type: ['self_assessment', 'case_study', 'hands_on', 'discussion', 'quiz', 'simulation', 'reflection'],

      // primary_strategy
      primary_strategy: ['problem-based learning', 'lecture-based', 'inquiry-based', 'project-based', 'mixed'],

      // target_audience
      target_audience: ['beginner', 'intermediate', 'advanced', 'mixed'],

      // difficulty_level
      difficulty_level: ['beginner', 'intermediate', 'advanced'],

      // cognitiveLevel (Bloom's taxonomy)
      cognitiveLevel: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'],

      // teaching_style
      teaching_style: ['hands-on', 'theory-first', 'project-based', 'mixed'],

      // practical_focus
      practical_focus: ['high', 'medium', 'low'],

      // importance
      importance: ['core', 'important', 'supplementary', 'optional'],

      // difficulty_progression
      difficulty_progression: ['gradual', 'steep', 'mixed'],
    });

    logger.info('[Startup] Embedding cache ready');
  } catch (error) {
    // Non-critical - server can start without semantic matching
    logger.warn({ error }, '[Startup] Failed to warm up embedding cache (semantic matching will be unavailable)');
  }
}

// Initialize services asynchronously (non-blocking)
void initializeServices().catch(err => logger.warn({ err }, 'Failed to initialize services'));

// Configuration constants
const PREFERRED_PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || '*';

/**
 * Initialize Express application with middleware
 */
const app: express.Application = express();

/**
 * CORS Configuration
 *
 * In development: Allow all origins for easier testing
 * In production: Use CORS_ORIGIN environment variable (comma-separated list)
 */
app.use(
  cors({
    origin: IS_PRODUCTION ? CORS_ORIGIN : '*',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

// Parse JSON request bodies (for file upload metadata, etc.)
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Request Logging Middleware
 *
 * Logs all incoming requests with:
 * - HTTP method and URL
 * - Request timestamp
 * - Response status code
 * - Request duration in milliseconds
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const { method, url } = req;

  // Log request start
  logger.info({
    method,
    url,
    userAgent: req.get('user-agent'),
    ip: req.ip,
  }, 'Incoming request');

  // Capture response finish to log duration
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { statusCode } = res;

    logger.info({
      method,
      url,
      statusCode,
      duration,
    }, 'Request completed');
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
      logger.error({
        path,
        type,
        code: error.code,
        message: error.message,
        userId: ctx?.user?.id,
        organizationId: ctx?.user?.organizationId,
        stack: error.stack,
      }, 'tRPC error');
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
  logger.info({
    endpoints: ['/metrics', '/health'],
  }, 'Metrics router mounted');
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
  logger.error({
    err,
    method: req.method,
    url: req.url,
    stack: err.stack,
  }, 'Unhandled Express error');

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
      logger.warn({
        preferredPort: PREFERRED_PORT,
        actualPort: port,
        reason: 'Preferred port was already in use',
      }, 'Using alternative port');
    }

    // Start the HTTP server
    const server = app.listen(port, () => {
      logger.info({
        port,
        nodeEnv: NODE_ENV,
        endpoints: {
          api: `http://localhost:${port}/trpc`,
          adminUI: `http://localhost:${port}/admin/queues`,
          metrics: `http://localhost:${port}/metrics`,
          health: `http://localhost:${port}/health`,
        },
      }, 'Server started');

      // Log CORS configuration
      logger.info({
        origins: IS_PRODUCTION ? CORS_ORIGIN : 'All origins (development)',
      }, 'CORS configured');
    });

    /**
     * Graceful Shutdown Handler
     *
     * Handles SIGTERM and SIGINT signals to gracefully shut down the server.
     * This ensures:
     * - Active requests are completed
     * - Database connections are closed
     * - Worker processes are stopped
     */
    function gracefulShutdown(signal: string) {
      logger.info({ signal }, 'Shutdown signal received');

      server.close(() => {
        logger.info('HTTP server closed');

        // Close database connections, workers, etc.
        // TODO: Add cleanup for:
        // - Supabase client connections
        // - Redis connections
        // - BullMQ worker instances
        // - Any other resources that need cleanup

        logger.info('Graceful shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 30 seconds if graceful shutdown fails
      setTimeout(() => {
        logger.error('Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, 30000);
    }

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    // Failed to find an available port or start the server
    logger.error({
      err: error,
      preferredPort: PREFERRED_PORT,
    }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
startServer().catch((err) => {
  logger.error({ err }, 'Unhandled error during server startup');
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({
    reason,
    promise,
  }, 'Unhandled Promise Rejection');
  // In production, you might want to exit the process
  // process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error({
    err: error,
    stack: error.stack,
  }, 'Uncaught Exception');
  // Exit process on uncaught exception
  process.exit(1);
});

// Export app for testing
export default app;
