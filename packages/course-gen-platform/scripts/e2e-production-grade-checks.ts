#!/usr/bin/env tsx
/**
 * E2E Test: Production-Grade Quality Checks
 *
 * Tests the new production-grade validation features:
 * 1. Mermaid diagram preservation (CRITICAL)
 * 2. Code block language detection (MD040)
 * 3. Heading hierarchy validation (MD001)
 * 4. LaTeX formula protection
 * 5. Protected content in auto-repair
 *
 * Run: pnpm tsx scripts/e2e-production-grade-checks.ts
 */

import { config } from 'dotenv';
import {
  removeChatbotArtifacts,
} from '../src/stages/stage6-lesson-content/nodes/self-reviewer-node';
import {
  validateMarkdownStructure,
  applyMarkdownAutoFixes,
} from '../src/stages/stage6-lesson-content/judge/markdown-structure-filter';
import {
  checkLanguageConsistency,
  checkContentTruncation,
} from '../src/stages/stage6-lesson-content/judge/heuristic-filter';

// Load environment
config();

interface TestResult {
  name: string;
  passed: boolean;
  details: {
    description: string;
    expected: string;
    actual: string;
    preserved?: boolean;
    tokensUsed?: number;
    durationMs?: number;
  };
  error?: string;
}

const results: TestResult[] = [];

// ============================================================================
// TEST 1: Mermaid Diagram Preservation in Auto-Repair
// ============================================================================

async function testMermaidPreservationInAutoRepair(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST 1: Mermaid Diagram Preservation in Auto-Repair');
  console.log('═'.repeat(70));

  const contentWithMermaid = `# Introduction

Sure, here is the lesson on TypeScript!

TypeScript is a powerful language. Let me show you a diagram:

\`\`\`mermaid
graph TD
    A[Start] --> B{Is TypeScript?}
    B -->|Yes| C[Add Types]
    B -->|No| D[Use JavaScript]
    C --> E[Compile]
    D --> E
    E --> F[Run in Browser]
\`\`\`

I hope this helps you understand TypeScript!

The diagram above shows the workflow.`;

  const originalMermaid = contentWithMermaid.match(/```mermaid[\s\S]*?```/)?.[0] || '';

  try {
    // Apply chatbot artifact removal
    const cleaned = removeChatbotArtifacts(contentWithMermaid);

    // Check Mermaid is preserved
    const cleanedMermaid = cleaned.match(/```mermaid[\s\S]*?```/)?.[0] || '';
    const mermaidPreserved = cleanedMermaid === originalMermaid;

    // Check chatbot artifacts removed
    const artifactsRemoved = !cleaned.includes('Sure, here is the lesson') &&
                             !cleaned.includes('I hope this helps');

    console.log(`  Original Mermaid length: ${originalMermaid.length}`);
    console.log(`  Cleaned Mermaid length: ${cleanedMermaid.length}`);
    console.log(`  Mermaid preserved: ${mermaidPreserved ? '✅ Yes' : '❌ No'}`);
    console.log(`  Chatbot artifacts removed: ${artifactsRemoved ? '✅ Yes' : '❌ No'}`);

    if (!mermaidPreserved) {
      console.log('\n  Original Mermaid:');
      console.log('  ' + originalMermaid.replace(/\n/g, '\n  '));
      console.log('\n  After cleaning:');
      console.log('  ' + cleanedMermaid.replace(/\n/g, '\n  '));
    }

    return {
      name: 'Mermaid Preservation in Auto-Repair',
      passed: mermaidPreserved && artifactsRemoved,
      details: {
        description: 'Mermaid diagrams should not be modified during chatbot artifact removal',
        expected: 'Mermaid intact, artifacts removed',
        actual: mermaidPreserved && artifactsRemoved
          ? 'Mermaid intact, artifacts removed'
          : mermaidPreserved
            ? 'Mermaid intact, artifacts NOT removed'
            : 'Mermaid CORRUPTED',
        preserved: mermaidPreserved,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Mermaid Preservation in Auto-Repair',
      passed: false,
      details: {
        description: 'Mermaid diagrams should not be modified during chatbot artifact removal',
        expected: 'Mermaid intact',
        actual: `Error: ${errorMsg}`,
      },
      error: errorMsg,
    };
  }
}

// ============================================================================
// TEST 2: Code Block Preservation in Auto-Repair
// ============================================================================

async function testCodeBlockPreservationInAutoRepair(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST 2: Code Block Preservation in Auto-Repair');
  console.log('═'.repeat(70));

  const contentWithCode = `# Code Examples

As an AI language model, I'll show you TypeScript code.

\`\`\`typescript
// This is a comment
interface User {
  name: string;
  age: number;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}
\`\`\`

Let me know if you need more examples!

Also check this inline code: \`const x = 1;\` and \`let y = 2;\``;

  const originalCodeBlock = contentWithCode.match(/```typescript[\s\S]*?```/)?.[0] || '';
  const originalInline1 = '`const x = 1;`';
  const originalInline2 = '`let y = 2;`';

  try {
    const cleaned = removeChatbotArtifacts(contentWithCode);

    // Check code block preserved
    const cleanedCodeBlock = cleaned.match(/```typescript[\s\S]*?```/)?.[0] || '';
    const codeBlockPreserved = cleanedCodeBlock === originalCodeBlock;

    // Check inline code preserved
    const inline1Preserved = cleaned.includes(originalInline1);
    const inline2Preserved = cleaned.includes(originalInline2);

    // Check artifacts removed
    const artifactsRemoved = !cleaned.includes('As an AI language model') &&
                             !cleaned.includes('Let me know if you need');

    const allPreserved = codeBlockPreserved && inline1Preserved && inline2Preserved;

    console.log(`  Code block preserved: ${codeBlockPreserved ? '✅ Yes' : '❌ No'}`);
    console.log(`  Inline code preserved: ${inline1Preserved && inline2Preserved ? '✅ Yes' : '❌ No'}`);
    console.log(`  Chatbot artifacts removed: ${artifactsRemoved ? '✅ Yes' : '❌ No'}`);

    return {
      name: 'Code Block Preservation in Auto-Repair',
      passed: allPreserved && artifactsRemoved,
      details: {
        description: 'Code blocks and inline code should not be modified during artifact removal',
        expected: 'All code intact, artifacts removed',
        actual: allPreserved && artifactsRemoved
          ? 'All code intact, artifacts removed'
          : 'Code CORRUPTED or artifacts not removed',
        preserved: allPreserved,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Code Block Preservation in Auto-Repair',
      passed: false,
      details: {
        description: 'Code blocks should not be modified during artifact removal',
        expected: 'Code intact',
        actual: `Error: ${errorMsg}`,
      },
      error: errorMsg,
    };
  }
}

// ============================================================================
// TEST 3: LaTeX Formula Preservation in Auto-Repair
// ============================================================================

async function testLatexPreservationInAutoRepair(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST 3: LaTeX Formula Preservation in Auto-Repair');
  console.log('═'.repeat(70));

  const contentWithLatex = `# Mathematical Concepts

I hope this explanation helps you!

The quadratic formula is:

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

And inline formula: $E = mc^2$ represents mass-energy equivalence.

Sure, let me explain more...`;

  const originalBlockLatex = contentWithLatex.match(/\$\$[\s\S]*?\$\$/)?.[0] || '';
  const originalInlineLatex = '$E = mc^2$';

  try {
    const cleaned = removeChatbotArtifacts(contentWithLatex);

    // Check LaTeX preserved
    const cleanedBlockLatex = cleaned.match(/\$\$[\s\S]*?\$\$/)?.[0] || '';
    const blockLatexPreserved = cleanedBlockLatex === originalBlockLatex;
    const inlineLatexPreserved = cleaned.includes(originalInlineLatex);

    // Check artifacts removed
    const artifactsRemoved = !cleaned.includes('I hope this explanation helps') &&
                             !cleaned.includes('Sure, let me explain');

    const allPreserved = blockLatexPreserved && inlineLatexPreserved;

    console.log(`  Block LaTeX preserved: ${blockLatexPreserved ? '✅ Yes' : '❌ No'}`);
    console.log(`  Inline LaTeX preserved: ${inlineLatexPreserved ? '✅ Yes' : '❌ No'}`);
    console.log(`  Chatbot artifacts removed: ${artifactsRemoved ? '✅ Yes' : '❌ No'}`);

    return {
      name: 'LaTeX Formula Preservation in Auto-Repair',
      passed: allPreserved && artifactsRemoved,
      details: {
        description: 'LaTeX formulas should not be modified during artifact removal',
        expected: 'All LaTeX intact, artifacts removed',
        actual: allPreserved && artifactsRemoved
          ? 'All LaTeX intact, artifacts removed'
          : 'LaTeX CORRUPTED or artifacts not removed',
        preserved: allPreserved,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'LaTeX Formula Preservation in Auto-Repair',
      passed: false,
      details: {
        description: 'LaTeX formulas should not be modified during artifact removal',
        expected: 'LaTeX intact',
        actual: `Error: ${errorMsg}`,
      },
      error: errorMsg,
    };
  }
}

// ============================================================================
// TEST 4: Markdown Auto-Fix Does Not Touch Code Blocks
// ============================================================================

async function testMarkdownAutoFixPreservesCode(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST 4: Markdown Auto-Fix Preserves Code Blocks');
  console.log('═'.repeat(70));

  const contentWithTrailingSpaces = `# Example

Some text with trailing spaces

\`\`\`typescript
// Code with trailing spaces
const x = 1;
const y = 2;
\`\`\`

More text   `;

  const originalCodeBlock = contentWithTrailingSpaces.match(/```typescript[\s\S]*?```/)?.[0] || '';

  try {
    const { content: fixed, fixedRules } = applyMarkdownAutoFixes(contentWithTrailingSpaces);

    // Check code block preserved exactly (including trailing spaces inside)
    const fixedCodeBlock = fixed.match(/```typescript[\s\S]*?```/)?.[0] || '';
    const codeBlockPreserved = fixedCodeBlock === originalCodeBlock;

    // Check that trailing spaces were fixed in prose
    const proseHasNoTrailingSpaces = !fixed.split('```')[0].match(/  +$/m);

    console.log(`  Fixed rules: ${fixedRules.join(', ') || 'none'}`);
    console.log(`  Code block preserved: ${codeBlockPreserved ? '✅ Yes' : '❌ No'}`);
    console.log(`  Prose trailing spaces fixed: ${proseHasNoTrailingSpaces ? '✅ Yes' : '⚠️ Partial'}`);

    if (!codeBlockPreserved) {
      console.log('\n  Original code block:');
      console.log('  ' + originalCodeBlock.replace(/\n/g, '\n  '));
      console.log('\n  After fix:');
      console.log('  ' + fixedCodeBlock.replace(/\n/g, '\n  '));
    }

    return {
      name: 'Markdown Auto-Fix Preserves Code Blocks',
      passed: codeBlockPreserved,
      details: {
        description: 'Markdown auto-fixes (trailing spaces, tabs) should not modify code block content',
        expected: 'Code block unchanged',
        actual: codeBlockPreserved ? 'Code block unchanged' : 'Code block MODIFIED',
        preserved: codeBlockPreserved,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Markdown Auto-Fix Preserves Code Blocks',
      passed: false,
      details: {
        description: 'Markdown auto-fixes should not modify code block content',
        expected: 'Code block unchanged',
        actual: `Error: ${errorMsg}`,
      },
      error: errorMsg,
    };
  }
}

// ============================================================================
// TEST 5: Code Block Language Detection (MD040)
// ============================================================================

async function testCodeBlockLanguageDetection(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST 5: Code Block Language Detection (MD040)');
  console.log('═'.repeat(70));

  const contentWithUnlabeledBlocks = `# Examples

Here is some code:

\`\`\`
const x = 1;
let y = 2;
\`\`\`

And more code:

\`\`\`
function hello() {
  return "world";
}
\`\`\`
`;

  try {
    const result = validateMarkdownStructure(contentWithUnlabeledBlocks);

    // Check that MD040 issues were detected
    const md040Issues = result.issues.filter(
      (issue) => issue.ruleNames.includes('MD040')
    );

    const detected = md040Issues.length >= 2;

    console.log(`  Total issues: ${result.issues.length}`);
    console.log(`  MD040 issues: ${md040Issues.length}`);
    console.log(`  Score: ${result.score.toFixed(2)}`);
    console.log(`  Passed validation: ${result.passed ? '✅ Yes' : '❌ No (expected)'}`);

    for (const issue of md040Issues) {
      console.log(`    - Line ${issue.lineNumber}: ${issue.ruleDescription}`);
    }

    return {
      name: 'Code Block Language Detection (MD040)',
      passed: detected,
      details: {
        description: 'MD040 should detect code blocks without language identifier',
        expected: '2+ MD040 issues detected',
        actual: `${md040Issues.length} MD040 issues detected`,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Code Block Language Detection (MD040)',
      passed: false,
      details: {
        description: 'MD040 should detect code blocks without language identifier',
        expected: 'MD040 issues detected',
        actual: `Error: ${errorMsg}`,
      },
      error: errorMsg,
    };
  }
}

// ============================================================================
// TEST 6: Heading Hierarchy Detection (MD001)
// ============================================================================

async function testHeadingHierarchyDetection(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST 6: Heading Hierarchy Detection (MD001)');
  console.log('═'.repeat(70));

  const contentWithBrokenHeadings = `# Main Title

Some introduction text.

### Skipped to H3 (should be H2)

Content here.

## Back to H2

#### Skipped to H4 (should be H3)

More content.
`;

  try {
    const result = validateMarkdownStructure(contentWithBrokenHeadings);

    // Check that MD001 issues were detected
    const md001Issues = result.issues.filter(
      (issue) => issue.ruleNames.includes('MD001')
    );

    const detected = md001Issues.length >= 2;

    console.log(`  Total issues: ${result.issues.length}`);
    console.log(`  MD001 issues: ${md001Issues.length}`);
    console.log(`  Score: ${result.score.toFixed(2)}`);

    for (const issue of md001Issues) {
      console.log(`    - Line ${issue.lineNumber}: ${issue.errorDetail || issue.ruleDescription}`);
    }

    return {
      name: 'Heading Hierarchy Detection (MD001)',
      passed: detected,
      details: {
        description: 'MD001 should detect skipped heading levels',
        expected: '2+ MD001 issues detected',
        actual: `${md001Issues.length} MD001 issues detected`,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Heading Hierarchy Detection (MD001)',
      passed: false,
      details: {
        description: 'MD001 should detect skipped heading levels',
        expected: 'MD001 issues detected',
        actual: `Error: ${errorMsg}`,
      },
      error: errorMsg,
    };
  }
}

// ============================================================================
// TEST 7: Heuristic Filter Detects Truncation
// ============================================================================

async function testHeuristicDetectsTruncation(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST 7: Heuristic Filter Detects Truncation');
  console.log('═'.repeat(70));

  const truncatedContent = `# TypeScript Introduction

TypeScript is a programming language.

## Basic Types

TypeScript has several basic types including

\`\`\`typescript
let name: string = "Alice";
let age: number = 25;
`;  // Truncated - no closing ```, ends mid-sentence

  try {
    const result = checkContentTruncation(truncatedContent);

    // Check if truncation was detected
    const truncationDetected = !result.passed || result.truncationIssues.length > 0;

    console.log(`  Passed: ${result.passed ? '✅ Yes' : '❌ No (expected - content is truncated)'}`);
    console.log(`  Truncation detected: ${truncationDetected ? '✅ Yes' : '❌ No'}`);
    console.log(`  Issues found: ${result.truncationIssues.length}`);
    console.log(`  Last character: "${result.lastCharacter}"`);
    console.log(`  Matched code blocks: ${result.hasMatchedCodeBlocks ? '✅ Yes' : '❌ No (unmatched)'}`);

    for (const issue of result.truncationIssues) {
      console.log(`    - ${issue}`);
    }

    return {
      name: 'Heuristic Detects Truncation',
      passed: truncationDetected,
      details: {
        description: 'Heuristic filter should detect truncated content',
        expected: 'Truncation issues detected',
        actual: `${result.truncationIssues.length} issues, hasMatchedCodeBlocks=${result.hasMatchedCodeBlocks}`,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Heuristic Detects Truncation',
      passed: false,
      details: {
        description: 'Heuristic filter should detect truncated content',
        expected: 'Truncation detected',
        actual: `Error: ${errorMsg}`,
      },
      error: errorMsg,
    };
  }
}

// ============================================================================
// TEST 8: Language Consistency Check Ignores Code Blocks
// ============================================================================

async function testLanguageCheckIgnoresCodeBlocks(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST 8: Language Consistency Ignores Code Blocks (including Mermaid)');
  console.log('═'.repeat(70));

  // Russian content with English code blocks - should NOT flag as language issue
  const russianContentWithEnglishCode = `# Основы TypeScript

TypeScript это язык программирования с типизацией.

## Пример кода

\`\`\`typescript
interface User {
  name: string;
  age: number;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}
\`\`\`

\`\`\`mermaid
graph TD
    A[Start] --> B{Is TypeScript?}
    B -->|Yes| C[Add Types]
    B -->|No| D[Use JavaScript]
\`\`\`

После компиляции код выполняется в браузере.
`;

  try {
    const result = checkLanguageConsistency(russianContentWithEnglishCode, 'ru');

    // Should pass because code blocks are excluded from language check
    const passedLanguageCheck = result.passed;
    const noForeignChars = result.foreignCharacters === 0;

    console.log(`  Passed: ${passedLanguageCheck ? '✅ Yes' : '❌ No'}`);
    console.log(`  Foreign characters: ${result.foreignCharacters}`);
    console.log(`  Scripts found: ${result.scriptsFound.join(', ') || 'none'}`);

    if (result.foreignSamples.length > 0) {
      console.log(`  Foreign samples: "${result.foreignSamples.join('", "')}"`);
    }

    return {
      name: 'Language Check Ignores Code Blocks',
      passed: passedLanguageCheck && noForeignChars,
      details: {
        description: 'Language check should ignore content inside code/mermaid blocks',
        expected: 'No foreign characters detected (code blocks excluded)',
        actual: `Foreign chars: ${result.foreignCharacters}, Passed: ${passedLanguageCheck}`,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Language Check Ignores Code Blocks',
      passed: false,
      details: {
        description: 'Language check should ignore content inside code/mermaid blocks',
        expected: 'No errors',
        actual: `Error: ${errorMsg}`,
      },
      error: errorMsg,
    };
  }
}

// ============================================================================
// TEST 9: Complex Mermaid with Chatbot Artifacts
// ============================================================================

async function testComplexMermaidWithArtifacts(): Promise<TestResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST 9: Complex Mermaid Diagram Preserved During Cleanup');
  console.log('═'.repeat(70));

  const complexContent = `# Architecture Overview

Sure, I'll explain the architecture!

\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as API
    participant D as Database

    U->>F: Submit Form
    F->>A: POST /api/data
    A->>D: INSERT INTO users
    D-->>A: OK
    A-->>F: 200 Success
    F-->>U: Show Confirmation

    Note over U,D: All communications use HTTPS
\`\`\`

I hope this diagram helps! Let me know if you need any changes.

The sequence shows a typical request flow.`;

  const originalMermaid = complexContent.match(/```mermaid[\s\S]*?```/)?.[0] || '';

  try {
    const cleaned = removeChatbotArtifacts(complexContent);

    // Check Mermaid preserved exactly
    const cleanedMermaid = cleaned.match(/```mermaid[\s\S]*?```/)?.[0] || '';
    const mermaidPreserved = cleanedMermaid === originalMermaid;

    // Check artifacts removed
    const artifactsRemoved = !cleaned.includes("Sure, I'll explain") &&
                             !cleaned.includes("I hope this diagram helps") &&
                             !cleaned.includes("Let me know if you need");

    console.log(`  Original length: ${complexContent.length}`);
    console.log(`  Cleaned length: ${cleaned.length}`);
    console.log(`  Mermaid preserved: ${mermaidPreserved ? '✅ Yes' : '❌ No'}`);
    console.log(`  Artifacts removed: ${artifactsRemoved ? '✅ Yes' : '❌ No'}`);

    // Verify specific Mermaid content
    const hasSequence = cleanedMermaid.includes('sequenceDiagram');
    const hasParticipants = cleanedMermaid.includes('participant U as User');
    const hasNote = cleanedMermaid.includes('Note over U,D');

    console.log(`  Mermaid has sequenceDiagram: ${hasSequence ? '✅' : '❌'}`);
    console.log(`  Mermaid has participants: ${hasParticipants ? '✅' : '❌'}`);
    console.log(`  Mermaid has Note: ${hasNote ? '✅' : '❌'}`);

    const allGood = mermaidPreserved && artifactsRemoved && hasSequence && hasParticipants && hasNote;

    return {
      name: 'Complex Mermaid Preserved During Cleanup',
      passed: allGood,
      details: {
        description: 'Complex Mermaid (sequenceDiagram) should be preserved exactly',
        expected: 'Mermaid intact with all elements',
        actual: allGood ? 'All elements preserved' : 'Some elements lost',
        preserved: mermaidPreserved,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name: 'Complex Mermaid Preserved During Cleanup',
      passed: false,
      details: {
        description: 'Complex Mermaid should be preserved exactly',
        expected: 'Mermaid intact',
        actual: `Error: ${errorMsg}`,
      },
      error: errorMsg,
    };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(12) + 'E2E Production-Grade Quality Checks' + ' '.repeat(19) + '║');
  console.log('║' + ' '.repeat(10) + 'Testing Mermaid, Code, LaTeX Protection' + ' '.repeat(18) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  console.log(`\n  Timestamp: ${new Date().toISOString()}`);
  console.log(`  OpenRouter API Key: ${process.env.OPENROUTER_API_KEY ? '✅ Set' : '❌ Missing'}`);

  // Run all tests (no LLM API needed - using heuristics)
  console.log('\n' + '▓'.repeat(70));
  console.log('  PROTECTED CONTENT TESTS');
  console.log('▓'.repeat(70));

  results.push(await testMermaidPreservationInAutoRepair());
  results.push(await testCodeBlockPreservationInAutoRepair());
  results.push(await testLatexPreservationInAutoRepair());
  results.push(await testComplexMermaidWithArtifacts());

  console.log('\n' + '▓'.repeat(70));
  console.log('  MARKDOWN VALIDATION TESTS');
  console.log('▓'.repeat(70));

  results.push(await testMarkdownAutoFixPreservesCode());
  results.push(await testCodeBlockLanguageDetection());
  results.push(await testHeadingHierarchyDetection());

  console.log('\n' + '▓'.repeat(70));
  console.log('  HEURISTIC FILTER TESTS');
  console.log('▓'.repeat(70));

  results.push(await testHeuristicDetectsTruncation());
  results.push(await testLanguageCheckIgnoresCodeBlocks());

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('═'.repeat(70));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
    console.log(`     ${r.details.description}`);
    if (!r.passed) {
      console.log(`     Expected: ${r.details.expected}`);
      console.log(`     Actual: ${r.details.actual}`);
    }
    if (r.error) {
      console.log(`     Error: ${r.error}`);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('═'.repeat(70));

  // Exit with error if any tests failed
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
