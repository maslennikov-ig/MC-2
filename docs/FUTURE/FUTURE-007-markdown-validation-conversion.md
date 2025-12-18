# FUTURE-007: Post-Generation Markdown Validation & Conversion

**Created**: 2025-12-15
**Priority**: Medium
**Stage**: Stage 6 (Lesson Content Generation)
**Status**: Backlog

## Problem Statement

After LLM generates lesson content and it passes all quality checks (LLM Judge, sanity checks), there's still a risk that the generated content contains malformed or non-standard markdown that won't render correctly in the frontend.

**Examples of potential issues:**
- Unclosed code blocks (missing closing ```)
- Malformed tables (inconsistent column counts)
- Broken links syntax `[text](url` without closing parenthesis
- Mixed heading styles (ATX `#` vs Setext `===`)
- Invalid nested formatting
- Non-standard extensions that frontend doesn't support

## Proposed Solution

Add a **validation + normalization layer** after content generation that:

1. **Validates** markdown syntax and reports issues
2. **Normalizes** markdown to a consistent standard format
3. **Repairs** common malformed patterns where possible

### Library Candidates

| Library | Pros | Cons |
|---------|------|------|
| **remark** (unified) | Already in project, AST-based, extensible | Requires custom plugins |
| **markdown-it** | Fast, CommonMark compliant, good error handling | New dependency |
| **marked** | Fast, widely used | Less extensible |
| **micromark** | Low-level, very fast | More work to use |

**Recommendation**: Use **remark** since it's already in the project (017-markdown-renderer uses it). Can parse → validate → stringify back to normalized markdown.

### Implementation Sketch

```typescript
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';

interface MarkdownValidationResult {
  valid: boolean;
  normalized: string;
  issues: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

export async function validateAndNormalizeMarkdown(
  markdown: string
): Promise<MarkdownValidationResult> {
  const issues: MarkdownValidationResult['issues'] = [];

  try {
    const file = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      // Custom validation plugin here
      .use(remarkStringify, {
        bullet: '-',
        fence: '`',
        fences: true,
        incrementListMarker: true,
      })
      .process(markdown);

    return {
      valid: issues.length === 0,
      normalized: String(file),
      issues,
    };
  } catch (error) {
    return {
      valid: false,
      normalized: markdown, // Return original on parse failure
      issues: [{
        line: 0,
        column: 0,
        message: `Parse error: ${error.message}`,
        severity: 'error',
      }],
    };
  }
}
```

### Integration Point

```typescript
// In handler.ts, after sanity check, before save
if (result.success && result.lessonContent) {
  const markdown = extractContentMarkdown(result.lessonContent);

  // Existing sanity check
  const sanityResult = quickSanityCheck(markdown);

  // NEW: Markdown validation & normalization
  const mdResult = await validateAndNormalizeMarkdown(markdown);
  if (!mdResult.valid) {
    logger.warn({ issues: mdResult.issues }, 'Markdown validation issues (auto-fixed)');
  }
  // Use mdResult.normalized for storage

  await saveLessonContent(courseId, lessonLabel, result, sanityResult);
}
```

## Acceptance Criteria

- [ ] All generated content passes markdown validation
- [ ] Common syntax issues are auto-repaired
- [ ] Validation issues are logged for monitoring
- [ ] Normalized markdown renders correctly in frontend (017-markdown-renderer)
- [ ] No breaking changes to existing content

## Dependencies

- 017-markdown-renderer (uses same remark ecosystem)
- Stage 6 handler.ts (integration point)

## Notes

- This is a **post-generation** step, not a replacement for LLM Judge
- Should be non-blocking (like sanity check) - log issues but don't fail
- Consider caching validation results in metadata for analytics
- May want to add specific checks for our custom markdown extensions (callouts, etc.)

## Related

- `utils/sanity-check.ts` - Basic content sanity checks (implemented)
- `utils/markdown-parser.ts` - Existing markdown parsing utilities
- `specs/017-markdown-renderer/` - Frontend rendering specification
