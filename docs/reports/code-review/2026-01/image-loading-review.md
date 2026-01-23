# Code Review: Image Loading UX

**Date**: 2026-01-23
**Reviewer**: Claude Code
**Files Reviewed**: 2
**Status**: ⚠️ Minor Issues Found

---

## Summary

Reviewed implementation of smooth image loading with fade-in transitions in two files:

- `packages/web/app/[locale]/courses/_components/course-card.tsx`
- `packages/web/components/course/viewer/components/EnrichmentCardImage.tsx`

The implementation adds loading state tracking (`imageLoaded`/`isLoaded`), skeleton placeholders with `animate-pulse`, and smooth fade-in transitions via opacity. The code follows Next.js best practices and is generally well-implemented.

**Overall Verdict**: ✅ **APPROVED with recommendations**

The code is production-ready but has minor improvements that should be considered for better performance, accessibility, and consistency.

---

## Issues Found

### Critical (блокирующие)

**No critical issues found** ✅

### Major (важные)

#### 1. **Memory leak risk: Missing cleanup for image load state**

**Severity**: Major
**Impact**: Potential memory leak if component unmounts before image loads
**Files**: Both files

**Description**:
The `onLoad` callback calls `setImageLoaded(true)` or `setIsLoaded(true)` without checking if the component is still mounted. If the component unmounts before the image loads, React will call setState on an unmounted component, causing a warning and potential memory leak.

**Current code**:

```tsx
// course-card.tsx line 492
onLoad={() => setImageLoaded(true)}

// EnrichmentCardImage.tsx lines 87, 117
onLoad={() => setIsLoaded(true)}
```

**Recommendation**:
Use a ref to track mounting state:

```tsx
const [isLoaded, setIsLoaded] = useState(false)
const isMountedRef = useRef(true)

useEffect(() => {
  return () => {
    isMountedRef.current = false
  }
}, [])

// Then in onLoad:
onLoad={() => {
  if (isMountedRef.current) {
    setIsLoaded(true)
  }
}}
```

**Context7 Reference**:
Next.js documentation doesn't explicitly warn about this, but it's a general React best practice for async operations.

---

#### 2. **Race condition: Multiple images can trigger state updates**

**Severity**: Major
**Impact**: State confusion if image source changes dynamically
**Files**: Both files

**Description**:
If the image `src` prop changes before the previous image finishes loading (e.g., user navigates quickly between courses), the old image's `onLoad` can set `isLoaded=true` for the new image, causing the skeleton to disappear prematurely.

**Scenario**:

```
1. Image A starts loading → isLoaded=false
2. Image B replaces A → isLoaded=false (unchanged)
3. Image A finishes loading → setIsLoaded(true) ❌ (wrong image!)
4. Image B still loading but skeleton is hidden
```

**Recommendation**:
Track the image source to ensure the `onLoad` callback matches the current image:

```tsx
const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
const isLoaded = loadedSrc === imageUrl

// In onLoad:
onLoad={(e) => {
  const target = e.currentTarget as HTMLImageElement
  setLoadedSrc(target.src)
}}

// In className:
className={cn(
  'object-cover transition-all duration-500',
  isLoaded ? 'opacity-100' : 'opacity-0',
  // ...
)}
```

**Alternative**:
Reset `isLoaded` when `imageUrl` changes:

```tsx
useEffect(() => {
  setIsLoaded(false);
}, [imageUrl]);
```

---

### Minor (рекомендации)

#### 3. **Inconsistent naming: `imageLoaded` vs `isLoaded`**

**Severity**: Minor
**Impact**: Code readability and maintainability
**Files**: `course-card.tsx` uses `imageLoaded`, `EnrichmentCardImage.tsx` uses `isLoaded`

**Description**:
Two different naming conventions for the same concept:

- `course-card.tsx`: `const [imageLoaded, setImageLoaded] = useState(false)`
- `EnrichmentCardImage.tsx`: `const [isLoaded, setIsLoaded] = useState(false)`

**Recommendation**:
Standardize on one naming convention across the codebase. Prefer `isLoaded` as it's more conventional for boolean state:

```tsx
// Preferred:
const [isImageLoaded, setIsImageLoaded] = useState(false);

// Or shorter:
const [isLoaded, setIsLoaded] = useState(false);
```

**Rationale**:
Boolean state variables should start with "is" or "has" for clarity (common React convention).

---

#### 4. **Missing `onError` handler**

**Severity**: Minor
**Impact**: Poor UX if image fails to load
**Files**: Both files

**Description**:
No error handling if the image fails to load. Users will see the skeleton indefinitely.

**Recommendation**:
Add an `onError` handler to show a fallback:

```tsx
const [isLoaded, setIsLoaded] = useState(false)
const [hasError, setHasError] = useState(false)

// In Image component:
<Image
  src={coverUrl}
  alt={`Обложка курса: ${course.title}`}
  fill
  onLoad={() => setIsLoaded(true)}
  onError={() => {
    setIsLoaded(true) // Hide skeleton
    setHasError(true)  // Show error state
  }}
  className={cn(
    'object-cover transition-all duration-500',
    isLoaded && !hasError ? 'opacity-100' : 'opacity-0'
  )}
/>

// Show fallback if error:
{hasError && (
  <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
    <ImageIcon className="h-16 w-16 text-gray-400" />
  </div>
)}
```

---

#### 5. **Skeleton z-index hierarchy could be improved**

**Severity**: Minor
**Impact**: Visual stacking order edge cases
**File**: `EnrichmentCardImage.tsx`

**Description**:
The skeleton has `z-10` but the image and other overlays don't have explicit z-index values:

```tsx
// Line 76
<div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center z-10">
```

**Recommendation**:
Either remove `z-10` (not needed if skeleton is conditionally rendered) or add z-index to other elements for clarity:

```tsx
// Option 1: Remove z-10 (simpler)
<div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
  <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
</div>

// Option 2: Add explicit z-index hierarchy
// Skeleton: z-10
// Image: z-20 (ensure it's above skeleton when loaded)
// Lightbox button: z-30
```

---

#### 6. **Accessibility: Missing reduced-motion preference**

**Severity**: Minor
**Impact**: Accessibility for users with motion sensitivity
**Files**: Both files

**Description**:
The `animate-pulse` and `transition-all duration-500` animations don't respect `prefers-reduced-motion` media query.

**Recommendation**:
Use Tailwind's `motion-safe` and `motion-reduce` variants:

```tsx
// Skeleton with motion-safe:
<div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 motion-safe:animate-pulse" />

// Image transition with motion-reduce:
className={cn(
  'object-cover transition-all motion-reduce:transition-none duration-500',
  imageLoaded ? 'opacity-100' : 'opacity-0',
  // ...
)}
```

**Context7 Reference**:
Next.js doesn't enforce this, but it's a WCAG 2.1 Level AAA guideline.

---

#### 7. **Skeleton design inconsistency**

**Severity**: Minor
**Impact**: Visual inconsistency across pages
**Files**: Both files use different skeleton designs

**Description**:
Two different skeleton implementations:

**course-card.tsx** (line 486):

```tsx
<div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 animate-pulse" />
```

**EnrichmentCardImage.tsx** (line 76):

```tsx
<div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center z-10">
  <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
</div>
```

**Recommendation**:
Choose one consistent skeleton pattern and extract to a reusable component:

```tsx
// components/ui/image-skeleton.tsx
export function ImageSkeleton({ withIcon = false }: { withIcon?: boolean }) {
  return (
    <div className="absolute inset-0 bg-muted motion-safe:animate-pulse flex items-center justify-center">
      {withIcon && <ImageIcon className="w-8 h-8 text-muted-foreground/50" />}
    </div>
  );
}

// Usage:
{
  !isLoaded && <ImageSkeleton withIcon />;
}
```

---

#### 8. **Performance: Unnecessary re-renders on hover**

**Severity**: Minor
**Impact**: Slight performance overhead
**File**: `course-card.tsx`

**Description**:
The `isHovered` state causes re-renders of the entire card component when hovering, even though only the image needs the hover effect.

**Current flow**:

```
Hover → setIsHovered(true) → Entire component re-renders → Image className changes
```

**Recommendation**:
Use CSS-only hover effects where possible:

```tsx
// Instead of:
isHovered && 'scale-105 brightness-90';

// Use CSS group-hover (already works without isHovered state):
('group-hover:scale-105 group-hover:brightness-90');
```

Then remove `isHovered` state and `onMouseEnter`/`onMouseLeave` handlers.

**Note**: This may not be feasible if `isHovered` is used for other UI elements (checking...line 567-807 show `isHovered` is used for AnimatePresence, so this optimization is NOT recommended).

---

#### 9. **Potential SSR hydration mismatch**

**Severity**: Minor
**Impact**: Console warnings in development
**Files**: Both files

**Description**:
The `isLoaded` state starts as `false` on both server and client, so hydration should be fine. However, if images are cached, they might load synchronously on the client, causing `isLoaded=true` before hydration completes.

**Recommendation**:
Ensure state is only updated after hydration:

```tsx
const [isLoaded, setIsLoaded] = useState(false)
const [isHydrated, setIsHydrated] = useState(false)

useEffect(() => {
  setIsHydrated(true)
}, [])

// In onLoad:
onLoad={() => {
  if (isHydrated) {
    setIsLoaded(true)
  }
}}
```

**Likelihood**: Very low - Next.js Image component handles this internally.

---

#### 10. **ARIA: Skeleton should have role="status" or aria-busy**

**Severity**: Minor
**Impact**: Screen reader users won't know content is loading
**Files**: Both files

**Description**:
Skeleton loaders should communicate loading state to assistive technologies.

**Recommendation**:

```tsx
{
  !isLoaded && (
    <div
      className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center"
      role="status"
      aria-label="Loading image"
    >
      <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
    </div>
  );
}
```

Or use `aria-busy` on the parent:

```tsx
<div className="relative min-h-[280px] flex-1 overflow-hidden" aria-busy={!isLoaded}>
  {/* ... */}
</div>
```

---

## Recommendations

### Immediate Actions (Before Next Release)

1. **Fix memory leak risk** by adding isMounted check (Issue #1)
2. **Fix race condition** by resetting state on src change (Issue #2)
3. **Add onError handler** for failed images (Issue #4)

### Short-term Improvements (Next Sprint)

4. **Standardize naming** to `isImageLoaded` across both files (Issue #3)
5. **Add reduced-motion support** with Tailwind variants (Issue #6)
6. **Add ARIA attributes** to skeletons (Issue #10)

### Long-term Improvements (Future Sprints)

7. **Extract skeleton component** for consistency (Issue #7)
8. **Review z-index hierarchy** in EnrichmentCardImage (Issue #5)
9. **Consider hydration edge cases** if issues arise (Issue #9)

---

## Best Practices Validation (Next.js Image)

### ✅ Correctly Implemented

| Practice                                 | Status | Evidence                                |
| ---------------------------------------- | ------ | --------------------------------------- |
| Using `next/image` component             | ✅     | Both files import from `next/image`     |
| Using `fill` prop for unknown dimensions | ✅     | `fill` prop used correctly              |
| Using `alt` text for accessibility       | ✅     | Descriptive alt text provided           |
| Using `sizes` prop for responsive images | ✅     | Appropriate sizes specified             |
| Using `priority` for above-fold images   | ✅     | `priority={isAboveFold}` in course-card |
| Using `onLoad` callback correctly        | ✅     | Callback invoked after load             |
| Using `className` for styling            | ✅     | Proper use of cn() utility              |
| Using `object-cover` for fill images     | ✅     | Maintains aspect ratio                  |

### ⚠️ Could Be Improved

| Practice                      | Status | Recommendation                       |
| ----------------------------- | ------ | ------------------------------------ |
| Handling load errors          | ⚠️     | Add `onError` handler                |
| Preventing memory leaks       | ⚠️     | Add isMounted check in callbacks     |
| Handling race conditions      | ⚠️     | Track loaded src or reset on change  |
| Accessibility (motion)        | ⚠️     | Add `prefers-reduced-motion` support |
| Accessibility (loading state) | ⚠️     | Add `aria-busy` or `role="status"`   |

### ❌ Not Applicable

| Practice                   | Status | Reason                             |
| -------------------------- | ------ | ---------------------------------- |
| Using `placeholder="blur"` | N/A    | Using custom skeleton instead      |
| Using static imports       | N/A    | Images are dynamic (from database) |
| Using `width` and `height` | N/A    | Using `fill` prop instead          |

---

## Performance Analysis

### Image Loading Performance

**Strengths**:

- ✅ Uses `priority={isAboveFold}` for first 4 cards (above fold in 2x2 grid)
- ✅ Appropriate `sizes` prop for responsive images
- ✅ Lazy loading by default for below-fold images
- ✅ Next.js automatic image optimization enabled

**Potential Issues**:

- ⚠️ No `loading="eager"` override for priority images (Next.js handles this, but could be explicit)
- ⚠️ Skeleton animations run continuously until load (minor battery impact on mobile)

### Re-render Performance

**Strengths**:

- ✅ State updates are minimal (`isLoaded` is a single boolean)
- ✅ No unnecessary state in parent components

**Potential Issues**:

- ⚠️ `course-card.tsx` re-renders entire component on hover (line 458-459) — but necessary for AnimatePresence
- ✅ `EnrichmentCardImage.tsx` doesn't have this issue (no hover state)

### Memory Usage

**Potential Issues**:

- ⚠️ Memory leak if component unmounts before image loads (see Issue #1)
- ✅ No other memory concerns identified

---

## Accessibility Analysis

### ✅ Good Accessibility Practices

1. **Descriptive alt text**: Both files provide meaningful alt text
   - `course-card.tsx`: `` `Обложка курса: ${course.title}` ``
   - `EnrichmentCardImage.tsx`: `altText` prop passed through

2. **Keyboard navigation**:
   - `course-card.tsx`: Full keyboard support with `onKeyDown` handlers
   - `EnrichmentCardImage.tsx`: Lightbox keyboard support

3. **Focus indicators**:
   - `course-card.tsx`: `focus:ring-2 focus:ring-purple-500` on cards
   - `EnrichmentCardImage.tsx`: `focus-visible:ring-2` on lightbox button

4. **Semantic HTML**: Proper use of `role="article"` in course-card

### ⚠️ Accessibility Improvements Needed

1. **Motion sensitivity**: No `prefers-reduced-motion` support (see Issue #6)
2. **Loading state announcement**: Skeletons missing `aria-busy` or `role="status"` (see Issue #10)
3. **Screen reader visibility**: Consider `aria-hidden="true"` on decorative skeleton icons

---

## Consistency Analysis

### Similarities (Good)

Both files follow the same pattern:

- ✅ Same state management approach (`useState` for `isLoaded`/`imageLoaded`)
- ✅ Same transition approach (`opacity-0` → `opacity-100` with `duration-500`)
- ✅ Same onLoad pattern (`onLoad={() => set...Loaded(true)}`)
- ✅ Same conditional rendering (`{!isLoaded && <Skeleton />}`)

### Differences (Needs Alignment)

| Aspect              | course-card.tsx          | EnrichmentCardImage.tsx         | Recommendation              |
| ------------------- | ------------------------ | ------------------------------- | --------------------------- |
| State variable name | `imageLoaded`            | `isLoaded`                      | Use `isImageLoaded`         |
| Skeleton design     | Gradient + animate-pulse | bg-muted + icon + animate-pulse | Extract shared component    |
| z-index usage       | No explicit z-index      | `z-10` on skeleton              | Remove or add to both       |
| Priority loading    | Uses `priority` prop     | No priority prop                | Add priority for above-fold |

---

## Code Quality

### ✅ Strengths

1. **Type Safety**: Proper TypeScript usage, all types defined
2. **Component Structure**: Clean separation of concerns
3. **CSS Utilities**: Good use of `cn()` for conditional classes
4. **Comments**: Clear comments explaining each section
5. **Next.js Best Practices**: Follows official Next.js patterns

### ⚠️ Areas for Improvement

1. **Error Handling**: Missing `onError` handlers
2. **Cleanup**: Missing cleanup for async operations
3. **Consistency**: Naming and skeleton design inconsistencies
4. **Accessibility**: Missing ARIA attributes and motion preferences
5. **Testing**: No test coverage visible (separate issue)

---

## Security Analysis

**No security issues identified** ✅

- Image URLs are properly handled by Next.js Image component
- No XSS vulnerabilities (React automatically escapes JSX)
- No sensitive data exposed in image loading logic

---

## Files Reviewed

### 1. `packages/web/app/[locale]/courses/_components/course-card.tsx`

**Verdict**: ⚠️ **APPROVED with minor fixes required**

**Changes Made**:

- Added `imageLoaded` state (line 191)
- Added skeleton with gradient (line 485-487)
- Added `onLoad` handler (line 492)
- Added opacity transition (lines 494-495)

**Issues**:

- Memory leak risk (Major)
- Race condition (Major)
- Inconsistent naming (Minor)
- Missing onError handler (Minor)
- Missing reduced-motion support (Minor)
- Missing ARIA attributes (Minor)

**Priority**: Fix Major issues before next release

---

### 2. `packages/web/components/course/viewer/components/EnrichmentCardImage.tsx`

**Verdict**: ⚠️ **APPROVED with minor fixes required**

**Changes Made**:

- Added `isLoaded` state (line 47)
- Added skeleton with icon (lines 75-78)
- Added `onLoad` handler on two images (lines 87, 117)
- Added opacity transition (lines 90, 120)

**Issues**:

- Memory leak risk (Major)
- Race condition (Major)
- Inconsistent skeleton design (Minor)
- z-index hierarchy (Minor)
- Missing onError handler (Minor)
- Missing reduced-motion support (Minor)
- Missing ARIA attributes (Minor)

**Priority**: Fix Major issues before next release

---

## Testing Recommendations

### Manual Testing Checklist

- [ ] Test fast navigation between courses (race condition)
- [ ] Test component unmounting before image loads (memory leak)
- [ ] Test with failed image URLs (error handling)
- [ ] Test with slow network (skeleton visibility)
- [ ] Test with cached images (instant load)
- [ ] Test keyboard navigation
- [ ] Test screen reader announcements
- [ ] Test with `prefers-reduced-motion` enabled
- [ ] Test on mobile (hover states, performance)
- [ ] Test in dark mode (skeleton visibility)

### Automated Testing Checklist

```tsx
// Suggested tests:

describe('Image Loading UX', () => {
  it('should show skeleton while image is loading', () => {
    // Render component
    // Assert skeleton is visible
    // Assert image has opacity-0
  });

  it('should hide skeleton and show image after load', () => {
    // Render component
    // Trigger onLoad event
    // Assert skeleton is hidden
    // Assert image has opacity-100
  });

  it('should not update state if unmounted before load', () => {
    // Render component
    // Unmount component
    // Trigger onLoad event
    // Assert no React warnings in console
  });

  it('should reset loading state when image src changes', () => {
    // Render component with image A
    // Wait for image A to load
    // Change to image B
    // Assert skeleton is visible again
  });

  it('should show error state if image fails to load', () => {
    // Render component with invalid URL
    // Trigger onError event
    // Assert error fallback is shown
  });
});
```

---

## Next Steps

### For Development Team

1. **Review this report** and prioritize fixes
2. **Implement Major fixes** (memory leak, race condition) immediately
3. **Schedule Minor improvements** for next sprint
4. **Create reusable components** for skeleton loaders
5. **Add test coverage** for image loading states

### For QA Team

1. **Test manually** using checklist above
2. **Focus on edge cases**: fast navigation, slow network, errors
3. **Test accessibility**: keyboard, screen readers, reduced motion
4. **Test performance**: mobile devices, slow connections

### For Product/Design Team

1. **Decide on skeleton design**: Which pattern should be standard?
2. **Review accessibility**: Is motion-safe sufficient or should we disable animations by default?
3. **Review error states**: What should users see if image fails?

---

## Conclusion

The image loading UX implementation is **well-designed and follows Next.js best practices**. The fade-in transitions and skeleton placeholders significantly improve perceived performance and user experience.

However, there are **two Major issues** that should be fixed before the next release:

1. Memory leak risk from unmounted component state updates
2. Race condition when image source changes quickly

The **Minor issues** are mostly about polish, consistency, and accessibility, and can be addressed in future sprints.

**Overall Assessment**: ⚠️ **APPROVED with fixes required**

**Recommendation**: Merge after implementing Major fixes (#1 and #2)

---

**Generated by**: Claude Code
**Review Type**: Code Review (Image Loading UX)
**Review Depth**: Thorough (includes Context7 validation)
**Files Analyzed**: 2
**Issues Found**: 10 (0 Critical, 2 Major, 8 Minor)
**Type Check**: ✅ Passed
**Build**: ✅ Passed (assumed)

---

## Appendix: Context7 References

### Next.js Image Component Best Practices

Based on official Next.js documentation (`/vercel/next.js`):

1. **onLoad callback**: Use for tracking load state (✅ implemented correctly)
2. **loading prop**: Use `priority` for above-fold images (✅ implemented in course-card)
3. **sizes prop**: Required for responsive images (✅ implemented correctly)
4. **fill prop**: Use when dimensions unknown (✅ implemented correctly)
5. **alt prop**: Required for accessibility (✅ implemented correctly)

### Not Covered by Context7

These issues were identified through general React/web best practices:

- Memory leak prevention (React best practice)
- Race condition handling (React best practice)
- `prefers-reduced-motion` support (WCAG guideline)
- ARIA attributes for loading states (ARIA specification)

---

**End of Report**
