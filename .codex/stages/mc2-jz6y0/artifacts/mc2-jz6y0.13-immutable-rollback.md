---
schema_version: orchestration-artifact/v1
artifact_type: implementation-stream
task_id: mc2-jz6y0.13.3
stage_id: mc2-jz6y0
agent_type: root_orchestrator
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: immutable deployment identity, credential parity, and fail-closed rollback are high-impact staging safety boundaries
repo: mc2
branch: codex/self-hosted-qdrant-platform
base_branch: origin/codex/self-hosted-qdrant-platform
base_commit: f9389b69c407988d706c4bb9f4e3b7328ca00506
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .github/workflows/ci-cd.yml
  - docker-compose.app.yml
  - docker-compose.production.yml
  - scripts/deploy_blue_green.sh
  - scripts/rollback_blue_green.sh
  - scripts/ci/detect_deploy_changes.sh
  - scripts/ci/test_ci_cd_workflow_gates.mjs
  - scripts/ci/test_detect_deploy_changes.sh
  - scripts/ci/test_blue_green_fail_closed.sh
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-immutable-rollback.md
success_criteria:
  - staging application and worker images are recorded and restored by repository digest
  - rollback cannot promote an unaccepted color after a pre-switch failure
  - Qdrant verifier and application admin credentials originate from the same secret
  - required metrics group and Qdrant operator assets trigger fail-closed deploy behavior
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - docs/operations/qdrant-self-hosted.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-acceptance-gate.md
selected_skills:
  - orchestrator-stage
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - repository deployment contracts and installed verification skills cover the stream
parallel_group: B
depends_on_streams:
  - Q12 acceptance follow-up review
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: no remote resource or staging state was created
risk_level: high
docs_impact: ops-deploy
docs_reviewed: pending
docs_review_notes: stable operator documentation will be reviewed after migration and operator-runtime streams join
verification:
  - node scripts/ci/test_ci_cd_workflow_gates.mjs: passed
  - bash scripts/ci/test_detect_deploy_changes.sh: passed
  - bash scripts/ci/test_blue_green_fail_closed.sh: passed
  - bash -n scripts/deploy_blue_green.sh scripts/rollback_blue_green.sh scripts/ci/test_blue_green_fail_closed.sh: passed
  - docker compose config for app and production with synthetic immutable refs: passed (153 and 711 rendered lines)
  - pnpm exec prettier --check on changed YAML/JavaScript: passed
  - git diff --check: passed
changed_files:
  - .github/workflows/ci-cd.yml
  - docker-compose.app.yml
  - docker-compose.production.yml
  - scripts/deploy_blue_green.sh
  - scripts/rollback_blue_green.sh
  - scripts/ci/detect_deploy_changes.sh
  - scripts/ci/test_ci_cd_workflow_gates.mjs
  - scripts/ci/test_detect_deploy_changes.sh
  - scripts/ci/test_blue_green_fail_closed.sh
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-immutable-rollback.md
explicit_defers:
  - remote activation still requires off-host S3 secrets, a non-conflicting QDRANT_METRICS_GID, exact source parity, accepted operator runtime, and accepted migration runner
---

# Summary

The deploy path now fails closed around the four P1 findings from the independent
Q12 review. CI publishes a full-commit tag, the server resolves it to a registry
digest, and each color stores exact `WEB_IMAGE` and `API_IMAGE` references in its
private environment snapshot. API-backed Stage 1-6 workers consume the same API
digest and environment snapshot as the selected color.

The deploy transaction records `preparing`, `switched`, and `accepted` states.
Both the GitHub rollback job and the host rollback script refuse to run unless
traffic actually switched. Rollback validates immutable target references,
restores API/web plus the main and Stage 6 workers before nginx, and then records
`rolled_back`.

The workflow materializes the Qdrant admin key, read-only key, S3 keys, Grafana
admin password, Alertmanager notification credentials, and the Prometheus copy
of the read-only key from their exact GitHub secrets, with host mode `0400`.
`QDRANT_METRICS_GID` is now mandatory. Changes under `ops/qdrant/` trigger
deployment, and the three deploy-contract tests run in CI.

# Verification

## TDD evidence

The expanded contract suite first failed on the missing metrics GID and on
`ops/qdrant` producing `should_deploy=false`. Subsequent RED checks covered the
absent secret materialization, mutable image tag, missing transaction guard, and
missing CI execution. The final focused suite passes all three scripts and both
Compose renders without using a live server or secret value.

# Remote state

No SSH write, service change, secret write, image pull, deploy, database change,
queue operation, Qdrant mutation, S3 request, or notification was performed by
this implementation stream.

# Risks / Follow-ups

- The integration is not accepted until an independent correctness review of
  this diff returns with zero P0/P1 findings.
- Secret values and the metrics GID do not exist in GitHub/staging yet; the
  workflow now rejects that incomplete state instead of silently proceeding.
- Source parity and the separately delegated migration/operator runtime streams
  remain hard gates before remote mutation.
