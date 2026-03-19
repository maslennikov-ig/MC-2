/**
 * Shared constants for the generation router module.
 */

/**
 * Priority mapping for subscription tiers.
 * Higher values indicate higher priority in job queues.
 */
export const TIER_PRIORITY: Record<string, number> = {
  trial: 1,
  free: 1,
  basic: 3,
  standard: 5,
  premium: 10,
};

/**
 * Forbidden keys that could lead to prototype pollution attacks.
 * These must never be used as path segments in setNestedValue.
 */
export const FORBIDDEN_PATH_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Statuses that allow (re-)initiating course generation.
 * NULL generation_status = never generated (new course), always allowed
 * via short-circuit in the guard check.
 * Must match the WHERE clause in initialize_fsm_with_outbox RPC.
 */
export const ALLOWED_INITIATE_STATUSES = ['pending', 'completed', 'failed', 'cancelled'] as const;
