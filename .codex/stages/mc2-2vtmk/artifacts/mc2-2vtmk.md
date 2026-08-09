---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-2vtmk/stage-manifest.json
stream_owner: root-owner
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: production host image operations
public_facade: claude-deploy GHCR read access
bounded_acceptance: immutable private manifest is readable under claude-deploy without an image pull
non_goals:
  - deploy, image pull, service mutation, migration, reindex, push, or paid calls
  - printing, committing, or otherwise exposing a credential or Docker config content
  - changing root Docker credentials or broadening package write permissions
evidence:
  - production-readonly-registry-probe
task_id: mc2-2vtmk
epic_id: n/a
stage_id: mc2-2vtmk
session_id: mc2-2vtmk
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one production credential boundary owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: 1b8fec54bfeab4b2a02f669381a1c13046115092
worktree: /home/me/code/mc2
write_zone:
  - production claude-deploy Docker client credential
  - repository-local orchestration state
success_criteria:
  - current access is measured as claude-deploy against an existing immutable private image
  - denied access is repaired with minimum read scope through a secret-safe channel when possible
  - successful manifest inspection proves the final state without pulling an image
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - official GitHub Container registry documentation via docs-resolve fallback
selected_skills:
  - orchestrator-stage
  - technical-premortem
  - superpowers-test-driven-development
selected_agents:
  - independent security auditor for commits 63b4e2efd and 38cf560d5
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
cleanup_notes: live rollback backup removed after verification; root owner has no child branch or worktree
risk_level: high
risk_tags:
  - security
  - authorization
  - rollback
affected_surfaces:
  - backend
invariants:
  - rollback
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: deployment guide updated with separate persistent and job-scoped credential lifetimes
verification:
  - production docker manifest inspect as claude-deploy: failed with denied, proving the current credential is unusable
  - production Docker config metadata and matching GitHub Actions job interval: passed, root cause correlated without reading credential content
  - production empty temporary DOCKER_CONFIG compose preflight: passed, Docker Compose 5.0.2 remains available
  - focused deploy credential isolation and delivery contract tests: passed
  - independent security review: passed after packages permission finding was fixed and re-reviewed
  - credential installation rollback preflight: passed with no Docker credential helper and a same-directory mode-0600 backup
  - fresh-session production docker manifest inspect as claude-deploy: passed without pulling image layers; config mode 0600 and backup count zero
  - pnpm type-check: passed
  - pnpm build: passed with the existing mc2-p2908.1 url.parse warning
  - canonical process verification: passed through the stage closeout entrypoint
changed_files:
  - .github/workflows/ci-cd.yml
  - scripts/lib/ghcr-auth.sh
  - scripts/deploy_blue_green.sh
  - scripts/deploy_dev.sh
  - scripts/ci/test_ephemeral_ghcr_auth.sh
  - scripts/ci/detect_deploy_changes.sh
  - scripts/ci/test_detect_deploy_changes.sh
  - scripts/ci/test_ci_cd_workflow_gates.mjs
  - .claude/docs/deployment-guide.md
  - .codex/repository-failure-modes.md
explicit_defers:
  - repository delivery waits until the owner finishes the backlog; the first later deploy must include commit 63b4e2efd
---

# Summary

The initial production GHCR credential was unusable, but the historical claim that a PAT expired
was too strong. CI had rewritten the persistent Docker config with its job-scoped `GITHUB_TOKEN`.
The dedicated read-only credential supplied by the owner is now installed and verified. Commit
`63b4e2efd` isolates future CI authentication in a temporary Docker config, and `38cf560d5` limits
deploy jobs to `contents: read` and `packages: read`.

# Scope / Routing

One root-owned production credential boundary. The user explicitly authorized the read-only live
check and, if needed, credential reissuance. No deploy, image pull, or service mutation is in scope.

Technical premortem verdict: GO WITH CONDITIONS. The owner explicitly accepted the bounded risk of
rotating before code delivery. The installation therefore used a same-directory mode-0600 backup,
signal-safe rollback, stdin with terminal echo disabled, and a fresh-session manifest probe. The
host has no Docker credential helper, so Docker's standard config is access-controlled but not
encrypted at rest.

# Verification

The initial live probe ran as `claude-deploy` UID 1000 against the current immutable API image and
returned `denied` without pulling layers. The Docker config mtime falls inside GitHub Actions run
`31254580512` job `Deploy to Dev`; the repository path executed a default-config `docker login` with
that job's `GITHUB_TOKEN`. Focused tests first failed by observing both deploy entrypoints overwrite
the persistent config, then passed after the ephemeral-config implementation. Type-check and build
also passed. After replacement, an independent fresh SSH session inspected the same manifest with
exit 0 as `claude-deploy`; the persistent config remained mode `0600` and no backup remained.

# Delivery / Cleanup

The repository fix is committed locally as `63b4e2efd` plus least-privilege hardening
`38cf560d5`. An independent security reviewer reported no remaining findings after re-reviewing the
hardening delta and final rollback evidence. The commits have not been pushed, merged, or deployed.
The persistent read-only credential is installed and verified; its temporary backup was deleted.

# Risks / Follow-ups / Explicit Defers

Repository delivery is intentionally deferred until the owner finishes the backlog. The first later
deploy must include `63b4e2efd`; an older deploy revision can overwrite the persistent credential
again. Do not copy the broader root Docker config. The credential is stored in Docker's standard
mode-0600 config because no credential helper is configured.
