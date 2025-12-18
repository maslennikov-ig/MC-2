/**
 * Open edX API Module
 * @module integrations/lms/openedx/api
 *
 * Complete Open edX REST API client with OAuth2 authentication,
 * course import, and status polling.
 *
 * @example
 * ```typescript
 * import { OpenEdXClient, pollImportStatus } from './api';
 *
 * const client = new OpenEdXClient({
 *   baseUrl: 'https://lms.example.com',
 *   studioUrl: 'https://studio.example.com',
 *   auth: {
 *     tokenUrl: 'https://lms.example.com/oauth2/access_token',
 *     clientId: 'my-client',
 *     clientSecret: 'secret'
 *   }
 * });
 *
 * const { taskId } = await client.importCourse(buffer, courseId);
 * const result = await pollImportStatus(client, taskId, {
 *   onProgress: (status) => console.log(status.progress_percent)
 * });
 * ```
 */

// Authentication
export { OpenEdXAuth } from './auth';
export type { OAuth2Config } from './auth';

// API Client
export { OpenEdXClient } from './client';
export type { OpenEdXClientConfig } from './client';

// Status Polling
export {
  pollImportStatus,
  estimateRemainingTime,
  formatDuration,
} from './poller';
export type { PollOptions } from './poller';

// Types
export {
  OpenEdXApiError,
} from './types';
export type {
  ImportStatus,
  ImportResult,
  ImportTaskResponse,
  ImportTaskState,
  OAuth2TokenResponse,
  OpenEdXApiErrorResponse,
} from './types';
