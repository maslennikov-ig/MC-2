/**
 * Preprocessing layer for enum validation
 *
 * Applies zero-cost transformations to catch common variations
 * before expensive validation/retry logic.
 *
 * Based on research: "60-80% of validation failures are semantic variations"
 * Cost: FREE (string operations)
 * Success rate: 60-80% of variations fixed
 *
 * @module shared/validation/preprocessing
 * @see docs/investigations/INV-2025-11-19-007-preprocessing-semantic-validation.md
 */

import { ENUM_SYNONYMS } from './enum-synonyms';

export interface PreprocessingResult {
  /** Normalized value */
  value: string;
  /** Whether value was transformed */
  transformed: boolean;
  /** Original value before transformation */
  originalValue?: string;
  /** Transformation applied */
  transformation?: string;
}

/**
 * Preprocess a single value before validation
 *
 * @param value - Raw string value from LLM
 * @param field - Field name (for synonym lookup)
 * @returns Preprocessing result with normalized value
 */
export function preprocessValue(
  value: string,
  field: string
): PreprocessingResult {
  const original = value;

  // Step 1: Basic normalization
  let normalized = value.toLowerCase().trim();

  // Step 2: Fix common typos
  normalized = normalized.replace(/-/g, '_'); // hyphen → underscore
  normalized = normalized.replace(/\s+/g, '_'); // spaces → underscore

  // Step 3: Apply synonym mapping
  const synonymMap = ENUM_SYNONYMS[field];
  if (synonymMap && synonymMap[normalized]) {
    const mapped = synonymMap[normalized];
    return {
      value: mapped,
      transformed: true,
      originalValue: original,
      transformation: `synonym_map: ${original} → ${mapped}`,
    };
  }

  // Step 4: Check if transformation fixed the value
  if (normalized !== original) {
    return {
      value: normalized,
      transformed: true,
      originalValue: original,
      transformation: `normalize: ${original} → ${normalized}`,
    };
  }

  // No transformation needed
  return {
    value: original,
    transformed: false,
  };
}

/**
 * Preprocess an object recursively
 *
 * @param obj - Object to preprocess
 * @param schema - Field type schema (enum vs other)
 * @returns Preprocessed object with normalized enum values
 */
export function preprocessObject<T extends Record<string, any>>(
  obj: T,
  schema: Record<string, 'enum' | 'other'>
): T {
  const result: Record<string, any> = { ...obj };

  for (const [key, type] of Object.entries(schema)) {
    if (type === 'enum' && typeof result[key] === 'string') {
      const preprocessed = preprocessValue(result[key], key);
      if (preprocessed.transformed) {
        console.info(
          `[Preprocessing] ${preprocessed.transformation}`
        );
        result[key] = preprocessed.value;
      }
    }
  }

  return result as T;
}
