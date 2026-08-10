---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-0ukr6/stage-manifest.json
stream_owner: root-owner
orchestration_level: release
scope_kind: product_slice
immediate_consumer: delivered develop dependency graph
public_facade: pnpm workspace resolution and GitHub Actions Security Audit
bounded_acceptance: remove safely actionable advisories and make any remainder explicit and enforced
non_goals:
  - unrelated major dependency modernization
  - schema migration, reindex, secrets, access, or paid live work
evidence:
  - baseline-and-final-pnpm-audit
  - production-versus-development-path-classification
  - canonical-release-acceptance
  - exact-sha-ci-deploy-and-dev-health
task_id: mc2-0ukr6
epic_id: n/a
stage_id: mc2-0ukr6
session_id: mc2-0ukr6
milestone: dependency-security-remediation
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one dependency graph and release boundary require one root-owned acceptance
repo: mc2
branch: develop
base_branch: develop
base_commit: e7b015675949a9a1fb0737fe18d00f74d91a1615
worktree: /home/me/code/mc2
write_zone:
  - package.json
  - pnpm-lock.yaml
  - packages/*/package.json
  - .github/workflows
  - .beads/interactions.jsonl
  - .codex/goals/mc2-0ukr6
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-0ukr6
success_criteria:
  - committed lockfile audit is reproduced and every advisory path is classified
  - actionable critical and high findings are removed without compatibility regressions
  - remaining findings, if any, have bounded enforcement rather than a swallowed failure
  - type-check, build, tests, deploy contracts, exact-SHA CI, and dev health pass
selected_docs:
  - Context7 pnpm audit and dependency-resolution documentation persisted for pnpm@8.15.0
  - Context7 Next 15.5 patch-upgrade guidance after lockfile-routed L1 was insufficient
  - Context7 Sharp 0.35 compatibility guidance after lockfile-routed L1 was insufficient
  - Context7 OpenTelemetry stable-package alignment after explicit-version L1 was missing
selected_skills:
  - orchestrator-stage
  - task-router
  - deps-health-inline
selected_agents:
  - dependency_manager
  - security_auditor
catalog_candidates:
  - none
parallel_group: baseline-read-only-audit
depends_on_streams:
  - none
parallel_decision: parallel-read-only-analysis-then-sequential-root-updates
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no child worktree or branch exists; the primary develop worktree is preserved
risk_level: high
risk_tags:
  - security
  - rollback
affected_surfaces:
  - backend
  - ui
invariants:
  - rollback
  - test-matrix
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: audit policy documentation will be updated if workflow semantics change
verification:
  - pnpm audit all/prod/dev zero findings and exit 0
  - pnpm install --frozen-lockfile exit 0
  - CI workflow contract red before fail-closed change and green after
  - Sharp native PNG-to-WebP smoke exit 0
  - Sentry/OpenTelemetry load smoke exit 0
  - focused backend 75 plus 35 tests pass
  - focused web Mermaid 47 tests pass
  - sharp 0.35.0 type export failure reproduced; sharp 0.35.3 exact pnpm type-check passes
  - canonical release closeout passed type-check, build, test, and process verification
  - github-actions-run-31364905125-green-for-d18910ee4e9efa5df3bb22502b017b9eb94f929e
  - enforced-security-audit-and-aggregate-ci-success-green
  - exact-sha-dev-deploy-job-93385074233-green
  - dev-api-health-status-ok-and-homepage-http-200-after-deploy
changed_files:
  - package.json
  - pnpm-lock.yaml
  - packages/course-gen-platform/package.json
  - packages/shared-utils/package.json
  - packages/web/package.json
  - .github/workflows/ci-cd.yml
  - scripts/ci/test_ci_cd_workflow_gates.mjs
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/goals/mc2-0ukr6/scope-criterion-snapshot.json
  - .codex/stages/mc2-0ukr6
explicit_defers:
  - none
---

# Summary

All 77 advisory entries are removed from the resolved dependency graph. The CI security job and
the aggregate delivery gate now both fail closed.

# Scope / Routing

The root owns manifest, lockfile, CI policy, integration, and final acceptance. Read-only dependency
and security specialists may classify the same baseline independently; all writes remain sequential
under the root owner.

# Verification

Focused compatibility checks and the single canonical release acceptance are green. Exact-SHA CI,
image builds, deploy, workflow health checks, and independent dev HTTP checks also passed.

# Delivery / Cleanup

Committed in `d18910ee4`, pushed to `origin/develop`, and deployed by exact-SHA run `31364905125`.
No child worktree or branch exists; the primary `develop` worktree is intentionally preserved.

# Risks / Follow-ups / Explicit Defers

No dependency-security defer remains. Existing unrelated owner/live/migration defers are unchanged.
