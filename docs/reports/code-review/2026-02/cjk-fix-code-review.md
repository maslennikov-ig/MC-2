---
report_type: code-review
generated: 2026-02-17T09:15:00Z
version: 2026-02-17
status: partial
agent: code-reviewer
duration: ~12 minutes
files_reviewed: 8
issues_found: 18
critical_count: 2
high_count: 5
medium_count: 8
low_count: 3
---

# Code Review Report: CJK Auto-Fix & Typo Detection Implementation

**Generated**: 2026-02-17T09:15:00Z
**Status**: ⚠️ PARTIAL (High-priority issues require attention)
**Version**: 2026-02-17
**Agent**: code-reviewer
**Duration**: ~12 minutes
**Files Reviewed**: 8

---

## Executive Summary

Comprehensive code review completed for CJK auto-fix and typo detection implementation in Stage 6 self-reviewer. The implementation introduces a sophisticated 3-layer approach for handling foreign character leaks, with LLM-based intelligent translation backed by programmatic safety nets.

### Key Metrics

- **Files Reviewed**: 8
- **Lines Changed**: Estimated ~500+ additions across multiple files
- **Issues Found**: 18 total
  - Critical: 2
  - High: 5
  - Medium: 8
  - Low: 3
- **Validation Status**: ✅ PASSED (type-check + build successful)
- **Test Coverage**: ⚠️ Tests exist but gaps identified

### Highlights

- ✅ Solid architectural approach with 3-layer defense (heuristic detection → LLM translation → programmatic strip)
- ⚠️ Critical regex bugs in fragment extraction can cause infinite loops
- ⚠️ Missing edge case handling for boundary conditions and XSS risks
- ✅ Good separation of concerns across multiple modules
- ⚠️ Test coverage gaps for new functionality

---

## Detailed Findings

### Critical Issues (2)

#### 1. Infinite Loop Risk in Fragment Extraction

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts:157-197`
- **Category**: Security / Performance
- **Description**: Infinite loop vulnerability in `extractForeignCharFragments` due to regex with `/g` flag in while loop
- **Impact**: Can freeze the Stage 6 pipeline, cause worker timeouts, and DOS the course generation system
- **Recommendation**: Remove `/g` flag from `FOREIGN_SCRIPT_PATTERNS` or use `match()` instead of `exec()` in while loop

**Current code (problematic)**:

```typescript
// Line 21-27: Pattern definition (correct - no /g flag)
const FOREIGN_SCRIPT_PATTERNS: Record<string, RegExp> = {
  CJK: /[\u4E00-\u9FFF\u3400-\u4DBF]/,
  // ...
};

// Line 170-174: BUG - creates new regex with /g flag
const globalPattern = new RegExp(pattern.source, 'g');
let match: RegExpExecArray | null;

while ((match = globalPattern.exec(proseContent)) !== null) {
  // If globalPattern.lastIndex doesn't advance, infinite loop occurs
```

**Recommended fix**:

```typescript
// Option 1: Use matchAll() instead of exec() loop
const matches = proseContent.matchAll(new RegExp(pattern.source, 'g'));
for (const match of matches) {
  const charIndex = match.index!;
  // ... rest of logic
}

// Option 2: Use match() and iterate over results
const allMatches = proseContent.match(new RegExp(pattern.source, 'g')) || [];
for (const foreignChars of allMatches) {
  const charIndex = proseContent.indexOf(foreignChars);
  // ... rest of logic (need to track offsets to avoid duplicates)
}
```

**Why this is critical**: The comment on line 18 explicitly warns about `/g` flag issues with `test()`, but the implementation creates a new `/g` regex in `exec()` loop, which has the same `lastIndex` retention problem.

---

#### 2. XSS Risk in Sanitization Function

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/self-reviewer/self-reviewer-prompt.ts:40-56`
- **Category**: Security
- **Description**: `sanitizeForPrompt` escapes XML but doesn't handle all XSS vectors in markdown context
- **Impact**: If generated content contains malicious payloads like `<script>alert(1)</script>` or HTML event handlers, they might survive sanitization and reach the LLM prompt
- **Recommendation**: Add HTML tag stripping or use a proven XSS sanitization library

**Current code**:

```typescript
function sanitizeForPrompt(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\]\]>/g, ']]&gt;')
    .replace(/<!\[CDATA\[/gi, '&lt;![CDATA[')
    .replace(/\n{4,}/g, '\n\n\n');
}
```

**Issues**:

1. Escapes `<` and `>`, which prevents HTML tags BUT doesn't strip them
2. Markdown can contain inline HTML that becomes XML in prompt
3. No protection against markdown-based XSS like `[click](javascript:alert(1))`
4. Unicode normalization attacks not addressed (e.g., `＜script＞` - fullwidth chars)

**Recommended fix**:

```typescript
import { sanitize } from 'isomorphic-dompurify'; // or similar library

function sanitizeForPrompt(text: string): string {
  if (!text) return '';

  // Step 1: Normalize Unicode (prevent fullwidth char bypasses)
  const normalized = text.normalize('NFKC');

  // Step 2: Strip HTML tags (keep markdown syntax)
  const withoutHtml = sanitize(normalized, {
    ALLOWED_TAGS: [], // No HTML tags allowed
    KEEP_CONTENT: true, // Keep text content
  });

  // Step 3: Escape XML special chars
  return withoutHtml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\]\]>/g, ']]&gt;')
    .replace(/<!\[CDATA\[/gi, '&lt;![CDATA[')
    .replace(/\n{4,}/g, '\n\n\n');
}
```

**Note**: This is marked critical because malicious content could:

- Exploit LLM prompt injection vulnerabilities
- Leak information if LLM echoes back unsanitized content
- Cause downstream XSS if content is displayed in admin UI

---

### High Priority Issues (5)

#### 3. Missing Test Coverage for Fragment Extraction

- **File**: `tests/stages/stage6-lesson-content/judge/heuristic-filter-self-review.test.ts`
- **Category**: Tests
- **Issue**: No tests exist for `extractForeignCharFragments()` function
- **Impact**: The critical infinite loop bug (#1) was not caught because no tests exercise this code path
- **Recommendation**: Add comprehensive test suite

**Add tests for**:

```typescript
describe('extractForeignCharFragments', () => {
  it('should extract single CJK fragment with context', () => {
    const content = 'Текст с公司的 примером.';
    const fragments = extractForeignCharFragments(content, ['CJK']);

    expect(fragments).toHaveLength(1);
    expect(fragments[0].fragment).toContain('公司的');
    expect(fragments[0].context).toContain('Текст с');
    expect(fragments[0].scriptTypes).toEqual(['CJK']);
  });

  it('should extract multiple fragments', () => {
    const content = 'Начало 中文 середина 更多 конец.';
    const fragments = extractForeignCharFragments(content, ['CJK']);
    expect(fragments.length).toBeGreaterThanOrEqual(2);
  });

  it('should exclude code blocks from extraction', () => {
    const content = 'Текст `код中文тут` еще公司的 текст.';
    const fragments = extractForeignCharFragments(content, ['CJK']);
    expect(fragments).toHaveLength(1); // Only the one outside code
  });

  it('should handle empty scriptsFound array', () => {
    const fragments = extractForeignCharFragments('Text', []);
    expect(fragments).toHaveLength(0);
  });

  it('should handle unknown script keys gracefully', () => {
    const fragments = extractForeignCharFragments('Text', ['UNKNOWN']);
    expect(fragments).toHaveLength(0);
  });
});
```

---

#### 4. Grammar Fix Uniqueness Check Too Strict

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-llm.ts:283-289`
- **Category**: Quality / Performance
- **Issue**: Grammar fix requires EXACTLY 1 occurrence; fails if word appears multiple times
- **Impact**: Valid grammar fixes rejected unnecessarily, wasting LLM tokens and reducing fix success rate

**Current code**:

```typescript
// Check uniqueness: must be exactly 1 occurrence
const occurrences = content.split(quotedText).length - 1;
if (occurrences > 1) {
  return { success: false, content, reason: 'multiple_occurrences' };
}
```

**Example failure case**:

```
Content: "Это простая рассылка. Создайте простую рассылку."
LLM wants to fix: "простая рассылка" → "простую рассылку" (second occurrence only)
Result: Fix rejected because "простая рассылка" appears twice
```

**Recommended approach**:

```typescript
// Option 1: Accept first occurrence only (document behavior)
if (occurrences > 1) {
  nodeLogger.debug({
    msg: 'Multiple occurrences found, fixing first only',
    quotedText,
    occurrences,
  });
}
const newContent = content.replace(quotedText, replacement); // Replaces first

// Option 2: Require location context from LLM
// Modify LLMIssueSchema to include `location: "sec_<id>"`
// and only replace within that section
```

**Why high priority**: This directly impacts the grammar fix success rate, which is a key feature of this implementation.

---

#### 5. Race Condition in Regex `lastIndex` Reset

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts:278-284`
- **Category**: Correctness
- **Issue**: Regex `lastIndex` reset in `stripForeignScriptCharacters` but patterns are shared constants
- **Impact**: If function called concurrently, `lastIndex` state can leak between calls

**Current code**:

```typescript
// Step 2: Strip foreign characters from prose text
for (const scriptKey of scriptsToStrip) {
  const pattern = FOREIGN_SCRIPT_STRIP_PATTERNS[scriptKey];
  if (pattern) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0; // BUG: Mutates shared constant
    const matches = processedContent.match(pattern);
```

**Problem**: `FOREIGN_SCRIPT_STRIP_PATTERNS` is a module-level constant (lines 207-213). Mutating `lastIndex` on a shared object causes race conditions in concurrent execution.

**Recommended fix**:

```typescript
// Create new regex instance each time (avoids shared state)
for (const scriptKey of scriptsToStrip) {
  const patternSource = FOREIGN_SCRIPT_STRIP_PATTERNS[scriptKey];
  if (patternSource) {
    const pattern = new RegExp(patternSource.source, 'g');
    const matches = processedContent.match(pattern);
    // ... rest of logic
  }
}
```

---

#### 6. Missing Validation for `detectedIssues` Array Size

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/self-reviewer/self-reviewer-prompt.ts:332-351`
- **Category**: Performance / Security
- **Issue**: `formatDetectedIssues` limits to 10 issues but doesn't warn or log if more are dropped
- **Impact**: Silent data loss; debugging difficulty if >10 issues exist

**Current code**:

```typescript
const formatted = issues
  .slice(0, 10) // Limit to avoid token explosion
  .map(/* ... */);
```

**Recommended fix**:

```typescript
function formatDetectedIssues(issues?: DetectedIssueForLLM[]): string {
  if (!issues || issues.length === 0) return '';

  // Log warning if truncating
  if (issues.length > 10) {
    logger.warn({
      msg: 'Detected issues truncated for LLM prompt',
      totalIssues: issues.length,
      included: 10,
      dropped: issues.length - 10,
    });
  }

  const formatted = issues.slice(0, 10).map(/* ... */);

  // Add footer note about truncation
  const truncationNote =
    issues.length > 10
      ? `\n\n(${issues.length - 10} additional issues omitted to preserve token budget)`
      : '';

  return `
<DETECTED_ISSUES>
ATTENTION: Heuristic analysis detected the following issues...
${formatted}${truncationNote}
</DETECTED_ISSUES>
`;
}
```

---

#### 7. Severity Calculation Logic Error

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/content-quality.ts:280-286`
- **Category**: Correctness
- **Issue**: Severity calculation uses `||` instead of proper precedence, can misclassify
- **Impact**: Wrong severity can cause incorrect routing (REGENERATE vs FLAG_TO_JUDGE)

**Current code**:

```typescript
result.failure = {
  filter: 'languageConsistency',
  expected: `No unexpected ${scriptsFound.join('/')} characters`,
  actual: `${totalForeignCount} foreign characters found`,
  severity: hasZeroToleranceViolation || totalForeignCount > 20 ? 'critical' : 'major',
};
```

**Problem**: This evaluates to:

- `critical` if `hasZeroToleranceViolation === true` OR `totalForeignCount > 20`
- `major` otherwise

But the logic should be:

- `critical` if `hasZeroToleranceViolation === true`
- `critical` if `totalForeignCount > 20` (regardless of script type)
- `major` otherwise

**Current behavior is correct, but confusing**. The code works but reads ambiguously.

**Recommended refactor for clarity**:

```typescript
// Determine severity explicitly
let severity: 'critical' | 'major';
if (hasZeroToleranceViolation) {
  severity = 'critical'; // CJK/Arabic/Devanagari = always critical
} else if (totalForeignCount > 20) {
  severity = 'critical'; // Massive contamination = critical
} else {
  severity = 'major'; // Moderate issues = major
}

result.failure = {
  filter: 'languageConsistency',
  expected: `No unexpected ${scriptsFound.join('/')} characters`,
  actual: `${totalForeignCount} foreign characters found`,
  severity,
};
```

---

### Medium Priority Issues (8)

#### 8. Code Block Protection Not DRY

- **File**: Multiple files (self-reviewer-heuristics.ts, self-reviewer-llm.ts)
- **Category**: Code Quality
- **Issue**: Code block protection regex duplicated in 3+ places with slight variations
- **Impact**: Maintenance burden; risk of inconsistency
- **Recommendation**: Extract to shared utility function

**Duplicated pattern**:

````typescript
// Pattern 1: self-reviewer-heuristics.ts line 246
processedContent = content.replace(/```[\s\S]*?```/g, match => {

// Pattern 2: self-reviewer-heuristics.ts line 253
processedContent = processedContent.replace(/`[^`]+`/g, match => {

// Pattern 3: self-reviewer-heuristics.ts line 368
let processedContent = content.replace(/```[\s\S]*?```/g, match => {

// Pattern 4: self-reviewer-heuristics.ts line 376
processedContent = processedContent.replace(/`[^`]+`/g, match => {
````

**Recommended fix**:

````typescript
// Create shared utility in self-reviewer-heuristics.ts
export function protectCodeBlocks(
  content: string,
  callback: (proseContent: string) => string
): string {
  const protectedBlocks: Array<{ placeholder: string; content: string }> = [];
  let blockIndex = 0;

  // Protect code blocks
  let processed = content.replace(/```[\s\S]*?```/g, match => {
    const placeholder = `__PROTECTED_BLOCK_${blockIndex}__`;
    protectedBlocks.push({ placeholder, content: match });
    blockIndex++;
    return placeholder;
  });

  // Protect inline code
  processed = processed.replace(/`[^`]+`/g, match => {
    const placeholder = `__PROTECTED_INLINE_${blockIndex}__`;
    protectedBlocks.push({ placeholder, content: match });
    blockIndex++;
    return placeholder;
  });

  // Process prose content
  processed = callback(processed);

  // Restore protected blocks
  for (const block of protectedBlocks) {
    processed = processed.replace(block.placeholder, () => block.content);
  }

  return processed;
}

// Usage:
const result = protectCodeBlocks(content, proseContent => {
  // Process prose-only content here
  return proseContent.replace(/foreign/g, '');
});
````

---

#### 9. Missing Error Logging in `applyPatching`

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-llm.ts:369-498`
- **Category**: Observability
- **Issue**: `applyPatching` logs successes but doesn't log all failure modes
- **Impact**: Debugging difficulty when patches fail silently
- **Recommendation**: Add structured logging for all code paths

**Missing logs**:

```typescript
// Line 445: LLM patch rejected, but no structured log
if (!validation.success) {
  nodeLogger.warn({
    msg: 'Invalid patchedContent from LLM, downgrading status',
    errors: validation.error.errors.map(e => e.message),
  });
  // MISSING: Log what fields failed validation, content preview
}

// Line 470: Script filtering logic has no debug logs
const scriptsToStrip = [...ZERO_TOLERANCE_SCRIPTS].filter(script => {
  // MISSING: Log which scripts are being checked/skipped
});
```

**Recommended additions**:

```typescript
if (!validation.success) {
  nodeLogger.warn({
    msg: 'Invalid patchedContent from LLM, downgrading status',
    errors: validation.error.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    })),
    patchPreview: JSON.stringify(result.patchedContent).slice(0, 200),
    issuesCount: result.issues.length,
  });
}

// Add debug log for script filtering
nodeLogger.debug({
  msg: 'Filtering zero-tolerance scripts for safety net',
  language,
  allScripts: [...ZERO_TOLERANCE_SCRIPTS],
  scriptsToStrip,
  skippedScripts: [...ZERO_TOLERANCE_SCRIPTS].filter(s => !scriptsToStrip.includes(s)),
});
```

---

#### 10. Token Budget Not Enforced

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-prompt.ts:404-430`
- **Category**: Performance / Cost
- **Issue**: `estimateSelfReviewerTokens` calculates estimate but doesn't enforce limits
- **Impact**: Runaway token costs if content is unexpectedly large
- **Recommendation**: Add circuit breaker

**Current code**:

```typescript
export function estimateSelfReviewerTokens(
  lessonContent: string,
  ragChunks: RAGChunk[],
  language: string = 'en'
): number {
  // ... calculates estimate
  return systemTokens + contentTokens + ragTokens + specTokens + outputTokens;
}

// No usage of return value to enforce limits!
```

**Recommended fix**:

```typescript
// In self-reviewer-llm.ts
const estimatedTokens = estimateSelfReviewerTokens(generatedContent, ragChunks, language);

// Enforce maximum token budget (e.g., 32k for most models)
const MAX_TOKENS = 32000;
if (estimatedTokens > MAX_TOKENS) {
  nodeLogger.error({
    msg: 'Content exceeds token budget for self-reviewer',
    estimatedTokens,
    maxTokens: MAX_TOKENS,
    contentLength: generatedContent.length,
  });

  return {
    success: false,
    parsed: null,
    tokensUsed: 0,
    error: `Content too large: ${estimatedTokens} tokens estimated (max: ${MAX_TOKENS})`,
  };
}
```

---

#### 11. Hardcoded Magic Numbers in Severity Thresholds

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/content-quality.ts:248-266`
- **Category**: Code Quality / Maintainability
- **Issue**: Magic numbers `5`, `20` not defined as named constants
- **Impact**: Unclear intent; risk of inconsistent thresholds if changed
- **Recommendation**: Extract to constants with documentation

**Current code**:

```typescript
/** Threshold for minor language issues (>5 chars = failed check) */
const MINOR_LANGUAGE_THRESHOLD = 5;
/** Divisor for language score contribution calculation */
const LANGUAGE_SCORE_DIVISOR = 20;
```

**But used inconsistently**:

```typescript
// Line 260: Uses MINOR_LANGUAGE_THRESHOLD (5)
const passed = hasZeroToleranceViolation
  ? totalForeignCount === 0
  : totalForeignCount <= MINOR_LANGUAGE_THRESHOLD;

// Line 285: Hardcoded 20 instead of named constant
severity: hasZeroToleranceViolation || totalForeignCount > 20 ? 'critical' : 'major',
```

**Recommended fix**:

```typescript
// Define at module top
const LANGUAGE_THRESHOLDS = {
  /** Allow up to 5 non-zero-tolerance foreign chars (typos) */
  MINOR_TOLERANCE: 5,
  /** Critical severity if >20 foreign chars (massive contamination) */
  CRITICAL_COUNT: 20,
  /** Score penalty divisor (reduces score by 1/20 per foreign char) */
  SCORE_DIVISOR: 20,
} as const;

// Usage
const passed = hasZeroToleranceViolation
  ? totalForeignCount === 0
  : totalForeignCount <= LANGUAGE_THRESHOLDS.MINOR_TOLERANCE;

severity: hasZeroToleranceViolation || totalForeignCount > LANGUAGE_THRESHOLDS.CRITICAL_COUNT
  ? 'critical'
  : 'major';
```

---

#### 12. Missing Input Validation for `scriptsFound`

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts:157-197`
- **Category**: Robustness
- **Issue**: `extractForeignCharFragments` doesn't validate that `scriptsFound` contains valid keys
- **Impact**: Runtime error if invalid script key passed
- **Recommendation**: Add validation

**Current code**:

```typescript
export function extractForeignCharFragments(
  content: string,
  scriptsFound: string[]
): ForeignCharFragment[] {
  // No validation of scriptsFound

  for (const scriptKey of scriptsFound) {
    const pattern = FOREIGN_SCRIPT_PATTERNS[scriptKey]; // Can be undefined!
    if (!pattern) continue; // Silent skip
```

**Recommended fix**:

````typescript
export function extractForeignCharFragments(
  content: string,
  scriptsFound: string[]
): ForeignCharFragment[] {
  const fragments: ForeignCharFragment[] = [];

  // Validate input
  const validScriptKeys = Object.keys(FOREIGN_SCRIPT_PATTERNS);
  const invalidScripts = scriptsFound.filter(s => !validScriptKeys.includes(s));

  if (invalidScripts.length > 0) {
    logger.warn({
      msg: 'Invalid script keys in extractForeignCharFragments',
      invalidScripts,
      validKeys: validScriptKeys,
    });
  }

  // Remove code blocks from analysis
  const proseContent = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');

  for (const scriptKey of scriptsFound) {
    const pattern = FOREIGN_SCRIPT_PATTERNS[scriptKey];
    if (!pattern) {
      logger.debug({ msg: 'Skipping unknown script key', scriptKey });
      continue;
    }
    // ... rest of logic
  }
````

---

#### 13. Grammar Rules Not i18n-Ready

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/self-reviewer/grammar-rules.ts`
- **Category**: Extensibility
- **Issue**: Only Russian and English grammar rules defined; no Chinese support despite CJK detection
- **Impact**: CJK content can't use grammar validation
- **Recommendation**: Add Chinese grammar rules or document limitation

**Current state**:

```typescript
export const SUPPORTED_GRAMMAR_LANGUAGES = ['ru', 'en'] as const;
```

**But CJK is a major focus of this implementation!**

**Recommended approach**:

```typescript
// Add basic Chinese grammar rules
export const CHINESE_RULES: GrammarRuleSet = {
  language: 'zh',
  languageName: 'Chinese',
  rules: `
### Chinese (zh) Grammar Checks:

1. **Measure word usage** (量词):
   - Correct: "一个人", "两本书", "三只猫"
   - Wrong: "一人", "两书" (missing measure word)

2. **Sentence final particles**:
   - Statement: 了, 的, 呢
   - Question: 吗, 呢
   - Ensure proper usage

3. **Spelling & typos**:
   - Simplified vs Traditional mixing (e.g., "學习" should be "学习" or "學習")
   - Wrong characters with similar pronunciation
   - Missing tone marks in pinyin (if used)`,
  examples: [
    {
      error: '我有两书',
      fix: '我有两本书',
      explanation: 'Missing measure word "本" for books',
    },
  ],
};

export const SUPPORTED_GRAMMAR_LANGUAGES = ['ru', 'en', 'zh'] as const;
```

**Or document limitation**:

```typescript
// In self-reviewer-prompt.ts
/**
 * LIMITATION: Grammar validation only supports Russian and English.
 * Chinese, Japanese, Korean content skips Phase 2.5 grammar checks.
 * Foreign character detection (Phase 1) still works for all languages.
 */
```

---

#### 14. Inconsistent Error Handling Between Heuristics

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts`
- **Category**: Code Quality
- **Issue**: Some functions return empty arrays on error, others log, inconsistent patterns
- **Impact**: Difficult to debug; unclear contract

**Examples**:

```typescript
// extractForeignCharFragments: Silent skip on invalid pattern
if (!pattern) continue;

// stripForeignScriptCharacters: Resets lastIndex but doesn't validate
pattern.lastIndex = 0;

// removeChatbotArtifacts: No error handling at all
```

**Recommended fix**: Standardize error handling

```typescript
// Option 1: Throw errors for invalid input
if (!pattern) {
  throw new Error(`Invalid script key: ${scriptKey}`);
}

// Option 2: Return Result type with error info
type HeuristicResult<T> = { success: true; data: T } | { success: false; error: string };

export function extractForeignCharFragments(
  content: string,
  scriptsFound: string[]
): HeuristicResult<ForeignCharFragment[]> {
  // ... validation
  if (invalidScripts.length > 0) {
    return {
      success: false,
      error: `Invalid scripts: ${invalidScripts.join(', ')}`,
    };
  }

  return {
    success: true,
    data: fragments,
  };
}
```

---

#### 15. No Handling for Nested LaTeX in Code Blocks

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts:260-272`
- **Category**: Edge Case
- **Issue**: LaTeX protection happens after code block protection, but LaTeX can exist in code blocks
- **Impact**: Rare edge case where LaTeX in markdown code block gets double-processed

**Example problematic content**:

````markdown
Here is a LaTeX example:

```latex
\begin{equation}
  E = mc^2 $$x + y$$
\end{equation}
```
````

**Processing order**:

1. Code block protected → `__PROTECTED_BLOCK_0__`
2. LaTeX regex tries to match `$$x + y$$` but it's already inside placeholder
3. **BUG**: If placeholder contains `$$`, it might match!

**Recommended fix**: Ensure placeholders don't contain special chars

```typescript
const placeholder = `__STRIP_BLOCK_${blockIndex}_SAFE__`; // Add _SAFE_ separator
```

Or check that patterns don't match placeholders:

```typescript
// Skip LaTeX matching inside placeholders
processedContent = processedContent.replace(/\$\$[\s\S]*?\$\$/g, match => {
  // Only protect if not inside a placeholder
  if (/^__STRIP_/.test(match)) return match;

  const placeholder = `__STRIP_LATEX_B_${blockIndex}__`;
  protectedBlocks.push({ placeholder, content: match });
  blockIndex++;
  return placeholder;
});
```

---

### Low Priority Issues (3)

#### 16. Verbose Logging in Hot Path

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-llm.ts:343-349`
- **Category**: Performance
- **Issue**: `applyGrammarFixes` logs each fix at debug level in tight loop
- **Impact**: Log spam if 20+ grammar fixes; minor performance hit
- **Recommendation**: Batch logging

**Current code**:

```typescript
for (const issue of grammarIssues) {
  const result = applySimpleInlineFix(/* ... */);

  if (result.success) {
    currentContent = result.content;
    appliedCount++;
    nodeLogger.debug({
      // Logs EVERY fix
      msg: 'Grammar fix applied',
      quotedText: issue.quotedText?.slice(0, 30),
      location: issue.location,
    });
  }
}
```

**Recommended fix**:

```typescript
const fixDetails: Array<{ quotedText: string; location: string }> = [];

for (const issue of grammarIssues) {
  const result = applySimpleInlineFix(/* ... */);

  if (result.success) {
    currentContent = result.content;
    appliedCount++;
    fixDetails.push({
      quotedText: issue.quotedText?.slice(0, 30) || '',
      location: issue.location,
    });
  }
}

if (appliedCount > 0) {
  nodeLogger.info({
    msg: 'Grammar fixes completed',
    appliedCount,
    failedCount,
    tokensSaved: appliedCount * 1500,
    fixes: fixDetails.slice(0, 5), // Log first 5 only
  });
}
```

---

#### 17. Comment Typo and Unclear Documentation

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts:18`
- **Category**: Documentation
- **Issue**: Comment says "Do NOT use /g flag here!" but doesn't explain WHY clearly enough
- **Impact**: Future maintainer might not understand the critical importance
- **Recommendation**: Expand comment with example

**Current comment**:

```typescript
/**
 * IMPORTANT: Do NOT use /g flag here!
 * RegExp.test() with /g flag retains lastIndex between calls, causing
 * intermittent failures when checking multiple sections. Without /g,
 * test() always starts from index 0.
 */
```

**Recommended expanded version**:

```typescript
/**
 * Unicode ranges for foreign script detection (matching heuristic-filter.ts)
 *
 * CRITICAL: Do NOT use /g flag in these patterns!
 *
 * Reason: These regexes are used with .test() in loops. The /g flag makes
 * RegExp stateful (retains lastIndex), causing these bugs:
 *
 * 1. test() returns false after first match (lastIndex moves past string)
 * 2. Concurrent calls leak state between different sections
 * 3. Pattern like /[\u4E00]/g matches "中" first call, skips it second call
 *
 * Example of broken behavior:
 *   const cjkPattern = /[\u4E00-\u9FFF]/g;
 *   cjkPattern.test('中文'); // true (lastIndex = 1)
 *   cjkPattern.test('中文'); // true (lastIndex = 2)
 *   cjkPattern.test('中文'); // false (lastIndex > length, resets to 0)
 *   cjkPattern.test('中文'); // true (cycle repeats)
 *
 * Solution: Omit /g flag. If you need global matching, use:
 *   - str.match(pattern) for all matches
 *   - str.matchAll(new RegExp(pattern.source, 'g'))
 *   - Create new RegExp instance per call
 */
```

---

#### 18. Missing JSDoc for Public Functions

- **File**: Multiple files
- **Category**: Documentation
- **Issue**: Key functions lack JSDoc (e.g., `stripForeignScriptCharacters`, `applyGrammarFixes`)
- **Impact**: Difficult for other developers to understand usage
- **Recommendation**: Add JSDoc to all exported functions

**Example missing docs**:

```typescript
// Line 236: Has JSDoc ✅
/**
 * Strip foreign script characters from content while preserving code blocks
 * ...
 */
export function stripForeignScriptCharacters(/* ... */);

// Line 302: Missing JSDoc ❌
function applyGrammarFixes(/* ... */);

// Line 268: Missing JSDoc ❌
function applySimpleInlineFix(/* ... */);
```

**Add**:

````typescript
/**
 * Apply simple inline fix for grammar issues
 * Zero-token replacement using exact string matching.
 *
 * @param content - Content to fix
 * @param quotedText - Exact text to find (must be unique)
 * @param replacement - Text to replace with
 * @returns Object with success flag, modified content, and failure reason if any
 *
 * @example
 * ```typescript
 * const result = applySimpleInlineFix(
 *   'Текст с ошибкой тут',
 *   'ошибкой',
 *   'правильным'
 * );
 * // result.success === true
 * // result.content === 'Текст с правильным тут'
 * ```
 */
function applySimpleInlineFix(/* ... */);
````

---

## Changes Reviewed

### Files Modified: 8

```
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/content-quality.ts (+40 -5)
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts (+3 -0)
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/self-reviewer/self-reviewer-prompt.ts (+85 -10)
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/self-reviewer/grammar-rules.ts (+5 -0)
packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer-node.ts (+20 -5)
packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts (+200 -0)
packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-llm.ts (+130 -15)
tests/stages/stage6-lesson-content/judge/heuristic-filter-self-review.test.ts (+15 -15)
```

### Notable Changes

- **ZERO_TOLERANCE_SCRIPTS export**: Added to heuristic-filter.ts for reuse in safety net
- **DetectedIssueForLLM interface**: New type for passing heuristic findings to LLM
- **extractForeignCharFragments**: New function for intelligent fragment extraction
- **stripForeignScriptCharacters**: Safety net for residual foreign chars
- **Spelling & typo rules**: Added to grammar-rules.ts and prompt
- **Test severity updates**: Corrected expectations for CJK critical severity

---

## Validation Results

### Type Check

**Command**: `pnpm type-check`

**Status**: ✅ PASSED

**Output**:

```
Scope: 5 of 6 workspace projects
packages/shared-logger type-check: Done
packages/shared-types type-check: Done
packages/shared-utils type-check: Done
packages/course-gen-platform type-check: Done
packages/web type-check: Done
```

**Exit Code**: 0

---

### Build

**Command**: `pnpm build`

**Status**: ✅ PASSED

**Output**: All packages built successfully with no errors

**Exit Code**: 0

---

### Tests (Optional)

**Command**: Not run during review

**Status**: ⚠️ NOT EXECUTED

**Recommendation**: Run test suite with:

```bash
pnpm test packages/course-gen-platform/tests/stages/stage6-lesson-content/judge/heuristic-filter-self-review.test.ts
```

---

### Overall Status

**Validation**: ✅ PASSED

Type-check and build both succeed with no errors. However, runtime bugs exist that tests don't catch.

---

## Metrics

- **Total Duration**: ~12 minutes
- **Files Reviewed**: 8
- **Issues Found**: 18
- **Validation Checks**: 2 (type-check, build)
- **Test Coverage**: Partial (existing tests updated, new functions not tested)

---

## Next Steps

### Critical Actions (Must Do Before Merge)

1. **Fix infinite loop bug in `extractForeignCharFragments`**
   - Replace `exec()` loop with `matchAll()` or `match()`
   - Add test case that exercises fragment extraction with multiple matches
   - Verify no infinite loops with stress test (1000+ foreign chars)

2. **Fix XSS vulnerability in `sanitizeForPrompt`**
   - Add HTML stripping with DOMPurify or equivalent
   - Add Unicode normalization to prevent fullwidth char bypasses
   - Test with malicious payloads: `<script>`, `javascript:`, fullwidth chars

### Recommended Actions (Should Do Before Merge)

3. **Add comprehensive test coverage for new functions**
   - `extractForeignCharFragments`: 8+ test cases
   - `stripForeignScriptCharacters`: 6+ test cases
   - `applyGrammarFixes`: 5+ test cases

4. **Fix grammar fix uniqueness check**
   - Either accept first occurrence only (document behavior)
   - Or require location context from LLM

5. **Fix regex `lastIndex` race condition**
   - Create new RegExp instances instead of resetting shared constants
   - Add concurrent execution test

6. **Add input validation for `detectedIssues` size**
   - Log warning if >10 issues dropped
   - Add footer note in prompt about truncation

7. **Clarify severity calculation logic**
   - Refactor to explicit if-else for readability
   - Add code comments explaining each severity tier

### Future Improvements (Nice to Have)

8. **Extract code block protection to DRY utility**
9. **Add structured error logging throughout**
10. **Enforce token budget in `estimateSelfReviewerTokens`**
11. **Extract magic numbers to named constants**
12. **Add Chinese grammar rules or document limitation**
13. **Standardize error handling across heuristics**
14. **Fix nested LaTeX edge case**
15. **Batch logging in hot paths**
16. **Expand comments for /g flag warning**
17. **Add JSDoc to all exported functions**

### Follow-Up

- **Review approach after fixes**: Re-run full test suite
- **Performance testing**: Stress test with large content (10,000+ chars, 100+ foreign chars)
- **Security audit**: Test with adversarial inputs (XSS payloads, prompt injection attempts)
- **Regression testing**: Ensure existing Stage 6 lessons still pass

---

## Artifacts

- Plan file: N/A (direct review requested)
- Changes log: N/A (read-only review)
- This report: `/home/me/code/mc2/docs/reports/code-review/2026-02/cjk-fix-code-review.md`

---

**Code review execution complete.**

⚠️ Code review identified critical issues. See "Critical Actions" section.

**Recommendation**: Fix critical issues #1 and #2 before merging to prevent runtime bugs and security vulnerabilities.

---

## Architecture & Design Assessment

### Positive Aspects

✅ **3-Layer Defense Strategy**: Excellent architectural decision

- Layer 1: Heuristic detection (fast, no cost)
- Layer 2: LLM translation (intelligent, context-aware)
- Layer 3: Programmatic strip (safety net)

✅ **Separation of Concerns**: Code well-organized across modules

- `heuristic-filter.ts`: Detection logic
- `self-reviewer-prompt.ts`: LLM prompts
- `self-reviewer-heuristics.ts`: Pure functions
- `self-reviewer-llm.ts`: LLM orchestration

✅ **Grammar Fix Innovation**: Zero-token inline fixes are clever

- Reduces regeneration cost
- Faster than full LLM retry
- Good use of `quotedText` + `inlineReplacement` pattern

✅ **Code Block Protection**: Critical for educational content

- Correctly excludes code from language checks
- Protects LaTeX formulas
- Preserves mermaid diagrams

### Areas for Improvement

⚠️ **Regex Complexity**: Multiple complex regex patterns prone to bugs

- Global flag misuse (#1, #5)
- Nested replacements hard to reason about (#15)
- Consider using a parser library for markdown instead of regex

⚠️ **Error Handling Inconsistency**: Different strategies across modules

- Some functions throw, others return empty arrays
- Silent failures make debugging hard
- Needs standardized approach (#14)

⚠️ **Limited Language Support**: Only RU/EN grammar rules

- CJK detection exists but no grammar validation
- Missing i18n extensibility (#13)

⚠️ **Test Coverage Gaps**: New functionality not tested

- Fragment extraction not covered (#3)
- Safety net stripping not tested
- Infinite loop bug not caught by tests

---

## Security Considerations

🔒 **Prompt Injection Risks**

The `sanitizeForPrompt` function escapes XML but doesn't prevent all injection vectors:

1. **Markdown-based injection**: `[click](javascript:alert(1))`
2. **Unicode normalization bypass**: Fullwidth characters like `＜script＞`
3. **CDATA escape sequences**: Complex nested XML

**Recommendation**: Use proven sanitization library + content security policy.

🔒 **Content Safety**

Foreign character stripping as "safety net" is good defense-in-depth, but:

1. **Could remove legitimate content**: Edge case where foreign chars are intentional (e.g., teaching foreign language)
2. **No audit trail**: Stripped content not logged for review
3. **Silent data loss**: User doesn't know content was modified

**Recommendation**: Add logging + optional flag to disable safety net.

---

## Performance Implications

⚡ **Token Cost Savings**

Grammar inline fixes are a win:

- Avoids full regeneration (~8000 tokens)
- Zero-token replacement
- Estimated savings: ~1500 tokens per fix

⚡ **Regex Performance**

Multiple regex passes over content:

1. Code block extraction
2. Foreign char detection
3. Grammar fixes
4. Chatbot artifact removal
5. Safety net stripping

**Concern**: For 10,000 char content with 50+ fixes, multiple passes could add latency.

**Recommendation**: Profile actual Stage 6 execution times with real lessons.

⚡ **LLM Call Overhead**

Adding `<DETECTED_ISSUES>` section increases prompt size:

- Base prompt: ~1200 tokens
- +10 issues: ~500 tokens
- Trade-off: Bigger prompt vs better fixes

**Current approach is reasonable**, but monitor token usage in production.

---

## Conclusion

The CJK auto-fix and typo detection implementation is architecturally sound with a clever 3-layer approach. However, critical bugs in regex handling and XSS sanitization must be fixed before merge.

**Overall Grade**: B+ (would be A- after fixing critical issues)

**Strengths**:

- Innovative approach combining heuristics + LLM + safety net
- Good separation of concerns
- Zero-token grammar fixes are clever

**Weaknesses**:

- Critical regex bugs (infinite loop, race condition)
- XSS vulnerability in sanitization
- Missing test coverage for new functions
- Limited i18n support

**Action Required**: Fix issues #1 and #2 (critical) before merge. Address high-priority issues within 1 sprint.
