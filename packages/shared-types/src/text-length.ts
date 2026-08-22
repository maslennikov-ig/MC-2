/**
 * Text-length minimums that mean the same thing in every writing system.
 *
 * A minimum stated in characters is a statement about how much a character
 * carries, and that differs by script by roughly a factor of two. On 2026-08-22
 * the first Chinese course this product ever generated failed Stage 5 three
 * times and was abandoned, on:
 *
 *   0.section_title: Section title too short (min 10 chars)
 *   0.lessons.2.key_topics.3: String must contain at least 5 character(s)
 *
 * Nothing was wrong with the text. `应急基金核心概念` is eight characters and a
 * complete, idiomatic section title — "Core concepts of the emergency fund",
 * thirty-five characters in English. The thresholds were calibrated on Latin
 * script and applied to an ideographic one, so a correct Chinese course could
 * not be produced at all (mc2-v6fqp).
 *
 * The fix is to weight, not to lower. Dropping the minimum to eight would let
 * genuinely truncated English through; counting a Han character as two says what
 * was meant in the first place. The same factor of two the token-ratio table has
 * carried all along: 2.0 characters per token for Chinese against 4.0 for
 * English.
 *
 * @module text-length
 */

import { z } from 'zod';

/**
 * Scripts where one character carries about what two Latin characters do.
 *
 * Han, Kana and Hangul. Not Cyrillic, Greek or Arabic: those are alphabets with
 * broadly Latin-like word lengths, and weighting them would loosen a check that
 * has been correct for Russian since the beginning.
 *
 * `\p{Script=Han}` rather than a hand-written range, because the ranges are the
 * part that gets this wrong. A first attempt listed the two BMP blocks and
 * silently missed Extension B upward — rare characters, but they appear in
 * personal and place names, and the failure mode is a name being told it is too
 * short.
 */
const DENSE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** How much more one dense-script character carries. */
const DENSE_SCRIPT_WEIGHT = 2;

/**
 * The length of this text measured in Latin-character equivalents.
 *
 * Counts by code point rather than UTF-16 unit, so a character outside the BMP
 * — rarer Han, most emoji — counts once rather than twice for being a surrogate
 * pair, which is an accident of encoding and not a fact about the text.
 */
export function informationLength(text: string): number {
  let total = 0;
  for (const character of text) {
    total += DENSE_SCRIPT.test(character) ? DENSE_SCRIPT_WEIGHT : 1;
  }
  return total;
}

/**
 * A string that must carry at least `minimum` Latin characters' worth of text.
 *
 * A drop-in replacement for `z.string().min(n, message).max(m, message)` where
 * the minimum expresses "enough to be a real title/objective/topic" rather than
 * a storage constraint. The maximum stays a plain character count: it exists to
 * protect columns and prompt budgets, and those are counted in characters no
 * matter what is in them.
 */
export function meaningfulText(options: {
  minimum: number;
  maximum: number;
  /** What is being described, for the message. e.g. `'Section title'`. */
  label: string;
}): z.ZodType<string> {
  return z
    .string()
    .max(options.maximum, `${options.label} too long (max ${options.maximum} chars)`)
    .refine(value => informationLength(value) >= options.minimum, {
      message: `${options.label} too short (min ${options.minimum} chars; a Han, Kana or Hangul character counts as ${DENSE_SCRIPT_WEIGHT})`,
    });
}
