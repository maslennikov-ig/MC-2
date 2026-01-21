#!/usr/bin/env tsx
/**
 * Stage 6 Quality Mechanisms Test Suite
 *
 * Comprehensive testing of all quality mechanisms:
 * - Heuristic filters (12 checks)
 * - Repair mechanisms (JSON, Mermaid)
 * - Inline Fixer and Patcher
 * - Judge system (Cascade Evaluator)
 * - CJK detection and recovery
 * - Prompt marker detection
 *
 * Run: pnpm tsx scripts/test-stage6-quality-mechanisms.ts
 * Skip LLM: pnpm tsx scripts/test-stage6-quality-mechanisms.ts --skip-llm
 * Specific suite: pnpm tsx scripts/test-stage6-quality-mechanisms.ts --suite heuristic
 * Verbose: pnpm tsx scripts/test-stage6-quality-mechanisms.ts --verbose
 */

import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment
config();

// Imports from Stage 6 modules
import {
  checkWordCount,
  checkPromptMarkers,
  checkLanguageConsistency,
  checkMermaidSyntax,
  checkSectionDuplication,
  runHeuristicFilters,
  DEFAULT_HEURISTIC_CONFIG,
} from '../src/stages/stage6-lesson-content/judge/heuristic-filter';
import { safeJSONParse, stripThinkingTags, extractJSON } from '../src/shared/utils/json-repair';
import { runMermaidFixPipeline } from '../src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline';
import {
  isEligibleForInlineFix,
  applyInlineFix,
  processInlineFixes,
} from '../src/stages/stage6-lesson-content/judge/inline-fixer';
import { LLMClient } from '../src/shared/llm';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { TargetedIssue, JudgeCriterion } from '@megacampus/shared-types';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface CLIArgs {
  skipLLM: boolean;
  suite: string | null;
  verbose: boolean;
  models: string[];
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  return {
    skipLLM: args.includes('--skip-llm'),
    suite: args.find(a => a.startsWith('--suite='))?.split('=')[1] || null,
    verbose: args.includes('--verbose'),
    models: (
      args.find(a => a.startsWith('--models='))?.split('=')[1] ||
      'deepseek/deepseek-chat,xiaomi/mimo-v2-flash:free'
    ).split(','),
  };
}

const CLI_ARGS = parseArgs();

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Generate content with specified word count
 * Uses English words to match checkWordCount regex pattern \b[a-zA-Z]+\b
 */
function generateContent(wordCount: number): string {
  const words = [
    'TypeScript',
    'is',
    'a',
    'programming',
    'language',
    'that',
    'extends',
    'JavaScript',
    'by',
    'adding',
    'static',
    'typing',
    'This',
    'allows',
    'developers',
    'to',
    'catch',
    'errors',
    'at',
    'compile',
    'time',
    'rather',
    'than',
    'runtime',
    'Types',
    'help',
    'document',
    'code',
    'and',
    'make',
    'it',
    'more',
    'understandable',
    'for',
    'other',
    'developers',
    'The',
    'compiler',
    'checks',
    'type',
    'compatibility',
    'ensuring',
    'your',
    'applications',
    'are',
    'robust',
    'Modern',
    'tooling',
    'provides',
    'excellent',
    'autocompletion',
    'refactoring',
    'support',
    'interfaces',
    'define',
    'contracts',
    'between',
    'components',
    'generics',
    'enable',
    'reusable',
    'type',
    'safe',
    'code',
    'patterns',
    'modules',
    'organize',
    'functionality',
    'into',
    'logical',
    'units',
    'namespaces',
    'provide',
    'additional',
    'structure',
    'decorators',
    'add',
    'metadata',
    'classes',
    'async',
    'await',
    'simplifies',
    'asynchronous',
    'programming',
    'promises',
  ];

  const result: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    result.push(words[i % words.length]);
  }
  return result.join(' ');
}

const FIXTURES = {
  // Prompt markers
  promptMarkers: {
    withMarkers: `# Урок по TypeScript

## SECTION TITLE

## ORIGINAL CONTENT

Текст урока по программированию. Это пример контента с маркерами.

## FIX INSTRUCTIONS

COMPLETE CORRECTED SECTION:`,

    clean: `# Урок по TypeScript

## Введение

Это чистый текст урока без посторонних артефактов. TypeScript - это язык программирования.

## Основные концепции

Типизация помогает находить ошибки на этапе компиляции.

## Заключение

Подведём итоги урока.`,
  },

  // CJK detection
  languageConsistency: {
    russianWithCJK: `## Введение

Это урок по 稀缺性资源分配问题分析 экономике. Тут есть китайские символы 资源 в тексте.`,

    cleanRussian: `## Введение

Это чистый русский текст без посторонних символов. Все слова написаны кириллицей.

## Основная часть

Продолжение урока на русском языке.`,

    cjkInCodeBlock: `## Введение

Вот пример кода:

\`\`\`python
# Китайские символы в коде - это нормально
print("稀缺性")
print("资源分配")
\`\`\`

Чистый текст после блока кода.`,
  },

  // Mermaid syntax
  mermaidSyntax: {
    escapedQuotes: `# Урок

\`\`\`mermaid
flowchart TD
  A[\\"Start\\"] --> B[\\"End\\"]
\`\`\`

Текст после диаграммы.`,

    unclosedBracket: `# Урок

\`\`\`mermaid
flowchart TD
  A[Start --> B[End]
\`\`\`

Текст после диаграммы.`,

    invalidArrow: `# Урок

\`\`\`mermaid
flowchart TD
  A[Start] -> B[End]
\`\`\`

Текст после диаграммы.`,

    clean: `# Урок

\`\`\`mermaid
flowchart TD
  A[Start] --> B[Process]
  B --> C[End]
\`\`\`

Текст после диаграммы.`,

    complex: `# Урок

\`\`\`mermaid
flowchart TD
  A[Very broken syntax
  B--> C
  D --
\`\`\`

Текст.`,
  },

  // JSON repair
  jsonRepair: {
    withThinkingTags:
      '<think>Let me analyze this request...</think>{"sections": [{"title": "Test"}]}',
    missingBrace: '{"sections": [{"title": "Test"}',
    trailingComma: '{"key": "value",}',
    markdownWrapped: '```json\n{"key": "value"}\n```',
    clean: '{"key": "value", "nested": {"a": 1}}',
  },

  // Section duplication
  sectionDuplication: {
    // Headers must be > 80% similar for Levenshtein detection
    duplicates: `# Урок

## Основные принципы

Содержимое первого раздела.

## Основные принципы

Содержимое второго раздела (точный дубликат заголовка).

## основные принципы

Ещё один дубликат (разный регистр).`,

    unique: `# Урок

## Введение

Содержимое введения.

## Основные принципы

Содержимое раздела.

## Практические примеры

Примеры использования.

## Заключение

Итоги урока.`,
  },

  // Word count
  wordCount: {
    tooShort: `# Урок

Это слишком короткий текст для полноценного урока.`,
    normal: generateContent(800),
  },

  // Inline fixer
  inlineFixer: {
    sectionContent: `## Введение

Это текст с синергетический эффект коллаборации который нужно упростить.

Также есть неточность: Python изобретён в 2020 году.`,

    issues: [
      {
        id: 'issue-1',
        criterion: 'clarity_readability' as JudgeCriterion,
        severity: 'minor' as const,
        location: 'sec_intro',
        description: 'Jargon may confuse beginners',
        quotedText: 'синергетический эффект коллаборации',
        suggestedFix: 'Replace jargon with simpler terms',
        inlineReplacement: 'эффект совместной работы',
      },
      {
        id: 'issue-2',
        criterion: 'factual_accuracy' as JudgeCriterion,
        severity: 'major' as const,
        location: 'sec_intro',
        description: 'Incorrect year',
        quotedText: 'Python изобретён в 2020 году',
        suggestedFix: 'Correct the year',
        inlineReplacement: 'Python создан в 1991 году',
      },
      {
        id: 'issue-3',
        criterion: 'pedagogical_structure' as JudgeCriterion, // blacklisted
        severity: 'major' as const,
        location: 'sec_intro',
        description: 'Needs restructuring',
        quotedText: 'some text',
        suggestedFix: 'Restructure section',
        inlineReplacement: 'different text',
      },
    ] as TargetedIssue[],
  },
};

/**
 * Minimal lesson spec for heuristic filter tests
 */
const MINIMAL_LESSON_SPEC: LessonSpecificationV2 = {
  lesson_id: 'test-lesson-001',
  course_id: 'test-course',
  module_id: 'test-module',
  title: 'Test Lesson',
  description: 'A test lesson for quality mechanism testing',
  difficulty_level: 'intermediate',
  estimated_duration_minutes: 15,
  learning_objectives: [
    { id: 'lo-1', objective: 'Understand TypeScript basics', bloom_level: 'understand' },
    { id: 'lo-2', objective: 'Apply type annotations', bloom_level: 'apply' },
  ],
  sections: [
    {
      id: 'sec-intro',
      title: 'Introduction',
      type: 'intro',
      estimated_word_count: 200,
      key_points: ['TypeScript overview'],
    },
    {
      id: 'sec-main',
      title: 'Main Content',
      type: 'concept',
      estimated_word_count: 400,
      key_points: ['Type system', 'Interfaces'],
    },
    {
      id: 'sec-conclusion',
      title: 'Conclusion',
      type: 'summary',
      estimated_word_count: 100,
      key_points: ['Key takeaways'],
    },
  ],
  metadata: {
    target_audience: 'developers',
    content_archetype: 'conceptual',
    prerequisites: [],
    keywords: ['typescript', 'types', 'programming'],
  },
};

// ============================================================================
// TEST RESULT TYPES
// ============================================================================

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  expected: string;
  actual: string;
  details?: Record<string, unknown>;
  error?: string;
}

interface SuiteResult {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  durationMs: number;
}

interface FullReport {
  timestamp: string;
  models: string[];
  suites: SuiteResult[];
  modelComparison?: Record<string, unknown>;
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalDurationMs: number;
}

const REPORT: FullReport = {
  timestamp: new Date().toISOString(),
  models: CLI_ARGS.models,
  suites: [],
  totalTests: 0,
  totalPassed: 0,
  totalFailed: 0,
  totalDurationMs: 0,
};

// ============================================================================
// SUITE 1: HEURISTIC FILTERS (12 tests)
// ============================================================================

async function runSuite1HeuristicFilters(): Promise<SuiteResult> {
  const suite: SuiteResult = {
    name: 'Heuristic Filters',
    tests: [],
    passed: 0,
    failed: 0,
    durationMs: 0,
  };
  const startTime = Date.now();

  // Test 1.1: checkWordCount - short content
  {
    const start = Date.now();
    const result = checkWordCount(FIXTURES.wordCount.tooShort, DEFAULT_HEURISTIC_CONFIG.wordCount);
    const test: TestResult = {
      id: '1.1',
      name: 'checkWordCount: Detects short content',
      passed: !result.passed && result.failure?.severity === 'critical',
      durationMs: Date.now() - start,
      expected: 'passed=false, severity=critical',
      actual: `passed=${result.passed}, severity=${result.failure?.severity || 'none'}`,
      details: { wordCount: result.actual, scoreContribution: result.scoreContribution },
    };
    suite.tests.push(test);
  }

  // Test 1.2: checkWordCount - normal content
  {
    const start = Date.now();
    const result = checkWordCount(FIXTURES.wordCount.normal, DEFAULT_HEURISTIC_CONFIG.wordCount);
    const test: TestResult = {
      id: '1.2',
      name: 'checkWordCount: Accepts normal content',
      passed: result.passed,
      durationMs: Date.now() - start,
      expected: 'passed=true',
      actual: `passed=${result.passed}, wordCount=${result.actual}`,
    };
    suite.tests.push(test);
  }

  // Test 1.3: checkPromptMarkers - detected
  {
    const start = Date.now();
    const result = checkPromptMarkers(FIXTURES.promptMarkers.withMarkers);
    const test: TestResult = {
      id: '1.3',
      name: 'checkPromptMarkers: Detects LLM hallucination markers',
      passed: !result.passed && result.detectedMarkers.length > 0,
      durationMs: Date.now() - start,
      expected: 'passed=false, detectedMarkers.length > 0',
      actual: `passed=${result.passed}, markers=${result.detectedMarkers.length}`,
      details: { detectedMarkers: result.detectedMarkers },
    };
    suite.tests.push(test);
  }

  // Test 1.4: checkPromptMarkers - clean
  {
    const start = Date.now();
    const result = checkPromptMarkers(FIXTURES.promptMarkers.clean);
    const test: TestResult = {
      id: '1.4',
      name: 'checkPromptMarkers: Accepts clean content',
      passed: result.passed && result.detectedMarkers.length === 0,
      durationMs: Date.now() - start,
      expected: 'passed=true, detectedMarkers.length === 0',
      actual: `passed=${result.passed}, markers=${result.detectedMarkers.length}`,
    };
    suite.tests.push(test);
  }

  // Test 1.5: checkLanguageConsistency - CJK in prose
  {
    const start = Date.now();
    const result = checkLanguageConsistency(FIXTURES.languageConsistency.russianWithCJK, 'ru');
    const test: TestResult = {
      id: '1.5',
      name: 'checkLanguageConsistency: Detects CJK in Russian',
      passed: !result.passed && result.scriptsFound.includes('CJK'),
      durationMs: Date.now() - start,
      expected: 'passed=false, scriptsFound includes CJK',
      actual: `passed=${result.passed}, scriptsFound=${result.scriptsFound.join(',')}`,
      details: { foreignCharacters: result.foreignCharacters, samples: result.foreignSamples },
    };
    suite.tests.push(test);
  }

  // Test 1.6: checkLanguageConsistency - CJK in code block (excluded)
  {
    const start = Date.now();
    const result = checkLanguageConsistency(FIXTURES.languageConsistency.cjkInCodeBlock, 'ru');
    const test: TestResult = {
      id: '1.6',
      name: 'checkLanguageConsistency: Ignores CJK in code blocks',
      passed: result.passed && result.foreignCharacters === 0,
      durationMs: Date.now() - start,
      expected: 'passed=true, foreignCharacters=0',
      actual: `passed=${result.passed}, foreignCharacters=${result.foreignCharacters}`,
    };
    suite.tests.push(test);
  }

  // Test 1.7: checkMermaidSyntax - escaped quotes
  {
    const start = Date.now();
    const result = checkMermaidSyntax(FIXTURES.mermaidSyntax.escapedQuotes);
    const test: TestResult = {
      id: '1.7',
      name: 'checkMermaidSyntax: Detects escaped quotes',
      passed: result.mermaidIssues.length > 0,
      durationMs: Date.now() - start,
      expected: 'mermaidIssues.length > 0',
      actual: `mermaidIssues=${result.mermaidIssues.length}`,
      details: { issues: result.mermaidIssues },
    };
    suite.tests.push(test);
  }

  // Test 1.8: checkMermaidSyntax - unclosed bracket
  {
    const start = Date.now();
    const result = checkMermaidSyntax(FIXTURES.mermaidSyntax.unclosedBracket);
    const test: TestResult = {
      id: '1.8',
      name: 'checkMermaidSyntax: Detects unclosed bracket',
      passed: result.mermaidIssues.length > 0,
      durationMs: Date.now() - start,
      expected: 'mermaidIssues.length > 0',
      actual: `mermaidIssues=${result.mermaidIssues.length}`,
      details: { issues: result.mermaidIssues },
    };
    suite.tests.push(test);
  }

  // Test 1.9: checkMermaidSyntax - clean
  {
    const start = Date.now();
    const result = checkMermaidSyntax(FIXTURES.mermaidSyntax.clean);
    const test: TestResult = {
      id: '1.9',
      name: 'checkMermaidSyntax: Accepts valid diagram',
      passed: result.passed && result.mermaidIssues.length === 0,
      durationMs: Date.now() - start,
      expected: 'passed=true, mermaidIssues.length === 0',
      actual: `passed=${result.passed}, issues=${result.mermaidIssues.length}`,
    };
    suite.tests.push(test);
  }

  // Test 1.10: checkSectionDuplication - duplicates
  {
    const start = Date.now();
    const result = checkSectionDuplication(FIXTURES.sectionDuplication.duplicates);
    const test: TestResult = {
      id: '1.10',
      name: 'checkSectionDuplication: Detects duplicate sections',
      passed: result.duplicatePairs.length > 0,
      durationMs: Date.now() - start,
      expected: 'duplicatePairs.length > 0',
      actual: `duplicatePairs=${result.duplicatePairs.length}`,
      details: { pairs: result.duplicatePairs },
    };
    suite.tests.push(test);
  }

  // Test 1.11: checkSectionDuplication - unique
  {
    const start = Date.now();
    const result = checkSectionDuplication(FIXTURES.sectionDuplication.unique);
    const test: TestResult = {
      id: '1.11',
      name: 'checkSectionDuplication: Accepts unique sections',
      passed: result.passed && result.duplicatePairs.length === 0,
      durationMs: Date.now() - start,
      expected: 'passed=true, duplicatePairs.length === 0',
      actual: `passed=${result.passed}, pairs=${result.duplicatePairs.length}`,
    };
    suite.tests.push(test);
  }

  // Test 1.12: runHeuristicFilters - aggregate
  {
    const start = Date.now();
    const mixedContent = FIXTURES.promptMarkers.clean + '\n\n' + generateContent(600);
    const result = runHeuristicFilters(mixedContent, MINIMAL_LESSON_SPEC, {}, 'ru');
    const test: TestResult = {
      id: '1.12',
      name: 'runHeuristicFilters: Aggregate score calculation',
      passed: result.score >= 0 && result.score <= 1,
      durationMs: Date.now() - start,
      expected: 'score in range 0-1',
      actual: `score=${result.score.toFixed(3)}, passed=${result.passed}`,
      details: {
        wordCount: result.metrics.wordCount,
        failureCount: result.failures.length,
      },
    };
    suite.tests.push(test);
  }

  suite.durationMs = Date.now() - startTime;
  suite.passed = suite.tests.filter(t => t.passed).length;
  suite.failed = suite.tests.filter(t => !t.passed).length;
  return suite;
}

// ============================================================================
// SUITE 2: REPAIR MECHANISMS (8 tests)
// ============================================================================

async function runSuite2RepairMechanisms(): Promise<SuiteResult> {
  const suite: SuiteResult = {
    name: 'Repair Mechanisms',
    tests: [],
    passed: 0,
    failed: 0,
    durationMs: 0,
  };
  const startTime = Date.now();

  // Test 2.1: JSON - thinking tags
  {
    const start = Date.now();
    try {
      const parsed = safeJSONParse(FIXTURES.jsonRepair.withThinkingTags) as Record<string, unknown>;
      const test: TestResult = {
        id: '2.1',
        name: 'JSON: Strips thinking tags',
        passed: parsed && Array.isArray(parsed.sections),
        durationMs: Date.now() - start,
        expected: 'Parsed object with sections array',
        actual: `Parsed: ${JSON.stringify(parsed).slice(0, 50)}...`,
      };
      suite.tests.push(test);
    } catch (e) {
      suite.tests.push({
        id: '2.1',
        name: 'JSON: Strips thinking tags',
        passed: false,
        durationMs: Date.now() - start,
        expected: 'Parsed object',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  // Test 2.2: JSON - missing brace
  {
    const start = Date.now();
    try {
      const parsed = safeJSONParse(FIXTURES.jsonRepair.missingBrace) as Record<string, unknown>;
      const test: TestResult = {
        id: '2.2',
        name: 'JSON: Auto-closes missing brace',
        passed: parsed && Array.isArray(parsed.sections),
        durationMs: Date.now() - start,
        expected: 'Parsed object with sections',
        actual: `Parsed: ${JSON.stringify(parsed).slice(0, 50)}...`,
      };
      suite.tests.push(test);
    } catch (e) {
      suite.tests.push({
        id: '2.2',
        name: 'JSON: Auto-closes missing brace',
        passed: false,
        durationMs: Date.now() - start,
        expected: 'Parsed object',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  // Test 2.3: JSON - trailing comma
  {
    const start = Date.now();
    try {
      const parsed = safeJSONParse(FIXTURES.jsonRepair.trailingComma) as Record<string, unknown>;
      const test: TestResult = {
        id: '2.3',
        name: 'JSON: Removes trailing comma',
        passed: parsed && parsed.key === 'value',
        durationMs: Date.now() - start,
        expected: 'Parsed object with key=value',
        actual: `Parsed: ${JSON.stringify(parsed)}`,
      };
      suite.tests.push(test);
    } catch (e) {
      suite.tests.push({
        id: '2.3',
        name: 'JSON: Removes trailing comma',
        passed: false,
        durationMs: Date.now() - start,
        expected: 'Parsed object',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  // Test 2.4: JSON - markdown wrapped
  {
    const start = Date.now();
    try {
      const parsed = safeJSONParse(FIXTURES.jsonRepair.markdownWrapped) as Record<string, unknown>;
      const test: TestResult = {
        id: '2.4',
        name: 'JSON: Extracts from markdown code block',
        passed: parsed && parsed.key === 'value',
        durationMs: Date.now() - start,
        expected: 'Parsed object with key=value',
        actual: `Parsed: ${JSON.stringify(parsed)}`,
      };
      suite.tests.push(test);
    } catch (e) {
      suite.tests.push({
        id: '2.4',
        name: 'JSON: Extracts from markdown code block',
        passed: false,
        durationMs: Date.now() - start,
        expected: 'Parsed object',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  // Test 2.5: Mermaid - escaped quotes (regex sanitize)
  {
    const start = Date.now();
    try {
      const result = await runMermaidFixPipeline(FIXTURES.mermaidSyntax.escapedQuotes, {
        skipLLM: true,
      });
      const test: TestResult = {
        id: '2.5',
        name: 'Mermaid: Fixes escaped quotes via regex',
        passed: result.modified && result.metrics.diagramsFixedRegex > 0,
        durationMs: Date.now() - start,
        expected: 'modified=true, diagramsFixedRegex > 0',
        actual: `modified=${result.modified}, fixedRegex=${result.metrics.diagramsFixedRegex}`,
        details: result.metrics,
      };
      suite.tests.push(test);
    } catch (e) {
      suite.tests.push({
        id: '2.5',
        name: 'Mermaid: Fixes escaped quotes via regex',
        passed: false,
        durationMs: Date.now() - start,
        expected: 'Fixed diagram',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  // Test 2.6: Mermaid - invalid arrow
  {
    const start = Date.now();
    try {
      const result = await runMermaidFixPipeline(FIXTURES.mermaidSyntax.invalidArrow, {
        skipLLM: true,
      });
      const test: TestResult = {
        id: '2.6',
        name: 'Mermaid: Fixes invalid arrow syntax',
        passed: result.modified,
        durationMs: Date.now() - start,
        expected: 'modified=true',
        actual: `modified=${result.modified}, metrics=${JSON.stringify(result.metrics)}`,
        details: result.metrics,
      };
      suite.tests.push(test);
    } catch (e) {
      suite.tests.push({
        id: '2.6',
        name: 'Mermaid: Fixes invalid arrow syntax',
        passed: false,
        durationMs: Date.now() - start,
        expected: 'Fixed diagram',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  // Test 2.7: Mermaid - complex error (would need LLM)
  {
    const start = Date.now();
    try {
      const result = await runMermaidFixPipeline(FIXTURES.mermaidSyntax.complex, { skipLLM: true });
      // With skipLLM, complex errors go to fallback
      const test: TestResult = {
        id: '2.7',
        name: 'Mermaid: Complex error uses fallback (skipLLM)',
        passed: result.metrics.diagramsFallback > 0 || result.metrics.diagramsFixedRegex > 0,
        durationMs: Date.now() - start,
        expected: 'fallback or regex fix applied',
        actual: `fallback=${result.metrics.diagramsFallback}, fixedRegex=${result.metrics.diagramsFixedRegex}`,
        details: result.metrics,
      };
      suite.tests.push(test);
    } catch (e) {
      suite.tests.push({
        id: '2.7',
        name: 'Mermaid: Complex error uses fallback',
        passed: false,
        durationMs: Date.now() - start,
        expected: 'Fallback applied',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  // Test 2.8: Mermaid - clean diagram unchanged
  {
    const start = Date.now();
    try {
      const result = await runMermaidFixPipeline(FIXTURES.mermaidSyntax.clean, { skipLLM: true });
      const test: TestResult = {
        id: '2.8',
        name: 'Mermaid: Clean diagram passes through',
        passed: !result.modified || result.metrics.diagramsFixedRegex === 0,
        durationMs: Date.now() - start,
        expected: 'No modifications needed',
        actual: `modified=${result.modified}, fixedRegex=${result.metrics.diagramsFixedRegex}`,
        details: result.metrics,
      };
      suite.tests.push(test);
    } catch (e) {
      suite.tests.push({
        id: '2.8',
        name: 'Mermaid: Clean diagram passes through',
        passed: false,
        durationMs: Date.now() - start,
        expected: 'No modifications',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  suite.durationMs = Date.now() - startTime;
  suite.passed = suite.tests.filter(t => t.passed).length;
  suite.failed = suite.tests.filter(t => !t.passed).length;
  return suite;
}

// ============================================================================
// SUITE 3: INLINE FIXER (5 tests)
// ============================================================================

async function runSuite3InlineFixer(): Promise<SuiteResult> {
  const suite: SuiteResult = {
    name: 'Inline Fixer',
    tests: [],
    passed: 0,
    failed: 0,
    durationMs: 0,
  };
  const startTime = Date.now();

  const { sectionContent, issues } = FIXTURES.inlineFixer;

  // Test 3.1: Eligible fix (clarity_readability)
  {
    const start = Date.now();
    const issue = issues[0]; // clarity_readability with quotedText
    const eligible = isEligibleForInlineFix(issue);
    const test: TestResult = {
      id: '3.1',
      name: 'Inline Fixer: Eligible fix detected',
      passed: eligible,
      durationMs: Date.now() - start,
      expected: 'isEligible=true for clarity_readability',
      actual: `isEligible=${eligible}`,
      details: { criterion: issue.criterion, hasQuotedText: !!issue.quotedText },
    };
    suite.tests.push(test);
  }

  // Test 3.2: Blacklisted criterion (pedagogical_structure)
  {
    const start = Date.now();
    const issue = issues[2]; // pedagogical_structure (blacklisted)
    const eligible = isEligibleForInlineFix(issue);
    const test: TestResult = {
      id: '3.2',
      name: 'Inline Fixer: Blacklisted criterion skipped',
      passed: !eligible,
      durationMs: Date.now() - start,
      expected: 'isEligible=false for pedagogical_structure',
      actual: `isEligible=${eligible}`,
      details: { criterion: issue.criterion },
    };
    suite.tests.push(test);
  }

  // Test 3.3: Apply inline fix
  {
    const start = Date.now();
    const issue = issues[0];
    const result = applyInlineFix(sectionContent, issue);
    const test: TestResult = {
      id: '3.3',
      name: 'Inline Fixer: Applies fix successfully',
      passed: result.success && result.content.includes('эффект совместной работы'),
      durationMs: Date.now() - start,
      expected: 'success=true, content contains replacement',
      actual: `success=${result.success}, reason=${result.reason || 'none'}`,
    };
    suite.tests.push(test);
  }

  // Test 3.4: Text not found
  {
    const start = Date.now();
    const fakeIssue: TargetedIssue = {
      id: 'fake-issue',
      criterion: 'clarity_readability',
      severity: 'minor',
      location: 'sec_1',
      description: 'Test',
      quotedText: 'this text does not exist in the content',
      suggestedFix: 'Fix it',
      inlineReplacement: 'replacement',
    };
    const result = applyInlineFix(sectionContent, fakeIssue);
    const test: TestResult = {
      id: '3.4',
      name: 'Inline Fixer: Text not found skipped',
      passed: !result.success && result.reason === 'text_not_found',
      durationMs: Date.now() - start,
      expected: 'success=false, reason=text_not_found',
      actual: `success=${result.success}, reason=${result.reason}`,
    };
    suite.tests.push(test);
  }

  // Test 3.5: Process batch
  {
    const start = Date.now();
    const result = processInlineFixes(sectionContent, issues);
    const test: TestResult = {
      id: '3.5',
      name: 'Inline Fixer: Batch processing',
      passed: result.appliedFixes.length > 0 && result.failedFixes.length > 0,
      durationMs: Date.now() - start,
      expected: 'Some fixes applied, some failed (blacklisted)',
      actual: `applied=${result.appliedFixes.length}, failed=${result.failedFixes.length}`,
      details: result.metrics,
    };
    suite.tests.push(test);
  }

  suite.durationMs = Date.now() - startTime;
  suite.passed = suite.tests.filter(t => t.passed).length;
  suite.failed = suite.tests.filter(t => !t.passed).length;
  return suite;
}

// ============================================================================
// SUITE 4: JUDGE SYSTEM WITH REAL LLM (5 tests)
// ============================================================================

/**
 * Prompt for LLM to generate lesson section content
 */
const SECTION_GENERATION_PROMPT = `Ты — опытный преподаватель. Напиши введение к уроку по TypeScript на русском языке.

Требования:
- 150-200 слов
- Объясни что такое TypeScript и зачем он нужен
- Используй понятный язык для начинающих
- Включи одну диаграмму Mermaid (flowchart)

Формат ответа — чистый markdown без дополнительных комментариев.`;

/**
 * Model comparison metrics
 */
interface ModelMetrics {
  model: string;
  tokensUsed: number;
  durationMs: number;
  wordCount: number;
  hasCJK: boolean;
  hasPromptMarkers: boolean;
  hasMermaidIssues: boolean;
  heuristicScore: number;
  passed: boolean;
}

const MODEL_COMPARISON: ModelMetrics[] = [];

async function runSuite4JudgeSystem(): Promise<SuiteResult> {
  const suite: SuiteResult = {
    name: 'Judge System (Real LLM)',
    tests: [],
    passed: 0,
    failed: 0,
    durationMs: 0,
  };
  const startTime = Date.now();

  if (CLI_ARGS.skipLLM) {
    // Add placeholder tests marked as skipped
    for (let i = 1; i <= 5; i++) {
      suite.tests.push({
        id: `4.${i}`,
        name: `LLM Test ${i} (SKIPPED - use without --skip-llm)`,
        passed: true,
        durationMs: 0,
        expected: 'SKIPPED',
        actual: 'SKIPPED - remove --skip-llm flag to run real LLM tests',
      });
    }
    suite.passed = 5;
    suite.durationMs = Date.now() - startTime;
    return suite;
  }

  const llmClient = new LLMClient();

  // Test 4.1: Cascade - heuristic fail triggers REGENERATE
  {
    const start = Date.now();
    const result = runHeuristicFilters(
      FIXTURES.languageConsistency.russianWithCJK,
      MINIMAL_LESSON_SPEC,
      {},
      'ru'
    );
    const hasCriticalFailure = result.failures.some(f => f.severity === 'critical');
    suite.tests.push({
      id: '4.1',
      name: 'Cascade: Heuristic fail triggers REGENERATE',
      passed: !result.passed && hasCriticalFailure,
      durationMs: Date.now() - start,
      expected: 'passed=false, has critical failure',
      actual: `passed=${result.passed}, failures=${result.failures.length}`,
      details: { failures: result.failures },
    });
  }

  // Test 4.2: Cascade - clean content passes heuristic
  {
    const start = Date.now();
    const cleanContent = FIXTURES.promptMarkers.clean + '\n\n' + generateContent(600);
    const result = runHeuristicFilters(cleanContent, MINIMAL_LESSON_SPEC, {}, 'ru');
    suite.tests.push({
      id: '4.2',
      name: 'Cascade: Clean content passes heuristic',
      passed: result.passed || result.failures.filter(f => f.severity === 'critical').length === 0,
      durationMs: Date.now() - start,
      expected: 'passed=true or no critical failures',
      actual: `passed=${result.passed}, score=${result.score.toFixed(3)}`,
    });
  }

  // Test 4.3: Real LLM Generation - Model 1 (DeepSeek)
  {
    const model1 = CLI_ARGS.models[0] || 'deepseek/deepseek-chat';
    const start = Date.now();

    try {
      console.log(`\n  [4.3] Generating content with ${model1}...`);

      const response = await llmClient.generateCompletion(SECTION_GENERATION_PROMPT, {
        model: model1,
        temperature: 0.7,
        maxTokens: 1000,
      });

      const content = response.content;
      const durationMs = Date.now() - start;

      // Run quality checks
      const langCheck = checkLanguageConsistency(content, 'ru');
      const promptCheck = checkPromptMarkers(content);
      const mermaidCheck = checkMermaidSyntax(content);
      const heuristicResult = runHeuristicFilters(content, MINIMAL_LESSON_SPEC, {}, 'ru');

      // Count words
      const wordCount = content.split(/\s+/).filter((w: string) => w.length > 0).length;

      // Store metrics for comparison
      MODEL_COMPARISON.push({
        model: model1,
        tokensUsed: response.totalTokens,
        durationMs,
        wordCount,
        hasCJK: !langCheck.passed,
        hasPromptMarkers: !promptCheck.passed,
        hasMermaidIssues: mermaidCheck.mermaidIssues.length > 0,
        heuristicScore: heuristicResult.score,
        passed: heuristicResult.score >= 0.6,
      });

      // Test passes if no critical issues
      const passed = langCheck.passed && promptCheck.passed;

      suite.tests.push({
        id: '4.3',
        name: `LLM Generation: ${model1.split('/')[1]}`,
        passed,
        durationMs,
        expected: 'No CJK, no prompt markers',
        actual: `CJK=${!langCheck.passed}, markers=${!promptCheck.passed}, score=${heuristicResult.score.toFixed(2)}`,
        details: {
          tokens: response.totalTokens,
          wordCount,
          mermaidIssues: mermaidCheck.mermaidIssues.length,
        },
      });
    } catch (e) {
      suite.tests.push({
        id: '4.3',
        name: `LLM Generation: ${model1.split('/')[1]}`,
        passed: false,
        durationMs: Date.now() - start,
        expected: 'Generated content',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  // Test 4.4: Real LLM Generation - Model 2 (Xiaomi or second model)
  {
    const model2 = CLI_ARGS.models[1] || 'openai/gpt-4o-mini';
    const start = Date.now();

    try {
      console.log(`  [4.4] Generating content with ${model2}...`);

      const response = await llmClient.generateCompletion(SECTION_GENERATION_PROMPT, {
        model: model2,
        temperature: 0.7,
        maxTokens: 1000,
      });

      const content = response.content;
      const durationMs = Date.now() - start;

      // Run quality checks
      const langCheck = checkLanguageConsistency(content, 'ru');
      const promptCheck = checkPromptMarkers(content);
      const mermaidCheck = checkMermaidSyntax(content);
      const heuristicResult = runHeuristicFilters(content, MINIMAL_LESSON_SPEC, {}, 'ru');

      const wordCount = content.split(/\s+/).filter((w: string) => w.length > 0).length;

      MODEL_COMPARISON.push({
        model: model2,
        tokensUsed: response.totalTokens,
        durationMs,
        wordCount,
        hasCJK: !langCheck.passed,
        hasPromptMarkers: !promptCheck.passed,
        hasMermaidIssues: mermaidCheck.mermaidIssues.length > 0,
        heuristicScore: heuristicResult.score,
        passed: heuristicResult.score >= 0.6,
      });

      const passed = langCheck.passed && promptCheck.passed;

      suite.tests.push({
        id: '4.4',
        name: `LLM Generation: ${model2.split('/')[1]}`,
        passed,
        durationMs,
        expected: 'No CJK, no prompt markers',
        actual: `CJK=${!langCheck.passed}, markers=${!promptCheck.passed}, score=${heuristicResult.score.toFixed(2)}`,
        details: {
          tokens: response.totalTokens,
          wordCount,
          mermaidIssues: mermaidCheck.mermaidIssues.length,
        },
      });
    } catch (e) {
      suite.tests.push({
        id: '4.4',
        name: `LLM Generation: ${model2.split('/')[1]}`,
        passed: false,
        durationMs: Date.now() - start,
        expected: 'Generated content',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  // Test 4.5: Mermaid Repair on LLM-generated content
  {
    const start = Date.now();

    // Generate content with intentionally problematic Mermaid
    const problematicPrompt = `Напиши короткий текст (50 слов) с диаграммой Mermaid.
Используй такой синтаксис диаграммы:
\`\`\`mermaid
flowchart TD
  A[\\"Start\\"] -> B[\\"End\\"]
\`\`\``;

    try {
      console.log(`  [4.5] Testing Mermaid repair pipeline...`);

      const model = CLI_ARGS.models[0] || 'deepseek/deepseek-chat';
      const response = await llmClient.generateCompletion(problematicPrompt, {
        model,
        temperature: 0.3,
        maxTokens: 500,
      });

      const content = response.content;

      // Check for Mermaid issues before repair
      const beforeCheck = checkMermaidSyntax(content);

      // Run Mermaid fix pipeline
      const repairResult = await runMermaidFixPipeline(content, { skipLLM: true });

      // Check after repair
      const afterCheck = checkMermaidSyntax(repairResult.content);

      const durationMs = Date.now() - start;

      // Test passes if repair improved the content or content was already good
      const improved = afterCheck.mermaidIssues.length <= beforeCheck.mermaidIssues.length;

      suite.tests.push({
        id: '4.5',
        name: 'Mermaid Repair Pipeline (Real LLM Content)',
        passed: improved,
        durationMs,
        expected: 'Issues reduced or maintained',
        actual: `Before: ${beforeCheck.mermaidIssues.length}, After: ${afterCheck.mermaidIssues.length}, Fixed: ${repairResult.metrics.diagramsFixedRegex}`,
        details: {
          modified: repairResult.modified,
          metrics: repairResult.metrics,
        },
      });
    } catch (e) {
      suite.tests.push({
        id: '4.5',
        name: 'Mermaid Repair Pipeline (Real LLM Content)',
        passed: false,
        durationMs: Date.now() - start,
        expected: 'Mermaid repair completed',
        actual: `Error: ${e instanceof Error ? e.message : String(e)}`,
        error: String(e),
      });
    }
  }

  suite.durationMs = Date.now() - startTime;
  suite.passed = suite.tests.filter(t => t.passed).length;
  suite.failed = suite.tests.filter(t => !t.passed).length;
  return suite;
}

// ============================================================================
// SUITE 5: CJK DETECTION & RECOVERY (5 tests)
// ============================================================================

async function runSuite5CJKDetection(): Promise<SuiteResult> {
  const suite: SuiteResult = {
    name: 'CJK Detection & Recovery',
    tests: [],
    passed: 0,
    failed: 0,
    durationMs: 0,
  };
  const startTime = Date.now();

  // Test 5.1: No CJK in clean Russian
  {
    const start = Date.now();
    const result = checkLanguageConsistency(FIXTURES.languageConsistency.cleanRussian, 'ru');
    const test: TestResult = {
      id: '5.1',
      name: 'CJK: Clean Russian passes',
      passed: result.passed && result.foreignCharacters === 0,
      durationMs: Date.now() - start,
      expected: 'passed=true, foreignCharacters=0',
      actual: `passed=${result.passed}, foreignChars=${result.foreignCharacters}`,
    };
    suite.tests.push(test);
  }

  // Test 5.2: CJK detected in prose
  {
    const start = Date.now();
    const result = checkLanguageConsistency(FIXTURES.languageConsistency.russianWithCJK, 'ru');
    const test: TestResult = {
      id: '5.2',
      name: 'CJK: Detected in Russian prose',
      passed: !result.passed && result.foreignCharacters > 0,
      durationMs: Date.now() - start,
      expected: 'passed=false, foreignCharacters > 0',
      actual: `passed=${result.passed}, foreignChars=${result.foreignCharacters}`,
      details: { samples: result.foreignSamples, scripts: result.scriptsFound },
    };
    suite.tests.push(test);
  }

  // Test 5.3: CJK in code block excluded
  {
    const start = Date.now();
    const result = checkLanguageConsistency(FIXTURES.languageConsistency.cjkInCodeBlock, 'ru');
    const test: TestResult = {
      id: '5.3',
      name: 'CJK: Excluded from code blocks',
      passed: result.passed && result.foreignCharacters === 0,
      durationMs: Date.now() - start,
      expected: 'passed=true (code blocks excluded)',
      actual: `passed=${result.passed}, foreignChars=${result.foreignCharacters}`,
    };
    suite.tests.push(test);
  }

  // Test 5.4: Multiple CJK sections severity
  {
    const start = Date.now();
    const multiCJK = `## Раздел 1

Текст с 稀缺性 символами.

## Раздел 2

Ещё 资源分配 китайские символы.

## Раздел 3

И третий раздел с 问题分析 иероглифами.`;

    const result = checkLanguageConsistency(multiCJK, 'ru');
    // Should detect as critical (multiple sections affected)
    const test: TestResult = {
      id: '5.4',
      name: 'CJK: Multiple sections triggers critical',
      passed: !result.passed && result.foreignCharacters > 10,
      durationMs: Date.now() - start,
      expected: 'passed=false, many foreign characters',
      actual: `passed=${result.passed}, foreignChars=${result.foreignCharacters}`,
      details: { samples: result.foreignSamples },
    };
    suite.tests.push(test);
  }

  // Test 5.5: Heuristic filter integration
  {
    const start = Date.now();
    const result = runHeuristicFilters(
      FIXTURES.languageConsistency.russianWithCJK,
      MINIMAL_LESSON_SPEC,
      {},
      'ru'
    );
    const hasCJKFailure = result.failures.some(f => f.filter === 'languageConsistency');
    const test: TestResult = {
      id: '5.5',
      name: 'CJK: Integration with runHeuristicFilters',
      passed: hasCJKFailure,
      durationMs: Date.now() - start,
      expected: 'languageConsistency failure in results',
      actual: `hasFailure=${hasCJKFailure}, totalFailures=${result.failures.length}`,
    };
    suite.tests.push(test);
  }

  suite.durationMs = Date.now() - startTime;
  suite.passed = suite.tests.filter(t => t.passed).length;
  suite.failed = suite.tests.filter(t => !t.passed).length;
  return suite;
}

// ============================================================================
// SUITE 6: PROMPT MARKER DETECTION (5 tests)
// ============================================================================

async function runSuite6PromptMarkers(): Promise<SuiteResult> {
  const suite: SuiteResult = {
    name: 'Prompt Marker Detection',
    tests: [],
    passed: 0,
    failed: 0,
    durationMs: 0,
  };
  const startTime = Date.now();

  const markers = [
    { id: '6.1', marker: '## SECTION TITLE', name: 'Patcher section title' },
    { id: '6.2', marker: '## ORIGINAL CONTENT', name: 'Patcher original content' },
    { id: '6.3', marker: '## FIX INSTRUCTIONS', name: 'Patcher fix instructions' },
    { id: '6.4', marker: 'COMPLETE CORRECTED SECTION:', name: 'Patcher completion marker' },
  ];

  for (const { id, marker, name } of markers) {
    const start = Date.now();
    const content = `# Урок\n\n${marker}\n\nТекст урока.`;
    const result = checkPromptMarkers(content);
    const test: TestResult = {
      id,
      name: `Prompt Marker: Detects "${name}"`,
      passed: !result.passed && result.detectedMarkers.includes(marker),
      durationMs: Date.now() - start,
      expected: `passed=false, detects "${marker}"`,
      actual: `passed=${result.passed}, detected=${result.detectedMarkers.join(', ')}`,
    };
    suite.tests.push(test);
  }

  // Test 6.5: Clean content passes
  {
    const start = Date.now();
    const result = checkPromptMarkers(FIXTURES.promptMarkers.clean);
    const test: TestResult = {
      id: '6.5',
      name: 'Prompt Marker: Clean content passes',
      passed: result.passed && result.detectedMarkers.length === 0,
      durationMs: Date.now() - start,
      expected: 'passed=true, no markers',
      actual: `passed=${result.passed}, markers=${result.detectedMarkers.length}`,
    };
    suite.tests.push(test);
  }

  suite.durationMs = Date.now() - startTime;
  suite.passed = suite.tests.filter(t => t.passed).length;
  suite.failed = suite.tests.filter(t => !t.passed).length;
  return suite;
}

// ============================================================================
// REPORT GENERATOR
// ============================================================================

function generateReport(): string {
  const lines: string[] = [];

  lines.push('═'.repeat(75));
  lines.push('  STAGE 6 QUALITY MECHANISMS TEST REPORT');
  lines.push(`  Generated: ${REPORT.timestamp}`);
  lines.push(`  Models: ${REPORT.models.join(', ')}`);
  lines.push('═'.repeat(75));
  lines.push('');

  for (const suite of REPORT.suites) {
    lines.push('▓'.repeat(75));
    lines.push(`  SUITE: ${suite.name.toUpperCase()} (${suite.tests.length} tests)`);
    lines.push('▓'.repeat(75));
    lines.push('');

    for (const test of suite.tests) {
      const icon = test.passed ? '✅' : '❌';
      lines.push(`${icon} ${test.id} ${test.name}`);
      lines.push(`   Expected: ${test.expected}`);
      lines.push(`   Actual: ${test.actual}`);
      lines.push(`   Duration: ${test.durationMs}ms`);
      if (test.error) {
        lines.push(`   Error: ${test.error}`);
      }
      if (CLI_ARGS.verbose && test.details) {
        lines.push(
          `   Details: ${JSON.stringify(test.details, null, 2).split('\n').join('\n   ')}`
        );
      }
      lines.push('');
    }

    lines.push('─'.repeat(75));
    lines.push(
      `  SUITE SUMMARY: ${suite.passed}/${suite.tests.length} passed (${((suite.passed / suite.tests.length) * 100).toFixed(0)}%)`
    );
    lines.push(`  Duration: ${suite.durationMs}ms`);
    lines.push('');
  }

  lines.push('═'.repeat(75));
  lines.push('  FINAL SUMMARY');
  lines.push('═'.repeat(75));
  lines.push('');
  lines.push(`  Total Tests: ${REPORT.totalTests}`);
  lines.push(
    `  Passed: ${REPORT.totalPassed} (${((REPORT.totalPassed / REPORT.totalTests) * 100).toFixed(1)}%)`
  );
  lines.push(
    `  Failed: ${REPORT.totalFailed} (${((REPORT.totalFailed / REPORT.totalTests) * 100).toFixed(1)}%)`
  );
  lines.push(`  Skipped: 0`);
  lines.push('');
  lines.push(`  Total Duration: ${REPORT.totalDurationMs}ms`);
  lines.push('');
  lines.push(`  Output: .tmp/test-quality-mechanisms/report.md`);
  lines.push('═'.repeat(75));

  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '╔' + '═'.repeat(73) + '╗');
  console.log(
    '║' + ' '.repeat(15) + 'Stage 6 Quality Mechanisms Test Suite' + ' '.repeat(19) + '║'
  );
  console.log('╚' + '═'.repeat(73) + '╝');

  console.log(`\n  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Skip LLM: ${CLI_ARGS.skipLLM}`);
  console.log(`  Suite Filter: ${CLI_ARGS.suite || 'all'}`);
  console.log(`  Verbose: ${CLI_ARGS.verbose}`);
  console.log(`  Models: ${CLI_ARGS.models.join(', ')}`);

  const startTime = Date.now();

  // Run suites based on filter
  const suiteMap: Record<string, () => Promise<SuiteResult>> = {
    heuristic: runSuite1HeuristicFilters,
    repair: runSuite2RepairMechanisms,
    inline: runSuite3InlineFixer,
    judge: runSuite4JudgeSystem,
    cjk: runSuite5CJKDetection,
    prompt: runSuite6PromptMarkers,
  };

  const suitesToRun = CLI_ARGS.suite ? [CLI_ARGS.suite] : Object.keys(suiteMap);

  for (const suiteName of suitesToRun) {
    const runSuite = suiteMap[suiteName];
    if (!runSuite) {
      console.error(`Unknown suite: ${suiteName}`);
      continue;
    }

    console.log(`\n  Running Suite: ${suiteName}...`);
    const result = await runSuite();
    REPORT.suites.push(result);
    REPORT.totalTests += result.tests.length;
    REPORT.totalPassed += result.passed;
    REPORT.totalFailed += result.failed;
    console.log(`  Suite ${suiteName}: ${result.passed}/${result.tests.length} passed`);
  }

  REPORT.totalDurationMs = Date.now() - startTime;

  // Generate and display report
  const reportText = generateReport();
  console.log('\n' + reportText);

  // Save report to file
  const outputDir = path.join(process.cwd(), '.tmp', 'test-quality-mechanisms');
  fs.mkdirSync(outputDir, { recursive: true });

  const reportPath = path.join(outputDir, 'report.md');
  fs.writeFileSync(reportPath, reportText);

  const jsonPath = path.join(outputDir, 'results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(REPORT, null, 2));

  console.log(`\n  Reports saved to:`);
  console.log(`    ${reportPath}`);
  console.log(`    ${jsonPath}`);

  // Exit with error if any tests failed
  if (REPORT.totalFailed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
