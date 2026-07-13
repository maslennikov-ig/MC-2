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
  - Refuse a pre-existing exact tag after authenticated inspection; fail closed unless the CLI returns one narrowly recognized absence result.
  - Use stdin-only classic ghp_ PAT login, a unique owner-only Docker config, maximum provenance, and independent remote digest/provenance verification.
  - Remove credentials, metadata, and worktree state on success, failure, or signal; cleanup failure overrides success.
  - Exercise every external executable through synthetic command capture without registry or network mutation.
selected_docs:
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
  - https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
  - https://docs.docker.com/reference/cli/docker/login/
  - https://docs.docker.com/reference/cli/docker/buildx/build/
  - https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/
  - https://docs.docker.com/build/metadata/attestations/slsa-provenance/
  - https://docs.docker.com/build/building/variables/
  - https://docs.github.com/en/enterprise-cloud/latest/authentication/keeping-your-account-and-data-secure/about-authentication-to-github
selected_skills:
  - senior-devops
  - test-driven-development
  - systematic-debugging
  - verification-before-completion
  - receiving-code-review
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
  - 'focused Vitest publisher contract: passed (19/19)'
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
  - mc2-jz6y0.13.9 - Docker/GHCR exposes no atomic compare-and-create tag operation here; publication requires one externally serialized publisher, and concurrent invocations retain a preflight-to-push race.
---

# Summary

Implemented a local build-only publisher that refreshes and verifies the canonical pushed commit, creates a clean detached worktree, logs in to GHCR through stdin using an isolated mode-`0700` Docker config, and invokes Buildx exactly once for `qdrant-operator` on `linux/amd64`. The canonical package remains `ghcr.io/maslennikov-ig/mc-2/qdrant-operator`; the independently validated `--github-user` is only the login actor and cannot rewrite the package target.

After isolated login, the publisher inspects the exact full-SHA tag before build/push. A successful inspect is treated as an existing tag; a failed inspect proceeds only for one of two exact, empty-stdout CLI outcomes (`manifest unknown` or `not found` for the exact tag). Authentication, network, malformed, and otherwise ambiguous failures stop before build. This is a fail-closed overwrite guard, not an atomic registry immutability guarantee: callers must serialize publication because two concurrent publishers can both pass preflight before either pushes.

The publisher binds the full SHA as tag and OCI revision, requests `--provenance=mode=max`, and parses Buildx metadata as JSON. Both local `buildx.build.provenance` and remote `docker buildx imagetools inspect <repository>@<digest> --format '{{ json .Provenance.SLSA }}'` must be non-null BuildKit SLSA objects with the exact canonical source and accepted revision plus max-mode Dockerfile source evidence. The independently inspected tag digest must equal the metadata digest before remote provenance is accepted.

Initial RED was observed with the publisher absent: 8/8 focused tests failed for the expected missing-file reason. The independent-review RED cycle then produced 13 expected failures while 6 prior contracts remained green. It closed tag replacement, ambiguous preflight, token-class, unterminated-stdin, structured provenance, canonical package/login-actor separation, and state-creation signal gaps. Final GREEN is 19/19.

# Scope / Routing

The implementation is confined to the assigned publisher, focused test, and this artifact. No workflow, Compose file, Dockerfile, deploy script, package metadata, or durable documentation changed. The approved design hash remained `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`.

Official contracts were rechecked on 2026-07-13. GitHub documents classic PATs with the `ghp_` prefix and distinguishes fine-grained (`github_pat_`) and GitHub App (`ghu_`/`ghs_`) credentials; the publisher enforces the classic prefix without a fixed length, while the actual push remains the scope/authorization proof. Docker documents isolated CLI config storage, Buildx metadata, `BUILDX_METADATA_PROVENANCE=max` (Buildx 0.14+), `--provenance=mode=max`, and the exact remote SLSA inspection shape used here. The current provenance reference documents `metadata["https://mobyproject.org/buildkit@v1#metadata"].vcs.source`, `.vcs.revision`, and max-mode `source.infos`; these are the parsed fields. Observed local versions were Git `2.53.0`, Docker CLI `29.5.3`, and Buildx `v0.34.1-desktop.1` (`c79576280a671664e17eb68da98ec3136b614aed`).

Graphify was reviewed with the integration graph report and a focused query for the qdrant-operator Docker target/runtime tests (`graph-reviewed: used`). No worker graph refresh, external model/API backend, or Git hooks were used.

# Verification

- Focused Vitest: 1 file, 19/19 tests passed. Every publisher external executable was routed through synthetic command capture; no real Docker login, build, push, registry inspection, or Git fetch occurred.
- Leak and residue coverage scanned classic and rejected synthetic credentials across captured argv, stdout, stderr, logs, and fixture trees after success, preflight failures, provenance failures, ordinary failure, signals on both sides of state creation, helper injection, digest mismatch, and cleanup failure; zero matches and zero run-state residue.
- Bash syntax passed.
- Course platform type-check passed, including required shared package builds.
- Artifact validation passed with `artifact validation OK`.

# Delivery / Cleanup

The branch is returned for orchestrator review and is not accepted or integrated. Worker cleanup remains pending orchestrator acceptance under the repository contract.

# Risks / Follow-ups / Explicit Defers

The real GHCR mutation remains deferred. It requires a current classic PAT with `write:packages`, exact confirmation for the accepted release SHA, and separate observed execution after local review. No real credential was supplied.

Residual product gap: the Docker CLI/GHCR path used here has no atomic “create this tag only if absent” primitive. The strict authenticated preflight prevents ordinary replacement and fails closed on ambiguity, but it cannot eliminate a concurrent-publisher time-of-check/time-of-use race. Production invocation must therefore be single-publisher/exclusive until the surrounding workflow supplies a registry-backed lock or another atomic publication protocol.
