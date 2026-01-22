# Code Review: Course Covers Integration

**Generated**: 2026-01-21
**Reviewer**: Claude Code
**Scope**: Course covers integration (lesson_enrichments → course cards)
**Files Reviewed**: 6 files

---

## Summary

The course covers integration successfully implements cover images from `lesson_enrichments` table. The code is generally well-structured with proper error handling and RLS consideration. However, there are **2 critical performance issues**, **1 security concern**, and several improvement opportunities.

**Overall Status**: ⚠️ **PARTIAL** - Works correctly but has N+1 query issues that will cause performance degradation at scale.

**Key Findings**:

- ✅ Good: Proper RLS handling with admin client for enrichments
- ✅ Good: Correct Next.js Image component usage with proper props
- ❌ **Critical**: N+1 query pattern in Load More functionality (course-grid.tsx)
- ❌ **Critical**: Missing error handling for external image URLs in OG API
- ⚠️ **Security**: XSS vulnerability in OG Image API (untrusted URLs)
- ⚠️ Performance: Missing Next.js Image cache optimization
- ⚠️ Accessibility: Missing alt text for cover images

---

## 1. Critical Issues

### 1.1 N+1 Query Problem in Load More (course-grid.tsx)

**File**: `packages/web/app/[locale]/courses/_components/course-grid.tsx:54-93`

**Issue**: The `handleLoadMore` function makes **3 separate sequential queries** for each batch:

1. `getCourses()` - fetches course data
2. `checkFavorites(courseIds)` - fetches favorite status
3. `getCourseCovers(courseIds)` - fetches cover URLs

**Impact**:

- 3 database round-trips for every "Load More" click
- Network latency multiplied by 3
- Will degrade significantly as user loads more pages

**Current Code**:

```typescript
const handleLoadMore = async () => {
  setLoadingMore(true)
  try {
    const nextPage = currentLoadedPage + 1
    const result = await getCourses({ ... }) // Query 1

    if (result.courses.length > 0) {
      const courseIds = result.courses.map((c) => c.id)

      let favoritesMap: Record<string, boolean> = {}
      if (user) {
        favoritesMap = await checkFavorites(courseIds) // Query 2 - sequential!
      }

      const coversMap = await getCourseCovers(courseIds) // Query 3 - sequential!

      // ... merge data
    }
  } catch (error) {
    logger.error('Error loading more courses:', error)
  }
}
```

**Recommendation**:

```typescript
// OPTION 1: Batch all queries in parallel
const handleLoadMore = async () => {
  setLoadingMore(true)
  try {
    const nextPage = currentLoadedPage + 1

    // Execute all queries in parallel
    const [result, favoritesMap, coversMap] = await Promise.all([
      getCourses({ ... }),
      user ? checkFavorites(courseIds) : Promise.resolve({}),
      getCourseCovers(courseIds)
    ])

    // ... merge data
  } catch (error) {
    logger.error('Error loading more courses:', error)
  }
}

// OPTION 2 (BETTER): Modify getCourses() to return covers and favorites
// in a single server action call to minimize client-server round trips
```

**Priority**: 🔴 **CRITICAL** - Fix before production use at scale

---

### 1.2 Missing Error Handling for External Image URLs (OG API)

**File**: `packages/web/app/api/og/course/[slug]/route.tsx:72-87`

**Issue**: The OG Image API fetches cover images from `coverUrl` (which could be an external URL) without error handling. If the image fails to load, the entire OG image generation fails.

**Current Code**:

```tsx
{coverUrl ? (
  <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={coverUrl}
      alt=""
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: WIDTH,
        height: HEIGHT,
        objectFit: 'cover',
      }}
    />
    {/* ... gradient overlay ... */}
  </>
) : (
  /* ... gradient background ... */
)}
```

**Problems**:

1. No error handling if `coverUrl` points to a broken/deleted image
2. No timeout for slow-loading external images
3. No fallback if image fetch fails during rendering

**According to Context7 best practices**:

> "When performing operations within Route Handlers that might lead to exceptions, it's a best practice to enclose them within try/catch blocks."

**Recommendation**:

```tsx
// Add error boundary and fallback
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  try {
    const supabase = getAdminClient()

    // ... fetch course and cover ...

    // Validate coverUrl before using
    let validCoverUrl: string | null = null
    if (coverUrl) {
      try {
        // Basic URL validation
        new URL(coverUrl)
        validCoverUrl = coverUrl
      } catch {
        console.warn(`Invalid cover URL for course ${slug}: ${coverUrl}`)
        validCoverUrl = null
      }
    }

    return new ImageResponse(
      (
        <div style={{...}}>
          {validCoverUrl ? (
            <>
              <img
                src={validCoverUrl}
                alt=""
                style={{...}}
                // Note: ImageResponse handles fetch errors by falling back
              />
              <div style={{...}} />
            </>
          ) : (
            <div style={{...}} />
          )}
          {/* ... rest of content ... */}
        </div>
      ),
      {
        width: WIDTH,
        height: HEIGHT,
      }
    )
  } catch (error) {
    console.error('Error generating OG image:', error)
    // Return a generic fallback OG image instead of 500
    return new ImageResponse(
      (
        <div style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
        }}>
          <div style={{ padding: 60, color: 'white', fontSize: 48 }}>
            MegaCampusAI
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT }
    )
  }
}
```

**Priority**: 🔴 **CRITICAL** - Prevents OG image generation failures

---

### 1.3 XSS Vulnerability: Untrusted Image URLs

**File**: `packages/web/app/api/og/course/[slug]/route.tsx:76`

**Issue**: The `coverUrl` from database is directly embedded in `<img src={coverUrl}>` without validation. If an attacker injects a malicious URL (e.g., `javascript:alert(1)`), it could lead to XSS.

**Current Code**:

```tsx
<img
  src={coverUrl}  // ⚠️ Untrusted data from database
  alt=""
  style={{...}}
/>
```

**Attack Scenario**:

```sql
-- Attacker injects malicious enrichment
INSERT INTO lesson_enrichments (content, ...)
VALUES ('{"imageUrl": "javascript:alert(document.cookie)"}', ...);
```

**Recommendation**:

```tsx
// Add URL validation
const isValidHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// In GET handler
const validCoverUrl = coverUrl && isValidHttpUrl(coverUrl) ? coverUrl : null

// Use validated URL
{validCoverUrl && (
  <img src={validCoverUrl} alt="" style={{...}} />
)}
```

**Priority**: 🔴 **CRITICAL** - Security vulnerability

---

## 2. High Priority Improvements

### 2.1 Inefficient Image Loading in course-card.tsx

**File**: `packages/web/app/[locale]/courses/_components/course-card.tsx:486-497`

**Issue**: The Next.js Image component uses `priority={false}` for all cover images, even those in the first viewport.

**Current Code**:

```tsx
<Image
  src={coverUrl}
  alt=""
  fill
  className="object-cover"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  priority={false} // ⚠️ All images are lazy-loaded
/>
```

**Problem**:

- First 3-4 course cards are visible on initial load
- These should use `priority={true}` to preload and avoid layout shift
- Currently causes visible loading delay for above-the-fold content

**According to Context7**:

> "The priority property should be used on images that are visible in the initial viewport to improve Largest Contentful Paint (LCP)."

**Recommendation**:

```tsx
// Pass index from parent
interface CourseCardProps {
  course: CourseWithFavorite
  user: User | null
  canDelete?: boolean
  viewMode?: 'grid' | 'list'
  isFavorited?: boolean
  index?: number  // Add index prop
}

export function CourseCard({ course, index = 0, ... }: CourseCardProps) {
  const isAboveFold = index < 4 // First 4 cards in 2x2 grid

  return (
    <Image
      src={coverUrl}
      alt={`Обложка курса: ${course.title}`}  // Add descriptive alt
      fill
      className="object-cover"
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      priority={hasCover && isAboveFold}  // Preload above-fold images
      loading={hasCover && isAboveFold ? 'eager' : 'lazy'}
    />
  )
}
```

**Priority**: 🟠 **HIGH** - Impacts LCP and Core Web Vitals

---

### 2.2 Missing Alt Text for Cover Images

**File**: `packages/web/app/[locale]/courses/_components/course-card.tsx:489-496`

**Issue**: Cover images use `alt=""` which treats them as decorative. Screen readers will skip them, but they contain course-identifying information.

**Current Code**:

```tsx
<Image
  src={coverUrl}
  alt="" // ⚠️ Treated as decorative
  fill
  className="object-cover"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  priority={false}
/>
```

**Accessibility Impact**:

- Screen reader users miss visual context
- SEO: Search engines can't understand image content
- WCAG 2.1 Level A violation (if image conveys information)

**Recommendation**:

```tsx
<Image
  src={coverUrl}
  alt={`Обложка курса: ${course.title}`} // Descriptive alt text
  fill
  className="object-cover"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  priority={false}
/>
```

**Priority**: 🟠 **HIGH** - Accessibility and SEO

---

### 2.3 Duplicate Queries in page.tsx

**File**: `packages/web/app/[locale]/courses/page.tsx:70-80`

**Issue**: The courses page makes 3 sequential server action calls, similar to the Load More issue.

**Current Code**:

```tsx
// Sequential queries (bad)
const coursesData = await getCourses({ ... })  // Query 1

const statistics = await getCoursesStatistics()  // Query 2 (independent)

const courseIds = coursesData.courses.map((c) => c.id)

let favoritesMap: Record<string, boolean> = {}
if (user) {
  favoritesMap = await checkFavorites(courseIds)  // Query 3
}

const coversMap = await getCourseCovers(courseIds)  // Query 4
```

**Recommendation**:

```tsx
// Parallel queries (better)
const [coursesData, statistics] = await Promise.all([
  getCourses({ ... }),
  getCoursesStatistics(),
])

const courseIds = coursesData.courses.map((c) => c.id)

// These depend on courseIds, so run after
const [favoritesMap, coversMap] = await Promise.all([
  user ? checkFavorites(courseIds) : Promise.resolve({}),
  getCourseCovers(courseIds),
])
```

**Priority**: 🟠 **HIGH** - Initial page load performance

---

## 3. Medium Priority Improvements

### 3.1 Missing Cache Headers in OG API

**File**: `packages/web/app/api/og/course/[slug]/route.tsx:250-254`

**Issue**: The OG Image API doesn't set cache headers. Every OG image request regenerates the image, wasting compute and slowing social media previews.

**Current Code**:

```tsx
return new ImageResponse(
  (/* ... */),
  {
    width: WIDTH,
    height: HEIGHT,
    // No cache headers
  }
)
```

**According to Context7**:

> "For ImageResponse, it's recommended to add cache headers for better performance."

**Recommendation**:

```tsx
return new ImageResponse(
  (/* ... */),
  {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      // OG images rarely change, so aggressive caching is safe
    },
  }
)
```

**Priority**: 🟡 **MEDIUM** - Performance optimization

---

### 3.2 Inefficient Null Checks in getCourseCovers

**File**: `packages/web/app/[locale]/courses/actions.ts:740-772`

**Issue**: The function checks `if (courseIds.length === 0)` but still queries if the array is provided but empty.

**Current Code**:

```ts
export async function getCourseCovers(courseIds: string[]): Promise<Record<string, string>> {
  if (courseIds.length === 0) {
    return {};
  }

  const adminClient = getAdminClient();

  const { data, error } = await adminClient
    .from('lesson_enrichments')
    .select('course_id, content')
    .in('course_id', courseIds) // Empty array still makes query
    .eq('enrichment_type', 'card')
    .eq('title', 'course-card')
    .eq('status', 'completed');

  // ...
}
```

**Recommendation**:

```ts
export async function getCourseCovers(courseIds: string[]): Promise<Record<string, string>> {
  // Early return for empty array (optimization)
  if (!courseIds || courseIds.length === 0) {
    return {};
  }

  const adminClient = getAdminClient();

  const { data, error } = await adminClient
    .from('lesson_enrichments')
    .select('course_id, content')
    .in('course_id', courseIds)
    .eq('enrichment_type', 'card')
    .eq('title', 'course-card')
    .eq('status', 'completed');

  if (error) {
    logger.warn('Failed to fetch course covers', {
      error: error.message,
      courseIds: courseIds.slice(0, 3), // Only log first 3 IDs for brevity
    });
    return {};
  }

  const coversMap: Record<string, string> = {};

  for (const enrichment of data || []) {
    if (enrichment.course_id && enrichment.content) {
      const content = enrichment.content as { imageUrl?: string };
      if (content.imageUrl) {
        coversMap[enrichment.course_id] = content.imageUrl;
      }
    }
  }

  return coversMap;
}
```

**Priority**: 🟡 **MEDIUM** - Code quality

---

### 3.3 Type Safety: Loose Type Assertion

**File**: `packages/web/app/[locale]/courses/actions.ts:764-767`

**Issue**: Type assertion for `content` is too loose and doesn't validate structure.

**Current Code**:

```ts
const content = enrichment.content as { imageUrl?: string };
if (content.imageUrl) {
  coversMap[enrichment.course_id] = content.imageUrl;
}
```

**Problem**: If `content` is `null`, `string`, or malformed JSON, this will fail silently or throw runtime error.

**Recommendation**:

```ts
import { z } from 'zod';

const EnrichmentContentSchema = z.object({
  imageUrl: z.string().url().optional(),
});

// In function
for (const enrichment of data || []) {
  if (enrichment.course_id && enrichment.content) {
    try {
      const content = EnrichmentContentSchema.parse(enrichment.content);
      if (content.imageUrl) {
        coversMap[enrichment.course_id] = content.imageUrl;
      }
    } catch {
      logger.warn('Invalid enrichment content structure', {
        courseId: enrichment.course_id,
        content: enrichment.content,
      });
    }
  }
}
```

**Priority**: 🟡 **MEDIUM** - Type safety and runtime validation

---

### 3.4 Missing Error Logging in getCourseCover

**File**: `packages/web/app/[locale]/courses/actions.ts:777-795`

**Issue**: The function silently returns `null` on error without logging.

**Current Code**:

```ts
export async function getCourseCover(courseId: string): Promise<string | null> {
  const adminClient = getAdminClient();

  const { data, error } = await adminClient
    .from('lesson_enrichments')
    .select('content')
    .eq('course_id', courseId)
    .eq('enrichment_type', 'card')
    .eq('title', 'course-card')
    .eq('status', 'completed')
    .maybeSingle();

  if (error || !data) {
    return null; // ⚠️ Silent failure
  }

  const content = data.content as { imageUrl?: string };
  return content.imageUrl ?? null;
}
```

**Recommendation**:

```ts
export async function getCourseCover(courseId: string): Promise<string | null> {
  const adminClient = getAdminClient();

  const { data, error } = await adminClient
    .from('lesson_enrichments')
    .select('content')
    .eq('course_id', courseId)
    .eq('enrichment_type', 'card')
    .eq('title', 'course-card')
    .eq('status', 'completed')
    .maybeSingle();

  if (error) {
    logger.warn('Failed to fetch course cover', {
      courseId,
      error: error.message,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  const content = data.content as { imageUrl?: string };
  return content.imageUrl ?? null;
}
```

**Priority**: 🟡 **MEDIUM** - Observability

---

## 4. Low Priority / Code Quality Notes

### 4.1 Duplicate Server Action Calls in page.tsx

**File**: `packages/web/app/[locale]/courses/page.tsx:6`

**Note**: The page imports and calls `checkFavorites` and `getCourseCovers`, but `getCourses()` already calls `getUserFavorites()` internally (line 284-294 in actions.ts).

**Observation**:

```tsx
// In page.tsx
const coursesData = await getCourses({ ... })  // Already includes favorites

// But then:
const favoritesMap = await checkFavorites(courseIds)  // Duplicate call?
```

**In actions.ts (getCourses)**:

```ts
const user = await getCurrentUser();
let userFavorites: string[] = [];
if (user?.id) {
  userFavorites = await getUserFavorites(user.id); // Already fetched
}

const coursesWithFavorites = processedCourses.map(course => ({
  ...course,
  isFavorite: userFavorites.includes(course.id), // Already mapped
}));
```

**Recommendation**: Either:

1. Remove `checkFavorites()` call in page.tsx (use returned `isFavorite` from `getCourses`)
2. OR remove internal favorites logic from `getCourses` and always require caller to fetch

**Priority**: 🟢 **LOW** - Code duplication, not a bug

---

### 4.2 Hardcoded Magic Strings

**File**: `packages/web/app/[locale]/courses/actions.ts:751-753`

**Issue**: Enrichment query uses hardcoded strings for `enrichment_type` and `title`.

**Current Code**:

```ts
.eq('enrichment_type', 'card')
.eq('title', 'course-card')
```

**Recommendation**:

```ts
// In a shared constants file
export const ENRICHMENT_TYPES = {
  CARD: 'card',
  QUIZ: 'quiz',
  // ...
} as const

export const ENRICHMENT_TITLES = {
  COURSE_CARD: 'course-card',
  // ...
} as const

// In code
.eq('enrichment_type', ENRICHMENT_TYPES.CARD)
.eq('title', ENRICHMENT_TITLES.COURSE_CARD)
```

**Priority**: 🟢 **LOW** - Maintainability

---

### 4.3 Missing JSDoc Comments

**Files**: All reviewed files

**Issue**: Server actions lack JSDoc documentation explaining parameters, return types, and error cases.

**Recommendation**:

````ts
/**
 * Fetch course cover images from lesson_enrichments
 *
 * @param courseIds - Array of course UUIDs to fetch covers for
 * @returns Map of courseId → imageUrl for courses with completed covers
 *
 * @example
 * ```ts
 * const covers = await getCourseCovers(['uuid-1', 'uuid-2'])
 * // Returns: { 'uuid-1': 'https://...', 'uuid-2': 'https://...' }
 * ```
 */
export async function getCourseCovers(courseIds: string[]): Promise<Record<string, string>> {
  // ...
}
````

**Priority**: 🟢 **LOW** - Documentation

---

## 5. Best Practices Validation (Context7)

### ✅ Next.js Image Component

- **Correct**: Uses `fill` prop with parent positioning
- **Correct**: Includes `sizes` prop for responsive images
- **Correct**: Uses `object-cover` for aspect ratio maintenance
- **Needs Fix**: Missing `priority` for above-fold images
- **Needs Fix**: Missing descriptive `alt` text

### ✅ Next.js OG Image API

- **Correct**: Uses `ImageResponse` constructor properly
- **Correct**: Specifies width/height (1200x630)
- **Correct**: Uses `export const runtime = 'edge'`
- **Correct**: Handles async `params` Promise
- **Needs Fix**: Missing cache headers
- **Needs Fix**: Missing error handling for external images
- **Needs Fix**: Missing URL validation (security)

### ⚠️ Server Actions

- **Correct**: Uses `'use server'` directive
- **Correct**: Calls `revalidatePath()` after mutations
- **Partial**: Error handling exists but incomplete
- **Needs Fix**: Should return error objects instead of throwing (per Context7 guidance)

**Context7 Recommendation**:

> "This server action demonstrates how to handle expected errors by returning an object with an error message instead of throwing an error."

**Example** (from deleteCourse):

```ts
// Current (throws)
if (deleteError) {
  throw new Error('Insufficient permissions to delete this course');
}

// Recommended (returns error object)
if (deleteError) {
  return {
    success: false,
    error: 'Insufficient permissions to delete this course',
  };
}
```

---

## 6. Edge Cases & Null Safety

### ✅ Handled Well

- Empty courseIds array → returns `{}`
- No data from query → returns `{}`
- Missing `imageUrl` in content → skips silently

### ⚠️ Potential Issues

- **Malformed JSON in content field**: Not validated before parsing
- **Non-HTTP URLs** (javascript:, data:, etc.): Not filtered
- **Extremely large courseIds arrays**: No pagination/chunking

---

## 7. Performance Metrics Estimate

| Scenario                       | Current | Optimized       | Improvement |
| ------------------------------ | ------- | --------------- | ----------- |
| Initial page load (12 courses) | ~400ms  | ~200ms          | 50% faster  |
| Load More (12 courses)         | ~300ms  | ~150ms          | 50% faster  |
| OG Image generation            | ~800ms  | ~100ms (cached) | 87% faster  |

**Assumptions**:

- Database latency: 50ms per query
- Sequential queries add up
- Parallel queries: max(query1, query2, query3)
- Cache hits: ~10ms

---

## 8. Action Items Summary

### Must Fix (Before Production at Scale)

1. ⛔ Fix N+1 query in `handleLoadMore` (course-grid.tsx:54)
2. ⛔ Add error handling for external images in OG API (route.tsx:76)
3. ⛔ Add URL validation to prevent XSS (route.tsx:76)

### Should Fix (Before Next Release)

4. ⚠️ Optimize initial page load queries (page.tsx:70)
5. ⚠️ Add `priority` prop for above-fold images (course-card.tsx:495)
6. ⚠️ Add descriptive alt text for cover images (course-card.tsx:491)
7. ⚠️ Add cache headers to OG API (route.tsx:250)

### Nice to Have

8. ℹ️ Add Zod validation for enrichment content
9. ℹ️ Add error logging to `getCourseCover`
10. ℹ️ Extract magic strings to constants
11. ℹ️ Add JSDoc comments to server actions

---

## 9. Testing Recommendations

### Manual Testing Needed

- [ ] Test Load More with slow network (throttle to 3G)
- [ ] Test OG image with broken cover URL
- [ ] Test OG image with malicious URL (`javascript:alert(1)`)
- [ ] Test course card with missing cover (should show gradient)
- [ ] Test accessibility with screen reader (VoiceOver/NVDA)

### Automated Testing Needed

```ts
// Example test case
describe('getCourseCovers', () => {
  it('should return empty object for empty array', async () => {
    const result = await getCourseCovers([]);
    expect(result).toEqual({});
  });

  it('should handle malformed content gracefully', async () => {
    // Mock DB return with invalid content
    const result = await getCourseCovers(['invalid-id']);
    expect(result).toEqual({});
  });

  it('should filter non-HTTP URLs', async () => {
    // Test XSS prevention
  });
});
```

---

## 10. Conclusion

The course covers integration is **functionally correct** and demonstrates good understanding of Next.js patterns. However, the **N+1 query issue** and **missing security validation** make it unsuitable for production at scale without fixes.

**Estimated effort to fix critical issues**: 2-3 hours

**Risk if not fixed**:

- Performance degradation as catalog grows
- OG image failures breaking social media previews
- Potential XSS attacks via malicious image URLs

**Recommendation**: Fix critical issues (1-3) before deploying to production, then address high-priority items (4-7) in next sprint.

---

**Review completed**: 2026-01-21
**Next review**: After critical fixes are implemented
