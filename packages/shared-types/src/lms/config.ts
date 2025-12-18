/**
 * LMS Configuration Schemas
 * @module lms/config
 *
 * Zod schemas for LMS configuration stored in database.
 * Includes both full configuration (with secrets) and public version (without secrets).
 */

import { z } from 'zod';

/**
 * LMS Configuration Schema
 *
 * Complete configuration for Open edX LMS connection.
 * Stored in `lms_configurations` table.
 *
 * SECURITY: Contains sensitive fields (client_id, client_secret).
 * Use LmsConfigurationPublicSchema for client-facing APIs.
 */
export const LmsConfigurationSchema = z.object({
  /** Configuration UUID */
  id: z.string().uuid(),

  /** Organization UUID (foreign key) */
  organization_id: z.string().uuid(),

  // Display
  /** Configuration name (unique per organization) */
  name: z.string().min(1).max(100),
  /** Optional description */
  description: z.string().max(500).nullable(),

  // Connection
  /** LMS base URL (e.g., https://lms.example.com) */
  lms_url: z.string().url(),
  /** Studio/CMS URL (e.g., https://studio.example.com) */
  studio_url: z.string().url(),

  // Authentication (encrypted at rest)
  /** OAuth2 Client ID */
  client_id: z.string().min(1),
  /** OAuth2 Client Secret */
  client_secret: z.string().min(1),

  // Course Defaults
  /** Default organization code for courses (e.g., "MegaCampus") */
  default_org: z.string().min(1).max(50),
  /** Default course run identifier (e.g., "self_paced") */
  default_run: z.string().default('self_paced'),

  // Operational Settings
  /** Import operation timeout (30-600 seconds) */
  import_timeout_seconds: z.number().int().min(30).max(600).default(300),
  /** Maximum retry attempts (1-5) */
  max_retries: z.number().int().min(1).max(5).default(3),

  // Status
  /** Is configuration active? */
  is_active: z.boolean().default(true),
  /** Timestamp of last connection test */
  last_connection_test: z.coerce.date().nullable(),
  /** Result of last connection test */
  last_connection_status: z.enum(['success', 'failed', 'pending']).nullable(),

  // Audit
  /** Creation timestamp */
  created_at: z.coerce.date(),
  /** Last update timestamp */
  updated_at: z.coerce.date(),
  /** User who created configuration */
  created_by: z.string().uuid().nullable(),
});

/** LMS Configuration type (inferred from schema) */
export type LmsConfiguration = z.infer<typeof LmsConfigurationSchema>;

/**
 * LMS Configuration Public Schema
 *
 * Client-safe version without sensitive fields (client_id, client_secret).
 * Use this for tRPC responses and client-facing APIs.
 *
 * Omitted fields:
 * - client_id
 * - client_secret
 */
export const LmsConfigurationPublicSchema = LmsConfigurationSchema.omit({
  client_id: true,
  client_secret: true,
});

/** LMS Configuration Public type (inferred from schema) */
export type LmsConfigurationPublic = z.infer<typeof LmsConfigurationPublicSchema>;
