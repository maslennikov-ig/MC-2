/**
 * Layer 3: Partial Regeneration
 *
 * ATOMIC field-level regeneration - regenerate only failed fields, preserve successful ones.
 * Refactored from orchestrator/services/analysis/partial-regenerator.ts for reusability.
 *
 * Key principle: ATOMICITY
 * - Track what was successfully parsed
 * - Track what needs regeneration
 * - Don't repeat successful work
 * - Each LLM call solves ONE specific task (regenerate specific fields)
 *
 * Pattern:
 * 1. Use Zod safeParse() to identify successful vs failed fields
 * 2. Extract successful field values
 * 3. Generate focused prompt for ONLY failed fields
 * 4. Invoke LLM to regenerate failed fields
 * 5. Merge successful fields + regenerated fields
 * 6. Validate merged result with full schema
 *
 * @module shared/regeneration/layers/layer-3-partial-regen
 * @see packages/course-gen-platform/src/orchestrator/services/analysis/partial-regenerator.ts (original)
 */

import { z } from 'zod';
import type { ChatOpenAI } from '@langchain/openai';
import logger from '@/shared/logger';

/**
 * Partial regeneration result
 */
export interface PartialRegenerationResult<T = unknown> {
  /** Merged and validated data */
  data: T;
  /** Fields that were already valid */
  successfulFields: string[];
  /** Fields that were regenerated */
  regeneratedFields: string[];
  /** Number of attempts */
  attempts: number;
}

/**
 * Regenerates only failed fields from a partially valid JSON object
 *
 * Uses Zod schema validation to identify which fields are valid and which need regeneration.
 * Only regenerates the minimum necessary fields, preserving successful ones for cost optimization.
 *
 * @param schema - Zod schema for validation
 * @param partialData - Partially valid data (may have some fields valid, some invalid)
 * @param originalPrompt - Original prompt that produced the data (for context)
 * @param model - ChatOpenAI model instance
 * @returns Partial regeneration result with merged data and metadata
 * @throws Error if regeneration fails or merged result still invalid
 *
 * @example
 * ```typescript
 * import { regeneratePartialFields } from '@/shared/regeneration/layers/layer-3-partial-regen';
 * import { Phase2OutputSchema } from '@/orchestrator/services/analysis/phase-2-scope';
 * import { getModelForPhase } from '@/orchestrator/services/analysis/langchain-models';
 *
 * const partial = { total_lessons: 15, total_sections: 3, scope_reasoning: null };
 * const model = await getModelForPhase('stage_4_scope', courseId);
 *
 * const result = await regeneratePartialFields(
 *   Phase2OutputSchema,
 *   partial,
 *   prompt,
 *   model
 * );
 *
 * console.log(result.successfulFields); // ['total_lessons', 'total_sections']
 * console.log(result.regeneratedFields); // ['scope_reasoning']
 * console.log(result.data); // Complete valid object
 * ```
 */
export async function regeneratePartialFields<T>(
  schema: z.ZodSchema<T>,
  partialData: unknown,
  originalPrompt: string,
  model: ChatOpenAI
): Promise<PartialRegenerationResult<T>> {
  logger.info('Layer 3: Partial regeneration starting');

  // Step 1: Validate partial data with Zod
  const validation = schema.safeParse(partialData);

  // If data is already valid, return as-is
  if (validation.success) {
    logger.info('Layer 3: Data already valid, no regeneration needed');
    return {
      data: validation.data,
      successfulFields: partialData && typeof partialData === 'object' ? Object.keys(partialData) : [],
      regeneratedFields: [],
      attempts: 0,
    };
  }

  // Step 2: Analyze validation errors to identify failed fields
  const failedFields = extractFailedFields(validation.error);
  const successfulFields = extractSuccessfulFields(partialData, failedFields);

  logger.debug(
    {
      successfulFields,
      failedFields,
    },
    'Layer 3: Field analysis complete'
  );

  // Step 3: Build focused prompt for regeneration
  const focusedPrompt = buildFocusedPrompt(
    originalPrompt,
    failedFields,
    successfulFields,
    partialData
  );

  logger.debug('Layer 3: Invoking LLM for field regeneration');

  // Step 4: Invoke LLM to regenerate only failed fields
  const response = await model.invoke(focusedPrompt);
  const regeneratedOutput = response.content as string;

  // Parse regenerated output
  let regeneratedData: unknown;
  try {
    regeneratedData = JSON.parse(regeneratedOutput);
  } catch (err) {
    throw new Error(
      `Layer 3: Failed to parse regenerated JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Step 5: Merge successful fields with regenerated fields
  const merged = mergeFields(partialData, regeneratedData, successfulFields, failedFields);

  // Step 6: Validate merged result
  const finalValidation = schema.safeParse(merged);

  if (!finalValidation.success) {
    throw new Error(
      `Layer 3: Merged result still invalid after regeneration: ${formatZodError(finalValidation.error)}`
    );
  }

  logger.info(
    {
      successfulFields: successfulFields.length,
      regeneratedFields: failedFields.length,
    },
    'Layer 3: Partial regeneration succeeded'
  );

  return {
    data: finalValidation.data,
    successfulFields,
    regeneratedFields: failedFields,
    attempts: 1,
  };
}

/**
 * Extracts field paths from Zod validation error
 *
 * @param error - Zod error from safeParse
 * @returns Array of failed field paths (e.g., ['scope_reasoning', 'sections_breakdown[0].area'])
 */
function extractFailedFields(error: z.ZodError): string[] {
  const failedPaths = new Set<string>();

  for (const issue of error.issues) {
    const path = issue.path.join('.');
    failedPaths.add(path);
  }

  return Array.from(failedPaths);
}

/**
 * Extracts successful field paths by excluding failed ones
 *
 * @param data - Partial data object
 * @param failedFields - Array of failed field paths
 * @returns Array of successful field paths
 */
function extractSuccessfulFields(data: unknown, failedFields: string[]): string[] {
  const allFields = extractAllFieldPaths(data);
  return allFields.filter((field) => !failedFields.some((failed) => field.startsWith(failed)));
}

/**
 * Recursively extracts all field paths from object
 *
 * @param obj - Object to extract paths from
 * @param prefix - Current path prefix (for recursion)
 * @returns Array of all field paths
 */
function extractAllFieldPaths(obj: unknown, prefix: string = ''): string[] {
  const paths: string[] = [];

  if (obj === null || obj === undefined) {
    return paths;
  }

  if (typeof obj !== 'object') {
    return [prefix];
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    paths.push(prefix);
    obj.forEach((item, index) => {
      const itemPaths = extractAllFieldPaths(item, `${prefix}[${index}]`);
      paths.push(...itemPaths);
    });
    return paths;
  }

  // Handle objects
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

    const value = (obj as Record<string, unknown>)[key];
    const currentPath = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      paths.push(currentPath);
    } else if (Array.isArray(value)) {
      paths.push(currentPath);
      value.forEach((item, index) => {
        const itemPaths = extractAllFieldPaths(item, `${currentPath}[${index}]`);
        paths.push(...itemPaths);
      });
    } else if (typeof value === 'object') {
      paths.push(currentPath);
      const nestedPaths = extractAllFieldPaths(value, currentPath);
      paths.push(...nestedPaths);
    } else {
      paths.push(currentPath);
    }
  }

  return paths;
}

/**
 * Builds focused prompt for regenerating specific fields
 *
 * @param originalPrompt - Original prompt text
 * @param failedFields - Fields that need regeneration
 * @param successfulFields - Fields that are already valid
 * @param partialData - Partial data with successful values
 * @returns Focused prompt for LLM
 */
function buildFocusedPrompt(
  originalPrompt: string,
  failedFields: string[],
  successfulFields: string[],
  partialData: unknown
): string {
  const successfulValues = successfulFields
    .map((field) => {
      const value = getNestedValue(partialData, field);
      return `  - ${field}: ${JSON.stringify(value)}`;
    })
    .join('\n');

  return `FOCUSED FIELD REGENERATION TASK

Original context:
${originalPrompt}

Current status:
The following fields are ALREADY VALID (do not regenerate):
${successfulValues || '  (none)'}

The following fields FAILED validation and need regeneration:
${failedFields.map((f) => `  - ${f}`).join('\n')}

TASK: Generate a COMPLETE JSON object that includes:
1. All successful fields (copied exactly as shown above)
2. All failed fields (regenerated with valid values)

CRITICAL:
- Return ONLY valid JSON (no markdown, no explanations)
- Include ALL fields (both successful and regenerated)
- Do NOT change successful field values
- Focus quality on regenerating failed fields

Return the complete JSON now:`;
}

/**
 * Gets nested value from object using dot notation path
 *
 * @param obj - Object to get value from
 * @param path - Dot notation path (e.g., 'a.b.c' or 'a[0].b')
 * @returns Value at path or undefined
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(/\.|\ específicamente \[\]/).filter(Boolean);
  let current: any = obj; // Use any for traversal

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Merges successful fields from original with regenerated fields
 *
 * Priority: successful fields > regenerated fields
 *
 * @param original - Original partial data
 * @param regenerated - Regenerated data from LLM
 * @param successfulFields - Fields to preserve from original
 * @param _regeneratedFields - Fields to take from regenerated (unused, for signature compatibility)
 * @returns Merged object
 */
function mergeFields(
  original: unknown,
  regenerated: unknown,
  successfulFields: string[],
  _regeneratedFields: string[]
): unknown {
  // Start with regenerated data (includes all fields)
  const merged = JSON.parse(JSON.stringify(regenerated));

  // Override with successful fields from original
  for (const field of successfulFields) {
    const value = getNestedValue(original, field);
    if (value !== undefined) {
      setNestedValue(merged, field, value);
    }
  }

  return merged;
}

/**
 * Sets nested value in object using dot notation path
 *
 * @param obj - Object to set value in
 * @param path - Dot notation path
 * @param value - Value to set
 */
function setNestedValue(obj: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split(/\.|\ specifically \[\]/).filter(Boolean);
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      // Determine if next part is array index
      const nextPart = parts[i + 1];
      current[part] = /^\d+$/.test(nextPart) ? [] : {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
}

/**
 * Formats Zod error for logging
 *
 * @param error - Zod validation error
 * @returns Formatted error string
 */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}