# RAG Fail-Fast Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Stage 5 and Stage 6 fail immediately when a course has uploaded documents but Qdrant/RAG is unavailable, and send exactly one Telegram alert per course run.

**Architecture:** Introduce a shared RAG requirement/availability decision helper, enforce it at both Stage 5 job-input time and Stage 5/6 runtime retrieval, and route infra failures through the existing course notification system with per-run deduplication. Keep title-only / no-document courses working without Qdrant.

**Tech Stack:** TypeScript, Supabase, Qdrant JS REST client, BullMQ job orchestration, Vitest.

---

### Task 1: Add failing tests for the shared RAG availability policy

**Files:**

- Create: `packages/course-gen-platform/tests/unit/shared/rag/document-availability.test.ts`
- Modify: `packages/course-gen-platform/src/shared/rag/document-availability.ts`

**Step 1: Write the failing tests**

Cover these behaviors:

- course without uploaded documents -> result says RAG is optional
- course with uploaded documents and indexed vectors -> result says RAG is ready
- course with uploaded documents and failed availability/Qdrant check -> result says hard fail

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm -F @megacampus/course-gen-platform exec vitest run tests/unit/shared/rag/document-availability.test.ts
```

**Step 3: Implement the minimal shared policy**

Add a typed helper/result in `document-availability.ts` that distinguishes:

- no uploaded docs
- uploaded docs + ready
- uploaded docs + required but unavailable

**Step 4: Run the test to verify it passes**

Run the same command again and confirm green.

**Step 5: Commit**

```bash
git add packages/course-gen-platform/src/shared/rag/document-availability.ts packages/course-gen-platform/tests/unit/shared/rag/document-availability.test.ts
git commit -m "test: cover rag availability policy"
```

### Task 2: Fail Stage 5 job input instead of silently downgrading

**Files:**

- Modify: `packages/course-gen-platform/src/server/routers/generation/_shared/helpers.ts`
- Test: `packages/course-gen-platform/tests/unit/server/routers/generation/build-stage5-job-input.test.ts`

**Step 1: Write the failing test**

Add coverage for:

- uploaded documents + RAG unavailable -> `buildDocumentSummaries(...)` / Stage 5 input throws typed infra error
- no documents -> still returns `hasVectorizedDocs = false`

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm -F @megacampus/course-gen-platform exec vitest run tests/unit/server/routers/generation/build-stage5-job-input.test.ts
```

**Step 3: Implement the minimal code**

Use the shared helper from Task 1. Remove the “assuming no documents” downgrade when uploaded documents exist and RAG is required.

**Step 4: Run the test to verify it passes**

Run the same command again.

**Step 5: Commit**

```bash
git add packages/course-gen-platform/src/server/routers/generation/_shared/helpers.ts packages/course-gen-platform/tests/unit/server/routers/generation/build-stage5-job-input.test.ts
git commit -m "fix: fail stage5 input when rag is required but unavailable"
```

### Task 3: Fail Stage 5 and Stage 6 runtime retrieval when RAG is required

**Files:**

- Modify: `packages/course-gen-platform/src/stages/stage5-generation/utils/section-rag-retriever.ts`
- Modify: `packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts`
- Test: `packages/course-gen-platform/tests/unit/stages/stage5-generation/section-rag-retriever.test.ts`
- Test: `packages/course-gen-platform/tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts`

**Step 1: Write the failing tests**

Cover:

- no uploaded docs -> empty result remains valid
- uploaded docs + RAG unavailable -> throws typed infra error
- runtime query/Qdrant failure no longer returns empty result for required-RAG courses

**Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm -F @megacampus/course-gen-platform exec vitest run tests/unit/stages/stage5-generation/section-rag-retriever.test.ts tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts
```

**Step 3: Implement the minimal code**

Replace the silent skip path with the shared decision helper and throw the typed infra error when required.

**Step 4: Run the tests to verify they pass**

Run the same command again.

**Step 5: Commit**

```bash
git add packages/course-gen-platform/src/stages/stage5-generation/utils/section-rag-retriever.ts packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts packages/course-gen-platform/tests/unit/stages/stage5-generation/section-rag-retriever.test.ts packages/course-gen-platform/tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts
git commit -m "fix: fail rag retrieval when document-backed courses lose qdrant"
```

### Task 4: Send one Telegram alert per course run for required-RAG outage

**Files:**

- Modify: `packages/course-gen-platform/src/shared/notifications/course-notifications.ts`
- Modify: `packages/course-gen-platform/src/shared/telegram/send.ts`
- Modify: `packages/course-gen-platform/src/stages/stage5-generation/handler.ts` or nearest Stage 5/6 orchestration error boundary if needed
- Modify: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts` only if the existing boundary is the right place
- Test: `packages/course-gen-platform/tests/unit/shared/notifications/course-notifications.test.ts`

**Step 1: Write the failing test**

Cover:

- required-RAG infra error triggers course error notification
- repeated retries in the same run do not emit duplicate Telegram alerts

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm -F @megacampus/course-gen-platform exec vitest run tests/unit/shared/notifications/course-notifications.test.ts
```

**Step 3: Implement the minimal code**

Reuse existing notification plumbing. Add a clear RAG/Qdrant-specific error message and run-scoped dedupe.

**Step 4: Run the test to verify it passes**

Run the same command again.

**Step 5: Commit**

```bash
git add packages/course-gen-platform/src/shared/notifications/course-notifications.ts packages/course-gen-platform/src/shared/telegram/send.ts packages/course-gen-platform/src/stages/stage5-generation/handler.ts packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts packages/course-gen-platform/tests/unit/shared/notifications/course-notifications.test.ts
git commit -m "feat: alert telegram once when required rag is unavailable"
```

### Task 5: Run final verification for the touched scope

**Files:**

- Verify only; no intended file changes

**Step 1: Run targeted tests**

```bash
pnpm -F @megacampus/course-gen-platform exec vitest run \
  tests/unit/shared/rag/document-availability.test.ts \
  tests/unit/server/routers/generation/build-stage5-job-input.test.ts \
  tests/unit/stages/stage5-generation/section-rag-retriever.test.ts \
  tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts \
  tests/unit/shared/notifications/course-notifications.test.ts
```

**Step 2: Run type-check and build gates**

```bash
pnpm -F @megacampus/shared-types build
pnpm -F @megacampus/course-gen-platform exec tsc --noEmit
git diff --check
```

**Step 3: Commit final fixups if needed**

```bash
git add <exact touched files>
git commit -m "chore: finalize rag fail-fast verification"
```

**Step 4: Update Beads**

Close `mc2-ndy7w` only if all scope verification passes and no explicit defer remains.
