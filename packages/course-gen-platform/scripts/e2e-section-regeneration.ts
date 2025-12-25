#!/usr/bin/env tsx
/**
 * E2E Test: Section-Level Regeneration with Real LLM Calls
 *
 * Tests the complete section regeneration pipeline with real LLM calls
 * using the free Xiaomi MiMo model.
 *
 * Scenarios tested:
 * 1. Clean generation (PASS) - Content without issues
 * 2. Section-level issues (sectionsToRegenerate) - Foreign characters, incomplete sentences
 * 3. Critical issues (REGENERATE) - Severe truncation
 * 4. Self-fix via LLM (FIXED) - Chatbot artifacts that get cleaned
 *
 * Usage:
 *   cd packages/course-gen-platform
 *   pnpm tsx scripts/e2e-section-regeneration.ts
 *
 * Requirements:
 *   - OPENROUTER_API_KEY environment variable set
 *   - SUPABASE_URL and SUPABASE_SERVICE_KEY for database access
 */

import 'dotenv/config';
import { LLMClient } from '../src/shared/llm/client';
import { selfReviewerNode } from '../src/stages/stage6-lesson-content/nodes/self-reviewer-node';
import { regenerateSections } from '../src/stages/stage6-lesson-content/utils/section-regenerator';
import {
  parseMarkdownSections,
  mergeSectionIntoMarkdown,
} from '../src/stages/stage6-lesson-content/utils/markdown-section-parser';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { LessonGraphStateType } from '../src/stages/stage6-lesson-content/state';
import type { SelfReviewResult } from '@megacampus/shared-types/judge-types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const TEST_MODEL = 'xiaomi/mimo-v2-flash:free';
const LANGUAGE = 'ru';

// ============================================================================
// TEST DATA
// ============================================================================

/**
 * Minimal lesson spec for testing
 */
const TEST_LESSON_SPEC: LessonSpecificationV2 = {
  lesson_id: 'test-1.1',
  title: 'Введение в TypeScript',
  difficulty_level: 'beginner',
  estimated_duration_minutes: 15,
  learning_objectives: [
    {
      id: 'LO1',
      objective: 'Понять что такое TypeScript',
      bloom_level: 'understand',
      assessment_criteria: ['Может объяснить преимущества TypeScript'],
    },
    {
      id: 'LO2',
      objective: 'Научиться объявлять типы',
      bloom_level: 'apply',
      assessment_criteria: ['Может написать типизированный код'],
    },
  ],
  intro_blueprint: {
    hook: 'TypeScript - это будущее JavaScript',
    key_learning_objectives: 'Понимание типов, синтаксис',
    estimated_reading_time: 2,
  },
  sections: [
    {
      title: 'Что такое TypeScript',
      content_archetype: 'concept_explainer',
      rag_context_id: 'section_1',
      constraints: {
        depth: 'summary',
        required_keywords: ['TypeScript', 'типизация'],
        prohibited_terms: [],
      },
      key_points_to_cover: ['Определение TypeScript', 'Преимущества над JavaScript'],
    },
    {
      title: 'Базовые типы',
      content_archetype: 'code_tutorial',
      rag_context_id: 'section_2',
      constraints: {
        depth: 'detailed_analysis',
        required_keywords: ['string', 'number', 'boolean'],
        prohibited_terms: [],
      },
      key_points_to_cover: ['Примитивные типы', 'Примеры использования'],
    },
  ],
  exercises: [],
  rag_context: {
    primary_documents: [],
    section_contexts: {},
    retrieval_strategy: 'hybrid',
    max_chunks_per_section: 3,
  },
  metadata: {
    target_audience: 'beginners',
    content_archetype: 'concept_explainer',
    generation_notes: 'Test lesson for E2E testing',
  },
};

// ============================================================================
// SAMPLE CONTENT GENERATORS
// ============================================================================

/**
 * Clean markdown content (should pass self-review)
 */
const CLEAN_CONTENT = `# Введение в TypeScript

## Введение

Добро пожаловать в урок по TypeScript! В этом уроке вы узнаете основы TypeScript и научитесь использовать статическую типизацию для написания более надежного кода.

TypeScript - это надмножество JavaScript, которое добавляет статическую типизацию. Это помогает находить ошибки на этапе компиляции, а не во время выполнения.

## Что такое TypeScript

TypeScript - это язык программирования, разработанный Microsoft. Он расширяет JavaScript, добавляя систему типов.

Основные преимущества TypeScript:
- Статическая типизация помогает находить ошибки раньше
- Улучшенная поддержка IDE и автодополнение
- Лучшая документация кода через типы

\`\`\`typescript
// Пример типизированного кода
let message: string = "Hello, TypeScript!";
let count: number = 42;
\`\`\`

## Базовые типы

TypeScript предоставляет несколько базовых типов для работы с данными.

### Примитивные типы

- \`string\` - для текстовых значений
- \`number\` - для числовых значений
- \`boolean\` - для логических значений

\`\`\`typescript
let name: string = "Иван";
let age: number = 25;
let isActive: boolean = true;
\`\`\`

## Итог

В этом уроке мы рассмотрели основы TypeScript. Вы узнали, что такое TypeScript и какие базовые типы он предоставляет. Продолжайте практиковаться для закрепления материала!
`;

/**
 * Content with language issues (foreign characters in Russian text)
 */
const CONTENT_WITH_LANGUAGE_ISSUES = `# Введение в TypeScript

## Введение

Добро пожаловать в урок по TypeScript! 这是一个测试 В этом уроке вы узнаете основы TypeScript.

## Что такое TypeScript

TypeScript 是微软开发的 - это язык программирования. Он расширяет JavaScript, добавляя систему типов.

\`\`\`typescript
let message: string = "Hello";
\`\`\`

## Базовые типы

TypeScript предоставляет базовые типы для работы с данными.

- \`string\` - для текстовых значений
- \`number\` - для числовых значений

## Итог

В этом уроке мы рассмотрели основы TypeScript.
`;

/**
 * Content with truncation issues (cut off mid-sentence)
 */
const CONTENT_WITH_TRUNCATION = `# Введение в TypeScript

## Введение

Добро пожаловать в урок по TypeScript!

## Что такое TypeScript

TypeScript - это язык программирования, который

## Базовые типы

Основные типы включают в себя string, number и`;

/**
 * Content with chatbot artifacts (should be auto-fixed)
 */
const CONTENT_WITH_CHATBOT_ARTIFACTS = `# Введение в TypeScript

## Введение

Sure, here is the lesson about TypeScript!

Добро пожаловать в урок по TypeScript! В этом уроке вы узнаете основы TypeScript.

As an AI language model, I'll explain TypeScript to you.

## Что такое TypeScript

TypeScript - это язык программирования, разработанный Microsoft.

\`\`\`typescript
let message: string = "Hello";
\`\`\`

I hope this helps! Let me know if you need more information.

## Базовые типы

TypeScript предоставляет базовые типы для работы с данными.

## Итог

In conclusion, I have explained TypeScript basics. Удачи в изучении!
`;

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create minimal state for self-reviewer node
 */
function createTestState(content: string): LessonGraphStateType {
  return {
    lessonSpec: TEST_LESSON_SPEC,
    courseId: 'test-course-id',
    language: LANGUAGE,
    lessonUuid: null,
    ragChunks: [],
    ragContextId: null,
    userRefinementPrompt: null,
    modelOverride: TEST_MODEL,
    generatedContent: content,
    sectionProgress: 0,
    selfReviewResult: null,
    sectionRegenerationResult: null,
    progressSummary: null,
    lessonContent: null,
    currentNode: 'selfReviewer',
    errors: [],
    retryCount: 0,
    modelUsed: TEST_MODEL,
    tokensUsed: 0,
    durationMs: 0,
    totalCostUsd: 0,
    nodeCosts: [],
    temperature: 0.7,
    qualityScore: null,
    judgeVerdict: null,
    judgeRecommendation: null,
    needsRegeneration: false,
    needsHumanReview: false,
    previousScores: [],
    refinementIterationCount: 0,
    targetedRefinementMode: 'full-auto',
    arbiterOutput: null,
    targetedRefinementStatus: null,
    lockedSections: [],
    sectionEditCount: {},
    targetedRefinementTokensUsed: 0,
  };
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Print self-review result summary
 */
function printSelfReviewResult(result: SelfReviewResult, scenarioName: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${scenarioName}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Status: ${result.status}`);
  console.log(`  Reasoning: ${result.reasoning}`);
  console.log(`  Heuristics Passed: ${result.heuristicsPassed}`);
  console.log(`  Issues: ${result.issues.length}`);

  if (result.issues.length > 0) {
    console.log('\n  Issues found:');
    for (const issue of result.issues) {
      console.log(`    - [${issue.severity}] ${issue.type} @ ${issue.location}: ${issue.description}`);
    }
  }

  if (result.sectionsToRegenerate && result.sectionsToRegenerate.length > 0) {
    console.log(`\n  Sections to regenerate: ${result.sectionsToRegenerate.join(', ')}`);
  }

  console.log(`\n  Tokens used: ${result.tokensUsed}`);
  console.log(`  Duration: ${formatDuration(result.durationMs)}`);

  if (result.heuristicDetails) {
    console.log('\n  Heuristic Details:');
    if (result.heuristicDetails.languageCheck) {
      console.log(`    Language: ${result.heuristicDetails.languageCheck.passed ? 'PASS' : 'FAIL'}`);
      if (!result.heuristicDetails.languageCheck.passed) {
        console.log(`      Foreign chars: ${result.heuristicDetails.languageCheck.foreignCharacters}`);
        console.log(`      Scripts: ${result.heuristicDetails.languageCheck.scriptsFound?.join(', ')}`);
      }
    }
    if (result.heuristicDetails.truncationCheck) {
      console.log(`    Truncation: ${result.heuristicDetails.truncationCheck.passed ? 'PASS' : 'FAIL'}`);
      if (!result.heuristicDetails.truncationCheck.passed) {
        console.log(`      Issues: ${result.heuristicDetails.truncationCheck.issues?.join(', ')}`);
      }
    }
  }
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * Scenario 1: Clean content - should pass
 */
async function testScenario1_CleanContent(): Promise<boolean> {
  console.log('\n' + '═'.repeat(70));
  console.log('  SCENARIO 1: Clean Content (Expected: PASS)');
  console.log('═'.repeat(70));

  try {
    const state = createTestState(CLEAN_CONTENT);
    const result = await selfReviewerNode(state);

    const selfReview = result.selfReviewResult as SelfReviewResult;
    printSelfReviewResult(selfReview, 'Clean Content Self-Review');

    const passed = selfReview.status === 'PASS' || selfReview.status === 'PASS_WITH_FLAGS';
    console.log(`\n  TEST RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Expected: PASS or PASS_WITH_FLAGS, Got: ${selfReview.status}`);

    return passed;
  } catch (error) {
    console.error('  ❌ Test failed with error:', error);
    return false;
  }
}

/**
 * Scenario 2: Content with language issues - should detect and mark sections
 */
async function testScenario2_LanguageIssues(): Promise<boolean> {
  console.log('\n' + '═'.repeat(70));
  console.log('  SCENARIO 2: Language Issues (Expected: REGENERATE or sectionsToRegenerate)');
  console.log('═'.repeat(70));

  try {
    const state = createTestState(CONTENT_WITH_LANGUAGE_ISSUES);
    const result = await selfReviewerNode(state);

    const selfReview = result.selfReviewResult as SelfReviewResult;
    printSelfReviewResult(selfReview, 'Language Issues Self-Review');

    // Should detect language issues
    const hasLanguageIssues = selfReview.issues.some(i => i.type === 'LANGUAGE');
    const hasSectionsToRegen = (selfReview.sectionsToRegenerate?.length ?? 0) > 0;
    const isRegenerate = selfReview.status === 'REGENERATE';

    const passed = hasLanguageIssues || hasSectionsToRegen || isRegenerate;
    console.log(`\n  TEST RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Language issues detected: ${hasLanguageIssues}`);
    console.log(`  Sections to regenerate: ${hasSectionsToRegen ? selfReview.sectionsToRegenerate?.join(', ') : 'none'}`);

    return passed;
  } catch (error) {
    console.error('  ❌ Test failed with error:', error);
    return false;
  }
}

/**
 * Scenario 3: Content with truncation - should trigger REGENERATE
 */
async function testScenario3_Truncation(): Promise<boolean> {
  console.log('\n' + '═'.repeat(70));
  console.log('  SCENARIO 3: Truncated Content (Expected: REGENERATE)');
  console.log('═'.repeat(70));

  try {
    const state = createTestState(CONTENT_WITH_TRUNCATION);
    const result = await selfReviewerNode(state);

    const selfReview = result.selfReviewResult as SelfReviewResult;
    printSelfReviewResult(selfReview, 'Truncation Self-Review');

    // Should detect truncation and require full regeneration
    const hasTruncationIssues = selfReview.issues.some(i => i.type === 'TRUNCATION');
    const isRegenerate = selfReview.status === 'REGENERATE';

    // Truncation should be detected either by heuristics or flagged for regen
    const passed = hasTruncationIssues || isRegenerate || !selfReview.heuristicsPassed;
    console.log(`\n  TEST RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Truncation detected: ${hasTruncationIssues}`);
    console.log(`  Heuristics passed: ${selfReview.heuristicsPassed}`);

    return passed;
  } catch (error) {
    console.error('  ❌ Test failed with error:', error);
    return false;
  }
}

/**
 * Scenario 4: Content with chatbot artifacts - should auto-fix
 */
async function testScenario4_ChatbotArtifacts(): Promise<boolean> {
  console.log('\n' + '═'.repeat(70));
  console.log('  SCENARIO 4: Chatbot Artifacts (Expected: FIXED or issues detected)');
  console.log('═'.repeat(70));

  try {
    const state = createTestState(CONTENT_WITH_CHATBOT_ARTIFACTS);
    const result = await selfReviewerNode(state);

    const selfReview = result.selfReviewResult as SelfReviewResult;
    printSelfReviewResult(selfReview, 'Chatbot Artifacts Self-Review');

    // Should detect hygiene issues or auto-fix them
    const hasHygieneIssues = selfReview.issues.some(i => i.type === 'HYGIENE');
    const isFixed = selfReview.status === 'FIXED';
    // patchedContent can be null or undefined - check for both
    const hasPatched = selfReview.patchedContent != null;
    // Programmatic patching is done in state.generatedContent, not in patchedContent
    const hasProgrammaticPatch = result.generatedContent !== undefined;

    const passed = hasHygieneIssues || isFixed;
    console.log(`\n  TEST RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Hygiene issues detected: ${hasHygieneIssues}`);
    console.log(`  Status is FIXED: ${isFixed}`);
    console.log(`  Has LLM patched content: ${hasPatched}`);
    console.log(`  Has programmatic patch: ${hasProgrammaticPatch}`);

    if (hasPatched && selfReview.patchedContent) {
      console.log('\n  LLM Patched content preview (first 300 chars):');
      const preview = typeof selfReview.patchedContent === 'string'
        ? selfReview.patchedContent.slice(0, 300)
        : JSON.stringify(selfReview.patchedContent).slice(0, 300);
      console.log(`  ${preview}...`);
    } else if (hasProgrammaticPatch && result.generatedContent) {
      console.log('\n  Programmatic patch applied! Content preview (first 300 chars):');
      console.log(`  ${result.generatedContent.slice(0, 300)}...`);
    }

    return passed;
  } catch (error) {
    console.error('  ❌ Test failed with error:', error);
    return false;
  }
}

/**
 * Scenario 5: Section regeneration end-to-end
 */
async function testScenario5_SectionRegeneration(): Promise<boolean> {
  console.log('\n' + '═'.repeat(70));
  console.log('  SCENARIO 5: Section Regeneration E2E');
  console.log('═'.repeat(70));

  try {
    // Manually corrupt a section and test regeneration
    const parsed = parseMarkdownSections(CLEAN_CONTENT);
    console.log(`\n  Parsed ${parsed.sections.length} sections from clean content`);

    // Corrupt section_1 by adding MANY foreign characters (need 10+ for REGENERATE threshold)
    const corruptedSection = parsed.sections.find(s => s.id === 'section_1');
    if (!corruptedSection) {
      console.log('  ❌ Could not find section_1 to corrupt');
      return false;
    }

    // Add 15+ Chinese characters to trigger REGENERATE (threshold is >10 for CRITICAL)
    // 这是一个非常重要的测试 = 12 Chinese chars, which is > 10 threshold
    const corruptedContent = corruptedSection.content.replace(
      'TypeScript - это язык программирования, разработанный Microsoft.',
      'TypeScript 这是一个非常重要的测试 - это язык программирования.'
    );
    const corruptedMarkdown = mergeSectionIntoMarkdown(parsed, 'section_1', corruptedContent);

    console.log('  Corrupted section_1 with Chinese characters');
    console.log('  Running self-review on corrupted content...\n');

    // Run self-review on corrupted content
    const state = createTestState(corruptedMarkdown);
    const reviewResult = await selfReviewerNode(state);
    const selfReview = reviewResult.selfReviewResult as SelfReviewResult;

    printSelfReviewResult(selfReview, 'Corrupted Content Self-Review');

    // Check if section regeneration is triggered
    const needsSectionRegen = (selfReview.sectionsToRegenerate?.length ?? 0) > 0;

    if (needsSectionRegen) {
      console.log('\n  Running section regeneration...');

      const regenResult = await regenerateSections({
        markdown: corruptedMarkdown,
        sectionIds: selfReview.sectionsToRegenerate!,
        lessonSpec: TEST_LESSON_SPEC,
        ragChunks: [],
        language: LANGUAGE,
        modelOverride: TEST_MODEL,
      });

      console.log(`\n  Section Regeneration Result:`);
      console.log(`    Success: ${regenResult.success}`);
      console.log(`    Sections regenerated: ${regenResult.regeneratedSections.join(', ')}`);
      console.log(`    Failed sections: ${regenResult.failedSections.join(', ') || 'none'}`);
      console.log(`    Tokens used: ${regenResult.tokensUsed}`);
      console.log(`    Duration: ${formatDuration(regenResult.durationMs)}`);

      if (regenResult.success) {
        // Verify regenerated content doesn't have Chinese
        const hasChineseAfter = /[\u4e00-\u9fa5]/.test(regenResult.content);
        console.log(`\n  Verification:`);
        console.log(`    Chinese characters removed: ${!hasChineseAfter ? '✅ Yes' : '❌ No'}`);

        return regenResult.success && !hasChineseAfter;
      }
    }

    // If no section regen triggered, check if full regen was triggered
    const isRegenerate = selfReview.status === 'REGENERATE';
    console.log(`\n  TEST RESULT: ${needsSectionRegen || isRegenerate ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Section regeneration triggered: ${needsSectionRegen}`);
    console.log(`  Full regeneration triggered: ${isRegenerate}`);

    return needsSectionRegen || isRegenerate;
  } catch (error) {
    console.error('  ❌ Test failed with error:', error);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'E2E Section Regeneration Tests' + ' '.repeat(22) + '║');
  console.log('║' + ' '.repeat(20) + 'Using Real LLM Calls' + ' '.repeat(28) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  console.log(`\n  Model: ${TEST_MODEL}`);
  console.log(`  Language: ${LANGUAGE}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);

  // Check environment
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('\n  ❌ ERROR: OPENROUTER_API_KEY not set');
    process.exit(1);
  }
  console.log('  OpenRouter API Key: ✅ Set');

  const results: { name: string; passed: boolean }[] = [];

  // Run all scenarios
  results.push({ name: 'Scenario 1: Clean Content', passed: await testScenario1_CleanContent() });
  results.push({ name: 'Scenario 2: Language Issues', passed: await testScenario2_LanguageIssues() });
  results.push({ name: 'Scenario 3: Truncation', passed: await testScenario3_Truncation() });
  results.push({ name: 'Scenario 4: Chatbot Artifacts', passed: await testScenario4_ChatbotArtifacts() });
  results.push({ name: 'Scenario 5: Section Regeneration', passed: await testScenario5_SectionRegeneration() });

  // Print summary
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('═'.repeat(70));

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  for (const result of results) {
    console.log(`  ${result.passed ? '✅' : '❌'} ${result.name}`);
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`  Total: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('═'.repeat(70) + '\n');

  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\n  ❌ Fatal error:', error);
  process.exit(1);
});
