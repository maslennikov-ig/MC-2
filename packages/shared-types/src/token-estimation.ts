/**
 * Token Estimation Utilities
 *
 * Provides language-aware token estimation for LLM context budgeting.
 *
 * Estimation ratios:
 * - English: ~4 characters per token
 * - Russian/Cyrillic: ~3 characters per token (denser encoding)
 *
 * @module token-estimation
 */

/**
 * Estimate token count from text using language-aware character ratio
 *
 * @param text - Single string or array of strings to estimate
 * @param language - Language code ('ru', 'en', or other). Defaults to 'en'.
 * @returns Estimated token count
 *
 * @example
 * // Single string
 * const tokens = estimateTokenCount('Hello world', 'en'); // ~3 tokens
 *
 * @example
 * // Array of strings (e.g., document summaries)
 * const tokens = estimateTokenCount(['Summary 1', 'Summary 2'], 'ru');
 *
 * @example
 * // Russian text uses 3 chars/token
 * const ruTokens = estimateTokenCount('Привет мир', 'ru'); // ~3 tokens
 */
export function estimateTokenCount(
  text: string | string[],
  language: string = 'en'
): number {
  // Russian/Cyrillic text is denser - fewer characters per token
  const charsPerToken = language === 'ru' ? 3 : 4;

  if (Array.isArray(text)) {
    return text.reduce((sum, s) => sum + Math.ceil(s.length / charsPerToken), 0);
  }

  return Math.ceil(text.length / charsPerToken);
}

/**
 * Get the characters-per-token ratio for a given language
 *
 * @param language - Language code ('ru', 'en', or other)
 * @returns Characters per token ratio
 */
export function getCharsPerToken(language: string): number {
  return language === 'ru' ? 3 : 4;
}
