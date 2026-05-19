---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: review-improvements
stage_id: mc2-db696.9
repo: /home/me/code/mc2
branch: codex/career-playbook-jd-bridge
base_branch: origin/codex/career-playbook-generation-status
base_commit: 84eb6d1293eeb00bbbe9a30a69da5bef225f98e5
worktree: /home/me/code/mc2/.worktrees/career-playbook-jd-bridge
status: returned
review_role: improvement
agent_type: reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: improvement/UX/maintainability review of cross-module bridge
write_zone:
  - .codex/stages/mc2-db696.9/artifacts/review-improvements.md
success_criteria:
  - Improvement review report written
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
selected_skills:
  - code-review
  - requesting-code-review
  - frontend-aesthetics
selected_agents:
  - improvement/UX/maintainability reviewer
catalog_candidates:
  - none
parallel_group: review
depends_on_streams:
  - none
parallel_decision: local
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: read-only review artifact only
risk_level: high
verification:
  - orchestrator reported targeted backend/frontend tests, type-check, and lint passing before review fixes
changed_files:
  - .codex/stages/mc2-db696.9/artifacts/review-improvements.md
explicit_defers:
  - Stage 1/shared synthetic document helper deferred; direct trusted synthetic file_catalog pending path kept for MVP.
---

# Improvement Review: mc2-db696.9 Career Playbook JD Bridge

**Date**: 2026-05-19
**Role**: Improvement reviewer
**Scope**: Uncommitted changes on `codex/career-playbook-jd-bridge` vs `84eb6d1293eeb00bbbe9a30a69da5bef225f98e5`, including untracked implementation and tests.
**Verdict**: NEEDS WORK

## Summary

| Category | Critical | High | Medium | Low |
| --- | ---: | ---: | ---: | ---: |
| Must-fix issues | 0 | 1 | 1 | 0 |
| Optional improvements | - | 0 | 2 | 1 |

The main approach is sound: the backend owns course creation and generation start, the frontend stays thin, and the extracted `initiateCourseGeneration` keeps the existing public `generation.initiate` path nearly unchanged. The required tests cover the happy path and several failure states. The implementation still needs a stronger failure boundary around generation initiation and the bridge route should not bypass the generation rate limiter.

## Must-Fix Issues

### High: Generation-initiate failures leave created courses and source documents behind

- **Evidence**: [course-bridge.service.ts:439](../../../../packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:439) creates the course, [course-bridge.service.ts:478](../../../../packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:478) uploads synthetic documents, and [course-bridge.service.ts:501](../../../../packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:501) calls `initiateGeneration` outside the upload rollback block. The only rollback path is the upload `catch` at [course-bridge.service.ts:491](../../../../packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:491). `initiateCourseGeneration` can reject before creating jobs on worker readiness, concurrency, or course status checks at [initiate.service.ts:81](../../../../packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.service.ts:81) and [initiate.service.ts:83](../../../../packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.service.ts:83).
- **Impact**: If workers are not ready or concurrency is exceeded, the user gets an error but a draft course and source rows may already exist. Retrying from the library can create duplicate abandoned courses, and web research/upload work has already been spent.
- **Suggested fix**: Wrap the `initiateGeneration` call in its own `try/catch` and roll back the course on failures that occur before generation jobs are accepted. Add a targeted unit test where `initiateGeneration` throws `SERVICE_UNAVAILABLE` and assert `deleteCourse(course.id)` is called and the original error is surfaced. If physical synthetic files are not cascade-cleaned elsewhere, add file cleanup to the rollback dependency as well.
- **Expected value**: Makes the bridge behave like one user-visible operation: either the course is created and generation starts, or no abandoned course is left behind.
- **Tradeoff**: A rollback after generation has actually been accepted would be dangerous, so keep the rollback scoped to errors thrown by the initiation service before the FSM/outbox succeeds. With the current service, successful FSM initialization returns without later fatal throws.
- **Confidence**: High.

### Medium: Bridge mutation bypasses the generation initiation rate limiter

- **Evidence**: Public `generation.initiate` applies `createRateLimiter({ requests: 10, window: 60 })` at [initiate.router.ts:7](../../../../packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.router.ts:7). The new bridge route uses only `instructorProcedure` at [course-bridge.router.ts:7](../../../../packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.router.ts:7), then calls the extracted service directly. That skips the rate limiter and also runs course insert, document upload, and web research before any initiate-time rejection.
- **Impact**: Users can repeatedly trigger course creation, web research, synthetic uploads, and generation-initiation attempts through the new endpoint without the throttling applied to the equivalent generation path.
- **Suggested fix**: Add a bridge-specific `createRateLimiter` on `careerPlaybook.courseBridge.createCourseFromPlaybook`, likely at least as strict as `generation.initiate` and possibly stricter because it can run web research. Use a distinct `keyPrefix` if needed for observability.
- **Expected value**: Protects worker queues, Tavily/web research spend, and course storage from accidental double-clicks or scripted calls.
- **Tradeoff**: A user may need to wait after repeated failed attempts; the frontend already has a per-dialog loading guard, but server-side throttling is still needed.
- **Confidence**: High.

## Optional Improvements

### Medium: Reuse the Stage 1 upload/storage path or extract a shared synthetic-document helper

- **Evidence**: `uploadSyntheticDocument` manually creates the directory, writes the file, calculates hash, and inserts `file_catalog` at [course-bridge.service.ts:369](../../../../packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:369). The existing Stage 1 storage path handles quota reservation, path validation, deduplication, and rollback in `phase-2-storage.ts`, for example [phase-2-storage.ts:146](../../../../packages/course-gen-platform/src/stages/stage1-document-upload/phases/phase-2-storage.ts:146), [phase-2-storage.ts:169](../../../../packages/course-gen-platform/src/stages/stage1-document-upload/phases/phase-2-storage.ts:169), and [phase-2-storage.ts:248](../../../../packages/course-gen-platform/src/stages/stage1-document-upload/phases/phase-2-storage.ts:248).
- **Suggested improvement**: Either call the existing upload/storage service with generated markdown after the course exists, or extract a small shared helper for trusted server-generated markdown documents that deliberately documents which checks are bypassed.
- **Expected value**: Reduces drift from the normal file pipeline and makes future changes to `file_catalog` metadata, deduplication, or cleanup less likely to miss the bridge.
- **Tradeoff**: Direct insert is simpler for MVP and avoids adapting base64 upload plumbing for server-generated content. A shared helper is a smaller step than forcing the full upload router into this path.
- **Confidence**: Medium.

### Medium: Clean up physical synthetic files when DB insert or later rollback fails

- **Evidence**: `uploadSyntheticDocument` writes to disk at [course-bridge.service.ts:379](../../../../packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:379), then inserts `file_catalog` at [course-bridge.service.ts:381](../../../../packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:381). If the insert fails, it throws at [course-bridge.service.ts:402](../../../../packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:402) without unlinking the file. The service rollback deletes only the course at [course-bridge.service.ts:361](../../../../packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:361).
- **Suggested improvement**: Track written file paths and remove them on DB insert failure and on course rollback. If course deletion already cascades `file_catalog`, this still matters for local disk.
- **Expected value**: Prevents quiet storage leaks in partial-failure paths.
- **Tradeoff**: Adds a little cleanup plumbing; if Stage 1 storage is reused, this may come for free.
- **Confidence**: Medium.

### Low: Replace the disabled secondary action with non-action copy or remove it

- **Evidence**: The dialog renders a disabled button labelled "Add materials before creation" at [CreateCourseFromPlaybookDialog.tsx:83](../../../../packages/web/components/career-playbook/viewer/CreateCourseFromPlaybookDialog.tsx:83), while the accepted scope explicitly defers pre-course upload.
- **Suggested improvement**: Use the existing explanatory text only, or render a passive hint instead of a disabled command. The primary action can stay "Start without extra materials".
- **Expected value**: Avoids a false affordance and keeps the MVP UX clearer for keyboard and screen-reader users.
- **Tradeoff**: The disabled button hints at a future feature, but that is less useful than a clear current workflow.
- **Confidence**: High.

## Positive Patterns

- Extracting `initiateCourseGeneration` keeps the public `generation.initiate` router thin and preserves the existing generation decision logic.
- Frontend state is local and understandable: one dialog, one mutation call, a loading guard, and error display.
- Tests cover completed-only library affordance, mutation payload, navigation, web research fallback, source document creation, and upload rollback.

# Verification

- I did not rerun the full verification suite; the orchestrator reported targeted backend tests, targeted frontend tests, `pnpm type-check`, and `pnpm lint` passing.
- Review was read-only except for this report file.

# Risks / Follow-ups

- Must-fix before accepting: rollback course/source docs when generation initiation fails.
- Must-fix before accepting: add bridge-specific rate limiting.
- Optional practical improvements: consider a shared trusted synthetic-document helper if another generated-source path appears.
