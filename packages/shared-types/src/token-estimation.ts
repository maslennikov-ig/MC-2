/**
 * Token Estimation Utilities
 *
 * Provides language-aware token estimation for LLM context budgeting.
 *
 * Estimation ratios vary by script type:
 * - Latin scripts (en, es, fr, de, etc.): ~4 characters per token
 * - Cyrillic (ru): ~3 characters per token
 * - CJK (zh, ja, ko): ~1.5-2 characters per token (each character = 1-2 tokens)
 * - Arabic (ar): ~2.5 characters per token
 * - Indic scripts (hi, bn): ~2.5 characters per token
 * - Thai (th): ~2 characters per token
 * - Vietnamese (vi): ~3.5 characters per token (Latin with diacritics)
 *
 * @module token-estimation
 */

/**
 * Characters per token by language
 *
 * Based on empirical testing with tiktoken/cl100k_base tokenizer.
 * Values represent average characters needed to produce one token.
 *
 * Lower value = more tokens per character = higher token cost
 */
export const CHARS_PER_TOKEN_BY_LANGUAGE: Record<string, number> = {
  // Latin scripts (~4 chars/token)
  en: 4,    // English
  es: 4,    // Spanish
  fr: 4,    // French
  de: 4,    // German
  pt: 4,    // Portuguese
  it: 4,    // Italian
  pl: 3.5,  // Polish (some diacritics)
  tr: 4,    // Turkish (Latin)
  id: 4,    // Indonesian (Latin)
  ms: 4,    // Malay (Latin)

  // Cyrillic (~3 chars/token)
  ru: 3,    // Russian

  // CJK scripts (~1.5-2 chars/token) - most expensive
  zh: 1.5,  // Chinese (each character often = 1+ token)
  ja: 2,    // Japanese (mix of kanji, hiragana, katakana)
  ko: 2,    // Korean (Hangul syllable blocks)

  // Arabic script (~2.5 chars/token)
  ar: 2.5,  // Arabic

  // Indic scripts (~2.5 chars/token)
  hi: 2.5,  // Hindi (Devanagari)
  bn: 2.5,  // Bengali

  // Southeast Asian
  th: 2,    // Thai (no spaces, complex script)
  vi: 3.5,  // Vietnamese (Latin with many diacritics)
};

/** Default chars per token for unknown languages */
const DEFAULT_CHARS_PER_TOKEN = 4;

/**
 * Token multiplier relative to English
 *
 * Used to calculate how many more tokens a language needs
 * compared to English for the same content duration.
 *
 * Formula: englishCharsPerToken / languageCharsPerToken
 */
export const TOKEN_MULTIPLIER_BY_LANGUAGE: Record<string, number> = {
  en: 1.0,    // baseline
  es: 1.0,
  fr: 1.0,
  de: 1.0,
  pt: 1.0,
  it: 1.0,
  pl: 1.14,   // 4/3.5
  tr: 1.0,
  id: 1.0,
  ms: 1.0,
  ru: 1.33,   // 4/3 - Russian needs 33% more tokens
  zh: 2.67,   // 4/1.5 - Chinese needs 167% more tokens
  ja: 2.0,    // 4/2 - Japanese needs 100% more tokens
  ko: 2.0,    // 4/2 - Korean needs 100% more tokens
  ar: 1.6,    // 4/2.5 - Arabic needs 60% more tokens
  hi: 1.6,    // 4/2.5
  bn: 1.6,    // 4/2.5
  th: 2.0,    // 4/2 - Thai needs 100% more tokens
  vi: 1.14,   // 4/3.5
};

/**
 * Estimate token count from text using language-aware character ratio
 *
 * @param text - Single string or array of strings to estimate
 * @param language - Language code ('ru', 'en', 'zh', etc.). Defaults to 'en'.
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
 * // Chinese text - more tokens per character
 * const zhTokens = estimateTokenCount('你好世界', 'zh'); // ~3 tokens (4 chars / 1.5)
 */
export function estimateTokenCount(
  text: string | string[],
  language: string = 'en'
): number {
  const charsPerToken = getCharsPerToken(language);

  if (Array.isArray(text)) {
    return text.reduce((sum, s) => sum + Math.ceil(s.length / charsPerToken), 0);
  }

  return Math.ceil(text.length / charsPerToken);
}

/**
 * Get the characters-per-token ratio for a given language
 *
 * @param language - Language code ('ru', 'en', 'zh', etc.)
 * @returns Characters per token ratio
 */
export function getCharsPerToken(language: string): number {
  return CHARS_PER_TOKEN_BY_LANGUAGE[language] ?? DEFAULT_CHARS_PER_TOKEN;
}

/**
 * Get token multiplier for a language relative to English
 *
 * Use this to adjust token budgets based on content language.
 *
 * @param language - Language code
 * @returns Multiplier (1.0 for English, higher for other languages)
 *
 * @example
 * // Base budget for English
 * const baseTokens = 1000;
 *
 * // Adjusted for Russian (needs 33% more)
 * const ruTokens = baseTokens * getTokenMultiplier('ru'); // 1333
 *
 * // Adjusted for Chinese (needs 167% more)
 * const zhTokens = baseTokens * getTokenMultiplier('zh'); // 2670
 */
export function getTokenMultiplier(language: string): number {
  return TOKEN_MULTIPLIER_BY_LANGUAGE[language] ?? 1.0;
}

/**
 * Base token budget per minute of lesson duration (for English)
 * Based on ~150 words/minute reading speed, ~1.3 tokens/word = ~200 tokens/minute
 * We use 250 tokens/minute as a generous buffer
 */
const BASE_TOKENS_PER_MINUTE = 250;

/**
 * Calculate required max tokens for lesson content generation
 *
 * This function provides language-aware token budgeting for LLM output.
 * It takes the MAXIMUM of duration-based and content-based estimates
 * to ensure sufficient capacity for the actual content.
 *
 * Key principle: Content length is the ground truth - if we have 36K chars
 * of Russian text, we NEED ~12K+ tokens regardless of lesson duration.
 *
 * @param options - Calculation options
 * @param options.lessonDurationMinutes - Target lesson duration in minutes (3-45)
 * @param options.language - Content language code (default: 'en')
 * @param options.contentLengthChars - Actual content length for estimation
 * @param options.modelMaxTokens - Model's max output tokens (soft cap, default: 50000)
 * @returns Calculated maxTokens (max of duration-based and content-based)
 *
 * @example
 * // 15-minute Russian lesson with 36K chars content
 * const tokens = calculateRequiredTokens({
 *   lessonDurationMinutes: 15,
 *   language: 'ru',
 *   contentLengthChars: 36000,
 * }); // ~18000 tokens (36000/3 × 1.5 buffer)
 *
 * @example
 * // 30-minute Chinese lesson
 * const tokens = calculateRequiredTokens({
 *   lessonDurationMinutes: 30,
 *   language: 'zh',
 * }); // ~30000 tokens (30 × 250 × 1.5 × 2.67)
 */
export function calculateRequiredTokens(options: {
  lessonDurationMinutes?: number;
  language?: string;
  contentLengthChars?: number;
  modelMaxTokens?: number;
}): number {
  const {
    lessonDurationMinutes,
    language = 'en',
    contentLengthChars,
    modelMaxTokens = 50000, // High default - most models support 50K+ output
  } = options;

  const languageMultiplier = getTokenMultiplier(language);
  const charsPerToken = getCharsPerToken(language);

  let durationBasedTokens = 0;
  let contentBasedTokens = 0;

  // Estimate from lesson duration (theoretical minimum)
  if (lessonDurationMinutes && lessonDurationMinutes > 0) {
    // Formula: duration × base_tokens × 1.5_buffer × language_multiplier
    durationBasedTokens = Math.ceil(
      lessonDurationMinutes * BASE_TOKENS_PER_MINUTE * 1.5 * languageMultiplier
    );
  }

  // Estimate from actual content length (ground truth)
  if (contentLengthChars && contentLengthChars > 0) {
    const estimatedTokens = Math.ceil(contentLengthChars / charsPerToken);
    // Add 50% buffer for LLM output (may add transitions, examples, etc.)
    contentBasedTokens = Math.ceil(estimatedTokens * 1.5);
  }

  // Take MAXIMUM of both estimates - content is ground truth
  // If content is larger than duration suggests, we still need tokens for it
  const requiredTokens = Math.max(durationBasedTokens, contentBasedTokens, 2000);

  // Soft cap at model max (warning: if content exceeds this, truncation may occur)
  return Math.min(modelMaxTokens, requiredTokens);
}
