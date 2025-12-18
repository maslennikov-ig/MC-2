/**
 * Layer 1: Auto-Repair - Free Repair Strategies
 *
 * This layer uses jsonrepair library (FSM-based) + field name normalization.
 * - Cost: FREE (no LLM calls)
 * - Success Rate: 95-98%
 * - Use Case: First line of defense for all stages
 *
 * @module shared/regeneration/layers/layer-1-auto-repair
 * @see specs/008-generation-generation-json/research-decisions/rt-005-pragmatic-hybrid-implementation-prompt.md
 */

import { extractJSON, safeJSONParse } from '@/shared/utils/json-repair';
import { fixFieldNames } from '@/shared/utils/field-name-fix';

/**
 * Repair strategy used for successful parsing
 */
export type AutoRepairStrategy =
  | 'none' // Parsed without repair
  | 'jsonrepair_fsm' // jsonrepair library
  | 'field_name_fix'; // Field name normalization

/**
 * Auto-repair result
 */
export interface AutoRepairResult {
  success: boolean;
  parsed?: any;
  strategy?: AutoRepairStrategy;
  error?: string;
}

/**
 * Auto-repair JSON using jsonrepair library and field name fix
 *
 * Attempts repair in order:
 * 1. Direct JSON.parse (no repair)
 * 2. jsonrepair library (95-98% success)
 * 3. Field name fix (camelCase → snake_case)
 *
 * @param rawJSON - Raw JSON string (may be malformed)
 * @returns Auto-repair result with parsed object or error
 */
export function autoRepairJSON(rawJSON: string): AutoRepairResult {
  // Try direct parse first
  try {
    const parsed = JSON.parse(rawJSON);
    return { success: true, parsed, strategy: 'none' };
  } catch {
    // Continue to repair
  }

  // Try jsonrepair + safeJSONParse (includes custom strategies)
  try {
    const parsed = safeJSONParse(rawJSON);
    return { success: true, parsed, strategy: 'jsonrepair_fsm' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Auto-repair failed',
    };
  }
}

/**
 * Apply field name fix to parsed object
 *
 * @param parsed - Parsed object (may have camelCase fields)
 * @returns Object with snake_case fields
 */
export function applyFieldNameFix<T = any>(parsed: any): T {
  return fixFieldNames<T>(parsed);
}

// Re-export utilities for convenience
export { extractJSON, fixFieldNames };
