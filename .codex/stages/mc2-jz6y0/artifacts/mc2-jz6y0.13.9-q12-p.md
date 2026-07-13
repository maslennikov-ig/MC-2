---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.9
stage_id: mc2-jz6y0
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Registry credential handling, immutable release identity, provenance, and cleanup are security-critical.
repo: /home/me/code/mc2
branch: codex/q12-p-operator-publisher
base_branch: codex/self-hosted-qdrant-platform
base_commit: dfdcdcc7d6dafe6094eb469cedd929ed0904cb92
worktree: /home/me/code/mc2/.worktrees/q12-p-operator-publisher
write_zone:
  - deploy/qdrant/publish-qdrant-operator.sh
  - packages/course-gen-platform/tests/unit/ops/qdrant-operator-publisher.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.9-q12-p.md
success_criteria:
  - Publish only the existing qdrant-operator target for linux/amd64 under one full accepted commit SHA tag.
  - Use stdin-only classic PAT login, a unique owner-only Docker config, maximum provenance, and independent remote digest verification.
  - Remove credentials, metadata, and worktree state on success, failure, or signal; cleanup failure overrides success.
  - Exercise every external executable through synthetic command capture without registry or network mutation.
selected_docs:
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
  - https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
  - https://docs.docker.com/reference/cli/docker/login/
  - https://docs.docker.com/reference/cli/docker/buildx/build/
  - https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/
selected_skills:
  - senior-devops
  - test-driven-development
  - systematic-debugging
  - verification-before-completion
selected_agents:
  - deploy_specialist framing for credentials, rollback, and delivery effects
  - root independent security/correctness reviewer
catalog_candidates:
  - none - installed assets fit the bounded implementation
parallel_group: P-wave-1
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: awaiting orchestrator acceptance
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: Durable operator instructions are outside the worker write zone and remain owned by the root docs review after integration.
verification:
  - 'focused Vitest publisher contract: passed (11/11)'
  - 'bash -n deploy/qdrant/publish-qdrant-operator.sh: passed'
  - 'pnpm --filter @megacampus/course-gen-platform type-check: passed'
  - 'synthetic token argv/stdout/stderr/temp-state scan: passed'
  - 'success/failure/signal residue checks: passed'
  - 'approved design SHA-256: passed (5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15)'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.9-q12-p.md: passed'
changed_files:
  - deploy/qdrant/publish-qdrant-operator.sh
  - packages/course-gen-platform/tests/unit/ops/qdrant-operator-publisher.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.9-q12-p.md
explicit_defers:
  - mc2-jz6y0.13.9 - Real GHCR login/build push/publication remains a separately authorized and observed mutation after local acceptance; no implementation debt is deferred.
---

# Summary

Implemented a local build-only publisher that refreshes and verifies the canonical pushed commit, creates a clean detached worktree, logs in to GHCR through stdin using an isolated mode-`0700` Docker config, and invokes Buildx exactly once for `qdrant-operator` on `linux/amd64`. The publisher binds the full SHA as tag and OCI revision, requests `--provenance=mode=max`, records Buildx metadata, and compares its digest with a separate registry inspection before reporting success.

Initial RED was observed with the publisher absent: 8/8 focused tests failed for the expected missing-file reason. Additional TDD cycles reproduced and closed xtrace token disclosure, credential-helper injection, post-`mktemp` residue, stale remote-tracking identity, and non-JSON Buildx digest formatting. Final GREEN is 11/11.

# Scope / Routing

The implementation is confined to the assigned publisher, focused test, and this artifact. No workflow, Compose file, Dockerfile, deploy script, package metadata, or durable documentation changed. The approved design hash remained `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`.

Official contracts were rechecked on 2026-07-13. GitHub documents classic PAT `write:packages` and `docker login ghcr.io --password-stdin`; Docker documents isolated CLI config storage, Buildx `--metadata-file`, `--push`, `--platform`, `--target`, `--provenance=mode=max`, and JSON-formatted `imagetools inspect`. Observed local versions were Git `2.53.0`, Docker CLI `29.5.3`, and Buildx `v0.34.1-desktop.1` (`c79576280a671664e17eb68da98ec3136b614aed`).

Graphify was reviewed with the integration graph report and a focused query for the qdrant-operator Docker target/runtime tests (`graph-reviewed: used`). No worker graph refresh, external model/API backend, or Git hooks were used.

# Verification

- Focused Vitest: 1 file, 11/11 tests passed. Every publisher external executable was routed through synthetic command capture; no real Docker login, build, push, registry inspection, or Git fetch occurred.
- Leak and residue coverage scanned the synthetic token across captured argv, stdout, stderr, logs, and fixture trees after success, ordinary failure, signal, helper injection, digest mismatch, and cleanup failure; zero matches and zero run-state residue.
- Bash syntax passed.
- Course platform type-check passed, including required shared package builds.
- Artifact validation passed with `artifact validation OK`.

# Delivery / Cleanup

The branch is returned for orchestrator review and is not accepted or integrated. Worker cleanup remains pending orchestrator acceptance under the repository contract.

# Risks / Follow-ups / Explicit Defers

The only deferred action is the real GHCR mutation. It requires a current classic PAT with `write:packages`, exact confirmation for the accepted release SHA, and separate observed execution after local review. No real credential was supplied, and no implementation debt remains.
