---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.24.1
stage_id: mc2-jz6y0
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Production rollout control crosses fail-closed configuration, deterministic cohorting, and live Stage 5/6 callers.
repo: /home/me/code/mc2
branch: codex/e7-stage5-rollout
base_branch: codex/self-hosted-qdrant-platform
base_commit: 7b542c8def7646e92e262f3c80008fd43c65eb48
worktree: /home/me/code/mc2/.worktrees/e7-stage5-rollout
write_zone:
  - packages/course-gen-platform/src/shared/document-evidence/rollout.ts
  - packages/course-gen-platform/src/stages/stage5-generation/evidence/rollout.ts
  - packages/course-gen-platform/src/stages/stage5-generation/handler.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/evidence-loader.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment-handler.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/document-evidence-rollout.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/evidence-loader.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-stage5-rollout.md
success_criteria:
  - Stage 5 creates the production evidence adapter only for exact active configuration and a deterministic bounded course cohort.
  - Missing or invalid rollout configuration fails closed while the ordinary baseline orchestrator continues.
  - Stage 6 validates course and organization scope in every mode but loads accepted evidence only in exact active mode, independently of the Stage 5 cohort.
  - Tests pin integer parsing, versioned SHA-256 buckets, handler injection, Stage 6 shadow isolation, and privacy-safe behavior.
selected_docs:
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - Stage 5 handler, production adapter, orchestrator and focused tests
  - Stage 6 evidence loader and focused tests
  - Graphify report/query at base 7b542c8d
selected_skills:
  - /mnt/c/Users/masle/.codex/superpowers/skills/test-driven-development/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/systematic-debugging/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/verification-before-completion/SKILL.md
selected_agents:
  - worker; independent correctness review remains orchestrator-owned
catalog_candidates:
  - none - installed skills and approved repository truth covered the stream
parallel_group: E7-R alongside E7-O observability and E7-D documentation
depends_on_streams:
  - accepted E5, E6, Q8 and Q9 integration at 7b542c8d
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Five authorized setup-only node_modules symlinks were removed; no containers, services, secrets, live data or runtime resources were created. After integration merge ad66dd50 and acceptance commit 0dab9df7 were pushed, the dedicated worktree and local branch were removed; the remote evidence branch remains.
risk_level: high
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: E7-D owns durable documentation; handoff contract is exact enabled plus active mode, Stage 5-only numeric cohort, and rollback by disabling the feature or leaving active mode while retaining audit rows.
graph_reviewed: used
graph_review_notes: Read the fresh integration report built from 7b542c8d and queried the live Stage 5 handler/orchestrator path; child graph refresh is outside this stream's write zone and remains integration-owned.
verification:
  - Stage 5 RED with synthetic local Supabase setup: exit 1; rollout module absent and cohort-zero handler still constructed the adapter.
  - Expanded Stage 6 RED with synthetic local Supabase setup: exit 1; shared active gate absent and default/disabled/shadow loaded accepted evidence in 3 failing cases.
  - Focused GREEN across Stage 5 rollout/handler and Stage 6 loader: 14/14 passed.
  - pnpm --filter @megacampus/course-gen-platform type-check: passed.
  - pnpm exec prettier --check over all seven code/test files: passed.
  - git diff --check: passed.
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-stage5-rollout.md: passed.
  - git commit 0aad2c20 and git push -u origin codex/e7-stage5-rollout: passed.
  - Independent correctness review of 7b542c8d..b7359f32: PASS / MERGE with no branch findings; the separately found Stage 4 shadow-conflict gap is tracked by mc2-jz6y0.24.3.
  - Integration rerun after merge: focused Stage 5 rollout/handler plus Stage 6 loader passed 14/14; @megacampus/course-gen-platform type-check passed.
changed_files:
  - packages/course-gen-platform/src/shared/document-evidence/rollout.ts
  - packages/course-gen-platform/src/stages/stage5-generation/evidence/rollout.ts
  - packages/course-gen-platform/src/stages/stage5-generation/handler.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/evidence-loader.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment-handler.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/document-evidence-rollout.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/evidence-loader.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-stage5-rollout.md
explicit_defers:
  - Numeric Stage 5 cohort percentage and production rollout thresholds remain owner-configured; this stream selects no live value.
  - E7-D owns durable environment/rollback documentation, and the orchestrator owns acceptance plus Beads closure.
---

# Summary

Stage 5 now constructs its production advisory-evidence adapter only when `DOCUMENT_EVIDENCE_ENABLED=true`, `DOCUMENT_EVIDENCE_MODE=active`, and the course falls inside `DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT`. The percentage defaults and fails closed to zero, while a versioned SHA-256 contract assigns stable 0-99 course buckets. Outside the cohort the normal `GenerationOrchestrator` still runs with no evidence adapter, so baseline generation is unchanged and no audit rows are deleted.

The docs-review expansion added a generic exact-active gate shared by Stage 5 and Stage 6. Stage 6 always resolves the current course organization and rejects mismatched requested scope first. Default, disabled and shadow modes then return no evidence context without reading accepted evidence. Active Stage 6 consumes current durable accepted evidence regardless of the Stage 5 cohort percentage, because that cohort bounds only advisory Stage 5 enrichment.

# Scope / Routing

The implementation stayed within the expanded E7-R write zone. It did not modify the Stage 5 orchestrator, advisory enrichment algorithm, Stage 6 retriever/job processor, metrics, docs, Compose, systemd, handoff, stage summary, Beads or any Q10-Q12 asset. No external dependency research or catalog discovery was needed.

No new ordinary log or metric was added. The rollout helper hashes a course UUID internally but never logs it; it adds no document IDs, content, claims, answers or errors to labels or logs.

# Verification

The first requested command could not start Vitest because the new worktree lacked dependency symlinks; that setup error was not counted as RED. With the orchestrator-authorized temporary primary-install symlinks and synthetic local Supabase variables, the valid Stage 5 RED showed the missing rollout module and one real handler failure. The expanded RED then showed the missing shared gate and three Stage 6 default/disabled/shadow failures. After minimal implementation and formatting, the final focused command passed 14/14, exact package type-check passed, and formatting/diff gates passed.

# Delivery / Cleanup

Implementation commit `0aad2c20` was pushed to `origin/codex/e7-stage5-rollout`. All five setup-only dependency symlinks were removed before artifact creation. The branch is returned for independent correctness review; the Beads task remains open for orchestrator acceptance.

# Risks / Follow-ups / Explicit Defers

The implementation intentionally chooses no rollout percentage. Operators must explicitly set all three values for Stage 5 activation. Setting the global flag false, using any mode other than exact `active`, omitting the cohort, or providing a malformed/out-of-range cohort disables live Stage 5 enrichment. Stage 6 ignores the Stage 5 cohort but requires the same exact global active gate. Rollback disables the global flag or active mode and retains stored audit rows.

docs-reviewed: no-change-needed - durable environment and rollback documentation belongs to sibling E7-D; this artifact records the exact contract.

graph-reviewed: used - fresh base report/query identified the production Stage 5 injection boundary; no child graph refresh was authorized.
