import { randomInt } from 'crypto';

/**
 * Alphabet for generation codes, excluding confusable letters.
 * Excluded: I (looks like 1), O (looks like 0), L (looks like 1)
 */
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Generates a human-readable generation code in the format "ABC-1234".
 *
 * Format:
 * - 3 uppercase letters (excluding I, O, L to avoid confusion with numbers)
 * - Hyphen separator
 * - 4 digits (0000-9999)
 *
 * Uses crypto.randomInt for cryptographically secure randomness.
 *
 * @returns A unique generation code like "XYZ-4821"
 *
 * @example
 * const code = generateGenerationCode();
 * console.log(code); // "MNK-0742"
 */
export function generateGenerationCode(): string {
  const prefix = Array.from({ length: 3 }, () =>
    LETTERS[randomInt(LETTERS.length)]
  ).join('');
  const suffix = String(randomInt(10000)).padStart(4, '0');
  return `${prefix}-${suffix}`;
}
