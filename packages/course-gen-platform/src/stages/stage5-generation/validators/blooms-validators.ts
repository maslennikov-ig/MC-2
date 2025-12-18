/**
 * Bloom's Taxonomy Validators
 *
 * Validates learning objectives against Bloom's Taxonomy framework
 * using RT-006 validation rules with RT-007 Phase 2 multilingual fuzzy matching.
 *
 * Implementation follows RT-007 Phase 2:
 * - Universal stemming for 10+ languages (Snowball stemmer)
 * - CJK normalization for 9 languages
 * - Levenshtein distance ≤2 for typo tolerance
 * - 19-language support with BASE coverage (30-40 verbs per language)
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-006-bloom-taxonomy-validation.md
 * @see specs/008-generation-generation-json/research-decisions/rt-007-bloom-taxonomy-validation-improvements.md
 */

import * as snowballStemmers from 'snowball-stemmers';
import * as levenshtein from 'fast-levenshtein';
import { getBloomsWhitelist } from './blooms-whitelists';
import { ValidationSeverity, type ValidationResult } from '@megacampus/shared-types';

/**
 * RT-006 P0: Non-measurable verbs blacklist (11 EN + 10 RU)
 * These verbs cannot be verified through assessment
 */
export const NON_MEASURABLE_VERBS_BLACKLIST = {
  en: [
    'understand', 'know', 'learn', 'appreciate', 'be aware of',
    'be familiar with', 'grasp', 'comprehend', 'realize',
    'recognize', 'become acquainted with',
  ],
  ru: [
    'понимать', 'знать', 'изучать', 'осознавать', 'быть знакомым с',
    'постигать', 'усваивать', 'разбираться', 'осмыслять', 'овладевать',
  ],
} as const;

/**
 * RT-006 P1: Bloom's Taxonomy whitelist (165 verbs across 6 levels)
 */
export const BLOOMS_TAXONOMY_WHITELIST = {
  en: {
    remember: ['define', 'list', 'recall', 'recognize', 'identify', 'name', 'state', 'describe', 'label', 'match', 'select', 'reproduce', 'cite', 'memorize'],
    understand: ['explain', 'summarize', 'paraphrase', 'classify', 'compare', 'contrast', 'interpret', 'exemplify', 'illustrate', 'infer', 'predict', 'discuss'],
    apply: ['execute', 'implement', 'solve', 'use', 'demonstrate', 'operate', 'calculate', 'complete', 'show', 'examine', 'modify'],
    analyze: ['differentiate', 'organize', 'attribute', 'deconstruct', 'distinguish', 'examine', 'experiment', 'question', 'test', 'investigate'],
    evaluate: ['check', 'critique', 'judge', 'hypothesize', 'argue', 'defend', 'support', 'assess', 'rate', 'recommend'],
    create: ['design', 'construct', 'plan', 'produce', 'invent', 'develop', 'formulate', 'assemble', 'compose', 'devise'],
  },
  ru: {
    remember: ['определить', 'перечислить', 'вспомнить', 'распознать', 'идентифицировать', 'назвать', 'утверждать', 'описать', 'обозначить', 'сопоставить', 'выбрать', 'воспроизвести', 'цитировать'],
    understand: ['объяснить', 'резюмировать', 'перефразировать', 'классифицировать', 'сравнить', 'противопоставить', 'интерпретировать', 'проиллюстрировать', 'сделать вывод', 'предсказать', 'обсудить'],
    apply: ['выполнить', 'реализовать', 'решить', 'использовать', 'продемонстрировать', 'оперировать', 'вычислить', 'завершить', 'показать', 'исследовать', 'модифицировать'],
    analyze: ['дифференцировать', 'организовать', 'атрибутировать', 'деконструировать', 'различить', 'изучить', 'экспериментировать', 'задать вопрос', 'тестировать'],
    evaluate: ['проверить', 'критиковать', 'судить', 'выдвинуть гипотезу', 'аргументировать', 'защитить', 'поддержать', 'оценить', 'рекомендовать'],
    create: ['спроектировать', 'сконструировать', 'спланировать', 'произвести', 'изобрести', 'разработать', 'сформулировать', 'собрать', 'составить', 'придумать'],
  },
} as const;

// ============================================================================
// RT-007 PHASE 2: UNIVERSAL STEMMING AND FUZZY MATCHING
// ============================================================================

// Snowball-supported languages (15 languages)
// https://snowballstem.org/algorithms/
const SNOWBALL_LANGUAGES: Record<string, string> = {
  en: 'english',
  ru: 'russian',
  es: 'spanish',
  fr: 'french',
  de: 'german',
  pt: 'portuguese',
  it: 'italian',
  ar: 'arabic',
  tr: 'turkish',
  hi: 'hindi',
};

// CJK languages (no stemming, use normalization)
const CJK_LANGUAGES = ['zh', 'ja', 'ko', 'th', 'vi', 'id', 'ms', 'bn', 'pl'];

// Stemmer cache for performance
interface StemmerCache {
  [language: string]: {
    [word: string]: string;
  };
}

const stemmerCache: StemmerCache = {};

/**
 * Universal stemming function with language detection
 *
 * Supports 19 languages via:
 * - Snowball stemmer (10 languages: EN, RU, ES, FR, DE, PT, IT, TR, AR, HI)
 * - Normalization (9 CJK languages: ZH, JA, KO, TH, VI, ID, MS, BN, PL)
 *
 * @param word - Word to stem
 * @param language - ISO 639-1 language code
 * @returns Stemmed/normalized word
 */
function stemWord(word: string, language: string): string {
  // Check cache first
  if (stemmerCache[language]?.[word]) {
    return stemmerCache[language][word];
  }

  let stemmed: string;

  if (SNOWBALL_LANGUAGES[language]) {
    // Use Snowball stemmer for supported languages
    try {
      const stemmerName = SNOWBALL_LANGUAGES[language];
      const stemmerClass = (snowballStemmers as any)[stemmerName];
      if (stemmerClass && typeof stemmerClass === 'function') {
        const stemmer = new stemmerClass();
        stemmed = stemmer.stem(word.toLowerCase());
      } else {
        // Fallback if stemmer not available
        stemmed = word.toLowerCase().trim();
      }
    } catch (error) {
      console.warn(`[stemWord] Snowball stemmer failed for language "${language}":`, error);
      stemmed = word.toLowerCase().trim();
    }
  } else if (CJK_LANGUAGES.includes(language)) {
    // For CJK languages, no stemming needed (morphology handled differently)
    // Just normalize: lowercase + trim
    stemmed = word.toLowerCase().trim();
  } else {
    // Fallback: simple suffix removal for unknown languages
    stemmed = word.toLowerCase().replace(/(?:ing|ed|s|es|ly|tion|ment)$/i, '');
  }

  // Cache result
  if (!stemmerCache[language]) {
    stemmerCache[language] = {};
  }
  stemmerCache[language][word] = stemmed;

  return stemmed;
}

/**
 * Check if verb is similar to any whitelist verb (fuzzy matching)
 *
 * Uses:
 * 1. Exact match (fast path)
 * 2. Stemming match (for 10 Snowball-supported languages)
 * 3. Levenshtein distance ≤2 (universal typo tolerance)
 *
 * @param verb - Verb to check
 * @param whitelist - Array of whitelisted verbs
 * @param language - ISO 639-1 language code
 * @returns True if verb matches any whitelist entry
 */
function isSimilarVerb(verb: string, whitelist: string[], language: string): boolean {
  const lowerVerb = verb.toLowerCase().trim();

  // Exact match (fast path)
  if (whitelist.some(v => v.toLowerCase() === lowerVerb)) {
    return true;
  }

  // Fuzzy match for all languages
  const verbStem = stemWord(lowerVerb, language);

  return whitelist.some(whitelistVerb => {
    const whitelistStem = stemWord(whitelistVerb.toLowerCase(), language);

    // Stemming match (works for 10+ languages via Snowball)
    if (verbStem === whitelistStem) return true;

    // Levenshtein distance ≤2 (typos, minor variations)
    // Universal across all languages
    if (levenshtein.get(verbStem, whitelistStem) <= 2) return true;

    return false;
  });
}

// ============================================================================
// LEGACY HELPER FUNCTIONS (RT-006)
// ============================================================================

/**
 * Helper: Extract action verb from learning objective text
 */
export function extractActionVerb(text: string, language: string): string {
  const tokens = text.trim().toLowerCase().split(/\s+/);
  if (language === 'ru') {
    const verb = tokens[0] || '';
    return verb.replace(/ся$/, ''); // Remove reflexive ending
  }
  return tokens[0] || '';
}

/**
 * Helper: Check if text contains non-measurable verbs
 *
 * RT-007 Phase 2: Supports EN/RU only (other languages fallback to no check)
 */
export function hasNonMeasurableVerb(text: string, language: string): boolean {
  const lowerText = text.toLowerCase();

  // Only EN and RU have non-measurable verb blacklists
  if (language === 'en' || language === 'ru') {
    const blacklist = NON_MEASURABLE_VERBS_BLACKLIST[language];
    return blacklist.some(verb => lowerText.includes(verb.toLowerCase()));
  }

  // Other languages: no check (assume measurable)
  return false;
}

/**
 * Helper: Check if verb is in Bloom's taxonomy whitelist (LEGACY - exact match only)
 *
 * @deprecated Use validateBloomsTaxonomy() for fuzzy matching support
 */
export function isBloomsVerb(verb: string, language: 'en' | 'ru'): boolean {
  const whitelist = BLOOMS_TAXONOMY_WHITELIST[language];
  const lowerVerb = verb.toLowerCase();
  return Object.values(whitelist).some((verbs: readonly string[]) =>
    verbs.some((v: string) => v.toLowerCase() === lowerVerb)
  );
}

/**
 * Validate learning objective against Bloom's Taxonomy whitelist
 *
 * RT-007 Phase 2: Uses fuzzy matching (stemming + Levenshtein) to handle verb forms.
 * RT-007 Phase 3: Returns ValidationResult with WARNING severity (not ERROR)
 *
 * Severity Rationale:
 * - Fuzzy matching reduces false positives significantly
 * - Whitelist may not cover all valid verbs across 19 languages
 * - Non-match is WARNING (log + proceed) rather than ERROR (block)
 *
 * Examples:
 * - Russian: "объяснить" = "объяснять" = "объяснение" ✅
 * - Spanish: "explicar" = "explicando" = "explique" ✅
 * - English: "explain" = "explaining" = "explains" ✅
 *
 * @param objective - Learning objective text
 * @param language - ISO 639-1 language code
 * @returns Validation result with severity WARNING on whitelist failure
 */
export function validateBloomsTaxonomy(
  objective: string,
  language: string
): ValidationResult {
  const verb = extractActionVerb(objective, language);
  const whitelist = getBloomsWhitelist(language);

  // Check if verb exists in any cognitive level (with fuzzy match)
  for (const [level, verbs] of Object.entries(whitelist)) {
    if (isSimilarVerb(verb, verbs, language)) {
      return {
        passed: true,
        severity: ValidationSeverity.INFO,
        score: 1.0,
        info: [`Action verb "${verb}" validated at Bloom's level "${level}" for language ${language}`],
        metadata: {
          rule: 'blooms_taxonomy_whitelist',
          level: level,
          verb: verb,
        }
      };
    }
  }

  // Not found - WARNING (not ERROR!)
  // RT-007 Phase 3: Fuzzy match reduces false positives, so non-match is WARNING
  return {
    passed: false,
    severity: ValidationSeverity.WARNING,
    score: 0.7, // Partial credit - may still be pedagogically valid
    warnings: [`Action verb "${verb}" not in Bloom's whitelist for ${language}`],
    suggestion: `Try using Bloom's taxonomy verbs like: explain, demonstrate, analyze, evaluate, create (${language})`,
    metadata: {
      rule: 'blooms_taxonomy_whitelist',
      verb: verb,
    }
  };
}
