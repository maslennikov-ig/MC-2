# Stage 6 Fixes - Test Specification

**Created**: 2026-01-08
**Related Plan**: `2026-01-stage6-fixes-plan.md`
**Test Type**: E2E Integration Tests + Unit Tests

## Overview

This document specifies tests for the Stage 6 fixes implemented in January 2026:

1. **P0**: DOMPurify fix for Mermaid diagrams
2. **P1**: InlineFixer zero-token surgical fixes
3. **P1**: sec_global smart routing strategy
4. **P2**: Card warning downgrade

---

## 1. DOMPurify Fix Tests

**File**: `tests/stages/stage6-lesson-content/utils/mermaid-dom-setup.test.ts`

### 1.1 Unit Tests

```typescript
describe('MermaidDOMSetup', () => {
  describe('DOMPurify.addHook compatibility', () => {
    it('should not throw "DOMPurify.addHook is not a function" error', async () => {
      // Setup: Import mermaid after DOM setup
      // Act: Call mermaid.render() with content containing hooks
      // Assert: No error thrown, diagram rendered
    });

    it('should sanitize SVG output correctly', async () => {
      // Setup: Create diagram with potentially unsafe elements
      // Act: Render diagram
      // Assert: SVG output is sanitized, no XSS vectors
    });

    it('should handle multiple render calls without error', async () => {
      // Act: Call render() 5 times in sequence
      // Assert: All renders succeed without DOMPurify errors
    });
  });
});
```

### 1.2 Integration Test

```typescript
describe('Stage 6 Mermaid Rendering E2E', () => {
  it('should successfully render lesson content with mermaid diagrams', async () => {
    // Setup: Create lesson with mermaid code block
    // Act: Run Stage 6 generation
    // Assert: Content generated without DOMPurify errors in logs
  });
});
```

---

## 2. InlineFixer Tests

**File**: `tests/stages/stage6-lesson-content/judge/inline-fixer/index.test.ts`

### 2.1 Eligibility Tests

```typescript
describe('InlineFixer - Eligibility', () => {
  describe('isEligibleForInlineFix', () => {
    it('should return true for issue with quotedText and inlineReplacement', () => {
      const issue: TargetedIssue = {
        id: 'test-1',
        criterion: 'clarity_readability',
        severity: 'minor',
        location: 'sec_2',
        description: 'Jargon confuses readers',
        quotedText: 'синергетический эффект',
        suggestedFix: 'Simplify terminology',
        inlineReplacement: 'совместный эффект',
        targetSectionId: 'sec_2',
        fixAction: 'SURGICAL_EDIT',
        contextWindow: { scope: 'paragraph' },
        fixInstructions: 'Replace jargon',
      };

      expect(isEligibleForInlineFix(issue)).toBe(true);
    });

    it('should return false when missing inlineReplacement', () => {
      const issue = createIssue({ inlineReplacement: undefined });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false when missing quotedText', () => {
      const issue = createIssue({ quotedText: undefined });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false for blacklisted criteria (pedagogical_structure)', () => {
      const issue = createIssue({ criterion: 'pedagogical_structure' });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false for blacklisted criteria (engagement_examples)', () => {
      const issue = createIssue({ criterion: 'engagement_examples' });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false when replacement is >2x original length', () => {
      const issue = createIssue({
        quotedText: 'short',
        inlineReplacement: 'this is a much much longer replacement text',
      });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false when replacement is <50% original length', () => {
      const issue = createIssue({
        quotedText: 'this is a long original text that will be replaced',
        inlineReplacement: 'tiny',
      });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false when replacement exceeds 300 chars', () => {
      const issue = createIssue({
        quotedText: 'a'.repeat(250),
        inlineReplacement: 'b'.repeat(350),
      });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });
  });
});
```

### 2.2 Cascade Search Tests

```typescript
describe('InlineFixer - Cascade Search', () => {
  describe('applyInlineFix', () => {
    it('should find and replace exact text match', () => {
      const content = 'The синергетический эффект was studied.';
      const issue = createIssue({
        quotedText: 'синергетический эффект',
        inlineReplacement: 'совместный эффект',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(true);
      expect(result.content).toBe('The совместный эффект was studied.');
    });

    it('should handle flexible whitespace matching', () => {
      const content = 'The  text   with   extra    spaces  here.';
      const issue = createIssue({
        quotedText: 'text with extra spaces',
        inlineReplacement: 'normalized text',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(true);
      expect(result.content).toContain('normalized text');
    });

    it('should fail when text not found', () => {
      const content = 'Some completely different content.';
      const issue = createIssue({
        quotedText: 'nonexistent text',
        inlineReplacement: 'replacement',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('text_not_found');
    });

    it('should fail when multiple occurrences found', () => {
      const content = 'The word appears here. The word appears again.';
      const issue = createIssue({
        quotedText: 'word appears',
        inlineReplacement: 'term shows',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('multiple_occurrences');
    });

    it('should rollback when markdown integrity is broken', () => {
      const content = 'Text with **bold** formatting.';
      const issue = createIssue({
        quotedText: '**bold**',
        inlineReplacement: '**broken', // Missing closing **
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('markdown_broken');
      expect(result.content).toBe(content); // Original preserved
    });
  });
});
```

### 2.3 Batch Processing Tests

```typescript
describe('InlineFixer - Batch Processing', () => {
  describe('processInlineFixes', () => {
    it('should apply multiple inline fixes in sequence', () => {
      const content = 'First typo here. Second typo there.';
      const issues = [
        createIssue({
          id: '1',
          quotedText: 'First typo',
          inlineReplacement: 'First correction',
        }),
        createIssue({
          id: '2',
          quotedText: 'Second typo',
          inlineReplacement: 'Second correction',
        }),
      ];

      const result = processInlineFixes(content, issues);

      expect(result.appliedFixes).toHaveLength(2);
      expect(result.failedFixes).toHaveLength(0);
      expect(result.content).toBe('First correction here. Second correction there.');
      expect(result.metrics.tokensSaved).toBe(3000); // 2 * 1500
    });

    it('should return failed fixes for ineligible issues', () => {
      const content = 'Some content here.';
      const issues = [
        createIssue({
          id: '1',
          quotedText: 'Some content',
          inlineReplacement: 'Fixed content',
        }),
        createIssue({
          id: '2',
          criterion: 'pedagogical_structure', // Blacklisted
          quotedText: 'here',
          inlineReplacement: 'there',
        }),
      ];

      const result = processInlineFixes(content, issues);

      expect(result.appliedFixes).toHaveLength(1);
      expect(result.failedFixes).toHaveLength(1);
      expect(result.failedFixes[0].id).toBe('2');
    });

    it('should calculate correct token savings metrics', () => {
      const content = 'Text A and text B and text C.';
      const issues = [
        createIssue({ id: '1', quotedText: 'Text A', inlineReplacement: 'Item 1' }),
        createIssue({ id: '2', quotedText: 'text B', inlineReplacement: 'item 2' }),
        createIssue({ id: '3', quotedText: 'nonexistent', inlineReplacement: 'x' }),
      ];

      const result = processInlineFixes(content, issues);

      expect(result.metrics.attempted).toBe(3);
      expect(result.metrics.succeeded).toBe(2);
      expect(result.metrics.failed).toBe(1);
      expect(result.metrics.tokensSaved).toBe(3000);
    });
  });
});
```

### 2.4 Integration with Refinement Loop

```typescript
describe('InlineFixer - Task Executor Integration', () => {
  it('should skip Patcher when all issues fixed by InlineFixer', async () => {
    // Setup: Create task with single inline-fixable issue
    // Mock: LLM call spy
    // Act: Call executePatcherTask
    // Assert: LLM was NOT called, content was fixed
  });

  it('should call Patcher for remaining issues after InlineFixer', async () => {
    // Setup: Create task with mixed issues
    // Mock: LLM call that returns fixed content
    // Act: Call executePatcherTask
    // Assert: InlineFixer applied first, Patcher called for rest
  });

  it('should respect FEATURE_INLINE_FIXER=false flag', async () => {
    // Setup: Set env var FEATURE_INLINE_FIXER=false
    // Act: Call executePatcherTask with inline-fixable issue
    // Assert: Patcher called directly, InlineFixer skipped
  });
});
```

---

## 3. sec_global Handling Tests

**File**: `tests/stages/stage6-lesson-content/judge/arbiter/sec-global-handling.test.ts`

### 3.1 Issue Processing Tests

```typescript
describe('sec_global Handling', () => {
  describe('processGlobalIssues', () => {
    it('should identify global issues from location', () => {
      const issues = [
        createIssue({ location: 'sec_global' }),
        createIssue({ location: 'sec_1' }),
        createIssue({ location: 'Global issue affecting all sections' }),
      ];

      const result = processGlobalIssues(issues);

      expect(result.toTrack).toHaveLength(2);
      expect(result.toRedirect.length + result.toSkip.length).toBe(2);
    });

    it('should redirect major global issues to intro', () => {
      const issues = [createIssue({ location: 'sec_global', severity: 'major' })];

      const result = processGlobalIssues(issues);

      expect(result.toRedirect).toHaveLength(1);
      expect(result.toSkip).toHaveLength(0);
    });

    it('should redirect critical global issues to intro AND conclusion', () => {
      const issues = [createIssue({ location: 'sec_global', severity: 'critical' })];

      const redirected = redirectGlobalToSections(issues);

      expect(redirected).toHaveLength(2);
      expect(redirected.map(i => i.location)).toContain('sec_introduction');
      expect(redirected.map(i => i.location)).toContain('sec_conclusion');
    });

    it('should skip minor global issues', () => {
      const issues = [createIssue({ location: 'sec_global', severity: 'minor' })];

      const result = processGlobalIssues(issues);

      expect(result.toSkip).toHaveLength(1);
      expect(result.toRedirect).toHaveLength(0);
    });
  });
});
```

### 3.2 Arbiter Integration Tests

```typescript
describe('consolidateVerdicts - sec_global', () => {
  it('should exclude minor sec_global issues from tasks', async () => {
    const input = createArbiterInput({
      issues: [
        createIssue({ location: 'sec_1' }),
        createIssue({ location: 'sec_global', severity: 'minor' }),
      ],
    });

    const result = await consolidateVerdicts(input);

    // sec_global minor should NOT create a task
    expect(result.plan.tasks.every(t => t.sectionId !== 'sec_global')).toBe(true);
  });

  it('should create intro task for major sec_global issues', async () => {
    const input = createArbiterInput({
      issues: [createIssue({ location: 'sec_global', severity: 'major' })],
    });

    const result = await consolidateVerdicts(input);

    expect(result.plan.tasks.some(t => t.sectionId === 'sec_introduction')).toBe(true);
  });

  it('should create intro+conclusion tasks for critical sec_global issues', async () => {
    const input = createArbiterInput({
      issues: [createIssue({ location: 'sec_global', severity: 'critical' })],
    });

    const result = await consolidateVerdicts(input);

    const taskSections = result.plan.tasks.map(t => t.sectionId);
    expect(taskSections).toContain('sec_introduction');
    expect(taskSections).toContain('sec_conclusion');
  });
});
```

### 3.3 Database Tracking Tests

```typescript
describe('lesson_improvement_suggestions table', () => {
  it('should allow inserting global issue records', async () => {
    const suggestion = {
      lesson_id: testLessonId,
      criterion: 'engagement_examples',
      severity: 'minor',
      location: 'sec_global',
      description: 'Lack of engagement throughout',
      suggested_fix: 'Add more examples',
      status: 'pending',
      source: 'stage6_refinement',
    };

    // Insert should succeed
    const { data, error } = await supabase
      .from('lesson_improvement_suggestions')
      .insert(suggestion)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data.id).toBeDefined();
    expect(data.status).toBe('pending');
  });

  it('should cascade delete on lesson deletion', async () => {
    // Create lesson + suggestion
    // Delete lesson
    // Verify suggestion is also deleted
  });
});
```

---

## 4. Judge Prompt Tests

**File**: `tests/stages/stage6-lesson-content/judge/prompt-validation.test.ts`

### 4.1 Output Schema Validation

```typescript
describe('Judge Prompt - Output Schema', () => {
  it('should accept valid response with inlineReplacement', () => {
    const response = {
      overallScore: 0.75,
      passed: false,
      confidence: 'high',
      criteriaScores: {
        /* ... */
      },
      issues: [
        {
          criterion: 'clarity_readability',
          severity: 'minor',
          location: 'sec_2',
          description: 'Jargon confuses readers',
          quotedText: 'синергетический эффект',
          suggestedFix: 'Simplify',
          inlineReplacement: 'совместный эффект',
        },
      ],
      strengths: ['Good structure'],
    };

    expect(() => JudgeResponseSchema.parse(response)).not.toThrow();
  });

  it('should accept response without optional fields', () => {
    const response = {
      /* ... minimal valid response without quotedText/inlineReplacement */
    };

    expect(() => JudgeResponseSchema.parse(response)).not.toThrow();
  });
});
```

### 4.2 Location Specificity

```typescript
describe('Judge Prompt - Location Specificity', () => {
  // These are prompt engineering tests - validate prompt instructions
  it('prompt should discourage sec_global usage', () => {
    const prompt = buildJudgePrompt(testInput, DEFAULT_OSCQR_RUBRIC);

    expect(prompt).toContain('AVOID using "sec_global"');
    expect(prompt).toContain('specific sections, name them');
  });

  it('prompt should include inline fix instructions', () => {
    const prompt = buildJudgePrompt(testInput, DEFAULT_OSCQR_RUBRIC);

    expect(prompt).toContain('INLINE FIX INSTRUCTIONS');
    expect(prompt).toContain('quotedText');
    expect(prompt).toContain('inlineReplacement');
  });
});
```

---

## 5. End-to-End Integration Tests

**File**: `tests/e2e/stage6-refinement-loop.e2e.test.ts`

### 5.1 Full Refinement Flow

```typescript
describe('Stage 6 Refinement E2E', () => {
  it('should complete refinement with InlineFixer optimization', async () => {
    // Setup: Create course with lesson content that has minor issues
    // Act: Run Stage 6 with refinement
    // Assert:
    //   - InlineFixer metrics show token savings
    //   - Content quality score improved
    //   - No DOMPurify errors in logs
  }, 60000);

  it('should handle sec_global issues correctly', async () => {
    // Setup: Mock judge to return sec_global issues
    // Act: Run refinement
    // Assert:
    //   - Minor sec_global: tracked, no tokens spent
    //   - Major sec_global: redirected to intro
    //   - Critical sec_global: redirected to intro + conclusion
  });

  it('should handle lessons with mermaid diagrams', async () => {
    // Setup: Create lesson spec requesting diagrams
    // Act: Run full Stage 6
    // Assert: Diagrams rendered without errors
  });
});
```

### 5.2 Regression Tests

```typescript
describe('Stage 6 Regression Tests', () => {
  it('should not throw DOMPurify.addHook error (regression)', async () => {
    // This was the original bug - ensure it stays fixed
  });

  it('should not spam warning logs for card enrichments (regression)', async () => {
    // Card warning was downgraded to debug
    const logSpy = vi.spyOn(logger, 'warn');
    // Run card enrichment
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('legacy detection')
    );
  });
});
```

---

## Test Data Fixtures

### Issue Factory

```typescript
// tests/fixtures/judge-fixtures.ts

export function createIssue(overrides: Partial<TargetedIssue> = {}): TargetedIssue {
  return {
    id: randomUUID(),
    criterion: 'clarity_readability',
    severity: 'minor',
    location: 'sec_1',
    description: 'Test issue description',
    suggestedFix: 'Test suggested fix',
    targetSectionId: 'sec_1',
    fixAction: 'SURGICAL_EDIT',
    contextWindow: { scope: 'paragraph' },
    fixInstructions: 'Test instructions',
    ...overrides,
  };
}

export function createLessonContent(sections: number = 3): LessonContent {
  return {
    lesson_id: randomUUID(),
    content: {
      intro: 'Lesson introduction content.',
      sections: Array.from({ length: sections }, (_, i) => ({
        title: `Section ${i + 1}`,
        content: `Content for section ${i + 1}.`,
      })),
      examples: [{ title: 'Example 1', content: 'Example content' }],
      exercises: [{ question: 'Exercise 1?', answer: 'Answer 1' }],
    },
    updated_at: new Date(),
  };
}
```

---

## Running Tests

```bash
# All Stage 6 tests
pnpm --filter @megacampus/course-gen-platform test -- tests/stages/stage6-lesson-content/

# InlineFixer only
pnpm --filter @megacampus/course-gen-platform test -- tests/stages/stage6-lesson-content/judge/inline-fixer/

# E2E tests
pnpm --filter @megacampus/course-gen-platform test -- tests/e2e/stage6-refinement-loop.e2e.test.ts

# With coverage
pnpm --filter @megacampus/course-gen-platform test:coverage
```

---

## Coverage Requirements

| Module              | Line Coverage | Branch Coverage |
| ------------------- | ------------- | --------------- |
| InlineFixer         | ≥90%          | ≥85%            |
| sec_global handling | ≥85%          | ≥80%            |
| MermaidDOMSetup     | ≥80%          | ≥75%            |

---

## Notes

1. **Mock Strategy**: Use `vi.mock()` for LLM calls to avoid actual API costs during tests
2. **Database Tests**: Use Supabase test project or in-memory mock
3. **Timeout**: E2E tests may need longer timeouts (60s+)
4. **Parallelization**: Unit tests can run in parallel; E2E tests should be sequential
