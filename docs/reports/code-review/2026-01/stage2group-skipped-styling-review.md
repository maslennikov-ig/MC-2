# Code Review: Stage2Group.tsx Skipped Styling Implementation

**Date**: 2026-01-16
**Reviewer**: Claude Code (Code Review Worker)
**File**: `packages/web/components/generation-graph/nodes/Stage2Group.tsx`
**Change Type**: Feature Enhancement - Skipped State Visual Treatment
**Reference**: StageNode.tsx (lines 158-169)

---

## Executive Summary

Review of recent changes adding strikethrough styling when `currentStatus === 'skipped'` to Stage2Group.tsx. The implementation is **90% complete** with several **critical gaps** that need immediate attention for consistency, accessibility, and maintainability.

### Overall Assessment

**Status**: ⚠️ **REQUIRES CHANGES** before merge

**Severity Breakdown**:

- **P1 (Critical)**: 3 issues - Missing icon styling, inconsistent patterns
- **P2 (Major)**: 2 issues - Code duplication, accessibility concerns
- **P3 (Minor)**: 2 issues - Documentation, dark mode optimization
- **P4 (Suggestion)**: 1 issue - Maintainability improvement

### Key Findings

✅ **What's Working**:

- Stage label text correctly styled (4 locations)
- Stage name text correctly styled with line-through (4 locations)
- Dark mode support present in all changes
- No TypeScript errors introduced

❌ **Critical Issues**:

1. **Icon colors missing skipped state** (3 locations) - Inconsistent with StageNode.tsx
2. **Code duplication** - Same conditional logic repeated 4 times
3. **Progress footer hidden for skipped state** - Should show with muted styling

---

## Detailed Findings

### P1 - Critical Issues

#### P1.1: Icon Colors Missing Skipped State

**Severity**: Critical
**Impact**: Visual inconsistency, reduced usability
**Locations**: Lines 66-67, 306, 443

**Issue**: FileStack icons always show `text-indigo-600 dark:text-indigo-400` regardless of status, but should be muted when skipped.

**Reference Pattern** (StageNode.tsx lines 152-155):

```tsx
<IconComponent
  size={20}
  className={
    currentStatus === 'active'
      ? 'text-blue-600 dark:text-blue-400 animate-spin-slow'
      : currentStatus === 'skipped'
        ? 'text-slate-400 dark:text-slate-500'
        : ''
  }
/>
```

**Current Implementation** (3 locations):

**Location 1: MediumStage2Node (line 66-67)**

```tsx
<div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
  <FileStack size={10} />
</div>
```

**Location 2: Collapsed State (line 306)**

```tsx
<FileStack size={18} className="text-indigo-600 dark:text-indigo-400" />
```

**Location 3: Expanded State (line 443)**

```tsx
<FileStack size={18} className="text-indigo-600 dark:text-indigo-400" />
```

**Recommended Fix**:

**Location 1 (MediumStage2Node lines 66-67)** - Fix both background and icon color:

```tsx
<div
  className={`flex h-5 w-5 items-center justify-center rounded-full ${
    currentStatus === 'skipped'
      ? 'bg-slate-200 text-slate-400 dark:bg-slate-600 dark:text-slate-500'
      : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
  }`}
>
  <FileStack size={10} />
</div>
```

**Location 2 (Collapsed State line 306)**:

```tsx
<FileStack
  size={18}
  className={
    currentStatus === 'skipped'
      ? 'text-slate-400 dark:text-slate-500'
      : 'text-indigo-600 dark:text-indigo-400'
  }
/>
```

**Location 3 (Expanded State line 443)**:

```tsx
<FileStack
  size={18}
  className={
    currentStatus === 'skipped'
      ? 'text-slate-400 dark:text-slate-500'
      : 'text-indigo-600 dark:text-indigo-400'
  }
/>
```

**Why This Matters**:

- Icons are primary visual indicators - must match text treatment
- Users scanning the graph rely on color for quick status recognition
- Inconsistency with StageNode creates confusion
- Accessibility: color alone shouldn't convey meaning, but consistent muting helps

---

#### P1.2: Icon Background Missing Skipped State (MediumStage2Node)

**Severity**: Critical
**Impact**: Visual inconsistency
**Location**: Line 66

**Issue**: Icon container background doesn't change for skipped state.

**Current**:

```tsx
<div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
```

**Recommended** (matches StageNode.tsx line 146-150):

```tsx
<div className={`flex h-5 w-5 items-center justify-center rounded-full ${
  currentStatus === 'skipped'
    ? 'bg-slate-200 text-slate-400 dark:bg-slate-600 dark:text-slate-500'
    : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
}`}>
```

---

#### P1.3: Icon Background Missing Skipped State (Collapsed State)

**Severity**: Critical
**Impact**: Visual inconsistency
**Location**: Lines 299-307

**Issue**: Icon container background in collapsed state should also be muted when skipped.

**Current**:

```tsx
<div
  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
    currentStatus === 'active'
      ? 'bg-white shadow-sm dark:bg-slate-700'
      : 'bg-indigo-100 dark:bg-indigo-900/30'
  } `}
>
  <FileStack size={18} className="text-indigo-600 dark:text-indigo-400" />
</div>
```

**Recommended**:

```tsx
<div
  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
    currentStatus === 'active'
      ? 'bg-white shadow-sm dark:bg-slate-700'
      : currentStatus === 'skipped'
        ? 'bg-slate-200 dark:bg-slate-600'
        : 'bg-indigo-100 dark:bg-indigo-900/30'
  } `}
>
  <FileStack
    size={18}
    className={
      currentStatus === 'skipped'
        ? 'text-slate-400 dark:text-slate-500'
        : 'text-indigo-600 dark:text-indigo-400'
    }
  />
</div>
```

---

### P2 - Major Issues

#### P2.1: Code Duplication - Repeated Conditional Logic

**Severity**: Major
**Impact**: Maintainability, consistency risk
**Locations**: Lines 70-74, 311-315, 320-324, 448-452, 457-461

**Issue**: Same conditional pattern repeated 4+ times across component.

**Current Pattern** (repeated):

```tsx
className={`... ${
  currentStatus === 'skipped'
    ? 'text-slate-400 dark:text-slate-500'
    : 'text-slate-500 dark:text-slate-400'
}`}
```

**Risk**:

- If skipped styling changes, must update in 8+ locations
- High chance of missing a location (as happened with icons)
- Violates DRY principle

**Recommended Solution**: Extract to utility function

```tsx
// At top of file or in shared utils
const getSkippedTextStyles = (
  currentStatus: string,
  type: 'label' | 'name' | 'icon' | 'icon-bg'
) => {
  if (currentStatus !== 'skipped') {
    return type === 'label'
      ? 'text-slate-500 dark:text-slate-400'
      : type === 'name'
        ? 'text-slate-900 dark:text-slate-100'
        : type === 'icon'
          ? 'text-indigo-600 dark:text-indigo-400'
          : 'bg-indigo-100 dark:bg-indigo-900/30';
  }

  // Skipped state
  return type === 'label'
    ? 'text-slate-400 dark:text-slate-500'
    : type === 'name'
      ? 'text-slate-500 line-through dark:text-slate-400'
      : type === 'icon'
        ? 'text-slate-400 dark:text-slate-500'
        : 'bg-slate-200 dark:bg-slate-600';
};
```

**Usage**:

```tsx
<span
  className={`text-xs font-medium uppercase tracking-wider ${getSkippedTextStyles(
    currentStatus,
    'label'
  )}`}
>
  {t('stage2.stageLabel')}
</span>
```

**Benefits**:

- Single source of truth for skipped styling
- Easy to update all instances
- Self-documenting
- Type-safe

---

#### P2.2: Progress Footer Hidden for Skipped State

**Severity**: Major
**Impact**: Reduced information, inconsistent with StageNode
**Location**: Lines 368-394

**Issue**: Metrics footer only shows for `active | completed | error`, not `skipped`.

**Current**:

```tsx
{
  (currentStatus === 'active' || currentStatus === 'completed' || currentStatus === 'error') && (
    <div className="border-t border-black/5 bg-slate-50/50 ...">{/* Footer content */}</div>
  );
}
```

**Reference** (StageNode.tsx lines 197-199):

```tsx
: currentStatus === 'skipped' ? (
  <span className="text-slate-400 dark:text-slate-500 italic">
    {t('status.skipped')}
  </span>
```

**Recommended**: Show footer for skipped state with muted message

```tsx
{
  (currentStatus === 'active' ||
    currentStatus === 'completed' ||
    currentStatus === 'error' ||
    currentStatus === 'skipped') && (
    <div className="border-t border-black/5 bg-slate-50/50 px-2.5 py-1.5 text-[10px] text-slate-500 dark:border-white/10 dark:bg-slate-900/30 dark:text-slate-400">
      <div className="flex items-center justify-between">
        <span>
          {completedDocs} / {totalDocs} {t('stage2.documentsCount')}
        </span>
        {currentStatus === 'completed' ? (
          <span className="font-medium text-green-600 dark:text-green-400">
            {t('stage2.statusReady')}
          </span>
        ) : currentStatus === 'active' ? (
          <div className="flex items-center gap-1">
            <span className="text-blue-600 dark:text-blue-400">{t('stage2.statusProcessing')}</span>
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
          </div>
        ) : currentStatus === 'error' ? (
          <span className="font-medium text-red-600 dark:text-red-400">
            {t('stage2.statusError')}
          </span>
        ) : currentStatus === 'skipped' ? (
          <span className="text-slate-400 dark:text-slate-500 italic">{t('status.skipped')}</span>
        ) : null}
      </div>
    </div>
  );
}
```

**Why This Matters**:

- Users should see document counts even when skipped
- Provides context: "0/5 documents (skipped)" vs just collapsed node
- Matches StageNode.tsx pattern
- Better information hierarchy

---

### P3 - Minor Issues

#### P3.1: Missing Expanded State Label Color (Inconsistency)

**Severity**: Minor
**Impact**: Visual inconsistency between collapsed and expanded
**Location**: Lines 448-452

**Issue**: Expanded state stage label uses `text-indigo-500` for non-skipped instead of `text-slate-500`.

**Current**:

```tsx
<span
  className={`text-[10px] font-medium tracking-wider uppercase ${
    currentStatus === 'skipped'
      ? 'text-slate-400 dark:text-slate-500'
      : 'text-indigo-500 dark:text-indigo-400'
  }`}
>
  {t('stage2.stageLabel')}
</span>
```

**Collapsed State** (line 311-315):

```tsx
<span
  className={`text-[10px] font-medium tracking-wider uppercase ${
    currentStatus === 'skipped'
      ? 'text-slate-400 dark:text-slate-500'
      : 'text-slate-500 dark:text-slate-400' // ← Uses slate, not indigo
  }`}
>
  {t('stage2.stageLabel')}
</span>
```

**Recommendation**:

- **Option A** (Consistency): Change expanded to use `text-slate-500` like collapsed
- **Option B** (Intentional Distinction): Keep different but document why expanded uses indigo

**Rationale for Option A**: Stage labels should be consistent across states. The indigo theme is already clear from border, background, and icon.

---

#### P3.2: Accessibility - Line-through Alone May Not Be Sufficient

**Severity**: Minor
**Impact**: Accessibility for vision-impaired users
**Location**: All line-through instances

**Issue**: Line-through styling may not be perceivable by screen readers or users with low vision.

**Current**:

```tsx
<span
  className={`text-sm font-semibold ${
    currentStatus === 'skipped'
      ? 'text-slate-500 dark:text-slate-400 line-through'
      : 'text-slate-900 dark:text-slate-100'
  }`}
>
  {t('stage2.groupTitle')}
</span>
```

**Recommendation**: Add ARIA label or screen reader text

```tsx
<span
  className={`text-sm font-semibold ${
    currentStatus === 'skipped'
      ? 'text-slate-500 dark:text-slate-400 line-through'
      : 'text-slate-900 dark:text-slate-100'
  }`}
  aria-label={currentStatus === 'skipped' ? `${t('stage2.groupTitle')} (пропущено)` : undefined}
>
  {t('stage2.groupTitle')}
</span>
```

**Or** add visually-hidden text:

```tsx
<span className={`text-sm font-semibold ${...}`}>
  {t('stage2.groupTitle')}
  {currentStatus === 'skipped' && (
    <span className="sr-only"> (пропущено)</span>
  )}
</span>
```

**Impact**:

- Low - Good to have but not critical
- Existing aria-label on container (line 265) partially addresses this
- Consider for future accessibility audit

---

### P4 - Suggestions

#### P4.1: Consider Status Style Utility Hook

**Severity**: Suggestion
**Impact**: Maintainability, reusability

**Recommendation**: Create a `useStatusStyles` hook for consistent status styling across all node types.

```tsx
// hooks/useStatusStyles.ts
export const useStatusStyles = (status: NodeStatus, type: 'stage' | 'document' | 'group') => {
  return useMemo(
    () => ({
      labelClass:
        status === 'skipped'
          ? 'text-slate-400 dark:text-slate-500'
          : 'text-slate-500 dark:text-slate-400',

      nameClass:
        status === 'skipped'
          ? 'text-slate-500 dark:text-slate-400 line-through'
          : 'text-slate-900 dark:text-slate-100',

      iconClass:
        status === 'skipped'
          ? 'text-slate-400 dark:text-slate-500'
          : type === 'group'
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-slate-600 dark:text-slate-300',

      iconBgClass:
        status === 'skipped'
          ? 'bg-slate-200 dark:bg-slate-600'
          : status === 'active'
            ? 'bg-white dark:bg-slate-700 shadow-sm'
            : type === 'group'
              ? 'bg-indigo-100 dark:bg-indigo-900/30'
              : 'bg-slate-100 dark:bg-slate-700',
    }),
    [status, type]
  );
};
```

**Usage**:

```tsx
const styles = useStatusStyles(currentStatus, 'group')

<span className={`text-xs font-medium uppercase tracking-wider ${styles.labelClass}`}>
  {t('stage2.stageLabel')}
</span>
```

**Benefits**:

- DRY across all node components
- Easy to maintain consistent styling
- Type-safe
- Centralized status styling logic

---

## Testing Recommendations

### Manual Testing Checklist

- [ ] **Visual Regression**: Compare with StageNode.tsx skipped state
  - [ ] Icon color matches (slate vs indigo)
  - [ ] Background color matches
  - [ ] Text colors match
  - [ ] Line-through applied correctly

- [ ] **Dark Mode**: All changes work correctly in dark mode
  - [ ] MediumStage2Node
  - [ ] Collapsed state
  - [ ] Expanded state
  - [ ] Footer (if added)

- [ ] **Zoom Levels**: Verify all 3 semantic zoom levels
  - [ ] Minimal (<0.3) - Not affected by changes
  - [ ] Medium (0.3-0.5) - Check lines 70-74
  - [ ] Full (>0.5) - Check collapsed and expanded states

- [ ] **Status Transitions**: Verify smooth transitions
  - [ ] pending → skipped
  - [ ] skipped → active (if status reverted)
  - [ ] Colors update without flicker

### Automated Testing

**Recommended Unit Tests**:

```tsx
describe('Stage2Group - Skipped Styling', () => {
  it('should apply line-through to stage name when skipped', () => {
    const { getByText } = render(<Stage2Group data={{ ...mockData, status: 'skipped' }} />);
    const stageName = getByText(/Документы/);
    expect(stageName).toHaveClass('line-through');
  });

  it('should mute icon color when skipped', () => {
    const { container } = render(<Stage2Group data={{ ...mockData, status: 'skipped' }} />);
    const icon = container.querySelector('[data-testid*="stage2group"] svg');
    expect(icon?.parentElement).toHaveClass('text-slate-400');
  });

  it('should show footer with skipped message', () => {
    const { getByText } = render(<Stage2Group data={{ ...mockData, status: 'skipped' }} />);
    expect(getByText(/пропущено/i)).toBeInTheDocument();
  });
});
```

---

## Impact Assessment

### Files Affected

- ✅ `Stage2Group.tsx` - Primary file (changes made)
- ⚠️ Translation files - May need `status.skipped` key if not present

### Breaking Changes

- None - Visual changes only, no API changes

### Performance Impact

- Negligible - Only adds conditional className logic
- No new re-renders or state changes

### Bundle Size

- No impact - No new dependencies

---

## Recommendations Summary

### Must Fix Before Merge (P1)

1. ✅ **Add icon color skipped state** (3 locations)
2. ✅ **Add icon background skipped state** (2 locations)

### Should Fix Before Merge (P2)

3. ⚠️ **Extract repeated conditional to utility function** (maintainability)
4. ⚠️ **Show footer for skipped state** (information parity with StageNode)

### Consider for Follow-up (P3, P4)

5. 💡 **Align expanded label color with collapsed** (consistency)
6. 💡 **Add accessibility enhancements** (ARIA labels)
7. 💡 **Create useStatusStyles hook** (long-term maintainability)

---

## Reference Patterns

### Correct Pattern from StageNode.tsx

**Stage Label** (lines 158-162):

```tsx
<span
  className={`text-xs font-medium uppercase tracking-wider ${
    currentStatus === 'skipped'
      ? 'text-slate-400 dark:text-slate-500'
      : 'text-slate-500 dark:text-slate-400'
  }`}
>
  Этап {data.stageNumber}
</span>
```

**Stage Name** (lines 165-169):

```tsx
<span
  className={`text-sm font-semibold ${
    currentStatus === 'skipped'
      ? 'text-slate-500 dark:text-slate-400 line-through'
      : 'text-slate-900 dark:text-slate-100'
  }`}
>
  {stageName}
</span>
```

**Icon Background** (lines 146-150):

```tsx
<div className={`flex h-10 w-10 items-center justify-center rounded-full ${
  currentStatus === 'skipped'
    ? 'bg-slate-200 dark:bg-slate-600 text-slate-400 dark:text-slate-500'
    : currentStatus === 'active'
      ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-600 dark:text-slate-300'
      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
}`}>
```

**Icon Color** (lines 152-155):

```tsx
<IconComponent
  size={20}
  className={
    currentStatus === 'active'
      ? 'text-blue-600 dark:text-blue-400 animate-spin-slow'
      : currentStatus === 'skipped'
        ? 'text-slate-400 dark:text-slate-500'
        : ''
  }
/>
```

---

## Conclusion

The skipped styling implementation in Stage2Group.tsx is **mostly correct** but has **critical gaps** in icon styling and **opportunities for improvement** in code organization.

**Action Items**:

1. ✅ Fix P1 issues (icon colors and backgrounds) - **Required**
2. ⚠️ Consider P2 issues (code duplication, footer) - **Strongly Recommended**
3. 💡 Review P3/P4 suggestions - **Optional, for follow-up**

**Overall Quality**: Good implementation with attention to detail (text styling, dark mode), but needs completion for consistency across all visual elements.

**Estimated Effort**:

- P1 fixes: ~15 minutes
- P2 fixes: ~30 minutes
- P3/P4 improvements: ~1 hour

---

**Review Complete** - Ready for developer action.

**Next Steps**:

1. Implement P1 fixes
2. Run type-check and build
3. Manual visual testing in all states
4. Consider P2 improvements for maintainability
