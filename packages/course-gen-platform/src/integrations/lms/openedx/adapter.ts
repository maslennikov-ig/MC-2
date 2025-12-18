/**
 * Open edX LMS Adapter
 * @module integrations/lms/openedx/adapter
 *
 * Concrete implementation of LMSAdapter for Open edX platform.
 * Orchestrates OLX generation, packaging, upload, and status polling.
 */

import {
  LMSAdapter,
  type OpenEdXConfig,
  type PublishResult,
  type CourseInput,
  type LmsCourseStatus,
  type TestConnectionResult,
  LMSIntegrationError,
} from '@megacampus/shared-types/lms';
import { OLXGenerator } from './olx/generator';
import { packageOLX } from './olx/packager';
import { validateCourseInput } from './olx/validators';
import { OLXValidationError } from '@megacampus/shared-types/lms/errors';
import { OpenEdXClient } from './api/client';
import { pollImportStatus } from './api/poller';
import type { ImportStatus } from './api/types';
import { lmsLogger } from '../logger';

/**
 * Open edX LMS Adapter
 *
 * Implements LMSAdapter interface for Open edX platform integration.
 * Provides complete workflow:
 * 1. Validate CourseInput
 * 2. Generate OLX structure
 * 3. Package into tar.gz
 * 4. Upload to Open edX via Import API
 * 5. Poll import status until completion
 * 6. Return PublishResult with URLs
 *
 * @example
 * ```typescript
 * const adapter = new OpenEdXAdapter({
 *   instanceId: 'uuid-here',
 *   name: 'Production Open edX',
 *   type: 'openedx',
 *   organization: 'MegaCampus',
 *   lmsUrl: 'https://lms.example.com',
 *   cmsUrl: 'https://studio.example.com',
 *   clientId: 'oauth-client-id',
 *   clientSecret: 'oauth-secret',
 *   timeout: 300000,
 *   maxRetries: 3,
 *   pollInterval: 5000,
 *   enabled: true,
 *   autoCreateCourse: true,
 * });
 *
 * const courseInput: CourseInput = {
 *   courseId: 'AI101',
 *   title: 'Основы ИИ',
 *   org: 'MegaCampus',
 *   run: 'self_paced',
 *   language: 'ru',
 *   chapters: [...]
 * };
 *
 * const result = await adapter.publishCourse(courseInput);
 * console.log(`Course published: ${result.lmsUrl}`);
 * ```
 */
export class OpenEdXAdapter extends LMSAdapter<OpenEdXConfig> {
  private readonly generator: OLXGenerator;
  private readonly apiClient: OpenEdXClient;

  /**
   * Create new Open edX adapter instance
   *
   * @param config - Open edX configuration
   */
  constructor(config: OpenEdXConfig) {
    super(config);

    // Initialize OLX generator
    this.generator = new OLXGenerator();

    // Initialize API client
    this.apiClient = new OpenEdXClient({
      baseUrl: config.lmsUrl,
      studioUrl: config.cmsUrl,
      auth: {
        tokenUrl: `${config.lmsUrl}/oauth2/access_token`,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      },
      uploadTimeout: config.timeout,
      statusTimeout: 10000,
      maxRetries: config.maxRetries,
      retryDelayMs: 1000,
    });

    lmsLogger.info(
      {
        instanceId: config.instanceId,
        name: config.name,
        lmsUrl: config.lmsUrl,
      },
      'OpenEdXAdapter initialized'
    );
  }

  /**
   * Get adapter type identifier
   * @returns 'openedx'
   */
  get type(): string {
    return 'openedx';
  }

  /**
   * Publish course to Open edX LMS
   *
   * Complete workflow:
   * 1. Validate input structure
   * 2. Generate OLX from CourseInput
   * 3. Package OLX into tar.gz
   * 4. Upload package via Import API
   * 5. Poll import status until completion
   * 6. Return result with URLs
   *
   * @param input - Course content and metadata
   * @returns Publish result with success status and URLs
   * @throws {OLXValidationError} If input validation fails
   * @throws {LMSIntegrationError} If publish operation fails
   */
  async publishCourse(input: CourseInput): Promise<PublishResult> {
    const startTime = Date.now();

    lmsLogger.info(
      {
        courseId: input.courseId,
        org: input.org,
        run: input.run,
        instanceId: this.config.instanceId,
      },
      'Starting course publish workflow'
    );

    try {
      // Step 1: Validate input
      const validationResult = validateCourseInput(input);
      if (!validationResult.valid) {
        throw new OLXValidationError(
          'Course input validation failed',
          validationResult.errors.map((msg) => ({
            path: 'courseInput',
            message: msg,
            severity: 'error',
          }))
        );
      }

      // Step 2: Generate OLX structure
      lmsLogger.debug({ courseId: input.courseId }, 'Generating OLX structure');
      const olxStructure = this.generator.generate(input);

      // Step 3: Package into tar.gz
      lmsLogger.debug({ courseId: input.courseId }, 'Packaging OLX to tar.gz');
      const packageResult = await packageOLX(olxStructure);

      lmsLogger.info(
        {
          courseId: input.courseId,
          packageSize: packageResult.size,
          fileCount: packageResult.fileCount,
        },
        'OLX package created successfully'
      );

      // Step 4: Upload to Open edX
      lmsLogger.debug({ courseId: input.courseId }, 'Uploading package to Open edX');
      const courseKey = olxStructure.courseKey;
      const { taskId } = await this.apiClient.importCourse(packageResult.buffer, courseKey);

      lmsLogger.info(
        { courseId: input.courseId, taskId, courseKey },
        'Package uploaded, polling import status'
      );

      // Step 5: Poll import status
      const pollStartTime = Date.now();
      const importResult = await pollImportStatus(this.apiClient, taskId, {
        maxAttempts: Math.ceil(this.config.timeout / this.config.pollInterval),
        intervalMs: this.config.pollInterval,
        onProgress: (status: ImportStatus) => {
          const elapsed = Date.now() - pollStartTime;
          lmsLogger.debug(
            {
              courseId: input.courseId,
              taskId,
              state: status.state,
              progress: status.progress_percent,
              elapsedMs: elapsed,
            },
            'Import progress update'
          );
        },
      });

      // Step 6: Build and return publish result
      const duration = Date.now() - startTime;
      const lmsCourseId = importResult.courseKey || courseKey;
      const lmsUrl = `${this.config.lmsUrl}/courses/${lmsCourseId}/course/`;
      const studioUrl = importResult.courseUrl || this.apiClient.getCourseUrl(lmsCourseId);

      const result: PublishResult = {
        success: true,
        courseId: input.courseId,
        lmsCourseId,
        lmsUrl,
        studioUrl,
        taskId,
        duration,
      };

      lmsLogger.info(
        {
          courseId: input.courseId,
          lmsCourseId,
          duration,
          taskId,
        },
        'Course published successfully'
      );

      // Reset generator for next course
      this.generator.reset();

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      lmsLogger.error(
        {
          courseId: input.courseId,
          error,
          duration,
          instanceId: this.config.instanceId,
        },
        'Course publish failed'
      );

      // Re-throw if already LMS error
      if (error instanceof LMSIntegrationError) {
        throw error;
      }

      // Wrap unknown errors
      throw new LMSIntegrationError(
        `Course publish failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'IMPORT_ERROR',
        'openedx',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get course status in Open edX LMS
   *
   * Note: Open edX Import API does not provide a direct course status endpoint.
   * This implementation returns basic existence information based on course key format.
   * For full course status, use Open edX Course API (not implemented yet).
   *
   * @param courseId - MegaCampus course ID
   * @returns Course status (existence only for now)
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Placeholder for future API call
  async getCourseStatus(courseId: string): Promise<LmsCourseStatus> {
    lmsLogger.debug({ courseId }, 'Getting course status (placeholder implementation)');

    // Placeholder implementation
    // TODO: Implement using Open edX Course API when available
    return {
      exists: false,
      published: false,
      lastModified: undefined,
      enrollmentCount: undefined,
      lmsUrl: undefined,
      studioUrl: undefined,
    };
  }

  /**
   * Delete course from Open edX LMS
   *
   * Note: Open edX does not provide a direct course deletion API.
   * Course deletion must be performed via Django admin or Studio UI.
   *
   * @param courseId - MegaCampus course ID
   * @returns False (deletion not supported)
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Synchronous placeholder
  async deleteCourse(courseId: string): Promise<boolean> {
    lmsLogger.warn(
      { courseId },
      'Course deletion not supported - must be performed via Django admin or Studio UI'
    );
    return false;
  }

  /**
   * Validate Open edX configuration
   *
   * Checks required fields and URL formats without making network calls.
   *
   * @returns True if configuration is valid
   * @throws {LMSIntegrationError} If configuration is invalid
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Synchronous validation
  async validateConfig(): Promise<boolean> {
    lmsLogger.debug({ instanceId: this.config.instanceId }, 'Validating Open edX configuration');

    const errors: string[] = [];

    // Validate required fields
    if (!this.config.lmsUrl) {
      errors.push('lmsUrl is required');
    }

    if (!this.config.cmsUrl) {
      errors.push('cmsUrl is required');
    }

    if (!this.config.clientId) {
      errors.push('clientId is required');
    }

    if (!this.config.clientSecret) {
      errors.push('clientSecret is required');
    }

    if (!this.config.organization) {
      errors.push('organization is required');
    }

    // Validate URL formats
    try {
      if (this.config.lmsUrl) {
        new URL(this.config.lmsUrl);
      }
    } catch {
      errors.push('lmsUrl must be a valid URL');
    }

    try {
      if (this.config.cmsUrl) {
        new URL(this.config.cmsUrl);
      }
    } catch {
      errors.push('cmsUrl must be a valid URL');
    }

    // Validate numeric fields
    if (this.config.timeout && this.config.timeout <= 0) {
      errors.push('timeout must be positive');
    }

    if (this.config.maxRetries && this.config.maxRetries <= 0) {
      errors.push('maxRetries must be positive');
    }

    if (this.config.pollInterval && this.config.pollInterval <= 0) {
      errors.push('pollInterval must be positive');
    }

    if (errors.length > 0) {
      throw new LMSIntegrationError(
        `Open edX configuration validation failed: ${errors.join(', ')}`,
        'INVALID_COURSE_INPUT',
        'openedx',
        undefined,
        { errors }
      );
    }

    lmsLogger.info({ instanceId: this.config.instanceId }, 'Open edX configuration valid');
    return true;
  }

  /**
   * Test connection to Open edX LMS
   *
   * Performs:
   * 1. OAuth2 authentication test
   * 2. API endpoint accessibility test
   * 3. Latency measurement
   *
   * @returns Connection test result with latency
   */
  async testConnection(): Promise<TestConnectionResult> {
    lmsLogger.info(
      { instanceId: this.config.instanceId, lmsUrl: this.config.lmsUrl },
      'Testing Open edX connection'
    );

    const startTime = Date.now();

    try {
      // Test authentication and API access
      await this.apiClient.testConnection();

      const latencyMs = Date.now() - startTime;

      lmsLogger.info(
        { instanceId: this.config.instanceId, latencyMs },
        'Open edX connection test successful'
      );

      return {
        success: true,
        latencyMs,
        message: `Successfully connected to Open edX at ${this.config.lmsUrl}`,
        lmsVersion: undefined, // Not available from Import API
        apiVersion: 'v0',
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      lmsLogger.error(
        { instanceId: this.config.instanceId, latencyMs, error },
        'Open edX connection test failed'
      );

      return {
        success: false,
        latencyMs,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lmsVersion: undefined,
        apiVersion: undefined,
      };
    }
  }
}
