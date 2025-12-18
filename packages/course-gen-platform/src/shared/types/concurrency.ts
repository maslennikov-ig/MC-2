/**
 * Type definitions for concurrency tracking
 * @module types/concurrency
 */

/**
 * Internal tier representation for concurrency control.
 * Uses UPPERCASE to distinguish from database Tier type (lowercase).
 *
 * @note This is intentionally different from `@megacampus/shared-types` Tier.
 * Database tier values are converted via tierMap in generation.ts before
 * being passed to ConcurrencyTracker.
 *
 * @see TIER_LIMITS in tracker.ts for concurrency limits per tier
 * @see TIER_PRIORITY in tracker.ts for priority weights
 */
export type UserTier = 'FREE' | 'BASIC' | 'STANDARD' | 'TRIAL' | 'PREMIUM';

export interface TierConcurrencyLimits {
  FREE: number;
  BASIC: number;
  STANDARD: number;
  TRIAL: number;
  PREMIUM: number;
}

export interface ConcurrencyCheckResult {
  allowed: boolean;
  reason?: 'user_limit' | 'global_limit' | 'success';
  current_user_jobs?: number;
  user_limit?: number;
  current_global_jobs?: number;
  global_limit?: number;
}
