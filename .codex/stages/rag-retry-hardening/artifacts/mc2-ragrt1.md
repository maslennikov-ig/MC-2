---
task_id: mc2-ragrt1
stage_id: rag-retry-hardening
repo: mc2
branch: codex/mc2-rag-retry-hardening
base_branch: develop
base_commit: 958eb33e
worktree: /home/me/.config/superpowers/worktrees/mc2/codex/mc2-rag-retry-hardening
status: returned
verification:
  - 'pnpm -F @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/rag/document-availability.test.ts tests/unit/shared/rag/required-rag-retry.test.ts tests/unit/server/routers/generation/build-document-summaries.test.ts tests/unit/server/routers/generation/lifecycle/generate.router.test.ts tests/unit/stages/stage5-generation/section-rag-retriever.test.ts tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts tests/unit/stages/stage6-lesson-content/services/job-processor.test.ts': passed
  - 'pnpm -F @megacampus/course-gen-platform exec tsc --noEmit': passed
  - 'pnpm -F @megacampus/course-gen-platform build': passed
  - 'git diff --check': passed
changed_files:
  - packages/course-gen-platform/src/shared/rag/document-availability.ts
  - packages/course-gen-platform/src/shared/rag/required-rag-retry.ts
  - packages/course-gen-platform/src/server/routers/generation/_shared/helpers.ts
  - packages/course-gen-platform/src/server/routers/generation/lifecycle/generate.router.ts
  - packages/course-gen-platform/src/stages/stage5-generation/handler.ts
  - packages/course-gen-platform/src/stages/stage5-generation/utils/section-rag-retriever.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts
  - packages/course-gen-platform/tests/unit/shared/rag/document-availability.test.ts
  - packages/course-gen-platform/tests/unit/shared/rag/required-rag-retry.test.ts
  - packages/course-gen-platform/tests/unit/server/routers/generation/build-document-summaries.test.ts
  - packages/course-gen-platform/tests/unit/server/routers/generation/lifecycle/generate.router.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/section-rag-retriever.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/services/job-processor.test.ts
---

# Summary

Implemented required-RAG hardening with a shared classification model plus bounded preflight retries.

- Added `RequiredRagUnavailableError` semantics that distinguish retryable transient failures (`metadata_lookup_failed`, Qdrant timeout/network/5xx/rate-limit) from deterministic preconditions (`no_indexed_documents`, missing collection, invalid config), and exposed explicit API mapping via `SERVICE_UNAVAILABLE` vs `PRECONDITION_FAILED`.
- Added `assertCourseRagReadyWithRetry()` with the approved bounded schedule (`1s`, `3s`) and wired it into Stage 5 preflight, Stage 5 runtime preflight, and Stage 6 runtime preflight only; query-level retrieval failures still warn and continue.
- Moved Stage 5 alert timing to final failure only for retryable required-RAG outages while preserving immediate failure for deterministic states and existing one-alert-per-course/run behavior.

# Retryability Decision Model

- No uploaded documents: skip RAG, no fail-fast, no alert.
- Deterministic non-retryable: no indexed documents, missing collection, invalid persistent Qdrant config.
- Transient retryable: metadata lookup unavailable, Qdrant timeout, network/connectivity failure, HTTP 5xx, rate limit/resource exhausted.
- API semantics:
  - retryable required-RAG outage => `SERVICE_UNAVAILABLE`
  - deterministic required-RAG precondition => `PRECONDITION_FAILED`

# Verification

- `pnpm -F @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/rag/document-availability.test.ts tests/unit/shared/rag/required-rag-retry.test.ts tests/unit/server/routers/generation/build-document-summaries.test.ts tests/unit/server/routers/generation/lifecycle/generate.router.test.ts tests/unit/stages/stage5-generation/section-rag-retriever.test.ts tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts tests/unit/stages/stage6-lesson-content/services/job-processor.test.ts`
  Result: passed (`7` files, `45` tests).
- `pnpm -F @megacampus/course-gen-platform exec tsc --noEmit`
  Result: passed.
- `pnpm -F @megacampus/course-gen-platform build`
  Result: passed.
- `git diff --check`
  Result: passed.

# Risks / Follow-ups / Explicit Defers

- Tests in this repo required local setup env (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) plus prebuilt workspace packages (`@megacampus/shared-types`, `@megacampus/shared-logger`, `@megacampus/shared-utils`) before the targeted Vitest command would run cleanly in the fresh worktree; that was an environment prerequisite, not a product-code blocker.
- Qdrant preflight timeout is bounded locally at `10s` for collection health checks only. Query-level search behavior remains intentionally fail-open/warn-only per the task scope.

# Post-review Corrections

Follow-up review found two blocking issues in the original `e6b1f060` implementation and they were corrected locally before merge readiness:

1. Generic `404 page not found` responses no longer masquerade as `qdrant_collection_missing`.
   - Explicit missing-collection responses still map to `qdrant_collection_missing`.
   - Generic 404/not-serving-endpoint responses now map to deterministic `qdrant_invalid_config`.
2. `qdrant_rate_limited` retries now respect Qdrant-provided retry delay when available.
   - `RequiredRagUnavailableError` carries `retryAfterMs`.
   - `assertCourseRagReadyWithRetry()` uses `max(baseDelay, retryAfterMs)` instead of always retrying at fixed `1s` / `3s`.

Corrective commit applied after review:

- `13c09815` — `fix(platform): refine required rag retry classification`

Post-review verification on the main workspace:

- `pnpm -F @megacampus/shared-types build`
  Result: passed.
- `SUPABASE_URL=http://localhost SUPABASE_SERVICE_KEY=test-key pnpm --dir packages/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/rag/document-availability.test.ts tests/unit/shared/rag/required-rag-retry.test.ts tests/unit/server/routers/generation/lifecycle/generate.router.test.ts tests/unit/stages/stage5-generation/section-rag-retriever.test.ts tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts`
  Result: passed (`5` files, `21` tests).
- `pnpm -F @megacampus/course-gen-platform exec tsc --noEmit`
  Result: passed.
- `pnpm -F @megacampus/course-gen-platform build`
  Result: passed.
- `git diff --check`
  Result: passed.
