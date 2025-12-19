/**
 * Logger for course-gen-platform
 * Re-exports from shared logger package for centralized configuration.
 *
 * Also exports error logging types and services for centralized error management.
 */
export {
  logger as default,
  logger,
  createChildLogger,
  createModuleLogger,
  createRequestLogger,
} from '@megacampus/shared-logger';

export type { Logger } from 'pino';

// Re-export error logging types and services (these are local)
export * from './types';
export * from './error-service';
