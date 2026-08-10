---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-sshkz/stage-manifest.json
stream_owner: root-owner
orchestration_level: release
scope_kind: product_slice
immediate_consumer: delivered develop release
public_facade: repository test runners, GitHub Actions, and dev HTTP surface
bounded_acceptance: classify all test skips and prove the delivered develop release on dev without paid or destructive live work
non_goals:
  - paid generation or load testing
  - reindex or schema migration
  - destructive live data mutation
  - secrets or access changes
evidence:
  - exact-remote-and-deploy-identity
  - complete-skip-inventory-and-classification
  - canonical-release-acceptance-receipt
  - dev-api-and-ui-smoke-evidence
task_id: mc2-sshkz
epic_id: n/a
stage_id: mc2-sshkz
session_id: mc2-sshkz
milestone: develop-release-skip-and-runtime-audit
milestone_status: in_progress
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: test skip classification and deployed runtime proof share one release acceptance boundary
repo: mc2
branch: develop
base_branch: develop
base_commit: fe9652ba559eaf3e7345dd18c3ebd0372c44a10f
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/tests
  - packages/course-gen-platform/vitest.config.ts
  - packages/course-gen-platform/vitest.config.unit.ts
  - packages/course-gen-platform/package.json
  - packages/web/tests
  - packages/web/vitest.config.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-sshkz
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-sshkz
success_criteria:
  - every reported backend and web skip has an explicit structural reason
  - accidental skips and false-green paths are fixed and covered
  - canonical release acceptance passes
  - exact delivered develop identity is healthy on dev API and UI surfaces
  - unavailable paid or mutating checks are listed explicitly
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - .codex/repository-failure-modes.md
  - .codex/project-index.md
selected_skills:
  - orchestrator-stage
  - test-pass
  - playwright
  - superpowers-systematic-debugging
  - superpowers-test-driven-development
  - orchestration-closeout
  - graphify-project
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local-root-owner
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: disposable PostgreSQL containers and the isolated Playwright browser session were removed; no child worktree exists
risk_level: high
risk_tags:
  - verification
  - ci-cd
  - deployed-runtime
affected_surfaces:
  - backend
  - frontend
  - operations
invariants:
  - test-matrix
  - deployed-image-provenance
  - no-false-green
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the localized sign-in label uses the existing nav.signIn contract; no route, API, operator entrypoint, or durable documentation changed
verification:
  - backend-default-unit-6886-passed-111-structural-skips
  - backend-pg17-opt-in-309-passed-zero-skipped
  - backend-pgcrypto-opt-in-3-passed-zero-skipped
  - backend-observability-opt-in-21-passed-zero-skipped
  - web-default-unit-1271-passed-zero-skipped-before-localization-fix
  - incompatible-qdrant-full-config-exited-one
  - github-actions-run-31322960981-green-for-9987826687ef44340c0713740a4ecfcb55d0a2eb
  - ci-integration-backend-23-passed-17-structural-skips
  - ci-integration-web-19-passed-zero-skipped
  - dev-read-only-api-and-playwright-smoke-green-before-localization-fix
  - auth-button-red-one-failed-one-passed-then-green-two-passed
  - release-typecheck-caught-nav-namespace-then-production-shaped-provider-red-and-green
  - canonical-release-closeout-passed-typecheck-build-test-and-process-check
  - web-final-unit-1272-passed-zero-skipped
changed_files:
  - .codex/goals/mc2-sshkz/scope-criterion-snapshot.json
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-sshkz
  - packages/web/components/common/auth-button.tsx
  - packages/web/tests/unit/components/common/auth-button.test.tsx
explicit_defers:
  - paid generation and load tests require a separately approved budget and disposable inputs
  - reindex, schema migrations, and destructive live mutation remain forbidden
---

# Summary

The skip audit is complete. All 111 default backend skips were classified: 106 PostgreSQL 17
recovery/cutover checks, three disposable pgcrypto checks, and two mutually exclusive environment
branches. The opt-in groups all passed when their required local fixtures were supplied. The web
suite reported no skips. Browser verification found one real defect: the signed-out header action
was hard-coded in Russian on English routes. A focused red-green regression now binds it to the
existing `nav.signIn` translation.

# Verification

The previous delivered application SHA `9987826687ef44340c0713740a4ecfcb55d0a2eb` is tied to green
GitHub Actions run `31322960981`, including integration tests and dev deployment. Read-only dev
checks covered health, Russian and English landing pages, the 26-block interactive role example,
the course catalog and search, and the signed-out create/auth flow. The canonical release closeout
then passed `pnpm type-check`, `pnpm build`, `pnpm test`, and process verification after the
localization correction; its tracked acceptance receipt records the exact diff fingerprint.

# Delivery / Cleanup

Pending commit and dev delivery. All disposable PostgreSQL containers and the Playwright session
were removed; no child worktree or branch exists.

# Risks / Follow-ups / Explicit Defers

Paid generation, load testing, reindex, real schema migration, and destructive live mutation were
not run and are not reported as passing.
