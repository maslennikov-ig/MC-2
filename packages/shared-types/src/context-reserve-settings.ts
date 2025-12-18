import { z } from 'zod';

/**
 * Maximum allowed reserve percentage (50%)
 * Higher values would leave insufficient context for actual content
 */
export const MAX_RESERVE_PERCENT = 0.5;

export const contextReserveLanguageSchema = z.enum(['en', 'ru', 'any']);
export type ContextReserveLanguage = z.infer<typeof contextReserveLanguageSchema>;

export const contextReserveSettingSchema = z.object({
  id: z.string().uuid(),
  language: contextReserveLanguageSchema,
  reservePercent: z.number().min(0).max(MAX_RESERVE_PERCENT),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ContextReserveSetting = z.infer<typeof contextReserveSettingSchema>;

export const contextReserveSettingResponseSchema = contextReserveSettingSchema.extend({
  cacheCleared: z.boolean().optional(),
});

export type ContextReserveSettingResponse = z.infer<typeof contextReserveSettingResponseSchema>;

export const updateContextReserveSettingSchema = z.object({
  language: contextReserveLanguageSchema,
  reservePercent: z.number().min(0).max(MAX_RESERVE_PERCENT),
});

export type UpdateContextReserveSetting = z.infer<typeof updateContextReserveSettingSchema>;

// Default reserve percentages (for code-level fallback only)
export const DEFAULT_CONTEXT_RESERVE = {
  en: 0.15,
  ru: 0.25,
  any: 0.20,
} as const;

/**
 * Calculate dynamic threshold based on model's max context and language reserve
 *
 * Formula: threshold = maxContextTokens * (1 - reservePercent)
 *
 * @param maxContextTokens - Maximum context tokens supported by the model
 * @param reservePercent - Percentage to reserve for system prompts (0-0.5, e.g., 0.15 = 15%)
 * @returns Usable threshold in tokens (floored to integer)
 *
 * @example
 * // 128K model with 15% reserve → 109K threshold
 * calculateContextThreshold(128000, 0.15); // Returns 108800
 *
 * // 200K model with 25% reserve → 150K threshold
 * calculateContextThreshold(200000, 0.25); // Returns 150000
 */
export function calculateContextThreshold(
  maxContextTokens: number,
  reservePercent: number
): number {
  return Math.floor(maxContextTokens * (1 - reservePercent));
}
