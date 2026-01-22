# Performance Optimization Plan: CPU/Memory Issues

**Issue**: High CPU and memory usage in browser on all pages, especially Workflow (course generation)

## Root Cause Analysis

### 1. Memory Leak: handleProgressUpdate in Realtime Subscription (CRITICAL)

**File**: `packages/web/app/[locale]/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx:747`

```typescript
// PROBLEM: handleProgressUpdate depends on state.status (line 574)
// Every status change recreates the callback → new subscription → memory leak
}, [courseId, supabase, handleProgressUpdate, startPolling, stopPolling])
```

### 2. Session Storage Writes on Every Change (HIGH)

**File**: `GenerationProgressContainerEnhanced.tsx:373-375`

Progress updates 10+ times/second → JSON.stringify + sessionStorage.setItem each time.

### 3. Multiple Independent Timers (MEDIUM)

**Files**:

- `StatsBar.tsx:24-29, 52-60`: 2 independent intervals (elapsed + remaining)
- `GenerationProgressContainerEnhanced.tsx:671, 812`: polling + confetti intervals

Combined: 3-5+ simultaneous intervals per page.

### 4. Infinite Framer-motion Animations (MEDIUM)

**Files**:

- `floating-particles.tsx:36-47`: 8 motion.div with `repeat: Infinity`
- `courses-shader-background.tsx:168-170`: CSS `animate-pulse-slow/slower`

Run even when tab is hidden or scrolled out of viewport.

---

## Implementation Plan

### Phase 1: Critical Memory Leak Fix

**File**: `GenerationProgressContainerEnhanced.tsx`

**Changes**:

1. Add refs to store reactive values without causing re-subscriptions:

```typescript
// Add after line 197
const statusRef = useRef(state.status);
const isPausedRef = useRef(isPausedLocal);

// Add useEffect to sync refs (after line 267)
useEffect(() => {
  statusRef.current = state.status;
}, [state.status]);

useEffect(() => {
  isPausedRef.current = isPausedLocal;
}, [isPausedLocal]);
```

2. Update `handleProgressUpdate` to use refs:

- Line 478: Replace `isPausedLocal` → `isPausedRef.current`
- Line 574: Replace `state.status` → `statusRef.current`
- Remove `state.status` and `isPausedLocal` from useCallback dependencies (line 626-636)

3. Remove `handleProgressUpdate` from subscription dependencies (line 747):

```typescript
// BEFORE
}, [courseId, supabase, handleProgressUpdate, startPolling, stopPolling])

// AFTER - use ref for handleProgressUpdate too
const handleProgressUpdateRef = useRef(handleProgressUpdate)
useEffect(() => {
  handleProgressUpdateRef.current = handleProgressUpdate
}, [handleProgressUpdate])

// In subscription setup, use ref
handleProgressUpdateRef.current(payload.new)

// Dependencies become stable
}, [courseId, supabase, startPolling, stopPolling])
```

### Phase 2: Throttle Session Storage

**File**: `GenerationProgressContainerEnhanced.tsx`

**Changes** at lines 361-375:

```typescript
// Add throttle refs after line 197
const lastSaveTime = useRef(0);
const pendingSave = useRef<NodeJS.Timeout | null>(null);
const SAVE_THROTTLE_MS = 2000;

// Replace saveStateToStorage implementation
const saveStateToStorage = useCallback(() => {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (pendingSave.current) {
    clearTimeout(pendingSave.current);
  }

  const doSave = () => {
    const stateToSave = {
      ...state,
      stepRetryCount: Array.from(state.stepRetryCount.entries()),
    };
    sessionStorage.setItem(STORAGE_KEY_STATE(courseId), JSON.stringify(stateToSave));
    sessionStorage.setItem(STORAGE_KEY_TIMESTAMP(courseId), new Date().toISOString());
    lastSaveTime.current = Date.now();
  };

  if (now - lastSaveTime.current >= SAVE_THROTTLE_MS) {
    doSave();
  } else {
    pendingSave.current = setTimeout(doSave, SAVE_THROTTLE_MS);
  }
}, [state, courseId]);

// Add cleanup for pending save in unmount
useEffect(() => {
  return () => {
    if (pendingSave.current) clearTimeout(pendingSave.current);
  };
}, []);
```

### Phase 3: Consolidate StatsBar Timers

**File**: `packages/web/components/generation-graph/StatsBar.tsx`

**Changes**: Merge two intervals into one:

```typescript
// Replace lines 24-60 with single interval
const smoothedRemainingRef = useRef(smoothedRemaining);
const progressRef = useRef(progress);

useEffect(() => {
  smoothedRemainingRef.current = smoothedRemaining;
}, [smoothedRemaining]);

useEffect(() => {
  progressRef.current = progress;
}, [progress]);

useEffect(() => {
  const interval = setInterval(() => {
    // Update elapsed
    setElapsed(prev => prev + 1);

    // Update remaining if applicable
    const remaining = smoothedRemainingRef.current;
    const prog = progressRef.current;
    if (remaining !== null && remaining > 0 && prog < 100) {
      setSmoothedRemaining(prev => (prev !== null ? Math.max(0, prev - 1) : null));
    }
  }, 1000);

  return () => clearInterval(interval);
}, []);
```

### Phase 4: Create Visibility-Aware Hook

**New file**: `packages/web/lib/hooks/use-tab-visibility.ts`

```typescript
import { useState, useEffect } from 'react';

export function useTabVisibility() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handler = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return isVisible;
}
```

Export from `packages/web/lib/hooks/index.ts`.

### Phase 5: Pause Animations When Tab Hidden

**File**: `packages/web/components/layouts/floating-particles.tsx`

**Changes**:

```typescript
import { useTabVisibility } from '@/lib/hooks/use-tab-visibility'
import { useIntersectionObserver } from '@/lib/hooks/use-intersection-observer'

export default function FloatingParticles({ count = 8, className = "" }: FloatingParticlesProps) {
  const isTabVisible = useTabVisibility()
  const [containerRef, isInViewport] = useIntersectionObserver<HTMLDivElement>()

  const shouldAnimate = isTabVisible && isInViewport

  // ... existing particles array

  return (
    <div ref={containerRef} className={...}>
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          // ... existing props
          animate={shouldAnimate ? {
            y: [0, -100, 0],
            // ... rest of animation
          } : { y: 0, x: 0, opacity: particle.opacity, scale: 1 }}
          // ... transition
        />
      ))}
    </div>
  )
}
```

**File**: `packages/web/components/layouts/courses-shader-background.tsx`

**Changes** at lines 168-170:

```typescript
const isTabVisible = useTabVisibility()

// Replace animate-pulse classes with conditional
<div className={`absolute inset-0 z-10 bg-gradient-to-tr from-purple-900/30 via-transparent to-purple-600/20 ${
  isTabVisible && !prefersReducedMotion ? 'animate-pulse-slow' : ''
}`} />
```

---

## Files to Modify

| File                                      | Changes                                     |
| ----------------------------------------- | ------------------------------------------- |
| `GenerationProgressContainerEnhanced.tsx` | Refs for stable callbacks, throttle storage |
| `StatsBar.tsx`                            | Consolidate 2 intervals into 1              |
| `floating-particles.tsx`                  | Pause when tab hidden/out of viewport       |
| `courses-shader-background.tsx`           | Pause CSS animations when tab hidden        |
| `lib/hooks/use-tab-visibility.ts`         | **NEW** - Tab visibility hook               |
| `lib/hooks/index.ts`                      | Export new hook                             |

---

## Verification

### Memory Profiling

1. Chrome DevTools > Memory > Take heap snapshot before/after
2. Filter by "RealtimeChannel" - should be exactly 1 instance
3. Navigate away and back - no accumulation

### Timer Count

```javascript
// Paste in console to monitor
let count = 0;
const orig = window.setInterval;
window.setInterval = (...a) => {
  console.log(++count, 'intervals');
  return orig(...a);
};
```

Expected: 2-3 intervals max (was 5+)

### CPU Usage

1. DevTools > Performance > Record for 30s
2. Switch to another tab for 10s, return
3. CPU activity during hidden period should be minimal

### Animation Pause

1. DevTools > Rendering > Paint flashing ON
2. Switch tab, return
3. No continuous green flashing when tab was hidden

---

## Risk Assessment

All changes are low-risk:

- No API changes
- No database changes
- Backward compatible
- Can be deployed incrementally

## Estimated Effort

| Phase                         | Time     |
| ----------------------------- | -------- |
| Phase 1 (Memory leak)         | 30 min   |
| Phase 2 (Storage throttle)    | 15 min   |
| Phase 3 (Timer consolidation) | 15 min   |
| Phase 4 (New hook)            | 10 min   |
| Phase 5 (Animation pause)     | 20 min   |
| Testing & verification        | 30 min   |
| **Total**                     | ~2 hours |
