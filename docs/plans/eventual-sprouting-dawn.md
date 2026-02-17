# Fix: CJK Zero-Tolerance Bypass in Self-Reviewer

## Context

Course PPG-9154 ("Как стать счастливым") has **4 completed lessons** with leaked CJK characters (2-3 chars each). Examples: `с公司的 миссией`, `健身房`, `感官`, `代表性`. These should have been caught by the self-reviewer (Stage 6), but weren't due to a threshold gap.

**Root cause**: `checkLanguageConsistency` correctly uses zero-tolerance for CJK (`passed = false` for ANY count > 0), but `analyzeCriticalIssues` in the self-reviewer applies a second threshold (`foreignCharacters > 10`) that undermines zero-tolerance. With only 3 CJK chars, `3 > 10` is false, so the issue becomes INFO-level and content passes through unchecked.

The Judge heuristic filter also has a gap: CJK failures get `major` severity (not `critical`) when count <= 20, weakening the rejection signal.

## Changes

### 1. Export `ZERO_TOLERANCE_SCRIPTS` constant

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/content-quality.ts` (line 185)

Change `const` to `export const`:

```typescript
export const ZERO_TOLERANCE_SCRIPTS: Set<string> = new Set(['CJK', 'ARABIC', 'DEVANAGARI']);
```

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts` (line 48)

Add to re-exports:

```typescript
export {
  checkLearningObjectiveCoverage,
  checkLanguageConsistency,
  ZERO_TOLERANCE_SCRIPTS,
} from './filters/content-quality';
```

### 2. Fix severity for zero-tolerance violations in Judge filter

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/content-quality.ts` (line 285)

```typescript
// BEFORE:
severity: totalForeignCount > 20 ? 'critical' : 'major',

// AFTER:
severity: hasZeroToleranceViolation || totalForeignCount > 20 ? 'critical' : 'major',
```

`hasZeroToleranceViolation` already exists as a local variable (line 255).

### 3. Fix self-reviewer threshold (PRIMARY FIX)

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases.ts`

Import `ZERO_TOLERANCE_SCRIPTS`:

```typescript
import {
  checkLanguageConsistency,
  checkContentTruncation,
  checkMermaidSyntax,
  ZERO_TOLERANCE_SCRIPTS,
} from '../../judge/heuristic-filter';
```

Fix threshold in `analyzeCriticalIssues` (lines 101-103):

```typescript
// BEFORE:
if (
  !languageCheck.passed &&
  languageCheck.foreignCharacters > SELF_REVIEW_CONFIG.criticalLanguageThreshold
) {

// AFTER:
const hasZeroToleranceScript = languageCheck.scriptsFound.some(
  script => ZERO_TOLERANCE_SCRIPTS.has(script)
);

if (
  !languageCheck.passed &&
  (hasZeroToleranceScript || languageCheck.foreignCharacters > SELF_REVIEW_CONFIG.criticalLanguageThreshold)
) {
```

### 4. Prevent duplicate INFO issues for zero-tolerance scripts

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases.ts`

In `buildMinorIssues` (line 244), skip INFO issue when zero-tolerance scripts were already handled by `analyzeCriticalIssues`:

```typescript
if (!languageCheck.passed) {
  const hasZeroToleranceScript = languageCheck.scriptsFound.some(
    script => ZERO_TOLERANCE_SCRIPTS.has(script)
  );
  if (!hasZeroToleranceScript) {
    issues.push({ type: 'LANGUAGE', severity: 'INFO', ... });
  }
}
```

### 5. Update tests

**File**: `packages/course-gen-platform/tests/stages/stage6-lesson-content/judge/heuristic-filter-self-review.test.ts`

- Line 162: Test "should have major severity for moderate foreign characters (6-20)" uses CJK, which will now be `critical`. Change to use Cyrillic-in-English (non-zero-tolerance) to preserve `major` test case.
- Add new test: "should have critical severity for ANY CJK characters (zero-tolerance)"

**File**: `packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/self-reviewer-cjk.test.ts`

- Line 668: Test "should pass when CJK count <= threshold (10 chars)" now expects regeneration for even 1 CJK. Rewrite to test zero-tolerance behavior.
- Add regression test for the real-world 3-char CJK leak case (`с公司的 миссией`).

## Files to Modify

1. `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/content-quality.ts`
2. `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts`
3. `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases.ts`
4. `packages/course-gen-platform/tests/stages/stage6-lesson-content/judge/heuristic-filter-self-review.test.ts`
5. `packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/self-reviewer-cjk.test.ts`

## What This Does NOT Change

- Non-zero-tolerance scripts (e.g., Latin in Russian) still use original thresholds
- Code block exclusion (already works correctly)
- Model fallback logic (retryCount >= maxPrimaryAttempts)
- Partial vs full regeneration 50% section threshold

## Verification

```bash
pnpm --filter @megacampus/course-gen-platform test -- --run tests/stages/stage6-lesson-content/judge/heuristic-filter-self-review.test.ts
pnpm --filter @megacampus/course-gen-platform test -- --run tests/unit/stages/stage6-lesson-content/self-reviewer-cjk.test.ts
pnpm type-check
```
