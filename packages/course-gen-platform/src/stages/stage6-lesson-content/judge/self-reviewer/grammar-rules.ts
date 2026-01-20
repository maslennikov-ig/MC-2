/**
 * Grammar Rules for Language-Specific Validation
 * @module stages/stage6-lesson-content/judge/self-reviewer/grammar-rules
 *
 * Provides language-specific grammar rules for Phase 2.5 of Self-Reviewer.
 * These rules are included in the LLM prompt to help identify fixable
 * grammar errors that can be corrected with quotedText + inlineReplacement.
 *
 * Token impact: ~200-300 tokens per language in system prompt.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface GrammarRuleSet {
  /** Language code (ISO 639-1) */
  language: string;
  /** Human-readable language name */
  languageName: string;
  /** Markdown-formatted rules for LLM prompt */
  rules: string;
  /** Examples of common errors and fixes */
  examples: Array<{
    error: string;
    fix: string;
    explanation: string;
  }>;
}

// ============================================================================
// GRAMMAR RULES BY LANGUAGE
// ============================================================================

/**
 * Russian grammar rules
 *
 * Focus on:
 * - Case endings after prepositions
 * - Gender agreement (adjective + noun)
 * - Number agreement (subject + verb)
 * - Wrong script characters (Chinese, Japanese, etc.)
 */
export const RUSSIAN_RULES: GrammarRuleSet = {
  language: 'ru',
  languageName: 'Russian',
  rules: `
### Russian (ru) Grammar Checks:

1. **Case endings after prepositions** (падежи):
   - "о/об" + prepositional: "о проекте" ✓, "о проект" ✗
   - "для" + genitive: "для студента" ✓, "для студент" ✗
   - "с/со" + instrumental: "с данными" ✓, "с данные" ✗
   - "в/во" + prepositional (location): "в системе" ✓, "в система" ✗
   - "на" + prepositional (location): "на сервере" ✓, "на сервер" ✗

2. **Gender agreement** (согласование в роде):
   - Adjective must match noun gender:
     - "большая таблица" ✓ (feminine)
     - "большой таблица" ✗
     - "новый файл" ✓ (masculine)
     - "новая файл" ✗
     - "открытое окно" ✓ (neuter)
     - "открытый окно" ✗

3. **Number agreement** (согласование в числе):
   - Verb must match subject:
     - "данные показывают" ✓ (plural)
     - "данные показывает" ✗
     - "система работает" ✓ (singular)
     - "система работают" ✗

4. **Numeral agreement** (согласование с числительными):
   - 2-4 + genitive singular: "два файла", "три студента"
   - 5-20 + genitive plural: "пять файлов", "десять студентов"
   - 21-24 same as 1-4: "двадцать один файл"

5. **Person agreement** (согласование в лице):
   - "вы" requires 2nd person plural verb: "вы станете" ✓, "вы станет" ✗
   - "вы научитесь" ✓, "вы научится" ✗

6. **Adjective-noun case agreement** (падеж прилагательного):
   - Adjective must match noun case: "простые рассылки" ✓, "простые рассылок" ✗`,
  examples: [
    {
      error: 'о принцип работы',
      fix: 'о принципе работы',
      explanation: 'Preposition "о" requires prepositional case',
    },
    {
      error: 'большой система',
      fix: 'большая система',
      explanation: 'Adjective must agree with feminine noun',
    },
    {
      error: 'данные показывает',
      fix: 'данные показывают',
      explanation: 'Plural subject requires plural verb',
    },
    {
      error: 'два студент',
      fix: 'два студента',
      explanation: 'Numerals 2-4 require genitive singular',
    },
    {
      error: 'вы станет',
      fix: 'вы станете',
      explanation: '"вы" requires 2nd person plural verb ending',
    },
    {
      error: 'простые рассылок',
      fix: 'простые рассылки',
      explanation: 'Adjective and noun must agree in case',
    },
  ],
};

/**
 * English grammar rules
 *
 * Focus on:
 * - Subject-verb agreement
 * - Article usage
 * - Preposition errors
 * - Common typos
 */
export const ENGLISH_RULES: GrammarRuleSet = {
  language: 'en',
  languageName: 'English',
  rules: `
### English (en) Grammar Checks:

1. **Subject-verb agreement**:
   - "The data shows" ✓ (uncountable)
   - "The results show" ✓ (plural)
   - "The system work" ✗ → "The system works" ✓

2. **Article usage** (a/an/the):
   - Before vowel sounds: "an API", "an hour"
   - Before consonant sounds: "a URL" (sounds like "you")
   - Specific items: "the database" (known reference)

3. **Common preposition errors**:
   - "different from" ✓, "different than" ✗ (formal)
   - "consists of" ✓, "consists from" ✗
   - "depends on" ✓, "depends from" ✗`,
  examples: [
    {
      error: 'The data show',
      fix: 'The data shows',
      explanation: '"Data" treated as uncountable in technical writing',
    },
    {
      error: 'a API',
      fix: 'an API',
      explanation: 'Use "an" before vowel sounds',
    },
    {
      error: 'different than',
      fix: 'different from',
      explanation: 'Formal usage prefers "different from"',
    },
  ],
};

// ============================================================================
// WRONG SCRIPT DETECTION RULES
// ============================================================================

/**
 * Rules for detecting wrong script characters
 * These apply to ALL languages
 */
export const WRONG_SCRIPT_RULES = `
### Wrong Script Detection (all languages):

Check for isolated characters from wrong writing system:
- Chinese (中) in Russian/English text
- Cyrillic (А-Я) in pure English text
- Japanese (日本) in non-Japanese text

**Exceptions - DO NOT flag**:
- Content inside code blocks (\`\`\`...\`\`\`)
- Technical terms and identifiers
- Proper nouns (brand names, people names)
- Mathematical notation
- URLs and file paths`;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get grammar rules for a specific language
 *
 * @param language - ISO 639-1 language code
 * @returns Grammar rules for the language, or undefined if not supported
 */
export function getGrammarRules(language: string): GrammarRuleSet | undefined {
  switch (language.toLowerCase()) {
    case 'ru':
      return RUSSIAN_RULES;
    case 'en':
      return ENGLISH_RULES;
    default:
      return undefined;
  }
}

/**
 * Get grammar rules formatted for LLM prompt
 *
 * @param language - ISO 639-1 language code
 * @returns Markdown-formatted rules string for prompt inclusion
 */
export function getGrammarRulesForPrompt(language: string): string {
  const rules = getGrammarRules(language);

  if (!rules) {
    return `
### Grammar Checks (${language}):
No specific grammar rules defined for this language.
Focus on obvious errors and wrong script characters.`;
  }

  return rules.rules + '\n' + WRONG_SCRIPT_RULES;
}

/**
 * List of supported languages for grammar validation
 */
export const SUPPORTED_GRAMMAR_LANGUAGES = ['ru', 'en'] as const;

/**
 * Check if a language has grammar rules defined
 */
export function hasGrammarRules(language: string): boolean {
  return SUPPORTED_GRAMMAR_LANGUAGES.includes(
    language.toLowerCase() as (typeof SUPPORTED_GRAMMAR_LANGUAGES)[number]
  );
}
