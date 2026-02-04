# Fix: RefinementChat Message Duplication + Data Not Refreshing

## Problem (from tester report, course UDE-9391, ai.megacampus.ru)

1. **Message duplication**: After sending a refinement message, the user's message appears twice in the chat
2. **No visible effect after apply**: "Изменения применены (11 полей обновлено)" appears, but Output tab shows old data

## Root Cause Analysis

### Bug 1: Message Duplication

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx:94-111`

Flow:

1. User sends message → `pendingMessages` gets user message (optimistic UI)
2. `useRefinement.refine()` adds BOTH user + assistant messages to `chatHistory` (useRefinement.ts:170-178)
3. `chatHistory` passed as `history` prop → `displayHistory = [...history, ...pendingMessages]` → **duplicate user message**
4. Clearing logic (line 101-106) checks: `lastHistoryMsg.role === 'user'`
5. But `lastHistoryMsg` is always `assistant` (added last) → condition is **always FALSE**
6. `pendingMessages` **never cleared**

### Bug 2: Data Not Refreshing

**File**: `packages/web/components/generation-graph/hooks/useRefinement.ts:85-89`

Event dispatched with wrong format:

```typescript
// CURRENT (broken):
detail: { courseId, proposalType: previousProposal.type }

// REQUIRED by isCourseDataUpdatedEvent():
detail: { courseId, updatedFields: string[], source: 'manual' | 'realtime' | 'polling' }
```

`GraphView.tsx:693` validates event with `isCourseDataUpdatedEvent()` → fails → `fetchCourseData` never called → Output tab never updates.

## Fix Plan

### Fix 1: `RefinementChat.tsx` — Clear pending messages by tracking history length

Replace the role-based clearing logic with length-tracking via `useRef`:

```diff
+ const prevHistoryLenRef = useRef(history.length)

- // Clear pending messages when history updates (message was processed)
- useEffect(() => {
-   if (history && history.length > 0 && pendingMessages.length > 0) {
-     const lastHistoryMsg = history[history.length - 1]
-     const lastPendingMsg = pendingMessages[pendingMessages.length - 1]
-     if (
-       lastHistoryMsg &&
-       lastPendingMsg &&
-       lastHistoryMsg.role === 'user' &&
-       lastPendingMsg.role === 'user'
-     ) {
-       setPendingMessages([])
-     }
-   }
- }, [history, pendingMessages])

+ // Clear pending messages when history grows (server confirmed messages)
+ useEffect(() => {
+   if (history.length > prevHistoryLenRef.current && pendingMessages.length > 0) {
+     setPendingMessages([])
+   }
+   prevHistoryLenRef.current = history.length
+ }, [history.length, pendingMessages.length])
```

### Fix 2: `useRefinement.ts` — Use proper event format

```diff
+ import { createCourseDataUpdatedEvent } from '@megacampus/shared-types'

  // In acceptProposal():
- window.dispatchEvent(
-   new CustomEvent('course-data-updated', {
-     detail: { courseId, proposalType: previousProposal.type },
-   })
- )

+ const updatedFields: string[] =
+   previousProposal.type === 'field_updates'
+     ? previousProposal.stageId === 'stage_4'
+       ? ['analysis_result']
+       : ['course_structure']
+     : previousProposal.type === 'lesson_patch'
+       ? ['course_structure']
+       : ['analysis_result', 'course_structure']
+
+ window.dispatchEvent(
+   createCourseDataUpdatedEvent({
+     courseId,
+     updatedFields,
+     source: 'manual',
+   })
+ )
```

Field mapping:

- `field_updates` + `stage_4` → `analysis_result` (DB column updated by applyProposal)
- `field_updates` + `stage_5` → `course_structure` (DB column updated by applyProposal)
- `lesson_patch` → `course_structure` (lesson content within course structure)
- `direct_action` → both fields (conservative, ensures refetch)

## Files to Modify

| File                                                                 | Change                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/web/components/generation-graph/panels/RefinementChat.tsx` | Replace lines 88, 94-111 with useRef + length-based clearing      |
| `packages/web/components/generation-graph/hooks/useRefinement.ts`    | Add import, replace lines 84-89 with createCourseDataUpdatedEvent |

## Files Referenced (no changes)

- `packages/shared-types/src/course-events.ts` — `createCourseDataUpdatedEvent`, `CourseDataUpdatedDetail`
- `packages/shared-types/src/chat-types.ts` — `Proposal` discriminated union with `stageId` on `FieldUpdatesProposal`
- `packages/web/components/generation-graph/GraphView.tsx` — event listener at line 688 with `isCourseDataUpdatedEvent` validation
- `packages/web/components/generation-monitoring/realtime-provider.tsx` — reference implementation of correct event dispatch

## Verification

1. `pnpm type-check` — both files must compile
2. `pnpm build` — build must succeed
3. Manual test on dev.ai.megacampus.ru:
   - Open course UDE-9391 → click Stage 4/5 node → open Refinement Chat
   - Send a refinement message → verify message appears **once** (not duplicated)
   - AI responds with proposal → click "Принять"
   - Verify: toast "Изменения применены", Output tab **refreshes** with new data
   - Verify: no duplicate messages after apply
