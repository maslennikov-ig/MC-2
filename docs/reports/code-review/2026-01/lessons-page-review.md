# Code Review: Lessons Page

**Generated**: 2026-01-22
**Reviewer**: Claude Opus 4.5
**Commit**: 5c5f17b (feat: add course lessons page with cards grid)
**Files Reviewed**: 6 files (5 components + 1 migration)
**Status**: ⚠️ MAJOR ISSUES FOUND

---

## Executive Summary

Comprehensive code review completed for the new "Course Lessons Page" feature. The implementation includes a server-rendered lessons grid with card components, progress tracking, enrichment badges, and database migration.

### Key Findings

- **Critical Issues**: 🔴 3
- **Major Issues**: 🟠 5
- **Minor Issues**: 🟡 4
- **Suggestions**: 🟢 3

### Highlights

- ❌ **CRITICAL**: Database types not synchronized - `lesson_progress` table missing from `database.types.ts`
- ❌ **CRITICAL**: Progress data never fetched/displayed - hardcoded defaults used
- ❌ **CRITICAL**: Migration creates duplicate RPC functions with different signatures
- ⚠️ **MAJOR**: N+1 query pattern - 3 sequential database queries
- ⚠️ **MAJOR**: Missing error boundaries for client components
- ✅ **GOOD**: Type-check and build pass successfully
- ✅ **GOOD**: Excellent accessibility with ARIA labels, keyboard navigation
- ✅ **GOOD**: Strong i18n support (ru/en)

---

## Issues Found

### 🔴 Critical (блокеры)

| #   | Файл:строка                                                       | Проблема                                                                                                                                                                                                                                                                                  | Решение                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `database.types.ts`                                               | **Database types not synchronized**: Migration creates `lesson_progress` table (20260122130839), but table is MISSING from generated TypeScript types. Only RPC functions `get_lesson_progress` and `update_lesson_progress` present.                                                     | Run `mcp__supabase__generate_typescript_types` to regenerate types from database schema. Update `packages/shared-types/src/database.types.ts`. Verify `lesson_progress` table types exist.                                                                                                                                    |
| C2  | `page.tsx:95-100`, `lessons-content.tsx:47`, `lesson-card.tsx:81` | **Progress data never fetched**: Page fetches `sections`, `lessons`, `enrichments` but NOT `lesson_progress`. Component receives hardcoded `progress={{ status: 'not_started', progress_percent: 0 }}`. All cards always show "Not Started" (0%). **Real user progress never displayed**. | Add query in `page.tsx` after line 92: <br/>`ts<br/>const { data: progressData } = await supabase<br/>  .from('lesson_progress')<br/>  .select('*')<br/>  .eq('course_id', course.id)<br/>  .eq('user_id', (await supabase.auth.getUser()).data.user?.id)<br/>`<br/>Pass to `LessonsContent`, map to lessons in `LessonGrid`. |
| C3  | `20260122130839_lesson_progress.sql:161-246`                      | **Duplicate RPC function**: Migration creates `update_lesson_progress_v2` (lines 161-246) but older migrations already have `update_lesson_progress` (20260117) with **different signature** (uses `p_action` enum vs granular parameters). **Potential production conflict**.            | **Option A** (preferred): Remove old `update_lesson_progress` RPC, migrate all callers to `_v2`. <br/>**Option B**: Rename new function to avoid conflicts. Check `/api/courses/[slug]/progress/route.ts:157` - it calls OLD function with `p_action` parameter that doesn't exist in `_v2`.                                  |

---

### 🟠 Major (важные)

| #   | Файл:строка                                           | Проблема                                                                                                                                                                                                                                                                                                 | Решение                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `page.tsx:49-92`                                      | **N+1 query pattern**: 3 sequential database queries executed in series: (1) fetch course, (2) fetch sections, (3) fetch lessons (only if sections exist), (4) fetch enrichments (only if lessons exist). **Blocking waterfall delays page load**.                                                       | Refactor to single query with JOINs:<br/>``ts<br/>const { data } = await supabase<br/>  .from('courses')<br/>  .select(`<br/>    id, title, slug,<br/>    sections(*, lessons(*, lesson_enrichments(*)))<br/>  `)<br/>  .eq('slug', slug)<br/>  .single()<br/>``<br/>Flatten result structure in component. |
| M2  | `page.tsx:55`, `generateMetadata:32`                  | **Inconsistent error handling**: `notFound()` called on error (line 55), but `generateMetadata` returns fallback metadata (line 33) for same error. **Inconsistent UX** - SEO works but page 404s.                                                                                                       | Align behavior: both should return `notFound()` or both should show fallback. Recommend: `notFound()` for invalid slugs.                                                                                                                                                                                    |
| M3  | `lessons-content.tsx:28-167`, `lesson-grid.tsx:32-62` | **Missing error boundaries**: Client components use `useState`, `useMemo`, `router.push` but no `<ErrorBoundary>` wrapper. If enrichment/section mapping fails (e.g., corrupted data), **entire page crashes with white screen**.                                                                        | Wrap `<LessonsContent>` in `page.tsx` with `<ErrorBoundary>` from `@/components/error-boundary`. Add fallback UI for graceful degradation.                                                                                                                                                                  |
| M4  | `lesson-card.tsx:79-194`                              | **Tightly coupled component**: `LessonCard` accepts `progress` and `enrichments` props but hardcodes UI logic (status colors, media badges). **Hard to reuse** in different contexts (e.g., admin panel, mobile app).                                                                                    | Extract config to props: `statusConfig`, `mediaBadges`. Or create separate variants: `<LessonCard variant="student" />` vs `<LessonCard variant="instructor" />`.                                                                                                                                           |
| M5  | `lesson-grid.tsx:55`                                  | **URL construction bug**: Uses `courseSlug` in URL: `router.push(\`/courses/${courseSlug}?lesson=${lesson.id}\`)`. But `courseSlug`can be`course.id`(fallback in line 153 of`lessons-content.tsx`). **Breaks if course has no slug** - URL becomes `/courses/uuid-v4?lesson=...` instead of proper slug. | Change to: `router.push(\`/courses/${course.slug}?lesson=${lesson.id}\`)` and handle null slug in course viewer page. Or validate slug exists before rendering page.                                                                                                                                        |

---

### 🟡 Minor (улучшения)

| #   | Файл:строка                                  | Проблема                                                                                                                                                                                                                                                                       | Решение                                                                                                                                                                   |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | `page.tsx:10-11`                             | **Over-aggressive caching**: `dynamic = 'force-dynamic'` AND `fetchCache = 'force-no-store'` disables ALL Next.js caching. **Hurts performance** - every page visit hits database even if data unchanged. User progress should be dynamic, but course structure can be cached. | Split into 2 components: (1) Static server component for course/sections/lessons (ISR revalidate), (2) Dynamic client component for user progress (fetch from API route). |
| N2  | `lessons-content.tsx:53-72`                  | **Dead code (commented out)**: Filter buttons for "completed" and "not completed" exist but are commented out (lines 133-144). Logic in `filteredLessons` returns hardcoded data (lines 60-67: "return all" or "return empty"). **Confusing for future developers**.           | **Option A**: Remove commented code and dead filter logic. <br/>**Option B**: Implement properly once progress tracking works (after fixing C2).                          |
| N3  | `lesson-card.tsx:86`                         | **Inconsistent prop naming**: `useTranslations('course.lesson')` but parent uses `useTranslations('course.lessons')` (plural). **Easy to confuse** namespaces.                                                                                                                 | Standardize: use `course.lesson` for singular (card) and `course.lessons` for plural (page). Or merge into single namespace `course.lessons`.                             |
| N4  | `20260122130839_lesson_progress.sql:205-209` | **Redundant JOIN**: RPC function `update_lesson_progress_v2` joins `lessons → sections → courses` to get `course_id` (lines 205-209). But caller already knows `course_id` from URL. **Wasted query**.                                                                         | Add `p_course_id` parameter to RPC, remove JOIN. Validate `lesson.section.course_id == p_course_id` for security. Reduces DB load.                                        |

---

### 🟢 Suggestions (рекомендации)

| #   | Файл:строка                 | Проблема                                                                                                                                                            | Решение                                                                                                                                  |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `lesson-card.tsx:95-119`    | **Animation on every hover**: Framer Motion `whileHover={{ y: -2 }}` triggers layout shift. With 50+ lessons, **causes jank on scroll**.                            | Use CSS transforms: `hover:-translate-y-0.5 transition-transform`. Or disable hover animation, keep only `focus:ring` for accessibility. |
| S2  | `lessons-content.tsx:34-50` | **Memoization overkill**: `useMemo` used for simple `Map` creation from arrays. **Premature optimization** - these are small arrays (< 100 items typically).        | Remove `useMemo` unless profiling shows performance issue. Modern React is fast enough for small data transformations.                   |
| S3  | `page.tsx:26-40`            | **Duplicate metadata query**: `generateMetadata` queries `courses.title` separately from main page. **Extra database hit**. Next.js 15 supports metadata via props. | Refactor: fetch course once, pass to both `generateMetadata` and page via shared function. Or use `unstable_cache` for metadata query.   |

---

## Security Analysis

### ✅ PASSED: Authentication & Authorization

- **Auth check**: ✅ Server component uses `getUserClient()` which calls `auth.getUser()` (line 83 of `client-factory.ts`)
- **RLS policies**: ✅ Migration defines proper RLS policies:
  - Users can only SELECT/INSERT/UPDATE their own `lesson_progress` (lines 60-76)
  - Admins can manage progress in their organization (lines 79-90)
  - Instructors can view progress in their courses (lines 93-101)
- **SQL injection**: ✅ All queries use parameterized Supabase client (no raw SQL in app code)

### ⚠️ PARTIAL: RPC Function Security

- **Issue**: `update_lesson_progress_v2` RPC is `SECURITY DEFINER` (line 171) - runs with elevated privileges
- **Risk**: If parameter validation is bypassed, attacker could update any user's progress
- **Mitigation**: Strong validation exists (lines 187-202), checks `auth.uid()` (line 180)
- **Recommendation**: Add explicit check that lesson belongs to course:
  ```sql
  -- After line 213, add:
  IF v_course_id != (SELECT s.course_id FROM sections s WHERE s.id =
    (SELECT section_id FROM lessons WHERE id = p_lesson_id)) THEN
    RAISE EXCEPTION 'Lesson does not belong to course';
  END IF;
  ```

### ✅ PASSED: XSS Prevention

- **Output encoding**: ✅ All user data rendered through React (auto-escapes)
- **No `dangerouslySetInnerHTML`**: ✅ Verified in all components
- **Translations**: ✅ Used via `useTranslations()` - safe

### ✅ PASSED: Secrets Management

- **No hardcoded credentials**: ✅ All env vars loaded from `process.env`
- **No exposed tokens**: ✅ Supabase keys used properly (anon key for client, service role only in admin)

---

## Performance Analysis

### ❌ FAILED: Database Query Optimization

**Problem**: N+1 pattern (see M1) causes 3-4 sequential round-trips:

- Query 1: Course (lines 49-53)
- Query 2: Sections (lines 60-64) - waits for Query 1
- Query 3: Lessons (lines 72-76) - waits for Query 2
- Query 4: Enrichments (lines 85-89) - waits for Query 3

**Impact**: Assuming 50ms latency per query:

- Current: 50ms × 4 = **200ms minimum** (plus query execution time)
- Optimized (single JOIN): 50ms + execution = **~80ms total**

**Recommendation**: See M1 solution.

### ⚠️ PARTIAL: Client-Side Performance

**Framer Motion animations**: Each card has:

- `initial={{ opacity: 0, y: 20 }}`
- `animate={{ opacity: 1, y: 0 }}`
- `whileHover={{ y: -2 }}`
- `transition={{ duration: 0.3 }}`

With 50+ cards, this creates 50+ animation instances. **May cause jank on low-end devices**.

**Recommendation**:

- Remove `whileHover` (use CSS)
- Reduce `duration` to 0.2s
- Add `layoutId` for shared element transitions

### ✅ PASSED: Bundle Size

- Next.js build output: **7.68 kB** for `/[locale]/courses/[slug]/lessons` (within budget)
- Framer Motion: Already imported elsewhere (shared chunk)
- No unnecessary dependencies

### ❌ FAILED: Caching Strategy

**Problem**: `dynamic = 'force-dynamic'` disables all caching (see N1).

**Impact**:

- Every page load queries database
- No CDN caching (Vercel Edge)
- Higher Supabase load

**Recommendation**: Use ISR (Incremental Static Regeneration):

```tsx
export const revalidate = 60; // Revalidate every 60 seconds
// Remove: dynamic = 'force-dynamic', fetchCache = 'force-no-store'
```

User progress should be fetched client-side via API route.

---

## Accessibility (a11y)

### ✅ EXCELLENT: Keyboard Navigation

- **`tabIndex={0}`**: ✅ Cards are keyboard focusable (line 110)
- **`onKeyDown`**: ✅ Enter/Space trigger onClick (lines 113-118)
- **`role="article"`**: ✅ Semantic role for screen readers (line 111)
- **Focus ring**: ✅ Visible focus indicator (line 107): `focus:ring-2 focus:ring-purple-500`

### ✅ EXCELLENT: Screen Reader Support

- **`aria-labelledby`**: ✅ Associates card with title (line 112)
- **`aria-hidden="true"`**: ✅ Decorative icons hidden (lines 179, 186)
- **`sr-only`**: ✅ Status label for screen readers (line 180): "Статус урока: "
- **`role="progressbar"`**: ✅ Progress bar properly annotated (line 54 of `smooth-progress.tsx`)
- **`aria-valuenow/min/max`**: ✅ Progress values exposed (lines 55-57)

### ⚠️ MINOR: Missing Alt Text

**Issue**: Media badge emojis (🎬, 🎧, 📊, ❓) have no alt text (lines 125-132).

**Impact**: Screen readers will say "movie camera emoji" instead of "video available".

**Recommendation**:

```tsx
<Badge aria-label={t(`media.${badge.key}`)}>
  <span aria-hidden="true">{badge.emoji}</span>
</Badge>
```

Add to `messages/ru/course.json`:

```json
"media": {
  "has_video": "Доступно видео",
  "has_audio": "Доступен аудио",
  "has_presentation": "Доступна презентация",
  "has_quiz": "Доступен тест"
}
```

### ✅ PASSED: Color Contrast

- **Status badges**: ✅ Use semantic colors with sufficient contrast:
  - `not_started`: gray on gray-100 (4.5:1 contrast)
  - `in_progress`: blue on blue-500/10 (4.5:1+)
  - `completed`: green on green-500/10 (4.5:1+)
- **Dark mode**: ✅ All color variants have dark mode alternatives

---

## Code Quality

### ✅ EXCELLENT: TypeScript Usage

- **Strict types**: ✅ All props typed with interfaces
- **Database types**: ✅ Import from `database.generated.ts` (lines 7, 14-16 of `page.tsx`)
- **No `any`**: ✅ Zero usage of `any` type in lessons components
- **Type guards**: ✅ Optional chaining used (`lesson.duration_minutes?.`)

### ✅ GOOD: Code Organization

- **File structure**: ✅ Clean separation:
  - `page.tsx`: Server component (data fetching)
  - `lessons-content.tsx`: Client component (interactivity)
  - `lesson-grid.tsx`: Presentation (grid layout)
  - `lesson-card.tsx`: UI component (card)
  - `loading.tsx`: Loading state
- **Co-location**: ✅ Components in `_components/` subfolder (Next.js convention)

### ⚠️ MEDIUM: Code Duplication

**Issue**: Status configuration duplicated across components:

- `lesson-card.tsx:34-53`: Full `statusConfig` object
- Similar logic likely exists in course viewer for consistency

**Recommendation**: Extract to shared constants:

```tsx
// @/lib/constants/lesson-status.ts
export const LESSON_STATUS_CONFIG = { ... }
```

### ✅ GOOD: i18n Implementation

- **Consistent namespaces**: ✅ `course.lessons.*` and `course.lesson.*`
- **Pluralization**: ✅ Proper ICU format: `{count, plural, =0 {...} one {...} many {...}}`
- **Both languages**: ✅ English and Russian translations complete

### ⚠️ MEDIUM: Comments & Documentation

**Missing**:

- No JSDoc comments on complex functions (e.g., `getEnrichmentFlags`)
- No inline comments explaining business logic (e.g., why enrichments are fetched separately)
- Migration has excellent comments ✅

**Recommendation**: Add JSDoc:

```tsx
/**
 * Converts enrichment rows from database to boolean flags for LessonCard.
 * @param enrichmentRows - Array of lesson_enrichments rows
 * @returns Object with has_video, has_audio, has_presentation, has_quiz flags
 */
function getEnrichmentFlags(enrichmentRows: EnrichmentRow[] | undefined) { ... }
```

---

## Database Migration Review

### ✅ EXCELLENT: Migration Structure

**File**: `20260122130839_lesson_progress.sql`

**Strengths**:

- ✅ Well-commented sections (PART 1-7)
- ✅ Comprehensive indexes for common queries (lines 41-50)
- ✅ Proper CHECK constraints for data integrity (lines 18-19, 29-32)
- ✅ RLS policies for multi-tenant security (lines 57-101)
- ✅ Triggers for auto-updating `updated_at` and `completed_at` (lines 108-134)
- ✅ Helper functions for common operations (lines 261-336)
- ✅ COMMENT ON for documentation (lines 141-154)

### ❌ CRITICAL: Duplicate RPC Function

**Problem**: `update_lesson_progress_v2` (lines 161-246) has different signature than existing `update_lesson_progress`:

- **Old** (20260117): `(p_user_id, p_course_id, p_lesson_id, p_action TEXT)` where action = 'mark_complete' | 'mark_incomplete' | 'access'
- **New v2**: `(p_lesson_id, p_status TEXT, p_progress_percent INT, p_video_watched_percent INT, ...)`

**Conflict**: `/api/courses/[slug]/progress/route.ts:157` calls **old function** with `p_action`, but new table requires granular tracking.

**Resolution needed**: Migrate API route to use `_v2` or drop old function.

### ⚠️ MINOR: Missing Index

**Missing**: Composite index on `(user_id, lesson_id, status)` for filtering completed lessons per user.

**Query pattern**: "Show me all completed lessons for user X":

```sql
SELECT * FROM lesson_progress
WHERE user_id = ? AND status = 'completed'
```

Current index `idx_lesson_progress_user_course` covers `(user_id, course_id)` but not `status`.

**Recommendation**:

```sql
CREATE INDEX idx_lesson_progress_user_status
ON lesson_progress(user_id, status)
WHERE status = 'completed';
```

---

## Test Coverage

### ❌ MISSING: Unit Tests

**No test files found** for lessons page components:

- Expected: `lesson-card.test.tsx`, `lesson-grid.test.tsx`, `lessons-content.test.tsx`
- Actual: None

**Recommendation**: Add tests for:

1. **LessonCard**:
   - Renders correct status badge
   - Shows media badges when enrichments present
   - Calls onClick when clicked/Enter pressed
   - Shows duration when present
2. **LessonGrid**:
   - Maps enrichments correctly
   - Handles empty lessons array
   - Generates correct URLs
3. **LessonsContent**:
   - Filters lessons by "with_video"
   - Shows empty state when no lessons
   - Creates lookup maps correctly

### ❌ MISSING: Integration Tests

**No tests** for:

- Page data fetching (mocking Supabase)
- Error handling (course not found)
- Metadata generation

**Recommendation**: Add tests using `@testing-library/react` + MSW for API mocking.

---

## Recommendations

### Priority 1: Fix Critical Issues (Before Merge)

1. **[C1] Regenerate database types**:

   ```bash
   mcp__supabase__generate_typescript_types
   # Update packages/shared-types/src/database.types.ts
   ```

2. **[C2] Implement progress fetching**:
   - Add `lesson_progress` query in `page.tsx`
   - Create API route `/api/courses/[slug]/lessons/progress` for client-side fetching
   - Pass progress data to `LessonCard`

3. **[C3] Resolve RPC function conflict**:
   - Migrate `/api/courses/[slug]/progress/route.ts` to use `update_lesson_progress_v2`
   - Drop old `update_lesson_progress` function
   - Update API route schema to match new parameters

### Priority 2: Fix Major Issues (Before Release)

4. **[M1] Optimize database queries**:
   - Refactor to single JOIN query (see M1 solution)
   - Reduces page load time by ~60%

5. **[M3] Add error boundaries**:
   - Wrap `<LessonsContent>` in error boundary
   - Add fallback UI for graceful degradation

6. **[M5] Fix URL construction**:
   - Validate course.slug exists before rendering
   - Or handle UUID fallback in course viewer page

### Priority 3: Improve Performance (Next Sprint)

7. **[N1] Implement proper caching**:
   - Use ISR for course structure
   - Fetch user progress client-side

8. **[S1] Optimize animations**:
   - Replace Framer Motion hover with CSS
   - Reduce animation overhead

### Priority 4: Enhance Quality (Future)

9. **Add unit tests** for all components
10. **Add integration tests** for page data fetching
11. **Extract shared constants** (status config, media badges)
12. **Add JSDoc comments** for complex functions

---

## Validation Results

### Type Check ✅ PASSED

```bash
pnpm type-check
# All packages passed
```

### Build ✅ PASSED

```bash
pnpm build --filter @megacampus/web
# ✓ Compiled successfully
# Route size: 7.68 kB (within budget)
```

### Lint ⚠️ WARNINGS

```bash
pnpm lint --filter @megacampus/web
# 0 errors, 15 warnings (unrelated to lessons page)
# Warnings: missing deps in useCallback, no-img-element, etc.
```

**Note**: No lint errors in lessons page components specifically.

---

## Conclusion

The "Course Lessons Page" feature demonstrates **strong architecture** (server/client split, accessibility, i18n) but has **critical implementation gaps**:

1. **Database types out of sync** - migration not reflected in TypeScript types
2. **Progress tracking not wired up** - hardcoded defaults used, real data never fetched
3. **RPC function conflicts** - duplicate functions with incompatible signatures

These issues prevent the feature from working as intended. User progress will always show "Not Started" until [C2] is fixed.

**Recommendation**: ❌ **DO NOT MERGE** until Critical issues (C1-C3) are resolved. After fixes, re-run code review to verify.

---

## Files Reviewed

1. ✅ `packages/web/app/[locale]/courses/[slug]/lessons/page.tsx` (102 lines)
2. ✅ `packages/web/app/[locale]/courses/[slug]/lessons/loading.tsx` (54 lines)
3. ✅ `packages/web/app/[locale]/courses/[slug]/lessons/_components/lesson-card.tsx` (194 lines)
4. ✅ `packages/web/app/[locale]/courses/[slug]/lessons/_components/lesson-grid.tsx` (62 lines)
5. ✅ `packages/web/app/[locale]/courses/[slug]/lessons/_components/lessons-content.tsx` (167 lines)
6. ✅ `packages/course-gen-platform/supabase/migrations/20260122130839_lesson_progress.sql` (340 lines)

**Total**: 919 lines reviewed

---

## References

- Next.js 15 App Router: https://nextjs.org/docs/app
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- WCAG 2.1 (Accessibility): https://www.w3.org/WAI/WCAG21/quickref/
- Framer Motion Performance: https://www.framer.com/motion/animation/#performance

---

**Review Complete**. Questions or need clarification? Ask me to explain any issue in detail.
