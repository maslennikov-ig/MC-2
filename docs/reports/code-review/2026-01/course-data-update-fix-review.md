# Code Review: Course Data Update Fix

**Date**: 2026-01-30
**Commit**: c6d2e939
**Files Reviewed**:
- `packages/web/components/generation-monitoring/realtime-provider.tsx`
- `packages/web/components/generation-graph/GraphView.tsx`

**Reviewer**: Claude Code (Automated Code Review)
**Context**: Fix for UI not updating after course data changes in Stage 4/5

---

## Summary

The changes implement a global event-based communication pattern to sync UI state when course data updates occur during generation. The implementation adds:

1. **Event Dispatcher** (realtime-provider): Dispatches `course-data-updated` custom event on any UPDATE to courses table
2. **Event Listener** (GraphView): Listens for event and refetches course data from Supabase

**Overall Assessment**: ✅ **APPROVED with recommendations**

The implementation is functionally correct and solves the immediate problem. However, there are several opportunities for improvement in architecture, performance, and edge case handling.

---

## Critical Issues

### None Found

No critical bugs that would cause crashes, data loss, or security vulnerabilities.

---

## High Priority Issues

### H1: Potential Race Condition with Multiple Event Dispatches

**Severity**: High
**File**: `realtime-provider.tsx:268-281`
**Issue**: Multiple rapid UPDATE events could trigger overlapping refetch operations

**Details**:
```typescript
// Current code dispatches event on EVERY UPDATE
window.dispatchEvent(
  new CustomEvent('course-data-updated', {
    detail: {
      courseId,
      updatedFields: Object.keys(payload.new || {}),
      source: 'realtime'
    },
  })
);
```

If the backend updates multiple fields in quick succession (e.g., `analysis_result` followed by `course_structure`), this will dispatch multiple events, each triggering a full Supabase query in GraphView.

**Impact**: Unnecessary network requests, potential UI flicker, race conditions where stale data overwrites fresh data

**Recommendation**:
```typescript
// Add debouncing to prevent rapid-fire events
const debouncedDispatch = useDebouncedCallback((courseId: string, fields: string[]) => {
  window.dispatchEvent(
    new CustomEvent('course-data-updated', {
      detail: { courseId, updatedFields: fields, source: 'realtime' },
    })
  );
}, 200); // 200ms debounce

// In the UPDATE handler:
debouncedDispatch(courseId, Object.keys(payload.new || {}));
```

**Alternative**: Check if relevant fields actually changed before dispatching:
```typescript
const relevantFields = ['analysis_result', 'course_structure', 'visual_style', 'style'];
const updatedFields = Object.keys(payload.new || {});
const hasRelevantChanges = updatedFields.some(f => relevantFields.includes(f));

if (hasRelevantChanges) {
  window.dispatchEvent(/* ... */);
}
```

---

### H2: No Deduplication of Refetch Requests

**Severity**: High
**File**: `GraphView.tsx:550-589`
**Issue**: Multiple events in quick succession trigger multiple concurrent Supabase queries

**Details**:
```typescript
const refetchCourseData = async (source?: string) => {
  // No check if refetch is already in progress
  const { data, error } = await supabase
    .from('courses')
    .select('course_structure, visual_style, style, analysis_result')
    .eq('id', courseId)
    .single()
  // ...
}
```

**Impact**:
- Network congestion
- Wasted API quota
- Race condition: if Request A completes after Request B, older data overwrites newer data

**Recommendation**:
```typescript
const refetchInProgressRef = useRef(false);

const refetchCourseData = async (source?: string) => {
  // Prevent concurrent refetches
  if (refetchInProgressRef.current) {
    logger.info('[GraphView] Refetch already in progress, skipping');
    return;
  }

  refetchInProgressRef.current = true;
  try {
    logger.info('[GraphView] Course data updated, refetching...', { source });
    const supabase = createClient();
    const { data, error } = await supabase
      .from('courses')
      .select('course_structure, visual_style, style, analysis_result')
      .eq('id', courseId)
      .single();

    // ... rest of logic
  } finally {
    refetchInProgressRef.current = false;
  }
};
```

---

### H3: Memory Leak Risk - Global Event Listener

**Severity**: High
**File**: `GraphView.tsx:600-602`
**Issue**: Event listener is attached to `window`, but cleanup only removes for this specific component instance

**Details**:
```typescript
window.addEventListener('course-data-updated', handleCourseDataUpdated)
return () => window.removeEventListener('course-data-updated', handleCourseDataUpdated)
```

**Scenario**: If multiple GraphView instances mount/unmount (e.g., user navigates between courses or HMR in dev), each creates a new closure over `courseId` and `initializeFromCourseStructure`. The cleanup only removes the current handler, but if event handlers accumulate due to timing issues, memory leaks occur.

**Impact**:
- Memory leak in long-running sessions
- Potential stale closure bugs (handler references old `courseId`)

**Recommendation**:
1. Use a more scoped event bus (e.g., React Context with event emitter)
2. Or use a unique event name per course:
```typescript
const eventName = `course-data-updated:${courseId}`;
window.addEventListener(eventName, handleCourseDataUpdated);
return () => window.removeEventListener(eventName, handleCourseDataUpdated);
```

3. Or add debug logging to verify cleanup:
```typescript
return () => {
  logger.devLog('[GraphView] Removing course-data-updated listener for', courseId);
  window.removeEventListener('course-data-updated', handleCourseDataUpdated);
};
```

---

## Medium Priority Issues

### M1: Missing Error Handling for Event Dispatch

**Severity**: Medium
**File**: `realtime-provider.tsx:272-280`
**Issue**: No try-catch around `window.dispatchEvent`

**Details**:
If any event listener throws an error, it could break the realtime provider's UPDATE handler, preventing subsequent status updates.

**Recommendation**:
```typescript
try {
  window.dispatchEvent(
    new CustomEvent('course-data-updated', {
      detail: {
        courseId,
        updatedFields: Object.keys(payload.new || {}),
        source: 'realtime'
      },
    })
  );
  log(' Dispatched course-data-updated event');
} catch (error) {
  console.error('[RealtimeProvider] Failed to dispatch event:', error);
  // Don't let listener errors break the provider
}
```

---

### M2: Inconsistent Data Fetching Logic

**Severity**: Medium
**File**: `GraphView.tsx:550-589`
**Issue**: Refetch logic duplicates existing fetch logic from line 476-545

**Details**:
Two separate useEffect blocks fetch overlapping data:
1. Lines 476-545: Initial fetch of `course_structure, visual_style, style, analysis_result` + completed lessons
2. Lines 550-589: Refetch of `course_structure, visual_style, style, analysis_result` (no completed lessons)

**Impact**:
- Code duplication (DRY violation)
- Inconsistency: initial fetch includes `completedLabels`, refetch doesn't
- If fetching logic needs to change, must update in multiple places

**Recommendation**:
Extract to shared function:
```typescript
const fetchCourseDataWithStructure = useCallback(async (
  includeCompletedLessons: boolean = false
) => {
  const supabase = createClient();

  const queries = [
    supabase
      .from('courses')
      .select('course_structure, visual_style, style, analysis_result')
      .eq('id', courseId)
      .single()
  ];

  if (includeCompletedLessons) {
    queries.push(
      supabase
        .from('generation_trace')
        .select('input_data')
        .eq('course_id', courseId)
        .eq('stage', 'stage_6')
        .eq('step_name', 'finish')
        .not('input_data->lessonLabel', 'is', null)
    );
  }

  const [courseResult, lessonsResult] = await Promise.all(queries);

  // ... handle results
  return { courseResult, lessonsResult };
}, [courseId]);

// Then reuse in both places:
// Initial fetch: await fetchCourseDataWithStructure(true);
// Refetch: await fetchCourseDataWithStructure(false);
```

---

### M3: No Handling of Concurrent Course Structure Updates

**Severity**: Medium
**File**: `GraphView.tsx:584-586`
**Issue**: `initializeFromCourseStructure` is called without checking if structure actually changed

**Details**:
```typescript
// Update course structure (Stage 5 output)
if (data?.course_structure) {
  initializeFromCourseStructure(data.course_structure as CourseStructure, [])
}
```

If course structure didn't change, this still triggers a full graph rebuild, causing unnecessary re-renders.

**Recommendation**:
```typescript
// Store previous structure in ref
const prevCourseStructure = useRef<CourseStructure | null>(null);

// In refetch:
if (data?.course_structure) {
  const newStructure = data.course_structure as CourseStructure;
  const hasChanged = JSON.stringify(prevCourseStructure.current) !== JSON.stringify(newStructure);

  if (hasChanged) {
    logger.info('[GraphView] Course structure changed, reinitializing');
    initializeFromCourseStructure(newStructure, []);
    prevCourseStructure.current = newStructure;
  } else {
    logger.devLog('[GraphView] Course structure unchanged, skipping reinit');
  }
}
```

**Note**: This adds overhead from JSON.stringify, so only apply if profiling shows unnecessary re-renders.

---

### M4: Missing Type Safety for Event Detail

**Severity**: Medium
**File**: `GraphView.tsx:591-598`
**Issue**: Event detail type is manually cast, not validated

**Details**:
```typescript
const handleCourseDataUpdated = (event: Event) => {
  const customEvent = event as CustomEvent<{ courseId: string; source?: string }>
  // No validation that detail actually has these fields
}
```

**Recommendation**:
Create shared type definition:
```typescript
// shared-types/src/events.ts
export interface CourseDataUpdatedDetail {
  courseId: string;
  updatedFields: string[];
  source: 'realtime' | 'manual';
}

// Then use type guard:
function isCourseDataUpdatedEvent(event: Event): event is CustomEvent<CourseDataUpdatedDetail> {
  if (!(event instanceof CustomEvent)) return false;
  const detail = event.detail;
  return (
    detail &&
    typeof detail === 'object' &&
    typeof detail.courseId === 'string' &&
    Array.isArray(detail.updatedFields) &&
    (detail.source === 'realtime' || detail.source === 'manual')
  );
}

// In handler:
const handleCourseDataUpdated = (event: Event) => {
  if (!isCourseDataUpdatedEvent(event)) {
    logger.warn('[GraphView] Invalid course-data-updated event', event);
    return;
  }

  if (event.detail.courseId !== courseId) return;
  void refetchCourseData(event.detail.source);
};
```

---

## Low Priority Issues

### L1: Unused `updatedFields` in Event Detail

**Severity**: Low
**File**: Both files
**Issue**: `updatedFields` is passed in event detail but never used in listener

**Details**:
```typescript
// Dispatcher sends:
updatedFields: Object.keys(payload.new || {})

// Listener ignores it:
void refetchCourseData(customEvent.detail?.source)
```

**Recommendation**:
Either remove it, or use it for selective refetching:
```typescript
// Option 1: Remove if truly unused
detail: { courseId, source: 'realtime' }

// Option 2: Use for optimization
const relevantFields = ['analysis_result', 'course_structure', 'visual_style', 'style'];
const shouldRefetch = customEvent.detail.updatedFields.some(f => relevantFields.includes(f));
if (!shouldRefetch) {
  logger.devLog('[GraphView] No relevant fields updated, skipping refetch');
  return;
}
```

---

### L2: Inconsistent Logging - `log()` vs `logger.info()`

**Severity**: Low
**File**: Both files
**Issue**: realtime-provider uses `log()`, GraphView uses `logger.info()`

**Details**:
- realtime-provider: `log(' Dispatched course-data-updated event');`
- GraphView: `logger.info('[GraphView] Course data updated, refetching...', { source });`

**Recommendation**:
Standardize on `logger` throughout for consistency:
```typescript
// Replace log() with logger.devLog() in realtime-provider
logger.devLog('[RealtimeProvider] Dispatched course-data-updated event');
```

---

### L3: Magic String Event Name

**Severity**: Low
**File**: Both files
**Issue**: Event name `'course-data-updated'` is hardcoded in multiple places

**Recommendation**:
Extract to constant:
```typescript
// shared-types/src/events.ts or constants file
export const COURSE_DATA_UPDATED_EVENT = 'course-data-updated';

// Then use:
window.addEventListener(COURSE_DATA_UPDATED_EVENT, handleCourseDataUpdated);
window.dispatchEvent(new CustomEvent(COURSE_DATA_UPDATED_EVENT, { ... }));
```

---

### L4: Missing Performance Metrics

**Severity**: Low
**File**: `GraphView.tsx:550-589`
**Issue**: No timing metrics for refetch operation

**Recommendation**:
```typescript
const refetchCourseData = async (source?: string) => {
  const startTime = performance.now();
  logger.info('[GraphView] Course data updated, refetching...', { source });

  // ... fetch logic ...

  const duration = performance.now() - startTime;
  logger.info('[GraphView] Course data refreshed successfully', {
    duration: `${duration.toFixed(2)}ms`,
    source
  });
};
```

---

## Edge Cases

### E1: Component Unmounts During Refetch

**Scenario**: User navigates away from course page while refetch is in progress

**Current Behavior**: Refetch completes and tries to call setState on unmounted component

**Impact**: React warning in console: "Can't perform a React state update on an unmounted component"

**Recommendation**:
```typescript
useEffect(() => {
  let isMounted = true;

  const refetchCourseData = async (source?: string) => {
    // ... fetch logic ...

    if (!isMounted) {
      logger.devLog('[GraphView] Component unmounted, skipping state update');
      return;
    }

    // Update state only if mounted
    if (data?.visual_style && isVisualStyle(data.visual_style)) {
      setVisualStyle(data.visual_style);
    }
    // ...
  };

  window.addEventListener('course-data-updated', handleCourseDataUpdated);
  return () => {
    isMounted = false;
    window.removeEventListener('course-data-updated', handleCourseDataUpdated);
  };
}, [courseId, initializeFromCourseStructure]);
```

---

### E2: Event Dispatched Before GraphView Mounts

**Scenario**: Realtime UPDATE arrives before GraphView component mounts (e.g., user on different tab)

**Current Behavior**: Event is lost, UI won't update until next UPDATE or page refresh

**Impact**: User sees stale data until they refresh page

**Recommendation**:
1. Store latest event in localStorage/sessionStorage and check on mount
2. Or use a message queue pattern (e.g., array in Context) that persists events
3. Or accept this limitation and document it (simplest option)

---

### E3: Multiple GraphView Instances for Same Course

**Scenario**: Unlikely but possible - user opens same course in multiple browser tabs/windows

**Current Behavior**: Each instance handles event independently, all trigger refetch

**Impact**: Doubled network traffic, potential confusion if tabs show different states mid-refetch

**Recommendation**:
Acceptable for now. If becomes issue, implement cross-tab synchronization with BroadcastChannel API.

---

### E4: Supabase Client Returns Cached Data

**Scenario**: Supabase client has stale data in cache, refetch returns old data

**Current Behavior**: UI updates with stale data

**Impact**: User still sees old analysis_result/course_structure after backend update

**Recommendation**:
Force cache bypass in refetch (if Supabase client supports it):
```typescript
const { data, error } = await supabase
  .from('courses')
  .select('course_structure, visual_style, style, analysis_result')
  .eq('id', courseId)
  .single()
  .withCache({ ttl: 0 }); // Force fresh fetch (syntax may vary)
```

Alternatively, add `timestamp` check:
```typescript
if (data?.updated_at && new Date(data.updated_at) < lastFetchTime) {
  logger.warn('[GraphView] Received stale data from Supabase, retrying');
  // Retry after delay
}
```

---

## Performance Considerations

### P1: Refetch on Every UPDATE (Even Irrelevant Fields)

**Issue**: Event dispatches on every courses UPDATE, even if only `generation_status` changed

**Impact**: Wasted queries for status-only updates (most common case)

**Current Cost**: ~1 extra query per status update (~10-50 status updates during generation)

**Optimization**:
Filter by relevant fields before dispatching (see H1 Alternative recommendation)

---

### P2: Full Data Refetch (4 Fields) When Only 1 May Have Changed

**Issue**: Always fetch `course_structure, visual_style, style, analysis_result` even if only one changed

**Impact**: Larger payload than necessary

**Optimization**:
Use `updatedFields` from event detail to fetch only changed fields:
```typescript
const fieldsToFetch = customEvent.detail.updatedFields
  .filter(f => ['course_structure', 'visual_style', 'style', 'analysis_result'].includes(f));

if (fieldsToFetch.length === 0) return; // No relevant fields

const selectQuery = fieldsToFetch.join(', ');
const { data, error } = await supabase
  .from('courses')
  .select(selectQuery)
  .eq('id', courseId)
  .single();
```

---

## Security Considerations

### S1: No Validation of courseId in Event Detail

**Severity**: Low (client-side only)
**Issue**: Malicious code could dispatch fake events with arbitrary courseId

**Impact**: Limited - would only cause extra Supabase queries (Row Level Security still applies)

**Recommendation**:
Validate courseId format:
```typescript
if (customEvent.detail?.courseId !== courseId) return;

// Additional validation:
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_REGEX.test(customEvent.detail.courseId)) {
  logger.warn('[GraphView] Invalid courseId in event', customEvent.detail.courseId);
  return;
}
```

---

### S2: XSS Risk in Event Detail (Low)

**Severity**: Very Low
**Issue**: `updatedFields` array comes from `Object.keys(payload.new)`, but payload is from trusted Supabase Realtime

**Impact**: None (Supabase Realtime is trusted source, not user input)

**Recommendation**: No action needed. Document that event source is trusted.

---

## Best Practices

### BP1: Event-Based Architecture for Cross-Component Communication

**Assessment**: ✅ Good approach for this use case

**Pros**:
- Decouples realtime-provider from GraphView
- Allows multiple listeners (future extensibility)
- Standard browser API

**Cons**:
- Global namespace pollution
- No TypeScript type safety for events
- Harder to trace data flow than props/Context

**Alternative Considered**:
- React Context + callback: More React-idiomatic but requires wrapping components
- Zustand store: Better for complex state management, overkill for this case

**Verdict**: Event-based approach is acceptable for this specific problem. If more cross-component events are added, consider migrating to typed event bus library.

---

### BP2: Mixing Realtime and Polling Patterns

**Assessment**: ⚠️ Be cautious of conflicts

**Observation**:
GraphView already has fallback polling (line 379: `useFallbackPolling`). Now adding event-based refetch.

**Risk**:
If realtime disconnects, fallback polling activates AND event-based refetch may still trigger (depending on implementation), causing duplicate queries.

**Recommendation**:
Ensure event listener respects `isConnected` state:
```typescript
const handleCourseDataUpdated = (event: Event) => {
  // Only handle realtime events if connected
  // (Fallback polling handles disconnected state)
  if (!isConnected) {
    logger.devLog('[GraphView] Ignoring event - using fallback polling');
    return;
  }

  // ... rest of handler
};
```

---

## Testing Recommendations

### Unit Tests

1. **realtime-provider.tsx**:
   ```typescript
   describe('GenerationRealtimeProvider', () => {
     it('dispatches course-data-updated event on UPDATE courses', () => {
       const eventSpy = jest.fn();
       window.addEventListener('course-data-updated', eventSpy);

       // Trigger UPDATE event via mock Supabase
       // Assert eventSpy called with correct detail
     });

     it('includes updatedFields in event detail', () => {
       // Test that Object.keys(payload.new) is included
     });
   });
   ```

2. **GraphView.tsx**:
   ```typescript
   describe('GraphView course-data-updated listener', () => {
     it('refetches course data when event received', async () => {
       const supabaseMock = createMockClient();
       // Dispatch event, assert supabase.from('courses').select() called
     });

     it('ignores events for different courseId', () => {
       // Dispatch event with different courseId, assert no fetch
     });

     it('handles concurrent events gracefully', async () => {
       // Dispatch 2 events rapidly, assert only 1 fetch (with debouncing)
     });
   });
   ```

### Integration Tests

1. **End-to-end flow**:
   - Simulate Stage 4 clarifying answer submission
   - Assert `analysis_result` updates in database
   - Assert realtime UPDATE event fires
   - Assert GraphView refetches and displays new data

2. **Race condition test**:
   - Trigger multiple rapid UPDATE events
   - Assert UI converges to correct final state (no flickering)

### Manual Testing Checklist

- [ ] Stage 4: Answer clarifying question → UI updates without refresh
- [ ] Stage 5: Apply proposal via chat → Graph shows new structure immediately
- [ ] Multiple rapid answers → No UI flickering or duplicate requests
- [ ] Navigate away during refetch → No console errors
- [ ] Open same course in 2 tabs → Both update correctly
- [ ] Disconnect realtime (block WebSocket) → Fallback polling works, event handling pauses
- [ ] HMR in dev mode → Event listeners clean up properly

---

## Action Items

### Must Fix (Before Merge)

1. **[H2]** Add refetch deduplication (prevent concurrent queries)
2. **[M1]** Add try-catch around event dispatch

### Should Fix (This Sprint)

3. **[H1]** Add debouncing or field filtering to event dispatch
4. **[H3]** Add cleanup logging to verify no memory leaks
5. **[E1]** Add unmount guard to prevent setState on unmounted component

### Consider for Future (Next Sprint)

6. **[M2]** Extract shared fetch logic to reduce duplication
7. **[M3]** Add course structure change detection to avoid unnecessary rebuilds
8. **[M4]** Create shared TypeScript types for event detail
9. **[BP2]** Ensure event listener respects isConnected state

### Nice to Have (Backlog)

10. **[L1]** Use or remove `updatedFields` from event detail
11. **[L2]** Standardize logging (replace `log()` with `logger`)
12. **[L3]** Extract event name to constant
13. **[L4]** Add performance metrics
14. **[P1]** Optimize to dispatch events only for relevant field changes
15. **[P2]** Fetch only changed fields instead of all 4

---

## Conclusion

The implementation successfully solves the reported issues (Stage 4/5 UI not updating) with a clean event-based architecture. The code is readable, well-commented, and follows existing patterns in the codebase.

**Key Strengths**:
- ✅ Solves the problem effectively
- ✅ Clean separation of concerns
- ✅ Good logging for debugging
- ✅ Minimal changes to existing code

**Key Risks**:
- ⚠️ Race conditions from multiple rapid events (H1, H2)
- ⚠️ Memory leak potential with global event listeners (H3)
- ⚠️ Code duplication (M2)

**Recommendation**: Merge after addressing **Must Fix** items (H2, M1). The other issues can be addressed incrementally.

**Estimated Effort**:
- Must Fix: 1-2 hours
- Should Fix: 2-3 hours
- Consider for Future: 3-4 hours
- Nice to Have: 2-3 hours

---

**Review Status**: ✅ APPROVED (with conditions)

**Next Steps**:
1. Address Must Fix items
2. Add unit tests for event dispatch/listen logic
3. Merge to develop
4. Monitor for race conditions in production
5. Schedule follow-up for Should Fix items

---

*Generated by Claude Code Reviewer*
*Review Date: 2026-01-30*
