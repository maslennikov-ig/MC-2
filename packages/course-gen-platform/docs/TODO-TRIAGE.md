# TODO Comments Triage Report

**Date**: 2025-10-16
**Total TODOs Found**: 10
**Status**: Triaged and prioritized

---

## High Priority (Stage 0 Completion)

### 1. Server Cleanup Handlers
**File**: `src/server/index.ts:344`
**TODO**: Add cleanup for:
- Worker connections
- Queue connections
- Redis client
- Supabase connections

**Priority**: HIGH
**Severity**: Production reliability
**Effort**: 2 hours
**Recommendation**: Implement graceful shutdown handlers to prevent resource leaks
**Action**: Create GitHub issue

**Impact**:
- Without cleanup, server shutdown may leave dangling connections
- Could cause connection pool exhaustion in production
- Important for container orchestration (Docker/Kubernetes)

**Suggested Implementation**:
```typescript
process.on('SIGTERM', async () => {
  await worker.close();
  await queue.close();
  await redis.disconnect();
  // Supabase connections auto-close
  process.exit(0);
});
```

---

### 2. Stalled Job Recovery
**File**: `src/orchestrator/handlers/error-handler.ts:222`
**TODO**: Implement stalled job recovery
- Detect jobs stuck in 'active' state
- Auto-retry or move to failed queue

**Priority**: HIGH
**Severity**: Job reliability
**Effort**: 8 hours
**Recommendation**: Implement BullMQ stalled job detection and recovery
**Action**: Create GitHub issue

**Impact**:
- Jobs that crash without cleanup remain in 'active' state forever
- Blocks queue processing and wastes resources
- Critical for production reliability

**Suggested Implementation**:
```typescript
// In error-handler.ts
export async function recoverStalledJobs() {
  const stalledJobs = await queue.getStalledJobs();
  for (const job of stalledJobs) {
    if (job.attemptsMade < job.opts.attempts) {
      await job.retry();
    } else {
      await job.moveToFailed(new Error('Stalled job timeout'));
    }
  }
}
```

---

## Medium Priority (Future Enhancement)

### 3. Failure Notifications
**File**: `src/orchestrator/handlers/error-handler.ts:199`
**TODO**: Send failure notifications
- Email alerts for critical errors
- Webhook notifications for integrations

**Priority**: MEDIUM
**Severity**: Monitoring/UX
**Effort**: 4 hours
**Recommendation**: Defer to Stage 1+ (user notification system)
**Action**: Create GitHub issue for Stage 1

**Impact**:
- Users don't get notified when generation fails
- Requires email infrastructure (not in Stage 0 scope)
- Can be added incrementally

---

### 4. Timeout-Specific Handling
**File**: `src/orchestrator/handlers/error-handler.ts:244`
**TODO**: Implement timeout-specific handling
- Different retry logic for timeouts
- Exponential backoff for timeout retries

**Priority**: MEDIUM
**Severity**: Error handling
**Effort**: 3 hours
**Recommendation**: Implement if timeout errors become common
**Action**: Create GitHub issue

**Impact**:
- Generic error handling may not be optimal for timeouts
- Timeouts often indicate external service issues (better to retry)
- Can be implemented when needed based on production metrics

---

## Low Priority (Stage 1+ Deferred)

### 5-8. Stage 1 Placeholders (initialize.ts)
**File**: `src/orchestrator/handlers/initialize.ts:49,57,65,73`
**TODOs**:
- Line 49: Validate course configuration
- Line 57: Create course record in database
- Line 65: Initialize course generation state
- Line 73: Enqueue subsequent jobs

**Priority**: LOW (DEFERRED)
**Severity**: Feature scope
**Effort**: N/A (Stage 1 work)
**Recommendation**: Keep as placeholders, implement in Stage 1
**Action**: Document as Stage 1 requirements

**Impact**:
- These are intentional placeholders for Stage 1 development
- Stage 0 only validates infrastructure
- No action needed now

---

### 9. Worker Handler Registration
**File**: `src/orchestrator/worker.ts:46`
**TODO**: Register additional handlers
- Document processing handler
- Generation handler
- Post-processing handler

**Priority**: LOW (DEFERRED)
**Severity**: Feature scope
**Effort**: N/A (Stage 1 work)
**Recommendation**: Keep as placeholder, implement in Stage 1
**Action**: Document as Stage 1 requirements

**Impact**:
- Stage 0 only has INITIALIZE handler
- Additional handlers come in later stages
- No action needed now

---

### 10. Cache Detection (docling)
**File**: `src/shared/docling/client.ts:242`
**TODO**: Detect cache hits from response
- Parse Docling response headers
- Determine if result came from cache

**Priority**: LOW
**Severity**: Observability
**Effort**: 1 hour
**Recommendation**: Low priority, nice-to-have for debugging
**Action**: Create GitHub issue as enhancement

**Impact**:
- Currently hardcoded to `from_cache: false`
- Would help with debugging and monitoring
- Not critical for functionality

---

## Summary

### By Priority
- **HIGH**: 2 TODOs (10 hours effort)
- **MEDIUM**: 2 TODOs (7 hours effort)
- **LOW**: 6 TODOs (Stage 1 deferred or low-impact)

### Recommended Actions
1. **Immediate** (Stage 0 Completion):
   - Create GitHub issue for server cleanup handlers (#1)
   - Create GitHub issue for stalled job recovery (#2)

2. **Stage 1**:
   - Create GitHub issues for failure notifications (#3)
   - Create GitHub issues for timeout handling (#4)
   - Implement Stage 1 placeholders (#5-9)

3. **Backlog**:
   - Create GitHub issue for cache detection (#10)

### GitHub Issues to Create

**Issue #1: Implement Graceful Shutdown Handlers**
- Title: "Add cleanup for worker/queue/Redis connections on server shutdown"
- Labels: reliability, production, medium-priority
- Milestone: Stage 0 Completion
- Effort: 2 hours

**Issue #2: Implement Stalled Job Recovery**
- Title: "Detect and recover stalled BullMQ jobs"
- Labels: reliability, production, high-priority
- Milestone: Stage 0 Completion
- Effort: 8 hours

**Issue #3: Implement Failure Notifications**
- Title: "Send email/webhook notifications for job failures"
- Labels: feature, monitoring, medium-priority
- Milestone: Stage 1
- Effort: 4 hours

**Issue #4: Improve Timeout Error Handling**
- Title: "Implement retry logic specific to timeout errors"
- Labels: enhancement, error-handling, medium-priority
- Milestone: Future
- Effort: 3 hours

**Issue #5: Detect Docling Cache Hits**
- Title: "Parse Docling response to detect cache hits"
- Labels: enhancement, observability, low-priority
- Milestone: Backlog
- Effort: 1 hour

---

## Conclusion

**Total Effort for Critical TODOs**: 10 hours
**Action**: Create 5 GitHub issues (2 for Stage 0, 3 for future)
**Stage 1 Placeholders**: 6 TODOs (no action needed, intentional deferred work)

The high-priority TODOs (#1 and #2) are **production-critical** and should be addressed before Stage 0 completion. The remaining TODOs can be deferred to future stages or tracked as enhancement requests.
