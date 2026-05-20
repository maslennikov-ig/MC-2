---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: review-correctness
stage_id: mc2-db696.9
repo: /home/me/code/mc2
branch: codex/career-playbook-jd-bridge
base_branch: origin/codex/career-playbook-generation-status
base_commit: 84eb6d1293eeb00bbbe9a30a69da5bef225f98e5
worktree: /home/me/code/mc2/.worktrees/career-playbook-jd-bridge
status: returned
review_role: correctness
agent_type: reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: correctness/security review of cross-module API and generation flow
write_zone:
  - .codex/stages/mc2-db696.9/artifacts/review-correctness.md
success_criteria:
  - Must-fix focused correctness review report written
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
selected_skills:
  - code-review
  - requesting-code-review
selected_agents:
  - correctness/security reviewer
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
  - git diff --check: passed
  - scripts/orchestration/validate_artifact.py: passed after format update
changed_files:
  - .codex/stages/mc2-db696.9/artifacts/review-correctness.md
explicit_defers:
  - none
---

# Summary

Correctness Review: Career Playbook JD to Course Bridge

**Verdict**: NEEDS WORK

| Category | Count |
| --- | ---: |
| Must-fix | 2 |
| Optional | 2 |

Scope reviewed: backend tRPC bridge, generation initiation extraction, synthetic `file_catalog` source creation, frontend library/dialog wiring, and targeted unit tests. I reviewed uncommitted diffs plus untracked files. I did not modify implementation files.

# Must-Fix

## 1. Course/documents are left behind when generation initiation fails

- **Severity**: High
- **Evidence**: [course-bridge.service.ts:478](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:478) rolls back the course only while synthetic document upload is inside the `try`; [course-bridge.service.ts:501](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:501) calls `initiateGeneration` after that block with no rollback. `initiateCourseGeneration` can reject for worker readiness, concurrency, duplicate generation/FSM conflict, course access, or database errors, for example [initiate.service.ts:83](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.service.ts:83) and [initiate.service.ts:247](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.service.ts:247). The frontend then shows an error instead of navigating at [CreateCourseFromPlaybookDialog.tsx:48](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/web/components/career-playbook/viewer/CreateCourseFromPlaybookDialog.tsx:48), but the draft course and source docs have already been persisted.
- **Expected value**: A failed mutation should not silently create an orphan course with Career Playbook-derived source documents; retries should not create duplicate courses.
- **Suggested fix**: Include `initiateGeneration` in the rollback boundary, or introduce a transaction/outbox-aware bridge operation. At minimum:
  - keep `course.id` and uploaded `fileId`s;
  - on any `initiateGeneration` error, delete the course and any physical synthetic files that were written;
  - rethrow the original `TRPCError` when applicable;
  - add a unit test where `initiateGeneration` rejects and assert `deleteCourse(courseId)` is called and the mutation rejects.
- **Tradeoff**: Rolling back after upload adds cleanup complexity, especially for local files. Leaving the course in place would require returning a usable recovery URL and making the UI treat it as partially created, which is a larger product behavior change.
- **Confidence**: High.

## 2. Bridge ignores persisted Career Playbook web research and re-runs external research

- **Severity**: Medium
- **Evidence**: The Career Playbook worker persists completed web research into `career_playbooks.web_research` at [career-playbook-handler.ts:160](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts:160). The bridge does not read that field when `includeWebResearch` is true; it always calls `runWebResearch` again at [course-bridge.service.ts:455](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:455). If that second lookup fails or is not configured, the catch builds empty research at [course-bridge.service.ts:459](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:459), and `renderCourseBridgeSourceDocuments` omits the web research document because `hasResearch` requires sources or insights at [course-bridge.service.ts:241](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:241).
- **Expected value**: A completed playbook that already contains research should reliably include that research in the generated course source docs. Course creation should not depend on a fresh external research call when the upstream playbook already completed.
- **Suggested fix**: Parse `playbook.web_research` with the existing `CareerPlaybookWebResearchResult` shape first and pass it to `renderCourseBridgeSourceDocuments`. Only call `runWebResearch` as a fallback when `includeWebResearch` is true and no persisted research exists. Add a unit test with `completedPlaybook({ web_research: ... })`, a failing `runWebResearch`, and assert the web research source document is still uploaded from persisted data.
- **Tradeoff**: Persisted research may be older than a fresh lookup, but it is the evidence used to generate the completed Role Guide and keeps the bridge deterministic. A refresh option can be added later as an explicit product choice.
- **Confidence**: High.

# Optional

## 1. Course brief extraction does not match the real `role_profile_spec` schema

- **Severity**: Low
- **Evidence**: `buildCourseBridgeBrief` reads top-level fields such as `roleSpec.title`, `roleSpec.target_audience`, `roleSpec.learning_outcomes`, `roleSpec.summary`, and `roleSpec.description` at [course-bridge.service.ts:180](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts:180). The shared schema stores title under `position.title` and role signals under nested `context` and `focus_areas` at [career-playbook.ts:195](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/shared-types/src/career-playbook.ts:195). The new unit fixture uses the wrong top-level shape at [career-playbook-course-bridge.service.test.ts:46](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/tests/unit/server/routers/career-playbook-course-bridge.service.test.ts:46), so tests do not exercise production-shaped specs.
- **Expected value**: Better course metadata and tests that reflect real generated playbooks.
- **Suggested fix**: Use `CareerPlaybookRoleProfileSpecSchema.safeParse(playbook.role_profile_spec)` and map `position.title`, `position.department`, `position.level`, `focus_areas.primary_kpis`, `focus_areas.critical_competencies`, and `research` into the brief. Update tests to use the actual schema shape.
- **Tradeoff**: Mapping nested spec fields requires a slightly more explicit brief builder, but avoids silent fallback behavior.
- **Confidence**: Medium.

## 2. Missing regression test for initiation failure cleanup

- **Severity**: Low
- **Evidence**: Current bridge service tests cover upload rollback at [career-playbook-course-bridge.service.test.ts:171](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/tests/unit/server/routers/career-playbook-course-bridge.service.test.ts:171) and success at [career-playbook-course-bridge.service.test.ts:189](/home/me/code/mc2/.worktrees/career-playbook-jd-bridge/packages/course-gen-platform/tests/unit/server/routers/career-playbook-course-bridge.service.test.ts:189), but there is no test where `initiateGeneration` fails after documents are uploaded.
- **Expected value**: Prevents regressions for the primary atomicity bug above.
- **Suggested fix**: Add a test that makes `dependencies.initiateGeneration` reject with a `TRPCError`, expects the same rejection, and verifies cleanup.
- **Tradeoff**: Minor test maintenance.
- **Confidence**: High.

# Verification

- Reviewed `git diff`, untracked implementation/test files, relevant router/service code, existing upload/generation path behavior, and shared Career Playbook schemas.
- `git diff --check`: PASS.
- I did not rerun the already reported targeted backend/frontend tests, `pnpm type-check`, or `pnpm lint`; orchestrator reported them passing before this review.

# Risks / Follow-ups

- Must-fix before accepting: rollback course/source docs when generation initiation fails.
- Must-fix before accepting: reuse persisted `career_playbooks.web_research` before attempting fresh external research.
- Explicit defers: none.
