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
import { createLMSAdapter } from '../../../integrations/lms';
import { nanoid } from 'nanoid';
import type { OpenEdXConfig } from '@megacampus/shared-types/lms';
import { OpenEdXAuthError, LMSNetworkError, LMSTimeoutError } from '@megacampus/shared-types/lms/errors';
import { verifyOrganizationAccess, requireAdmin } from './helpers';

/**
 * LMS Configuration Connection Test Fields
 *
 * These fields exist in the database schema (see migration 20241211_create_lms_integration_tables.sql)
 * but are not yet reflected in generated TypeScript types. This interface provides proper typing
 * for connection test status tracking until the types are regenerated.
 *
 * @see packages/course-gen-platform/supabase/migrations/20241211_create_lms_integration_tables.sql
 */
interface LmsConfigConnectionFields {
  /** ISO 8601 timestamp of the last connection test */
  last_connection_test: string;
  /** Result status of the last connection test */
  last_connection_status: 'success' | 'failed' | 'pending';
}

/**
 * Connection test timeout in milliseconds (10 seconds)
 *
 * Rationale:
 * - Fast feedback for UI (user shouldn't wait too long)
 * - Sufficient time for OAuth2 token + API call (typical: 2-3 seconds)
 * - Buffer for network latency on slow connections
 * - Matches acceptance criteria: "within 10 seconds"
 */
const CONNECTION_TEST_TIMEOUT = 10000;

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
      const { organization_id, include_inactive } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user.id;
      const userOrgId = ctx.user.organizationId;

      lmsLogger.info(
        { requestId, userId, organizationId: organization_id, includeInactive: include_inactive },
        'Listing LMS configurations'
      );

      try {
        // Verify user belongs to organization
        verifyOrganizationAccess(organization_id, userOrgId, requestId, userId, 'list configs');

        // Build query
        let query = supabase
          .from('lms_configurations')
          .select('*')
          .eq('organization_id', organization_id);

        // Filter by active status unless include_inactive is true
        if (!include_inactive) {
          query = query.eq('is_active', true);
        }

        // Order by created_at DESC
        query = query.order('created_at', { ascending: false });

        const { data: configs, error } = await query;

        if (error) {
          lmsLogger.error({ requestId, error }, 'Failed to fetch LMS configurations');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch LMS configurations',
          });
        }

        lmsLogger.debug(
          { requestId, count: configs?.length || 0 },
          'LMS configurations retrieved'
        );

        // Return configs without secrets (client_id, client_secret)
        // LmsConfigurationPublicSchema.parse() ensures secrets are omitted
        return (configs || []).map(config => {
          const { client_id, client_secret, ...publicConfig } = config;
          return publicConfig;
        });
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
      const { id: configId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user.id;
      const userOrgId = ctx.user.organizationId;

      lmsLogger.info({ requestId, userId, configId }, 'Fetching LMS configuration');

      try {
        const { data: config, error } = await supabase
          .from('lms_configurations')
          .select('*')
          .eq('id', configId)
          .single();

        if (error || !config) {
          lmsLogger.debug({ requestId, configId, error }, 'LMS configuration not found');
          return null;
        }

        // Verify user belongs to same organization
        verifyOrganizationAccess(config.organization_id, userOrgId, requestId, userId, 'access config');

        lmsLogger.debug({ requestId, configId, configName: config.name }, 'LMS configuration retrieved');

        // Return config without secrets (omit client_id and client_secret)
        const { client_id, client_secret, ...publicConfig } = config;
        return publicConfig;
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            configId,
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
        default_org: z.string().min(1, 'Default organization is required').max(50, 'Organization code too long'),
        default_run: z.string().max(50, 'Run identifier too long').default('self_paced'),
        import_timeout_seconds: z.number().int().min(30, 'Timeout too short').max(600, 'Timeout too long').default(300),
        max_retries: z.number().int().min(1, 'At least 1 retry required').max(5, 'Too many retries').default(3),
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
      const userId = ctx.user.id;
      const userOrgId = ctx.user.organizationId;
      const userRole = ctx.user.role;

      lmsLogger.info(
        { requestId, userId, organizationId: input.organization_id, configName: input.name },
        'Creating LMS configuration'
      );

      try {
        // Verify user is admin of the organization
        verifyOrganizationAccess(input.organization_id, userOrgId, requestId, userId, 'create config');
        requireAdmin(userRole, requestId, userId, userOrgId);

        // Check if name is unique per organization
        const { data: existing } = await supabase
          .from('lms_configurations')
          .select('id')
          .eq('organization_id', input.organization_id)
          .eq('name', input.name)
          .single();

        if (existing) {
          lmsLogger.warn(
            { requestId, organizationId: input.organization_id, configName: input.name },
            'LMS configuration name already exists'
          );
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A configuration named "${input.name}" already exists in this organization`,
          });
        }

        // Create configuration
        const { data: config, error: createError } = await supabase
          .from('lms_configurations')
          .insert({
            organization_id: input.organization_id,
            name: input.name,
            description: input.description || null,
            lms_url: input.lms_url,
            studio_url: input.studio_url,
            client_id: input.client_id,
            client_secret: input.client_secret,
            default_org: input.default_org,
            default_run: input.default_run,
            import_timeout_seconds: input.import_timeout_seconds,
            max_retries: input.max_retries,
            created_by: userId,
            is_active: true,
          })
          .select('id, name, created_at')
          .single();

        if (createError || !config) {
          lmsLogger.error({ requestId, error: createError }, 'Failed to create LMS configuration');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create LMS configuration',
          });
        }

        lmsLogger.info(
          { requestId, configId: config.id, configName: config.name },
          'LMS configuration created successfully'
        );

        return {
          id: config.id,
          name: config.name,
          created_at: config.created_at,
        };
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
        default_org: z.string().min(1, 'Organization cannot be empty').max(50, 'Organization code too long').optional(),
        default_run: z.string().max(50, 'Run identifier too long').optional(),
        import_timeout_seconds: z.number().int().min(30, 'Timeout too short').max(600, 'Timeout too long').optional(),
        max_retries: z.number().int().min(1, 'At least 1 retry required').max(5, 'Too many retries').optional(),
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
      const { id: configId, ...updates } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user.id;
      const userOrgId = ctx.user.organizationId;
      const userRole = ctx.user.role;

      lmsLogger.info({ requestId, userId, configId }, 'Updating LMS configuration');

      try {
        // Fetch existing config
        const { data: config, error: fetchError } = await supabase
          .from('lms_configurations')
          .select('id, organization_id, name')
          .eq('id', configId)
          .single();

        if (fetchError || !config) {
          lmsLogger.warn({ requestId, configId, error: fetchError }, 'LMS configuration not found');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'LMS configuration not found',
          });
        }

        // Verify user is admin of the organization
        verifyOrganizationAccess(config.organization_id, userOrgId, requestId, userId, 'update config');
        requireAdmin(userRole, requestId, userId, userOrgId);

        // Check name uniqueness if name is being updated
        if (updates.name && updates.name !== config.name) {
          const { data: existing } = await supabase
            .from('lms_configurations')
            .select('id')
            .eq('organization_id', config.organization_id)
            .eq('name', updates.name)
            .single();

          if (existing) {
            lmsLogger.warn(
              { requestId, configId, newName: updates.name },
              'LMS configuration name already exists'
            );
            throw new TRPCError({
              code: 'CONFLICT',
              message: `A configuration named "${updates.name}" already exists in this organization`,
            });
          }
        }

        // Build update payload (only include provided fields)
        const updatePayload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (updates.name !== undefined) updatePayload.name = updates.name;
        if (updates.description !== undefined) updatePayload.description = updates.description;
        if (updates.lms_url !== undefined) updatePayload.lms_url = updates.lms_url;
        if (updates.studio_url !== undefined) updatePayload.studio_url = updates.studio_url;
        if (updates.client_id !== undefined) updatePayload.client_id = updates.client_id;
        if (updates.client_secret !== undefined) updatePayload.client_secret = updates.client_secret;
        if (updates.default_org !== undefined) updatePayload.default_org = updates.default_org;
        if (updates.default_run !== undefined) updatePayload.default_run = updates.default_run;
        if (updates.import_timeout_seconds !== undefined) updatePayload.import_timeout_seconds = updates.import_timeout_seconds;
        if (updates.max_retries !== undefined) updatePayload.max_retries = updates.max_retries;
        if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;

        // Update configuration
        const { data: updated, error: updateError } = await supabase
          .from('lms_configurations')
          .update(updatePayload)
          .eq('id', configId)
          .select('id, updated_at')
          .single();

        if (updateError || !updated) {
          lmsLogger.error({ requestId, configId, error: updateError }, 'Failed to update LMS configuration');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update LMS configuration',
          });
        }

        lmsLogger.info({ requestId, configId }, 'LMS configuration updated successfully');

        return {
          id: updated.id,
          updated_at: updated.updated_at,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            configId,
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
      const { id: configId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user.id;
      const userOrgId = ctx.user.organizationId;
      const userRole = ctx.user.role;

      lmsLogger.info({ requestId, userId, configId }, 'Deleting LMS configuration');

      try {
        // Fetch existing config
        const { data: config, error: fetchError } = await supabase
          .from('lms_configurations')
          .select('id, organization_id, name')
          .eq('id', configId)
          .single();

        if (fetchError || !config) {
          lmsLogger.warn({ requestId, configId, error: fetchError }, 'LMS configuration not found');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'LMS configuration not found',
          });
        }

        // Verify user is admin of the organization
        verifyOrganizationAccess(config.organization_id, userOrgId, requestId, userId, 'delete config');
        requireAdmin(userRole, requestId, userId, userOrgId);

        // Check for active import jobs
        const { data: activeJobs, error: jobsError } = await supabase
          .from('lms_import_jobs')
          .select('id')
          .eq('lms_configuration_id', configId)
          .in('status', ['pending', 'uploading', 'processing'])
          .limit(1);

        if (jobsError) {
          lmsLogger.error({ requestId, configId, error: jobsError }, 'Failed to check for active import jobs');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to check for active import jobs',
          });
        }

        if (activeJobs && activeJobs.length > 0) {
          lmsLogger.warn(
            { requestId, configId, activeJobCount: activeJobs.length },
            'Cannot delete config with active import jobs'
          );
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cannot delete configuration while import jobs are active. Please wait for jobs to complete or cancel them first.',
          });
        }

        // Delete configuration
        const { error: deleteError } = await supabase
          .from('lms_configurations')
          .delete()
          .eq('id', configId);

        if (deleteError) {
          lmsLogger.error({ requestId, configId, error: deleteError }, 'Failed to delete LMS configuration');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete LMS configuration',
          });
        }

        lmsLogger.info({ requestId, configId, configName: config.name }, 'LMS configuration deleted successfully');

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            configId,
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
      const { id: configId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user.id;
      const organizationId = ctx.user.organizationId;
      const userRole = ctx.user.role;

      lmsLogger.info(
        { requestId, userId, configId, userRole, organizationId },
        'Starting LMS connection test'
      );

      // Step 1: Verify user is organization admin
      if (userRole !== 'admin') {
        lmsLogger.warn(
          { requestId, userId, userRole, organizationId },
          'Connection test attempted by non-admin user'
        );
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization administrators can test LMS connections',
        });
      }

      try {
        // Step 2: Fetch LMS configuration (must belong to user's organization)
        const { data: config, error: configError } = await supabase
          .from('lms_configurations')
          .select('*')
          .eq('id', configId)
          .eq('organization_id', organizationId)
          .single();

        if (configError || !config) {
          lmsLogger.warn(
            { requestId, configId, organizationId, error: configError },
            'LMS configuration not found'
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'LMS configuration not found or access denied',
          });
        }

        lmsLogger.debug(
          { requestId, configId, lmsName: config.name, lmsUrl: config.lms_url },
          'LMS configuration loaded'
        );

        // Step 3: Validate Studio URL exists
        if (!config.studio_url) {
          lmsLogger.error({ requestId, configId }, 'LMS configuration missing Studio URL');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'LMS configuration is missing Studio URL. Please update the configuration.',
          });
        }

        // Step 4: Create adapter configuration
        const adapterConfig: OpenEdXConfig = {
          instanceId: config.id,
          name: config.name,
          type: 'openedx' as const,
          organization: config.default_org,
          lmsUrl: config.lms_url,
          cmsUrl: config.studio_url,
          clientId: config.client_id,
          clientSecret: config.client_secret,
          timeout: CONNECTION_TEST_TIMEOUT, // 10 second timeout for connection test
          maxRetries: 1, // No retries for connection test
          pollInterval: 5000, // Not used for connection test
          enabled: config.is_active,
          autoCreateCourse: false,
        };

        const adapter = createLMSAdapter('openedx', adapterConfig);

        // Step 5: Test connection with timeout
        const startTime = Date.now();
        let connectionResult;
        let timeoutId: NodeJS.Timeout | undefined;

        try {
          // Create a timeout promise with proper cleanup
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new LMSTimeoutError(
                `Connection test timed out after ${CONNECTION_TEST_TIMEOUT / 1000} seconds`,
                'openedx',
                CONNECTION_TEST_TIMEOUT,
                'connect'
              ));
            }, CONNECTION_TEST_TIMEOUT);
          });

          // Race connection test against timeout
          try {
            connectionResult = await Promise.race([
              adapter.testConnection(),
              timeoutPromise,
            ]);
          } finally {
            // Always clear the timeout to prevent memory leaks
            if (timeoutId !== undefined) {
              clearTimeout(timeoutId);
            }
          }

          lmsLogger.info(
            { requestId, configId, success: connectionResult.success, latency: connectionResult.latencyMs },
            'Connection test completed'
          );
        } catch (error) {
          const latencyMs = Date.now() - startTime;

          // Map errors to user-friendly messages
          let message: string;

          if (error instanceof OpenEdXAuthError) {
            message = 'Authentication failed - check client ID and secret';
            lmsLogger.warn(
              { requestId, configId, latencyMs, error: error.message },
              'Connection test failed: Authentication error'
            );
          } else if (error instanceof LMSNetworkError) {
            message = 'Cannot reach LMS - check URL and network connectivity';
            lmsLogger.warn(
              { requestId, configId, latencyMs, error: error.message },
              'Connection test failed: Network error'
            );
          } else if (error instanceof LMSTimeoutError) {
            message = `Connection test timed out after ${CONNECTION_TEST_TIMEOUT / 1000} seconds`;
            lmsLogger.warn(
              { requestId, configId, latencyMs, duration: error.duration },
              'Connection test failed: Timeout'
            );
          } else {
            message = `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            lmsLogger.error(
              { requestId, configId, latencyMs, error },
              'Connection test failed: Unknown error'
            );
          }

          connectionResult = {
            success: false,
            latencyMs,
            message,
            lmsVersion: undefined,
            apiVersion: undefined,
          };
        }

        // Step 6: Update database with connection test result
        const testTimestamp = new Date().toISOString();
        const updatePayload: LmsConfigConnectionFields = {
          last_connection_test: testTimestamp,
          last_connection_status: connectionResult.success ? 'success' : 'failed',
        };

        const { error: updateError } = await supabase
          .from('lms_configurations')
          .update(updatePayload as unknown as Record<string, unknown>)
          .eq('id', configId);

        if (updateError) {
          lmsLogger.error(
            { requestId, configId, error: updateError },
            'Failed to update connection test result in database'
          );
          // Don't throw - connection test succeeded, just log the database error
        } else {
          lmsLogger.debug(
            { requestId, configId, status: connectionResult.success ? 'success' : 'failed' },
            'Connection test result saved to database'
          );
        }

        // Step 7: Return result with proper field names for tRPC output
        return {
          success: connectionResult.success,
          latency_ms: connectionResult.latencyMs,
          message: connectionResult.message,
          lms_version: connectionResult.lmsVersion,
          api_version: connectionResult.apiVersion,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            configId,
            organizationId,
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
