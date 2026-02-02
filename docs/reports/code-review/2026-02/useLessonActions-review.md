# Code Review: useLessonActions & ModuleDashboard Changes

**Review Date**: 2026-02-02
**Reviewer**: Claude Code
**Task**: mc2-z8uf - Implement tRPC mutations for lesson actions
**Files Reviewed**:

- `packages/web/components/generation-graph/hooks/useLessonActions.ts` (new)
- `packages/web/components/generation-graph/panels/module/ModuleDashboard.tsx` (modified)
- `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx` (context)

---

## Summary

The implementation adds a new custom hook `useLessonActions` to handle lesson retry, pause, and resume operations, integrating with existing server actions. The hook is used in `ModuleDashboard` to provide action handlers for the lesson matrix UI.

**Overall Assessment**: ⚠️ **Moderate Quality** - Implementation is functional but has several issues affecting reliability, UX, and maintainability.

**Type Check**: ✅ Passes
**Critical Issues**: 2
**High Priority**: 4
**Medium Priority**: 3
**Low Priority**: 2

---

## Critical Issues (P0)

### 1. Race Condition: Shared `isLoading` State Across Multiple Actions

**File**: `useLessonActions.ts:14-26`
**Severity**: Critical - Can cause UI inconsistencies and blocked interactions

**Problem**:
All three actions (`retryLesson`, `pause`, `resume`) share a single `isLoading` state. This creates race conditions when:

1. User clicks "Retry Lesson 1.1"
2. While that's pending, user clicks "Pause Generation"
3. Both actions are now racing, and `isLoading` gets set to `false` by whichever finishes first
4. The other action's loading state is lost, button might show incorrect state

```typescript
// Current problematic code
const [isLoading, setIsLoading] = useState(false);

const retryLesson = useCallback(
  async (lessonId: string) => {
    setIsLoading(true); // ❌ Blocks ALL actions
    try {
      await retryLessonGeneration(courseId, lessonId);
      // ...
    } finally {
      setIsLoading(false); // ❌ Affects ALL actions
    }
  },
  [courseId, onSuccess]
);
```

**Impact**:

- User might click "Pause" while "Retry" is pending → both buttons disabled
- If "Pause" finishes first, "Retry" button incorrectly becomes enabled mid-operation
- Can't distinguish which operation is in progress (poor UX)

**Recommended Solution**:

Use separate loading states for different operation types:

```typescript
interface LoadingState {
  retrying: Set<string>; // Track which lessons are retrying
  pausing: boolean;
  resuming: boolean;
}

const [loadingState, setLoadingState] = useState<LoadingState>({
  retrying: new Set(),
  pausing: false,
  resuming: false,
});

const retryLesson = useCallback(
  async (lessonId: string) => {
    // Prevent duplicate retry for same lesson
    if (loadingState.retrying.has(lessonId)) return;

    setLoadingState(prev => ({
      ...prev,
      retrying: new Set(prev.retrying).add(lessonId),
    }));

    try {
      await retryLessonGeneration(courseId, lessonId);
      toast.success('Урок добавлен в очередь на повторную генерацию');
      onSuccess?.();
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setLoadingState(prev => {
        const next = new Set(prev.retrying);
        next.delete(lessonId);
        return { ...prev, retrying: next };
      });
    }
  },
  [courseId, onSuccess]
);

// Return granular loading states
return {
  retryLesson,
  pause,
  resume,
  isRetrying: (lessonId: string) => loadingState.retrying.has(lessonId),
  isPausing: loadingState.pausing,
  isResuming: loadingState.resuming,
  isLoading: loadingState.retrying.size > 0 || loadingState.pausing || loadingState.resuming,
};
```

**Alternative (Simpler)**:
If only one action can be active at a time by design, add operation tracking:

```typescript
const [loadingOp, setLoadingOp] = useState<{
  type: 'retry' | 'pause' | 'resume';
  lessonId?: string;
} | null>(null);

const isLoading = loadingOp !== null;
const isRetrying = (lessonId: string) =>
  loadingOp?.type === 'retry' && loadingOp.lessonId === lessonId;
const isPausing = loadingOp?.type === 'pause';
const isResuming = loadingOp?.type === 'resume';
```

---

### 2. No Cancel/Abort Mechanism for Ongoing Requests

**File**: `useLessonActions.ts:16-56`
**Severity**: Critical - Memory leaks and stale state updates

**Problem**:
When component unmounts (user navigates away) or hook dependencies change, ongoing server actions continue and attempt to update state on unmounted component. This causes:

- React warnings: "Can't perform a React state update on an unmounted component"
- Potential memory leaks
- Stale success/error toasts appearing after user has moved to different page

**Example Scenario**:

1. User clicks "Retry Lesson 1.1" in Module 1 dashboard
2. User navigates to Module 2 dashboard (ModuleDashboard unmounts)
3. Server action completes 2 seconds later
4. Toast appears: "Урок добавлен в очередь" (but user is now viewing Module 2!)

**Recommended Solution**:

Use AbortController and cleanup in useEffect:

```typescript
export function useLessonActions({ courseId, onSuccess }: UseLessonActionsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Abort any ongoing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const retryLesson = useCallback(
    async (lessonId: string) => {
      // Create new abort controller for this request
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      try {
        // Pass abort signal to server action (if supported)
        await retryLessonGeneration(courseId, lessonId, { signal: controller.signal });

        // Only update UI if still mounted
        if (!mountedRef.current || controller.signal.aborted) return;

        toast.success('Урок добавлен в очередь на повторную генерацию');
        onSuccess?.();
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === 'AbortError') return;
        if (!mountedRef.current) return;

        toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [courseId, onSuccess]
  );

  // Similar for pause/resume...
}
```

**Note**: Server actions (`retryLessonGeneration`, `pauseGeneration`, `resumeGeneration`) currently don't support AbortController. This would require updating them to accept and propagate abort signals.

---

## High Priority (P1)

### 3. Missing Error Recovery and User Guidance

**File**: `useLessonActions.ts:23-24, 38-39, 51-52`
**Severity**: High - Poor error UX, no recovery path

**Problem**:
Error handling is minimal - just shows error message in toast. No:

- Specific error type handling (network errors, validation errors, permission errors)
- Retry mechanism for transient failures
- User guidance on how to fix the issue
- Error logging for debugging

```typescript
// Current code - minimal error handling
catch (error) {
  toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`)
}
```

**Examples of Missing Scenarios**:

- **Network timeout**: Should offer "Retry" button, not just error message
- **Permission denied**: Should explain user lacks permission, suggest contacting admin
- **Lesson not found**: Should explain lesson was deleted, suggest refreshing page
- **Server overload**: Should suggest trying again later

**Recommended Solution**:

```typescript
// Add error categorization
function categorizeError(error: unknown): {
  type: 'network' | 'permission' | 'validation' | 'server' | 'unknown';
  message: string;
  recoverable: boolean;
} {
  if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes('fetch failed') || error.message.includes('network')) {
      return {
        type: 'network',
        message: 'Ошибка сети. Проверьте подключение к интернету.',
        recoverable: true,
      };
    }
    if (error.message.includes('permission') || error.message.includes('forbidden')) {
      return {
        type: 'permission',
        message: 'Недостаточно прав для этой операции. Обратитесь к администратору.',
        recoverable: false,
      };
    }
    if (error.message.includes('not found')) {
      return {
        type: 'validation',
        message: 'Урок не найден. Возможно, он был удалён.',
        recoverable: false,
      };
    }
  }

  return {
    type: 'unknown',
    message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    recoverable: true,
  };
}

// Enhanced error handling with recovery
const retryLesson = useCallback(
  async (lessonId: string) => {
    setIsLoading(true);
    try {
      await retryLessonGeneration(courseId, lessonId);
      toast.success('Урок добавлен в очередь на повторную генерацию');
      onSuccess?.();
    } catch (error) {
      const { type, message, recoverable } = categorizeError(error);

      // Log for debugging
      logger.error('Lesson retry failed', {
        courseId,
        lessonId,
        errorType: type,
        error: error instanceof Error ? error.message : String(error),
      });

      // Show appropriate toast with recovery option
      if (recoverable) {
        toast.error(message, {
          action: {
            label: 'Повторить',
            onClick: () => retryLesson(lessonId),
          },
        });
      } else {
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  },
  [courseId, onSuccess]
);
```

---

### 4. Missing Optimistic UI Updates and State Synchronization

**File**: `ModuleDashboard.tsx:138-146`
**Severity**: High - Poor perceived performance, inconsistent UI

**Problem**:
After calling `retryLesson()`, `pause()`, or `resume()`, there's no immediate UI feedback beyond toast. User has to wait for:

- Server action to complete
- Database update
- Realtime subscription to propagate change
- Component to re-render with new data

This creates 1-3 second delay where UI appears frozen or out of sync with actual state.

**Example**:

1. User clicks "Pause" button
2. Button stays in "Pause" state for 2 seconds (no immediate feedback)
3. Eventually realtime update arrives and button changes to "Resume"

**Recommended Solution**:

Add optimistic updates with rollback on error:

```typescript
// In ModuleDashboard.tsx
const [optimisticState, setOptimisticState] = useState<{
  pausedCourse?: boolean
  retryingLessons?: Set<string>
}>({})

const handleLessonAction = async (
  lessonId: string,
  action: 'view' | 'retry' | 'pause' | 'play'
) => {
  switch (action) {
    case 'view':
      selectNode(toNodeId(lessonId))
      break

    case 'retry':
      // Optimistic update: mark lesson as "retrying" immediately
      setOptimisticState(prev => ({
        ...prev,
        retryingLessons: new Set(prev.retryingLessons).add(lessonId),
      }))

      try {
        await retryLesson(lessonId)
        // Success handled by toast in hook
      } catch (error) {
        // Rollback optimistic update on error
        setOptimisticState(prev => {
          const next = new Set(prev.retryingLessons)
          next.delete(lessonId)
          return { ...prev, retryingLessons: next }
        })
      }
      break

    case 'pause':
      // Optimistic update: immediately show as paused
      setOptimisticState(prev => ({ ...prev, pausedCourse: true }))

      try {
        await pause()
      } catch (error) {
        // Rollback on error
        setOptimisticState(prev => ({ ...prev, pausedCourse: false }))
      }
      break

    case 'play':
      // Optimistic update: immediately show as resumed
      setOptimisticState(prev => ({ ...prev, pausedCourse: false }))

      try {
        await resume()
      } catch (error) {
        // Rollback on error
        setOptimisticState(prev => ({ ...prev, pausedCourse: true }))
      }
      break
  }

  logger.debug(`Lesson action: ${action}`, { lessonId, action })
}

// Pass optimistic state to LessonMatrix for immediate UI updates
<LessonMatrix
  lessons={data.lessons}
  onLessonClick={handleLessonClick}
  onLessonAction={(lessonId, action) => void handleLessonAction(lessonId, action)}
  optimisticRetrying={optimisticState.retryingLessons}
  optimisticPaused={optimisticState.pausedCourse}
/>
```

---

### 5. No Validation or Guard Clauses

**File**: `useLessonActions.ts:16-56`
**Severity**: High - Can trigger invalid operations

**Problem**:
Hook doesn't validate inputs before making API calls:

- `courseId` could be empty string or invalid UUID
- `lessonId` could be empty, malformed, or non-existent
- Multiple rapid clicks can trigger duplicate requests

**Example Issues**:

```typescript
// User can trigger multiple retries for same lesson
onClick={() => {
  retryLesson('1.1')  // First call
  retryLesson('1.1')  // Second call before first completes
}}

// Invalid inputs accepted
retryLesson('')  // Empty lessonId
pause()  // While already paused
```

**Recommended Solution**:

Add validation and idempotency checks:

```typescript
const retryLesson = useCallback(
  async (lessonId: string) => {
    // Validation
    if (!lessonId || typeof lessonId !== 'string') {
      logger.error('Invalid lessonId', { lessonId });
      return;
    }

    if (!courseId || typeof courseId !== 'string') {
      logger.error('Invalid courseId', { courseId });
      return;
    }

    // Prevent duplicate requests (idempotency)
    if (isLoading) {
      logger.debug('Retry skipped - already loading', { lessonId });
      return;
    }

    // Validate lessonId format (section.lesson)
    const lessonIdPattern = /^\d+\.\d+$/;
    if (!lessonIdPattern.test(lessonId)) {
      logger.error('Invalid lessonId format', { lessonId });
      toast.error('Неверный формат ID урока');
      return;
    }

    setIsLoading(true);
    try {
      await retryLessonGeneration(courseId, lessonId);
      toast.success('Урок добавлен в очередь на повторную генерацию');
      onSuccess?.();
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setIsLoading(false);
    }
  },
  [courseId, onSuccess, isLoading] // Add isLoading to deps
);

// Similar for pause/resume with state checks
const pause = useCallback(async () => {
  if (isLoading) return; // Already paused/resuming

  // TODO: Could check current generation status first
  // to avoid pausing an already paused course

  setIsLoading(true);
  // ... rest of implementation
}, [courseId, onSuccess, isLoading]);
```

---

### 6. `onSuccess` Callback Lacks Context

**File**: `useLessonActions.ts:8-11, 22, 37, 50`
**Severity**: High - Limited extensibility, hard to coordinate with parent components

**Problem**:
`onSuccess` callback is called without any parameters - parent component doesn't know:

- Which action succeeded (retry/pause/resume)
- Which lesson was affected (for retry)
- What changed (old status → new status)

This makes it impossible for parent components to:

- Perform specific actions based on operation type
- Update local state optimistically
- Show context-specific success messages
- Log analytics events with proper context

**Current Usage**:

```typescript
const { retryLesson, pause, resume } = useLessonActions({
  courseId,
  onSuccess: () => {
    // ❌ No idea what succeeded - can only do generic refresh
    refetch();
  },
});
```

**Recommended Solution**:

```typescript
// Enhanced callback with context
interface UseLessonActionsOptions {
  courseId: string;
  onSuccess?: (result: SuccessResult) => void;
}

type SuccessResult =
  | { type: 'retry'; lessonId: string }
  | { type: 'pause'; courseId: string }
  | { type: 'resume'; courseId: string };

export function useLessonActions({ courseId, onSuccess }: UseLessonActionsOptions) {
  const retryLesson = useCallback(
    async (lessonId: string) => {
      setIsLoading(true);
      try {
        await retryLessonGeneration(courseId, lessonId);
        toast.success('Урок добавлен в очередь на повторную генерацию');
        onSuccess?.({ type: 'retry', lessonId }); // ✅ Pass context
      } catch (error) {
        toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
      } finally {
        setIsLoading(false);
      }
    },
    [courseId, onSuccess]
  );

  const pause = useCallback(async () => {
    setIsLoading(true);
    try {
      await pauseGeneration(courseId);
      toast.success('Генерация приостановлена');
      onSuccess?.({ type: 'pause', courseId }); // ✅ Pass context
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, onSuccess]);

  // Similar for resume...
}

// Now parent can react specifically:
const { retryLesson, pause, resume } = useLessonActions({
  courseId,
  onSuccess: result => {
    switch (result.type) {
      case 'retry':
        // Optimistically update just this lesson's status
        updateLessonStatus(result.lessonId, 'pending');
        break;
      case 'pause':
        // Show "paused" banner
        setPausedState(true);
        break;
      case 'resume':
        // Hide "paused" banner
        setPausedState(false);
        break;
    }
  },
});
```

---

## Medium Priority (P2)

### 7. Toast Messages Not Internationalized

**File**: `useLessonActions.ts:21, 24, 36, 39, 49, 52`
**Severity**: Medium - Poor i18n support, hardcoded Russian text

**Problem**:
All toast messages are hardcoded in Russian. The rest of the codebase uses `next-intl` for i18n (see `NodeDetailsDrawer.tsx:215`). This creates inconsistency and breaks internationalization.

**Current Code**:

```typescript
toast.success('Урок добавлен в очередь на повторную генерацию');
toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
```

**Recommended Solution**:

```typescript
// Accept translations as parameter
interface UseLessonActionsOptions {
  courseId: string;
  onSuccess?: () => void;
  translations?: {
    retrySuccess: string;
    pauseSuccess: string;
    resumeSuccess: string;
    error: string;
  };
}

export function useLessonActions({ courseId, onSuccess, translations }: UseLessonActionsOptions) {
  const t = translations || {
    retrySuccess: 'Урок добавлен в очередь на повторную генерацию',
    pauseSuccess: 'Генерация приостановлена',
    resumeSuccess: 'Генерация возобновлена',
    error: 'Ошибка',
  };

  const retryLesson = useCallback(
    async (lessonId: string) => {
      setIsLoading(true);
      try {
        await retryLessonGeneration(courseId, lessonId);
        toast.success(t.retrySuccess);
        onSuccess?.();
      } catch (error) {
        toast.error(`${t.error}: ${error instanceof Error ? error.message : 'Unknown'}`);
      } finally {
        setIsLoading(false);
      }
    },
    [courseId, onSuccess, t]
  );

  // Similar for pause/resume...
}

// Usage in ModuleDashboard:
const t = useTranslations('generation');

const { retryLesson, pause, resume } = useLessonActions({
  courseId,
  translations: {
    retrySuccess: t('actions.retryLessonSuccess'),
    pauseSuccess: t('actions.pauseSuccess'),
    resumeSuccess: t('actions.resumeSuccess'),
    error: t('actions.error'),
  },
});
```

**Alternative**: Use `useTranslations` directly in hook (requires 'use client' directive):

```typescript
'use client';

import { useTranslations } from 'next-intl';

export function useLessonActions({ courseId, onSuccess }: UseLessonActionsOptions) {
  const t = useTranslations('generation.actions');

  const retryLesson = useCallback(
    async (lessonId: string) => {
      // ...
      toast.success(t('retryLessonSuccess'));
      // ...
    },
    [courseId, onSuccess, t]
  );
}
```

---

### 8. Missing Loading State Granularity in ModuleDashboard

**File**: `ModuleDashboard.tsx:80-82, 138-146`
**Severity**: Medium - Poor UX, can't show per-action loading states

**Problem**:
Hook returns single `isLoading` boolean, but `ModuleDashboard` doesn't use it. This means:

- Action buttons don't show loading spinners
- User can click same button multiple times during operation
- No visual feedback that action is in progress

**Current Code**:

```typescript
// Hook returns isLoading but it's not destructured
const { retryLesson, pause, resume } = useLessonActions({
  courseId,
});

// Actions are called but no loading state passed to LessonMatrix
const handleLessonAction = async (
  lessonId: string,
  action: 'view' | 'retry' | 'pause' | 'play'
) => {
  switch (action) {
    case 'retry':
      await retryLesson(lessonId); // ❌ No loading indicator
      break;
    // ...
  }
};
```

**Recommended Solution**:

```typescript
// Destructure isLoading from hook
const { retryLesson, pause, resume, isLoading } = useLessonActions({
  courseId,
})

// Or better: use granular loading states (see Critical Issue #1)
const {
  retryLesson,
  pause,
  resume,
  isRetrying,
  isPausing,
  isResuming,
} = useLessonActions({
  courseId,
})

// Pass loading state to LessonMatrix
<LessonMatrix
  lessons={data.lessons}
  onLessonClick={handleLessonClick}
  onLessonAction={(lessonId, action) => void handleLessonAction(lessonId, action)}
  isRetrying={isRetrying}
  isPausing={isPausing}
  isResuming={isResuming}
/>

// LessonMatrix can then disable buttons and show spinners:
<Button disabled={isPausing || isResuming}>
  {isPausing ? <Loader2 className="animate-spin" /> : <Pause />}
</Button>
```

---

### 9. Inconsistent Error Message Format

**File**: `useLessonActions.ts:24, 39, 52`
**Severity**: Medium - Inconsistent UX, poor error visibility

**Problem**:
Error messages use inconsistent format:

```typescript
toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
```

This creates several issues:

1. Generic prefix "Ошибка:" adds no value (toast is already red = error)
2. Fallback to "Unknown" is too vague
3. `error.message` might be technical jargon (e.g., "fetch failed")
4. No context about which operation failed

**Example Bad UX**:

- User clicks multiple buttons
- Sees toast: "Ошибка: Network error"
- Doesn't know if it was retry, pause, or resume that failed

**Recommended Solution**:

```typescript
const retryLesson = useCallback(
  async (lessonId: string) => {
    setIsLoading(true);
    try {
      await retryLessonGeneration(courseId, lessonId);
      toast.success('Урок добавлен в очередь на повторную генерацию');
      onSuccess?.();
    } catch (error) {
      // More specific error message with context
      const errorMsg =
        error instanceof Error ? error.message : 'Не удалось добавить урок в очередь';

      toast.error(`Повторная генерация: ${errorMsg}`, {
        description: `Урок ${lessonId}`,
      });

      // Log for debugging
      logger.error('Lesson retry failed', {
        courseId,
        lessonId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  },
  [courseId, onSuccess]
);
```

---

## Low Priority (P3)

### 10. Missing JSDoc Documentation

**File**: `useLessonActions.ts:13-59`
**Severity**: Low - Reduced maintainability

**Problem**:
Hook and its functions lack JSDoc comments. Compare with `useRestartStage.ts` which has excellent documentation (lines 22-50).

**Recommended Solution**:

````typescript
/**
 * Custom hook for lesson-level actions in Module Dashboard
 *
 * Provides functions to:
 * - Retry failed lesson generation
 * - Pause course generation
 * - Resume paused generation
 *
 * All actions use server actions from `@/app/actions` and show toast feedback.
 *
 * @param options - Hook configuration
 * @param options.courseId - Course UUID identifier
 * @param options.onSuccess - Callback invoked after successful action
 *
 * @returns Object with action functions and loading state
 *
 * @example
 * ```tsx
 * const { retryLesson, pause, resume, isLoading } = useLessonActions({
 *   courseId: 'abc-123',
 *   onSuccess: () => refetch(),
 * })
 *
 * // Retry a failed lesson
 * await retryLesson('1.2')
 *
 * // Pause entire course generation
 * await pause()
 * ```
 */
export function useLessonActions({ courseId, onSuccess }: UseLessonActionsOptions) {
  // ...
}
````

---

### 11. No Analytics Tracking

**File**: `useLessonActions.ts` (entire file), `ModuleDashboard.tsx:147`
**Severity**: Low - Missing product insights

**Problem**:
No analytics events are fired for user actions. Valuable metrics are lost:

- How often users retry lessons?
- Which lessons are retried most frequently?
- How often is generation paused/resumed?
- What's the success rate of retry operations?

**Recommended Solution**:

```typescript
import { logger } from '@/lib/client-logger';

const retryLesson = useCallback(
  async (lessonId: string) => {
    // Track action start
    logger.info('Lesson retry initiated', {
      courseId,
      lessonId,
      timestamp: new Date().toISOString(),
    });

    setIsLoading(true);
    const startTime = Date.now();

    try {
      await retryLessonGeneration(courseId, lessonId);

      // Track success
      logger.info('Lesson retry succeeded', {
        courseId,
        lessonId,
        duration: Date.now() - startTime,
      });

      toast.success('Урок добавлен в очередь на повторную генерацию');
      onSuccess?.();
    } catch (error) {
      // Track failure
      logger.error('Lesson retry failed', {
        courseId,
        lessonId,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });

      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setIsLoading(false);
    }
  },
  [courseId, onSuccess]
);
```

**Alternative**: Use dedicated analytics service (e.g., PostHog, Mixpanel):

```typescript
import { analytics } from '@/lib/analytics';

const retryLesson = useCallback(
  async (lessonId: string) => {
    analytics.track('lesson_retry_started', {
      course_id: courseId,
      lesson_id: lessonId,
    });

    try {
      await retryLessonGeneration(courseId, lessonId);

      analytics.track('lesson_retry_succeeded', {
        course_id: courseId,
        lesson_id: lessonId,
      });

      // ...
    } catch (error) {
      analytics.track('lesson_retry_failed', {
        course_id: courseId,
        lesson_id: lessonId,
        error_message: error instanceof Error ? error.message : 'unknown',
      });

      // ...
    }
  },
  [courseId, onSuccess]
);
```

---

## Best Practices Validation (Context7)

### React Hooks Patterns

**✅ Correct**:

- Uses `useCallback` for all action functions to prevent unnecessary re-renders
- Includes dependencies in dependency arrays (`courseId`, `onSuccess`)
- Uses `'use client'` directive (required for hooks in Next.js App Router)

**⚠️ Needs Improvement**:

- Missing cleanup function for unmounted component (see Critical Issue #2)
- Race condition prevention not implemented (see Critical Issue #1)
- Could use `useRef` for synchronous checks (similar to `usePartialGeneration.ts:63-66`)

**Pattern Comparison with Codebase**:

Good example: `usePartialGeneration.ts` shows advanced patterns:

- Uses `useRef` for synchronous race condition checks (lines 64-66)
- Implements proper cleanup in `useEffect` (lines 175-180)
- Tracks operation state granularly (lines 54-57)

`useLessonActions` should adopt similar patterns for production quality.

---

## Architecture & Consistency

### ✅ Follows Codebase Patterns

1. **Server Actions Integration**: Correctly uses server actions from `@/app/actions` (matches pattern in other hooks)
2. **Toast Notifications**: Uses `sonner` toast library (consistent with codebase)
3. **Hook Structure**: Follows custom hook conventions (`use*` prefix, returns object)
4. **File Location**: Correctly placed in `hooks/` directory alongside similar hooks

### ⚠️ Deviates from Patterns

1. **Loading State Management**: Other hooks in codebase use more granular loading states:
   - `usePartialGeneration.ts`: Separate states for different operations + per-item tracking
   - `useRestartStage.ts`: Includes `error` and `lastResult` states
   - `useLessonActions.ts`: Only single `isLoading` boolean (too simple)

2. **Error Handling**: Other hooks return error state:

   ```typescript
   // useRestartStage.ts pattern
   return {
     restartStage,
     isRestarting,
     error, // ✅ Exposes error for parent handling
     lastResult, // ✅ Exposes last result
   };

   // useLessonActions.ts current
   return {
     retryLesson,
     pause,
     resume,
     isLoading, // ❌ Only loading state, no error exposure
   };
   ```

3. **Documentation**: Compare with `useRestartStage.ts` (lines 22-50) - much better JSDoc

---

## Integration Testing Recommendations

### Manual Testing Checklist

**Retry Lesson**:

- [ ] Click retry on error lesson → success toast appears
- [ ] Click retry on pending lesson → should be prevented (currently not)
- [ ] Click retry twice rapidly → only one request sent (currently NOT prevented)
- [ ] Click retry, then navigate away → no state update errors in console
- [ ] Retry multiple different lessons simultaneously → all tracked correctly

**Pause/Resume**:

- [ ] Click pause during active generation → success toast
- [ ] Click pause when already paused → graceful handling
- [ ] Click pause, then resume quickly → both complete correctly
- [ ] Pause, navigate away, come back → state is synced

**Error Scenarios**:

- [ ] Network offline → clear error message with retry option
- [ ] Invalid lesson ID → validation error, no API call
- [ ] Permission denied → helpful error message
- [ ] Server timeout → retry mechanism offered

### Unit Test Suggestions

```typescript
// Example test for race condition prevention
describe('useLessonActions', () => {
  it('should prevent duplicate retry requests for same lesson', async () => {
    const { result } = renderHook(() => useLessonActions({ courseId: 'test-course' }));

    // Trigger two rapid retries
    const promise1 = result.current.retryLesson('1.1');
    const promise2 = result.current.retryLesson('1.1');

    await Promise.all([promise1, promise2]);

    // Should only call retryLessonGeneration once
    expect(retryLessonGeneration).toHaveBeenCalledTimes(1);
  });

  it('should clean up on unmount', () => {
    const { unmount } = renderHook(() => useLessonActions({ courseId: 'test-course' }));

    // Start operation
    act(() => {
      result.current.retryLesson('1.1');
    });

    // Unmount before completion
    unmount();

    // Should not throw "Can't perform state update on unmounted component"
    // No assertion needed - test passes if no error thrown
  });
});
```

---

## Performance Considerations

### ✅ Good

1. **Memoized Callbacks**: All functions use `useCallback` → prevents child re-renders
2. **Minimal Dependencies**: Dependency arrays are small and stable
3. **No Heavy Computations**: No expensive operations in render path

### ⚠️ Could Improve

1. **Toast Position**: Every action shows toast. Multiple rapid actions = toast spam.
   - **Solution**: Debounce or queue toasts, or use single updating toast

2. **Callback Stability**: `onSuccess` callback is not memoized in parent components.
   - If parent passes inline function `() => refetch()`, hook functions re-create on every parent render
   - **Solution**: Parent should memoize: `const onSuccess = useCallback(() => refetch(), [refetch])`

---

## Recommendations Summary

### Must Fix (P0)

1. ✅ **Implement granular loading states** to prevent race conditions
2. ✅ **Add cleanup mechanism** with `useRef` and `useEffect` to prevent memory leaks

### Should Fix (P1)

3. ✅ **Add error categorization and recovery** for better UX
4. ✅ **Implement optimistic UI updates** for instant feedback
5. ✅ **Add input validation** to prevent invalid operations
6. ✅ **Enhance onSuccess callback** with operation context

### Nice to Have (P2)

7. ⚡ **Internationalize toast messages** using `next-intl`
8. ⚡ **Wire up loading state** to UI components
9. ⚡ **Standardize error messages** with context

### Optional (P3)

10. 📝 **Add JSDoc comments** matching `useRestartStage.ts` quality
11. 📊 **Add analytics tracking** for product insights

---

## Conclusion

The implementation is **functional but needs reliability improvements** before production use. The code demonstrates understanding of React hooks and server actions, but lacks defensive programming practices common in production code.

**Key Strengths**:

- ✅ Clean hook API and structure
- ✅ Proper use of `useCallback` for memoization
- ✅ Follows codebase conventions
- ✅ Type-safe implementation

**Key Weaknesses**:

- ❌ Race condition vulnerabilities (shared loading state)
- ❌ Missing cleanup (memory leak risk)
- ❌ Minimal error handling
- ❌ No optimistic updates (poor UX)

**Recommendation**: **Fix P0 and P1 issues before merging to master**. P2/P3 issues can be addressed in follow-up PRs.

---

## Files Reviewed

### New File

- ✅ `packages/web/components/generation-graph/hooks/useLessonActions.ts` (60 lines)

### Modified Files

- ✅ `packages/web/components/generation-graph/panels/module/ModuleDashboard.tsx` (lines 80-82, 129-148, 194)
- ✅ `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx` (context)

### Related Files (Reference)

- 📚 `packages/web/app/actions/lesson-actions.ts` (server actions)
- 📚 `packages/web/app/actions/admin-generation.ts` (server actions)
- 📚 `packages/web/components/generation-graph/hooks/useRestartStage.ts` (pattern reference)
- 📚 `packages/web/components/generation-graph/hooks/usePartialGeneration.ts` (pattern reference)

---

**Review Complete** ✅
**Next Steps**: Address P0/P1 issues, then re-review for merge approval.
