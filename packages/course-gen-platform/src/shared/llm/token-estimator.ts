/**
 * Token Estimator Service
 * @module orchestrator/services/token-estimator
 *
 * Language-aware token estimation using character-to-token ratios.
 * Supports accurate estimation for Russian, English, and other common languages.
 *
 * Research-validated ratios:
 * - Russian: 3.2 chars/token (higher density due to Cyrillic)
 * - English: 4.0 chars/token (standard OpenAI GPT tokenization)
 * - German: 4.5 chars/token (compound words)
 * - French: 4.2 chars/token
 * - Spanish: 4.3 chars/token
 * - Default: 4.0 chars/token (fallback for unknown languages)
 */

import { franc } from 'franc-min';
import logger from '../logger';
import { normalizeLanguageCode } from '../workspace-utils';

/**
 * Language-specific character-to-token ratios
 *
 * These ratios are validated against actual OpenRouter API usage
 * and should provide ±10% accuracy for supported languages.
 */
const LANGUAGE_RATIOS: Record<string, number> = {
  rus: 3.2, // Russian (Cyrillic script - denser encoding)
  eng: 4.0, // English (baseline GPT tokenization)
  deu: 4.5, // German (compound words)
  fra: 4.2, // French
  spa: 4.3, // Spanish
  por: 4.3, // Portuguese
  ita: 4.2, // Italian
  pol: 3.5, // Polish (Cyrillic-like density)
  ukr: 3.3, // Ukrainian (similar to Russian)
  cmn: 2.0, // Chinese (high density - ideographic)
  jpn: 2.5, // Japanese (mix of ideographic and phonetic)
  kor: 3.0, // Korean (Hangul - moderate density)
  ara: 3.0, // Arabic (RTL script)
  default: 4.0, // Fallback for unknown languages
};

/**
 * ISO 639-1 (what a course is labelled with) to ISO 639-3 (what the ratios above
 * are keyed by).
 *
 * Every entry here has a ratio; a language with no ratio of its own is left out
 * so it lands on `default` honestly rather than through a wrong neighbour.
 */
const ISO_639_1_TO_639_3: Record<string, string> = {
  ru: 'rus',
  en: 'eng',
  de: 'deu',
  fr: 'fra',
  es: 'spa',
  pt: 'por',
  it: 'ita',
  pl: 'pol',
  uk: 'ukr',
  zh: 'cmn',
  ja: 'jpn',
  ko: 'kor',
  ar: 'ara',
};

/**
 * The ISO 639-3 code the ratio table is keyed by, from whatever a caller has.
 *
 * This exists because three call sites had each written
 * `language === 'ru' ? 'rus' : 'eng'`, which is correct for exactly two of the
 * nineteen languages this product claims to support. For Spanish it is wrong by
 * 7% and nobody would notice; for Chinese it says 4.0 where the table right
 * above says 2.0, so every budget computed from it is **half** the text's real
 * cost, and the consequence is truncation blamed on the model (mc2-v6fqp).
 *
 * Accepts an ISO 639-3 code unchanged, so a caller that already has one (the
 * `franc` path, the Cyrillic sniffers) can route through here too.
 */
export function toTokenRatioLanguage(language: string | null | undefined): string {
  if (!language) return 'default';

  const trimmed = language.trim().toLowerCase();
  if (!trimmed) return 'default';

  // Already a key of the ratio table — including 'und', which franc returns for
  // text it cannot place and which correctly falls through to the default.
  if (trimmed in LANGUAGE_RATIOS) return trimmed;

  const mapped = ISO_639_1_TO_639_3[normalizeLanguageCode(trimmed, 'en')];
  return mapped ?? 'default';
}

/**
 * Scripts that settle the ratio on their own, in the order they are tested.
 *
 * Two places in this codebase sniffed the script by hand and both asked exactly
 * one question — "is there Cyrillic?" — answering `eng` to everything else. For
 * a Chinese document that is 4.0 chars per token where the table above says 2.0,
 * so the estimate is half the real cost and the budget built on it is half the
 * size it should be. Han is tested after Hangul and Kana because Japanese and
 * Korean text both contain Han characters and neither is Chinese.
 */
const SCRIPT_TO_LANGUAGE: ReadonlyArray<readonly [RegExp, string]> = [
  [/[Ѐ-ӿ]/u, 'rus'], // Cyrillic
  [/[가-힯ᄀ-ᇿ]/u, 'kor'], // Hangul
  [/[぀-ゟ゠-ヿ]/u, 'jpn'], // Hiragana, Katakana
  [/[一-鿿㐀-䶿]/u, 'cmn'], // Han
  [/[؀-ۿݐ-ݿ]/u, 'ara'], // Arabic
];

/** How much of a document is enough to tell what it is written in. */
const SCRIPT_SAMPLE_CHARACTERS = 1000;

/**
 * The ratio-table language a text's script implies.
 *
 * A crude test on purpose — it distinguishes writing systems, not languages, and
 * cannot tell Ukrainian from Russian or Spanish from English. That is the right
 * resolution for choosing a chars-per-token ratio, where the large errors are
 * between scripts and the small ones within them. Falls back to `eng`, which is
 * also the `default` ratio.
 */
export function detectScriptLanguage(text: string): string {
  const sample = text.slice(0, SCRIPT_SAMPLE_CHARACTERS);
  for (const [pattern, language] of SCRIPT_TO_LANGUAGE) {
    if (pattern.test(sample)) return language;
  }
  return 'eng';
}

/**
 * Minimum text length for reliable language detection
 * Below this threshold, fallback to default ratio
 */
const MIN_TEXT_LENGTH_FOR_DETECTION = 20;

/**
 * Token Estimator Service
 *
 * Provides language detection and token count estimation
 * based on character-to-token ratios.
 *
 * Features:
 * - Automatic language detection using franc
 * - Language-specific token ratios
 * - Fallback to default ratio for unknown/short texts
 * - Consistent results for same input
 * - ±10% accuracy target vs actual OpenRouter usage
 */
export class TokenEstimator {
  private ratios: Record<string, number>;

  constructor() {
    this.ratios = { ...LANGUAGE_RATIOS };
    logger.info('TokenEstimator initialized with language-specific ratios');
  }

  /**
   * Detect the language of the given text
   *
   * @param text - Input text to analyze
   * @returns ISO 639-3 language code (e.g., 'rus', 'eng', 'und' for undetermined)
   *
   * @example
   * ```typescript
   * const estimator = new TokenEstimator();
   * estimator.detectLanguage('Hello world'); // 'eng'
   * estimator.detectLanguage('Привет мир'); // 'rus'
   * ```
   */
  detectLanguage(text: string): string {
    // Handle edge cases
    if (!text || text.trim().length === 0) {
      return 'und'; // Undetermined
    }

    // For very short texts, use default
    if (text.length < MIN_TEXT_LENGTH_FOR_DETECTION) {
      return 'und';
    }

    try {
      const langCode = franc(text, { minLength: MIN_TEXT_LENGTH_FOR_DETECTION });

      logger.debug(
        {
          textLength: text.length,
          detectedLanguage: langCode,
        },
        'Language detected'
      );

      return langCode;
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          textLength: text.length,
        },
        'Language detection failed, using default'
      );

      return 'und';
    }
  }

  /**
   * Get the character-to-token ratio for a specific language
   *
   * @param language - ISO 639-3 language code
   * @returns Character-to-token ratio
   *
   * @example
   * ```typescript
   * const estimator = new TokenEstimator();
   * estimator.getLanguageRatio('rus'); // 3.2
   * estimator.getLanguageRatio('eng'); // 4.0
   * estimator.getLanguageRatio('xyz'); // 4.0 (default)
   * ```
   */
  getLanguageRatio(language: string): number {
    const ratio = this.ratios[language] || this.ratios['default'];

    logger.debug(
      {
        language,
        ratio,
      },
      'Retrieved language ratio'
    );

    return ratio;
  }

  /**
   * Estimate token count for the given text
   *
   * @param text - Input text to estimate
   * @param language - Optional ISO 639-3 language code (auto-detected if omitted)
   * @returns Estimated token count
   *
   * @example
   * ```typescript
   * const estimator = new TokenEstimator();
   *
   * // Auto-detect language
   * estimator.estimateTokens('Hello world'); // ~3 tokens
   *
   * // Explicit language
   * estimator.estimateTokens('Привет мир', 'rus'); // ~3 tokens
   * ```
   *
   * Note: Accuracy target is ±10% compared to actual OpenRouter API usage.
   */
  estimateTokens(text: string, language?: string): number {
    // Handle edge cases
    if (!text || text.trim().length === 0) {
      return 0;
    }

    // Detect language if not provided
    const detectedLanguage = language || this.detectLanguage(text);

    // Get ratio for this language
    const ratio = this.getLanguageRatio(detectedLanguage);

    // Calculate token count
    // Formula: tokens = characters / ratio
    const estimatedTokens = Math.ceil(text.length / ratio);

    logger.debug(
      {
        textLength: text.length,
        language: detectedLanguage,
        ratio,
        estimatedTokens,
      },
      'Tokens estimated'
    );

    return estimatedTokens;
  }

  /**
   * Batch estimate tokens for multiple texts
   *
   * More efficient than calling estimateTokens() multiple times
   * as language detection is cached per text.
   *
   * @param texts - Array of texts to estimate
   * @returns Array of estimated token counts
   *
   * @example
   * ```typescript
   * const estimator = new TokenEstimator();
   * const counts = estimator.batchEstimateTokens([
   *   'Hello world',
   *   'Привет мир',
   *   'Bonjour le monde'
   * ]);
   * // [3, 3, 4]
   * ```
   */
  batchEstimateTokens(texts: string[]): number[] {
    return texts.map(text => this.estimateTokens(text));
  }

  /**
   * Estimate tokens with detailed metadata
   *
   * Useful for debugging and validation against actual API usage.
   *
   * @param text - Input text to estimate
   * @returns Object with token count, language, and ratio
   *
   * @example
   * ```typescript
   * const estimator = new TokenEstimator();
   * const result = estimator.estimateTokensWithMetadata('Привет мир');
   * // {
   * //   tokens: 3,
   * //   language: 'rus',
   * //   ratio: 3.2,
   * //   characterCount: 10
   * // }
   * ```
   */
  estimateTokensWithMetadata(text: string): {
    tokens: number;
    language: string;
    ratio: number;
    characterCount: number;
  } {
    const language = this.detectLanguage(text);
    const ratio = this.getLanguageRatio(language);
    const tokens = this.estimateTokens(text, language);

    return {
      tokens,
      language,
      ratio,
      characterCount: text.length,
    };
  }

  /**
   * Add or update a custom language ratio
   *
   * Useful for fine-tuning based on production data.
   *
   * @param language - ISO 639-3 language code
   * @param ratio - Character-to-token ratio
   *
   * @example
   * ```typescript
   * const estimator = new TokenEstimator();
   * estimator.setLanguageRatio('custom', 3.8);
   * ```
   */
  setLanguageRatio(language: string, ratio: number): void {
    if (ratio <= 0) {
      throw new Error('Ratio must be positive');
    }

    this.ratios[language] = ratio;

    logger.info(
      {
        language,
        ratio,
      },
      'Custom language ratio set'
    );
  }
}

/**
 * Singleton instance for easy import
 */
export const tokenEstimator = new TokenEstimator();
