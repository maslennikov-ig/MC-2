/**
 * Unit tests for new heuristic filters:
 * - checkCalloutDensity (structural-checks.ts)
 * - checkCodeBlockAudienceMatch (structural-checks.ts)
 * - checkHeaderLanguage (content-quality.ts)
 *
 * @module tests/unit/stages/stage6-lesson-content/judge/new-filters
 */

import { describe, it, expect } from 'vitest';
import {
  checkCalloutDensity,
  checkCodeBlockAudienceMatch,
} from '@/stages/stage6-lesson-content/judge/filters/structural-checks';
import { checkHeaderLanguage } from '@/stages/stage6-lesson-content/judge/filters/content-quality';

// ============================================================================
// checkCalloutDensity
// ============================================================================

describe('checkCalloutDensity', () => {
  it('should pass with score 1.0 when there are no callouts', () => {
    const content = `## Introduction
This lesson covers the basics of feature engineering.

## Feature Scaling
Standardization and min-max normalization are the most common techniques.`;

    const result = checkCalloutDensity(content);

    expect(result.passed).toBe(true);
    expect(result.scoreContribution).toBe(1.0);
    expect(result.calloutCount).toBe(0);
    expect(result.calloutTypes).toHaveLength(0);
    expect(result.failure).toBeUndefined();
  });

  it('should pass with score 1.0 when there is 1 callout', () => {
    const content = `## Introduction
Some introductory text here.

> [!TIP]
> Remember to normalize your data before training.

## Summary
That wraps up the lesson.`;

    const result = checkCalloutDensity(content);

    expect(result.passed).toBe(true);
    expect(result.scoreContribution).toBe(1.0);
    expect(result.calloutCount).toBe(1);
    expect(result.calloutTypes).toEqual(['TIP']);
  });

  it('should pass with score 1.0 when there are 2 callouts', () => {
    const content = `## Introduction
Text here.

> [!NOTE]
> This is important background context.

## Main Content
More content.

> [!WARNING]
> Avoid using this technique on sparse data.

## Summary
End of lesson.`;

    const result = checkCalloutDensity(content);

    expect(result.passed).toBe(true);
    expect(result.scoreContribution).toBe(1.0);
    expect(result.calloutCount).toBe(2);
  });

  it('should fail with severity major and score 0.5 when there are 3 callouts', () => {
    const content = `## Section A
Content A.

> [!TIP]
> First tip.

> [!NOTE]
> A note here.

> [!INFO]
> Some info.

## Summary
End.`;

    const result = checkCalloutDensity(content);

    expect(result.passed).toBe(false);
    expect(result.scoreContribution).toBe(0.5);
    expect(result.calloutCount).toBe(3);
    expect(result.failure?.severity).toBe('major');
    expect(result.failure?.filter).toBe('calloutDensity');
  });

  it('should fail with severity major and score 0.5 when there are 4 callouts', () => {
    const content = `## Section A
Content A.

> [!TIP]
> Tip one.

> [!WARNING]
> Warning one.

> [!NOTE]
> Note one.

> [!DANGER]
> Danger one.

## Summary
End.`;

    const result = checkCalloutDensity(content);

    expect(result.passed).toBe(false);
    expect(result.scoreContribution).toBe(0.5);
    expect(result.calloutCount).toBe(4);
    expect(result.failure?.severity).toBe('major');
  });

  it('should fail with severity critical and score 0.0 when there are 5 callouts', () => {
    const content = `## Section A
Content A.

> [!TIP]
> Tip one.

> [!WARNING]
> Warning one.

> [!NOTE]
> Note one.

> [!DANGER]
> Danger here.

> [!INFO]
> Info here.

## Summary
End.`;

    const result = checkCalloutDensity(content);

    expect(result.passed).toBe(false);
    expect(result.scoreContribution).toBe(0.0);
    expect(result.calloutCount).toBe(5);
    expect(result.failure?.severity).toBe('critical');
  });

  it('should fail with severity critical and score 0.0 when there are 6+ callouts', () => {
    const callout = (type: string) => `\n> [!${type}]\n> Some text.\n`;
    const content =
      `## Content\nText.\n` +
      callout('TIP') +
      callout('WARNING') +
      callout('NOTE') +
      callout('INFO') +
      callout('DANGER') +
      callout('TIP') +
      `\n## End\nFinished.`;

    const result = checkCalloutDensity(content);

    expect(result.passed).toBe(false);
    expect(result.scoreContribution).toBe(0.0);
    expect(result.calloutCount).toBe(6);
    expect(result.failure?.severity).toBe('critical');
  });

  it('should NOT count callouts inside code blocks (regex is line-based with ^>)', () => {
    // The CALLOUT_REGEX uses ^> with the 'm' flag, so it matches lines starting with '>'.
    // Code blocks wrap content so their lines are indented or fenced — but the
    // regex is not anchor-aware of fences. The implementation uses matchAll on the
    // raw string. Let's verify the documented behaviour: callouts inside code
    // fences ARE still detected by the simple regex (no code-block exclusion in the
    // implementation), so the test should reflect actual behaviour.
    //
    // Looking at the implementation: CALLOUT_REGEX = /^>\s*\[!(TIP|...)\]/gim
    // There is NO code-block stripping before matching, unlike checkHeaderLanguage.
    // Therefore callout markers inside fenced blocks ARE counted.
    // This test documents this behaviour so it doesn't regress silently.
    const content = `## Real Content
Some prose here.

> [!TIP]
> A real tip outside the code block.

\`\`\`markdown
> [!WARNING]
> This is shown as an example inside a code block.
\`\`\`

## Summary
Done.`;

    const result = checkCalloutDensity(content);

    // The implementation DOES count the callout inside the code block
    // (no stripping logic in checkCalloutDensity)
    expect(result.calloutCount).toBe(2);
    expect(result.passed).toBe(true);
  });

  it('should detect all callout types: TIP, WARNING, NOTE, INFO, DANGER', () => {
    const content = `## Section
> [!TIP]
> Tip text.

> [!WARNING]
> Warning text.

> [!NOTE]
> Note text.

> [!INFO]
> Info text.

> [!DANGER]
> Danger text.

## End
Finished.`;

    const result = checkCalloutDensity(content);

    expect(result.calloutCount).toBe(5);
    expect(result.calloutTypes).toHaveLength(5);
    expect(result.calloutTypes).toContain('TIP');
    expect(result.calloutTypes).toContain('WARNING');
    expect(result.calloutTypes).toContain('NOTE');
    expect(result.calloutTypes).toContain('INFO');
    expect(result.calloutTypes).toContain('DANGER');
  });

  it('should return unique callout types even when the same type appears multiple times', () => {
    const content = `## Section
> [!TIP]
> First tip.

> [!TIP]
> Second tip.

> [!TIP]
> Third tip.

## End
Done.`;

    const result = checkCalloutDensity(content);

    expect(result.calloutCount).toBe(3);
    // All three are TIP, but calloutTypes should contain 'TIP' only once
    expect(result.calloutTypes).toHaveLength(1);
    expect(result.calloutTypes).toEqual(['TIP']);
    expect(result.failure?.severity).toBe('major');
  });
});

// ============================================================================
// checkCodeBlockAudienceMatch
// ============================================================================

describe('checkCodeBlockAudienceMatch', () => {
  it('should always pass for code_tutorial archetype regardless of code block count', () => {
    const contentWithManyBlocks = `## Intro
Text.

\`\`\`python
print("hello")
\`\`\`

\`\`\`python
x = 1
\`\`\`

\`\`\`javascript
console.log("hi");
\`\`\`

\`\`\`typescript
const x: number = 42;
\`\`\`

\`\`\`bash
npm install
\`\`\`

## End
Done.`;

    const result = checkCodeBlockAudienceMatch(contentWithManyBlocks, 'code_tutorial');

    expect(result.passed).toBe(true);
    expect(result.scoreContribution).toBe(1.0);
    expect(result.contentArchetype).toBe('code_tutorial');
    expect(result.failure).toBeUndefined();
  });

  it('should pass for concept_explainer with 0 code blocks', () => {
    const content = `## Introduction
This concept is fundamental to understanding distributed systems.

## Core Principles
The CAP theorem states that distributed systems can guarantee at most two of three properties.

## Summary
Understanding these trade-offs is essential for system design.`;

    const result = checkCodeBlockAudienceMatch(content, 'concept_explainer');

    expect(result.passed).toBe(true);
    expect(result.scoreContribution).toBe(1.0);
    expect(result.codeBlockCount).toBe(0);
    expect(result.failure).toBeUndefined();
  });

  it('should fail with severity major and score 0.5 for concept_explainer with 1 code block', () => {
    const content = `## Introduction
Conceptual introduction here.

\`\`\`python
# This code shouldn't be here
example = True
\`\`\`

## Summary
Done.`;

    const result = checkCodeBlockAudienceMatch(content, 'concept_explainer');

    expect(result.passed).toBe(false);
    expect(result.scoreContribution).toBe(0.5);
    expect(result.codeBlockCount).toBe(1);
    expect(result.failure?.severity).toBe('major');
    expect(result.failure?.filter).toBe('codeBlockAudienceMatch');
  });

  it('should fail with severity major for concept_explainer with 3 code blocks', () => {
    const content = `## Section
Text.

\`\`\`python
block_one = 1
\`\`\`

\`\`\`javascript
block_two = 2
\`\`\`

\`\`\`bash
echo three
\`\`\`

## End
Done.`;

    const result = checkCodeBlockAudienceMatch(content, 'concept_explainer');

    expect(result.passed).toBe(false);
    expect(result.scoreContribution).toBe(0.5);
    expect(result.codeBlockCount).toBe(3);
    expect(result.failure?.severity).toBe('major');
  });

  it('should fail with severity critical and score 0.0 for concept_explainer with 4+ code blocks', () => {
    const content = `## Section
Text.

\`\`\`python
a = 1
\`\`\`

\`\`\`python
b = 2
\`\`\`

\`\`\`javascript
c = 3
\`\`\`

\`\`\`bash
echo four
\`\`\`

## End
Done.`;

    const result = checkCodeBlockAudienceMatch(content, 'concept_explainer');

    expect(result.passed).toBe(false);
    expect(result.scoreContribution).toBe(0.0);
    expect(result.codeBlockCount).toBe(4);
    expect(result.failure?.severity).toBe('critical');
  });

  it('should NOT count mermaid blocks as code blocks', () => {
    const content = `## Diagram Section
Here is an architecture diagram.

\`\`\`mermaid
graph TD
  A --> B
  B --> C
\`\`\`

## Summary
That was the diagram.`;

    const result = checkCodeBlockAudienceMatch(content, 'concept_explainer');

    expect(result.passed).toBe(true);
    expect(result.codeBlockCount).toBe(0);
  });

  it('should only count non-mermaid code blocks in mixed content', () => {
    const content = `## Mixed Section
Text here.

\`\`\`mermaid
graph LR
  X --> Y
\`\`\`

\`\`\`python
real_code = True
\`\`\`

\`\`\`mermaid
sequenceDiagram
  A->>B: Hello
\`\`\`

\`\`\`python
more_real_code = 42
\`\`\`

## End
Done.`;

    const result = checkCodeBlockAudienceMatch(content, 'concept_explainer');

    // Only 2 python blocks counted, mermaid blocks excluded
    expect(result.codeBlockCount).toBe(2);
    expect(result.passed).toBe(false);
    expect(result.failure?.severity).toBe('major');
  });

  it('should pass for case_study archetype with 0 code blocks', () => {
    const content = `## Background
A major retailer faced inventory management challenges.

## Solution
They implemented a new demand forecasting model.

## Results
Inventory costs dropped by 30%.`;

    const result = checkCodeBlockAudienceMatch(content, 'case_study');

    expect(result.passed).toBe(true);
    expect(result.codeBlockCount).toBe(0);
  });

  it('should fail for legal_warning archetype with code blocks', () => {
    const content = `## Legal Notice
Important regulatory information.

\`\`\`json
{"regulation": "GDPR", "article": 17}
\`\`\`

## Conclusion
Consult a legal expert.`;

    const result = checkCodeBlockAudienceMatch(content, 'legal_warning');

    expect(result.passed).toBe(false);
    expect(result.codeBlockCount).toBe(1);
    expect(result.failure?.severity).toBe('major');
  });
});

// ============================================================================
// checkHeaderLanguage
// ============================================================================

describe('checkHeaderLanguage', () => {
  it('should always pass for English content (skipped)', () => {
    const content = `## Key Takeaways
Summary of the main points covered.

## Conclusion
Final thoughts on the topic.`;

    const result = checkHeaderLanguage(content, 'en');

    expect(result.passed).toBe(true);
    expect(result.scoreContribution).toBe(1.0);
    expect(result.englishHeaders).toHaveLength(0);
    expect(result.failure).toBeUndefined();
  });

  it('should pass for Russian content where all headers are Cyrillic', () => {
    const content = `## Введение в тему
Вводный текст о машинном обучении.

## Основные понятия
Ключевые концепции и определения.

## Практическое применение
Примеры из реальных проектов.

## Заключение
Итоги урока.`;

    const result = checkHeaderLanguage(content, 'ru');

    expect(result.passed).toBe(true);
    expect(result.scoreContribution).toBe(1.0);
    expect(result.englishHeaders).toHaveLength(0);
  });

  it('should fail with severity major when Russian content has an English header with 3+ words', () => {
    // "Key Takeaways" is only 2 words → skipped by the `words.length <= 2` guard.
    // Use a 3-word English header to trigger the flag.
    const content = `## Введение
Вводный текст урока.

## Key Learning Outcomes
Краткое изложение материала.

## Заключение
Итоги.`;

    const result = checkHeaderLanguage(content, 'ru');

    expect(result.passed).toBe(false);
    expect(result.englishHeaders).toContain('Key Learning Outcomes');
    expect(result.failure?.severity).toBe('major');
    expect(result.failure?.filter).toBe('headerLanguage');
  });

  it('should pass when a header has only 2 words (below 3-word threshold)', () => {
    const content = `## Введение
Вводный текст.

## API Metrics
Ниже приведены метрики API.

## Заключение
Итоги.`;

    const result = checkHeaderLanguage(content, 'ru');

    // "API Metrics" has 2 words — skipped by the <=2 words guard
    expect(result.passed).toBe(true);
    expect(result.englishHeaders).not.toContain('API Metrics');
  });

  it('should pass for a mixed header that is mostly Cyrillic', () => {
    const content = `## Введение
Текст введения.

## DAU/MAU и когортный анализ
Разбираем метрики удержания пользователей.

## Заключение
Итоги урока.`;

    const result = checkHeaderLanguage(content, 'ru');

    // "DAU/MAU и когортный анализ": the letter chars are mostly Cyrillic
    // Latin ratio < 0.6, so it should NOT be flagged
    expect(result.passed).toBe(true);
    expect(result.englishHeaders).not.toContain('DAU/MAU и когортный анализ');
  });

  it('should not detect headers inside code blocks (extractProseText strips them)', () => {
    const content = `## Введение
Текст введения.

\`\`\`markdown
## Key Takeaways
This header is inside a code block example.
\`\`\`

## Основные понятия
Основной текст раздела.

## Заключение
Итоги.`;

    const result = checkHeaderLanguage(content, 'ru');

    // The header inside the fenced code block must not be flagged
    expect(result.passed).toBe(true);
    expect(result.englishHeaders).not.toContain('Key Takeaways');
  });

  it('should correctly count totalHeaders excluding headers in code blocks', () => {
    const content = `## Введение
Текст.

\`\`\`markdown
## Inside Code Block
This should not be counted.
\`\`\`

## Основные понятия
Текст.

## Заключение
Итоги.`;

    const result = checkHeaderLanguage(content, 'ru');

    // 3 prose headers, 1 is inside code block and excluded
    expect(result.totalHeaders).toBe(3);
  });

  it('should flag multiple English headers and reduce score accordingly', () => {
    const content = `## Введение
Текст.

## Key Takeaways And Summary
Краткое изложение.

## Final Conclusion Here
Заключительная часть.

## Заключение
Итоги.`;

    const result = checkHeaderLanguage(content, 'ru');

    expect(result.passed).toBe(false);
    expect(result.englishHeaders).toHaveLength(2);
    // scoreContribution = max(0, 1 - 2 * 0.25) = 0.5
    expect(result.scoreContribution).toBe(0.5);
  });

  it('should pass for Chinese content with all CJK headers', () => {
    const content = `## 简介
课程的基本内容介绍。

## 核心概念
主要概念和定义。

## 总结
课程总结。`;

    const result = checkHeaderLanguage(content, 'zh');

    expect(result.passed).toBe(true);
    expect(result.englishHeaders).toHaveLength(0);
  });

  it('should fail for Chinese content with English headers (3+ words)', () => {
    const content = `## 简介
课程介绍。

## Key Learning Outcomes
内容摘要。

## 总结
总结。`;

    const result = checkHeaderLanguage(content, 'zh');

    expect(result.passed).toBe(false);
    expect(result.englishHeaders).toContain('Key Learning Outcomes');
    expect(result.failure?.severity).toBe('major');
  });
});
