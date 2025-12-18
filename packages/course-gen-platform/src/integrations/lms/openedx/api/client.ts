/**
 * Open edX API Client
 * @module integrations/lms/openedx/api/client
 *
 * REST API client for Open edX Course Import API.
 * Handles course import with multipart upload and status polling.
 */

import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import { LMSNetworkError, LMSTimeoutError, LMSPermissionError } from '@megacampus/shared-types/lms';
import { lmsLogger } from '../../logger';
import { OpenEdXAuth, type OAuth2Config } from './auth';
import type {
  ImportStatus,
  ImportTaskResponse,
  OpenEdXApiErrorResponse,
} from './types';
import { OpenEdXApiError } from './types';

/**
 * Extended Axios config with retry metadata
 */
interface AxiosConfigWithRetry extends InternalAxiosRequestConfig {
  _authRetried?: boolean;  // For 401 auth token refresh
  _retryCount?: number;    // For 5xx/network error retries
}

/**
 * Open edX API client configuration
 */
export interface OpenEdXClientConfig {
  /** LMS base URL (e.g., https://lms.example.com) */
  baseUrl: string;

  /** Studio base URL (e.g., https://studio.example.com) */
  studioUrl: string;

  /** OAuth2 authentication configuration */
  auth: OAuth2Config;

  /** Upload timeout in milliseconds (default: 60000) */
  uploadTimeout?: number;

  /** Status request timeout in milliseconds (default: 10000) */
  statusTimeout?: number;

  /** Maximum retry attempts for failed requests (default: 3) */
  maxRetries?: number;

  /** Retry delay in milliseconds (default: 1000) */
  retryDelayMs?: number;
}

/**
 * Open edX REST API Client
 *
 * Provides methods for:
 * - Course import (multipart file upload)
 * - Import status polling
 * - Connection testing
 *
 * Handles OAuth2 authentication, retry logic, and error mapping.
 *
 * @example
 * ```typescript
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
 * const { taskId } = await client.importCourse(tarGzBuffer, 'course-v1:Org+Course+Run');
 * const status = await client.getImportStatus(taskId);
 * ```
 */
export class OpenEdXClient {
  private readonly config: Required<OpenEdXClientConfig>;
  private readonly auth: OpenEdXAuth;
  private readonly httpClient: AxiosInstance;

  constructor(config: OpenEdXClientConfig) {
    this.config = {
      uploadTimeout: 60000,
      statusTimeout: 10000,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    };

    this.auth = new OpenEdXAuth(config.auth);

    // Create axios instance with retry interceptor
    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.statusTimeout,
    });

    this.setupInterceptors();

    lmsLogger.debug(
      { baseUrl: this.config.baseUrl },
      'OpenEdXClient initialized'
    );
  }

  /**
   * Import course from tar.gz archive
   *
   * Uploads course package to Open edX import endpoint.
   * Returns task ID for status polling.
   *
   * @param tarGzBuffer - Course package buffer (tar.gz format)
   * @param courseId - Course identifier (e.g., "course-v1:Org+Course+Run")
   * @returns Task ID for polling import status
   * @throws {OpenEdXApiError} If upload fails
   * @throws {LMSTimeoutError} If upload exceeds timeout
   */
  async importCourse(
    tarGzBuffer: Buffer,
    courseId: string
  ): Promise<{ taskId: string }> {
    lmsLogger.info(
      { courseId, size: tarGzBuffer.length },
      'Starting course import'
    );

    const token = await this.auth.getAccessToken();

    // Create multipart form data
    const formData = new FormData();
    formData.append('course_data', tarGzBuffer, {
      filename: `${courseId}.tar.gz`,
      contentType: 'application/gzip',
    });

    const startTime = Date.now();

    try {
      const response = await this.httpClient.post<ImportTaskResponse>(
        `/api/courses/v0/import/${encodeURIComponent(courseId)}`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...formData.getHeaders(),
          },
          timeout: this.config.uploadTimeout,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const duration = Date.now() - startTime;
      const taskId = response.data.task_id;

      lmsLogger.info(
        { courseId, taskId, durationMs: duration },
        'Course import initiated successfully'
      );

      return { taskId };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle timeout
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        lmsLogger.error(
          { courseId, durationMs: duration, timeout: this.config.uploadTimeout },
          'Course import upload timeout'
        );
        throw new LMSTimeoutError(
          `Course import upload timed out after ${duration}ms`,
          'openedx',
          duration,
          'upload'
        );
      }

      // Handle API errors
      throw this.handleApiError(error, 'Course import failed');
    }
  }

  /**
   * Get import task status
   *
   * Queries current state of import task.
   *
   * @param taskId - Import task ID from importCourse()
   * @returns Current import status
   * @throws {OpenEdXApiError} If status request fails
   */
  async getImportStatus(taskId: string): Promise<ImportStatus> {
    const token = await this.auth.getAccessToken();

    try {
      const response = await this.httpClient.get<ImportStatus>(
        `/api/courses/v0/import/status/${encodeURIComponent(taskId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      lmsLogger.debug(
        { taskId, state: response.data.state, progress: response.data.progress_percent },
        'Import status retrieved'
      );

      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Import status query failed');
    }
  }

  /**
   * Test connection to Open edX API
   *
   * Verifies OAuth2 authentication and API accessibility.
   * Useful for health checks and configuration validation.
   *
   * @returns True if connection successful
   * @throws {OpenEdXAuthError} If authentication fails
   * @throws {LMSNetworkError} If API unreachable
   */
  async testConnection(): Promise<boolean> {
    lmsLogger.info('Testing Open edX API connection');

    try {
      // Test OAuth2 authentication
      await this.auth.testConnection();

      // Test API endpoint accessibility (simple GET request)
      const token = await this.auth.getAccessToken();
      await this.httpClient.get('/api/courses/v0/', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 5000,
      });

      lmsLogger.info('Open edX API connection test successful');
      return true;
    } catch (error) {
      lmsLogger.error({ error }, 'Open edX API connection test failed');
      throw error;
    }
  }

  /**
   * Setup axios interceptors for retry logic and auth token refresh
   */
  private setupInterceptors(): void {
    // Response interceptor for 401 handling (token refresh)
    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as AxiosConfigWithRetry | undefined;

        // Don't retry if no config
        if (!config) {
          return Promise.reject(error);
        }

        // Handle 401 - invalidate token and retry once
        if (error.response?.status === 401 && !config._authRetried) {
          lmsLogger.warn('Received 401, invalidating token and retrying');
          config._authRetried = true;

          this.auth.invalidateToken();
          const newToken = await this.auth.getAccessToken();

          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${newToken}`;

          return this.httpClient(config);
        }

        // Handle retryable errors (5xx, network errors)
        if (this.isRetryableError(error)) {
          const retryCount = config._retryCount || 0;

          if (retryCount < this.config.maxRetries) {
            config._retryCount = retryCount + 1;

            const MAX_RETRY_DELAY_MS = 60000; // 60 seconds max
            const delay = Math.min(
              this.config.retryDelayMs * Math.pow(2, retryCount),
              MAX_RETRY_DELAY_MS
            ); // Exponential backoff with cap

            lmsLogger.warn(
              { retryCount: retryCount + 1, delayMs: delay, statusCode: error.response?.status },
              'Retrying failed request'
            );

            await this.sleep(delay);
            return this.httpClient(config);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if error is retryable (network errors, 5xx status)
   */
  private isRetryableError(error: AxiosError): boolean {
    // Network errors (no response)
    if (!error.response) {
      return true;
    }

    // 5xx server errors
    const status = error.response.status;
    return status >= 500 && status < 600;
  }

  /**
   * Handle and map API errors to LMS error types
   */
  private handleApiError(error: unknown, message: string): Error {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const errorData = error.response?.data as OpenEdXApiErrorResponse | undefined;

      lmsLogger.error(
        {
          statusCode,
          error: errorData?.error,
          errorDescription: errorData?.error_description,
          message: error.message,
        },
        message
      );

      // Handle 403 Forbidden - Permission errors
      if (statusCode === 403) {
        const operation = this.extractOperationFromError(error, message);
        const requiredRole = this.extractRequiredRole(errorData);

        const permissionMessage = this.buildPermissionMessage(operation, requiredRole, errorData);

        return new LMSPermissionError(
          permissionMessage,
          'openedx',
          operation,
          requiredRole
        );
      }

      // Map to OpenEdXApiError
      if (errorData) {
        return OpenEdXApiError.fromResponse(statusCode || 500, errorData);
      }

      // Network error
      if (!error.response) {
        return new LMSNetworkError(
          `${message}: ${error.message}`,
          'openedx',
          error
        );
      }

      // Generic API error
      return new OpenEdXApiError(
        `${message}: HTTP ${statusCode}`,
        statusCode || 500
      );
    }

    // Unknown error
    lmsLogger.error({ error }, message);
    return error instanceof Error ? error : new Error(message);
  }

  /**
   * Extract operation type from error context
   */
  private extractOperationFromError(error: AxiosError, message: string): string {
    // Check URL path for operation hints
    const url = error.config?.url || '';

    if (url.includes('/import/')) {
      return 'course:import';
    }
    if (url.includes('/courses/')) {
      return 'course:access';
    }

    // Fallback to message analysis
    if (message.toLowerCase().includes('import')) {
      return 'course:import';
    }

    return 'unknown';
  }

  /**
   * Extract required role from Open edX error response
   */
  private extractRequiredRole(errorData?: OpenEdXApiErrorResponse): string {
    if (!errorData) {
      return 'Staff or Course Creator';
    }

    const errorText = `${errorData.error} ${errorData.error_description || ''} ${errorData.detail || ''}`.toLowerCase();

    // Parse common Open edX permission patterns
    if (errorText.includes('staff access required') || errorText.includes('staff role')) {
      return 'Staff';
    }
    if (errorText.includes('course creator') || errorText.includes('course:import')) {
      return 'Course Creator';
    }
    if (errorText.includes('admin')) {
      return 'Administrator';
    }
    if (errorText.includes('instructor')) {
      return 'Instructor';
    }

    // Default for Open edX course import
    return 'Course Creator or Staff';
  }

  /**
   * Build user-friendly permission error message
   */
  private buildPermissionMessage(
    _operation: string,
    requiredRole: string,
    errorData?: OpenEdXApiErrorResponse
  ): string {
    const baseMessage = "You don't have permission to import courses to Open edX.";
    const roleGuidance = `Required role: ${requiredRole}.`;

    // Add specific permission details if available
    let permissionHint = '';
    if (errorData) {
      const errorText = `${errorData.error} ${errorData.error_description || ''} ${errorData.detail || ''}`;
      if (errorText.includes('course:import')) {
        permissionHint = 'Current user may be missing course:import permission.';
      } else if (errorText.includes('not authorized')) {
        permissionHint = 'Current user is not authorized for this operation.';
      }
    }

    const contactAdmin = 'Please contact your LMS administrator to request access.';

    // Ensure consistent punctuation (all parts end with period)
    const parts = [baseMessage, roleGuidance, permissionHint, contactAdmin]
      .filter(Boolean)
      .map(part => {
        const trimmed = part.trim();
        // Ensure each part ends with proper punctuation
        return trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?')
          ? trimmed
          : trimmed + '.';
      });

    return parts.join(' ');
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get Studio URL for course
   *
   * Constructs Studio edit URL from course key.
   *
   * @param courseKey - Course key (e.g., "course-v1:Org+Course+Run")
   * @returns Studio course URL
   */
  getCourseUrl(courseKey: string): string {
    return `${this.config.studioUrl}/course/${encodeURIComponent(courseKey)}`;
  }
}
