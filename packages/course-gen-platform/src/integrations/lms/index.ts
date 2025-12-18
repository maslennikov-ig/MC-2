/**
 * LMS Integration Module - Main Entry Point
 * @module integrations/lms
 *
 * Provides factory functions for creating LMS adapters and convenience
 * functions for common operations across all LMS platforms.
 *
 * Supported LMS platforms:
 * - Open edX (implemented)
 * - Moodle (planned)
 * - Canvas (planned)
 *
 * @example
 * ```typescript
 * import { createLMSAdapter, publishCourse } from './integrations/lms';
 *
 * // Factory pattern
 * const adapter = createLMSAdapter('openedx', config);
 * const result = await adapter.publishCourse(courseInput);
 *
 * // Convenience function
 * const result = await publishCourse('openedx', config, courseInput);
 * ```
 */

import {
  LMSAdapter,
  type OpenEdXConfig,
  type CourseInput,
  type PublishResult,
} from '@megacampus/shared-types/lms';
import { OpenEdXAdapter } from './openedx/adapter';
import { lmsLogger } from './logger';

/**
 * Create LMS adapter instance
 *
 * Factory function that creates appropriate LMS adapter based on type.
 * Currently supports Open edX only. Moodle and Canvas adapters planned.
 *
 * @param type - LMS platform type
 * @param config - LMS-specific configuration
 * @returns LMS adapter instance
 * @throws {Error} If LMS type is unsupported or not yet implemented
 *
 * @example
 * ```typescript
 * const adapter = createLMSAdapter('openedx', {
 *   instanceId: 'uuid',
 *   name: 'Production',
 *   type: 'openedx',
 *   organization: 'MegaCampus',
 *   lmsUrl: 'https://lms.example.com',
 *   cmsUrl: 'https://studio.example.com',
 *   clientId: 'client-id',
 *   clientSecret: 'secret',
 *   timeout: 300000,
 *   maxRetries: 3,
 *   pollInterval: 5000,
 *   enabled: true,
 *   autoCreateCourse: true,
 * });
 *
 * await adapter.validateConfig();
 * await adapter.testConnection();
 * const result = await adapter.publishCourse(courseInput);
 * ```
 */
export function createLMSAdapter(
  type: 'openedx',
  config: OpenEdXConfig
): LMSAdapter<OpenEdXConfig>;
export function createLMSAdapter(
  type: string,
  config: OpenEdXConfig
): LMSAdapter<OpenEdXConfig> {
  lmsLogger.debug({ type, instanceId: config.instanceId }, 'Creating LMS adapter');

  switch (type) {
    case 'openedx':
      return new OpenEdXAdapter(config);

    case 'moodle':
      throw new Error(
        'Moodle adapter not yet implemented. Please use Open edX or wait for future release.'
      );

    case 'canvas':
      throw new Error(
        'Canvas adapter not yet implemented. Please use Open edX or wait for future release.'
      );

    default:
      throw new Error(
        `Unknown LMS type: ${type}. Supported types: openedx (moodle and canvas planned)`
      );
  }
}

/**
 * Publish course to LMS (convenience function)
 *
 * One-step function to create adapter and publish course.
 * Equivalent to calling createLMSAdapter() then adapter.publishCourse().
 *
 * Recommended for one-time operations or simple scripts.
 * For multiple operations, create adapter instance once and reuse.
 *
 * @param type - LMS platform type
 * @param config - LMS-specific configuration
 * @param input - Course content and metadata
 * @returns Publish result with success status and URLs
 * @throws {Error} If LMS type is unsupported
 * @throws {LMSIntegrationError} If publish operation fails
 *
 * @example
 * ```typescript
 * const result = await publishCourse('openedx', openEdxConfig, {
 *   courseId: 'AI101',
 *   title: 'Основы ИИ',
 *   org: 'MegaCampus',
 *   run: 'self_paced',
 *   language: 'ru',
 *   chapters: [
 *     {
 *       id: 'ch1',
 *       title: 'Введение',
 *       sections: [...]
 *     }
 *   ]
 * });
 *
 * if (result.success) {
 *   console.log(`Published to: ${result.lmsUrl}`);
 *   console.log(`Edit in Studio: ${result.studioUrl}`);
 * }
 * ```
 */
export async function publishCourse(
  type: 'openedx',
  config: OpenEdXConfig,
  input: CourseInput
): Promise<PublishResult>;
export async function publishCourse(
  type: string,
  config: OpenEdXConfig,
  input: CourseInput
): Promise<PublishResult> {
  lmsLogger.info(
    {
      type,
      courseId: input.courseId,
      org: input.org,
      run: input.run,
      instanceId: config.instanceId,
    },
    'Publishing course via convenience function'
  );

  const adapter = createLMSAdapter(type as 'openedx', config);
  return adapter.publishCourse(input);
}

/**
 * Re-export logger for LMS operations
 */
export { lmsLogger };

/**
 * Re-export OpenEdXAdapter for direct use
 */
export { OpenEdXAdapter } from './openedx/adapter';
