/**
 * LMS Configuration Router
 * @module server/routers/lms/config
 *
 * Handles LMS configuration management operations.
 * Provides endpoints for:
 * - Testing LMS connectivity
 * - Managing configuration settings
 *
 * Authorization: All endpoints require authentication and admin role
 * Organization isolation: Enforced via RLS and ownership checks
 *
 * @example
 * ```typescript
 * // Test connection
 * const result = await trpc.lms.config.testConnection.mutate({
 *   id: '987fcdeb-51a2-43d7-89ab-456789abcdef',
 * });
 * // {
 * //   success: true,
 * //   latency_ms: 234,
 * //   message: 'Successfully connected to Open edX',
 * //   lms_version: undefined,
 * //   api_version: 'v0'
 * // }
 * ```
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { lmsLogger } from '../../../integrations/lms/logger';
import { nanoid } from 'nanoid';
import {
  handleListConfigs,
  handleGetConfig,
  handleCreateConfig,
  handleUpdateConfig,
  handleDeleteConfig,
  handleTestConnection,
} from './config-helpers';

/**
 * Config Router
 *
 * Handles LMS configuration management operations.
 */
export const configRouter = router({
  /**
   * List LMS configurations for an organization
   *
   * Purpose: Retrieves all LMS configurations for a given organization with optional filtering.
   *
   * Authorization: Requires organization member
   *
   * Input:
   * - organization_id: UUID of organization
   * - include_inactive: Whether to include inactive configurations (default: false)
   *
   * Output: Array of LMS configurations (without secrets)
   *
   * Security:
   * - NEVER returns client_id or client_secret
   * - Uses LmsConfigurationPublicSchema to ensure secrets are omitted
   *
   * @throws {TRPCError} FORBIDDEN if user doesn't belong to organization
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * const configs = await trpc.lms.config.list.query({
   *   organization_id: 'org-uuid',
   *   include_inactive: false,
   * });
   * // Returns: [{ id, name, lms_url, studio_url, ... }]
   * ```
   */
  list: protectedProcedure
    .input(
      z.object({
        organization_id: z.string().uuid('Invalid organization ID'),
        include_inactive: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      try {
        return await handleListConfigs(
          supabase,
          input,
          ctx.user.id,
          ctx.user.organizationId,
          requestId
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in config.list'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while listing LMS configurations',
        });
      }
    }),

  /**
   * Get a single LMS configuration by ID
   *
   * Purpose: Retrieves detailed information for a specific LMS configuration.
   *
   * Authorization: Requires organization member
   *
   * Input:
   * - id: UUID of LMS configuration
   *
   * Output: LMS configuration (without secrets) or null if not found
   *
   * Security:
   * - NEVER returns client_id or client_secret
   * - Verifies user belongs to same organization as config
   *
   * @throws {TRPCError} FORBIDDEN if user doesn't belong to organization
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * const config = await trpc.lms.config.get.query({
   *   id: 'config-uuid',
   * });
   * // Returns: { id, name, lms_url, ... } or null
   * ```
   */
  get: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid configuration ID'),
      })
    )
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      try {
        return await handleGetConfig(
          supabase,
          input,
          ctx.user.id,
          ctx.user.organizationId,
          requestId
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            configId: input.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in config.get'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while fetching LMS configuration',
        });
      }
    }),

  /**
   * Create a new LMS configuration
   *
   * Purpose: Creates a new LMS configuration for an organization.
   *
   * Authorization: Requires organization admin
   *
   * Input: Configuration fields (name, URLs, credentials, defaults)
   *
   * Output: Created configuration summary (id, name, created_at)
   *
   * Validation:
   * - Name must be unique per organization
   * - URLs must be valid HTTPS URLs
   * - Client credentials must not be empty
   *
   * @throws {TRPCError} FORBIDDEN if user is not admin
   * @throws {TRPCError} CONFLICT if configuration with same name exists
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * const result = await trpc.lms.config.create.mutate({
   *   organization_id: 'org-uuid',
   *   name: 'Production LMS',
   *   lms_url: 'https://lms.example.com',
   *   studio_url: 'https://studio.example.com',
   *   client_id: 'my-client-id',
   *   client_secret: 'my-client-secret',
   *   default_org: 'MegaCampus',
   * });
   * // Returns: { id: 'config-uuid', name: 'Production LMS', created_at: '2024-12-11T...' }
   * ```
   */
  create: protectedProcedure
    .input(
      z.object({
        organization_id: z.string().uuid('Invalid organization ID'),
        name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
        description: z.string().max(500, 'Description too long').optional(),
        lms_url: z.string().url('Invalid LMS URL'),
        studio_url: z.string().url('Invalid Studio URL'),
        client_id: z.string().min(1, 'Client ID is required'),
        client_secret: z.string().min(1, 'Client secret is required'),
        default_org: z
          .string()
          .min(1, 'Default organization is required')
          .max(50, 'Organization code too long'),
        default_run: z.string().max(50, 'Run identifier too long').default('self_paced'),
        import_timeout_seconds: z
          .number()
          .int()
          .min(30, 'Timeout too short')
          .max(600, 'Timeout too long')
          .default(300),
        max_retries: z
          .number()
          .int()
          .min(1, 'At least 1 retry required')
          .max(5, 'Too many retries')
          .default(3),
      })
    )
    .output(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        created_at: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      try {
        return await handleCreateConfig(
          supabase,
          input,
          ctx.user.id,
          ctx.user.organizationId,
          ctx.user.role,
          requestId
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in config.create'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while creating LMS configuration',
        });
      }
    }),

  /**
   * Update an existing LMS configuration
   *
   * Purpose: Updates fields of an existing LMS configuration.
   *
   * Authorization: Requires organization admin
   *
   * Input: Configuration ID and optional update fields
   *
   * Output: Updated configuration summary (id, updated_at)
   *
   * Constraints:
   * - Only provided fields are updated
   * - Cannot change organization_id
   * - Name must remain unique per organization
   *
   * @throws {TRPCError} NOT_FOUND if configuration not found
   * @throws {TRPCError} FORBIDDEN if user is not admin
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * const result = await trpc.lms.config.update.mutate({
   *   id: 'config-uuid',
   *   name: 'Updated Name',
   *   is_active: false,
   * });
   * // Returns: { id: 'config-uuid', updated_at: '2024-12-11T...' }
   * ```
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid configuration ID'),
        name: z.string().min(1, 'Name cannot be empty').max(100, 'Name too long').optional(),
        description: z.string().max(500, 'Description too long').nullable().optional(),
        lms_url: z.string().url('Invalid LMS URL').optional(),
        studio_url: z.string().url('Invalid Studio URL').optional(),
        client_id: z.string().min(1, 'Client ID cannot be empty').optional(),
        client_secret: z.string().min(1, 'Client secret cannot be empty').optional(),
        default_org: z
          .string()
          .min(1, 'Organization cannot be empty')
          .max(50, 'Organization code too long')
          .optional(),
        default_run: z.string().max(50, 'Run identifier too long').optional(),
        import_timeout_seconds: z
          .number()
          .int()
          .min(30, 'Timeout too short')
          .max(600, 'Timeout too long')
          .optional(),
        max_retries: z
          .number()
          .int()
          .min(1, 'At least 1 retry required')
          .max(5, 'Too many retries')
          .optional(),
        is_active: z.boolean().optional(),
      })
    )
    .output(
      z.object({
        id: z.string().uuid(),
        updated_at: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      try {
        return await handleUpdateConfig(
          supabase,
          input,
          ctx.user.id,
          ctx.user.organizationId,
          ctx.user.role,
          requestId
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            configId: input.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in config.update'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while updating LMS configuration',
        });
      }
    }),

  /**
   * Delete an LMS configuration
   *
   * Purpose: Deletes an LMS configuration if no active import jobs reference it.
   *
   * Authorization: Requires organization admin
   *
   * Input:
   * - id: UUID of configuration to delete
   *
   * Output:
   * - success: true
   *
   * Constraints:
   * - Cannot delete if active import jobs exist (status = pending, uploading, or processing)
   *
   * @throws {TRPCError} NOT_FOUND if configuration not found
   * @throws {TRPCError} FORBIDDEN if user is not admin
   * @throws {TRPCError} CONFLICT if active import jobs reference this configuration
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * const result = await trpc.lms.config.delete.mutate({
   *   id: 'config-uuid',
   * });
   * // Returns: { success: true }
   * ```
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid configuration ID'),
      })
    )
    .output(
      z.object({
        success: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      try {
        return await handleDeleteConfig(
          supabase,
          input,
          ctx.user.id,
          ctx.user.organizationId,
          ctx.user.role,
          requestId
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            configId: input.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in config.delete'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while deleting LMS configuration',
        });
      }
    }),

  /**
   * Test LMS configuration connection
   *
   * Purpose: Tests connectivity to an LMS instance. This endpoint:
   * 1. Verifies user is organization admin
   * 2. Fetches LMS configuration from database
   * 3. Creates adapter and tests connection with 10-second timeout
   * 4. Updates last_connection_test and last_connection_status in database
   * 5. Returns connection test result
   *
   * Authorization: Requires organization admin role
   *
   * Input:
   * - id: UUID of LMS configuration to test
   *
   * Output:
   * - success: Whether connection test succeeded
   * - latency_ms: Connection latency in milliseconds
   * - message: Human-readable result message
   * - lms_version: LMS version (optional)
   * - api_version: API version (optional)
   *
   * Validation:
   * - User must be organization admin
   * - LMS config must exist and belong to user's organization
   * - Connection test must complete within 10 seconds (enforced via timeout)
   *
   * Database Updates:
   * - last_connection_test: Set to current timestamp
   * - last_connection_status: Set to 'success' or 'failed'
   *
   * @throws {TRPCError} FORBIDDEN if user is not organization admin
   * @throws {TRPCError} NOT_FOUND if LMS configuration not found
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if database update fails
   *
   * @example
   * ```typescript
   * const result = await trpc.lms.config.testConnection.mutate({
   *   id: '987fcdeb-51a2-43d7-89ab-456789abcdef',
   * });
   *
   * // Returns (success):
   * // {
   * //   success: true,
   * //   latency_ms: 234,
   * //   message: 'Successfully connected to Open edX at https://lms.example.com',
   * //   lms_version: undefined,
   * //   api_version: 'v0'
   * // }
   *
   * // Returns (auth failure):
   * // {
   * //   success: false,
   * //   latency_ms: 156,
   * //   message: 'Authentication failed - check client ID and secret',
   * //   lms_version: undefined,
   * //   api_version: undefined
   * // }
   *
   * // Returns (network failure):
   * // {
   * //   success: false,
   * //   latency_ms: 5002,
   * //   message: 'Cannot reach LMS - check URL and network connectivity',
   * //   lms_version: undefined,
   * //   api_version: undefined
   * // }
   *
   * // Returns (timeout):
   * // {
   * //   success: false,
   * //   latency_ms: 10000,
   * //   message: 'Connection test timed out after 10 seconds',
   * //   lms_version: undefined,
   * //   api_version: undefined
   * // }
   * ```
   */
  testConnection: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid LMS configuration ID'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      try {
        return await handleTestConnection(
          supabase,
          input,
          ctx.user.id,
          ctx.user.organizationId,
          ctx.user.role,
          requestId
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            configId: input.id,
            organizationId: ctx.user.organizationId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in config.testConnection'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while testing LMS connection',
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type ConfigRouter = typeof configRouter;
