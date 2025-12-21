/**
 * Admin Tiers Router
 * @module server/routers/admin/tiers
 *
 * Provides superadmin-only procedures for managing tier settings.
 * All operations are logged to admin_audit_logs and trigger cache refresh.
 *
 * Procedures:
 * - listTiers: Get all tier settings
 * - getTier: Get single tier by tierKey
 * - updateTier: Update tier settings
 * - resetTierToDefaults: Reset tier to hardcoded defaults
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';
import { refreshCache as refreshTierCache, clearCache as clearTierCache } from '../../../shared/tier/tier-settings-service';
import type { TierSettings, TierSettingsRow } from '@megacampus/shared-types';
import type { Database } from '@megacampus/shared-types/database.types';
import { toTierSettings, getDefaultTierSettingsForKey } from '@megacampus/shared-types';

type Json = Database['public']['Tables']['tier_settings']['Row']['features'];

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Valid tier keys enum
 */
const tierKeySchema = z.enum(['trial', 'free', 'basic', 'standard', 'premium']);

/**
 * Get tier input schema
 */
const getTierInputSchema = z.object({
  tierKey: tierKeySchema,
});

/**
 * Validation limits for tier settings
 * Used to prevent unreasonable values from being set
 */
const VALIDATION_LIMITS = {
  /** Max storage quota: 1 TB */
  maxStorageBytes: 1099511627776,
  /** Max file size: 1 GB */
  maxFileSizeBytes: 1073741824,
  /** Max files per course */
  maxFilesPerCourse: 100,
  /** Max concurrent jobs */
  maxConcurrentJobs: 50,
  /** Max monthly price: $10,000 */
  maxMonthlyPriceCents: 1000000,
} as const;

/**
 * Update tier input schema
 * All fields except tierKey are optional to allow partial updates
 * Includes upper bounds to prevent unreasonable values
 */
const updateTierInputSchema = z.object({
  tierKey: tierKeySchema,
  displayName: z.string().min(1).max(50).optional(),
  storageQuotaBytes: z
    .number()
    .positive()
    .max(VALIDATION_LIMITS.maxStorageBytes, 'Storage quota cannot exceed 1 TB')
    .optional(),
  maxFileSizeBytes: z
    .number()
    .positive()
    .max(VALIDATION_LIMITS.maxFileSizeBytes, 'File size cannot exceed 1 GB')
    .optional(),
  maxFilesPerCourse: z
    .number()
    .nonnegative()
    .max(VALIDATION_LIMITS.maxFilesPerCourse, 'Files per course cannot exceed 100')
    .optional(),
  maxConcurrentJobs: z
    .number()
    .positive()
    .max(VALIDATION_LIMITS.maxConcurrentJobs, 'Concurrent jobs cannot exceed 50')
    .optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
  allowedExtensions: z.array(z.string()).optional(),
  monthlyPriceCents: z
    .number()
    .nonnegative()
    .max(VALIDATION_LIMITS.maxMonthlyPriceCents, 'Monthly price cannot exceed $10,000')
    .optional(),
  features: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// ROUTER
// ============================================================================

export const tiersRouter = router({
  /**
   * List all tier settings
   *
   * Purpose: Admin dashboard to view all tier configurations.
   * Useful for reviewing and comparing tier limits.
   *
   * Authorization: Superadmin only
   *
   * Output: Array of TierSettings
   */
  listTiers: superadminProcedure.query(async (): Promise<TierSettings[]> => {
    try {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from('tier_settings')
        .select('*')
        .order('tier_key');

      if (error) {
        logger.error({ err: error.message }, 'Failed to fetch tier settings');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.databaseError('Tier settings listing', error.message),
        });
      }

      if (!data || data.length === 0) {
        return [];
      }

      return data.map((row) => toTierSettings(row as TierSettingsRow));
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        'Unexpected error in listTiers'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: ErrorMessages.internalError(
          'Tier settings listing',
          error instanceof Error ? error.message : undefined
        ),
      });
    }
  }),

  /**
   * Get single tier settings by tierKey
   *
   * Purpose: View detailed settings for a specific tier.
   *
   * Authorization: Superadmin only
   *
   * Input: tierKey (trial, free, basic, standard, premium)
   * Output: TierSettings
   */
  getTier: superadminProcedure
    .input(getTierInputSchema)
    .query(async ({ input }): Promise<TierSettings> => {
      try {
        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase
          .from('tier_settings')
          .select('*')
          .eq('tier_key', input.tierKey)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: ErrorMessages.notFound('Tier settings', input.tierKey),
            });
          }
          logger.error({ err: error.message, tierKey: input.tierKey }, 'Failed to fetch tier settings');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Tier settings retrieval', error.message),
          });
        }

        if (!data) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: ErrorMessages.notFound('Tier settings', input.tierKey),
          });
        }

        return toTierSettings(data as TierSettingsRow);
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          { err: error instanceof Error ? error.message : String(error), tierKey: input.tierKey },
          'Unexpected error in getTier'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Tier settings retrieval',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Update tier settings
   *
   * Purpose: Modify tier configuration (limits, pricing, features).
   * Triggers cache refresh and logs to audit log.
   *
   * Authorization: Superadmin only
   *
   * Input: tierKey + optional fields to update
   * Output: Updated TierSettings
   */
  updateTier: superadminProcedure
    .input(updateTierInputSchema)
    .mutation(async ({ input, ctx }): Promise<TierSettings> => {
      try {
        const supabase = getSupabaseAdmin();

        // Fetch current tier settings for audit log
        const { data: existingData, error: fetchError } = await supabase
          .from('tier_settings')
          .select('*')
          .eq('tier_key', input.tierKey)
          .single();

        if (fetchError || !existingData) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: ErrorMessages.notFound('Tier settings', input.tierKey),
          });
        }

        // Build update object (convert camelCase to snake_case)
        const updateData: { [key: string]: Json | undefined } = {
          updated_at: new Date().toISOString(),
        };

        if (input.displayName !== undefined) {
          updateData.display_name = input.displayName;
        }
        if (input.storageQuotaBytes !== undefined) {
          updateData.storage_quota_bytes = input.storageQuotaBytes;
        }
        if (input.maxFileSizeBytes !== undefined) {
          updateData.max_file_size_bytes = input.maxFileSizeBytes;
        }
        if (input.maxFilesPerCourse !== undefined) {
          updateData.max_files_per_course = input.maxFilesPerCourse;
        }
        if (input.maxConcurrentJobs !== undefined) {
          updateData.max_concurrent_jobs = input.maxConcurrentJobs;
        }
        if (input.allowedMimeTypes !== undefined) {
          updateData.allowed_mime_types = input.allowedMimeTypes;
        }
        if (input.allowedExtensions !== undefined) {
          updateData.allowed_extensions = input.allowedExtensions;
        }
        if (input.monthlyPriceCents !== undefined) {
          updateData.monthly_price_cents = input.monthlyPriceCents;
        }
        if (input.features !== undefined) {
          updateData.features = input.features as Json;
        }
        if (input.isActive !== undefined) {
          updateData.is_active = input.isActive;
        }

        // Update tier settings
        const { data, error } = await supabase
          .from('tier_settings')
          .update(updateData)
          .eq('tier_key', input.tierKey)
          .select()
          .single();

        if (error) {
          logger.error({ err: error.message, tierKey: input.tierKey }, 'Failed to update tier settings');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Tier settings update', error.message),
          });
        }

        if (!data) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: ErrorMessages.notFound('Tier settings', input.tierKey),
          });
        }

        // Log audit event
        await supabase.from('admin_audit_logs').insert({
          admin_id: ctx.user!.id,
          action: 'update_tier_settings',
          resource_type: 'tier_settings',
          resource_id: input.tierKey,
          metadata: {
            old_values: {
              display_name: existingData.display_name,
              storage_quota_bytes: existingData.storage_quota_bytes,
              max_file_size_bytes: existingData.max_file_size_bytes,
              max_files_per_course: existingData.max_files_per_course,
              max_concurrent_jobs: existingData.max_concurrent_jobs,
              monthly_price_cents: existingData.monthly_price_cents,
              is_active: existingData.is_active,
            },
            new_values: updateData,
          },
        });

        // Refresh cache after update (blocking to ensure consistency)
        try {
          await refreshTierCache();
          logger.info({ tierKey: input.tierKey }, '[TiersRouter] Cache refreshed after tier update');
        } catch (cacheError) {
          // Clear cache on failure so next request fetches fresh data from DB
          clearTierCache();
          logger.error(
            { err: cacheError instanceof Error ? cacheError.message : String(cacheError), tierKey: input.tierKey },
            '[TiersRouter] Failed to refresh cache after tier update, cache cleared'
          );
        }

        return toTierSettings(data as TierSettingsRow);
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          { err: error instanceof Error ? error.message : String(error), tierKey: input.tierKey },
          'Unexpected error in updateTier'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Tier settings update',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Reset tier to hardcoded defaults
   *
   * Purpose: Restore a tier's settings to the original hardcoded values.
   * Useful for reverting changes or resetting after experimentation.
   *
   * Authorization: Superadmin only
   *
   * Input: tierKey
   * Output: Reset TierSettings
   */
  resetTierToDefaults: superadminProcedure
    .input(getTierInputSchema)
    .mutation(async ({ input, ctx }): Promise<TierSettings> => {
      try {
        const supabase = getSupabaseAdmin();
        const { tierKey } = input;

        // Fetch current settings for audit log
        const { data: existingData, error: fetchError } = await supabase
          .from('tier_settings')
          .select('*')
          .eq('tier_key', tierKey)
          .single();

        if (fetchError || !existingData) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: ErrorMessages.notFound('Tier settings', tierKey),
          });
        }

        // Get default values from shared constants (single source of truth)
        const tierDefaults = getDefaultTierSettingsForKey(tierKey);
        const defaultValues = {
          display_name: tierDefaults.displayName,
          storage_quota_bytes: tierDefaults.storageQuotaBytes,
          max_file_size_bytes: tierDefaults.maxFileSizeBytes,
          max_files_per_course: tierDefaults.maxFilesPerCourse,
          max_concurrent_jobs: tierDefaults.maxConcurrentJobs,
          allowed_mime_types: tierDefaults.allowedMimeTypes,
          allowed_extensions: tierDefaults.allowedExtensions,
          monthly_price_cents: tierDefaults.monthlyPriceCents,
          features: tierDefaults.features as Json,
          is_active: tierDefaults.isActive,
          updated_at: new Date().toISOString(),
        };

        // Update tier settings with defaults
        const { data, error } = await supabase
          .from('tier_settings')
          .update(defaultValues)
          .eq('tier_key', tierKey)
          .select()
          .single();

        if (error) {
          logger.error({ err: error.message, tierKey }, 'Failed to reset tier settings');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Tier settings reset', error.message),
          });
        }

        if (!data) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: ErrorMessages.notFound('Tier settings', tierKey),
          });
        }

        // Log audit event (exclude features from audit to keep it simple)
        const auditNewValues = {
          display_name: defaultValues.display_name,
          storage_quota_bytes: defaultValues.storage_quota_bytes,
          max_file_size_bytes: defaultValues.max_file_size_bytes,
          max_files_per_course: defaultValues.max_files_per_course,
          max_concurrent_jobs: defaultValues.max_concurrent_jobs,
          monthly_price_cents: defaultValues.monthly_price_cents,
          is_active: defaultValues.is_active,
        };
        await supabase.from('admin_audit_logs').insert({
          admin_id: ctx.user!.id,
          action: 'reset_tier_settings',
          resource_type: 'tier_settings',
          resource_id: tierKey,
          metadata: {
            old_values: {
              display_name: existingData.display_name,
              storage_quota_bytes: existingData.storage_quota_bytes,
              max_file_size_bytes: existingData.max_file_size_bytes,
              max_files_per_course: existingData.max_files_per_course,
              max_concurrent_jobs: existingData.max_concurrent_jobs,
              monthly_price_cents: existingData.monthly_price_cents,
              is_active: existingData.is_active,
            },
            new_values: auditNewValues,
          },
        });

        // Refresh cache after reset (blocking to ensure consistency)
        try {
          await refreshTierCache();
          logger.info({ tierKey }, '[TiersRouter] Cache refreshed after tier reset');
        } catch (cacheError) {
          // Clear cache on failure so next request fetches fresh data from DB
          clearTierCache();
          logger.error(
            { err: cacheError instanceof Error ? cacheError.message : String(cacheError), tierKey },
            '[TiersRouter] Failed to refresh cache after tier reset, cache cleared'
          );
        }

        return toTierSettings(data as TierSettingsRow);
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          { err: error instanceof Error ? error.message : String(error), tierKey: input.tierKey },
          'Unexpected error in resetTierToDefaults'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Tier settings reset',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),
});

export type TiersRouter = typeof tiersRouter;
