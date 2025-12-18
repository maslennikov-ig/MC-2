# TODO Markers Tracking

**Generated**: 2025-11-21
**Source**: Dead Code Detection Report - Medium Priority Items
**Status**: Documented for Future Implementation

---

## Overview

This document tracks TODO markers found in production code. These items are documented
for future implementation rather than removed, as they represent planned functionality.

**Total TODO Markers**: 8
**Files Affected**: 6

---

## Category: SuperAdmin Cross-Org Analytics

### TODO-001: Cross-Org Analytics SuperAdmin Role Check

**File**: `packages/course-gen-platform/src/server/routers/summarization.ts:190`
**Context**: Organization-scoped analytics query
**Priority**: Medium
**Status**: Documented

```typescript
// TODO: Add SuperAdmin role check for cross-org analytics
const orgId = ctx.user.organizationId;
```

**Description**: Currently all analytics are scoped to the user's organization. A SuperAdmin
role check would enable cross-organization analytics viewing.

**Implementation Scope**:
- Add SuperAdmin role detection
- Allow input.organization_id override for SuperAdmin users
- Maintain security for non-SuperAdmin users

---

## Category: Graceful Shutdown Cleanup

### TODO-002: Graceful Shutdown Resource Cleanup

**File**: `packages/course-gen-platform/src/server/index.ts:403-407`
**Context**: Server graceful shutdown handler
**Priority**: Medium
**Status**: Documented

```typescript
// TODO: Add cleanup for:
// - Supabase client connections
// - Redis connections
// - BullMQ worker instances
// - Any other resources that need cleanup
```

**Description**: Server shutdown currently closes HTTP server but does not explicitly
clean up database connections, cache connections, or job queue workers.

**Implementation Scope**:
- Add Supabase connection pool cleanup
- Add Redis client disconnect
- Add BullMQ worker graceful stop
- Consider connection drain timeout

---

## Category: Job Handler Future Features

### TODO-003: Job Failure Notifications

**File**: `packages/course-gen-platform/src/orchestrator/handlers/error-handler.ts:199-203`
**Context**: Job failure handling
**Priority**: Low
**Status**: Documented

```typescript
// TODO (Future): Send failure notifications
// - Alert admins for critical jobs
// - Notify users for user-facing jobs
// - Update job status in database
// - Trigger cleanup if needed
```

**Description**: Currently job failures are logged but no proactive notifications are sent.

**Implementation Scope**:
- Integrate with notification service (email/Slack)
- Define critical job classification
- Add user notification for user-facing failures
- Database status update hooks

---

### TODO-004: Stalled Job Recovery

**File**: `packages/course-gen-platform/src/orchestrator/handlers/error-handler.ts:222-225`
**Context**: Job stalled event handling
**Priority**: Low
**Status**: Documented

```typescript
// TODO (Future): Implement stalled job recovery
// - Check if worker is still alive
// - Decide whether to retry or fail
// - Clean up any partial work
```

**Description**: Stalled jobs (worker crash/timeout) are logged but no recovery mechanism exists.

**Implementation Scope**:
- Worker health check integration
- Stalled job retry policy
- Partial work cleanup

---

### TODO-005: Job Timeout Handling

**File**: `packages/course-gen-platform/src/orchestrator/handlers/error-handler.ts:244-247`
**Context**: Job timeout event handling
**Priority**: Low
**Status**: Documented

```typescript
// TODO (Future): Implement timeout-specific handling
// - Cancel any ongoing work
// - Clean up resources
// - Update status to timeout instead of failure
```

**Description**: Timed out jobs are marked as failed. A specific timeout status would enable
better observability and retry logic.

**Implementation Scope**:
- Add TIMEOUT status to job state machine
- Implement work cancellation
- Resource cleanup on timeout

---

## Category: Language Detection

### TODO-006: Language Detection from Contextual Content

**File**: `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts:368`
**Context**: Language extraction for generation
**Priority**: Low
**Status**: Documented

```typescript
// TODO: Consider adding language detection from contextual_language content if needed
```

**Description**: Currently defaults to 'en' when no explicit language parameter is provided.
Could potentially detect language from the contextual content.

**Implementation Scope**:
- Evaluate necessity (frontend should always provide language)
- If needed, integrate language detection library
- Add confidence threshold for detection

---

## Category: Token-Aware Batching

### TODO-007: Token-Aware Embedding Batching

**File**: `packages/course-gen-platform/src/shared/embeddings/generate.ts:271`
**Context**: Embedding batch processing
**Priority**: High
**Status**: Documented

```typescript
// TEMPORARY FIX: Reduced batch size to avoid Jina API 8194 token limit
// When processing large documents with parent chunks (~1500 tokens each),
// a batch of 100 can easily exceed 8194 tokens total.
// TODO: Implement token-aware batching (see docs/Future/TOKEN-AWARE-BATCHING.md)
const BATCH_SIZE = 5;
```

**Description**: Current fixed batch size of 5 is a workaround for API token limits.
A token-aware batching strategy would be more efficient.

**Implementation Scope**:
- Track token count per chunk
- Dynamic batch sizing based on cumulative tokens
- Stay within 8194 token limit per batch
- See docs/Future/TOKEN-AWARE-BATCHING.md for design

---

## Category: Stage 4 Workflow STUB Implementation

### TODO-008: Stage 4 Analysis Workflow Implementation

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/utils/workflow-graph.ts:95-350`
**Context**: LangGraph workflow nodes for Stage 4 analysis
**Priority**: Medium
**Status**: Documented (STUB File)

**Note**: This entire file contains STUB implementations for the Stage 4 analysis workflow.
The following phases need full implementation:

1. **Phase 1 - Basic Classification** (line 120-133)
   - Course category detection
   - Contextual language generation
   - Key concepts extraction

2. **Phase 2 - Scope Analysis** (line 188-242) - **IMPLEMENTED**
   - This phase is actually implemented with real LLM calls

3. **Phase 3 - Deep Expert Analysis** (line 247-261)
   - Pedagogical strategy design
   - Research flag detection
   - Expansion areas identification

4. **Phase 4 - Document Synthesis** (line 290-304)
   - Scope instructions generation
   - Content strategy determination
   - Adaptive model selection

5. **Phase 5 - Final Assembly** (line 336-351)
   - Merge all phase outputs
   - Add target_language field
   - Calculate total metrics

**Related Console.logs**: This file also contains console.log statements for debugging
the STUB implementation. These should be replaced with logger when phases are implemented.

---

## Summary by Priority

| Priority | Count | Items |
|----------|-------|-------|
| High     | 1     | TODO-007 (Token-aware batching) |
| Medium   | 3     | TODO-001, TODO-002, TODO-008 |
| Low      | 4     | TODO-003, TODO-004, TODO-005, TODO-006 |

---

## Next Steps

1. Create GitHub issues for High priority items
2. Schedule Medium priority items in upcoming sprint
3. Keep Low priority items documented for future backlog grooming

---

*Generated by dead-code-remover agent*
