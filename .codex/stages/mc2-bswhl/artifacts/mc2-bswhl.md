---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-bswhl/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: stage2-document-dashboard
public_facade: file_catalog.error_message-to-DocumentMatrixRow
bounded_acceptance: safe localized actionable failure reason in the existing Stage 2 document row
non_goals:
  - reading scan-only or outlined-text documents, client-side content extraction, or mc2-3gz2m
  - reindex, schema migrations, secrets, access changes, deploy, or live paid work
  - other Tier 1 tasks from specs/026-post-triage-priorities/spec.md
evidence:
  - acceptance-receipt
task_id: mc2-bswhl
epic_id: mc2-p2908
stage_id: mc2-bswhl
session_id: mc2-bswhl
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one bounded web data-to-presentation path owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: 7723b1874
worktree: /home/me/code/mc2
write_zone:
  - packages/web Stage 2 dashboard data and presentation
  - packages/web generation translations and focused tests
  - repository-local orchestration state
success_criteria:
  - a stored file_catalog failure reaches the failed document row regardless of Zustand status
  - an empty-text-layer failure becomes localized recovery guidance without internal path or counts
  - unknown failures are sanitized and bounded while missing reasons stay absent
  - focused web tests, type-check, and build pass without live work
selected_docs:
  - specs/026-post-triage-priorities/spec.md
selected_skills:
  - orchestrator-stage
  - lazyweb-design
  - superpowers-test-driven-development
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: root owner used the primary develop worktree; no child branch or worktree existed to clean
risk_level: medium
risk_tags:
  - ui
  - user-flow
  - data
affected_surfaces:
  - data
  - ui
  - user-flow
invariants:
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the existing Stage 2 dashboard owns this inline recovery copy; no stable navigation, public contract, or operator procedure changed
verification:
  - focused web red-green: passed, 3 tests
  - local Playwright rendering: passed, localized reason visible and raw path absent
  - pnpm run type-check: passed after removing the temporary screenshot route cache and narrowing translation keys
  - pnpm run build: passed with pre-existing DEP0169 warning tracked by mc2-p2908.1
  - scripts/orchestration/run_process_verification.sh via canonical stage closeout: passed
changed_files:
  - packages/web/components/generation-graph/hooks/useStage2DashboardData.ts
  - packages/web/components/generation-graph/hooks/__tests__/useStage2DashboardData.test.tsx
  - packages/web/components/generation-graph/panels/stage2/Stage2Dashboard.tsx
  - packages/web/components/generation-graph/panels/stage2/__tests__/Stage2Dashboard.document-error.test.tsx
  - packages/web/messages/en/generation.json
  - packages/web/messages/ru/generation.json
explicit_defers:
  - mc2-3gz2m - actual reading of scan-only or outlined-text files remains research-gated
---

# Summary

The product implementation is committed at `13efe27d6` with the typed-key correction at
`b06f7ff2b`. Persisted `file_catalog.error_message` now survives the client-store status path, and
the dashboard converts the known empty-text-layer failure into localized recovery guidance without
exposing backend paths or counters.

# Scope / Routing

One root-owned web slice. The existing Stage 2 document table is the acceptance surface. No
subagent, backend change, data migration, or live document processing is needed.

# Verification

The focused tests failed against the old behavior and now pass (3/3). A local Playwright render
confirmed that the full Russian guidance is visible inside the failed document row and the raw
backend path is absent. `pnpm run type-check`, `pnpm run build`, and the canonical process check
passed. The acceptance receipt is stored with this stage.

# Delivery / Cleanup

Root-owned implementation is accepted on local `develop`; no remote delivery or deploy was
requested. No child branch or worktree exists.

# Risks / Follow-ups / Explicit Defers

The persisted backend message contains an absolute path and extracted-character count; those must
not be shown verbatim. A browser preflight cannot identify outlined text or failed OCR from the
current size/type checks without duplicating document extraction, so `mc2-3gz2m` remains the owner.
