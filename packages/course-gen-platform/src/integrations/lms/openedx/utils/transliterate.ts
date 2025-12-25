/**
 * Unicode to ASCII Transliteration Utility
 * @module integrations/lms/openedx/utils/transliterate
 *
 * Converts Unicode characters (Cyrillic, Arabic, CJK, etc.) to ASCII equivalents.
 * Supports all 18 platform languages via the any-ascii library.
 *
 * Supported Languages:
 * - Russian (ru), English (en), Chinese (zh), Spanish (es), French (fr),
 *   German (de), Japanese (ja), Korean (ko), Arabic (ar), Portuguese (pt),
 *   Italian (it), Turkish (tr), Vietnamese (vi), Thai (th), Indonesian (id),
 *   Malay (ms), Hindi (hi), Polish (pl)
 */

import anyAscii from 'any-ascii';

/**
 * Transliterate Unicode string to ASCII
 *
 * Converts any Unicode characters to their ASCII equivalents using the any-ascii library.
 * This is essential for generating valid Open edX url_name identifiers from Cyrillic
 * or other non-ASCII display names.
 *
 * @param input - UTF-8 input string (may contain any Unicode characters)
 * @returns ASCII-only output string
 *
 * @example
 * ```typescript
 * transliterate("Введение в программирование")
 * // Returns: "Vvedenie v programmirovanie"
 *
 * transliterate("مقدمة في البرمجة")
 * // Returns: "mqdm@ fy albrmdj@"
 *
 * transliterate("プログラミング入門")
 * // Returns: "puroguramingunyu men"
 *
 * transliterate("")
 * // Returns: ""
 * ```
 */
export function transliterate(input: string): string {
  // Handle edge cases
  if (!input || input.length === 0) {
    return '';
  }

  // Convert Unicode to ASCII using any-ascii library
  // This library handles all Unicode blocks including:
  // - Cyrillic (Russian, Bulgarian, etc.)
  // - Arabic script
  // - CJK (Chinese, Japanese, Korean)
  // - Devanagari (Hindi)
  // - Thai, Vietnamese, and other scripts
  return anyAscii(input);
}
