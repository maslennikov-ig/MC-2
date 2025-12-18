/**
 * Pino structured JSON logger with contextual fields
 * @module logger
 *
 * Also exports error logging types and services for centralized error management.
 */

import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'course-generator',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '0.0.0',
  },
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export default logger;
export { logger };

// Re-export error logging types and services
export * from './types';
export * from './error-service';
