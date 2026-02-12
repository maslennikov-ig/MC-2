/**
 * Sentry error monitoring initialization
 * @module shared/sentry/init
 *
 * Gracefully handles missing SENTRY_DSN -- when not set, all Sentry
 * calls become no-ops (safe for development/test environments).
 */

import * as Sentry from '@sentry/node';
import { logger } from '../logger/index.js';

let initialized = false;

/**
 * Initialize Sentry SDK.
 * Must be called before any other Sentry operations.
 * Safe to call multiple times (idempotent).
 */
export function initSentry(): void {
  if (initialized) return;

  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.info('Sentry DSN not set — error tracking disabled');
    initialized = true;
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || 'unknown',
    // Only send errors, not performance traces
    tracesSampleRate: 0,
    // Don't send PII
    sendDefaultPii: false,
    beforeSend(event) {
      // Skip in test environment
      if (process.env.NODE_ENV === 'test') return null;
      return event;
    },
  });

  initialized = true;
  logger.info(
    { environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV },
    'Sentry initialized'
  );
}

/**
 * Capture exception to Sentry with optional context.
 * No-op when Sentry is not initialized (missing DSN).
 */
export function captureError(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: 'fatal' | 'error' | 'warning';
  }
): void {
  if (!process.env.SENTRY_DSN) return;

  const sentryError = error instanceof Error ? error : new Error(String(error));

  Sentry.withScope(scope => {
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }
    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }
    if (context?.level) {
      scope.setLevel(context.level);
    }
    Sentry.captureException(sentryError);
  });
}

/**
 * Flush Sentry events (call before process exit).
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  await Sentry.flush(timeout);
}
