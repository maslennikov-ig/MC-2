/**
 * Zod to Prompt Schema Converter
 *
 * Converts Zod schemas to human-readable JSON-like descriptions for LLM prompts.
 * Optimized for token efficiency while maintaining accuracy.
 *
 * @module zod-to-prompt-schema
 */

import { z } from 'zod';
import { encoding_for_model } from 'tiktoken';

// Helper interfaces for Zod internals to avoid 'any'
interface ZodCheck {
  kind: string;
  value?: number | string;
}

interface ZodDefWithChecks {
  checks?: ZodCheck[];
}

interface ZodDefWithValues {
  values: string[];
}

interface ZodDefWithOptions {
  options: z.ZodType[];
}

interface ZodDefWithValue {
  value: unknown;
}

/**
 * Converts Zod schema to human-readable prompt description for LLMs
 *
 * Recursively parses Zod schema and generates clean JSON-like structure
 * with type information and validation constraints.
 *
 * @param schema - Zod schema to convert
 * @param depth - Current recursion depth (internal)
 * @returns Human-readable schema description
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   name: z.string().min(3).max(100),
 *   age: z.number().int().min(0).max(120),
 *   status: z.enum(['active', 'inactive']),
 * });
 *
 * const description = zodToPromptSchema(schema);
 * // Returns:
 * // {
 * //   "name": "string (min 3, max 100)",
 * //   "age": "number (integer, min 0, max 120)",
 * //   "status": "enum: active | inactive"
 * // }
 * ```
 */
export function zodToPromptSchema(schema: z.ZodType, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  const nextIndent = '  '.repeat(depth + 1);

  // Unwrap optional and nullable
  let currentSchema = schema;
  let isOptional = false;
  let isNullable = false;

  while (
    currentSchema instanceof z.ZodOptional ||
    currentSchema instanceof z.ZodNullable
  ) {
    if (currentSchema instanceof z.ZodOptional) {
      isOptional = true;
      currentSchema = (currentSchema)._def.innerType as z.ZodType;
    }
    if (currentSchema instanceof z.ZodNullable) {
      isNullable = true;
      currentSchema = (currentSchema)._def.innerType as z.ZodType;
    }
  }

  // Unwrap ZodEffects (created by .refine(), .transform(), etc.)
  // ZodEffects wraps the actual schema, we need to access the underlying type
  // See: INV-2025-11-19-001 - zodToPromptSchema missing ZodEffects handler
  if (currentSchema instanceof z.ZodEffects) {
    currentSchema = (currentSchema)._def.schema as z.ZodType;
  }

  const optionalSuffix = isOptional ? ' (optional)' : '';
  const nullableSuffix = isNullable ? ' (nullable)' : '';

  // Handle ZodObject
  if (currentSchema instanceof z.ZodObject) {
    const shape = (currentSchema as z.ZodObject<z.ZodRawShape>)._def.shape();
    const entries: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const valueSchema = value as z.ZodType;
      const valueDescription = zodToPromptSchema(valueSchema, depth + 1);
      entries.push(`${nextIndent}"${key}": ${valueDescription}`);
    }

    if (depth === 0) {
      return `{\n${entries.join(',\n')}\n}`;
    }
    return `{\n${entries.join(',\n')}\n${indent}}${optionalSuffix}${nullableSuffix}`;
  }

  // Handle ZodArray
  if (currentSchema instanceof z.ZodArray) {
    const element = (currentSchema as z.ZodArray<z.ZodTypeAny>)._def.type;
    const elementDesc = zodToPromptSchema(element as z.ZodType, depth);

    // Extract array constraints
    const checks = ((currentSchema as unknown as { _def: ZodDefWithChecks })._def.checks) || [];
    const minCheck = checks.find((c) => c.kind === 'min');
    const maxCheck = checks.find((c) => c.kind === 'max');

    let constraints = '';
    if (minCheck || maxCheck) {
      const parts: string[] = [];
      if (minCheck) parts.push(`min ${minCheck.value}`);
      if (maxCheck) parts.push(`max ${maxCheck.value}`);
      constraints = ` (${parts.join(', ')})`;
    }

    return `array${constraints} of ${elementDesc}${optionalSuffix}${nullableSuffix}`;
  }

  // Handle ZodString
  if (currentSchema instanceof z.ZodString) {
    const checks = ((currentSchema as unknown as { _def: ZodDefWithChecks })._def.checks) || [];
    const constraints: string[] = [];

    for (const check of checks) {
      if (check.kind === 'min') {
        constraints.push(`min ${check.value}`);
      } else if (check.kind === 'max') {
        constraints.push(`max ${check.value}`);
      } else if (check.kind === 'email') {
        constraints.push('email format');
      } else if (check.kind === 'url') {
        constraints.push('URL format');
      } else if (check.kind === 'uuid') {
        constraints.push('UUID format');
      }
    }

    const constraintStr = constraints.length > 0 ? ` (${constraints.join(', ')})` : '';
    return `string${constraintStr}${optionalSuffix}${nullableSuffix}`;
  }

  // Handle ZodNumber
  if (currentSchema instanceof z.ZodNumber) {
    const checks = ((currentSchema as unknown as { _def: ZodDefWithChecks })._def.checks) || [];
    const constraints: string[] = [];

    let isInteger = false;
    for (const check of checks) {
      if (check.kind === 'int') {
        isInteger = true;
      } else if (check.kind === 'min') {
        constraints.push(`min ${check.value}`);
      } else if (check.kind === 'max') {
        constraints.push(`max ${check.value}`);
      }
    }

    const typeStr = isInteger ? 'integer' : 'number';
    const constraintStr = constraints.length > 0 ? `, ${constraints.join(', ')}` : '';
    return `${typeStr}${constraintStr}${optionalSuffix}${nullableSuffix}`;
  }

  // Handle ZodEnum
  if (currentSchema instanceof z.ZodEnum) {
    const values = (currentSchema as unknown as { _def: ZodDefWithValues })._def.values;
    return `enum: ${values.join(' | ')}${optionalSuffix}${nullableSuffix}`;
  }

  // Handle ZodBoolean
  if (currentSchema instanceof z.ZodBoolean) {
    return `boolean${optionalSuffix}${nullableSuffix}`;
  }

  // Handle ZodLiteral
  if (currentSchema instanceof z.ZodLiteral) {
    const value = (currentSchema as unknown as { _def: ZodDefWithValue })._def.value;
    const valueStr = typeof value === 'string' ? `"${value}"` : String(value);
    return `literal: ${valueStr}${optionalSuffix}${nullableSuffix}`;
  }

  // Handle ZodUnion
  if (currentSchema instanceof z.ZodUnion) {
    const options = (currentSchema as unknown as { _def: ZodDefWithOptions })._def.options;
    const optionDescriptions = options.map((opt: z.ZodType) =>
      zodToPromptSchema(opt, depth)
    );
    return `${optionDescriptions.join(' | ')}${optionalSuffix}${nullableSuffix}`;
  }

  // Fallback for unknown types
  return `unknown${optionalSuffix}${nullableSuffix}`;
}

/**
 * Estimate token count for schema description using tiktoken
 *
 * Uses cl100k_base encoding (GPT-4 tokenizer) for accurate counting.
 *
 * @param schemaText - Schema description text
 * @returns Estimated token count
 *
 * @example
 * ```typescript
 * const schema = z.object({ name: z.string() });
 * const description = zodToPromptSchema(schema);
 * const tokens = estimateSchemaTokens(description);
 * console.log(`Schema uses ${tokens} tokens`);
 * ```
 */
export function estimateSchemaTokens(schemaText: string): number {
  try {
    const encoding = encoding_for_model('gpt-4');
    const tokens = encoding.encode(schemaText);
    encoding.free(); // Clean up encoding resources
    return tokens.length;
  } catch (_) {
    // Fallback to character-based estimation (4 chars ≈ 1 token)
    console.warn('[estimateSchemaTokens] Tiktoken encoding failed, using fallback estimation');
    return Math.ceil(schemaText.length / 4);
  }
}

/**
 * Format schema description with header for LLM prompts
 *
 * Wraps schema description with clear instructions and formatting.
 *
 * @param schema - Zod schema to convert
 * @param additionalInstructions - Optional extra instructions
 * @returns Formatted schema block for prompts
 *
 * @example
 * ```typescript
 * const schema = z.object({ name: z.string() });
 * const formatted = formatSchemaForPrompt(schema, 'All fields are required.');
 * // Use in prompt:
 * const prompt = `Generate JSON matching this schema:\n\n${formatted}`;
 * ```
 */
export function formatSchemaForPrompt(
  schema: z.ZodType,
  additionalInstructions?: string
): string {
  const schemaDescription = zodToPromptSchema(schema);
  const instructions = additionalInstructions
    ? `\n\n${additionalInstructions}`
    : '';

  return `You MUST respond with valid JSON matching this EXACT schema:

${schemaDescription}

Critical requirements:
- All required fields must be present
- Types must match exactly
- Arrays must satisfy min/max constraints
- Enums must use exact values shown
- No additional properties unless specified${instructions}`;
}
