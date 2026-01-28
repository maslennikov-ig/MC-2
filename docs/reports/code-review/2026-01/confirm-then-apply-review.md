# Code Review: Confirm-then-Apply Chat

**Review Date**: 2026-01-28
**Feature**: Confirm-then-Apply Chat for Stages 4, 5, 6
**Reviewer**: Claude Code
**Status**: ⚠️ PARTIAL - Implementation complete with recommendations

---

## Summary

The Confirm-then-Apply Chat implementation provides a conversational refinement interface for course content (Stages 4, 5, 6). The architecture is solid with clear separation of concerns, but there are several bugs, security considerations, and UX improvements that should be addressed.

**Overall Assessment**:

- ✅ Architecture: Well-structured with proper separation (types, backend, actions, hooks, UI)
- ✅ Type Safety: Strong TypeScript usage with Zod schemas
- ⚠️ Security: Authorization logic has gaps
- ⚠️ UX: Missing loading states and error recovery
- ⚠️ Performance: Potential memory leaks and unnecessary re-renders

**Key Strengths**:

- Discriminated union types for proposals (field_updates vs lesson_patch)
- Proper Zod validation at API boundaries
- Optimistic UI updates in chat
- Abort controller for canceling requests
- Good separation of concerns

**Critical Issues**: 3
**Major Issues**: 5
**Minor Issues**: 8

---

## Issues (Bugs)

### [P1] Critical: Race Condition in acceptProposal

**File**: `packages/web/components/generation-graph/hooks/useRefinement.ts:43-57`

**Issue**:

```typescript
const acceptProposal = useCallback(async () => {
  if (!latestProposal || !conversationId) return;

  setIsApplying(true);
  try {
    await applyProposalAction(courseId, conversationId, latestProposal);
    toast.success('Изменения применены');
    setLatestProposal(null);
    // TODO: Trigger data refetch via invalidation
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Ошибка применения изменений');
  } finally {
    setIsApplying(false);
  }
}, [courseId, conversationId, latestProposal]);
```

**Problem**: After applying a proposal, the UI clears `latestProposal` but doesn't refetch the updated data. This creates a race condition where:

1. User applies changes
2. Proposal UI disappears (optimistic)
3. Backend updates database
4. UI still shows OLD data because no refetch happened
5. User might re-submit the same refinement or get confused

**Impact**: Data inconsistency, confusing UX, potential duplicate operations

**Fix**:

```typescript
const acceptProposal = useCallback(async () => {
  if (!latestProposal || !conversationId) return;

  setIsApplying(true);
  try {
    await applyProposalAction(courseId, conversationId, latestProposal);
    toast.success('Изменения применены');
    setLatestProposal(null);

    // CRITICAL: Trigger data refetch
    // Option 1: Use React Query/TanStack invalidation
    queryClient.invalidateQueries(['course', courseId]);

    // Option 2: Emit custom event for graph to refetch
    window.dispatchEvent(
      new CustomEvent('course-data-updated', {
        detail: { courseId, proposalType: latestProposal.type },
      })
    );
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Ошибка применения изменений');
  } finally {
    setIsApplying(false);
  }
}, [courseId, conversationId, latestProposal]);
```

---

### [P1] Critical: Missing Authorization Check in applyProposal for Lesson Patches

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts:728-843`

**Issue**: The `lesson_patch` branch uses `verifyCourseAccess()` while the `field_updates` branch uses `assertCourseAccess()`. These have different authorization semantics.

```typescript
if (proposal.type === 'lesson_patch') {
  // Verify course access (using lesson-content helper)
  await verifyCourseAccess(courseId, ctx.user.id, ctx.user.organizationId, requestId);
  // ... rest of logic
}
```

**Problem**:

1. `verifyCourseAccess()` might not check org admin permissions (depends on implementation)
2. Inconsistent auth pattern between two branches of same endpoint
3. The comment says "using lesson-content helper" but this is in the chat router - tight coupling

**Impact**: Authorization bypass potential, inconsistent behavior for org admins

**Fix**:

```typescript
if (proposal.type === 'lesson_patch') {
  const { lessonId, patchedContent, sectionId } = proposal;

  // Use consistent authorization (same as field_updates branch)
  // This ensures org admins, superadmins can also apply lesson patches
  const { data: course, error: lessonCourseError } = await supabase
    .from('courses')
    .select('id, user_id, organization_id')
    .eq('id', courseId)
    .single();

  if (lessonCourseError || !course) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found',
    });
  }

  assertCourseAccess(buildAuthContext(ctx.user), course, 'apply lesson patch');

  // Continue with lesson patch logic...
}
```

---

### [P1] Critical: Unsafe structuredClone Usage

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts:646`

**Issue**:

```typescript
let updatedData: unknown = structuredClone(currentData);
```

**Problem**: `structuredClone()` can fail with:

- Circular references
- Functions in objects
- Symbols
- Non-cloneable objects (WeakMaps, etc.)

When it fails, it throws an uncaught exception that crashes the request.

**Impact**: Server crashes on certain data structures, denial of service

**Fix**:

```typescript
let updatedData: unknown;
try {
  updatedData = structuredClone(currentData);
} catch (cloneError) {
  logger.error({ requestId, courseId, error: cloneError }, 'Failed to clone data, using fallback');
  // Fallback: JSON parse/stringify (less robust but more compatible)
  try {
    updatedData = JSON.parse(JSON.stringify(currentData));
  } catch (jsonError) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Cannot process data structure',
    });
  }
}
```

---

### [P2] Major: Missing AbortSignal Propagation in Server Actions

**File**: `packages/web/app/actions/refinement.ts:119-147`

**Issue**: The `sendChatMessage()` server action doesn't accept or use an AbortSignal, even though the hook creates an AbortController.

```typescript
// Hook creates abort controller:
const controller = new AbortController();
abortControllerRef.current = controller;

// But server action doesn't accept signal:
const response = await sendChatMessage(request);
```

**Problem**: User can click "cancel" but the fetch request continues on the server, wasting resources and potentially returning stale results.

**Impact**: Resource waste, confusing UX (spinner stops but request continues)

**Fix**:

```typescript
// In refinement.ts
export async function sendChatMessage(
  request: ChatRequest,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal, // Pass signal to fetch
  });
  // ... rest
}

// In useRefinement.ts
const response = await sendChatMessage(request, controller.signal);
```

---

### [P2] Major: Memory Leak in useRefinement Hook

**File**: `packages/web/components/generation-graph/hooks/useRefinement.ts:59-154`

**Issue**: Multiple potential memory leaks:

1. **AbortController never cleared on error**:

```typescript
} catch (error) {
  // ... error handling
  throw error  // Re-throws, finally block might not run
} finally {
  if (abortControllerRef.current === controller) {
    setIsRefining(false)
    abortControllerRef.current = null  // Only if no throw
  }
}
```

2. **State updates after unmount**: If component unmounts while request is in flight, state updates still happen.

**Impact**: Memory leaks, React warnings in console, potential crashes

**Fix**:

```typescript
const refine = useCallback(
  async (...args): Promise<ChatResponse | undefined> => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    // Track if component is still mounted
    let isMounted = true

    setIsRefining(true)
    try {
      const request: ChatRequest = { /* ... */ }
      const response = await sendChatMessage(request, controller.signal)

      // Only update state if still mounted and not aborted
      if (!isMounted || controller.signal.aborted) return

      // ... state updates
      return response
    } catch (error) {
      if (!isMounted) return // Silent fail if unmounted
      if (error instanceof Error && error.name === 'AbortError') return

      toast.error('Chat Failed', { description: ... })
      throw error
    } finally {
      // Always cleanup
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      if (isMounted) {
        setIsRefining(false)
      }
    }

    // Cleanup function
    return () => {
      isMounted = false
    }
  },
  [courseId, conversationId]
)
```

---

### [P2] Major: Missing Validation in parseProposalFromLLMResponse

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts:137-215`

**Issue**: The parser extracts `newValue` without validating its type or structure:

```typescript
validatedUpdates.push({
  path,
  newValue: update.newValue, // No validation!
  description: typeof update.description === 'string' ? update.description : undefined,
  oldValue: update.oldValue,
});
```

**Problem**: LLM can return:

- `newValue: undefined` (crash when applying)
- `newValue: null` (might be valid, but not clear)
- `newValue: function() {}` (security risk)
- `newValue: <script>alert('xss')</script>` (XSS if rendered unsafely)

**Impact**: Server crashes, potential XSS, data corruption

**Fix**:

```typescript
// Validate newValue exists and is serializable
if (update.newValue === undefined) {
  logger.warn({ requestId, path }, 'Proposal parsing: newValue is undefined, skipping');
  continue;
}

// Validate newValue is JSON-serializable (no functions, symbols, etc.)
try {
  JSON.stringify(update.newValue);
} catch {
  logger.warn({ requestId, path }, 'Proposal parsing: newValue is not serializable, skipping');
  continue;
}

validatedUpdates.push({
  path,
  newValue: update.newValue,
  description: typeof update.description === 'string' ? update.description : undefined,
  oldValue: update.oldValue,
});
```

---

### [P2] Major: Potential XSS in Proposal Display

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx:262-288`

**Issue**: The proposal display renders `description` and `diffSummary` without sanitization:

```tsx
{
  u.description && <span className="ml-1 text-gray-600 dark:text-gray-400">— {u.description}</span>;
}
```

**Problem**: If LLM returns malicious content like:

```json
{
  "description": "<img src=x onerror='alert(document.cookie)'>"
}
```

React will escape it by default, BUT if any parent component uses `dangerouslySetInnerHTML`, this could be exploited.

**Impact**: Potential XSS if rendering context changes

**Fix**: Add explicit sanitization or ensure React's auto-escaping is relied upon:

```tsx
import DOMPurify from 'isomorphic-dompurify';

{
  u.description && (
    <span className="ml-1 text-gray-600 dark:text-gray-400">
      — {DOMPurify.sanitize(u.description)}
    </span>
  );
}
```

Or document clearly that these fields MUST be text-only and never rendered with dangerouslySetInnerHTML.

---

### [P2] Major: Missing Error Recovery in RefinementChat

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx:112-135`

**Issue**: When submission fails, the pending message stays in the UI:

```typescript
const handleSubmit = (e?: React.FormEvent) => {
  // ...
  setPendingMessages(prev => [
    ...prev,
    { role: 'user', content: message, timestamp: new Date().toISOString(), pending: true },
  ]);

  onRefine(message, selectedIntent);
  setMessage('');
};
```

If `onRefine` fails, the pending message remains forever (until cleared by a successful message).

**Impact**: Confusing UI, stuck "pending" messages

**Fix**:

```typescript
const handleSubmit = async (e?: React.FormEvent) => {
  e?.preventDefault();
  if (!message.trim() || isProcessing) return;

  if (!selectedIntent) {
    toast.warning(t('refinementChat.modes.selectModeRequired'));
    return;
  }

  const pendingMessage: ChatMessage = {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
    pending: true,
  };

  setPendingMessages(prev => [...prev, pendingMessage]);

  try {
    await onRefine(message, selectedIntent);
    setMessage('');
  } catch (error) {
    // Remove pending message on error
    setPendingMessages(prev => prev.filter(m => m !== pendingMessage));
    // Error toast is already shown by useRefinement hook
  }
};
```

---

### [P3] Minor: Inconsistent Error Messages

**File**: `packages/web/app/actions/refinement.ts:16-25`

**Issue**: Error messages are hardcoded in Russian, but the app supports multiple languages:

```typescript
const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your message and try again.',
  401: 'Session expired. Please refresh the page and sign in again.',
  // ...
};
```

**Impact**: Poor i18n, inconsistent UX for non-Russian users

**Fix**: Use translation keys:

```typescript
import { getTranslations } from 'next-intl/server';

export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const t = await getTranslations('errors.chat');

  const HTTP_ERROR_MESSAGES: Record<number, string> = {
    400: t('invalidRequest'),
    401: t('sessionExpired'),
    // ...
  };
  // ...
}
```

---

### [P3] Minor: Missing Timestamp Validation

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx:204-206`

**Issue**: Timestamps are rendered without validation:

```tsx
<span className="text-muted-foreground text-[10px]">
  {new Date(msg.timestamp).toLocaleTimeString()}
</span>
```

If `msg.timestamp` is invalid, this throws an error.

**Impact**: Component crash on malformed timestamps

**Fix**:

```tsx
<span className="text-muted-foreground text-[10px]">
  {new Date(msg.timestamp).toLocaleTimeString() || 'Invalid time'}
</span>
```

---

### [P3] Minor: Unused Parameter in refine Function

**File**: `packages/web/components/generation-graph/hooks/useRefinement.ts:59-67`

**Issue**:

```typescript
const refine = useCallback(
  async (
    stageId: string,
    nodeId: string | undefined,
    _attemptNumber: number,  // Prefixed with _ but never used
    userMessage: string,
    previousOutput: string,
    intent: 'refine' | 'regenerate' = 'refine'
  ): Promise<ChatResponse | undefined> => {
```

**Problem**: `_attemptNumber` is ignored. It might be needed for backend but isn't sent.

**Impact**: Potential future bug if attempt number tracking is important

**Fix**: Either use it or document why it's not needed:

```typescript
// Option 1: Remove if truly unused
const refine = useCallback(
  async (
    stageId: string,
    nodeId: string | undefined,
    // attemptNumber removed - not needed for chat context
    userMessage: string,
    previousOutput: string,
    intent: 'refine' | 'regenerate' = 'refine'
  ): Promise<ChatResponse | undefined> => {
    // ...
  },
  [courseId, conversationId]
);

// Option 2: Pass to backend if needed
const request: ChatRequest = {
  courseId,
  chatType: 'node',
  userMessage,
  conversationId,
  nodeContext: {
    stageId,
    nodeId,
    blockPath: undefined,
    attemptNumber: _attemptNumber, // Actually use it
  },
  previousOutput,
  intent,
};
```

---

### [P3] Minor: Magic Number in Toast

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx:248-249`

**Issue**:

```tsx
{t('refinementChat.modes.refine')} (~2K)
{t('refinementChat.modes.regenerate')} (~20K)
```

These token estimates are hardcoded and might become outdated.

**Impact**: Misleading user expectations

**Fix**: Make configurable or fetch from backend:

```tsx
// Option 1: Config
const TOKEN_ESTIMATES = {
  refine: '~2K',
  regenerate: '~20K',
} as const

// Option 2: Fetch from backend (better)
const { data: tokenEstimates } = useQuery({
  queryKey: ['chatTokenEstimates', courseId],
  queryFn: () => getChatTokenEstimates(courseId),
})

<ToggleGroupItem value="refine">
  <Wand2 className="mr-1 h-3 w-3" />
  {t('refinementChat.modes.refine')}
  {tokenEstimates?.refine.formatted || '~2K'}
</ToggleGroupItem>
```

---

### [P3] Minor: Missing Input Validation in Chat Router

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts:248-251`

**Issue**: While Zod validates the shape, there's no semantic validation:

```typescript
.input(chatRequestSchema)
.mutation(async ({ ctx, input }): Promise<ChatResponse> => {
  const { courseId, chatType, userMessage, conversationId, nodeContext, previousOutput } = input;
```

**Problem**: What if:

- `userMessage` is just whitespace?
- `previousOutput` is 10MB of JSON?
- `conversationId` exists but belongs to different course?

**Impact**: Resource waste, potential crashes, security issues

**Fix**: Add semantic validation:

```typescript
.mutation(async ({ ctx, input }): Promise<ChatResponse> => {
  const { courseId, chatType, userMessage, conversationId, nodeContext, previousOutput } = input;

  // Validate message is not just whitespace
  if (!userMessage.trim()) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Message cannot be empty',
    });
  }

  // Validate previousOutput size (prevent memory issues)
  if (previousOutput && previousOutput.length > 1_000_000) { // 1MB limit
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Previous output too large',
    });
  }

  // Validate conversationId belongs to this course if provided
  if (conversationId) {
    const { data: existingConv } = await supabaseAdmin
      .from('course_chat_messages')
      .select('course_id')
      .eq('conversation_id', conversationId)
      .limit(1)
      .single();

    if (existingConv && existingConv.course_id !== courseId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Conversation does not belong to this course',
      });
    }
  }

  // ... rest of logic
});
```

---

### [P3] Minor: Potential Double-Toast on Error

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx:290-307`

**Issue**: When user clicks "Accept" button and applyProposal fails, two toasts might show:

1. From `acceptProposal()` in useRefinement hook
2. Potentially from parent error boundary

**Impact**: Annoying double error messages

**Fix**: Ensure error handling is centralized:

```typescript
// In RefinementChat.tsx
const handleAcceptProposal = async () => {
  try {
    await onAcceptProposal?.();
    // Success toast already shown by hook
  } catch (error) {
    // Don't show another toast, hook already did it
    console.error('Failed to accept proposal:', error);
  }
};

// Use in onClick:
onClick = { handleAcceptProposal };
```

---

### [P3] Minor: Missing Cleanup in NodeDetailsDrawer

**File**: `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx:225-227`

**Issue**: The refinement hook is initialized but never cleaned up when drawer closes:

```typescript
const { refine, isRefining, chatHistory, latestProposal, isApplying, acceptProposal } =
  useRefinement(courseInfo.id);
```

**Problem**: Chat history persists across drawer open/close cycles, which might be desired OR might be a bug (not clear from requirements).

**Impact**: Confusing UX if history should clear on close

**Fix**: Clarify requirements and add cleanup if needed:

```typescript
// If history should clear on close:
const {
  refine,
  isRefining,
  chatHistory,
  latestProposal,
  isApplying,
  acceptProposal,
  clearConversation,
} = useRefinement(courseInfo.id);

useEffect(() => {
  // Clear conversation when drawer closes
  if (!selectedNodeId) {
    clearConversation();
  }
}, [selectedNodeId, clearConversation]);
```

---

## Improvements (Recommendations)

### [IMP-1] Add Loading Skeleton for Proposal Display

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx:262-317`

**Current**: Proposal appears suddenly after LLM response

**Recommendation**: Add loading state:

```tsx
{
  isProcessing && selectedIntent === 'refine' && (
    <div className="mt-4 animate-pulse rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="h-4 w-48 rounded bg-gray-200" />
      <div className="mt-2 space-y-2">
        <div className="h-3 w-full rounded bg-gray-200" />
        <div className="h-3 w-3/4 rounded bg-gray-200" />
      </div>
    </div>
  );
}

{
  latestProposal && (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      {/* ... existing proposal UI */}
    </div>
  );
}
```

**Benefit**: Better UX, reduces perceived latency

---

### [IMP-2] Add Optimistic Update for Proposal Application

**File**: `packages/web/components/generation-graph/hooks/useRefinement.ts:43-57`

**Current**: User waits for server response before seeing any feedback

**Recommendation**: Show optimistic success:

```typescript
const acceptProposal = useCallback(async () => {
  if (!latestProposal || !conversationId) return;

  setIsApplying(true);

  // Optimistic update
  const previousProposal = latestProposal;
  setLatestProposal(null); // Hide proposal immediately
  toast.success('Применяю изменения...', { id: 'applying' });

  try {
    await applyProposalAction(courseId, conversationId, latestProposal);
    toast.success('Изменения применены', { id: 'applying' });
    // Trigger refetch
    queryClient.invalidateQueries(['course', courseId]);
  } catch (error) {
    // Rollback on error
    setLatestProposal(previousProposal);
    toast.error(error instanceof Error ? error.message : 'Ошибка применения изменений', {
      id: 'applying',
    });
  } finally {
    setIsApplying(false);
  }
}, [courseId, conversationId, latestProposal]);
```

**Benefit**: Feels instant, better perceived performance

---

### [IMP-3] Add Retry Button for Failed Proposals

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx:262-317`

**Current**: If applying proposal fails, user must re-send message

**Recommendation**: Keep proposal and add retry button:

```tsx
{
  latestProposal && proposalError && (
    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="mb-2 text-sm text-red-700">Не удалось применить изменения: {proposalError}</p>
      <Button
        onClick={handleRetryProposal}
        variant="outline"
        size="sm"
        className="border-red-300 text-red-700 hover:bg-red-100"
      >
        <RefreshCcw className="mr-2 h-4 w-4" />
        Попробовать снова
      </Button>
    </div>
  );
}
```

**Benefit**: Better error recovery, less frustration

---

### [IMP-4] Add Proposal Preview Before Accepting

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx:262-317`

**Current**: User sees a summary but not the actual diff

**Recommendation**: Add expandable diff preview:

```tsx
{
  latestProposal && latestProposal.type === 'field_updates' && (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <h4 className="mb-2 font-medium text-blue-900">Предложенные изменения</h4>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            <ChevronDown className="mr-2 h-4 w-4" />
            Показать детали ({latestProposal.updates.length} изменений)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {latestProposal.updates.map((u, i) => (
            <div key={i} className="mt-2 rounded border border-blue-200 bg-white p-3">
              <code className="block text-xs text-blue-800">{u.path}</code>
              {u.oldValue !== undefined && (
                <pre className="mt-1 text-xs text-red-600 line-through">
                  {JSON.stringify(u.oldValue, null, 2)}
                </pre>
              )}
              <pre className="mt-1 text-xs text-green-600">
                {JSON.stringify(u.newValue, null, 2)}
              </pre>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* ... existing buttons */}
    </div>
  );
}
```

**Benefit**: Transparency, user confidence before accepting

---

### [IMP-5] Add Undo Button After Accepting Proposal

**File**: `packages/web/components/generation-graph/hooks/useRefinement.ts`

**Current**: No way to undo after accepting (except manual editing)

**Recommendation**: Track previous state and add undo:

```typescript
const [undoStack, setUndoStack] = useState<
  Array<{
    proposal: Proposal;
    timestamp: string;
  }>
>([]);

const acceptProposal = useCallback(async () => {
  if (!latestProposal || !conversationId) return;

  setIsApplying(true);
  try {
    await applyProposalAction(courseId, conversationId, latestProposal);

    // Add to undo stack
    setUndoStack(prev => [
      ...prev,
      {
        proposal: latestProposal,
        timestamp: new Date().toISOString(),
      },
    ]);

    toast.success('Изменения применены', {
      action: {
        label: 'Отменить',
        onClick: () => undoLastProposal(),
      },
    });

    setLatestProposal(null);
  } catch (error) {
    // ... error handling
  } finally {
    setIsApplying(false);
  }
}, [courseId, conversationId, latestProposal]);
```

**Benefit**: Safety net, experimentation without fear

---

### [IMP-6] Add Rate Limit Indicator in UI

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx`

**Current**: User hits rate limit and sees generic error

**Recommendation**: Show remaining quota:

```tsx
const { data: rateLimitStatus } = useQuery({
  queryKey: ['chatRateLimit', courseId],
  queryFn: async () => {
    // Fetch from backend: remaining requests, reset time
    return { remaining: 15, limit: 20, resetAt: '2026-01-28T15:30:00Z' };
  },
  refetchInterval: 10000, // Refresh every 10s
});

// In UI:
{
  rateLimitStatus && rateLimitStatus.remaining < 5 && (
    <div className="mb-2 text-xs text-amber-600">
      ⚠️ {rateLimitStatus.remaining} запросов осталось (сброс через{' '}
      {formatTimeUntil(rateLimitStatus.resetAt)})
    </div>
  );
}
```

**Benefit**: Prevents surprises, manages user expectations

---

### [IMP-7] Add Conversation Export

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx`

**Current**: Chat history is lost when page refreshes

**Recommendation**: Add export button:

```tsx
const exportConversation = () => {
  const markdown = chatHistory
    .map(msg => {
      const role = msg.role === 'user' ? '**Вы**' : '**AI**';
      const time = new Date(msg.timestamp).toLocaleString();
      return `${role} (${time}):\n\n${msg.content}\n\n---\n\n`;
    })
    .join('');

  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-${conversationId}-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

// In UI header:
<Button variant="ghost" size="sm" onClick={exportConversation}>
  <Download className="h-4 w-4" />
</Button>;
```

**Benefit**: Reference for later, documentation

---

### [IMP-8] Add Keyboard Shortcuts

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx`

**Current**: Only mouse interaction

**Recommendation**: Add keyboard shortcuts:

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl/Cmd + Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }

    // Escape to close/cancel
    if (e.key === 'Escape' && isProcessing) {
      cancel()
    }

    // Ctrl/Cmd + K to focus input
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      textareaRef.current?.focus()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [isProcessing, handleSubmit, cancel])

// Show hint in placeholder:
placeholder={t('refinementChat.placeholder') + ' (Ctrl+Enter для отправки)'}
```

**Benefit**: Power users, accessibility, efficiency

---

## Positive Findings

### ✅ Strong Type Safety

The implementation uses discriminated unions effectively:

```typescript
export const proposalSchema = z.discriminatedUnion('type', [
  fieldUpdatesProposalSchema,
  lessonPatchProposalSchema,
]);
```

This prevents type confusion and enables type-safe handling in both frontend and backend.

---

### ✅ Proper Abort Controller Usage

The hook correctly manages request cancellation:

```typescript
const controller = new AbortController();
abortControllerRef.current = controller;

// Cancel on component unmount
useEffect(() => {
  return () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };
}, []);
```

---

### ✅ Good Separation of Concerns

Clear separation between:

- **Types** (`chat-types.ts`) - shared contract
- **Backend** (`chat.router.ts`) - business logic
- **Server Actions** (`refinement.ts`) - API client
- **Hooks** (`useRefinement.ts`) - state management
- **UI** (`RefinementChat.tsx`) - presentation

This makes testing and maintenance easier.

---

### ✅ Optimistic UI Updates

The chat shows pending messages immediately:

```typescript
setPendingMessages(prev => [
  ...prev,
  { role: 'user', content: message, timestamp: new Date().toISOString(), pending: true },
]);
```

This provides good perceived performance.

---

### ✅ Comprehensive Error Handling

The backend has good error categorization:

```typescript
const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your message and try again.',
  401: 'Session expired. Please refresh the page and sign in again.',
  // ...
};
```

Each error code has a user-friendly message.

---

### ✅ Proper Validation Pipeline

Data flows through multiple validation layers:

1. Zod schema validation at API boundary
2. Path whitelist validation (`STAGE4_EDITABLE_FIELDS`, `STAGE5_EDITABLE_FIELDS`)
3. Field normalization for Stage 5 array paths
4. `applyFieldUpdate()` for safe mutations

This defense-in-depth approach prevents data corruption.

---

### ✅ Good Logging Practices

The backend logs key events with context:

```typescript
logger.info(
  { requestId, courseId, proposalType: proposal.type, updateCount: parsedProposal.updates.length },
  'Chat: Proposal generated'
);
```

This aids debugging and monitoring.

---

## Metrics

- **Files Reviewed**: 6
- **Lines of Code**: ~2,100
- **Issues Found**: 16
  - Critical (P1): 3
  - Major (P2): 5
  - Minor (P3): 8
- **Recommendations**: 8
- **Type Check**: ✅ PASSED (no errors)
- **Architecture Quality**: ⭐⭐⭐⭐☆ (4/5)

---

## Next Steps

### Critical Actions (Must Do)

1. **Fix race condition in acceptProposal** (P1) - Add data refetch after applying proposal
2. **Fix authorization inconsistency** (P1) - Use `assertCourseAccess()` for both proposal types
3. **Fix structuredClone crash** (P1) - Add try-catch with fallback

### Recommended Actions (Should Do)

4. **Propagate AbortSignal** (P2) - Pass signal to fetch calls
5. **Fix memory leaks** (P2) - Add mounted check in useRefinement
6. **Validate newValue** (P2) - Check LLM output is serializable
7. **Add error recovery** (P2) - Remove pending messages on error

### Future Improvements (Nice to Have)

8. **Add loading skeletons** (IMP-1)
9. **Add optimistic updates** (IMP-2)
10. **Add retry button** (IMP-3)
11. **Add diff preview** (IMP-4)
12. **Add undo functionality** (IMP-5)

---

## Conclusion

The Confirm-then-Apply Chat implementation is **architecturally sound** with good separation of concerns and strong type safety. However, there are **critical bugs** around data synchronization, authorization, and error handling that must be fixed before production use.

**Recommendation**: Address all P1 issues before merging to production. P2 issues should be fixed within the next sprint. P3 issues and improvements can be prioritized based on user feedback.

**Overall Risk Level**: ⚠️ MEDIUM - Core functionality works, but edge cases and error paths need hardening.

---

**Report Generated**: 2026-01-28
**Next Review**: After fixes implemented
**Contact**: Code Review Team
