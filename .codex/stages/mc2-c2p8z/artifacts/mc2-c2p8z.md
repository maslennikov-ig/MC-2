---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-c2p8z/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: CI deploy contract lint job
public_facade: generated blue and green environment contract
bounded_acceptance: every required Compose variable is guaranteed in both generated colour environments before deployment
non_goals:
  - reading or modifying live host environment files or secrets
  - generating deployment secrets or changing the blue-green runtime design
  - deploy, migration, reindex, push, merge, or paid calls
evidence:
  - focused-colour-env-contract-red-green
task_id: mc2-c2p8z
epic_id: n/a
stage_id: mc2-c2p8z
session_id: mc2-c2p8z
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one small repository-only CI contract owned by root
repo: mc2
branch: develop
base_branch: develop
base_commit: d17630b76
worktree: /home/me/code/mc2
write_zone:
  - CI deploy contract checker, focused tests, workflow wiring, deployment docs, and local orchestration state
success_criteria:
  - a synthetic required variable missing from only green fails the focused check
  - required keys are derived generically from both production Compose files
  - the production env producer plus colour overlay generator guarantees every key for blue and green
  - focused deploy contracts, type-check, build, and canonical closeout pass
selected_docs:
  - specs/026-post-triage-priorities/spec.md
selected_skills:
  - orchestrator-stage
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
cleanup_notes: root owner uses the primary develop worktree; no child branch or worktree exists
risk_level: medium
risk_tags:
  - state-transition
affected_surfaces:
  - backend
invariants:
  - test-matrix
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: deployment guide documents generated colour snapshots and the generic CI contract
verification:
  - focused checker module test first failed because the checker did not exist, then passed after implementation
  - synthetic one-colour required-variable drift: passed by reporting the key missing only from green
  - current repository colour-env contract: passed with four derived required variables and no missing keys
  - CI workflow gate and deploy change detection contracts: passed
  - pnpm run type-check: passed
  - pnpm run build: passed with the existing mc2-p2908.1 url.parse warning
  - canonical process verification: passed through the stage closeout entrypoint
changed_files:
  - .claude/docs/deployment-guide.md
  - .github/workflows/ci-cd.yml
  - scripts/ci/check_color_env_contract.mjs
  - scripts/ci/test_color_env_contract.mjs
  - scripts/ci/test_ci_cd_workflow_gates.mjs
explicit_defers:
  - none
---

# Summary

Commit `02aa50dd0` adds one generic, repository-derived CI contract that catches required Compose
variables missing from either generated production colour environment before deployment.

# Scope / Routing

One root-owned repository-only CI slice. No live host or secret access is necessary.

# Verification

The focused test first failed because the checker entrypoint did not exist. After implementation it
proved a key missing only from green is reported, while the current repository contract derives four
required keys and reports no missing keys. Existing workflow and deploy-change contracts,
type-check, build, and canonical process verification pass.

# Delivery / Cleanup

No child branch or worktree exists. The change is committed locally and delivery is deferred until
the owner finishes the backlog.

# Risks / Follow-ups / Explicit Defers

No implementation debt remains in scope. The next specification item, `mc2-jz6y0.13.6`, is an owner
decision and remains stopped pending that choice.
