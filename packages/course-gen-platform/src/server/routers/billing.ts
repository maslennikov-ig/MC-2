/**
 * Billing Router (Placeholder)
 * @module server/routers/billing
 *
 * Provides placeholder procedures for billing and usage tracking in Stage 0.
 * This router handles organization storage usage and tier quota information.
 *
 * Stage 0 Implementation:
 * - getUsage: Query current storage usage and file counts
 * - getQuota: Query tier information and quota limits
 *
 * Future Expansion:
 * - Payment processing integration (Stripe, Paddle, etc.)
 * - Subscription management (upgrade, downgrade, cancel)
 * - Billing history and invoice generation
 * - Usage alerts and notifications
 * - Payment method management
 * - Webhook handlers for payment events
 */

 
 

import { TRPCError } from '@trpc/server';
import { router } from '../trpc';
import { protectedProcedure } from '../middleware/auth';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { FILE_COUNT_LIMITS_BY_TIER } from '@megacampus/shared-types';
import {
  STORAGE_QUOTA_BY_TIER,
  formatBytes,
  getNextTier,
  formatTierName,
} from '../utils/billing-helpers';
import { logger } from '../../shared/logger/index.js';
import { ErrorMessages } from '../utils/error-messages.js';

/**
 * Billing router
 *
 * Provides endpoints for:
 * - Get usage (billing.getUsage) - Protected, requires authentication
 * - Get quota (billing.getQuota) - Protected, requires authentication
 */
export const billingRouter = router({
  /**
   * Get organization storage usage
   *
   * Purpose: Display current storage usage metrics for the authenticated user's
   * organization. This includes total storage used, quota limit, usage percentage,
   * and file count.
   *
   * Authorization: Requires authentication (uses protectedProcedure)
   *
   * Input: None (uses authenticated user's organization_id from context)
   *
   * Output:
   * - storageUsedBytes: Raw bytes currently used
   * - storageQuotaBytes: Raw bytes allowed by tier
   * - storageUsedFormatted: Human-readable usage (e.g., "50 MB")
   * - storageQuotaFormatted: Human-readable quota (e.g., "100 MB")
   * - usagePercentage: Percentage of quota used (0-100, 2 decimal places)
   * - fileCount: Total number of files uploaded by organization
   * - tier: Current organization tier
   *
   * Error Handling:
   * - Unauthenticated → 401 UNAUTHORIZED
   * - Organization not found → 404 NOT_FOUND
   * - Database query fails → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const usage = await trpc.billing.getUsage.query();
   * // {
   * //   storageUsedBytes: 52428800,
   * //   storageQuotaBytes: 104857600,
   * //   storageUsedFormatted: "50.00 MB",
   * //   storageQuotaFormatted: "100.00 MB",
   * //   usagePercentage: 50.00,
   * //   fileCount: 5,
   * //   tier: "basic_plus"
   * // }
   * ```
   */
  getUsage: protectedProcedure.query(async ({ ctx }) => {
    // ctx.user is guaranteed non-null by protectedProcedure middleware
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: ErrorMessages.authRequired(),
      });
    }

    const { organizationId } = ctx.user;

    try {
      const supabase = getSupabaseAdmin();

      // Query organization storage metrics
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('storage_used_bytes, storage_quota_bytes, tier')
        .eq('id', organizationId)
        .single();

      if (orgError || !org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: ErrorMessages.organizationNotFound(organizationId),
        });
      }

      // Query file count for the organization
      const { count: fileCount, error: fileCountError } = await supabase
        .from('file_catalog')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId);

      if (fileCountError) {
        logger.error({
          err: fileCountError.message,
          organizationId,
        }, 'Failed to count files for organization');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve file count',
        });
      }

      // Calculate usage percentage
      const usagePercentage =
        org.storage_quota_bytes > 0
          ? Number(((org.storage_used_bytes / org.storage_quota_bytes) * 100).toFixed(2))
          : 0;

      return {
        storageUsedBytes: org.storage_used_bytes,
        storageQuotaBytes: org.storage_quota_bytes,
        storageUsedFormatted: formatBytes(org.storage_used_bytes),
        storageQuotaFormatted: formatBytes(org.storage_quota_bytes),
        usagePercentage,
        fileCount: fileCount ?? 0,
        tier: org.tier,
      };
    } catch (error) {
      // Re-throw TRPCError instances
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap other errors
      logger.error({
        err: error instanceof Error ? error.message : String(error),
        organizationId,
      }, 'Failed to retrieve storage usage');
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to retrieve storage usage: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      });
    }
  }),

  /**
   * Get organization tier and quota information
   *
   * Purpose: Display tier details and quota limits for the authenticated user's
   * organization. This includes tier name, storage quota, file count limit,
   * and upgrade prompt (if applicable).
   *
   * Authorization: Requires authentication (uses protectedProcedure)
   *
   * Input: None (uses authenticated user's organization_id from context)
   *
   * Output:
   * - tier: Current organization tier (free, basic_plus, standard, premium)
   * - tierDisplayName: Human-readable tier name
   * - storageQuotaBytes: Storage limit in bytes
   * - storageQuotaFormatted: Human-readable storage limit (e.g., "1 GB")
   * - fileCountLimit: Maximum files per course for this tier
   * - fileCountLimitDisplay: Formatted file count limit (e.g., "3 files per course")
   * - canUpgrade: Whether upgrade is available
   * - nextTier: Next tier in upgrade path (null if at premium)
   * - upgradePrompt: Message encouraging upgrade (null if at premium)
   *
   * Error Handling:
   * - Unauthenticated → 401 UNAUTHORIZED
   * - Organization not found → 404 NOT_FOUND
   * - Database query fails → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const quota = await trpc.billing.getQuota.query();
   * // {
   * //   tier: "basic_plus",
   * //   tierDisplayName: "Basic Plus",
   * //   storageQuotaBytes: 104857600,
   * //   storageQuotaFormatted: "100.00 MB",
   * //   fileCountLimit: 1,
   * //   fileCountLimitDisplay: "1 file per course",
   * //   canUpgrade: true,
   * //   nextTier: "standard",
   * //   upgradePrompt: "Upgrade to Standard for 1 GB storage and 3 files per course"
   * // }
   * ```
   */
  getQuota: protectedProcedure.query(async ({ ctx }) => {
    // ctx.user is guaranteed non-null by protectedProcedure middleware
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: ErrorMessages.authRequired(),
      });
    }

    const { organizationId } = ctx.user;

    try {
      const supabase = getSupabaseAdmin();

      // Query organization tier and quota
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('tier, storage_quota_bytes')
        .eq('id', organizationId)
        .single();

      if (orgError || !org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: ErrorMessages.organizationNotFound(organizationId),
        });
      }

      const { tier: dbTier, storage_quota_bytes } = org;

      // Handle null tier by defaulting to 'free'
      const tier = dbTier || 'free';

      // Get file count limit for tier
      const fileCountLimit = FILE_COUNT_LIMITS_BY_TIER[tier];

      // Format tier display name
      const tierDisplayName = formatTierName(tier);

      // Determine upgrade path
      const nextTier = getNextTier(tier);
      const canUpgrade = nextTier !== null;

      // Generate upgrade prompt
      let upgradePrompt: string | null = null;
      if (canUpgrade && nextTier) {
        const nextTierQuota = STORAGE_QUOTA_BY_TIER[nextTier];
        const nextTierFileLimit = FILE_COUNT_LIMITS_BY_TIER[nextTier];
        const nextTierDisplayName = formatTierName(nextTier);

        upgradePrompt = `Upgrade to ${nextTierDisplayName} for ${formatBytes(nextTierQuota)} storage and ${nextTierFileLimit} file${nextTierFileLimit !== 1 ? 's' : ''} per course`;
      }

      // Format file count limit display
      const fileCountLimitDisplay =
        fileCountLimit === 0
          ? 'No file uploads allowed'
          : `${fileCountLimit} file${fileCountLimit !== 1 ? 's' : ''} per course`;

      return {
        tier,
        tierDisplayName,
        storageQuotaBytes: storage_quota_bytes,
        storageQuotaFormatted: formatBytes(storage_quota_bytes),
        fileCountLimit,
        fileCountLimitDisplay,
        canUpgrade,
        nextTier,
        upgradePrompt,
      };
    } catch (error) {
      // Re-throw TRPCError instances
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap other errors
      logger.error({
        err: error instanceof Error ? error.message : String(error),
        organizationId,
      }, 'Failed to retrieve quota information');
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to retrieve quota information: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      });
    }
  }),

  // ============================================================================
  // Future Expansion Placeholders
  // ============================================================================
  // The following procedures will be implemented in future stages:
  //
  // - billing.getSubscription: Active subscription details with payment info
  // - billing.upgradeTier: Initiate tier upgrade with payment processing
  // - billing.downgradeTier: Initiate tier downgrade with validation
  // - billing.getBillingHistory: Past invoices and payment history
  // - billing.updatePaymentMethod: Update payment method via Stripe/Paddle
  // - billing.cancelSubscription: Cancel subscription with confirmation
  // - billing.getUsageAlerts: Storage usage alerts and notifications
});

/**
 * Type export for router type inference
 */
export type BillingRouter = typeof billingRouter;
