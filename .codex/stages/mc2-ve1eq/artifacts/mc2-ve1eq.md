---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-ve1eq/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: contributors and active GitHub Actions jobs
public_facade: packageManager pin, pnpm workspace policy and CI setup
bounded_acceptance: warning-free reproducible install plus clean-build and repository verification
non_goals:
  - application dependency changes, disabled historical workflow rewrites, remote delivery or deployment
evidence:
  - node24-version-comparison
  - clean-install-native-build-proof
  - ci-contract-regression
task_id: mc2-ve1eq
stage_id: mc2-ve1eq
session_id: mc2-ve1eq
milestone: pnpm-node24-deprecation-removal
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one root owner controls package-manager, lockfile and active-CI compatibility
repo: mc2
branch: develop
base_branch: develop
base_commit: ad4f50e90
worktree: /home/me/code/mc2
write_zone:
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - .github/workflows/ci-cd.yml
  - scripts/ci/test_ci_cd_workflow_gates.mjs
  - .codex/stages/mc2-ve1eq
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: temporary clean-install clone was moved to trash; no delegated branch, worktree or runtime tail remains
risk_level: high
risk_tags:
  - package-manager-major-upgrade
  - clean-install-semantics
  - ci-version-drift
affected_surfaces:
  - tooling
  - dependency-lock
  - ci
invariants:
  - package-manager-ci-pin-match
  - reviewed-build-script-allowlist
  - unreviewed-builds-fail-closed
  - explicit-script-only-project-hooks
verification:
  - pnpm 9.15.9 reproduced DEP0169 and pnpm 10.33.4 did not under Node 24.18.0
  - clean frozen install ran every reviewed native build and reported no ignored builds
  - bcrypt native smoke passed in the clean checkout
  - clean backend and web production builds passed
  - active CI package-manager contract test passed
  - frozen install and audit pass with deprecations promoted to errors
changed_files:
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - .github/workflows/ci-cd.yml
  - scripts/ci/test_ci_cd_workflow_gates.mjs
  - .codex/goals/mc2-ve1eq/scope-criterion-snapshot.json
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-ve1eq/stage-manifest.json
  - .codex/stages/mc2-ve1eq/summary.md
  - .codex/stages/mc2-ve1eq/artifacts/mc2-ve1eq.md
explicit_defers:
  - remaining backlog boundaries require owner/live/migration authority or an active-spec reopen gate
---

# Summary

The repository now uses pnpm 10.33.4, the smallest tested current major that removes the Node 24
package-manager `DEP0169` warning. The lockfile and active CI use the same version. Required
dependency build scripts are explicitly reviewed and future unknown scripts fail closed.

# Verification

A clean temporary checkout exposed the pnpm 10 build-policy change, ran all six allowed dependency
builds, reported none ignored, passed bcrypt native loading, and passed backend plus web production
builds. The active CI contract test protects the pin and policy. The canonical stage close command
owns final frozen-install, audit, type-check and build evidence.

# Risks / Follow-ups

pnpm 10 uses lockfile format 9 and a stricter dependency-script trust model. Roll back the manifest,
workspace policy, active CI pin and lockfile together. No remote action is part of this stage.
