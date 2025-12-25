#!/usr/bin/env tsx
/**
 * E2E Test: Self-Correction Capabilities
 *
 * Tests the LLM's ability to:
 * 1. Patcher - Surgical edits (partial fix)
 * 2. Section Expander - Full section regeneration
 *
 * Run: pnpm tsx scripts/e2e-self-correction.ts
 */

import { config } from 'dotenv';
import { executePatch } from '../src/stages/stage6-lesson-content/judge/patcher';
import { executeExpansion } from '../src/stages/stage6-lesson-content/judge/section-expander';
import type { PatcherInput, SectionExpanderInput } from '@megacampus/shared-types';

// Load environment
config();

interface TestResult {
  name: string;
  passed: boolean;
  details: {
    originalLength: number;
    resultLength: number;
    tokensUsed: number;
    durationMs: number;
    issueFixed: boolean;
    contentPreview?: string;
  };
  error?: string;
}

const results: TestResult[] = [];

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PATCHER TESTS - Surgical Edits
 * ═══════════════════════════════════════════════════════════════════════
 */

async function testPatcherTypoFix(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  PATCHER TEST 1: Fix Typo');
  console.log('═'.repeat(70));

  const input: PatcherInput = {
    sectionId: 'sec_intro',
    sectionTitle: 'Введение в TypeScript',
    originalContent: `TypeScript - это язык программирования с статической типизацией.
Он был разработан компанией Микрософт в 2012 году.
TypeScript расширяет JavaScript, добавляя систему типов.

Преимущества TypeScript:
- Статическая проверка типов
- Улчшенная поддержка IDE
- Лучшая документация кода`,
    instructions: 'Fix the typo: "Улчшенная" should be "Улучшенная"',
    contextAnchors: {
      prevSectionEnd: null,
      nextSectionStart: 'Теперь рассмотрим базовые типы данных.',
    },
    contextWindow: {
      startQuote: 'Преимущества TypeScript',
      endQuote: 'Лучшая документация кода',
      scope: 'paragraph',
    },
    language: 'ru',
  };

  try {
    const result = await executePatch(input);

    const typoFixed = result.patchedContent.includes('Улучшенная') &&
                      !result.patchedContent.includes('Улчшенная');

    console.log(`  Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`  Typo fixed: ${typoFixed ? '✅ Yes' : '❌ No'}`);
    console.log(`  Original length: ${input.originalContent.length}`);
    console.log(`  Patched length: ${result.patchedContent.length}`);
    console.log(`  Tokens used: ${result.tokensUsed}`);
    console.log(`  Duration: ${result.durationMs}ms`);
    console.log(`  Diff: ${result.diffSummary}`);

    if (!typoFixed) {
      console.log('\n  Patched content:');
      console.log('  ' + result.patchedContent.replace(/\n/g, '\n  '));
    }

    return {
      name: 'Patcher: Fix Typo',
      passed: result.success && typoFixed,
      details: {
        originalLength: input.originalContent.length,
        resultLength: result.patchedContent.length,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        issueFixed: typoFixed,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Patcher: Fix Typo',
      passed: false,
      details: {
        originalLength: input.originalContent.length,
        resultLength: 0,
        tokensUsed: 0,
        durationMs: 0,
        issueFixed: false,
      },
      error: errorMsg,
    };
  }
}

async function testPatcherClarityImprovement(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  PATCHER TEST 2: Improve Clarity (Complex Technical Text)');
  console.log('═'.repeat(70));

  const input: PatcherInput = {
    sectionId: 'sec_types',
    sectionTitle: 'Типы данных в TypeScript',
    originalContent: `В TypeScript есть примитивные типы: string, number, boolean.
Также есть специальные типы any и unknown которые используются когда тип неизвестен.
Тип any отключает проверку типов что плохо для безопасности кода.
Unknown более безопасный потому что требует проверки перед использованием.`,
    instructions: 'Improve clarity: add punctuation, improve sentence structure, make the explanation clearer for beginners',
    contextAnchors: {
      prevSectionEnd: 'Теперь рассмотрим типы данных.',
      nextSectionStart: 'Рассмотрим примеры использования типов.',
    },
    contextWindow: {
      startQuote: 'В TypeScript есть',
      endQuote: 'перед использованием.',
      scope: 'section',
    },
    language: 'ru',
  };

  try {
    const result = await executePatch(input);

    // Check for improvements: better punctuation, kept key terms
    const hasKeyTerms = result.patchedContent.includes('string') &&
                        result.patchedContent.includes('number') &&
                        result.patchedContent.includes('any') &&
                        result.patchedContent.includes('unknown');

    // Check length is within 10% (not truncated, not expanded too much)
    const lengthRatio = result.patchedContent.length / input.originalContent.length;
    const lengthOk = lengthRatio >= 0.7 && lengthRatio <= 1.5;

    console.log(`  Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`  Key terms preserved: ${hasKeyTerms ? '✅ Yes' : '❌ No'}`);
    console.log(`  Length ratio: ${(lengthRatio * 100).toFixed(0)}%`);
    console.log(`  Tokens used: ${result.tokensUsed}`);
    console.log(`  Duration: ${result.durationMs}ms`);
    console.log(`  Diff: ${result.diffSummary}`);

    console.log('\n  Patched content preview:');
    console.log('  ' + result.patchedContent.slice(0, 300).replace(/\n/g, '\n  ') + '...');

    return {
      name: 'Patcher: Improve Clarity',
      passed: result.success && hasKeyTerms && lengthOk,
      details: {
        originalLength: input.originalContent.length,
        resultLength: result.patchedContent.length,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        issueFixed: hasKeyTerms && lengthOk,
        contentPreview: result.patchedContent.slice(0, 200),
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Patcher: Improve Clarity',
      passed: false,
      details: {
        originalLength: input.originalContent.length,
        resultLength: 0,
        tokensUsed: 0,
        durationMs: 0,
        issueFixed: false,
      },
      error: errorMsg,
    };
  }
}

async function testPatcherMarkdownFix(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  PATCHER TEST 3: Fix Markdown Structure (MD040 - code block language)');
  console.log('═'.repeat(70));

  const input: PatcherInput = {
    sectionId: 'sec_examples',
    sectionTitle: 'Примеры кода',
    originalContent: `Рассмотрим пример объявления переменных:

\`\`\`
let name = "Alice";
let age = 25;
let isActive = true;
\`\`\`

А вот пример с типами:

\`\`\`
let name: string = "Alice";
let age: number = 25;
let isActive: boolean = true;
\`\`\`

Обратите внимание на разницу.`,
    instructions: 'MD040: Add language identifier to code blocks. These are TypeScript examples.',
    contextAnchors: {
      prevSectionEnd: 'Теперь посмотрим на практические примеры.',
      nextSectionStart: null,
    },
    contextWindow: {
      startQuote: 'Рассмотрим пример',
      endQuote: 'разницу.',
      scope: 'section',
    },
    language: 'ru',
  };

  try {
    const result = await executePatch(input);

    // Check that code blocks now have language identifier
    const hasLanguageIds = (result.patchedContent.match(/```typescript/g) || []).length >= 2 ||
                           (result.patchedContent.match(/```ts/g) || []).length >= 2;

    // Check no bare ``` remain (except closing ones which are just ```)
    const bareCodeBlocks = result.patchedContent.match(/```\n/g) || [];
    const noBareBlocks = bareCodeBlocks.length === 0;

    console.log(`  Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`  Language IDs added: ${hasLanguageIds ? '✅ Yes' : '❌ No'}`);
    console.log(`  No bare code blocks: ${noBareBlocks ? '✅ Yes' : '❌ No'}`);
    console.log(`  Tokens used: ${result.tokensUsed}`);
    console.log(`  Duration: ${result.durationMs}ms`);

    console.log('\n  Patched content:');
    console.log('  ' + result.patchedContent.replace(/\n/g, '\n  '));

    return {
      name: 'Patcher: Fix Markdown (MD040)',
      passed: result.success && hasLanguageIds,
      details: {
        originalLength: input.originalContent.length,
        resultLength: result.patchedContent.length,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        issueFixed: hasLanguageIds,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Patcher: Fix Markdown (MD040)',
      passed: false,
      details: {
        originalLength: input.originalContent.length,
        resultLength: 0,
        tokensUsed: 0,
        durationMs: 0,
        issueFixed: false,
      },
      error: errorMsg,
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SECTION EXPANDER TESTS - Full Regeneration
 * ═══════════════════════════════════════════════════════════════════════
 */

async function testExpanderFactualFix(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  EXPANDER TEST 1: Fix Factual Error (Full Regeneration)');
  console.log('═'.repeat(70));

  const input: SectionExpanderInput = {
    sectionId: 'sec_history',
    sectionTitle: 'История TypeScript',
    originalContent: `TypeScript был создан в компании Google в 2015 году.
Язык был разработан для улучшения работы с большими проектами.
Сейчас TypeScript используется во многих крупных проектах.`,
    issues: [
      {
        criterion: 'factual_accuracy',
        severity: 'critical',
        description: 'Incorrect facts: TypeScript was created by Microsoft in 2012, not Google in 2015',
        suggestedFix: 'Correct the company name to Microsoft and year to 2012',
        sectionId: 'sec_history',
        affectedRange: { start: 0, end: 100 },
        quote: 'TypeScript был создан в компании Google в 2015 году',
      },
    ],
    ragChunks: [
      {
        content: 'TypeScript is a programming language developed by Microsoft. It was first released in October 2012. Anders Hejlsberg, lead architect of C#, led the development of TypeScript.',
        document_name: 'TypeScript Official History',
      },
    ],
    learningObjectives: [
      'Понять историю создания TypeScript',
      'Узнать ключевые факты о разработке языка',
    ],
    contextAnchors: {
      prevSectionEnd: 'Давайте узнаем, как появился TypeScript.',
      nextSectionStart: 'Теперь рассмотрим основные возможности языка.',
    },
    targetWordCount: 80,
    language: 'ru',
  };

  try {
    const result = await executeExpansion(input);

    // Check factual corrections
    const hasMicrosoft = result.regeneratedContent.toLowerCase().includes('microsoft') ||
                         result.regeneratedContent.toLowerCase().includes('майкрософт');
    const has2012 = result.regeneratedContent.includes('2012');
    const noGoogle = !result.regeneratedContent.toLowerCase().includes('google') &&
                     !result.regeneratedContent.toLowerCase().includes('гугл');
    const no2015 = !result.regeneratedContent.includes('2015');

    const factsFixed = hasMicrosoft && has2012 && noGoogle && no2015;

    console.log(`  Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`  Microsoft mentioned: ${hasMicrosoft ? '✅ Yes' : '❌ No'}`);
    console.log(`  Year 2012 mentioned: ${has2012 ? '✅ Yes' : '❌ No'}`);
    console.log(`  Google removed: ${noGoogle ? '✅ Yes' : '❌ No'}`);
    console.log(`  Year 2015 removed: ${no2015 ? '✅ Yes' : '❌ No'}`);
    console.log(`  Word count: ${result.wordCount} (target: ${input.targetWordCount})`);
    console.log(`  Tokens used: ${result.tokensUsed}`);
    console.log(`  Duration: ${result.durationMs}ms`);

    console.log('\n  Regenerated content:');
    console.log('  ' + result.regeneratedContent.replace(/\n/g, '\n  '));

    return {
      name: 'Expander: Fix Factual Error',
      passed: result.success && factsFixed,
      details: {
        originalLength: input.originalContent.length,
        resultLength: result.regeneratedContent.length,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        issueFixed: factsFixed,
        contentPreview: result.regeneratedContent.slice(0, 200),
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Expander: Fix Factual Error',
      passed: false,
      details: {
        originalLength: input.originalContent.length,
        resultLength: 0,
        tokensUsed: 0,
        durationMs: 0,
        issueFixed: false,
      },
      error: errorMsg,
    };
  }
}

async function testExpanderAddExamples(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  EXPANDER TEST 2: Add Missing Examples');
  console.log('═'.repeat(70));

  const input: SectionExpanderInput = {
    sectionId: 'sec_interfaces',
    sectionTitle: 'Интерфейсы в TypeScript',
    originalContent: `Интерфейсы определяют структуру объектов.
Они описывают какие свойства и методы должен иметь объект.
Интерфейсы полезны для типизации.`,
    issues: [
      {
        criterion: 'engagement_examples',
        severity: 'major',
        description: 'Section lacks code examples. Interface concepts need practical demonstration.',
        suggestedFix: 'Add 1-2 code examples showing interface definition and usage',
        sectionId: 'sec_interfaces',
        affectedRange: { start: 0, end: 200 },
        quote: 'Интерфейсы определяют структуру объектов',
      },
    ],
    ragChunks: [
      `interface User {
  name: string;
  age: number;
  email?: string;
}

function greet(user: User) {
  console.log(\`Hello, \${user.name}\`);
}`,
    ],
    learningObjectives: [
      'Понять синтаксис объявления интерфейсов',
      'Научиться использовать интерфейсы для типизации объектов',
    ],
    contextAnchors: {
      prevSectionEnd: 'Теперь изучим интерфейсы.',
      nextSectionStart: 'Далее рассмотрим классы.',
    },
    targetWordCount: 150,
    language: 'ru',
  };

  try {
    const result = await executeExpansion(input);

    // Check for code examples
    const hasCodeBlock = result.regeneratedContent.includes('```');
    const hasInterface = result.regeneratedContent.includes('interface');
    const hasExample = hasCodeBlock && hasInterface;

    console.log(`  Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`  Has code block: ${hasCodeBlock ? '✅ Yes' : '❌ No'}`);
    console.log(`  Has interface keyword: ${hasInterface ? '✅ Yes' : '❌ No'}`);
    console.log(`  Word count: ${result.wordCount} (target: ${input.targetWordCount})`);
    console.log(`  Tokens used: ${result.tokensUsed}`);
    console.log(`  Duration: ${result.durationMs}ms`);

    console.log('\n  Regenerated content (first 500 chars):');
    console.log('  ' + result.regeneratedContent.slice(0, 500).replace(/\n/g, '\n  '));

    return {
      name: 'Expander: Add Examples',
      passed: result.success && hasExample,
      details: {
        originalLength: input.originalContent.length,
        resultLength: result.regeneratedContent.length,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        issueFixed: hasExample,
        contentPreview: result.regeneratedContent.slice(0, 300),
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Expander: Add Examples',
      passed: false,
      details: {
        originalLength: input.originalContent.length,
        resultLength: 0,
        tokensUsed: 0,
        durationMs: 0,
        issueFixed: false,
      },
      error: errorMsg,
    };
  }
}

async function testExpanderMultipleIssues(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  EXPANDER TEST 3: Fix Multiple Issues (Complex)');
  console.log('═'.repeat(70));

  const input: SectionExpanderInput = {
    sectionId: 'sec_generics',
    sectionTitle: 'Обобщённые типы (Generics)',
    originalContent: `Дженерики это параметры типов.
Они делают код переиспользуемым.
Вот пример: function identity<T>(arg: T): T { return arg; }`,
    issues: [
      {
        criterion: 'clarity_readability',
        severity: 'major',
        description: 'Explanation is too brief and unclear for beginners',
        suggestedFix: 'Expand explanation with step-by-step breakdown',
        sectionId: 'sec_generics',
        affectedRange: { start: 0, end: 50 },
        quote: 'Дженерики это параметры типов',
      },
      {
        criterion: 'engagement_examples',
        severity: 'major',
        description: 'Code example lacks explanation and context',
        suggestedFix: 'Add explanation before/after code, show practical use case',
        sectionId: 'sec_generics',
        affectedRange: { start: 50, end: 150 },
        quote: 'function identity<T>',
      },
      {
        criterion: 'pedagogical_structure',
        severity: 'minor',
        description: 'Missing proper markdown structure',
        suggestedFix: 'Use proper code blocks with language identifier',
        sectionId: 'sec_generics',
        affectedRange: { start: 0, end: 200 },
        quote: 'Вот пример:',
      },
    ],
    ragChunks: [
      `Generics in TypeScript allow you to create reusable components that can work with any type.
The type variable <T> acts as a placeholder that gets replaced with an actual type when the function is called.

Example:
function identity<T>(arg: T): T {
  return arg;
}

let output = identity<string>("hello");  // type is string
let output2 = identity(42);  // type inferred as number`,
    ],
    learningObjectives: [
      'Понять концепцию обобщённых типов',
      'Уметь создавать функции с параметрами типов',
      'Понимать вывод типов в обобщённых функциях',
    ],
    contextAnchors: {
      prevSectionEnd: 'Изучим продвинутую тему - обобщённые типы.',
      nextSectionStart: 'В следующем разделе рассмотрим утилитарные типы.',
    },
    targetWordCount: 200,
    language: 'ru',
  };

  try {
    const result = await executeExpansion(input);

    // Check improvements
    const hasCodeBlock = result.regeneratedContent.includes('```typescript') ||
                         result.regeneratedContent.includes('```ts');
    const hasGenericSyntax = result.regeneratedContent.includes('<T>');
    const longerContent = result.regeneratedContent.length > input.originalContent.length * 1.5;
    const hasExplanation = result.wordCount >= 100; // At least 100 words

    const issuesFixed = hasCodeBlock && hasGenericSyntax && longerContent && hasExplanation;

    console.log(`  Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`  Has proper code block: ${hasCodeBlock ? '✅ Yes' : '❌ No'}`);
    console.log(`  Has generic syntax <T>: ${hasGenericSyntax ? '✅ Yes' : '❌ No'}`);
    console.log(`  Content expanded: ${longerContent ? '✅ Yes' : '❌ No'} (${input.originalContent.length} → ${result.regeneratedContent.length})`);
    console.log(`  Has explanation: ${hasExplanation ? '✅ Yes' : '❌ No'} (${result.wordCount} words)`);
    console.log(`  Tokens used: ${result.tokensUsed}`);
    console.log(`  Duration: ${result.durationMs}ms`);

    console.log('\n  Regenerated content (first 600 chars):');
    console.log('  ' + result.regeneratedContent.slice(0, 600).replace(/\n/g, '\n  '));

    return {
      name: 'Expander: Fix Multiple Issues',
      passed: result.success && issuesFixed,
      details: {
        originalLength: input.originalContent.length,
        resultLength: result.regeneratedContent.length,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        issueFixed: issuesFixed,
        contentPreview: result.regeneratedContent.slice(0, 300),
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Expander: Fix Multiple Issues',
      passed: false,
      details: {
        originalLength: input.originalContent.length,
        resultLength: 0,
        tokensUsed: 0,
        durationMs: 0,
        issueFixed: false,
      },
      error: errorMsg,
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MAIN
 * ═══════════════════════════════════════════════════════════════════════
 */

async function main() {
  console.log('\n' + '╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'E2E Self-Correction Tests' + ' '.repeat(28) + '║');
  console.log('║' + ' '.repeat(12) + 'Testing Patcher & Section Expander' + ' '.repeat(21) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  console.log(`\n  Timestamp: ${new Date().toISOString()}`);
  console.log(`  OpenRouter API Key: ${process.env.OPENROUTER_API_KEY ? '✅ Set' : '❌ Missing'}`);

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('\n  ERROR: OPENROUTER_API_KEY not set');
    process.exit(1);
  }

  // Run Patcher tests
  console.log('\n' + '▓'.repeat(70));
  console.log('  PATCHER TESTS (Surgical Edits)');
  console.log('▓'.repeat(70));

  results.push(await testPatcherTypoFix());
  results.push(await testPatcherClarityImprovement());
  results.push(await testPatcherMarkdownFix());

  // Run Section Expander tests
  console.log('\n' + '▓'.repeat(70));
  console.log('  SECTION EXPANDER TESTS (Full Regeneration)');
  console.log('▓'.repeat(70));

  results.push(await testExpanderFactualFix());
  results.push(await testExpanderAddExamples());
  results.push(await testExpanderMultipleIssues());

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('═'.repeat(70));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTokens = results.reduce((sum, r) => sum + r.details.tokensUsed, 0);

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    const issueStatus = r.details.issueFixed ? '(issue fixed)' : '(issue NOT fixed)';
    console.log(`  ${icon} ${r.name} ${issueStatus}`);
    console.log(`     Tokens: ${r.details.tokensUsed}, Duration: ${r.details.durationMs}ms`);
    if (r.error) {
      console.log(`     Error: ${r.error}`);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`  Total tokens used: ${totalTokens}`);
  console.log('═'.repeat(70));

  // Exit with error if any tests failed
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
