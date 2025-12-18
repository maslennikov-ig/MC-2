import { ZodSchema, ZodError } from 'zod';

/**
 * Validates API response data against a Zod schema.
 * Throws a user-friendly error if validation fails.
 *
 * @example
 * const data = await trpc.generation.getResult.query({ courseId });
 * const validatedData = validateResponse(data, analysisResultSchema);
 */
export function validateResponse<T>(data: unknown, schema: ZodSchema<T>): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const paths = error.errors.map(e => e.path.join('.')).join(', ');
      console.error('[tRPC Response Validation] Schema mismatch:', {
        paths,
        errors: error.errors,
        receivedData: data,
      });
      throw new Error(`API response validation failed: ${paths}`);
    }
    throw error;
  }
}

/**
 * Creates a validated query wrapper for tRPC procedures.
 * Automatically validates response against schema.
 *
 * @example
 * const getValidatedResult = createValidatedQuery(
 *   trpc.generation.getResult,
 *   analysisResultSchema
 * );
 * const data = await getValidatedResult.query({ courseId });
 */
export function createValidatedQuery<TInput, TOutput>(
  procedure: { query: (input: TInput) => Promise<unknown> },
  schema: ZodSchema<TOutput>
) {
  return {
    query: async (input: TInput): Promise<TOutput> => {
      const data = await procedure.query(input);
      return validateResponse(data, schema);
    },
  };
}

/**
 * Safe parse that returns { success, data, error } instead of throwing.
 * Useful for optional validation where failure should be handled gracefully.
 */
export function safeValidateResponse<T>(
  data: unknown,
  schema: ZodSchema<T>
): { success: true; data: T } | { success: false; error: ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  console.warn('[tRPC Response Validation] Validation failed:', result.error.errors);
  return { success: false, error: result.error };
}
