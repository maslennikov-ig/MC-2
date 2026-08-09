---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-k2qih/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: Career Playbook document reader
public_facade: n/a
bounded_acceptance: smooth accessible hide-show motion for both existing reader rails
non_goals:
  - changing active-section detection
  - changing TOC autoscroll
  - redesigning the reader
  - adding or changing backend behavior
evidence:
  - none
task_id: mc2-k2qih
epic_id: n/a
stage_id: mc2-k2qih
session_id: mc2-k2qih
milestone: career-playbook-reader-panel-motion
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one root owner kept the coupled layout, interaction, and acceptance boundary cohesive
repo: mc2
branch: develop
base_branch: develop
base_commit: 1e4caad9f
worktree: /home/me/code/mc2
write_zone:
  - packages/web/components/career-playbook/viewer/PlaybookViewer.tsx
  - packages/web/tests/unit/components/career-playbook/viewer.test.tsx
  - packages/web/tests/e2e/career-playbook/viewer-editor.spec.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-k2qih
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-k2qih
success_criteria:
  - left and right rail exits remain mounted during their 220 ms transform-opacity animation
  - the document relayout uses Framer Motion layout projection instead of snapping
  - reduced-motion preference removes panels without exit motion
  - URL state and semantic panel removal remain covered
  - focused checks, type-check, and build pass
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - packages/web/components/career-playbook/viewer/PlaybookViewer.tsx
  - https://raw.githubusercontent.com/emilkowalski/skill/main/skills/emil-design-eng/SKILL.md
selected_skills:
  - orchestrator-stage
  - task-router
  - lazyweb-apply-design-best-practices
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - playwright
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local-root-owner
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no child worktree or delegated branch was created; build, test, and graph outputs are ignored
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: no public or operator contract changed; tests document the interaction behavior
verification:
  - red focused Vitest before implementation: failed as expected, 1 of 14 tests
  - final focused Vitest: passed, 15 tests
  - focused ESLint and Prettier: passed
  - authenticated Chromium scenario: blocked in global setup before test execution because Supabase test credentials are absent locally
  - pnpm type-check: passed
  - pnpm build: passed with the pre-existing DEP0169 warning
  - graphify update and cluster-only: passed, 61418 nodes and 7337 communities
changed_files:
  - packages/web/components/career-playbook/viewer/PlaybookViewer.tsx
  - packages/web/tests/unit/components/career-playbook/viewer.test.tsx
  - packages/web/tests/e2e/career-playbook/viewer-editor.spec.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-k2qih/scope-criterion-snapshot.json
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-k2qih
explicit_defers:
  - none
---

# Summary

Both Career Playbook reader rails now animate with short transform/opacity motion while Framer
Motion layout projection smooths the document width and position change. Existing URL, TOC sync,
autoscroll, sticky rail, and semantic-removal behavior is preserved.

# Scope / Routing

The implementation uses the repository's existing Framer Motion dependency and local
reduced-motion hook. No new dependency or CSS animation system was introduced.

# Verification

The red unit test proved immediate removal before implementation. The final 15-test file covers
the animated exit and reduced-motion path. Lint, formatting, type-check, build, and graph refresh
pass. The authenticated Chromium test is committed for CI but could not start locally because its
global setup requires Supabase test credentials that are not installed in this environment.

# Delivery / Cleanup

Accepted in the primary `develop` worktree. No delegated branch or child worktree exists.

# Risks / Follow-ups / Explicit Defers

None. Browser coverage is present and will run in the configured CI environment; the local blocker
is an environment precondition, not a product-code failure.
