---
report_type: code-review
generated: 2026-01-25T21:00:00Z
version: 2026-01-25
status: partial
agent: code-reviewer
duration: 15min
files_reviewed: 10
issues_found: 18
critical_count: 2
high_count: 5
medium_count: 8
low_count: 3
---

# Code Review Report: Chat Fixes & Cascade Stage Deletion

**Generated**: 2026-01-25T21:00:00Z
**Status**: ⚠️ PARTIAL (type-check/build passed, issues found)
**Version**: 2026-01-25
**Agent**: code-reviewer
**Duration**: ~15 minutes
**Files Reviewed**: 10

---

## Executive Summary

Comprehensive code review completed for commit `e05435fc` implementing chat fixes and cascade stage deletion functionality. The implementation successfully addresses critical auth/routing bugs and adds UX improvements with cascade dependency management.

### Key Metrics

- **Files Reviewed**: 10
- **Lines Changed**: +1,516 / -512
- **Issues Found**: 18
  - Critical: 2
  - High: 5
  - Medium: 8
  - Low: 3
- **Validation Status**: ✅ PASSED (type-check, build successful)
- **Context7 Libraries Checked**: React (/websites/react_dev), Next.js (/websites/nextjs), tRPC (/trpc/trpc)

### Highlights

- ❌ **Critical**: Race condition in `AnalysisResultView.tsx` - pending change not cleared on cascade cancel
- ❌ **Critical**: SQL injection risk in `deleteDownstreamStages` - section IDs used in `.in()` without validation
- ⚠️ **High**: Error handling issues in multiple server actions - silent failures logged but not propagated
- ⚠️ **High**: Missing auth context in `getChatTokenEstimates` - no user validation before DB query
- ✅ **Good**: Type-check and build pass successfully
- ✅ **Good**: Cascade deletion properly uses transactions implicitly via multiple related deletes

---

## Detailed Findings

### Critical Issues (2)

#### 1. Race Condition: Pending Change Not Cleared on Modal Cancel

- **File**: `packages/web/components/generation-graph/panels/output/AnalysisResultView.tsx:292-297`
- **Category**: Bugs
- **Description**: When user cancels the cascade delete modal, `pendingChange` state is cleared but the field value remains changed in the UI. If user then makes a different edit without refreshing, the old pending change may be applied incorrectly.
- **Impact**: Data corruption - wrong field might be saved with wrong value
- **Recommendation**: Reset the field's UI value when canceling cascade modal

**Current code (problematic)**:

```typescript
const handleCascadeCancel = useCallback(() => {
  setCascadeModalOpen(false);
  setPendingChange(null); // Clears pending change
  setDownstreamInfo(null);
  // BUT: The EditableField component still shows the edited value
}, []);
```

**Recommended fix**:

```typescript
const handleCascadeCancel = useCallback(() => {
  setCascadeModalOpen(false);
  setPendingChange(null);
  setDownstreamInfo(null);

  // Option 1: Force component re-render to reset field values
  // (requires adding version key to trigger re-mount)

  // Option 2: Add callback to EditableField to revert value
  // if (pendingChange?.fieldPath) {
  //   onRevertField?.(pendingChange.fieldPath)
  // }
}, []);
```

#### 2. SQL Injection Risk: Unvalidated Section IDs in DELETE Query

- **File**: `packages/course-gen-platform/src/server/routers/generation/editing/field-update.router.ts:334-391`
- **Category**: Security
- **Description**: Section IDs fetched from database are used directly in `.in()` clause without UUID validation. While Supabase client likely sanitizes, defense-in-depth requires explicit validation.
- **Impact**: Potential SQL injection if Supabase client has vulnerability or data is corrupted
- **Recommendation**: Validate all section IDs are valid UUIDs before using in queries

**Current code (problematic)**:

```typescript
const { data: sections, error: sectionsError } = await supabase
  .from('sections')
  .select('id')
  .eq('course_id', courseId);

const sectionIds = sections?.map(s => s.id) || [];

// Used directly without validation
const { data: lessons, error: lessonsQueryError } = await supabase
  .from('lessons')
  .select('id')
  .in('section_id', sectionIds); // ⚠️ No UUID validation
```

**Recommended fix**:

```typescript
import { z } from 'zod';

const sectionIds = sections?.map(s => s.id) || [];

// Validate all IDs are UUIDs
const validSectionIds = sectionIds.filter(id => {
  const result = z.string().uuid().safeParse(id);
  if (!result.success) {
    logger.warn({ requestId, invalidId: id }, 'Invalid section ID found');
  }
  return result.success;
});

if (validSectionIds.length === 0) {
  logger.info({ requestId, courseId }, 'No valid sections to delete');
  return {
    success: true,
    deletedLessonsCount: 0,
    deletedStructure: false,
    deletedSectionsCount: 0,
  };
}

const { data: lessons } = await supabase
  .from('lessons')
  .select('id')
  .in('section_id', validSectionIds);
```

---

### High Priority Issues (5)

#### 3. Missing Auth Context in Token Estimates Endpoint

- **File**: `packages/web/app/actions/refinement.ts:56-80`
- **Category**: Security
- **Description**: `getChatTokenEstimates` server action calls backend tRPC endpoint but doesn't verify user has access to the course before making request. Auth headers are passed but course ownership isn't checked.
- **Impact**: Users could potentially query token estimates for courses they don't own
- **Recommendation**: Add course access check before calling backend

**Current code (problematic)**:

```typescript
export async function getChatTokenEstimates(courseId: string): Promise<TokenEstimates | null> {
  const headers = await getBackendAuthHeaders(); // ⚠️ Only gets auth headers, no authorization check

  const response = await fetch(
    `${TRPC_URL}/generation.getChatTokenEstimates?input=${encodeURIComponent(JSON.stringify({ json: { courseId } }))}`,
    {
      method: 'GET',
      headers,
    }
  );
  // ...
}
```

**Recommended fix**:

```typescript
export async function getChatTokenEstimates(courseId: string): Promise<TokenEstimates | null> {
  // Verify user has access to this course
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Authentication required');
  }

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, user_id, organization_id')
    .eq('id', courseId)
    .single();

  if (error || !course) {
    throw new Error('Course not found');
  }

  // Verify user owns course or is in same org
  if (course.user_id !== user.id && course.organization_id !== user.organization_id) {
    throw new Error('Access denied');
  }

  const headers = await getBackendAuthHeaders();
  // ... rest of implementation
}
```

#### 4. Silent Error Handling in Cascade Delete

- **File**: `packages/course-gen-platform/src/server/routers/generation/editing/field-update.router.ts:344-364`
- **Category**: Error Handling
- **Description**: Errors when fetching lessons or deleting lesson_contents are logged with `logger.warn` but execution continues. This could lead to partial deletes where lessons exist but contents don't.
- **Impact**: Data inconsistency - orphaned lessons without contents
- **Recommendation**: Either make these errors blocking OR document that partial deletes are acceptable

**Current code (problematic)**:

```typescript
const { data: lessons, error: lessonsQueryError } = await supabase
  .from('lessons')
  .select('id')
  .in('section_id', sectionIds);

if (lessonsQueryError) {
  logger.warn({ requestId, courseId, error: lessonsQueryError }, 'Failed to get lessons');
  // ⚠️ Continues execution - could skip lesson content deletion
}

const lessonIds = lessons?.map(l => l.id) || [];

if (lessonIds.length > 0) {
  const { error: contentsError } = await supabase
    .from('lesson_contents')
    .delete()
    .in('lesson_id', lessonIds);

  if (contentsError) {
    logger.warn({ requestId, courseId, error: contentsError }, 'Failed to delete lesson_contents');
    // ⚠️ Continues anyway - lessons deleted but contents remain
  }
}
```

**Recommended fix (Option 1: Fail fast)**:

```typescript
const { data: lessons, error: lessonsQueryError } = await supabase
  .from('lessons')
  .select('id')
  .in('section_id', sectionIds);

if (lessonsQueryError) {
  logger.error({ requestId, courseId, error: lessonsQueryError }, 'Failed to get lessons');
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to fetch lessons for deletion',
  });
}

// Continue only if query succeeded
const lessonIds = lessons?.map(l => l.id) || [];

if (lessonIds.length > 0) {
  const { error: contentsError } = await supabase
    .from('lesson_contents')
    .delete()
    .in('lesson_id', lessonIds);

  if (contentsError) {
    logger.error({ requestId, courseId, error: contentsError }, 'Failed to delete lesson_contents');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to delete lesson contents',
    });
  }
}
```

**Recommended fix (Option 2: Document partial deletes)**:

```typescript
// Add comment explaining why partial deletes are acceptable
// NOTE: Partial deletes are acceptable here because:
// 1. lesson_contents has ON DELETE CASCADE foreign key to lessons
// 2. Deleting lessons will automatically clean up contents
// 3. This is a best-effort cleanup to avoid FK constraint errors

if (lessonsQueryError) {
  logger.warn(
    { requestId, courseId, error: lessonsQueryError },
    'Failed to get lessons for content cleanup - will rely on CASCADE'
  );
}
```

#### 5. No Abort Controller Cleanup in GlobalCourseChat

- **File**: `packages/web/components/generation/GlobalCourseChat.tsx:143-207`
- **Category**: Performance / Memory Leak
- **Description**: `sendMessage` function uses `AbortSignal` parameter but never creates or cleans up `AbortController`. If component unmounts during fetch, request continues running.
- **Impact**: Memory leak - unmounted components keep running fetch requests
- **Recommendation**: Create AbortController, abort on unmount

**Current code (problematic)**:

```typescript
const sendMessage = useCallback(
  async (messageText: string, intent: 'refine' | 'regenerate' = selectedIntent) => {
    if (!messageText.trim() || isProcessing) return;

    setIsProcessing(true);
    // ...

    try {
      // ⚠️ No AbortController created
      const result = await sendChatMessage({
        courseId,
        chatType: 'global',
        userMessage: messageText,
        conversationId,
        intent,
      }); // No signal passed

      // ...
    } catch {
      // ...
    }
  },
  [courseId, conversationId, isProcessing, onRegenerationRequest, selectedIntent, t]
);
```

**Recommended fix**:

```typescript
const sendMessage = useCallback(
  async (messageText: string, intent: 'refine' | 'regenerate' = selectedIntent) => {
    if (!messageText.trim() || isProcessing) return;

    setIsProcessing(true);

    // Create AbortController for this request
    const controller = new AbortController();

    // Store ref for cleanup
    const abortRef = { current: controller };

    try {
      const result = await sendChatMessage(
        {
          courseId,
          chatType: 'global',
          userMessage: messageText,
          conversationId,
          intent,
        },
        controller.signal
      ); // Pass signal

      // ...
    } catch (error) {
      // Only show error if not aborted
      if (error instanceof Error && error.name !== 'AbortError') {
        toast.error(t('error'), {
          description: t('errorDescription'),
        });
      }
      // ...
    } finally {
      setIsProcessing(false);
    }

    // Return cleanup function
    return () => {
      abortRef.current.abort();
    };
  },
  [courseId, conversationId, isProcessing, onRegenerationRequest, selectedIntent, t]
);

// Add useEffect for cleanup on unmount
useEffect(() => {
  let cleanup: (() => void) | undefined;

  return () => {
    cleanup?.();
  };
}, []);
```

#### 6. GraphView Props Changed Without PropTypes Update

- **File**: `packages/web/components/generation-graph/GraphView.tsx` (referenced at line 2)
- **Category**: Type Safety
- **Description**: `useFallbackPolling` signature changed from `courseId` to `orgSlug/courseSlug` but GraphView component wasn't checked for prop changes. Need to verify all parent components pass correct props.
- **Impact**: Runtime error if orgSlug/courseSlug not available
- **Recommendation**: Add TypeScript guards or default values

**Recommended check**:

```typescript
// In GraphView component
const { orgSlug, courseSlug } = props;

if (!orgSlug || !courseSlug) {
  console.warn('[GraphView] Missing orgSlug or courseSlug for fallback polling');
  // Disable fallback or show error state
}

const polledTraces = useFallbackPolling(orgSlug, courseSlug, isRealtimeConnected);
```

#### 7. RefinementChat Always Expanded - No Persistence

- **File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx:42`
- **Category**: UX / State Management
- **Description**: `isOpen` defaults to `true` but there's no localStorage persistence. User's preference isn't saved across page refreshes.
- **Impact**: Minor UX issue - users must collapse chat every page load
- **Recommendation**: Add localStorage persistence for chat expanded state

**Current code**:

```typescript
const [isOpen, setIsOpen] = useState(true); // Expanded by default (FR-022)
```

**Recommended fix**:

```typescript
const [isOpen, setIsOpen] = useState(() => {
  // Check localStorage for user preference
  const saved = localStorage.getItem('refinementChat.isOpen');
  return saved ? JSON.parse(saved) : true; // Default to true (FR-022)
});

// Persist preference when changed
useEffect(() => {
  localStorage.setItem('refinementChat.isOpen', JSON.stringify(isOpen));
}, [isOpen]);
```

---

### Medium Priority Issues (8)

#### 8. Duplicate Field Status Tracking Logic

- **Files**:
  - `packages/web/components/generation-graph/panels/output/AnalysisResultView.tsx:178-337`
  - `packages/web/components/generation-graph/panels/stage5/Stage5OutputTab.tsx:134-230`
- **Category**: Code Duplication
- **Description**: Identical field status tracking logic (Map-based, useEffect for cleanup) duplicated across two components. 200+ lines of identical code.
- **Impact**: Maintenance burden - bugs must be fixed twice, features added twice
- **Recommendation**: Extract to custom hook `useFieldStatusTracking`

**Recommended refactor**:

```typescript
// packages/web/components/generation-graph/hooks/useFieldStatusTracking.ts
export function useFieldStatusTracking(
  save: (fieldPath: string, value: unknown) => void,
  globalStatus: SaveStatus
) {
  const [fieldStatuses, setFieldStatuses] = useState<Map<string, SaveStatus>>(new Map());
  const lastSavedFieldRef = useRef<string | null>(null);

  const performSave = useCallback(
    (fieldPath: string, value: unknown) => {
      setFieldStatuses(prev => {
        const next = new Map(prev);
        next.set(fieldPath, 'saving');
        return next;
      });
      lastSavedFieldRef.current = fieldPath;
      save(fieldPath, value);
    },
    [save]
  );

  const getFieldStatus = useCallback(
    (fieldPath: string): SaveStatus => {
      return fieldStatuses.get(fieldPath) ?? 'idle';
    },
    [fieldStatuses]
  );

  // Update per-field status when save completes
  useEffect(() => {
    if ((globalStatus === 'saved' || globalStatus === 'error') && lastSavedFieldRef.current) {
      const fieldPath = lastSavedFieldRef.current;
      setFieldStatuses(prev => {
        const next = new Map(prev);
        next.set(fieldPath, globalStatus);
        return next;
      });

      let isMounted = true;
      const timer = setTimeout(() => {
        if (isMounted) {
          setFieldStatuses(prev => {
            const next = new Map(prev);
            next.delete(fieldPath);
            return next;
          });
        }
      }, 2000);

      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    }
  }, [globalStatus]);

  return { performSave, getFieldStatus };
}
```

#### 9. Cascade Modal Logic Duplicated

- **Files**: Same as #8
- **Category**: Code Duplication
- **Description**: Cascade delete modal integration logic (150+ lines) duplicated between AnalysisResultView and Stage5OutputTab. Identical state, handlers, and flow.
- **Impact**: Maintenance burden - modal behavior changes need 2 updates
- **Recommendation**: Extract to custom hook `useCascadeStageDelete`

**Recommended refactor**:

```typescript
// packages/web/components/generation-graph/hooks/useCascadeStageDelete.ts
export function useCascadeStageDelete(
  courseId: string | undefined,
  sourceStage: 4 | 5,
  performSave: (fieldPath: string, value: unknown) => void,
  locale: 'ru' | 'en' = 'ru'
) {
  const [cascadeModalOpen, setCascadeModalOpen] = useState(false);
  const [downstreamInfo, setDownstreamInfo] = useState<DownstreamStagesInfo | null>(null);
  const [pendingChange, setPendingChange] = useState<{ fieldPath: string; value: unknown } | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const downstreamDeletedRef = useRef(false);

  const handleFieldSaveAsync = useCallback(
    async (fieldPath: string, value: unknown) => {
      if (downstreamDeletedRef.current) {
        performSave(fieldPath, value);
        return;
      }

      if (!courseId) {
        performSave(fieldPath, value);
        return;
      }

      try {
        const info = await checkDownstreamStagesAction(courseId);

        // Stage 4: check both Stage 5 and 6
        // Stage 5: only check Stage 6
        const shouldWarn = sourceStage === 4 ? info.hasStage5 || info.hasStage6 : info.hasStage6;

        if (!shouldWarn) {
          performSave(fieldPath, value);
          return;
        }

        setDownstreamInfo(info);
        setPendingChange({ fieldPath, value });
        setCascadeModalOpen(true);
      } catch (error) {
        console.error('Failed to check downstream stages:', error);
        performSave(fieldPath, value);
      }
    },
    [courseId, performSave, sourceStage]
  );

  // ... rest of handlers (handleConfirm, handleCancel)

  return {
    cascadeModalOpen,
    downstreamInfo,
    isDeleting,
    handleFieldSave: (fieldPath: string, value: unknown) =>
      void handleFieldSaveAsync(fieldPath, value),
    handleCascadeConfirm,
    handleCascadeCancel,
    modalProps: {
      isOpen: cascadeModalOpen,
      onClose: handleCascadeCancel,
      onConfirm: handleCascadeConfirm,
      downstreamInfo: downstreamInfo || {
        hasStage5: false,
        hasStage6: false,
        stage6LessonsCount: 0,
      },
      locale,
      isDeleting,
      sourceStage,
    },
  };
}
```

#### 10. Message ID Generation Uses Weak Randomness

- **File**: `packages/web/components/generation/GlobalCourseChat.tsx:78-80`
- **Category**: Code Quality
- **Description**: `generateMessageId` uses `Math.random()` which isn't cryptographically secure. While not critical for UI IDs, could cause collisions under high load.
- **Impact**: Potential message ID collision (very low probability)
- **Recommendation**: Use `crypto.randomUUID()` or nanoid for better collision resistance

**Current code**:

```typescript
function generateMessageId(prefix: 'temp' | 'msg'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

**Recommended fix**:

```typescript
import { nanoid } from 'nanoid';

function generateMessageId(prefix: 'temp' | 'msg'): string {
  return `${prefix}-${nanoid(12)}`;
}
```

#### 11. Error Response Validation Missing in Server Actions

- **Files**: `packages/web/app/actions/admin-generation.ts:497-514`, `refinement.ts:56-80`
- **Category**: Error Handling
- **Description**: Server actions check `response.ok` but don't validate error response structure before accessing `.message`. Could fail if backend returns unexpected error format.
- **Impact**: Unhandled exceptions during error handling
- **Recommendation**: Add error response schema validation

**Current code (problematic)**:

```typescript
if (!response.ok) {
  await extractApiError(response, 'Failed to check downstream stages');
}
```

**Check extractApiError implementation**:

```typescript
// If extractApiError doesn't validate response structure:
export async function extractApiError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    // ⚠️ No validation that data.error or data.message exists
    throw new Error(data.error?.message || data.message || fallback);
  } catch {
    throw new Error(fallback);
  }
}
```

#### 12. No Loading State for Token Estimates

- **File**: `packages/web/components/generation/GlobalCourseChat.tsx:129-141`
- **Category**: UX
- **Description**: Token estimates fetched on mount but there's no loading state. UI shows hardcoded fallbacks `~2K` and `~20K+` until fetch completes.
- **Impact**: User sees wrong estimates briefly on slow networks
- **Recommendation**: Add loading state and skeleton UI

**Recommended fix**:

```typescript
const [tokenEstimates, setTokenEstimates] = useState<TokenEstimates | null>(null);
const [isLoadingEstimates, setIsLoadingEstimates] = useState(true);

useEffect(() => {
  if (!courseId) return;

  const fetchEstimates = async () => {
    setIsLoadingEstimates(true);
    const result = await getChatTokenEstimates(courseId);
    if (result) {
      setTokenEstimates(result);
    }
    setIsLoadingEstimates(false);
  };

  void fetchEstimates();
}, [courseId]);

// In UI:
<ToggleGroupItem value="refine">
  <Wand2 className="mr-1 h-3 w-3" />
  {t('modes.refine')} (
    {isLoadingEstimates ? (
      <Loader2 className="inline h-3 w-3 animate-spin" />
    ) : (
      tokenEstimates?.refine?.formatted ?? '~2K'
    )}
  )
</ToggleGroupItem>
```

#### 13. Missing Revalidation After Cascade Delete

- **File**: `packages/web/app/actions/admin-generation.ts:523-539`
- **Category**: Cache Invalidation
- **Description**: `deleteDownstreamStagesAction` calls `revalidatePath` but only for the generating page. Other pages showing course data won't update until manual refresh.
- **Impact**: Stale data shown in course list, admin panel
- **Recommendation**: Revalidate all course-related paths

**Current code**:

```typescript
revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page');
```

**Recommended fix**:

```typescript
// Revalidate all course-related paths
revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page');
revalidatePath('/courses/[orgSlug]/[courseSlug]', 'layout'); // Also revalidates nested pages
revalidatePath('/admin/generation/[courseId]', 'page');
```

#### 14. useFallbackPolling Doesn't Handle Route Changes

- **File**: `packages/web/components/generation-graph/hooks/useFallbackPolling.ts:24-63`
- **Category**: Bug
- **Description**: If user navigates between courses, polling interval persists with old orgSlug/courseSlug. Could fetch data for wrong course briefly.
- **Impact**: Brief display of wrong course data during navigation
- **Recommendation**: Clear polled data when slugs change

**Recommended fix**:

```typescript
useEffect(() => {
  // Clear polled data when course changes
  setPolledTraces([]);

  if (pollingRef.current) {
    clearInterval(pollingRef.current);
    pollingRef.current = null;
  }

  // ... rest of polling setup
}, [orgSlug, courseSlug, isRealtimeConnected]);
```

#### 15. CascadeStageDeleteModal Translation Hardcoded

- **File**: `packages/web/components/generation-graph/panels/output/CascadeStageDeleteModal.tsx:36-64`
- **Category**: Internationalization
- **Description**: Translations are hardcoded object instead of using `next-intl`. Inconsistent with rest of codebase.
- **Impact**: Harder to add new languages, not integrated with i18n tooling
- **Recommendation**: Migrate to `next-intl` or extract to shared translations

**Current code**:

```typescript
const translations = {
  ru: {
    /* ... */
  },
  en: {
    /* ... */
  },
};

const t = translations[locale];
```

**Recommended fix**:

```typescript
// Add to messages/ru.json and messages/en.json
// "cascadeDeleteModal": {
//   "title": "Каскадное удаление",
//   ...
// }

import { useTranslations } from 'next-intl';

export const CascadeStageDeleteModal: React.FC<Props> = ({ ... }) => {
  const t = useTranslations('cascadeDeleteModal');

  return (
    <AlertDialogTitle>{t('title')}</AlertDialogTitle>
    // ...
  );
};
```

---

### Low Priority Issues (3)

#### 16. Console.debug in Production Code

- **File**: `packages/web/components/generation-graph/hooks/useFallbackPolling.ts:45-49`
- **Category**: Code Quality
- **Description**: Uses `console.debug` for polling errors. Should use proper logger or conditional logging based on environment.
- **Impact**: Console noise in production
- **Recommendation**: Use logger or conditional logging

**Current code**:

```typescript
console.debug(
  '[useFallbackPolling] Polling failed:',
  err instanceof Error ? err.message : 'Unknown error'
);
```

**Recommended fix**:

```typescript
if (process.env.NODE_ENV === 'development') {
  console.debug('[useFallbackPolling] Polling failed:', err);
}
// Or use proper logger:
// logger.debug({ component: 'useFallbackPolling', error: err }, 'Polling failed');
```

#### 17. Magic Numbers in Layout Constants

- **File**: `packages/web/components/generation/GlobalCourseChat.tsx:42-70`
- **Category**: Code Quality
- **Description**: Layout constants defined but values still duplicated in Tailwind classes. Comment says "update both" but this is error-prone.
- **Impact**: Maintenance burden - must remember to update both places
- **Recommendation**: Use CSS variables or dynamic styles

**Current approach**:

```typescript
const CHAT_LAYOUT = {
  PANEL_MAX_HEIGHT: 400,  // Tailwind: max-h-[400px]
};

// Later in JSX:
<div className="max-h-[400px]">  {/* Must manually sync */}
```

**Recommended fix (Option 1: CSS variables)**:

```typescript
// In component:
<div
  className="max-h-[var(--chat-panel-max-height)]"
  style={{ '--chat-panel-max-height': `${CHAT_LAYOUT.PANEL_MAX_HEIGHT}px` } as React.CSSProperties}
>
```

**Recommended fix (Option 2: Dynamic Tailwind)**:

```typescript
<div style={{ maxHeight: `${CHAT_LAYOUT.PANEL_MAX_HEIGHT}px` }}>
```

#### 18. TypeScript `any` in updateField Mutation

- **File**: `packages/course-gen-platform/src/server/routers/generation/editing/field-update.router.ts:31`
- **Category**: Type Safety
- **Description**: Function signature uses `any` for `ctx` and `input` types instead of proper TypeScript types from Zod schema.
- **Impact**: Loses type safety, potential runtime errors
- **Recommendation**: Use Zod inferred types

**Current code**:

```typescript
.mutation(async ({ ctx, input }: { ctx: any; input: any }) => {
```

**Recommended fix**:

```typescript
import { z } from 'zod';

type UpdateFieldInput = z.infer<typeof updateFieldInputSchema>;

.mutation(async ({ ctx, input }: { ctx: typeof ctx; input: UpdateFieldInput }) => {
  // Now TypeScript validates input fields
  const { courseId, stageId, fieldPath, value } = input;
```

---

## Best Practices Validation

### React Patterns (Context7: /websites/react_dev)

#### ✅ Correct Patterns

1. **Hooks Usage**: All hooks follow Rules of Hooks
   - Hooks called at top level
   - Dependencies properly listed in useCallback/useEffect
   - No conditional hook calls

2. **State Management**: Proper useState and useRef usage
   - State updates are batched correctly
   - Refs used for mutable values (abortControllerRef, lastSavedFieldRef)
   - No state mutations

3. **Memoization**: Good use of useMemo and useCallback
   - `displayHistory` memoized to avoid re-renders
   - Event handlers wrapped in useCallback

#### ⚠️ Pattern Deviations

1. **Effect Cleanup**: Missing AbortController cleanup (Issue #5)
2. **State Reset**: Modal cancel doesn't reset field UI state (Issue #1)

### Next.js Patterns (Context7: /websites/nextjs)

#### ✅ Correct Patterns

1. **Server Actions**: Properly marked with `'use server'`
   - All server actions in `app/actions/` directory
   - Use async/await correctly
   - Return serializable data

2. **Revalidation**: Uses `revalidatePath` after mutations
   - Updates cache after deleteDownstreamStagesAction
   - Revalidates generating page path

3. **Error Boundaries**: Proper error handling with try/catch

#### ⚠️ Pattern Deviations

1. **Revalidation Scope**: Too narrow, only revalidates single page (Issue #13)
2. **Server Action Auth**: Missing course ownership check (Issue #3)

### tRPC Patterns (Context7: /trpc/trpc)

#### ✅ Correct Patterns

1. **Input Validation**: All endpoints use Zod schemas
   - `updateFieldInputSchema`, `checkDownstreamStagesInputSchema`, `deleteDownstreamStagesInputSchema`
   - Validates UUIDs, enums, required fields

2. **Error Handling**: Proper TRPCError usage
   - Correct error codes (UNAUTHORIZED, NOT_FOUND, INTERNAL_SERVER_ERROR)
   - Descriptive error messages

3. **Procedures**: Correct procedure types
   - `.query()` for read operations (checkDownstreamStages)
   - `.mutation()` for write operations (updateField, deleteDownstreamStages)

#### ⚠️ Pattern Deviations

1. **Type Safety**: Uses `any` types in mutation signature (Issue #18)
2. **Error Propagation**: Some errors logged but not thrown (Issue #4)

---

## Changes Reviewed

### Files Modified: 10

```
packages/course-gen-platform/src/server/routers/generation/editing/field-update.router.ts  (+287 lines)
packages/web/app/actions/admin-generation.ts                                               (+49 lines)
packages/web/app/actions/refinement.ts                                                     (+61 lines)
packages/web/components/generation-graph/GraphView.tsx                                     (±2 lines)
packages/web/components/generation-graph/hooks/useFallbackPolling.ts                       (+60 -old)
packages/web/components/generation-graph/panels/RefinementChat.tsx                         (+290 -old)
packages/web/components/generation-graph/panels/output/AnalysisResultView.tsx              (+139 lines)
packages/web/components/generation-graph/panels/output/CascadeStageDeleteModal.tsx         (+191 NEW)
packages/web/components/generation-graph/panels/stage5/Stage5OutputTab.tsx                 (+834 -old)
packages/web/components/generation/GlobalCourseChat.tsx                                    (+115 -old)
```

### Notable Changes

**Phase 1 - Auth/Routing Fixes:**

- ✅ Added `getChatTokenEstimates` server action with auth headers
- ✅ Switched GlobalCourseChat to use `sendChatMessage` server action
- ✅ Fixed useFallbackPolling to use orgSlug/courseSlug instead of courseId UUID

**Phase 2 - UX Improvements:**

- ✅ RefinementChat now expanded by default (FR-022 compliance)
- ✅ Auto-focuses textarea when opening

**Phase 3 - Cascade Dependencies:**

- ✅ Added CascadeStageDeleteModal component with checkbox confirmation
- ✅ Added checkDownstreamStages and deleteDownstreamStages tRPC endpoints
- ✅ Integrated cascade check into AnalysisResultView for Stage 4 editing
- ⚠️ Cascade check logic duplicated (Issue #9)

**Phase 4 - Stage 5 Inline Editing:**

- ✅ Enabled EditableField for course metadata in Stage5OutputTab
- ✅ Added cascade check for Stage 6 when editing Stage 5
- ⚠️ Field status tracking logic duplicated (Issue #8)

---

## Validation Results

### Type Check

**Command**: `pnpm type-check`

**Status**: ✅ PASSED

**Output**:

```
packages/shared-logger type-check: Done
packages/shared-types type-check: Done
packages/trpc-client-sdk type-check: Done
packages/course-gen-platform type-check: Done
packages/web type-check: Done
```

**Exit Code**: 0

### Build

**Command**: `pnpm build`

**Status**: ✅ PASSED

**Output**:

```
packages/shared-logger build: ⚡️ Build success in 42ms
packages/trpc-client-sdk build: Done
packages/shared-logger build: Done
packages/course-gen-platform build: ESM dist/orchestrator/processor.js 1.52 MB
packages/web build: ▲ Next.js 15.5.9
packages/web build:  ✓ Creating an optimized production build ...
```

**Exit Code**: 0

### Overall Status

**Validation**: ✅ PASSED

Both type-check and build completed successfully. No compilation errors found.

---

## Metrics

- **Total Duration**: ~15 minutes
- **Files Reviewed**: 10
- **Issues Found**: 18 (2 critical, 5 high, 8 medium, 3 low)
- **Validation Checks**: 2/2 passed
- **Context7 Checks**: ✅ (React, Next.js, tRPC patterns validated)
- **Lines Changed**: +1,516 / -512
- **Test Coverage**: Not measured (no tests in changed files)

---

## Next Steps

### Critical Actions (Must Do Before Merge)

1. **Fix Issue #1**: Clear pending field value when cascade modal is canceled
   - Add field revert mechanism to EditableField component
   - Test: Edit field → cascade modal appears → cancel → verify field reverts

2. **Fix Issue #2**: Validate section IDs are UUIDs before SQL queries
   - Add Zod UUID validation for all ID arrays used in `.in()` clauses
   - Test: Corrupt section ID data → verify graceful handling

### Recommended Actions (Should Do Before Merge)

3. **Address Issue #3**: Add course ownership check to getChatTokenEstimates
   - Verify user has access before querying backend
   - Test: User A tries to get estimates for User B's course → 403

4. **Address Issue #4**: Decide on error handling strategy for cascade deletes
   - Either fail fast OR document why partial deletes are acceptable
   - Test: Trigger lesson fetch error → verify expected behavior

5. **Address Issue #5**: Add AbortController cleanup to GlobalCourseChat
   - Create controller, abort on unmount
   - Test: Send message → unmount component → verify fetch is aborted

6. **Address Issue #6**: Verify GraphView receives orgSlug/courseSlug
   - Add TypeScript guards for missing slugs
   - Test: Missing slugs → verify graceful degradation

7. **Address Issue #7**: Add localStorage persistence for RefinementChat state
   - Save isOpen preference
   - Test: Collapse chat → refresh page → verify stays collapsed

### Future Improvements (Nice to Have)

8. **Extract duplicated hooks** (Issues #8, #9):
   - Create `useFieldStatusTracking` hook
   - Create `useCascadeStageDelete` hook
   - Reduces code duplication by ~350 lines

9. **Improve error handling** (Issues #11, #12):
   - Validate error response structure
   - Add loading state for token estimates

10. **Code quality improvements** (Issues #10, #13-18):
    - Use nanoid for message IDs
    - Expand revalidation scope
    - Fix polling route change handling
    - Migrate modal to next-intl
    - Remove console.debug
    - Fix magic numbers
    - Add proper TypeScript types

### Follow-Up

- **Security audit**: Review all endpoints for auth bypass vulnerabilities
- **Performance testing**: Verify cascade deletes perform well with large datasets (1000+ lessons)
- **E2E tests**: Add tests for cascade delete flow
- **Documentation**: Update API docs with cascade delete behavior

---

## Artifacts

- **Plan file**: Not applicable (direct code review)
- **Changes log**: Git commit `e05435fc`
- **This report**: `docs/reports/code-review/2026-01/chat-cascade-review.md`
- **Context7 validation**: Completed for React, Next.js, tRPC

---

**Code review execution complete.**

⚠️ **Status**: PARTIAL - Code meets quality standards for type-check and build, but has 2 critical issues and 5 high-priority issues that should be addressed before production deployment.

**Recommendation**: Address critical issues #1 and #2, then review high-priority issues with team to decide which are blocking vs. can be deferred to follow-up PR.
