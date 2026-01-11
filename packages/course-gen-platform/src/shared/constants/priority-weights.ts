/**
 * Document Priority Weights for RAG Boosting
 *
 * Centralized mapping of document priority levels to numeric weights.
 * Used for priority boosting during vector search retrieval.
 *
 * Weight formula during search:
 *   boosted_score = base_score * (1 + (weight - 0.5) * boost_factor)
 *
 * With default boost_factor=0.4:
 *   - CORE (1.0):         +20% boost
 *   - IMPORTANT (0.8):    +12% boost
 *   - SUPPLEMENTARY (0.5): 0% boost (baseline)
 *
 * @module shared/constants/priority-weights
 * @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
 */

import type { DocumentPriorityLevel } from '@megacampus/shared-types';
import { logger } from '../logger/index.js';

/**
 * Priority level to numeric weight mapping
 *
 * @example
 * ```typescript
 * const weight = PRIORITY_WEIGHTS.CORE; // 1.0
 * ```
 */
export const PRIORITY_WEIGHTS: Record<DocumentPriorityLevel, number> = {
  CORE: 1.0,
  IMPORTANT: 0.8,
  SUPPLEMENTARY: 0.5,
} as const;

/**
 * Default weight for missing/invalid priority values
 */
export const DEFAULT_PRIORITY_WEIGHT = PRIORITY_WEIGHTS.SUPPLEMENTARY;

/**
 * Default priority level for missing/invalid values
 */
export const DEFAULT_PRIORITY_LEVEL: DocumentPriorityLevel = 'SUPPLEMENTARY';

/**
 * Valid priority levels set for validation
 */
export const VALID_PRIORITY_LEVELS = new Set<DocumentPriorityLevel>([
  'CORE',
  'IMPORTANT',
  'SUPPLEMENTARY',
]);

/**
 * Get numeric weight for a document priority level
 *
 * Handles null/undefined with warning log. Falls back to SUPPLEMENTARY weight.
 *
 * @param priority - Document priority level (may be null/undefined)
 * @param context - Optional context for logging (e.g., { fileId, courseId })
 * @returns Numeric weight (0.5-1.0)
 *
 * @example
 * ```typescript
 * const weight = getPriorityWeight('CORE'); // 1.0
 * const weight = getPriorityWeight(null);   // 0.5 (with warning)
 * ```
 */
export function getPriorityWeight(
  priority: DocumentPriorityLevel | null | undefined,
  context?: Record<string, unknown>
): number {
  if (!priority) {
    logger.warn({
      priority,
      defaultWeight: DEFAULT_PRIORITY_WEIGHT,
      ...context,
    }, 'Missing document priority - using SUPPLEMENTARY weight as default');
    return DEFAULT_PRIORITY_WEIGHT;
  }

  if (!VALID_PRIORITY_LEVELS.has(priority)) {
    logger.error({
      priority,
      defaultWeight: DEFAULT_PRIORITY_WEIGHT,
      ...context,
    }, 'UNEXPECTED document priority value - using SUPPLEMENTARY weight');
    return DEFAULT_PRIORITY_WEIGHT;
  }

  return PRIORITY_WEIGHTS[priority];
}

/**
 * Validate and normalize a priority level
 *
 * @param priority - Raw priority value from database/API
 * @param context - Optional context for logging
 * @returns Valid DocumentPriorityLevel
 */
export function validatePriorityLevel(
  priority: unknown,
  context?: Record<string, unknown>
): DocumentPriorityLevel {
  if (typeof priority === 'string' && VALID_PRIORITY_LEVELS.has(priority as DocumentPriorityLevel)) {
    return priority as DocumentPriorityLevel;
  }

  if (priority !== null && priority !== undefined) {
    logger.warn({
      invalidPriority: priority,
      defaultedTo: DEFAULT_PRIORITY_LEVEL,
      ...context,
    }, 'Invalid document_priority value - defaulting to SUPPLEMENTARY');
  }

  return DEFAULT_PRIORITY_LEVEL;
}
