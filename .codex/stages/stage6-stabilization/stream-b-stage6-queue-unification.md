Base branch/commit:
- `origin/develop @ 1e2bfa8666af3f4e49bfaca93b0add4e3298cc56`

Worktree/branch:
- required dedicated clean worktree
- branch: `codex/stage6-queue-unification`

Required docs:
- Query Context7 for BullMQ first (`/taskforcesh/bullmq`)
- Focus on recommended producer/worker organization when multiple producers target the same queue
- Include the docs used in the artifact

Write scope:
- `packages/course-gen-platform/src/server/routers/lesson-content/procedures/partial-generate.ts`
- `packages/course-gen-platform/src/server/routers/lesson-content/procedures/generate-missing.ts`
- `packages/course-gen-platform/src/server/routers/lesson-content/procedures/retry-lesson.ts`
- `packages/course-gen-platform/src/server/routers/admin/generation-monitoring.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/**` only if a shared enqueue helper belongs there
- orchestrator compatibility code only if strictly needed
- related tests only

Problem:
- `partialGenerate()` enqueues directly to dedicated queue `stage6-lesson-content`
- `generateMissing()`, `retryLesson()`, and admin Stage 6 triggers still enqueue through `addJob(JobType.LESSON_CONTENT)`
- this split creates runtime drift and deployment risk

Goal:
- one canonical Stage 6 lesson enqueue path for all manual/remediation producers
- deterministic queue name, producer source, and execution context in logs/job metadata

Do:
1. Create one canonical helper to enqueue Stage 6 lesson jobs.
2. Make these producers use it:
   - `partialGenerate`
   - `generateMissing`
   - `retryLesson`
   - admin `triggerStage6ForLesson`
   - admin `regenerateLessonWithRefinement`
   - any other lesson-level Stage 6 producer you find in-scope
3. Make dedicated queue `stage6-lesson-content` the canonical backend.
4. Keep orchestrator `LESSON_CONTENT` path only as a bounded compatibility shim if needed, but remove it from normal producers.
5. Ensure job payload/logging records:
   - queue name
   - execution context
   - source producer
6. Add targeted tests proving all supported producers route through the same helper/backend.

Verification:
- targeted tests you add for enqueue helper + producer wiring
- existing relevant Stage 6 unit suites if touched
- `git diff --check`

Artifact:
- `.codex/agent-reports/2026-04-14/stage6-queue-unification.md`

Final reply:
- `TASK stream-b-stage6-queue-unification | STATUS returned|blocked | ARTIFACT <path>`
- include changed files, docs used, verification results, commit hash
