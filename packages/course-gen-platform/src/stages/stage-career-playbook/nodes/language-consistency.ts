import { validateLanguageCode } from '@megacampus/shared-types';

const UNEXPECTED_SCRIPT_PATTERNS = {
  CJK: /[\u4E00-\u9FFF\u3400-\u4DBF]/g,
  ARABIC: /[\u0600-\u06FF]/g,
  DEVANAGARI: /[\u0900-\u097F]/g,
  CYRILLIC: /[\u0400-\u04FF]/g,
} as const;

const UNEXPECTED_SCRIPTS_BY_LANGUAGE: Record<
  string,
  Array<keyof typeof UNEXPECTED_SCRIPT_PATTERNS>
> = {
  ru: ['CJK', 'ARABIC', 'DEVANAGARI'],
  en: ['CJK', 'CYRILLIC', 'ARABIC', 'DEVANAGARI'],
};

const ENGLISH_FUNCTION_WORDS = new Set([
  'a',
  'about',
  'after',
  'and',
  'are',
  'before',
  'choose',
  'describe',
  'define',
  'do',
  'does',
  'explain',
  'for',
  'from',
  'how',
  'include',
  'into',
  'is',
  'must',
  'of',
  'or',
  'please',
  'select',
  'should',
  'the',
  'to',
  'what',
  'when',
  'where',
  'which',
  'why',
  'will',
  'with',
  'without',
  'your',
]);

/**
 * A cited source line: `- [S1] B2B Buying: How Top CSOs … — https://… (research)`.
 *
 * Its title belongs to the source, not to the guide, and a source published in
 * English keeps its English title in a Russian document. The evidence ledger
 * defines this shape, so it is recognised rather than guessed at.
 */
const EVIDENCE_REFERENCE_LINE = /^\s*(?:[-*+]|\d+[.)])?\s*\[S\d+\]/;

/**
 * The text the guide itself wrote, which is the only text a language rule can
 * fairly judge.
 *
 * Fenced blocks and inline code were always excluded. Cited source lines are
 * excluded from 2026-09-01: run db9d3ff9 filed a `wrong_language` critical
 * against block 25 — a block written in Russian throughout — because the reading
 * list at its foot carries the English titles of four English sources. Block 25
 * spent a regeneration attempt on text it could not have translated without
 * misquoting the source.
 */
function proseText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .split(/\r?\n/)
    .filter(line => !EVIDENCE_REFERENCE_LINE.test(line))
    .join('\n');
}

function latinWords(value: string): string[] {
  return value.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
}

function cyrillicCount(value: string): number {
  return (value.match(/\p{Script=Cyrillic}/gu) ?? []).length;
}

function englishPhraseSequences(value: string): string[][] {
  return (
    value
      .split(/[^A-Za-z'-]+/)
      .join(' ')
      .match(/[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+/g)
      ?.map(sequence => latinWords(sequence)) ?? []
  );
}

function looksLikeEnglishSentence(value: string): boolean {
  const words = latinWords(value);
  if (words.length < 4) return false;

  const functionWordCount = words.filter(word =>
    ENGLISH_FUNCTION_WORDS.has(word.toLowerCase())
  ).length;
  if (functionWordCount >= 1 && cyrillicCount(value) === 0) return true;

  return englishPhraseSequences(value).some(
    sequence =>
      sequence.length >= 3 && sequence.some(word => ENGLISH_FUNCTION_WORDS.has(word.toLowerCase()))
  );
}

export function getTargetLanguageTextViolations(
  text: string,
  contentLanguage: string,
  path: string
): string[] {
  const language = validateLanguageCode(contentLanguage);
  const normalized = proseText(text).trim();
  if (!normalized) return [];

  const violations: string[] = [];
  const unexpectedScripts = UNEXPECTED_SCRIPTS_BY_LANGUAGE[language] ?? [];
  for (const script of unexpectedScripts) {
    const matches = normalized.match(UNEXPECTED_SCRIPT_PATTERNS[script]) ?? [];
    if (matches.length > 0) {
      violations.push(`${path}: unexpected ${script} script in ${language} text`);
    }
  }

  if (language === 'ru' && looksLikeEnglishSentence(normalized)) {
    violations.push(`${path}: expected Russian user-facing text, got "${text.trim()}"`);
  }

  return violations;
}
