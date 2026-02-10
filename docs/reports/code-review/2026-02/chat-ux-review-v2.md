# Code Review: Chat UX Changes v2 (mc2-z38d)

**Date**: 2026-02-10
**Commits**: `a745089a`, `22dd7ef4`, `f16d1c1e`
**Scope**: RefinementChat, useRefinement, NodeDetailsDrawer
**Reviewer**: Claude Opus 4.6

---

## Summary

Three commits improving chat UX for course generation refinement:

1. **a745089a** - Remove toast notifications, keep proposal visible after accept, add Stage 6 per-lesson chat
2. **22dd7ef4** - Add Reject button to proposal box + post-accept guidance message
3. **f16d1c1e** - Address code review findings (3rd skeleton button, redundant check, generic message)

**Verdict**: High quality implementation. All critical issues from first review were fixed. Found 2 new bugs, 5 improvements recommended.

---

## Architecture Review

### Design Pattern: Confirm-then-Apply Flow ✅

The changes implement a clear **3-stage user workflow**:

1. **Propose**: AI suggests changes (blue box with collapsible details)
2. **Decide**: User accepts/refines/rejects
3. **Confirm**: Accepted proposal shown as read-only green box

This pattern prevents accidental changes and provides clear visual feedback. Good UX design.

### State Management ✅

The hook properly tracks multiple states:

```typescript
latestProposal; // Current pending proposal (blue box)
acceptedProposal; // Just-applied proposal (green box)
proposalError; // Error during apply
isApplying; // Loading state
```

State transitions are clean with proper optimistic updates and rollback on error.

### Per-Lesson Conversation Isolation ✅

Critical feature for Stage 6 (Glass Factory):

```typescript
// Reset conversation when switching between lesson nodes
useEffect(() => {
  clearConversation();
}, [selectedNodeId, clearConversation]);
```

This ensures each lesson has independent chat history. Without this, switching between lessons would show wrong conversation context. Well-designed isolation boundary.

---

## Bugs Found

### BUG-1: Race condition in `acceptProposal` - Missing abort check after async operation [P2]

**File**: `useRefinement.ts:74`

The `acceptProposal` function performs an async database write (`applyProposalAction`) but only checks `isMountedRef` AFTER the operation completes. If the component unmounts DURING the async call, the callback still executes, potentially causing:

1. Memory leak (state updates on unmounted component)
2. Double-apply if user rapidly clicks Accept then switches nodes
3. Stale state updates

```typescript
// Current code (line 74):
await applyProposalAction(courseId, conversationId, previousProposal);

// Only checks mount state AFTER async completes
if (!isMountedRef.current) return;
```

**Impact**: Low probability but high severity. If user accepts a proposal then immediately closes the drawer/switches nodes, the apply operation continues in background and may update stale state.

**Fix**: Wrap the async call in try-finally and check abort signal:

```typescript
const abortController = new AbortController();
try {
  await applyProposalAction(courseId, conversationId, previousProposal);

  // Check if unmounted during async operation
  if (!isMountedRef.current || abortController.signal.aborted) return;

  setAcceptedProposal(previousProposal);
  // ... rest of success path
} finally {
  abortController.abort(); // Mark as completed
}
```

**Alternative**: Add `isApplying` check at start of function to prevent double-invocation.

---

### BUG-2: Incomplete cleanup in `rejectProposal` - Should also clear `acceptedProposal` [P3]

**File**: `useRefinement.ts:139-151`

The `rejectProposal` function clears `latestProposal` but doesn't clear `acceptedProposal`. This creates an edge case:

**Scenario**:

1. User accepts a proposal → `acceptedProposal` set, green box shown
2. AI sends a new proposal → `latestProposal` set, blue box shown
3. User rejects new proposal → Only `latestProposal` cleared
4. **Bug**: Green box (accepted proposal) still visible alongside rejection message

This is confusing UX - rejection message implies starting fresh but old accepted proposal remains visible.

```typescript
const rejectProposal = useCallback(() => {
  if (!latestProposal) return;
  setLatestProposal(null);
  setProposalError(null);
  // BUG: Missing setAcceptedProposal(null)
  setChatHistory(/* ... */);
}, [latestProposal]);
```

**Fix**: Add `setAcceptedProposal(null)` to clear previous acceptance when rejecting new proposal.

---

## Security Review

### SEC-1: XSS Risk - Unescaped JSON rendering in proposal details [P2] ⚠️

**File**: `RefinementChat.tsx:420-426, 524-530`

The proposal detail boxes render `u.oldValue` and `u.newValue` as JSON strings without escaping:

```tsx
<pre className="...">{JSON.stringify(u.oldValue, null, 2).slice(0, 200)}</pre>
```

While `JSON.stringify` itself is safe, if the backend schema changes to allow raw strings (instead of objects), this could become an XSS vector. Additionally, the 200-char slice may cut in the middle of an escape sequence.

**Attack Vector**: If `u.oldValue` contains malicious HTML/JS and backend validation fails, it could render as executable code in a `<pre>` tag (though `<pre>` itself doesn't execute scripts, downstream CSS injection is possible).

**Risk Level**: Medium (requires backend validation failure + specific data shape).

**Fix**: Use a safer rendering approach:

```tsx
<pre className="...">
  {JSON.stringify(u.oldValue, null, 2).slice(0, 200).replace(/</g, '&lt;').replace(/>/g, '&gt;')}
</pre>
```

Or use DOMPurify if available.

---

### SEC-2: No CSRF token in `applyProposalAction` call [P4] ℹ️

**File**: `useRefinement.ts:74`

The `applyProposalAction` server action is called without explicit CSRF protection. This is **likely safe** in Next.js 14+ with Server Actions (they include automatic CSRF via SameSite cookies), but worth verifying:

**Check**: Does the project use `@vercel/next-csrf` or similar? If yes, ensure Server Actions are wrapped.

**Note**: This is pre-existing (not introduced by these commits), but worth documenting since the apply action modifies database state.

---

## Performance Review

### PERF-1: Unnecessary re-creation of `refine` callback on every `conversationId` change [P3]

**File**: `useRefinement.ts:246`

The `refine` function includes `conversationId` in its dependency array:

```typescript
const refine = useCallback(
  async (stageId, nodeId, userMessage, previousOutput, intent) => {
    const request: ChatRequest = {
      conversationId, // Uses current conversationId
      // ...
    };
    await sendChatMessage(request);
  },
  [courseId, conversationId] // Recreates on every conversationId change
);
```

**Issue**: `conversationId` is updated after the FIRST chat message (server returns new ID). This causes the callback to be recreated, which propagates to `NodeDetailsDrawer` and `RefinementChat`, triggering re-renders.

**Impact**: Low severity (React re-renders are cheap), but violates best practices for stable callbacks.

**Fix**: Remove `conversationId` from deps (it's captured via closure which is sufficient):

```typescript
const refine = useCallback(
  async (stageId, nodeId, userMessage, previousOutput, intent) => {
    const request: ChatRequest = {
      conversationId: conversationIdRef.current, // Use ref instead
      // ...
    };
  },
  [courseId] // Stable dependency
);
```

And add: `const conversationIdRef = useRef(conversationId)` with `useEffect` to keep it updated.

---

### PERF-2: Double-render on proposal accept due to state cascade [P4]

**File**: `useRefinement.ts:76-97`

When accepting a proposal, the function updates 3 pieces of state sequentially:

```typescript
setAcceptedProposal(previousProposal)   // Render 1
setChatHistory(prev => [...])           // Render 2
window.dispatchEvent(...)               // Render 3 (triggers parent)
```

Each `setState` triggers a re-render. This causes 3 sequential renders within ~16ms.

**Impact**: Negligible on modern devices, but visible on slower machines (slight UI stutter).

**Fix**: Batch state updates (React 18+ does this automatically in event handlers, but not in async callbacks):

```typescript
import { flushSync } from 'react-dom'

// Option 1: Single state object
setState({ acceptedProposal: prev, chatHistory: [...] })

// Option 2: Explicit batch (React 18 concurrent mode)
startTransition(() => {
  setAcceptedProposal(previousProposal)
  setChatHistory(prev => [...])
})
```

---

## UX/Accessibility Review

### UX-1: No keyboard shortcut for Reject button [P3]

**File**: `RefinementChat.tsx:484-492`

The proposal box has 3 buttons:

- **Accept** - Enter key (via form submit)
- **Refine** - Focuses textarea (mouse only)
- **Reject** - No keyboard shortcut

**Issue**: Keyboard-only users must tab to Reject button. This is 5 tab stops from textarea (mode toggle x2 + quick actions x1 + Accept + Refine).

**Fix**: Add `Escape` key handler to reject proposal:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && latestProposal && !isApplying) {
      e.preventDefault();
      onRejectProposal?.();
    }
  };
  if (latestProposal) {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }
}, [latestProposal, isApplying, onRejectProposal]);
```

**Alternative**: Add `title` attribute to Reject button mentioning Escape key.

---

### UX-2: Accepted proposal box (green) has no dismiss action [P4]

**File**: `RefinementChat.tsx:498-546`

After accepting a proposal, the green confirmation box remains visible until the next proposal arrives. This takes up vertical space and may push chat input off-screen.

**Scenarios where this is annoying**:

1. User accepts a small change → Green box stays
2. User writes 5 more messages → Must scroll past green box each time
3. Green box only disappears when next proposal arrives (line 213)

**Fix**: Add a small X button to dismiss the green box:

```tsx
<div className="relative ...">
  <button
    onClick={() => setAcceptedProposal(null)}
    className="absolute right-2 top-2 text-green-600 hover:text-green-800"
    aria-label="Dismiss confirmation"
  >
    <X className="h-4 w-4" />
  </button>
  {/* ... rest of green box ... */}
</div>
```

---

### UX-3: No loading state while waiting for new proposal after rejection [P4]

**File**: `RefinementChat.tsx:139-151`

When user rejects a proposal, they immediately see the rejection message ("❌ Изменения отклонены. Напишите уточнение..."). If they then submit a new message, there's no visual indication that a NEW proposal is coming.

**Current flow**:

1. Reject proposal → Rejection message shown
2. Submit new message → Loading spinner in chat
3. AI responds → New proposal appears

**Issue**: User may not realize a new proposal is coming (they just rejected one). The loading skeleton only shows for `isProcessing` (line 379) which is fine, but there's no explicit "Waiting for new proposal..." indicator.

**Fix**: Add a small text hint when `isProcessing && !latestProposal`:

```tsx
{
  isProcessing && !latestProposal && (
    <div className="text-xs text-muted-foreground animate-pulse">
      Генерируется новое предложение...
    </div>
  );
}
```

---

## Code Quality Review

### QUALITY-1: Inconsistent conditional rendering pattern for `acceptedProposal` [P3]

**File**: `RefinementChat.tsx:498`

The accepted proposal box has a confusing conditional:

```tsx
{
  !latestProposal && acceptedProposal && <div className="...">...</div>;
}
```

**Why `!latestProposal`?**

Looking at the logic:

- `latestProposal` is cleared when accepted (line 70: `setLatestProposal(null)`)
- `acceptedProposal` is set (line 79: `setAcceptedProposal(previousProposal)`)
- New proposal clears accepted (line 213: `setAcceptedProposal(null)`)

**Issue**: The condition `!latestProposal` implies "only show green box when no blue box". But this is redundant because:

1. `acceptProposal` already clears `latestProposal` (line 70)
2. New proposals clear `acceptedProposal` (line 213)
3. Both can never be truthy simultaneously

**This suggests defensive programming** (which is good!) but makes the logic harder to reason about. A comment would help:

```tsx
{/* Show accepted proposal (green box) only when no new proposal pending (blue box) */}
{!latestProposal && acceptedProposal && (
```

**Alternative**: Simplify to just `{acceptedProposal && ...}` and ensure mutual exclusivity in state management.

---

### QUALITY-2: Magic number for skeleton button width [P4]

**File**: `RefinementChat.tsx:387-390`

Skeleton buttons use hardcoded widths:

```tsx
<div className="h-9 w-24 rounded bg-gray-300" />
```

Actual buttons have dynamic widths based on text content ("Принять" vs "Отклонить"). This causes a layout shift when skeleton → real buttons.

**Fix**: Use same width classes as real buttons or measure actual button widths and use those values.

---

## Testing Review

### TEST-1: Missing test coverage for new features [P2]

**Added features without tests**:

1. `rejectProposal` function
2. `acceptedProposal` state management
3. Per-lesson conversation isolation (clearConversation on node switch)
4. Stage 6 lesson chat rendering

**Risk**: These features involve complex state management (accept → reject → accept again). Without tests, regressions are likely during refactoring.

**Recommended tests**:

```typescript
// useRefinement.test.ts
describe('rejectProposal', () => {
  it('clears latestProposal and adds rejection message to history', () => {
    // Test setup with proposal
    // Call rejectProposal
    // Assert latestProposal is null
    // Assert chat history includes rejection message
  });

  it('clears acceptedProposal when rejecting new proposal', () => {
    // Accept first proposal → acceptedProposal set
    // Receive second proposal → latestProposal set
    // Reject second proposal
    // Assert acceptedProposal also cleared (BUG-2 check)
  });
});

describe('per-lesson isolation', () => {
  it('clears conversation when switching between lesson nodes', () => {
    // Mock useNodeSelection with selectedNodeId
    // Send message to lesson_1_1
    // Switch to lesson_1_2
    // Assert chatHistory is empty
  });
});
```

---

## Pre-Existing Issues

### PRE-1: `getUpdatedFieldsForProposal` incorrect for `lesson_patch` type [P3]

**File**: `useRefinement.ts:8-16`

```typescript
function getUpdatedFieldsForProposal(proposal: Proposal): string[] {
  switch (proposal.type) {
    case 'lesson_patch':
      return ['course_structure']; // BUG: Stage 6 patches update lesson_contents, not course_structure
  }
}
```

This function determines which GraphQL cache keys to invalidate after applying a proposal. For Stage 6 lesson patches, it returns `['course_structure']`, but Stage 6 actually modifies the `lesson_contents` table.

**Impact**: After accepting a lesson patch, the graph view may not refresh correctly because it's invalidating the wrong cache key.

**Fix**:

```typescript
case 'lesson_patch':
  // Stage 6 lesson patches update lesson_contents table, not course_structure
  return proposal.stageId === 'stage_6'
    ? ['lesson_contents']
    : ['course_structure']
```

**Note**: This is a pre-existing bug (introduced before these commits) but discovered during review.

---

## Summary by Priority

### Critical (Fix Before Merge)

- None (all critical issues from first review were fixed)

### High Priority (Fix Soon)

- **BUG-1**: Race condition in `acceptProposal` - missing abort check
- **SEC-1**: XSS risk in unescaped JSON rendering
- **TEST-1**: Missing test coverage for reject flow

### Medium Priority (Next Sprint)

- **BUG-2**: Incomplete cleanup in `rejectProposal`
- **PERF-1**: Unnecessary callback recreation on `conversationId` change
- **UX-1**: No keyboard shortcut for Reject button
- **QUALITY-1**: Inconsistent conditional rendering
- **PRE-1**: Wrong cache invalidation for lesson patches

### Low Priority (Nice to Have)

- **SEC-2**: Verify CSRF protection (documentation task)
- **PERF-2**: Batch state updates to reduce renders
- **UX-2**: Add dismiss action to green confirmation box
- **UX-3**: Loading hint for new proposal after rejection
- **QUALITY-2**: Magic number for skeleton widths

---

## Positive Observations ✅

1. **Clean state machine**: The proposal lifecycle (pending → accepted → cleared) is well-structured
2. **Proper error handling**: Optimistic updates with rollback on failure
3. **Accessibility**: Good ARIA labels, keyboard shortcuts for main actions
4. **Component isolation**: Per-lesson chat prevents cross-contamination
5. **Code organization**: Clear separation between hook (state) and component (UI)
6. **Responsive fixes**: Third commit addressed all findings from first review promptly

---

## Recommendations

### Immediate Actions

1. Fix BUG-1 (race condition) - add abort check in async callback
2. Sanitize JSON output (SEC-1) - add HTML escaping
3. Add unit tests for reject flow (TEST-1)

### Follow-Up Tasks

1. Create beads task for i18n extraction (hardcoded Russian strings) - already tracked as mc2-yu78
2. Refactor `getUpdatedFieldsForProposal` to handle Stage 6 correctly
3. Consider adding keyboard shortcuts guide (press `?` to show shortcuts)
4. Add E2E test for full accept/reject/refine flow

### Long-Term Improvements

1. Extract `ChatMessage` interface to shared types
2. Implement state batching for performance
3. Add telemetry to track which UX path users prefer (accept vs reject vs refine)

---

## Conclusion

The three commits successfully improve chat UX with a well-designed confirm-then-apply flow. The implementation is solid with good separation of concerns. The third commit demonstrates excellent responsiveness to code review feedback.

**Key Strengths**:

- Clear 3-button UX (Accept / Refine / Reject)
- Proper per-lesson isolation for Stage 6
- Good error handling and optimistic updates

**Key Weaknesses**:

- Missing test coverage for new features
- Minor race condition in async accept handler
- XSS risk in JSON rendering (low probability)

**Overall Grade**: **B+** (Good quality, few bugs, would benefit from tests)

**Recommendation**: Merge after addressing BUG-1 and SEC-1. Create follow-up tasks for testing and i18n.

---

**Review completed**: 2026-02-10
**Files reviewed**: 3
**Issues found**: 2 bugs, 2 security, 2 performance, 3 UX, 2 quality
**Pre-existing issues**: 1
**Test coverage**: 0% (new features untested)
