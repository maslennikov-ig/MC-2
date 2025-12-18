# tRPC API Routes: Stage 3 - Document Summarization

**Feature**: Stage 3 - Document Summarization
**Created**: 2025-10-28
**Router Path**: `server.trpc.routers.summarization`

## Overview

Stage 3 adds minimal tRPC endpoints for summarization status monitoring. Most functionality is internal (BullMQ worker-driven). Frontend primarily uses existing `update_course_progress` RPC for progress tracking.

**Key Principles**:
- **Minimal API surface**: Only expose what frontend/admin panel needs
- **Reuse existing auth**: JWT middleware from Stage 1
- **Read-only endpoints**: No manual trigger endpoints (BullMQ orchestrator controls workflow)
- **Organization isolation**: RLS policies enforce multi-tenancy

---

## Router: `summarization`

**Location**: `packages/course-gen-platform/src/server/trpc/routers/summarization.ts`

**Authentication**: ALL endpoints require JWT authentication (existing middleware)

---

### Endpoint: `getSummarizationStatus`

**Purpose**: Get summarization status for a course (for admin panel / debugging)

**Route**: `summarization.getSummarizationStatus`

**Method**: `query`

**Input**:

```typescript
{
  course_id: string; // UUID
}
```

**Output**:

```typescript
{
  course_id: string;
  organization_id: string;
  total_documents: number;
  completed_count: number;
  failed_count: number;
  in_progress_count: number;
  bypassed_count: number; // full_text strategy (no API call)
  progress_percentage: number; // (completed_count / total_documents) * 100
  current_status: CourseProgressStatus; // e.g., 'CREATING_SUMMARIES'
  files: Array<{
    file_id: string;
    original_filename: string;
    processing_method: string | null; // null = not yet processed
    quality_score: number | null;
    quality_check_passed: boolean | null;
    estimated_cost_usd: number | null;
    processing_timestamp: string | null;
    error_message: string | null; // if failed
  }>;
}
```

**Logic**:
1. Verify JWT: `organization_id` matches course owner
2. Query `file_catalog` WHERE `course_id = ?`
3. Count documents by status:
   - `completed_count`: `processing_method IS NOT NULL AND summary_metadata->>'quality_check_passed' = 'true'`
   - `failed_count`: Check `error_logs` for QUALITY_CHECK_FAILED or LLM errors
   - `in_progress_count`: BullMQ active jobs for course
   - `bypassed_count`: `processing_method = 'full_text'`
4. Return aggregated status + file details

**Access Control**:
- User MUST belong to same `organization_id` as course (JWT claim)
- SuperAdmin can access all organizations (override RLS)

**Example Request**:

```typescript
const status = await trpc.summarization.getSummarizationStatus.query({
  course_id: '550e8400-e29b-41d4-a716-446655440000'
});

console.log(status);
// {
//   course_id: '550e8400-e29b-41d4-a716-446655440000',
//   organization_id: 'abc123...',
//   total_documents: 25,
//   completed_count: 20,
//   failed_count: 2,
//   in_progress_count: 3,
//   bypassed_count: 5,
//   progress_percentage: 80.0,
//   current_status: 'CREATING_SUMMARIES',
//   files: [...]
// }
```

---

### Endpoint: `getDocumentSummary`

**Purpose**: Retrieve summary for a specific document (for preview/debugging)

**Route**: `summarization.getDocumentSummary`

**Method**: `query`

**Input**:

```typescript
{
  file_id: string; // UUID
}
```

**Output**:

```typescript
{
  file_id: string;
  original_filename: string;
  processed_content: string | null; // Summary text (or null if not yet processed)
  processing_method: string | null; // Strategy used
  summary_metadata: SummaryMetadata | null; // Full metadata object
  extracted_text_preview: string; // First 500 chars of original text
}
```

**Logic**:
1. Verify JWT: User belongs to same `organization_id` as file (RLS check)
2. Query `file_catalog` WHERE `file_id = ?`
3. Return summary + metadata

**Access Control**:
- RLS enforces `organization_id` match
- SuperAdmin can access all organizations

**Example Request**:

```typescript
const summary = await trpc.summarization.getDocumentSummary.query({
  file_id: '123e4567-e89b-12d3-a456-426614174000'
});

console.log(summary.processed_content?.substring(0, 200));
// "This document describes the implementation of a distributed..."
```

---

### Endpoint: `getCostAnalytics`

**Purpose**: Get cost analytics for summarization (admin panel, billing dashboard)

**Route**: `summarization.getCostAnalytics`

**Method**: `query`

**Input**:

```typescript
{
  organization_id?: string; // Optional: filter by org (SuperAdmin only)
  start_date?: string;      // ISO 8601 date (default: 30 days ago)
  end_date?: string;        // ISO 8601 date (default: now)
}
```

**Output**:

```typescript
{
  organization_id: string;
  period_start: string; // ISO 8601
  period_end: string;   // ISO 8601
  total_cost_usd: number;
  documents_summarized: number;
  avg_cost_per_document: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  cost_by_model: Array<{
    model: string;
    documents: number;
    total_cost_usd: number;
    avg_quality_score: number;
  }>;
  cost_by_strategy: Array<{
    strategy: string;
    documents: number;
    total_cost_usd: number;
    avg_quality_score: number;
  }>;
}
```

**Logic**:
1. Verify JWT: User is SuperAdmin OR requesting own `organization_id`
2. Query `file_catalog` WHERE `summary_metadata->>'processing_timestamp' BETWEEN ? AND ?`
3. Aggregate costs, token counts, quality scores
4. Group by model and strategy

**Access Control**:
- Regular users: Can only query own `organization_id` (from JWT claim)
- SuperAdmin: Can query any `organization_id` or omit for global analytics

**Example Request**:

```typescript
const analytics = await trpc.summarization.getCostAnalytics.query({
  start_date: '2025-10-01T00:00:00Z',
  end_date: '2025-10-31T23:59:59Z'
});

console.log(analytics);
// {
//   organization_id: 'abc123...',
//   period_start: '2025-10-01T00:00:00Z',
//   period_end: '2025-10-31T23:59:59Z',
//   total_cost_usd: 12.45,
//   documents_summarized: 150,
//   avg_cost_per_document: 0.083,
//   cost_by_model: [
//     { model: 'openai/gpt-oss-20b', documents: 120, total_cost_usd: 9.60, avg_quality_score: 0.81 },
//     { model: 'anthropic/claude-3.5-sonnet', documents: 30, total_cost_usd: 2.85, avg_quality_score: 0.85 }
//   ],
//   ...
// }
```

---

## Error Handling

**All endpoints follow existing tRPC error patterns from Stage 1:**

### Error Types

| Code | Status | When Thrown |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | JWT missing or invalid |
| `FORBIDDEN` | 403 | User not authorized for requested organization |
| `NOT_FOUND` | 404 | Course or file not found |
| `BAD_REQUEST` | 400 | Invalid input (UUID format, date range, etc.) |
| `INTERNAL_SERVER_ERROR` | 500 | Database error, unexpected failures |

**Example Error Response**:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this course"
  }
}
```

---

## Frontend Integration

### Progress Tracking Component (Existing, Minor Update)

**Location**: `packages/course-gen-platform/src/components/CourseProgress.tsx`

**Changes**:
- Update progress message parsing to handle "Создание резюме... (X/N)" format
- Extract X and N from message for progress bar calculation
- Display failed document count if > 0

**Example Usage**:

```typescript
// Existing RPC subscription (no changes to backend)
const { data: progress } = useSubscription(['courses', 'progress'], {
  course_id: currentCourseId
});

// Updated frontend parsing
if (progress.status === 'CREATING_SUMMARIES') {
  const match = progress.message.match(/\((\d+)\/(\d+)\)/);
  if (match) {
    const [_, completed, total] = match;
    const percentage = (parseInt(completed) / parseInt(total)) * 100;
    // Render progress bar with percentage
  }
}
```

---

## Admin Panel Integration (P3 Priority)

**Location**: `packages/course-gen-platform/src/app/admin/summarization/page.tsx`

**Features**:
1. **Cost Dashboard**:
   - Call `getCostAnalytics` for organization
   - Display cost by model, strategy, time period
   - Show cost projections for tier limits

2. **Document Status Table**:
   - Call `getSummarizationStatus` for courses
   - Display file-level details (quality scores, costs, errors)
   - Filter by status (completed, failed, in_progress)

3. **Failed Job Inspector**:
   - Show failed documents with error messages
   - Link to error_logs table for detailed traces
   - Provide retry action (triggers new BullMQ job)

---

## Schema Validation

**Input Validation** (using Zod, existing pattern):

```typescript
// File: packages/course-gen-platform/src/server/trpc/routers/summarization.ts

import { z } from 'zod';

const getSummarizationStatusInput = z.object({
  course_id: z.string().uuid()
});

const getDocumentSummaryInput = z.object({
  file_id: z.string().uuid()
});

const getCostAnalyticsInput = z.object({
  organization_id: z.string().uuid().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional()
});

export const summarizationRouter = router({
  getSummarizationStatus: protectedProcedure
    .input(getSummarizationStatusInput)
    .query(async ({ input, ctx }) => {
      // Implementation
    }),

  getDocumentSummary: protectedProcedure
    .input(getDocumentSummaryInput)
    .query(async ({ input, ctx }) => {
      // Implementation
    }),

  getCostAnalytics: protectedProcedure
    .input(getCostAnalyticsInput)
    .query(async ({ input, ctx }) => {
      // Implementation
    })
});
```

---

## Testing

### Contract Tests

**Location**: `tests/contract/summarization.test.ts`

**Test Cases**:
1. **getSummarizationStatus**:
   - ✅ Returns correct counts for course with mixed statuses
   - ✅ Throws FORBIDDEN for wrong organization
   - ✅ Throws NOT_FOUND for non-existent course
   - ✅ Handles courses with 0 documents

2. **getDocumentSummary**:
   - ✅ Returns summary for processed document
   - ✅ Returns null for unprocessed document
   - ✅ Throws FORBIDDEN for wrong organization
   - ✅ Includes metadata with correct schema

3. **getCostAnalytics**:
   - ✅ Aggregates costs correctly for date range
   - ✅ Filters by organization (regular user)
   - ✅ Allows SuperAdmin to query any org
   - ✅ Returns empty array for period with no data

### Integration Tests

**Location**: `tests/integration/stage3-api.test.ts`

**Test Cases**:
1. End-to-end workflow:
   - Upload document → Stage 2 extraction → Stage 3 summarization → Query status
2. Failed document handling:
   - Simulate quality check failure → Query status → Verify failed_count > 0
3. Cost tracking:
   - Process multiple documents → Query analytics → Verify cost calculations

---

## Rate Limiting (Future: P3)

**Not implemented in MVP** - rely on existing API gateway rate limits

**Future Enhancement**:
- Per-organization rate limits for cost analytics endpoint
- Throttle getSummarizationStatus to prevent dashboard spam
- Implement caching for expensive aggregation queries

---

## Dependencies

**Upstream**:
- ✅ Stage 1: tRPC router setup, JWT auth middleware, protectedProcedure
- ✅ Stage 1: `update_course_progress` RPC (existing, no changes)
- ✅ Stage 2: `file_catalog` table with `extracted_text`

**Downstream**:
- ⏳ Admin Panel (Stage 8): Cost dashboard, failed job inspector
- ⏳ Frontend: Progress tracking UI updates (minor changes to existing component)

---

## Migration Notes

**No database changes required** - all data stored in existing `file_catalog` table (extended by data-model.md migration)

**tRPC Router Registration**:

```typescript
// File: packages/course-gen-platform/src/server/trpc/routers/index.ts

import { summarizationRouter } from './summarization';

export const appRouter = router({
  // ... existing routers ...
  summarization: summarizationRouter, // Add this line
});
```

**TypeScript Client Regeneration**:

```bash
# Generate tRPC client types
pnpm --filter trpc-client-sdk build
```
