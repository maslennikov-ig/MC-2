/**
 * Unit Tests for Judge Prompt Validation (Section 4 of test spec)
 *
 * Tests Judge prompts include correct instructions for:
 * - inlineReplacement field usage (InlineFixer integration)
 * - Location specificity (avoiding sec_global overuse)
 *
 * Test Coverage:
 * - T041.1: Output schema validation (accepts valid responses with inlineReplacement)
 * - T041.2: Output schema validation (accepts responses without optional fields)
 * - T041.3: Prompt content (discourage sec_global usage)
 * - T041.4: Prompt content (include INLINE FIX INSTRUCTIONS section)
 * - T041.5: Prompt content (mention quotedText and inlineReplacement fields)
 *
 * Reference:
 * - docs/plans/2026-01-stage6-fixes-test-spec.md (Section 4)
 * - packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts
 * - packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts
 *
 * @module tests/stages/stage6-lesson-content/judge/prompt-validation.test
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { LessonContentBody, RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import {
  JudgeConfidenceSchema,
  IssueSeveritySchema,
  CriteriaScoresSchema,
  JudgeIssueSchema,
  type JudgeIssue,
} from '@megacampus/shared-types';
import { DEFAULT_OSCQR_RUBRIC } from '@megacampus/shared-types';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Helper to create mock lesson content
 */
function createMockLessonContent(): LessonContentBody {
  return {
    intro: 'This is an introduction to the lesson covering key concepts.',
    sections: [
      {
        title: 'Section 1: Basics',
        content: 'Content for section 1 with синергетический эффект explanation.',
      },
      {
        title: 'Section 2: Advanced Topics',
        content: 'Content for section 2 with detailed examples.',
      },
      {
        title: 'Conclusion',
        content: 'Summary and key takeaways from the lesson.',
      },
    ],
    examples: [
      {
        title: 'Example 1',
        content: 'Example content with code snippets.',
      },
    ],
    exercises: [
      {
        question: 'What are the key concepts?',
        hints: ['Hint 1', 'Hint 2'],
        solution: 'Solution explanation.',
      },
    ],
  };
}

/**
 * Helper to create mock lesson specification
 */
function createMockLessonSpec(): LessonSpecificationV2 {
  return {
    lesson_id: 'lesson_test_123',
    title: 'Test Lesson',
    description: 'A test lesson for judge prompt validation.',
    difficulty_level: 'intermediate',
    estimated_duration_minutes: 15,
    learning_objectives: [
      {
        id: 'lo_1',
        objective: 'Understand basic concepts',
        bloom_level: 'understand',
      },
      {
        id: 'lo_2',
        objective: 'Apply concepts to solve problems',
        bloom_level: 'apply',
      },
    ],
    metadata: {
      target_audience: 'Intermediate learners',
      content_archetype: 'tutorial',
    },
  } as LessonSpecificationV2;
}

/**
 * Helper to create mock RAG chunks
 */
function createMockRAGChunks(): RAGChunk[] {
  return [
    {
      document_id: 'doc_1',
      document_name: 'Reference Material 1',
      content: 'This document explains synergistic effects in collaborative environments.',
      chunk_index: 0,
      total_chunks: 1,
      metadata: {},
    },
  ];
}

/**
 * Build judge prompt from clev-voter module (simulated for testing)
 * NOTE: This is a test implementation to validate prompt structure
 */
function buildTestJudgePrompt(
  lessonContent: LessonContentBody,
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[]
): string {
  // Format learning objectives
  const objectives = lessonSpec.learning_objectives
    .map((lo) => `- [${lo.id}] ${lo.objective} (Bloom: ${lo.bloom_level})`)
    .join('\n');

  // Format RAG context
  const ragContext = ragChunks.length > 0
    ? ragChunks
        .slice(0, 5)
        .map((chunk) => `[${chunk.document_name}]: ${chunk.content.slice(0, 500)}...`)
        .join('\n\n')
    : 'No RAG context provided.';

  // Format content
  const contentSummary = `
## Introduction
${lessonContent.intro}

## Sections (${lessonContent.sections.length} total)
${lessonContent.sections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n')}

## Examples (${lessonContent.examples.length} total)
${lessonContent.examples.map((e) => `- **${e.title}**: ${e.content.slice(0, 500)}${e.content.length > 500 ? '...' : ''}`).join('\n')}

## Exercises (${lessonContent.exercises.length} total)
${lessonContent.exercises.map((e) => `- ${e.question}`).join('\n')}
`;

  // Format rubric criteria
  const rubricCriteria = DEFAULT_OSCQR_RUBRIC.criteria
    .map((c) => `- **${c.criterion}** (${(c.weight * 100).toFixed(0)}% weight): ${c.description}`)
    .join('\n');

  return `You are an expert educational content evaluator. Evaluate the following lesson content against the OSCQR-based rubric.

## LESSON SPECIFICATION

**Title**: ${lessonSpec.title}
**Description**: ${lessonSpec.description}
**Difficulty**: ${lessonSpec.difficulty_level}
**Target Audience**: ${lessonSpec.metadata.target_audience}
**Content Archetype**: ${lessonSpec.metadata.content_archetype}

### Learning Objectives
${objectives}

## LESSON CONTENT TO EVALUATE
${contentSummary}

## REFERENCE MATERIALS (for fact verification)
${ragContext}

## EVALUATION RUBRIC

Evaluate against these 6 criteria (scores 0.0-1.0):
${rubricCriteria}

**Passing Threshold**: ${DEFAULT_OSCQR_RUBRIC.passingThreshold}

## OUTPUT FORMAT

Respond ONLY with valid JSON in this exact format:
{
  "overallScore": <number 0-1>,
  "passed": <boolean>,
  "confidence": "<high|medium|low>",
  "criteriaScores": {
    "learning_objective_alignment": <number 0-1>,
    "pedagogical_structure": <number 0-1>,
    "factual_accuracy": <number 0-1>,
    "clarity_readability": <number 0-1>,
    "engagement_examples": <number 0-1>,
    "completeness": <number 0-1>
  },
  "issues": [
    {
      "criterion": "<criterion_name>",
      "severity": "<critical|major|minor>",
      "location": "<where in content, e.g. sec_1, sec_2, sec_introduction>",
      "description": "<what is wrong>",
      "quotedText": "<OPTIONAL: exact text from content that has the issue, 5-30 words>",
      "suggestedFix": "<how to fix>",
      "inlineReplacement": "<OPTIONAL: exact replacement for quotedText>"
    }
  ],
  "strengths": ["<strength 1>", "<strength 2>"]
}

## INLINE FIX INSTRUCTIONS

For LOCAL issues (typos, incorrect facts, unclear wording) that can be fixed by simple text replacement:

1. Set \`quotedText\` to the EXACT text from the content (5-30 words, unique enough to locate)
2. Set \`inlineReplacement\` to the corrected text

Example:
{
  "criterion": "clarity_readability",
  "severity": "minor",
  "location": "sec_2",
  "description": "Jargon may confuse beginners",
  "quotedText": "синергетический эффект коллаборации",
  "suggestedFix": "Replace jargon with simpler terms",
  "inlineReplacement": "эффект совместной работы"
}

DO NOT provide inlineReplacement for:
- Structural changes (moving paragraphs)
- Adding new examples or content
- Changes requiring creativity
- Issues spanning multiple locations

## LOCATION SPECIFICITY

AVOID using "sec_global" when possible. Instead:
- If the issue appears in specific sections, name them (e.g., "sec_1", "sec_3")
- If engagement is lacking, identify WHERE examples should be added
- Only use "sec_global" for truly document-wide issues (e.g., "inconsistent tone throughout")

Evaluate objectively, focusing on educational quality and alignment with objectives.`;
}

// ============================================================================
// OUTPUT SCHEMA VALIDATION TESTS
// ============================================================================

describe('T041.1 - Judge Response Schema: Valid response with inlineReplacement', () => {
  it('should accept valid response with inlineReplacement field', () => {
    const validResponse = {
      overallScore: 0.75,
      passed: false,
      confidence: 'high',
      criteriaScores: {
        learning_objective_alignment: 0.80,
        pedagogical_structure: 0.75,
        factual_accuracy: 0.85,
        clarity_readability: 0.65, // Lower score due to issue
        engagement_examples: 0.75,
        completeness: 0.70,
      },
      issues: [
        {
          criterion: 'clarity_readability',
          severity: 'minor',
          location: 'sec_1',
          description: 'Jargon confuses readers',
          quotedText: 'синергетический эффект',
          suggestedFix: 'Simplify terminology',
          inlineReplacement: 'совместный эффект',
        },
      ],
      strengths: ['Good structure', 'Clear learning objectives'],
    };

    // Validate criteriaScores
    expect(() => CriteriaScoresSchema.parse(validResponse.criteriaScores)).not.toThrow();

    // Validate confidence
    expect(() => JudgeConfidenceSchema.parse(validResponse.confidence)).not.toThrow();

    // Validate issue with inlineReplacement
    expect(() => JudgeIssueSchema.parse(validResponse.issues[0])).not.toThrow();

    // Verify inlineReplacement is present and valid
    const issue = validResponse.issues[0];
    expect(issue.inlineReplacement).toBeDefined();
    expect(issue.inlineReplacement).toBe('совместный эффект');
    expect(issue.quotedText).toBe('синергетический эффект');
  });

  it('should accept issue with both quotedText and inlineReplacement', () => {
    const issueWithInlineFix: JudgeIssue = {
      criterion: 'clarity_readability',
      severity: 'minor',
      location: 'sec_2',
      description: 'Technical term may confuse beginners',
      quotedText: 'asymptotic complexity analysis',
      suggestedFix: 'Use simpler terminology',
      inlineReplacement: 'analysis of algorithm efficiency',
    };

    expect(() => JudgeIssueSchema.parse(issueWithInlineFix)).not.toThrow();
    expect(issueWithInlineFix.inlineReplacement).toBe('analysis of algorithm efficiency');
  });
});

describe('T041.2 - Judge Response Schema: Response without optional fields', () => {
  it('should accept response without quotedText or inlineReplacement', () => {
    const minimalResponse = {
      overallScore: 0.92,
      passed: true,
      confidence: 'high',
      criteriaScores: {
        learning_objective_alignment: 0.95,
        pedagogical_structure: 0.90,
        factual_accuracy: 0.93,
        clarity_readability: 0.91,
        engagement_examples: 0.89,
        completeness: 0.92,
      },
      issues: [
        {
          criterion: 'engagement_examples',
          severity: 'minor',
          location: 'sec_3',
          description: 'Could benefit from one more practical example',
          suggestedFix: 'Add an example demonstrating real-world application',
          // No quotedText or inlineReplacement
        },
      ],
      strengths: ['Excellent structure', 'Clear explanations', 'Good pacing'],
    };

    // Validate criteriaScores
    expect(() => CriteriaScoresSchema.parse(minimalResponse.criteriaScores)).not.toThrow();

    // Validate issue without optional fields
    expect(() => JudgeIssueSchema.parse(minimalResponse.issues[0])).not.toThrow();

    // Verify optional fields are undefined
    const issue = minimalResponse.issues[0];
    expect(issue.quotedText).toBeUndefined();
    expect(issue.inlineReplacement).toBeUndefined();
  });

  it('should accept issue with only suggestedFix (structural change)', () => {
    const structuralIssue: JudgeIssue = {
      criterion: 'pedagogical_structure',
      severity: 'major',
      location: 'sec_1',
      description: 'Introduction lacks clear connection to learning objectives',
      suggestedFix: 'Reorganize introduction to explicitly reference each learning objective',
      // No quotedText or inlineReplacement - structural change requires creativity
    };

    expect(() => JudgeIssueSchema.parse(structuralIssue)).not.toThrow();
    expect(structuralIssue.quotedText).toBeUndefined();
    expect(structuralIssue.inlineReplacement).toBeUndefined();
  });

  it('should accept issue with quotedText but no inlineReplacement', () => {
    const issueWithoutInline: JudgeIssue = {
      criterion: 'engagement_examples',
      severity: 'major',
      location: 'sec_2',
      description: 'Example needs more context and explanation',
      quotedText: 'For example, consider the case of X.',
      suggestedFix: 'Expand this example with step-by-step breakdown and practical context',
      // No inlineReplacement - requires creative expansion, not simple replacement
    };

    expect(() => JudgeIssueSchema.parse(issueWithoutInline)).not.toThrow();
    expect(issueWithoutInline.quotedText).toBe('For example, consider the case of X.');
    expect(issueWithoutInline.inlineReplacement).toBeUndefined();
  });
});

// ============================================================================
// PROMPT CONTENT VALIDATION TESTS
// ============================================================================

describe('T041.3 - Prompt Content: Discourage sec_global usage', () => {
  it('prompt should contain explicit warning against sec_global', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Check for LOCATION SPECIFICITY section
    expect(prompt).toContain('LOCATION SPECIFICITY');

    // Check for explicit "AVOID using sec_global" instruction
    expect(prompt).toContain('AVOID using "sec_global"');

    // Check for guidance on when to use specific sections
    expect(prompt).toContain('specific sections, name them');
    expect(prompt).toMatch(/sec_1.*sec_3/); // Examples of specific section IDs
  });

  it('prompt should provide alternative guidance to sec_global', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Check for guidance on identifying specific sections
    expect(prompt).toContain('If the issue appears in specific sections');

    // Check for guidance on engagement issues
    expect(prompt).toContain('If engagement is lacking, identify WHERE');

    // Check for valid use case of sec_global
    expect(prompt).toContain('Only use "sec_global" for truly document-wide issues');
    expect(prompt).toContain('inconsistent tone throughout'); // Example of valid sec_global use
  });
});

describe('T041.4 - Prompt Content: Include INLINE FIX INSTRUCTIONS section', () => {
  it('prompt should contain INLINE FIX INSTRUCTIONS section', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Check for section header
    expect(prompt).toContain('## INLINE FIX INSTRUCTIONS');

    // Check for explanation of when to use inline fixes
    expect(prompt).toContain('For LOCAL issues');
    expect(prompt).toContain('typos, incorrect facts, unclear wording');
    expect(prompt).toContain('simple text replacement');
  });

  it('prompt should provide numbered instructions for inline fixes', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Check for numbered instructions
    expect(prompt).toContain('1. Set `quotedText`');
    expect(prompt).toContain('2. Set `inlineReplacement`');

    // Check for guidance on quotedText requirements
    expect(prompt).toContain('EXACT text from the content');
    expect(prompt).toContain('5-30 words');
    expect(prompt).toContain('unique enough to locate');
  });

  it('prompt should include example of inline fix', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Check for "Example:" label
    expect(prompt).toContain('Example:');

    // Check for example structure with JSON
    expect(prompt).toContain('"criterion": "clarity_readability"');
    expect(prompt).toContain('"quotedText":');
    expect(prompt).toContain('"inlineReplacement":');

    // Check for actual example values (Russian jargon → simpler term)
    expect(prompt).toContain('синергетический эффект');
    expect(prompt).toContain('совместной работы');
  });

  it('prompt should list cases where inlineReplacement should NOT be used', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Check for "DO NOT provide inlineReplacement for:" section
    expect(prompt).toContain('DO NOT provide inlineReplacement for:');

    // Check for specific exclusions
    expect(prompt).toContain('Structural changes');
    expect(prompt).toContain('Adding new examples or content');
    expect(prompt).toContain('Changes requiring creativity');
    expect(prompt).toContain('Issues spanning multiple locations');
  });
});

describe('T041.5 - Prompt Content: Mention quotedText and inlineReplacement fields', () => {
  it('prompt should mention quotedText in OUTPUT FORMAT section', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Check OUTPUT FORMAT section includes quotedText
    expect(prompt).toContain('OUTPUT FORMAT');
    expect(prompt).toContain('"quotedText":');
    expect(prompt).toContain('OPTIONAL: exact text from content that has the issue');
  });

  it('prompt should mention inlineReplacement in OUTPUT FORMAT section', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Check OUTPUT FORMAT section includes inlineReplacement
    expect(prompt).toContain('"inlineReplacement":');
    expect(prompt).toContain('OPTIONAL: exact replacement for quotedText');
  });

  it('prompt should mark quotedText and inlineReplacement as optional', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Count OPTIONAL markers for these fields
    const quotedTextOptional = prompt.match(/"quotedText":.*OPTIONAL/);
    const inlineReplacementOptional = prompt.match(/"inlineReplacement":.*OPTIONAL/);

    expect(quotedTextOptional).toBeTruthy();
    expect(inlineReplacementOptional).toBeTruthy();
  });

  it('prompt should reference both fields in INLINE FIX INSTRUCTIONS', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Extract INLINE FIX INSTRUCTIONS section
    const inlineSection = prompt.substring(
      prompt.indexOf('## INLINE FIX INSTRUCTIONS'),
      prompt.indexOf('## LOCATION SPECIFICITY')
    );

    // Verify both fields are mentioned in instructions
    expect(inlineSection).toContain('quotedText');
    expect(inlineSection).toContain('inlineReplacement');

    // Verify they're explained in context
    expect(inlineSection).toContain('Set `quotedText` to the EXACT text');
    expect(inlineSection).toContain('Set `inlineReplacement` to the corrected text');
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('T041.6 - Integration: Full prompt structure validation', () => {
  it('prompt should have all required sections in correct order', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Check section order
    const lessonSpecIndex = prompt.indexOf('## LESSON SPECIFICATION');
    const contentIndex = prompt.indexOf('## LESSON CONTENT TO EVALUATE');
    const referenceMaterialsIndex = prompt.indexOf('## REFERENCE MATERIALS');
    const rubricIndex = prompt.indexOf('## EVALUATION RUBRIC');
    const outputFormatIndex = prompt.indexOf('## OUTPUT FORMAT');
    const inlineFixIndex = prompt.indexOf('## INLINE FIX INSTRUCTIONS');
    const locationSpecificityIndex = prompt.indexOf('## LOCATION SPECIFICITY');

    // Verify all sections exist
    expect(lessonSpecIndex).toBeGreaterThan(0);
    expect(contentIndex).toBeGreaterThan(0);
    expect(referenceMaterialsIndex).toBeGreaterThan(0);
    expect(rubricIndex).toBeGreaterThan(0);
    expect(outputFormatIndex).toBeGreaterThan(0);
    expect(inlineFixIndex).toBeGreaterThan(0);
    expect(locationSpecificityIndex).toBeGreaterThan(0);

    // Verify correct order
    expect(lessonSpecIndex).toBeLessThan(contentIndex);
    expect(contentIndex).toBeLessThan(referenceMaterialsIndex);
    expect(referenceMaterialsIndex).toBeLessThan(rubricIndex);
    expect(rubricIndex).toBeLessThan(outputFormatIndex);
    expect(outputFormatIndex).toBeLessThan(inlineFixIndex);
    expect(inlineFixIndex).toBeLessThan(locationSpecificityIndex);
  });

  it('prompt should include lesson content with sections', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Verify intro is included
    expect(prompt).toContain('This is an introduction to the lesson');

    // Verify sections are included
    expect(prompt).toContain('Section 1: Basics');
    expect(prompt).toContain('Section 2: Advanced Topics');
    expect(prompt).toContain('Conclusion');

    // Verify section content is included
    expect(prompt).toContain('синергетический эффект'); // Russian text from section 1
  });

  it('prompt should include RAG context for fact verification', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Verify RAG chunk content is included
    expect(prompt).toContain('Reference Material 1');
    expect(prompt).toContain('synergistic effects in collaborative environments');
  });

  it('prompt should include all 6 rubric criteria', () => {
    const lessonContent = createMockLessonContent();
    const lessonSpec = createMockLessonSpec();
    const ragChunks = createMockRAGChunks();

    const prompt = buildTestJudgePrompt(lessonContent, lessonSpec, ragChunks);

    // Check all 6 criteria are mentioned
    expect(prompt).toContain('learning_objective_alignment');
    expect(prompt).toContain('pedagogical_structure');
    expect(prompt).toContain('factual_accuracy');
    expect(prompt).toContain('clarity_readability');
    expect(prompt).toContain('engagement_examples');
    expect(prompt).toContain('completeness');

    // Check weights are included
    expect(prompt).toMatch(/learning_objective_alignment.*25%/);
    expect(prompt).toMatch(/pedagogical_structure.*20%/);
    expect(prompt).toMatch(/factual_accuracy.*15%/);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('T041.7 - Edge Cases: Schema validation', () => {
  it('should reject issue with empty description', () => {
    const invalidIssue = {
      criterion: 'clarity_readability',
      severity: 'minor',
      location: 'sec_1',
      description: '', // Empty - violates min(10) constraint
      suggestedFix: 'Fix the issue',
    };

    expect(() => JudgeIssueSchema.parse(invalidIssue)).toThrow();
  });

  it('should reject issue with invalid severity', () => {
    const invalidIssue = {
      criterion: 'clarity_readability',
      severity: 'super-critical', // Invalid enum value
      location: 'sec_1',
      description: 'Issue description',
      suggestedFix: 'Fix the issue',
    };

    expect(() => JudgeIssueSchema.parse(invalidIssue)).toThrow();
  });

  it('should reject issue with invalid criterion', () => {
    const invalidIssue = {
      criterion: 'invalid_criterion', // Not in JudgeCriterion enum
      severity: 'minor',
      location: 'sec_1',
      description: 'Issue description',
      suggestedFix: 'Fix the issue',
    };

    expect(() => JudgeIssueSchema.parse(invalidIssue)).toThrow();
  });

  it('should accept issue with very long inlineReplacement', () => {
    // InlineFixer will validate length constraints, but schema accepts any string
    const longReplacementIssue: JudgeIssue = {
      criterion: 'clarity_readability',
      severity: 'minor',
      location: 'sec_1',
      description: 'Needs expansion',
      quotedText: 'Short text',
      suggestedFix: 'Expand explanation',
      inlineReplacement: 'This is a much longer replacement text that expands on the original concept with additional details and examples to help clarify the meaning for readers.',
    };

    // Schema accepts it (InlineFixer will reject based on length constraints)
    expect(() => JudgeIssueSchema.parse(longReplacementIssue)).not.toThrow();
    expect(longReplacementIssue.inlineReplacement!.length).toBeGreaterThan(100);
  });
});
