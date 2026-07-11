---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.7
stage_id: mc2-jz6y0
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Q6 crosses secret transport, container startup, Compose topology, deployment ordering, local recovery configuration, and RAG availability gates.
repo: /home/me/code/mc2
branch: codex/qdrant-q6-runtime
base_branch: codex/self-hosted-qdrant-platform
base_commit: 7bc04a14a11f578b5a871ce0ddaff7e35ab18f3d
worktree: /home/me/code/mc2/.worktrees/qdrant-q6-runtime
write_zone:
  - docker-compose.dev.yml
  - docker-compose.infra.yml
  - docker-compose.app.yml
  - docker-compose.production.yml
  - scripts/deploy_dev.sh
  - scripts/deploy_blue_green.sh
  - .env.production.example
  - packages/course-gen-platform/.env.example
  - deploy/qdrant/secret-entrypoint.sh
  - deploy/qdrant/image-lock.json
  - packages/course-gen-platform/tests/unit/ops/qdrant-runtime-contract.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.7.md
success_criteria:
  - Every local runtime Qdrant is exactly Qdrant 1.18.2 pinned by the approved multi-architecture index digest and constrained to linux/amd64 whose approved child digest is registry-verified, with loopback host access, persistent storage, fixed resource limits, disabled telemetry, and prefixed metrics.
  - Qdrant reads admin, read-only, and S3 credentials only from locked-down mounted files through a fail-closed wrapper; health is unauthenticated /readyz over Bash /dev/tcp without curl or added image packages.
  - Dev and staging API, main worker, and Stage 6 use explicit private Qdrant URLs; same-model consumers wait for health; Stage 7 has no Qdrant URL, secret, or dependency.
  - Deploy scripts run readiness, authenticated read-only collections, and full schema/alias verification before recreating any RAG-capable application container, without printing keys.
  - Four Compose models validate from synthetic clean-checkout fixtures, and an actual pinned server proves health plus admin/read-only authorization with no secret in evidence.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - Task 6 in docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - .superpowers/sdd/task-6-brief.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.14-docs.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.14-runtime.md
  - Qdrant 1.18.2 image config and entrypoint at the approved digest
  - https://github.com/qdrant/qdrant/issues/4701 for the maintainer-confirmed nested S3 environment shape
selected_skills:
  - /mnt/c/Users/masle/.codex/superpowers/skills/test-driven-development/SKILL.md
  - /home/me/code/mc2/.agents/skills/senior-devops/SKILL.md
selected_agents:
  - deploy_specialist
catalog_candidates:
  - none - the installed skills, approved decision packets, and pinned tagged image covered the bounded runtime stream
parallel_group: Q6-runtime
depends_on_streams:
  - mc2-jz6y0.14
  - mc2-jz6y0.2
parallel_decision: Q6 ran in its isolated worktree while independent orchestration work remained outside its strict write zone.
status: returned
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Disposable containers, volumes, temporary secret files, and rendered Compose fixtures were removed. Final independent review passed with no findings; integration merge f7930913 and the integration 8/8/process rerun passed. The dedicated worktree and local branch were removed after the pushed integration bookkeeping commit; the remote evidence branch is retained.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: Both tracked environment examples now make self-hosted private URLs, logical/physical names, secret-file paths, S3 identifiers, and the external-URL prohibition explicit. The full operator runbook remains Q9/Q10-owned.
graph_reviewed: blocked
graph_review_notes: graphify-out/GRAPH_REPORT.md was not present in this isolated child worktree. The accepted .14 runtime packet supplied focused architecture evidence; no broad architecture search or child refresh was performed. Parent integration owns the required local-only graph refresh.
verification:
  - TDD RED/GREEN qdrant-runtime-contract.test.ts: initial 8/8 expected failures, then 8/8 pass; retained-Docker-Cmd, custom secret-path, and reviewer platform/registry-contract RED cycles each failed 1/8; final GREEN passed 8/8.
  - The committed focused test creates mode-0400 synthetic secrets and one synthetic env fixture, then iterates all four COMPOSE_FILES through full render and config --no-env-resolution; 8/8 Compose validations passed and no mounted secret value appeared in a render.
  - The deterministic focused contract ties all three Compose image/platform declarations to deploy/qdrant/image-lock.json and its linux/amd64 child sha256:da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071: passed.
  - Separate docker buildx imagetools inspect --raw plus jq selection on the approved tag@index pin returned the exact locked linux/amd64 child digest: passed.
  - bash -n scripts/deploy_dev.sh scripts/deploy_blue_green.sh deploy/qdrant/secret-entrypoint.sh: passed.
  - Disposable pinned Qdrant smoke: healthy; /readyz 200 unauthenticated; /collections 401 unauthenticated and 200 read-only; read-only mutation 403; admin create/delete 200/200; no keys in logs or inspect; cleanup rc 0.
  - pnpm --filter @megacampus/course-gen-platform type-check: passed.
  - pnpm --filter @megacampus/course-gen-platform build: passed; dist/shared/qdrant/create-collection.js exists after the package build.
  - scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.7.md: passed.
  - scripts/orchestration/run_process_verification.sh --artifact .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.7.md: passed.
  - git diff --check: passed.
changed_files:
  - docker-compose.dev.yml
  - docker-compose.infra.yml
  - docker-compose.app.yml
  - docker-compose.production.yml
  - scripts/deploy_dev.sh
  - scripts/deploy_blue_green.sh
  - .env.production.example
  - packages/course-gen-platform/.env.example
  - deploy/qdrant/secret-entrypoint.sh
  - deploy/qdrant/image-lock.json
  - packages/course-gen-platform/tests/unit/ops/qdrant-runtime-contract.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.7.md
explicit_defers:
  - Q8 owns automated snapshots, retention, restore drills, checksum manifests, recovery metrics, and systemd timers; Q6 only supplies native S3 runtime mapping.
  - Q9 owns Prometheus 3.13.1 LTS, Grafana 12.4.5 extended support, node_exporter 1.12.0, Alertmanager 0.33.1, dashboards, alerts, and the operator runbook.
  - Q10/Q12 must copy and validate the new deploy/qdrant asset; Q12 deployment, secret creation/change, live reindex, service activation, traffic switching, and every staging/production mutation remain forbidden without separate current-task authorization.
---

# Summary

Q6 replaces every runtime `qdrant/qdrant:latest` occurrence with the owner-approved `v1.18.2@sha256:75eab8c4...` index pin and declares `platform: linux/amd64`. A tracked deterministic image lock binds that platform to approved child manifest `sha256:da65a06b...`; a separate registry inspection proved the lock without making ordinary unit tests depend on Docker Hub/buildx availability. Dev publishes only `127.0.0.1:6333`, persists `megacampus_qdrant-dev`, and enforces 1 CPU/1 GiB. Staging/full-production publish only `127.0.0.1:6335`, persist `megacampus_qdrant`, and enforce 2 CPU/2 GiB. All three models disable anonymous telemetry, set `qdrant_` metrics prefix, and deliberately do not enable the unverified hardware-reporting suggestion.

The tracked wrapper reads admin/read-only key files and, for staging, S3 access/secret files. It refuses missing, empty, multiline, group/world-readable, or otherwise unreadable inputs without printing values, exports only Qdrant's documented nested variables inside PID 1's process environment, then executes the stock `/qdrant/entrypoint.sh`. Because Docker retains the image `Cmd` when Compose replaces `Entrypoint`, the wrapper explicitly removes the default `./entrypoint.sh` token rather than forwarding it to the Qdrant binary. Its health mode performs a Bash-builtin HTTP request over `/dev/tcp` to unauthenticated `/readyz` and requires status 200; the pinned image contains no curl/wget/nc dependency.

Compose secrets are local bind-backed files in this topology. The fail-closed permission check therefore requires each source key file to exist on the host with mode `0400`; synthetic full renders and the pinned smoke used that exact mode. The rendered Compose models expose only file paths, never file contents. Q9 must keep the read-only Prometheus credential independently readable by its service identity rather than weakening this Qdrant server file.

Dev API/main/Stage 6 now use `http://qdrant-dev:6333` and healthy dependencies. Staging blue/green API plus staging/full-production main and Stage 6 use `http://qdrant:6333`; only same-model services declare dependencies. Every Stage 7 service remains free of Qdrant URL, secret, and dependency wiring. Native S3 snapshot storage receives bucket, region, optional endpoint URL, and access/secret values through the wrapper; dev explicitly retains local snapshot storage.

Both deployment scripts now gate application recreation in this order: unauthenticated readiness, authenticated read-only `/collections`, then schema/alias verification. The verifier command runs the package-built `dist/shared/qdrant/create-collection.js --verify-only`; this is the compiled production equivalent of the `qdrant:verify` tool and its path was proved after a fresh package build. Secret paths are resolved from an explicitly exported override first, then the same Compose `--env-file`, then the documented default, so the HTTP/verifier gate cannot read a different key file from the Qdrant service. Infrastructure startup is service-selective so it cannot recreate the main RAG worker before the gate. Script messages name only the endpoint class or service and never print headers, keys, credential-bearing URLs, or command traces.

# Verification

## TDD chronology

- Initial RED produced eight intentional failures for stale image/tag, missing staging service and wrapper, unsafe environment injection, service-started dependencies, absent S3 mapping, late/incomplete deploy gates, Cloud defaults, and non-renderable clean-checkout models.
- First GREEN passed all eight focused tests after implementing the minimal runtime contract.
- The first pinned smoke exposed Qdrant's actual unauthenticated `/collections` status as 401 rather than the provisional 403 expectation; authorization remained fail-closed and no production change was needed.
- Inspection of the pinned image then exposed retained Docker `Cmd=./entrypoint.sh`. A new RED failed one of eight tests; GREEN strips only that exact default token and keeps operator-supplied Qdrant arguments intact.
- Final self-review found that Compose honored custom secret-file paths from `--env-file` while the Bash gate only saw exported/default paths. A third RED failed one of eight tests; GREEN resolves both consumers from the same file-path contract without sourcing or executing the environment file.
- Reviewer follow-up proved the committed Compose test exercised only dev despite its four-model name and did not bind the runtime architecture to the approved child manifest. RED kept the new real four-model synthetic render green but failed 1/8 on missing `platform`; GREEN added linux/amd64 to all three services. A reliability follow-up removed the registry network call from the ordinary unit test: RED failed 1/8 on the missing tracked lock, then GREEN bound Compose to `deploy/qdrant/image-lock.json`; the exact child mapping was verified separately against the registry.
- Final focused result is 8/8. Synthetic Compose validation is 8/8 across full render and `--no-env-resolution`. The pinned server reached Docker `healthy`; read-only and admin capabilities were proven separately, and all disposable resources were removed.

# Risks / Follow-ups / Explicit Defers

Q6 does not claim snapshot recoverability or monitoring delivery. Native S3 mapping is only the runtime prerequisite: Q8 must prove snapshot/restore/checksum/alias/relevance behavior, and Q9 must prove authenticated scraping, durable application metrics, eight alert sources, Grafana provisioning, and notification delivery. The same-host private HTTP exception remains bounded to loopback/private Docker networking; any external or cross-host endpoint is unsupported until the security runbook's TLS gate is satisfied.

The application still consumes its established `QDRANT_API_KEY` runtime variable; the new file-only wrapper specifically prevents Compose interpolation of Qdrant server and S3 secret values. No real credential, remote service, deployment command, SSH session, staging endpoint, Cloud endpoint, traffic switch, live reindex, or Q12 action was used.
