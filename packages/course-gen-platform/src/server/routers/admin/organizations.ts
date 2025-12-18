/**
 * Admin Organizations Router
 * @module server/routers/admin/organizations
 *
 * Provides admin procedures for organization management.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { adminProcedure, superadminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { listOrganizationsInputSchema } from './shared/schemas';
import type { OrganizationListItem, OrganizationDetails, PlatformStatistics } from './shared/types';

export const organizationsRouter = router({
  /**
   * List all organizations
   *
   * Purpose: Admin dashboard to view all organizations in the system with
   * storage quota usage and tier information. Useful for monitoring system
   * usage and identifying organizations approaching quota limits.
   *
   * Authorization: Admin only (uses adminProcedure)
   *
   * Input:
   * - limit (optional): Number of items to return (1-100, default: 20)
   * - offset (optional): Number of items to skip for pagination (default: 0)
   *
   * Output:
   * - Array of organizations with:
   *   - id: Organization UUID
   *   - name: Organization name
   *   - tier: Subscription tier (free, basic_plus, standard, premium)
   *   - storageQuotaBytes: Total storage quota in bytes
   *   - storageUsedBytes: Current storage usage in bytes
   *   - storageUsedPercentage: Storage usage as percentage (0-100)
   *   - createdAt: Organization creation timestamp (ISO 8601)
   *   - updatedAt: Last update timestamp (ISO 8601) or null
   *
   * Error Handling:
   * - Unauthorized (not admin) → 403 FORBIDDEN (handled by adminProcedure)
   * - Database error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const orgs = await trpc.admin.listOrganizations.query({
   *   limit: 50,
   *   offset: 0
   * });
   * // [{ id: '...', name: 'Acme Corp', tier: 'premium', ... }]
   * ```
   */
  listOrganizations: adminProcedure
    .input(listOrganizationsInputSchema)
    .query(async ({ input }): Promise<OrganizationListItem[]> => {
      const { limit, offset } = input;

      try {
        const supabase = getSupabaseAdmin();

        // Query organizations table with pagination
        const { data, error } = await supabase
          .from('organizations')
          .select('id, name, tier, storage_quota_bytes, storage_used_bytes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        // Handle database errors
        if (error) {
          logger.error({
            err: error.message,
            limit,
            offset,
          }, 'Failed to fetch organizations');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Organization listing', error.message),
          });
        }

        // Return empty array if no results
        if (!data || data.length === 0) {
          return [];
        }

        // Transform data to match response shape
        return data.map(org => ({
          id: org.id,
          name: org.name,
          tier: org.tier || 'free', // Default to 'free' if tier is null
          storageQuotaBytes: org.storage_quota_bytes,
          storageUsedBytes: org.storage_used_bytes,
          storageUsedPercentage:
            org.storage_quota_bytes > 0
              ? Math.round((org.storage_used_bytes / org.storage_quota_bytes) * 100)
              : 0,
          createdAt: org.created_at || new Date().toISOString(),
          updatedAt: org.updated_at,
        }));
      } catch (error) {
        // Re-throw TRPCError as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          err: error instanceof Error ? error.message : String(error),
          limit,
          offset,
        }, 'Unexpected error in listOrganizations');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Organization listing',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Get platform-wide statistics
   *
   * Purpose: Dashboard overview showing total counts and breakdown by tier/status/role.
   * Useful for understanding platform growth and usage patterns.
   *
   * Authorization: Superadmin only (uses superadminProcedure)
   *
   * Input: None
   *
   * Output:
   * - organizations: Total count and breakdown by tier
   * - courses: Total count and breakdown by status
   * - users: Total count and breakdown by role
   *
   * Error Handling:
   * - Unauthorized (not superadmin) → 403 FORBIDDEN (handled by superadminProcedure)
   * - Database error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const stats = await trpc.admin.getStatistics.query();
   * // { organizations: { total: 50, byTier: { free: 30, ... } }, ... }
   * ```
   */
  getStatistics: superadminProcedure.query(async (): Promise<PlatformStatistics> => {
    try {
      const supabase = getSupabaseAdmin();

      // Query for total counts and breakdowns
      const [orgsResult, coursesResult, usersResult] = await Promise.all([
        supabase.from('organizations').select('tier'),
        supabase.from('courses').select('status'),
        supabase.from('users').select('role'),
      ]);

      if (orgsResult.error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.databaseError('Organizations statistics', orgsResult.error.message),
        });
      }

      if (coursesResult.error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.databaseError('Courses statistics', coursesResult.error.message),
        });
      }

      if (usersResult.error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.databaseError('Users statistics', usersResult.error.message),
        });
      }

      // Count organizations by tier
      const orgsByTier = (orgsResult.data || []).reduce((acc, org) => {
        const tier = org.tier || 'free';
        acc[tier] = (acc[tier] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Count courses by status
      const coursesByStatus = (coursesResult.data || []).reduce((acc, course) => {
        const status = course.status || 'draft';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Count users by role
      const usersByRole = (usersResult.data || []).reduce((acc, user) => {
        const role = user.role || 'student';
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        organizations: {
          total: orgsResult.data?.length || 0,
          byTier: {
            trial: orgsByTier.trial || 0,
            free: orgsByTier.free || 0,
            basic: orgsByTier.basic || 0,
            standard: orgsByTier.standard || 0,
            premium: orgsByTier.premium || 0,
          },
        },
        courses: {
          total: coursesResult.data?.length || 0,
          byStatus: {
            draft: coursesByStatus.draft || 0,
            published: coursesByStatus.published || 0,
            archived: coursesByStatus.archived || 0,
          },
        },
        users: {
          total: usersResult.data?.length || 0,
          byRole: {
            admin: usersByRole.admin || 0,
            instructor: usersByRole.instructor || 0,
            student: usersByRole.student || 0,
            superadmin: usersByRole.superadmin || 0,
          },
        },
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logger.error({
        err: error instanceof Error ? error.message : String(error),
      }, 'Unexpected error in getStatistics');
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: ErrorMessages.internalError(
          'Statistics retrieval',
          error instanceof Error ? error.message : undefined
        ),
      });
    }
  }),

  /**
   * Get detailed information about a single organization
   *
   * Purpose: View detailed organization info including user count, course count, and API keys.
   * Useful for superadmin management and support.
   *
   * Authorization: Superadmin only (uses superadminProcedure)
   *
   * Input:
   * - organizationId: UUID of the organization to retrieve
   *
   * Output:
   * - Organization details with user count, course count, and active API key count
   *
   * Error Handling:
   * - Unauthorized (not superadmin) → 403 FORBIDDEN (handled by superadminProcedure)
   * - Organization not found → 404 NOT_FOUND
   * - Database error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const org = await trpc.admin.getOrganization.query({ organizationId: '...' });
   * // { id: '...', name: 'Acme', tier: 'premium', userCount: 50, ... }
   * ```
   */
  getOrganization: superadminProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ input }): Promise<OrganizationDetails> => {
      try {
        const supabase = getSupabaseAdmin();

        // Fetch organization details
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', input.organizationId)
          .single();

        if (orgError || !org) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Organization not found',
          });
        }

        // Count users, courses, and active API keys
        const [usersResult, coursesResult, apiKeysResult] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }).eq('organization_id', input.organizationId),
          supabase.from('courses').select('id', { count: 'exact', head: true }).eq('organization_id', input.organizationId),
          supabase.from('api_keys').select('id', { count: 'exact', head: true }).eq('organization_id', input.organizationId).is('revoked_at', null),
        ]);

        return {
          id: org.id,
          name: org.name,
          tier: org.tier || 'free',
          storageQuotaBytes: org.storage_quota_bytes,
          storageUsedBytes: org.storage_used_bytes,
          storageUsedPercentage:
            org.storage_quota_bytes > 0
              ? Math.round((org.storage_used_bytes / org.storage_quota_bytes) * 100)
              : 0,
          createdAt: org.created_at || new Date().toISOString(),
          updatedAt: org.updated_at,
          userCount: usersResult.count || 0,
          courseCount: coursesResult.count || 0,
          activeApiKeyCount: apiKeysResult.count || 0,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          err: error instanceof Error ? error.message : String(error),
          organizationId: input.organizationId,
        }, 'Unexpected error in getOrganization');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Organization retrieval',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Create a new organization
   *
   * Purpose: Create a new organization with initial API key.
   * Useful for onboarding new customers or creating test organizations.
   *
   * Authorization: Superadmin only (uses superadminProcedure)
   *
   * Input:
   * - name: Organization name (3-100 characters)
   * - tier: Subscription tier (free, basic_plus, standard, premium)
   *
   * Output:
   * - Organization details
   * - API key (ONLY time the full key is shown)
   *
   * Error Handling:
   * - Unauthorized (not superadmin) → 403 FORBIDDEN (handled by superadminProcedure)
   * - Database error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.admin.createOrganization.mutate({
   *   name: 'Acme Corp',
   *   tier: 'premium'
   * });
   * // { organization: { ... }, apiKey: 'mcai_abc123...' }
   * ```
   */
  createOrganization: superadminProcedure
    .input(z.object({
      name: z.string().min(3).max(100),
      tier: z.enum(['trial', 'free', 'basic', 'standard', 'premium']),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const supabase = getSupabaseAdmin();

        // Create organization (DB will set default storage_quota_bytes based on tier)
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: input.name,
            tier: input.tier,
          })
          .select()
          .single();

        if (orgError || !org) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Organization creation', orgError?.message || 'Unknown error'),
          });
        }

        // Generate API key
        const apiKey = `mcai_${randomBytes(32).toString('hex')}`;
        const keyPrefix = apiKey.slice(0, 13); // 'mcai_' + first 8 hex chars
        const keyHash = await bcrypt.hash(apiKey, 10);

        // Store API key in database
        const { error: keyError } = await supabase
          .from('api_keys')
          .insert({
            organization_id: org.id,
            key_prefix: keyPrefix,
            key_hash: keyHash,
            name: 'Default API Key',
            created_by: ctx.user!.id,
          });

        if (keyError) {
          // Rollback organization creation if API key creation fails
          await supabase.from('organizations').delete().eq('id', org.id);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('API key creation', keyError.message),
          });
        }

        // Log audit event
        await supabase.from('admin_audit_logs').insert({
          admin_id: ctx.user!.id,
          action: 'create_organization',
          resource_type: 'organization',
          resource_id: org.id,
          metadata: {
            organization_name: org.name,
            tier: org.tier,
          },
        });

        return {
          organization: {
            id: org.id,
            name: org.name,
            tier: org.tier || 'free',
            storageQuotaBytes: org.storage_quota_bytes,
            storageUsedBytes: org.storage_used_bytes,
            createdAt: org.created_at || new Date().toISOString(),
          },
          apiKey,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          err: error instanceof Error ? error.message : String(error),
          name: input.name,
          tier: input.tier,
        }, 'Unexpected error in createOrganization');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Organization creation',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Update an existing organization
   *
   * Purpose: Update organization name or tier. Storage quota is automatically
   * adjusted based on tier by database constraints.
   *
   * Authorization: Superadmin only (uses superadminProcedure)
   *
   * Input:
   * - organizationId: UUID of the organization to update
   * - data: Object with optional name and/or tier updates
   *
   * Output:
   * - Updated organization details
   *
   * Error Handling:
   * - Unauthorized (not superadmin) → 403 FORBIDDEN (handled by superadminProcedure)
   * - Organization not found → 404 NOT_FOUND
   * - Database error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const org = await trpc.admin.updateOrganization.mutate({
   *   organizationId: '...',
   *   data: { tier: 'premium' }
   * });
   * // { id: '...', name: 'Acme', tier: 'premium', ... }
   * ```
   */
  updateOrganization: superadminProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      data: z.object({
        name: z.string().min(3).max(100).optional(),
        tier: z.enum(['trial', 'free', 'basic', 'standard', 'premium']).optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const supabase = getSupabaseAdmin();

        // Fetch current organization data
        const { data: existingOrg, error: fetchError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', input.organizationId)
          .single();

        if (fetchError || !existingOrg) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Organization not found',
          });
        }

        // Update organization
        const { data: org, error: updateError } = await supabase
          .from('organizations')
          .update(input.data)
          .eq('id', input.organizationId)
          .select()
          .single();

        if (updateError || !org) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Organization update', updateError?.message || 'Unknown error'),
          });
        }

        // Log audit event
        await supabase.from('admin_audit_logs').insert({
          admin_id: ctx.user!.id,
          action: 'update_organization',
          resource_type: 'organization',
          resource_id: org.id,
          metadata: {
            old_values: {
              name: existingOrg.name,
              tier: existingOrg.tier,
            },
            new_values: input.data,
          },
        });

        return {
          id: org.id,
          name: org.name,
          tier: org.tier || 'free',
          storageQuotaBytes: org.storage_quota_bytes,
          storageUsedBytes: org.storage_used_bytes,
          createdAt: org.created_at || new Date().toISOString(),
          updatedAt: org.updated_at,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          err: error instanceof Error ? error.message : String(error),
          organizationId: input.organizationId,
        }, 'Unexpected error in updateOrganization');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Organization update',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),
});

export type OrganizationsRouter = typeof organizationsRouter;
