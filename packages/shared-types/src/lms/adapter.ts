/**
 * LMS Adapter Interface Types
 * @module lms/adapter
 *
 * Abstract interface for LMS-agnostic operations.
 * All LMS implementations (Open edX, Moodle, Canvas) must implement these schemas.
 */

import { z } from 'zod';
import type { CourseInput } from './course-input';

/**
 * Publish Result Schema
 *
 * Result of a course publish operation to LMS.
 * Returned by LMSAdapter.publishCourse().
 */
export const PublishResultSchema = z.object({
  /** Did the publish operation succeed? */
  success: z.boolean(),
  /** MegaCampus course ID */
  courseId: z.string(),
  /** LMS-specific course identifier (e.g., "course-v1:Org+Course+Run") */
  lmsCourseId: z.string(),
  /** LMS student view URL */
  lmsUrl: z.string().url(),
  /** Studio/authoring URL (optional) */
  studioUrl: z.string().url().optional(),
  /** LMS async task ID (for polling, optional) */
  taskId: z.string().optional(),
  /** Operation duration in milliseconds */
  duration: z.number().int(),
  /** Error message (if success=false) */
  error: z.string().optional(),
});

/** Publish Result type (inferred from schema) */
export type PublishResult = z.infer<typeof PublishResultSchema>;

/**
 * LMS Course Status Schema
 *
 * Course status in LMS.
 * Returned by LMSAdapter.getCourseStatus().
 */
export const LmsCourseStatusSchema = z.object({
  /** Does the course exist in LMS? */
  exists: z.boolean(),
  /** Is the course published (visible to students)? */
  published: z.boolean(),
  /** Last modification timestamp (optional) */
  lastModified: z.string().datetime().optional(),
  /** Enrollment count (optional) */
  enrollmentCount: z.number().int().optional(),
  /** LMS student view URL (optional) */
  lmsUrl: z.string().url().optional(),
  /** Studio/authoring URL (optional) */
  studioUrl: z.string().url().optional(),
});

/** LMS Course Status type (inferred from schema) */
export type LmsCourseStatus = z.infer<typeof LmsCourseStatusSchema>;

/**
 * Test Connection Result Schema
 *
 * Result of LMS connection test.
 * Returned by LMSAdapter.testConnection().
 */
export const TestConnectionResultSchema = z.object({
  /** Was the connection successful? */
  success: z.boolean(),
  /** Connection latency in milliseconds */
  latencyMs: z.number().int(),
  /** Human-readable result message */
  message: z.string(),
  /** LMS version (optional) */
  lmsVersion: z.string().optional(),
  /** LMS API version (optional) */
  apiVersion: z.string().optional(),
});

/** Test Connection Result type (inferred from schema) */
export type TestConnectionResult = z.infer<typeof TestConnectionResultSchema>;

/**
 * Base LMS Configuration Schema
 *
 * Shared configuration fields across all LMS types.
 * Extended by platform-specific schemas (OpenEdXConfigSchema, etc.).
 */
export const BaseLMSConfigSchema = z.object({
  /** Unique instance identifier */
  instanceId: z.string().uuid(),
  /** Human-readable name */
  name: z.string(),
  /** LMS type discriminator */
  type: z.enum(['openedx', 'moodle', 'canvas']),
  /** Is this instance active? */
  enabled: z.boolean().default(true),
  /** Default organization for courses (ASCII alphanumeric) */
  organization: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  /** Request timeout in milliseconds (default: 5 minutes) */
  timeout: z.number().positive().default(300000),
  /** Maximum retry attempts (default: 3) */
  maxRetries: z.number().int().positive().default(3),
});

/** Base LMS Config type (inferred from schema) */
export type BaseLMSConfig = z.infer<typeof BaseLMSConfigSchema>;

/**
 * Open edX Configuration Schema
 *
 * Open edX-specific configuration extending BaseLMSConfigSchema.
 * Used by OpenEdXAdapter for OAuth2 authentication and Import API.
 */
export const OpenEdXConfigSchema = BaseLMSConfigSchema.extend({
  /** LMS type (must be 'openedx') */
  type: z.literal('openedx'),
  /** LMS base URL (for OAuth2 token) */
  lmsUrl: z.string().url(),
  /** CMS/Studio base URL (for Import API) */
  cmsUrl: z.string().url(),
  /** OAuth2 Client ID */
  clientId: z.string().min(1),
  /** OAuth2 Client Secret */
  clientSecret: z.string().min(1),
  /** Poll interval in milliseconds (default: 5 seconds) */
  pollInterval: z.number().positive().default(5000),
  /** Auto-create course if not exists (default: true) */
  autoCreateCourse: z.boolean().default(true),
});

/** Open edX Config type (inferred from schema) */
export type OpenEdXConfig = z.infer<typeof OpenEdXConfigSchema>;

/**
 * Abstract LMS Adapter Interface
 *
 * Base class for all LMS implementations.
 * Implementations must provide:
 * - publishCourse: Convert and upload course to LMS
 * - getCourseStatus: Check course existence and status
 * - deleteCourse: Remove course from LMS
 * - validateConfig: Verify configuration is valid
 * - testConnection: Test LMS connectivity
 *
 * @template TConfig Configuration type (must extend BaseLMSConfig)
 *
 * @example
 * ```typescript
 * class OpenEdXAdapter extends LMSAdapter<OpenEdXConfig> {
 *   get type(): string { return 'openedx'; }
 *   // ... implement abstract methods
 * }
 * ```
 */
export abstract class LMSAdapter<TConfig extends BaseLMSConfig = BaseLMSConfig> {
  /**
   * Create a new LMS adapter instance
   * @param config LMS-specific configuration
   */
  constructor(protected readonly config: TConfig) {}

  /**
   * Get adapter type identifier
   * @returns LMS type string (e.g., 'openedx', 'moodle', 'canvas')
   */
  abstract get type(): string;

  /**
   * Publish a course to the LMS
   *
   * Converts CourseInput to LMS-specific format and uploads.
   * For Open edX: Generates OLX, packages as tar.gz, uploads via Import API.
   *
   * @param input Course content and metadata
   * @returns Publish result with URLs and status
   * @throws LMSIntegrationError on failure
   */
  abstract publishCourse(input: CourseInput): Promise<PublishResult>;

  /**
   * Get course status in LMS
   *
   * @param courseId MegaCampus course ID
   * @returns Course status including existence, publication state, URLs
   */
  abstract getCourseStatus(courseId: string): Promise<LmsCourseStatus>;

  /**
   * Delete course from LMS
   *
   * @param courseId MegaCampus course ID
   * @returns True if deleted, false if not found
   * @throws LMSIntegrationError on permission or network error
   */
  abstract deleteCourse(courseId: string): Promise<boolean>;

  /**
   * Validate configuration
   *
   * Checks if configuration values are valid without making network calls.
   *
   * @returns True if configuration is valid
   * @throws LMSIntegrationError with details on invalid configuration
   */
  abstract validateConfig(): Promise<boolean>;

  /**
   * Test connection to LMS
   *
   * Performs authentication and basic API call to verify connectivity.
   *
   * @returns Connection test result with latency and status
   */
  abstract testConnection(): Promise<TestConnectionResult>;
}
