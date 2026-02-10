/**
 * Metrics authentication middleware for tRPC
 * @module server/middleware/metrics-auth
 *
 * Provides authentication for metrics/monitoring endpoints that need to be
 * accessible both to:
 * 1. Authenticated admin users (via JWT Bearer token)
 * 2. Monitoring systems like Prometheus/Grafana (via METRICS_API_KEY)
 *
 * Authentication methods (checked in order):
 * - Bearer token (JWT): Standard user auth, requires admin or superadmin role
 * - X-API-Key header: Static API key from METRICS_API_KEY env var
 *
 * If METRICS_API_KEY is not set, only JWT-based admin auth is accepted.
 *
 * Security: This replaces previously public (unauthenticated) metrics endpoints
 * to prevent exposure of internal system state (error counts, queue depths,
 * failure reasons) to unauthenticated users.
 */

import { TRPCError } from '@trpc/server';
import { publicProcedure, middleware } from '../trpc';
import { logger } from '../../shared/logger/index.js';

/**
 * Metrics authentication middleware
 *
 * Allows access via either:
 * 1. Valid JWT with admin/superadmin role (standard tRPC auth)
 * 2. X-API-Key header matching METRICS_API_KEY env var (for Prometheus/Grafana)
 *
 * @throws {TRPCError} UNAUTHORIZED (401) if neither auth method succeeds
 */
const isMetricsAuthorized = middleware(async ({ ctx, next }) => {
  // Method 1: Check if user is authenticated with admin role (from JWT)
  if (ctx.user) {
    const adminRoles = ['superadmin', 'admin'];
    if (adminRoles.includes(ctx.user.role)) {
      return next({ ctx });
    }
    // User is authenticated but not admin - fall through to check API key
  }

  // Method 2: Check X-API-Key header against METRICS_API_KEY env var
  const metricsApiKey = process.env.METRICS_API_KEY;
  if (metricsApiKey) {
    const requestApiKey = ctx.req.headers.get('X-API-Key');
    if (requestApiKey && requestApiKey === metricsApiKey) {
      return next({ ctx });
    }
  }

  // Neither method succeeded
  logger.warn(
    { hasUser: !!ctx.user, userRole: ctx.user?.role },
    'Unauthorized metrics access attempt'
  );

  throw new TRPCError({
    code: 'UNAUTHORIZED',
    message: metricsApiKey
      ? 'Metrics access requires admin authentication (Bearer token) or valid X-API-Key header.'
      : 'Metrics access requires admin authentication (Bearer token). Set METRICS_API_KEY env var to enable API key access for monitoring systems.',
  });
});

/**
 * Metrics-authorized procedure
 *
 * Use this for metrics/monitoring endpoints that expose internal system state.
 * Accepts admin JWT or METRICS_API_KEY for monitoring system integration.
 *
 * NOTE for Prometheus/Grafana integration:
 * Set the METRICS_API_KEY environment variable and configure your scraper
 * to send the X-API-Key header:
 *
 *   curl -H "X-API-Key: $METRICS_API_KEY" http://localhost:3000/api/trpc/metrics.getAll
 *
 * @example
 * ```typescript
 * import { metricsAuthProcedure } from './middleware/metrics-auth';
 *
 * const metricsRouter = router({
 *   getAll: metricsAuthProcedure.query(() => {
 *     return getAllMetrics();
 *   }),
 * });
 * ```
 */
export const metricsAuthProcedure = publicProcedure.use(isMetricsAuthorized);
