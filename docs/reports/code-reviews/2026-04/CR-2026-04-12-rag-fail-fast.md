# Code Review: RAG Fail-Fast Batch

**Date**: 2026-04-12  
**Scope**: review of commit `edc12525` (`fix(platform): fail fast when required rag is unavailable`)  
**Files**: 13 | **Changes**: +1176 / -68

**Follow-up status**: all findings below have been addressed locally in the post-review patch and are pending delivery together with the original fail-fast batch.

## Summary

|              | Critical | High | Medium | Low |
| ------------ | -------- | ---- | ------ | --- |
| Issues       | 0        | 2    | 1      | 0   |
| Improvements | —        | 0    | 1      | 0   |

**Verdict**: NEEDS WORK

## Issues

### High

#### 1. Stage 6 now ignores cached lesson RAG context when Qdrant is briefly down

- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts:49`
- **Problem**: `assertCourseRagReady(courseId)` now runs before the cache hit path. If Qdrant is temporarily unavailable, the function throws before checking `ragContextCache`, even when a valid cached lesson context already exists and no live vector call is needed.
- **Impact**: temporary Qdrant outages now break Stage 6 lessons that previously could have completed from cached RAG context. This widens the outage blast radius and defeats an existing resilience layer.
- **Fix**: check the lesson RAG cache before the required-RAG preflight, or explicitly skip the preflight when a cache hit can satisfy the request without touching Qdrant.

#### 2. Any single per-query search failure now aborts the whole retrieval path

- **File**: `packages/course-gen-platform/src/stages/stage5-generation/utils/section-rag-retriever.ts:244`
- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts:221`
- **Problem**: query-level failures inside the search loops now throw `RequiredRagUnavailableError` immediately. Previously these paths logged a warning and continued with the remaining queries, allowing partial context retrieval.
- **Impact**: a single timeout, malformed query, or intermittent search failure now escalates into a full pipeline stop, even when the vector store is reachable and other queries would have produced usable context. This is materially broader than the approved “fail fast only when Qdrant is unavailable” policy.
- **Fix**: keep fail-fast at the preflight / confirmed Qdrant-unavailable boundary. For individual query failures, restore `warn-and-continue`, then return partial context if other queries succeeded.

### Medium

#### 3. Metadata lookup failures are misclassified as “required RAG unavailable”

- **File**: `packages/course-gen-platform/src/shared/rag/document-availability.ts:102`
- **File**: `packages/course-gen-platform/src/shared/rag/document-availability.ts:181`
- **Problem**: any `file_catalog` read failure returns `required_unavailable`, and `assertCourseRagReady()` converts that into a non-retryable `RequiredRagUnavailableError`. The thrown message also says “Qdrant is unavailable”, even though the actual failure can be a Supabase/read-path problem.
- **Impact**: transient metadata lookup issues can permanently fail Stage 5/6 and trigger the wrong Telegram alert text. That violates the intended contract: fail fast on required RAG outage, not on every temporary inability to inspect metadata.
- **Fix**: separate “confirmed required RAG unavailable” from “could not determine metadata state”. Metadata read failures should stay retryable or at least produce a different error class/message than Qdrant outage.

## Improvements

### Medium

#### 1. Surface explicit preflight errors to the caller instead of generic 500s

- **File**: `packages/course-gen-platform/src/server/routers/generation/lifecycle/generate.router.ts:234`
- **Current**: `RequiredRagUnavailableError` thrown from `buildDocumentSummaries()` falls into the generic catch and returns `INTERNAL_SERVER_ERROR`.
- **Recommended**: translate confirmed required-RAG preflight failures into an explicit `TRPCError` such as `SERVICE_UNAVAILABLE` or `PRECONDITION_FAILED` with a user-meaningful message. This keeps the UI honest and reduces blind retries.

## Positive Patterns

- `resolveCourseRagAvailability()` centralizes the RAG readiness policy instead of spreading silent fallback decisions across multiple callers.
- The new tests cover the essential branch split between no-documents, ready, and required-RAG-unavailable scenarios.
- Stage 6 uses a compare-and-swap style course failure transition, which is the right shape for deduping Telegram alerts at the course level.

## Escalation

- None. The fixes stay inside Stage 5/6 retrieval, shared RAG availability, and router error translation.

## Validation

- Type Check: PASS (`pnpm -F @megacampus/course-gen-platform exec tsc --noEmit`)
- Build: PASS (`pnpm -F @megacampus/course-gen-platform build`)
