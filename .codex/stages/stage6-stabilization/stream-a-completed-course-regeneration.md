Base branch/commit:
- `origin/develop @ 1e2bfa8666af3f4e49bfaca93b0add4e3298cc56`

Worktree/branch:
- required dedicated clean worktree
- branch: `codex/stage6-completed-course-regeneration`

Required docs:
- Query Context7 for BullMQ first (`/taskforcesh/bullmq`)
- Specifically confirm worker completion semantics when a processor returns an object vs throws
- Include the docs used in the artifact

Write scope:
- `packages/course-gen-platform/src/server/routers/lesson-content/helpers/index.ts`
- `packages/course-gen-platform/src/server/routers/lesson-content/procedures/partial-generate.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts`
- related tests only

Problem:
- `partialGenerate()` enqueues Stage 6 jobs for already completed/published courses
- `transitionToStage6Generating()` does not re-open `generation_status='completed'`
- `isStage6CourseActive()` accepts only `stage_6_generating`
- worker can therefore no-op while BullMQ still marks the job `completed`

Goal:
- make partial/manual regeneration work on completed courses
- ensure false-success jobs are surfaced as failed, not completed

Do:
1. Extend `transitionToStage6Generating()` so explicit Stage 6 remediation paths can transition a course from `completed` back into Stage 6 safely.
2. Introduce explicit Stage 6 execution context for lesson jobs:
   - `full_generation`
   - `partial_regeneration`
   - `manual_regeneration`
   - `generate_missing`
3. Thread execution context through job payload, logs, and job status writes.
4. Update `isStage6CourseActive()` and any precondition checks so legitimate remediation jobs on completed courses are allowed.
5. If a Stage 6 job exits on precondition without generating content, mark `job_status` as failed or otherwise non-successful. Do not let BullMQ “completed” become a false positive at the app layer.
6. Add regression coverage for:
   - completed course + `partialGenerate` produces a real Stage 6 run
   - no-op precondition path does not look successful
   - existing in-flight Stage 6 completion checks still work for normal generation

Verification:
- `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key npx -y pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/helpers/partial-generate-completion-check.test.ts`
- targeted new tests you add for completed-course regeneration path
- `git diff --check`

Artifact:
- `.codex/agent-reports/2026-04-14/stage6-completed-course-regeneration.md`

Final reply:
- `TASK stream-a-completed-course-regeneration | STATUS returned|blocked | ARTIFACT <path>`
- include changed files, docs used, verification results, commit hash
