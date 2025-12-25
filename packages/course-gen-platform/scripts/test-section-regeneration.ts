#!/usr/bin/env tsx
/**
 * Local Test Script: Section-Level Regeneration
 *
 * Tests the section-level self-fix functionality end-to-end:
 * 1. Parses sample markdown content into sections
 * 2. Simulates section regeneration
 * 3. Verifies merged output
 *
 * Usage: pnpm tsx scripts/test-section-regeneration.ts
 *
 * Note: Actual LLM calls are expensive. This script tests the parsing
 * and merging logic without making real API calls.
 */

import {
  parseMarkdownSections,
  mergeSectionIntoMarkdown,
  getSectionContext,
  locationToSectionId,
} from '../src/stages/stage6-lesson-content/utils/markdown-section-parser';

// ============================================================================
// TEST DATA
// ============================================================================

const SAMPLE_MARKDOWN = `# TypeScript Fundamentals

## Introduction

Welcome to this comprehensive lesson on TypeScript fundamentals.
In this lesson, you will learn the basics of TypeScript and how to
use it effectively in your projects.

We'll cover type annotations, interfaces, and best practices.

## Understanding Types

TypeScript provides several built-in types that you can use:

- \`string\` - for text values
- \`number\` - for numeric values
- \`boolean\` - for true/false values

Here's an example:

\`\`\`typescript
let name: string = "John";
let age: number = 30;
let isActive: boolean = true;
\`\`\`

## Working with Interfaces

Interfaces define the shape of objects:

\`\`\`typescript
interface User {
  name: string;
  age: number;
  email?: string;
}
\`\`\`

This allows for better type checking and IDE support.

## Summary

In this lesson, we covered:
- Basic TypeScript types
- How to use interfaces
- Best practices for type safety

Continue practicing to master TypeScript!
`;

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

function testParsing() {
  console.log('\n=== Test 1: Markdown Parsing ===\n');

  const parsed = parseMarkdownSections(SAMPLE_MARKDOWN);

  console.log('Lesson Title:', parsed.lessonTitle);
  console.log('Number of sections:', parsed.sections.length);
  console.log('\nSections found:');

  for (const section of parsed.sections) {
    console.log(`  - [${section.id}] "${section.title}" (lines ${section.startLine}-${section.endLine})`);
    console.log(`    Content preview: "${section.content.slice(0, 50)}..."`);
  }

  // Assertions
  if (parsed.lessonTitle !== 'TypeScript Fundamentals') {
    throw new Error(`Expected title "TypeScript Fundamentals", got "${parsed.lessonTitle}"`);
  }

  if (parsed.sections.length !== 4) {
    throw new Error(`Expected 4 sections, got ${parsed.sections.length}`);
  }

  const expectedIds = ['introduction', 'section_1', 'section_2', 'summary'];
  for (let i = 0; i < expectedIds.length; i++) {
    if (parsed.sections[i].id !== expectedIds[i]) {
      throw new Error(`Expected section ${i} to be "${expectedIds[i]}", got "${parsed.sections[i].id}"`);
    }
  }

  console.log('\n✅ Parsing test passed!');
}

function testLocationMapping() {
  console.log('\n=== Test 2: Location to Section ID Mapping ===\n');

  const testCases: [string, string | null][] = [
    ['intro', 'introduction'],
    ['introduction', 'introduction'],
    ['sec_1', 'section_1'],
    ['sec_2', 'section_2'],
    ['section_3', 'section_3'],
    ['summary', 'summary'],
    ['conclusion', 'summary'],
    ['global', null],
    ['examples', null],
    ['exercises', null],
  ];

  for (const [location, expected] of testCases) {
    const result = locationToSectionId(location);
    console.log(`  "${location}" -> ${result === null ? 'null' : `"${result}"`}`);

    if (result !== expected) {
      throw new Error(`Expected "${location}" to map to ${expected}, got ${result}`);
    }
  }

  console.log('\n✅ Location mapping test passed!');
}

function testContextExtraction() {
  console.log('\n=== Test 3: Context Window Extraction ===\n');

  const parsed = parseMarkdownSections(SAMPLE_MARKDOWN);

  // Test context for introduction (includes title line before it)
  const introContext = getSectionContext(parsed, 'introduction');
  console.log('Context for introduction:', introContext ? `"${introContext.slice(0, 50)}..."` : '(empty)');

  // Introduction has the title as context (line 0 is "# TypeScript Fundamentals")
  if (!introContext.includes('TypeScript Fundamentals')) {
    throw new Error('Expected context for introduction to include lesson title');
  }

  // Test context for section_1 (should include title + intro)
  const sec1Context = getSectionContext(parsed, 'section_1');
  console.log('Context for section_1:', sec1Context ? `"${sec1Context.slice(0, 80)}..."` : '(empty)');

  if (!sec1Context.includes('TypeScript Fundamentals')) {
    throw new Error('Expected context for section_1 to include lesson title');
  }

  // Test context for summary (should include previous sections)
  const summaryContext = getSectionContext(parsed, 'summary');
  console.log('Context for summary:', summaryContext ? `"${summaryContext.slice(0, 80)}..."` : '(empty)');

  if (!summaryContext.includes('Working with Interfaces')) {
    throw new Error('Expected context for summary to include previous section');
  }

  console.log('\n✅ Context extraction test passed!');
}

function testSectionMerge() {
  console.log('\n=== Test 4: Section Merge ===\n');

  const parsed = parseMarkdownSections(SAMPLE_MARKDOWN);

  // Simulate regenerating section_1 (Understanding Types)
  const newSection1Content = `## Understanding Types

TypeScript is a STRONGLY TYPED language that helps catch errors early.

Here are the REGENERATED basics:

- Use \`string\` for text
- Use \`number\` for numbers
- Use \`boolean\` for true/false

This section has been regenerated!
`;

  const merged = mergeSectionIntoMarkdown(parsed, 'section_1', newSection1Content);

  // Verify merge
  console.log('Original section_1 content length:', parsed.sections[1].content.length);
  console.log('New section_1 content length:', newSection1Content.length);
  console.log('Merged document length:', merged.length);

  // Check that the regenerated content is in the merged result
  if (!merged.includes('REGENERATED basics')) {
    throw new Error('Expected merged content to include regenerated section');
  }

  // Check that other sections are preserved
  if (!merged.includes('Working with Interfaces')) {
    throw new Error('Expected merged content to preserve other sections');
  }

  if (!merged.includes('Welcome to this comprehensive lesson')) {
    throw new Error('Expected merged content to preserve introduction');
  }

  if (!merged.includes('Continue practicing to master TypeScript')) {
    throw new Error('Expected merged content to preserve summary');
  }

  console.log('\nMerged content preview:');
  console.log('---');
  console.log(merged.slice(0, 500) + '...');
  console.log('---');

  console.log('\n✅ Section merge test passed!');
}

function testMultipleSectionMerge() {
  console.log('\n=== Test 5: Multiple Section Merge ===\n');

  let currentMarkdown = SAMPLE_MARKDOWN;

  // Regenerate introduction
  let parsed = parseMarkdownSections(currentMarkdown);
  const newIntro = `## Introduction

This is a BRAND NEW introduction that has been regenerated.

Key topics we'll cover:
1. TypeScript basics
2. Type safety
3. Best practices
`;
  currentMarkdown = mergeSectionIntoMarkdown(parsed, 'introduction', newIntro);

  // Regenerate summary
  parsed = parseMarkdownSections(currentMarkdown);
  const newSummary = `## Summary

This is a BRAND NEW summary that has been regenerated.

Remember:
- Types are your friends
- Interfaces make life easier
- Keep practicing!
`;
  currentMarkdown = mergeSectionIntoMarkdown(parsed, 'summary', newSummary);

  // Verify both regenerations
  if (!currentMarkdown.includes('BRAND NEW introduction')) {
    throw new Error('Expected merged content to include new introduction');
  }

  if (!currentMarkdown.includes('BRAND NEW summary')) {
    throw new Error('Expected merged content to include new summary');
  }

  // Verify original sections preserved
  if (!currentMarkdown.includes('Understanding Types')) {
    throw new Error('Expected merged content to preserve Understanding Types section');
  }

  if (!currentMarkdown.includes('Working with Interfaces')) {
    throw new Error('Expected merged content to preserve Working with Interfaces section');
  }

  console.log('Successfully merged 2 regenerated sections');
  console.log('\n✅ Multiple section merge test passed!');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Section-Level Regeneration Test Script                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    testParsing();
    testLocationMapping();
    testContextExtraction();
    testSectionMerge();
    testMultipleSectionMerge();

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    ALL TESTS PASSED! ✅                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log('Summary:');
    console.log('  ✅ Markdown parsing works correctly');
    console.log('  ✅ Location to section ID mapping works');
    console.log('  ✅ Context window extraction works');
    console.log('  ✅ Single section merge works');
    console.log('  ✅ Multiple section merge works');
    console.log('\nThe section-level regeneration utilities are ready for use!');
    console.log('\nNext steps:');
    console.log('  1. Integrate with orchestrator to call regenerateSections()');
    console.log('  2. Add UI support for showing regenerated sections');
    console.log('  3. Test with real LLM calls in staging environment');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
