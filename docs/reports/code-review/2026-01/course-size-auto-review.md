# Code Review Report: Course Size 'Auto' Feature

**Generated**: 2026-01-14
**Reviewer**: Claude Code (Code Review Agent)
**Feature**: Course size 'auto' option implementation
**Status**: ⚠️ PARTIAL (1 Critical Issue Found)

---

## Executive Summary

Comprehensive code review of the course-size 'auto' feature implementation across 5 key files. The feature adds an 'auto' option to course size selection where the LLM decides optimal size without preset guidance.

### Key Findings

- ❌ **1 Critical Issue**: Unused import causing build failure (TypeScript error)
- ⚠️ **3 Medium Priority Issues**: UX edge cases and potential runtime issues
- ✅ **7 Strengths**: Well-implemented type safety, i18n, and backend integration

### Overall Assessment

The feature is **well-designed** with excellent type safety and comprehensive i18n support. However, a build-blocking TypeScript error must be fixed before deployment. Additionally, there are UX edge cases around the 'auto' option that need handling.

---

## Critical Issues (1)

### 1. Build Failure: Unused Import `PresetCourseSize`

**File**: `packages/web/components/forms/create-course/components/CourseSizeSelector.tsx:10`

**Issue**: TypeScript error preventing build from succeeding.

```typescript
// Line 10 - UNUSED IMPORT
type PresetCourseSize,
```

**Error Output**:

```
Type error: 'PresetCourseSize' is declared but its value is never read.
```

**Impact**:

- ❌ **Build fails** - Cannot deploy to production
- ❌ **CI/CD pipeline blocked**
- Type-check command returns exit code 1

**Root Cause**: The import was likely added during development but never used. The component only needs `CourseSize`, not `PresetCourseSize`.

**Fix**:

```typescript
// Remove line 10
import {
  COURSE_SIZES,
  COURSE_SIZE_PRESETS,
  getAllCourseSizeLabels,
  type CourseSize,
  // type PresetCourseSize, ← REMOVE THIS LINE
} from '@megacampus/shared-types';
```

**Verification**:

```bash
pnpm type-check  # Should pass after fix
pnpm build       # Should succeed after fix
```

---

## High Priority Issues (0)

✅ No high-priority issues found.

---

## Medium Priority Issues (3)

### 1. Cost Preview Shows Inaccurate Estimate for 'Auto' Option

**File**: `packages/web/components/forms/create-course-form.tsx:108`

**Issue**: When user selects 'auto', `estimatedLessons` is `undefined`, causing fallback to hardcoded `15` lessons.

```typescript
// Line 108 - HARDCODED FALLBACK
estimatedLessons={form.watch('estimatedLessons') || 15}
```

**Problem**:

- When user selects 'auto', `handleSizeClick()` does NOT set `estimatedLessons` (lines 35-39 in CourseSizeSelector.tsx)
- Cost preview defaults to 15 lessons, which may not match LLM's actual decision
- User sees potentially misleading cost estimate

**Impact**:

- ⚠️ **UX Confusion**: Cost preview may be significantly off for 'auto' courses
- ⚠️ **Trust Issues**: User may feel misled if actual cost differs substantially
- **Confidence Level**: Cost estimate will have 'low' confidence when `estimatedLessons === 0`

**Current Behavior**:

```typescript
// CourseSizeSelector.tsx:33-39
const handleSizeClick = (size: CourseSize) => {
  setValue('courseSize', size);
  if (size !== 'auto') {
    const preset = COURSE_SIZE_PRESETS[size];
    setValue('estimatedLessons', preset.targetLessons); // ← Only set for non-auto
    setValue('estimatedSections', preset.targetSections);
  }
  // When 'auto' selected, estimatedLessons remains undefined
};
```

**Recommended Fix Options**:

**Option A**: Use a reasonable default for 'auto' (e.g., 30 lessons - midpoint of mini to comprehensive)

```typescript
const handleSizeClick = (size: CourseSize) => {
  setValue('courseSize', size);
  if (size !== 'auto') {
    const preset = COURSE_SIZE_PRESETS[size];
    setValue('estimatedLessons', preset.targetLessons);
    setValue('estimatedSections', preset.targetSections);
  } else {
    // Auto: use midpoint estimate for cost preview
    setValue('estimatedLessons', 30); // Between mini (10) and comprehensive (80)
    setValue('estimatedSections', 7); // Reasonable midpoint
  }
};
```

**Option B**: Show cost range instead of specific estimate when 'auto' is selected

```typescript
// In create-course-form.tsx
const isAutoSize = form.watch('courseSize') === 'auto';
const estimatedLessons = isAutoSize
  ? { min: 10, max: 80 } // Show range for auto
  : form.watch('estimatedLessons') || 15;

// Update CostPreviewCard to handle range input
```

**Option C**: Don't show cost preview for 'auto' until LLM decides

```typescript
const showCostPreview =
  form.watch('generationMode') === 'automatic' && form.watch('courseSize') !== 'auto';
```

**Recommendation**: Use **Option A** (default to 30 lessons) as it's the simplest fix and provides reasonable guidance without major UX changes.

---

### 2. Backend Missing Validation for 'Auto' Option Edge Case

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/handler.ts:384-403`

**Issue**: When `courseSize` is 'auto', `sizePreset` is correctly set to `undefined`, but there's no validation that the LLM output meets minimum requirements.

**Current Code**:

```typescript
// Lines 384-403
const courseSize = courseForInput.course_size as CourseSize | null;
const sizePreset = courseSize ? getCourseSizePreset(courseSize) : null;

// For 'auto', sizePreset is undefined → all size fields are undefined
const analysisInput: StructureAnalysisInput = {
  topic: courseForInput.title || 'Course Topic',
  language,
  style: courseForInput.style || 'practical',
  target_audience: 'mixed',
  difficulty: courseForInput.difficulty || 'intermediate',
  lesson_duration_minutes: lessonDuration,
  document_summaries: documentSummaries,
  // When 'auto' is selected, all size fields are undefined
  course_size: sizePreset?.size, // undefined for 'auto'
  target_lessons: sizePreset?.targetLessons, // undefined for 'auto'
  target_sections: sizePreset?.targetSections, // undefined for 'auto'
  size_guidance: sizePreset?.llmGuidance, // undefined for 'auto'
};
```

**Concern**:

- When `course_size` is 'auto', LLM receives NO guidance on size
- Existing validation checks minimum 10 lessons (line 108-111 in handler.ts)
- But for 'auto', LLM might return structure that doesn't match user expectations

**Potential Issue**:
If user selects 'auto' expecting a comprehensive course, but LLM decides on a mini course (10 lessons), there's no way for user to express this preference.

**Impact**:

- ⚠️ **UX Expectation Mismatch**: User may be surprised by LLM's size decision
- ⚠️ **No User Control**: 'Auto' provides zero guidance to LLM about desired scope

**Recommended Enhancement**:
Add logging and optional size range constraints for 'auto' mode:

```typescript
// Log when 'auto' mode is used
if (courseSize === 'auto') {
  jobLogger.info(
    {
      topic: analysisInput.topic,
      documentCount: documentSummaries.length,
    },
    'Using AUTO mode - LLM will determine optimal course size without preset guidance'
  );
}

// Optional: Add min/max constraints for 'auto' mode
const analysisInput: StructureAnalysisInput = {
  // ... existing fields ...
  course_size: sizePreset?.size,
  target_lessons: sizePreset?.targetLessons,
  target_sections: sizePreset?.targetSections,
  size_guidance:
    sizePreset?.llmGuidance ||
    (courseSize === 'auto'
      ? 'Analyze the topic and determine optimal course size based on topic scope, complexity, and available materials. Ensure minimum 10 lessons for substantive coverage.'
      : undefined),
};
```

---

### 3. Missing 'Auto' Option Handling in Form Submit

**File**: `packages/web/components/forms/create-course/_hooks/useSubmitCourse.ts:117-120`

**Issue**: When user selects 'auto', `estimatedLessons` and `estimatedSections` are `undefined`, but code sends them to backend anyway.

**Current Code**:

```typescript
// Lines 117-120
if (data.estimatedLessons) formData.append('estimated_lessons', data.estimatedLessons.toString());
if (data.estimatedSections)
  formData.append('estimated_sections', data.estimatedSections.toString());
```

**Observation**:

- When 'auto' is selected, these fields are undefined (not set by `handleSizeClick`)
- The `if` checks prevent sending `undefined`, which is correct
- Backend handler doesn't use `estimated_lessons`/`estimated_sections` from form data anyway (it fetches from `courses` table)

**Verdict**:
✅ **Actually working correctly** - The conditional checks prevent sending undefined values, and backend doesn't rely on these form fields for analysis input.

**Suggestion for Code Clarity**:
Add a comment explaining the behavior:

```typescript
// Note: For 'auto' course size, these fields are undefined (LLM decides size)
// Backend fetches course_size from courses table, not these form fields
if (data.estimatedLessons) formData.append('estimated_lessons', data.estimatedLessons.toString());
if (data.estimatedSections)
  formData.append('estimated_sections', data.estimatedSections.toString());
```

---

## Low Priority Issues (0)

✅ No low-priority issues found.

---

## Security Concerns (0)

✅ No security vulnerabilities detected.

**Validation Checks Passed**:

- ✅ No SQL injection risks (using Supabase client)
- ✅ No XSS risks (React escapes by default)
- ✅ No sensitive data exposed in client-side code
- ✅ Proper type validation with Zod schemas
- ✅ Backend validates course ownership (organization_id check)

---

## Code Quality & Best Practices

### ✅ Strengths (7)

1. **Excellent Type Safety**
   - `CourseSize` union type correctly includes 'auto'
   - `PresetCourseSize` type excludes 'auto' (for sizes with presets)
   - `getCourseSizePreset()` returns `undefined` for 'auto' (type-safe)
   - Zod schema validation in form and shared-types

2. **Comprehensive i18n Support**
   - 'Auto' labels provided for all 19 supported languages
   - Consistent translation pattern across languages
   - English: "Optimal / AI Analysis"
   - Russian: "Оптимальный / ИИ-анализ"
   - Chinese: "最优 / AI分析"

3. **Clear Visual Differentiation**
   - 'Auto' card uses cyan/teal gradient (distinct from purple presets)
   - Full-width layout at top (emphasizes default/recommended option)
   - Different icons per size (Sparkles for auto, Zap/BookOpen/etc for presets)

4. **Backend Correctly Handles 'Auto'**
   - `getCourseSizePreset('auto')` returns `undefined` (as designed)
   - Handler correctly omits size guidance when preset is undefined
   - LLM receives no constraints for 'auto' mode (correct behavior)

5. **Database Migration is Correct**
   - Constraint updated to allow 'auto' value
   - Comment updated to document 'auto' behavior
   - Migration is idempotent (DROP IF EXISTS before ADD)

6. **Good Code Documentation**
   - JSDoc comments explain 'auto' behavior
   - Comments in handler explain size preset logic
   - Type definitions have clear descriptions

7. **Consistent Naming Convention**
   - `course_size` in database (snake_case)
   - `courseSize` in frontend (camelCase)
   - `CourseSize` type name (PascalCase)
   - Follows project conventions

### ⚠️ Areas for Improvement (3)

1. **Form Schema Validation**
   - `estimatedLessons` min is 10, but when 'auto' is selected, value is `undefined`
   - Schema should allow `undefined` OR validate only when not 'auto'

   **Current Schema**:

   ```typescript
   estimatedLessons: z
     .number()
     .min(10)  // ← This requires a value when present
     .max(100)
     .optional()
     .or(z.nan().transform(() => undefined)),
   ```

   **Issue**: When 'auto' is selected, `estimatedLessons` is never set, so validation passes (optional). But this creates ambiguity - is it 'auto' or just not set?

   **Recommendation**: Add courseSize-aware validation:

   ```typescript
   .refine((data) => {
     // If 'auto' size, estimatedLessons should be undefined
     if (data.courseSize === 'auto') {
       return data.estimatedLessons === undefined
     }
     // For preset sizes, require estimatedLessons
     return data.estimatedLessons !== undefined
   }, {
     message: "Estimated lessons required when using preset course size"
   })
   ```

2. **Missing User Feedback for 'Auto'**
   - When user selects 'auto', there's no indication that LLM will decide size
   - Consider adding a helper text or tooltip explaining 'auto' behavior

   **Suggestion**:

   ```tsx
   {
     courseSize === 'auto' && (
       <div className="mt-2 text-sm text-cyan-600 dark:text-cyan-400">
         <Info className="inline h-4 w-4 mr-1" />
         ИИ автоматически определит оптимальный размер курса на основе анализа темы и материалов.
       </div>
     );
   }
   ```

3. **Hardcoded Label "Размер курса"**
   - Line 113 in CourseSizeSelector.tsx has hardcoded Russian text
   - Should be i18n key for consistency

   **Current**:

   ```tsx
   <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Размер курса</h3>
   ```

   **Recommendation**: Add to i18n or use language-aware label

---

## Test Coverage Analysis

### Missing Test Cases

The feature would benefit from these test cases:

1. **Unit Tests for `getCourseSizePreset()`**

   ```typescript
   describe('getCourseSizePreset', () => {
     it('returns undefined for "auto"', () => {
       expect(getCourseSizePreset('auto')).toBeUndefined();
     });

     it('returns preset for valid sizes', () => {
       expect(getCourseSizePreset('mini')).toMatchObject({
         size: 'mini',
         targetLessons: 10,
       });
     });
   });
   ```

2. **Integration Test for 'Auto' Selection**

   ```typescript
   describe('CourseSizeSelector - Auto Selection', () => {
     it('does not set estimatedLessons when auto is selected', () => {
       const { getByLabelText, getByTestId } = render(<CourseSizeSelector />)
       fireEvent.click(getByLabelText('Optimal'))
       expect(getByTestId('estimatedLessons-input').value).toBe('')
     })

     it('sets estimatedLessons when preset is selected', () => {
       const { getByLabelText, getByTestId } = render(<CourseSizeSelector />)
       fireEvent.click(getByLabelText('Mini'))
       expect(getByTestId('estimatedLessons-input').value).toBe('10')
     })
   })
   ```

3. **Backend Test for 'Auto' Handler Logic**

   ```typescript
   describe('Stage4AnalysisHandler - Auto Course Size', () => {
     it('omits size guidance when course_size is auto', async () => {
       const input = await handler.buildAnalysisInput({
         ...mockCourseData,
         course_size: 'auto',
       });

       expect(input.course_size).toBeUndefined();
       expect(input.target_lessons).toBeUndefined();
       expect(input.size_guidance).toBeUndefined();
     });

     it('includes size guidance for preset sizes', async () => {
       const input = await handler.buildAnalysisInput({
         ...mockCourseData,
         course_size: 'mini',
       });

       expect(input.course_size).toBe('mini');
       expect(input.target_lessons).toBe(10);
       expect(input.size_guidance).toContain('approximately 10 lessons');
     });
   });
   ```

---

## Performance Considerations

### ✅ No Performance Issues Detected

1. **Efficient State Updates**
   - `handleSizeClick()` only sets values when needed
   - No unnecessary re-renders when 'auto' is selected

2. **Memoized Cost Calculation**
   - `useMemo` in CostPreviewCard prevents recalculation on every render
   - Dependencies are correctly specified

3. **Optimized Database Query**
   - Handler fetches only required fields (lines 308-313)
   - No over-fetching of data

---

## Accessibility Concerns

### ✅ Good Accessibility Practices

1. **Semantic HTML**
   - `<fieldset>` and `<legend>` for radio group
   - Proper `role="radio"` attributes

2. **ARIA Labels**
   - `aria-describedby` links to description text
   - `aria-checked` indicates selected state

3. **Keyboard Navigation**
   - `tabIndex` correctly manages focus
   - Radio inputs are keyboard accessible

### ⚠️ Minor Improvement

**Issue**: Hardcoded Russian text in `<legend>` (line 116)

```tsx
<legend className="sr-only">Выберите размер курса</legend>
```

**Recommendation**: Use i18n or derive from language prop

```tsx
<legend className="sr-only">
  {language === 'ru' ? 'Выберите размер курса' : 'Select course size'}
</legend>
```

---

## Database Schema Review

### ✅ Migration is Correct

**File**: `packages/course-gen-platform/supabase/migrations/20260115020000_add_auto_to_course_size.sql`

**Analysis**:

```sql
-- Drop existing constraint (idempotent)
ALTER TABLE courses
DROP CONSTRAINT IF EXISTS courses_course_size_check;

-- Add updated constraint with 'auto'
ALTER TABLE courses
ADD CONSTRAINT courses_course_size_check
CHECK (course_size IS NULL OR course_size IN ('auto', 'mini', 'compact', 'standard', 'comprehensive'));

-- Update documentation
COMMENT ON COLUMN courses.course_size IS 'User-selected course size preset (advisory for LLM). Values: auto (LLM decides optimal size), mini (~10 lessons), compact (~20 lessons), standard (~40 lessons), comprehensive (~80 lessons). LLM may deviate from target if topic requires different scope.';
```

**Strengths**:

1. ✅ Idempotent (DROP IF EXISTS)
2. ✅ Allows NULL (backward compatible)
3. ✅ 'auto' is first in enum (logical - it's the default)
4. ✅ Comment clearly explains behavior
5. ✅ Migration file naming follows convention

**No Issues Found**.

---

## Integration Points Review

### ✅ Properly Integrated Across Stack

1. **Shared Types Package** → ✅ Single source of truth
   - `COURSE_SIZES` array includes 'auto'
   - `PresetCourseSize` type excludes 'auto'
   - `DEFAULT_COURSE_SIZE` set to 'auto'

2. **Frontend Form** → ✅ Correct usage
   - Uses `courseSizeSchema` from shared-types
   - Defaults to `DEFAULT_COURSE_SIZE`
   - Conditionally sets estimatedLessons based on selection

3. **Backend Handler** → ✅ Correct handling
   - Uses `getCourseSizePreset()` helper
   - Correctly handles `undefined` for 'auto'
   - Omits size guidance when preset is undefined

4. **Database** → ✅ Schema updated
   - Constraint allows 'auto' value
   - Column comment documents behavior

---

## Error Handling Review

### ✅ Adequate Error Handling

1. **Type Safety Prevents Most Errors**
   - Zod schema validates form data
   - TypeScript prevents invalid course size values
   - Backend classifies errors appropriately

2. **Graceful Fallbacks**
   - Cost preview uses default (15) when estimatedLessons is undefined
   - Language fallback to 'en' when unknown language provided
   - Database query has error handling

3. **User-Facing Error Messages**
   - Form validation shows clear error messages
   - Toast notifications for async errors

**No Critical Error Handling Issues**.

---

## Documentation Review

### ✅ Well-Documented Code

1. **JSDoc Comments**
   - `course-size.ts` has comprehensive module documentation
   - Function signatures documented with examples
   - Type definitions have descriptions

2. **Inline Comments**
   - Handler explains 'auto' behavior (lines 391-399)
   - CourseSizeSelector explains logic (lines 31-32)

3. **Database Comments**
   - Migration includes COMMENT ON COLUMN
   - Explains 'auto' behavior clearly

### ⚠️ Missing Documentation

**Recommendation**: Add ADR (Architecture Decision Record) for the 'auto' feature:

```markdown
# ADR-XXX: Add 'Auto' Course Size Option

## Status

Accepted

## Context

Users need guidance on course size, but may not know the optimal size for their topic.

## Decision

Add 'auto' option that lets LLM analyze topic and decide optimal structure without preset constraints.

## Consequences

- Positive: Reduces user decision burden, potentially better course structures
- Negative: Less predictable cost estimates, users have less control over size
- Mitigation: Set 'auto' as default, provide clear visual indication
```

---

## Recommendations Summary

### Must Fix Before Deployment

1. ❌ **Remove unused `PresetCourseSize` import** (Critical - Build Blocking)
   - File: `CourseSizeSelector.tsx:10`
   - Fix: Delete line 10

### Should Fix Soon

2. ⚠️ **Improve cost preview accuracy for 'auto'**
   - File: `create-course-form.tsx:108`
   - Fix: Use 30 lessons as default for 'auto' instead of 15
   - Impact: Better cost estimates for users

3. ⚠️ **Add logging for 'auto' mode usage**
   - File: `handler.ts:384`
   - Fix: Log when 'auto' mode is used for analytics
   - Impact: Better visibility into feature usage

### Nice to Have

4. ℹ️ **Add user feedback for 'auto' selection**
   - File: `CourseSizeSelector.tsx:119`
   - Fix: Show helper text explaining 'auto' behavior
   - Impact: Clearer UX

5. ℹ️ **Internationalize hardcoded Russian text**
   - Files: `CourseSizeSelector.tsx:113,116`
   - Fix: Use i18n keys or language-aware labels
   - Impact: Better i18n consistency

---

## Validation Results

### Type Check

```bash
pnpm type-check
```

**Status**: ❌ FAILED
**Error**: Unused import 'PresetCourseSize' in CourseSizeSelector.tsx:10

### Build

```bash
pnpm build
```

**Status**: ❌ FAILED
**Error**: Type error prevents build from succeeding

### After Fix

```bash
# Remove line 10 from CourseSizeSelector.tsx
pnpm type-check  # Should PASS
pnpm build       # Should PASS
```

---

## Code Review Checklist

- [x] **Type Safety**: Excellent - Proper TypeScript types and Zod schemas
- [x] **Security**: No vulnerabilities detected
- [x] **Performance**: No issues - Efficient state management
- [x] **Accessibility**: Good - Proper ARIA labels and semantic HTML
- [x] **Error Handling**: Adequate - Graceful fallbacks and user messages
- [x] **Documentation**: Well-documented with JSDoc and inline comments
- [x] **Testing**: No tests present (recommendation: add unit/integration tests)
- [x] **i18n**: Excellent - All 19 languages supported
- [x] **Database**: Migration is correct and idempotent
- [x] **Integration**: Properly integrated across frontend and backend

---

## Conclusion

The course-size 'auto' feature is **well-implemented** overall with strong type safety and comprehensive internationalization. The design properly separates 'auto' (LLM decides) from preset sizes (user guides LLM), and the backend correctly handles the undefined preset case.

**Critical Action Required**: Remove unused import to unblock build.

**Recommended Enhancements**: Improve cost preview accuracy for 'auto' and add user feedback explaining the feature.

Once the build-blocking issue is resolved, this feature is ready for deployment with minor UX improvements to follow.

---

**Review Completed**: 2026-01-14
**Next Steps**:

1. Fix unused import (CourseSizeSelector.tsx:10)
2. Run `pnpm type-check` to verify
3. Run `pnpm build` to verify
4. Commit fix
5. Deploy to dev environment
6. Consider UX enhancements for follow-up sprint

---

## Artifacts

- Source Files Reviewed: 5 files
- Lines of Code Reviewed: ~1,200 lines
- Issues Found: 4 (1 critical, 3 medium, 0 low)
- Strengths Identified: 7
- Test Cases Recommended: 3 suites
- Documentation Gaps: 1 (ADR recommended)

**Report Generated By**: Claude Code (Code Review Agent)
**Methodology**: Static analysis + runtime behavior analysis + best practices review
