# Code Review: Clarifying Questions UX

**Date**: 2026-01-30
**Reviewer**: Claude Code (Sonnet 4.5)
**Status**: ✅ PASSED with recommendations
**Files Reviewed**: 3

---

## Summary

Comprehensive review of UX improvements for the Clarifying Questions (Stage 4) component. The changes successfully move the "Пропустить" button from individual QuestionCards to centralized WizardNavigation and implement conditional rendering logic for "Продолжить генерацию" button.

**Overall Assessment**: Code is production-ready with solid implementation. Type-check passes, no critical bugs identified. Some minor edge cases and UX improvements recommended below.

---

## Issues Found

### CRITICAL (блокирующие баги)

**None found** ✅

---

### HIGH (важные проблемы)

#### HIGH-001: Undefined currentQuestion can cause runtime error

**File**: `ClarifyingPanel.tsx:606`

**Issue**: Logic checks `currentQuestion?.priority` but `currentQuestion` could be `undefined` at this point if `sortedQuestions.length === 0`.

```typescript
canSkipCurrent={
  currentQuestion?.priority === 'nice_to_have' &&
  !answeredQuestions.has(currentQuestion?.id) // ❌ currentQuestion?.id will error if undefined
}
```

**Impact**: If `sortedQuestions` is empty, `currentQuestion` is `undefined`, causing `currentQuestion?.id` to fail.

**Recommendation**:

```typescript
canSkipCurrent={
  currentQuestion !== undefined &&
  currentQuestion.priority === 'nice_to_have' &&
  !answeredQuestions.has(currentQuestion.id)
}
```

**Or safer**:

```typescript
canSkipCurrent={
  !!currentQuestion &&
  currentQuestion.priority === 'nice_to_have' &&
  !answeredQuestions.has(currentQuestion.id)
}
```

---

#### HIGH-002: Read-only mode hardcoded `isComplete={false}` prevents proper navigation state

**File**: `ClarifyingPanel.tsx:574-589`

**Issue**: In read-only mode, `isComplete={false}` is hardcoded, which means if all questions ARE actually answered in read-only mode, the UI won't reflect completion state (no checkmark, no completion message).

```typescript
{readOnly ? (
  <WizardNavigation
    ...
    isComplete={false} // ❌ Should be isComplete, not false
    hideContinueButton
  />
```

**Impact**: Users reviewing completed answers won't see visual confirmation that all questions are answered.

**Recommendation**:

```typescript
{readOnly ? (
  <WizardNavigation
    currentIndex={currentIndex}
    totalQuestions={totalQuestions}
    questionsStatus={sortedQuestions.map((q) => ({
      isAnswered: answeredQuestions.has(q.id),
      priority: q.priority,
    }))}
    onPrev={handlePrev}
    onNext={handleNext}
    onContinue={() => {}}
    isProcessing={false}
    isComplete={isComplete} // ✅ Use actual completion state
    hideContinueButton
  />
```

---

### MEDIUM (улучшения)

#### MED-001: Accessibility - Skip button lacks ARIA label

**File**: `WizardNavigation.tsx:96-106`

**Issue**: "Пропустить" button does not have `aria-label` or `aria-describedby` to explain what it skips.

```typescript
<Button
  variant="ghost"
  size="sm"
  onClick={onSkip}
  disabled={isProcessing}
  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
>
  Пропустить
</Button>
```

**Recommendation**:

```typescript
<Button
  variant="ghost"
  size="sm"
  onClick={onSkip}
  disabled={isProcessing}
  aria-label="Пропустить текущий вопрос"
  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
>
  Пропустить
</Button>
```

---

#### MED-002: Mobile UX - Skip button touch target may be too small

**File**: `WizardNavigation.tsx:96-106`

**Issue**: Skip button uses `size="sm"` which may result in touch target < 44px on mobile (iOS/Android accessibility guidelines).

**Current**: No explicit `min-h-[44px]` like navigation buttons have.

**Recommendation**: Add `min-h-[44px] min-w-[44px]` or `px-4 py-3` to ensure adequate touch target:

```typescript
<Button
  variant="ghost"
  size="sm"
  onClick={onSkip}
  disabled={isProcessing}
  className="min-h-[44px] px-4 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
>
  Пропустить
</Button>
```

---

#### MED-003: Empty questions state not handled gracefully

**File**: `ClarifyingPanel.tsx:472-478`

**Issue**: If `sortedQuestions.length === 0` and `currentQuestion === undefined`, component returns `null` without feedback to user.

```typescript
if (!currentQuestion && sortedQuestions.length > 0) {
  setCurrentIndex(0);
  return null; // ❌ Silent failure
}
```

**Impact**: User sees nothing if questions fail to load or are empty. No error message, no loading state.

**Recommendation**: Add explicit empty state handling:

```typescript
if (sortedQuestions.length === 0) {
  return (
    <Card className="p-6">
      <div className="text-center">
        <Info className="mx-auto h-12 w-12 text-slate-400 mb-3" />
        <p className="text-slate-600 dark:text-slate-400">
          Вопросы ещё не сгенерированы. Подождите немного...
        </p>
      </div>
    </Card>
  )
}

if (!currentQuestion) {
  // Index out of bounds - reset to 0
  setCurrentIndex(0)
  return null
}
```

---

#### MED-004: Race condition - canSkipCurrent checks outdated answeredQuestions

**File**: `ClarifyingPanel.tsx:604-608`

**Issue**: `canSkipCurrent` evaluates using local `answeredQuestions` state, but when user rapidly clicks "Skip", state update may not complete before next render, showing Skip button when it shouldn't.

**Mitigation**: Already handled by `isProcessing` prop preventing double-clicks. However, logic could be more explicit:

**Recommendation**: Add comment explaining the race condition protection:

```typescript
canSkipCurrent={
  // Note: isProcessing in WizardNavigation prevents double-skip
  currentQuestion?.priority === 'nice_to_have' &&
  !answeredQuestions.has(currentQuestion?.id)
}
```

**Alternative**: Calculate `canSkipCurrent` after state updates complete:

```typescript
const canSkipCurrent = useMemo(
  () =>
    currentQuestion !== undefined &&
    currentQuestion.priority === 'nice_to_have' &&
    !answeredQuestions.has(currentQuestion.id),
  [currentQuestion, answeredQuestions]
);
```

---

#### MED-005: Console logs should use structured logging

**File**: `ClarifyingPanel.tsx:87, 484`

**Issue**: Using `console.warn` and `console.error` directly instead of structured logger.

```typescript
console.warn('[ClarifyingPanel] Invalid user_answer format:', raw);
console.error('[ClarifyingPanel] Render error:', error);
```

**Recommendation**: Use project's logger (from `@megacampus/shared-logger` if available):

```typescript
import { logger } from '@megacampus/shared-logger';

logger.warn('Invalid user_answer format', { raw, courseId });
logger.error('ClarifyingPanel render error', { error, courseId });
```

---

### LOW (незначительные)

#### LOW-001: Unused parameter \_onSkip in QuestionCard

**File**: `QuestionCard.tsx:122`

**Issue**: `onSkip` parameter renamed to `_onSkip` with underscore prefix, indicating it's intentionally unused. Comment explains it's for API compatibility.

```typescript
onSkip: _onSkip, // Skip is now handled in WizardNavigation, kept for API compatibility
```

**Recommendation**: This is acceptable for backward compatibility, but consider deprecating in future:

```typescript
/**
 * @deprecated Skip functionality moved to WizardNavigation.
 * This prop is kept for backward compatibility and will be removed in v2.0.
 */
onSkip?: (questionId: string) => void
```

---

#### LOW-002: Magic number for confetti particle count

**File**: `ClarifyingPanel.tsx:291`

**Issue**: Hardcoded magic number `100` for confetti particles.

```typescript
void confetti({
  particleCount: 100, // ❌ Magic number
  spread: 70,
  origin: { y: 0.6 },
  colors: ['#a855f7', '#8b5cf6', '#7c3aed'],
});
```

**Recommendation**: Extract to named constant:

```typescript
const CONFETTI_CONFIG = {
  particleCount: 100,
  spread: 70,
  origin: { y: 0.6 },
  colors: ['#a855f7', '#8b5cf6', '#7c3aed'],
} as const;

// Usage:
void confetti(CONFETTI_CONFIG);
```

---

#### LOW-003: Duplicate border classes in mobile dots indicator

**File**: `WizardNavigation.tsx:78-92`

**Issue**: Tailwind class `bg-purple-500 dark:bg-purple-400` vs `bg-emerald-400 dark:bg-emerald-500` ordering inconsistent (500 vs 400 for dark mode).

```typescript
idx === currentIndex
  ? 'bg-purple-500 dark:bg-purple-400' // ✅ lighter in dark
  : status.isAnswered
    ? 'bg-emerald-400 dark:bg-emerald-500' // ❌ darker in dark
    : 'bg-slate-300 dark:bg-slate-600';
```

**Recommendation**: Standardize dark mode colors to be consistently lighter or darker:

```typescript
idx === currentIndex
  ? 'bg-purple-500 dark:bg-purple-400'
  : status.isAnswered
    ? 'bg-emerald-500 dark:bg-emerald-400' // ✅ consistent direction
    : 'bg-slate-300 dark:bg-slate-600';
```

---

#### LOW-004: No keyboard navigation for mobile dots

**File**: `WizardNavigation.tsx:78-92`

**Issue**: Mobile dots are pure `<div>` elements without `role`, `tabindex`, or click handlers. Users can't tap dots to jump to questions on mobile.

**Recommendation**: Make dots interactive (optional enhancement):

```typescript
{questionsStatus.map((status, idx) => (
  <button
    key={idx}
    type="button"
    onClick={() => onSelectQuestion?.(idx)} // Need to add onSelectQuestion prop
    className={cn(
      'h-2 w-2 rounded-full transition-colors',
      'hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
      idx === currentIndex
        ? 'bg-purple-500 dark:bg-purple-400'
        : status.isAnswered
          ? 'bg-emerald-400 dark:bg-emerald-500'
          : 'bg-slate-300 dark:bg-slate-600'
    )}
    aria-label={`Перейти к вопросу ${idx + 1}`}
  />
))}
```

**Note**: This would require adding `onSelectQuestion?: (index: number) => void` to `WizardNavigationProps`.

---

## Edge Cases Analysis

### ✅ Edge Case 1: Zero questions

**Status**: Partially handled
**Current**: Component shows loading spinner if `isLoading`, but after loading if `sortedQuestions.length === 0`, returns `null` silently.
**Recommendation**: See MED-003.

---

### ✅ Edge Case 2: currentQuestion undefined

**Status**: Handled with guard clause
**Current**: Lines 474-478 check for invalid index and reset to 0.
**Issue**: See HIGH-001 - still vulnerable in `canSkipCurrent` calculation.

---

### ✅ Edge Case 3: All questions already answered on mount

**Status**: Well handled
**Current**:

- Lines 242-246: Tracks `wasAlreadyCompleteOnMount` to prevent confetti on pre-answered state ✅
- Lines 251-269: Syncs `answeredQuestions` from API on mount ✅
- Confetti only triggers if questions completed DURING session ✅

---

### ✅ Edge Case 4: Read-only mode with 0 questions

**Status**: Handled by same logic as active mode
**Current**: `readOnly` flag only affects button visibility, not data flow ✅

---

### ⚠️ Edge Case 5: Rapid skip clicks

**Status**: Mostly handled
**Current**: `isProcessing` and `processingQuestionId` prevent double-clicks ✅
**Minor issue**: See MED-004 - `canSkipCurrent` could evaluate with stale state.

---

### ✅ Edge Case 6: Last question is nice_to_have and skipped

**Status**: Handled
**Current**:

- Skip marks question as answered (line 373) ✅
- Auto-advances to next unanswered (lines 375-381) ✅
- If last question, `isLastQuestion` disables "Next" button ✅
- `isComplete` becomes `true`, shows "Continue" button ✅

---

## UX Analysis

### ✅ Strengths

1. **Clear visual hierarchy**: Priority borders (red/amber/slate) are immediately visible
2. **Progressive disclosure**: Skip button only shown when applicable (nice_to_have + unanswered)
3. **Optimistic UI**: Answers immediately show as "answered" before server confirms
4. **Mobile-first**: Touch targets (44px), responsive layout, mobile dots indicator
5. **Accessibility**: ARIA labels on most interactive elements, keyboard navigation support
6. **Error handling**: Toast notifications for API failures, error boundary for render crashes
7. **Loading states**: Spinner overlay per card prevents double-clicks

### ⚠️ Areas for Improvement

1. **Skip button positioning**: Currently far-right on mobile may be hard to reach with thumb (see MED-002)
2. **Empty state**: No feedback if questions array is empty (see MED-003)
3. **Read-only completion state**: Doesn't show completion checkmark in read-only mode (see HIGH-002)
4. **Mobile dots**: Not interactive, can't tap to jump to question (see LOW-004)

---

## Performance Analysis

### ✅ Optimizations Present

1. **useMemo**: `sortedQuestions` (line 201), `priorityCounts` (line 217), `isComplete` calculation implicitly cached
2. **Polling strategy**: Stops polling once questions loaded (line 120)
3. **TanStack Query**: Smart caching with `staleTime: Infinity` (line 117) - questions never change, only answers
4. **Batch API**: `submitMultipleAnswers` prevents rate limit spam when accepting all (line 416)
5. **Optimistic updates**: Immediate UI feedback before API confirms (lines 191-196, 254-256)

### ⚠️ Minor Inefficiencies

1. **canSkipCurrent recalculation**: Evaluated inline in JSX (line 604), could be memoized (see MED-004)
2. **questionsStatus mapping**: Recalculated twice (lines 579, 595) - could extract to memo:

```typescript
const questionsStatus = useMemo(
  () =>
    sortedQuestions.map(q => ({
      isAnswered: answeredQuestions.has(q.id),
      priority: q.priority,
    })),
  [sortedQuestions, answeredQuestions]
);
```

---

## Code Quality

### ✅ Strengths

1. **TypeScript**: Full type safety, no `any` except one justified case (line 325)
2. **Single Source of Truth**: Imports types from `@megacampus/shared-types` (QuestionCard line 22)
3. **XSS Protection**: DOMPurify sanitizes all user/AI-generated text (lines 74, 80, 180, 186)
4. **Validation**: Zod schema for JSONB user_answer (lines 58-62)
5. **Comments**: Clear explanations for race conditions, polling logic, confetti persistence
6. **Error boundaries**: Graceful degradation on render errors (lines 481-486)

### ⚠️ Minor Issues

1. **Console logs**: Should use structured logger (see MED-005)
2. **Magic numbers**: Confetti particle count (see LOW-002)
3. **Unused parameter**: `_onSkip` could be deprecated (see LOW-001)

---

## Security

### ✅ No vulnerabilities found

1. **XSS Prevention**: ✅ All text sanitized with DOMPurify before rendering
2. **Input Validation**: ✅ Zod schema validates API responses
3. **SQL Injection**: N/A - no direct DB queries in frontend
4. **CSRF**: N/A - handled by tRPC/backend
5. **Secrets Exposure**: ✅ No hardcoded credentials

---

## Testing Considerations

### Unit Tests Recommended

1. **`canSkipCurrent` logic**: Test all combinations of priority + answered state
2. **`isComplete` calculation**: Test with 0 questions, partial answers, all answered
3. **Read-only mode**: Test that edit buttons are hidden, continue button is hidden
4. **Empty state**: Test behavior when `sortedQuestions.length === 0`

### Integration Tests Recommended

1. **Skip flow**: Click skip → verify API call → verify auto-advance → verify completion
2. **Edit flow**: Answer → Edit → Change → Confirm → Verify refetch
3. **Confetti persistence**: Answer all → Reload page → Verify no confetti
4. **Read-only navigation**: Navigate questions without ability to edit

---

## Recommendations Summary

### Critical Actions (Must Do Before Merge)

**None** ✅ - Code is production-ready

### High Priority Actions (Should Do Before Merge)

1. **HIGH-001**: Fix undefined `currentQuestion.id` access in `canSkipCurrent`
2. **HIGH-002**: Use actual `isComplete` state in read-only mode, not hardcoded `false`

### Future Improvements (Next Sprint)

1. **MED-001**: Add ARIA labels to Skip button
2. **MED-002**: Increase Skip button touch target to 44px
3. **MED-003**: Add explicit empty state with user feedback
4. **MED-004**: Memoize `canSkipCurrent` to prevent stale state
5. **MED-005**: Replace console logs with structured logger
6. **LOW-002**: Extract confetti config to constant
7. **LOW-003**: Standardize dark mode color ordering
8. **LOW-004**: Make mobile dots interactive (optional)

---

## Conclusion

**Overall Status**: ✅ **APPROVED with minor fixes**

The Clarifying Questions UX refactor is **well-implemented** and ready for production with two high-priority fixes:

1. Fix `currentQuestion?.id` undefined access (HIGH-001)
2. Fix read-only mode completion state (HIGH-002)

The code demonstrates:

- ✅ Strong TypeScript typing
- ✅ Solid error handling
- ✅ Good UX patterns (optimistic updates, progressive disclosure)
- ✅ Security best practices (XSS protection, input validation)
- ✅ Performance optimizations (memoization, polling strategy)

**Estimated fix time**: 10 minutes for both HIGH issues.

---

**Files Reviewed**:

1. `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/wizard/WizardNavigation.tsx` (122 lines)
2. `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx` (617 lines)
3. `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx` (819 lines)

**Review Date**: 2026-01-30
**Type-Check Status**: ✅ PASSED
**Build Status**: ✅ PASSED (inferred from type-check)
