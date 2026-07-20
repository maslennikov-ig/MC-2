---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.4.1.3
stage_id: mc2-jz6y0
agent_type: deploy_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: container isolation, host locks, writer-state restoration, and secret boundaries are high risk
repo: mc2
branch: codex/q12-source-recovery-runtime
base_branch: codex/self-hosted-qdrant-platform
base_commit: f4a1d0ae
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-runtime
write_zone:
  - packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh
  - packages/course-gen-platform/Dockerfile
  - docker-compose.infra.yml
  - deploy/qdrant/source-recovery-run.sh
  - packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-runtime-contract.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.3.md
success_criteria:
  - expose all six source-recovery modes without staging or mounting a Qdrant key
  - render three digest-pinned operator one-shots with exact planner, executor, and disposition mounts and network boundaries
  - prove the narrow same-filesystem UID:GID 1001:1001 mode-0700 capability directory while both planner upload roots remain read-only
  - hold one host flock across the full workflow and restore the exact prior state of six writer services after success, failure, or signal
  - resume reviewed owner-only manifest/journal state without replanning or bypassing fresh copy verification
  - pin Compose to the exact active local-Unix Docker context that the wrapper verified
  - expose reviewed rollback through the same lock, writer-state, and networkless-executor boundary without any forward command
  - keep the result local and synthetic, pass focused runtime, Compose, shell, CI, type-check, artifact, and process gates, then commit and push clean
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - graphify-out/GRAPH_REPORT.md
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md Task 5
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-workflow-rereview.md
  - 03c32ef7:.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.3-review.md
selected_skills:
  - senior-devops
  - superpowers:receiving-code-review
  - superpowers:test-driven-development
  - systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - deploy_specialist
catalog_candidates:
  - none - installed skills and approved repository specifications fit
parallel_group: q12-source-recovery-runtime
depends_on_streams:
  - accepted source-recovery core
  - accepted source-recovery workflow/CAS
  - accepted source-recovery reindex and evidence streams
parallel_decision: sequential - entrypoint, Compose model, host wrapper, and runtime tests share one security and mount contract
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: implementation, review, and rereview worktrees plus local branches were removed after fresh integration verification; pushed remote evidence branches remain
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: Task 5 implements the approved runtime contract; operator/runbook prose is explicitly owned by Task 6 and was outside this worker write zone
graph_reviewed: used
graph_review_notes: read graphify-out/GRAPH_REPORT.md and ran a focused operator/Compose/source-recovery query for orientation; child refresh is prohibited and integration owns graph refresh
resolves_review:
  - 03c32ef7
verification:
  - strict RED runtime test: passed as RED with 7/7 expected failures before implementation
  - resume RED runtime test: passed as RED because the fresh-only wrapper rejected --resume-from
  - RR1 active-context RED: failed because remote currentContext passed when default was local and Compose received no pinned context
  - RR3 credential RED: failed because read-only Qdrant sentinels reached rendered services and help child
  - RR4 durable-resume RED: failed because missing plan input blocked reviewed manifest/journal resume
  - RR2 rollback RED: failed because --operation was rejected and no guarded rollback path existed
  - focused Task 5 Vitest: passed 34/34 across source-recovery, operator, and existing runtime contracts
  - docker compose synthetic operator-profile config with Qdrant sentinels: passed
  - bash -n entrypoint and host wrapper: passed
  - node scripts/ci/test_ci_cd_workflow_gates.mjs: passed
  - pnpm --filter @megacampus/course-gen-platform type-check: passed
  - scripts/orchestration/run_process_verification.sh: passed
  - artifact validation and git diff --check: passed
  - independent delta rereview 26d6559e: PASS with P0 0, P1 0, P2 0, P3 0
  - fresh integration focused runtime/operator/Compose: passed 34/34
  - fresh integration package type-check, shell syntax, CI, artifact, process, and diff gates: passed
changed_files:
  - packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh
  - packages/course-gen-platform/Dockerfile
  - docker-compose.infra.yml
  - deploy/qdrant/source-recovery-run.sh
  - packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-runtime-contract.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.3.md
explicit_defers:
  - Task 6 runbook integration, parent graph refresh, and any staging execution remain with the orchestrator; no remote execution occurred here
---

# Summary

Implemented the approved source-recovery runtime as three hardened, digest-pinned
operator-profile one-shots. Planning and copy verification are networked with
both upload roots read-only and only a narrow same-filesystem capability bind
writable. Execution runs as `1001:1001` with `network_mode: none`, no env file or
secrets, development read-only, production writable, immutable manifest
read-only, and progress writable. Disposition work is networked, has no upload
mount, and receives only the reviewed manifest read-only plus progress writable.

The pinned entrypoint now exposes all six approved modes, validates normalized
manifest/journal paths and UUIDv4 confirmation for mutating modes, unsets all
four admin/read-only Qdrant value/file variables before help or execution, and never invokes Qdrant credential staging for
source recovery. The Docker target imports the source-recovery module during
self-check and executes its help path at build time.

The host wrapper uses the fixed default lock
`/run/megacampus-qdrant-source-recovery/source-recovery.lock`, rejects selected
context overrides, resolves Docker's active context, verifies that exact
endpoint is a local Unix socket, and pins operator Compose to the verified
context. It refuses the default run if any named writer is active. Explicit
`--stop-writers` records all six exact active/inactive states,
stops only previously active writers, holds the flock through plan, execute,
copy verify, disposition apply, and disposition verify, then restores every
exact prior state on success, command failure, SIGINT, or SIGTERM.

Fresh invocation requires both manifest and journal to be absent. Explicit
`--resume-from` requires an existing non-symlink UID:GID-1001:1001 manifest at mode 0400
and journal at mode 0600, skips plan unconditionally, and resumes through the
accepted idempotent CLI phase checks. Planner copy verification is rerun in the
same locked/stopped-writer window before every disposition command, including a
direct disposition-stage resume; the operator-selected label is never treated
as proof that verification already happened.

Plan input and the same-filesystem capability directory are now fresh-plan-only.
Resume and rollback need only the protected manifest/journal plus upload/state
roots; `/dev/null` and the already-authorized state bind satisfy unused Compose
interpolation without adding a writable capability. Explicit rollback runs only
the networkless executor's `rollback` mode under the same host lock and writer
trap, and never forwards plan/execute/verify/disposition commands.

# Scope / Routing

Work remained inside the assigned runtime, Compose, shell-test, and artifact
zones. No source-recovery TypeScript workflow, reindex/evidence module, runbook,
remote host, database, Qdrant, Redis, staging, or production state was changed.
The local Graphify report/query was orientation only because the graph is stale
for this unintegrated branch and the child is not authorized to refresh it.

# Verification

Strict TDD began with a seven-test runtime file that failed for the expected
missing services, entrypoint mode, and wrapper. GREEN was expanded to nine
tests covering rendered mount/network/secret boundaries, the exact writable
zones, owner/mode and residue rejection, default writer refusal, success/error
restoration, concurrent lock refusal, and SIGTERM restoration. A second RED
proved the fresh-only wrapper could not resume an immutable reviewed manifest;
the final resume tests prove no replan and mandatory copy verification before
disposition continuation.

Correction TDD reproduced all four findings from review `03c32ef7`: active
remote context bypass, read-only Qdrant sentinel inheritance, durable resume
coupled to missing planner assets, and unreachable guarded rollback. GREEN adds
current-context/pinning negatives, rendered and child-process secret sentinels,
resume with physically absent plan-only assets, and rollback success, phase
rejection, command ordering, and SIGTERM restoration.

The existing Compose contract received only the synthetic variables and local
fixture paths required to render the new mandatory binds. Final fresh evidence
is recorded in frontmatter before delivery.

# Delivery / Cleanup

The stream is returned, not accepted. The branch is pushed for independent
review. Temporary dependency symlinks are removed before delivery; the dedicated
branch/worktree remain pending orchestrator acceptance and cleanup.

# Risks / Follow-ups / Explicit Defers

No staging/production/server mutation or source copy ran. The wrapper deliberately
blocks ambiguous systemd states and remote Docker endpoints. Integration must
perform the independent P0/P1 review, add the approved Task 6 operator/runbook
instructions, refresh Graphify when ownership is safe, and retain the explicit
execution authorization gate before any staging recovery.
