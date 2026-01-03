/**
 * Stage 7 Activity Limits by Tier
 * @module @megacampus/shared-types/activity-limits
 *
 * Defines tier-based limits for lesson activities (enrichments).
 * These limits are enforced both in the UI and backend API.
 */

import type { TierKey } from './file-upload-constants';

/**
 * Activity type for limit configuration
 * Matches the enrichment types in the database enum
 */
export type ActivityType = 'video' | 'audio' | 'presentation' | 'quiz' | 'document' | 'card';

/**
 * Activity limits configuration for a tier
 */
export interface ActivityLimits {
  /** Maximum total activities per lesson */
  maxPerLesson: number;
  /** Maximum activities of each type per lesson */
  maxPerType: Record<ActivityType, number>;
}

/**
 * Default activity limits by tier
 *
 * These values are designed to:
 * - Trial: Full access for evaluation (same as Standard)
 * - Free: Basic access to try the feature
 * - Basic: Moderate limits for casual users
 * - Standard: Higher limits for regular users
 * - Premium: Generous limits for power users
 */
export const ACTIVITY_LIMITS_BY_TIER: Record<TierKey, ActivityLimits> = {
  trial: {
    maxPerLesson: 10,
    maxPerType: { video: 2, audio: 2, quiz: 5, presentation: 2, document: 2, card: 3 },
  },
  free: {
    maxPerLesson: 3,
    maxPerType: { video: 1, audio: 1, quiz: 2, presentation: 1, document: 1, card: 2 },
  },
  basic: {
    maxPerLesson: 6,
    maxPerType: { video: 1, audio: 2, quiz: 3, presentation: 2, document: 2, card: 3 },
  },
  standard: {
    maxPerLesson: 10,
    maxPerType: { video: 2, audio: 2, quiz: 5, presentation: 2, document: 2, card: 3 },
  },
  premium: {
    maxPerLesson: 20,
    maxPerType: { video: 5, audio: 5, quiz: 10, presentation: 5, document: 5, card: 10 },
  },
};

/**
 * Get activity limits for a tier
 * @param tier - The tier key
 * @returns Activity limits for the tier
 */
export function getActivityLimits(tier: TierKey): ActivityLimits {
  return ACTIVITY_LIMITS_BY_TIER[tier];
}

/**
 * Check if adding an activity of a type would exceed limits
 * @param tier - The tier key
 * @param type - The activity type to add
 * @param currentCounts - Current counts of activities by type
 * @returns Object with exceeded flag and reason if exceeded
 */
export function checkActivityLimit(
  tier: TierKey,
  type: ActivityType,
  currentCounts: Partial<Record<ActivityType, number>>
): { allowed: boolean; reason?: string } {
  const limits = ACTIVITY_LIMITS_BY_TIER[tier];

  // Calculate total current activities
  const totalCurrent = Object.values(currentCounts).reduce((sum, count) => sum + (count || 0), 0);

  // Check total limit
  if (totalCurrent >= limits.maxPerLesson) {
    return {
      allowed: false,
      reason: `Maximum ${limits.maxPerLesson} activities per lesson reached`,
    };
  }

  // Check type-specific limit
  const currentTypeCount = currentCounts[type] || 0;
  if (currentTypeCount >= limits.maxPerType[type]) {
    return {
      allowed: false,
      reason: `Maximum ${limits.maxPerType[type]} ${type} activities per lesson reached`,
    };
  }

  return { allowed: true };
}

/**
 * Get remaining capacity for activities
 * @param tier - The tier key
 * @param currentCounts - Current counts of activities by type
 * @returns Remaining capacity for each type and total
 */
export function getRemainingCapacity(
  tier: TierKey,
  currentCounts: Partial<Record<ActivityType, number>>
): { total: number; byType: Record<ActivityType, number> } {
  const limits = ACTIVITY_LIMITS_BY_TIER[tier];

  // Calculate total current activities
  const totalCurrent = Object.values(currentCounts).reduce((sum, count) => sum + (count || 0), 0);

  // Calculate remaining for each type
  const byType: Record<ActivityType, number> = {
    video: Math.max(0, limits.maxPerType.video - (currentCounts.video || 0)),
    audio: Math.max(0, limits.maxPerType.audio - (currentCounts.audio || 0)),
    presentation: Math.max(0, limits.maxPerType.presentation - (currentCounts.presentation || 0)),
    quiz: Math.max(0, limits.maxPerType.quiz - (currentCounts.quiz || 0)),
    document: Math.max(0, limits.maxPerType.document - (currentCounts.document || 0)),
    card: Math.max(0, limits.maxPerType.card - (currentCounts.card || 0)),
  };

  return {
    total: Math.max(0, limits.maxPerLesson - totalCurrent),
    byType,
  };
}
