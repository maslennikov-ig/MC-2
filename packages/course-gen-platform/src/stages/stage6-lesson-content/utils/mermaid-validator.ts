/**
 * Mermaid Syntax Validator
 * @module stages/stage6-lesson-content/utils/mermaid-validator
 *
 * Validates Mermaid diagram syntax using mermaid.parse() API.
 * Provides detailed error information for debugging LLM-generated diagrams.
 *
 * This validator uses the official mermaid parser to check syntax validity,
 * ensuring that diagrams will render correctly in the frontend.
 *
 * @see https://mermaid.js.org/config/setup/modules/mermaidAPI.html#parse
 *
 * @example
 * ```typescript
 * import { validateMermaidSyntax } from './mermaid-validator';
 *
 * const code = `graph TD
 *   A[Start] --> B[Process]
 *   B --> C[End]`;
 *
 * const result = await validateMermaidSyntax(code);
 * if (result.valid) {
 *   console.log('Valid diagram:', result.diagramType);
 * } else {
 *   console.error('Syntax errors:', result.errors);
 * }
 * ```
 */

import crypto from 'crypto';
import mermaid from 'mermaid';
import { ensureDOMGlobals, isDOMInitialized } from './mermaid-dom-setup';
import { logger } from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of Mermaid syntax validation
 */
export interface MermaidValidationResult {
  /** Whether the syntax is valid */
  valid: boolean;
  /** Array of error messages (empty if valid) */
  errors: string[];
  /** Detected diagram type (e.g., 'flowchart', 'sequenceDiagram', 'classDiagram') */
  diagramType: string | null;
}

/**
 * Parsed Mermaid error with structured information
 */
export interface ParsedMermaidError {
  /** Line number where error occurred (1-based, if available) */
  line?: number;
  /** Column number where error occurred (1-based, if available) */
  column?: number;
  /** Human-readable error message */
  message: string;
  /** Original raw error string */
  rawError: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Parse with timeout to prevent hanging on complex diagrams
 */
const PARSE_TIMEOUT_MS = 5000;

async function parseWithTimeout(code: string): Promise<{ diagramType: string } | false> {
  return Promise.race([
    mermaid.parse(code) as Promise<{ diagramType: string } | false>,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Mermaid parse timeout exceeded')), PARSE_TIMEOUT_MS)
    ),
  ]);
}

// ============================================================================
// CACHE
// ============================================================================

/**
 * LRU cache for validated diagrams
 * Key: SHA-256 hash of diagram content
 * Value: Validation result
 */
const validationCache = new Map<string, MermaidValidationResult>();
const MAX_CACHE_SIZE = 100;

/**
 * Generate cache key from diagram content
 */
function getCacheKey(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
}

/**
 * Get validation cache statistics
 *
 * @returns Cache size and max size
 */
export function getValidationCacheStats(): { size: number; maxSize: number } {
  return { size: validationCache.size, maxSize: MAX_CACHE_SIZE };
}

/**
 * Clear validation cache (for testing)
 * @internal
 */
export function clearValidationCache(): void {
  validationCache.clear();
}

// ============================================================================
// STATE
// ============================================================================

/**
 * Track mermaid initialization state
 * Ensures mermaid.initialize() is only called once
 */
let mermaidInitialized = false;

/** Promise tracking mermaid initialization to prevent race conditions */
let mermaidInitPromise: Promise<void> | null = null;

/**
 * Ensure mermaid is initialized (thread-safe).
 * Uses promise-based mutex to prevent race conditions.
 *
 * IMPORTANT: Checks if DOM globals are still valid. If cleanupDOMGlobals()
 * was called, DOM globals are gone but mermaidInitialized may still be true.
 * In this case, we need to reinitialize both DOM and mermaid.
 */
async function ensureMermaidInitialized(): Promise<void> {
  // Check if DOM globals were cleaned up (fixes DOMPurify.addHook error)
  // This can happen when cleanupDOMGlobals() is called in mermaid-fix-pipeline.ts
  const domStillValid = isDOMInitialized();

  if (mermaidInitialized && domStillValid) {
    return;
  }

  // If DOM was cleaned up, reset our state and reinitialize
  if (mermaidInitialized && !domStillValid) {
    logger.debug('Mermaid validator: DOM globals were cleaned up, reinitializing');
    mermaidInitialized = false;
    mermaidInitPromise = null;
  }

  // If initialization is in progress, wait for it
  if (mermaidInitPromise) {
    return mermaidInitPromise;
  }

  // Start initialization
  mermaidInitPromise = Promise.resolve().then(() => {
    ensureDOMGlobals();
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'strict',
    });
    mermaidInitialized = true;
    logger.debug('Mermaid validator: Initialized mermaid library (thread-safe)');
  });

  return mermaidInitPromise;
}

// ============================================================================
// MAIN VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate Mermaid diagram syntax using official parser
 *
 * Uses `mermaid.parse()` to check syntax validity. This is the same
 * parser used for rendering, ensuring validation matches runtime behavior.
 *
 * **Handles edge cases:**
 * - Empty strings → invalid
 * - Whitespace-only content → invalid
 * - Missing diagram type → invalid
 * - Malformed syntax → invalid with error details
 *
 * @param code - Mermaid diagram code to validate
 * @returns Validation result with errors and diagram type
 *
 * @example
 * ```typescript
 * // Valid diagram
 * const result1 = await validateMermaidSyntax('graph TD; A-->B;');
 * // { valid: true, errors: [], diagramType: 'flowchart' }
 *
 * // Invalid syntax
 * const result2 = await validateMermaidSyntax('graph TD; A--');
 * // { valid: false, errors: ['Parse error...'], diagramType: null }
 *
 * // Empty content
 * const result3 = await validateMermaidSyntax('');
 * // { valid: false, errors: ['Empty or whitespace-only content'], diagramType: null }
 * ```
 */
export async function validateMermaidSyntax(code: string): Promise<MermaidValidationResult> {
  // Ensure mermaid is initialized (thread-safe)
  await ensureMermaidInitialized();

  // Edge case: empty or whitespace-only content
  if (!code || code.trim().length === 0) {
    logger.debug('Mermaid validator: Empty or whitespace-only content');
    return {
      valid: false,
      errors: ['Empty or whitespace-only content'],
      diagramType: null,
    };
  }

  const trimmedCode = code.trim();

  // Check cache first
  const cacheKey = getCacheKey(trimmedCode);
  const cached = validationCache.get(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Mermaid validator: Cache hit');
    return cached;
  }

  try {
    // mermaid.parse() returns { diagramType: string } on success
    // throws Error on syntax failure
    const result = await parseWithTimeout(trimmedCode);

    // Handle parse failure (result === false)
    if (result === false) {
      logger.debug({ codeLength: trimmedCode.length }, 'Mermaid validator: Parse returned false');
      return {
        valid: false,
        errors: ['Mermaid parse failed'],
        diagramType: null,
      };
    }

    logger.debug(
      { diagramType: result.diagramType, codeLength: trimmedCode.length },
      'Mermaid validator: Syntax valid'
    );

    const validResult: MermaidValidationResult = {
      valid: true,
      errors: [],
      diagramType: result.diagramType ?? null,
    };

    // Cache result (LRU eviction)
    if (validationCache.size >= MAX_CACHE_SIZE) {
      const firstKey = validationCache.keys().next().value;
      if (firstKey) validationCache.delete(firstKey);
    }
    validationCache.set(cacheKey, validResult);

    return validResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.debug(
      { error: errorMessage, codeLength: trimmedCode.length },
      'Mermaid validator: Syntax invalid'
    );

    const invalidResult: MermaidValidationResult = {
      valid: false,
      errors: [errorMessage],
      diagramType: null,
    };

    // Cache result (LRU eviction)
    if (validationCache.size >= MAX_CACHE_SIZE) {
      const firstKey = validationCache.keys().next().value;
      if (firstKey) validationCache.delete(firstKey);
    }
    validationCache.set(cacheKey, invalidResult);

    return invalidResult;
  }
}

/**
 * Validate Mermaid syntax without throwing - silent mode
 *
 * Useful for batch processing where you only need a boolean result.
 * Suppresses all errors and returns simple true/false.
 *
 * **Use when:**
 * - Filtering valid diagrams from a batch
 * - Quick pre-validation before detailed validation
 * - You don't need error messages
 *
 * @param code - Mermaid diagram code to validate
 * @returns True if valid, false otherwise
 *
 * @example
 * ```typescript
 * const diagrams = ['graph TD; A-->B;', 'invalid', 'sequenceDiagram\nA->>B:Hi'];
 * const validOnes = [];
 *
 * for (const diagram of diagrams) {
 *   if (await validateMermaidSilent(diagram)) {
 *     validOnes.push(diagram);
 *   }
 * }
 * // validOnes: ['graph TD; A-->B;', 'sequenceDiagram\nA->>B:Hi']
 * ```
 */
export async function validateMermaidSilent(code: string): Promise<boolean> {
  // Ensure mermaid is initialized (thread-safe)
  await ensureMermaidInitialized();

  // Edge case: empty content
  if (!code || code.trim().length === 0) {
    return false;
  }

  try {
    // Parse with error suppression
    const result = await mermaid.parse(code.trim(), { suppressErrors: true });
    // mermaid.parse() returns false when suppressErrors: true and parsing fails
    return result !== false;
  } catch {
    // Catch any unexpected errors
    return false;
  }
}

// ============================================================================
// ERROR PARSING UTILITIES
// ============================================================================

/**
 * Parse Mermaid error message to extract structured information
 *
 * Mermaid errors often contain position information like:
 * - "Parse error on line 3"
 * - "Syntax error at column 15"
 *
 * This function extracts that information into a structured format.
 *
 * @param error - Error message from mermaid.parse()
 * @returns Parsed error with line/column information
 *
 * @example
 * ```typescript
 * const error = "Parse error on line 3: Unexpected token";
 * const parsed = parseMermaidError(error);
 * // {
 * //   line: 3,
 * //   column: undefined,
 * //   message: "Unexpected token",
 * //   rawError: "Parse error on line 3: Unexpected token"
 * // }
 * ```
 */
export function parseMermaidError(error: string): ParsedMermaidError {
  // Match patterns like "line 3", "line 12", etc.
  const lineMatch = error.match(/line\s+(\d+)/i);

  // Match patterns like "column 15", "col 7", etc.
  const colMatch = error.match(/(?:column|col)\s+(\d+)/i);

  // Extract clean message by removing position prefix
  const cleanMessage = error
    .replace(/Parse error on line \d+.*?:\s*/i, '')
    .replace(/Syntax error at (?:line|column) \d+.*?:\s*/i, '')
    .trim();

  const parsed: ParsedMermaidError = {
    line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
    column: colMatch ? parseInt(colMatch[1], 10) : undefined,
    message: cleanMessage || error, // Fallback to full error if cleaning fails
    rawError: error,
  };

  logger.debug(
    { line: parsed.line, column: parsed.column, message: parsed.message },
    'Mermaid validator: Parsed error information'
  );

  return parsed;
}

/**
 * Batch validate multiple Mermaid diagrams
 *
 * Validates an array of diagrams and returns results for each.
 * Useful for validating all diagrams in a lesson at once.
 *
 * **Performance note:** Validations run sequentially to avoid
 * overwhelming the mermaid parser with concurrent operations.
 *
 * @param diagrams - Array of Mermaid diagram codes
 * @returns Array of validation results (same order as input)
 *
 * @example
 * ```typescript
 * const diagrams = [
 *   'graph TD; A-->B;',
 *   'invalid syntax',
 *   'sequenceDiagram\nA->>B:Hello'
 * ];
 *
 * const results = await batchValidateMermaid(diagrams);
 * // [
 * //   { valid: true, errors: [], diagramType: 'flowchart' },
 * //   { valid: false, errors: [...], diagramType: null },
 * //   { valid: true, errors: [], diagramType: 'sequence' }
 * // ]
 * ```
 */
export async function batchValidateMermaid(diagrams: string[]): Promise<MermaidValidationResult[]> {
  logger.debug({ count: diagrams.length }, 'Mermaid validator: Starting batch validation');

  const results: MermaidValidationResult[] = [];

  // Validate sequentially to avoid parser conflicts
  for (const diagram of diagrams) {
    const result = await validateMermaidSyntax(diagram);
    results.push(result);
  }

  const validCount = results.filter(r => r.valid).length;
  const invalidCount = results.length - validCount;

  logger.info(
    { total: diagrams.length, valid: validCount, invalid: invalidCount },
    'Mermaid validator: Batch validation complete'
  );

  return results;
}

/**
 * Get summary of validation results
 *
 * Aggregates validation results for reporting purposes.
 *
 * @param results - Array of validation results from batch validation
 * @returns Summary statistics
 *
 * @example
 * ```typescript
 * const results = await batchValidateMermaid(diagrams);
 * const summary = getValidationSummary(results);
 * // {
 * //   total: 10,
 * //   valid: 8,
 * //   invalid: 2,
 * //   diagramTypes: { flowchart: 5, sequence: 3 },
 * //   errorMessages: ['Parse error...', 'Unexpected token...']
 * // }
 * ```
 */
export function getValidationSummary(results: MermaidValidationResult[]): {
  total: number;
  valid: number;
  invalid: number;
  diagramTypes: Record<string, number>;
  errorMessages: string[];
} {
  const total = results.length;
  const valid = results.filter(r => r.valid).length;
  const invalid = total - valid;

  // Count diagram types
  const diagramTypes: Record<string, number> = {};
  for (const result of results) {
    if (result.diagramType) {
      diagramTypes[result.diagramType] = (diagramTypes[result.diagramType] || 0) + 1;
    }
  }

  // Collect unique error messages
  const errorMessages = [...new Set(results.flatMap(r => r.errors))];

  return {
    total,
    valid,
    invalid,
    diagramTypes,
    errorMessages,
  };
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Reset mermaid initialization state (for testing only).
 * @internal
 */
export function resetMermaidInitialization(): void {
  mermaidInitialized = false;
  mermaidInitPromise = null;
}
