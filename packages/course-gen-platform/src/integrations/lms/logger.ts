/**
 * LMS Integration Logger
 * @module integrations/lms/logger
 *
 * Re-exports the shared Pino logger with LMS-specific child context.
 * Use this logger for all LMS integration logging to ensure consistent
 * structured logs with the 'lms' module context.
 *
 * @example
 * ```typescript
 * import { lmsLogger } from './logger';
 *
 * lmsLogger.info({ courseId: 'AI101' }, 'Starting OLX generation');
 * lmsLogger.error({ error, taskId }, 'Import failed');
 * ```
 */

import { logger } from '../../shared/logger';

/**
 * LMS-specific child logger with module context
 * All log entries will include { module: 'lms' }
 */
export const lmsLogger = logger.child({ module: 'lms' });

/**
 * Re-export base logger for cases where module context isn't needed
 */
export { logger };

/**
 * Re-export error logging utilities for LMS error logging
 */
export * from '../../shared/logger/error-service';
export * from '../../shared/logger/types';
