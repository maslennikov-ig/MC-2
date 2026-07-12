---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.5
stage_id: mc2-jz6y0
agent_type: deploy_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: snapshot durability, credential isolation, restore safety, and production deferral are high-risk operational contracts
repo: mc2
branch: codex/q12-local-snapshots
base_branch: codex/self-hosted-qdrant-platform
base_commit: 52269005
worktree: /home/me/code/mc2/.worktrees/q12-local-snapshots
write_zone:
  - docker-compose.infra.yml
  - deploy/qdrant/secret-entrypoint.sh
  - deploy/systemd/megacampus-qdrant-snapshot.service
  - packages/course-gen-platform/tools/qdrant/snapshot.ts
  - packages/course-gen-platform/tools/qdrant/snapshot-recovery.ts
  - focused Qdrant recovery tests and integration
  - .env.production.example
  - packages/course-gen-platform/.env.example
  - docs/operations/qdrant-self-hosted.md
  - this artifact
success_criteria:
  - staging local mode requires no S3 configuration or credential mount
  - local manifest records local mode and no remote object or URI
  - isolated exact-version checksum/count/RU/EN/Formula/isolation restore remains intact
  - S3 remains an explicit fail-closed production mode and off-host DR is not claimed
  - timers remain opt-in until both manual oneshots and cleanup pass
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md (staging snapshot location superseded only by owner decision)
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - docs/operations/qdrant-self-hosted.md
  - accepted first-party Qdrant 1.18.2 references already recorded in the runbook
selected_skills:
  - senior-devops
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - deploy_specialist
catalog_candidates:
  - none - installed skills and accepted repository contracts cover this stream
parallel_group: Q12-owner-input-recovery
depends_on_streams:
  - mc2-jz6y0.13.2
parallel_decision: parallel
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: implementation and review worktrees/local branches, dependency symlinks, pinned-Qdrant containers, named volumes, listeners, temporary keys, and recovery data were removed; pushed evidence branches remain
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: runbook records the staging-only tradeoff, manual-first schedule, lack of off-host RPO/DR, and production gate
graph_reviewed: blocked
graph_review_notes: parent integration owns the safe local Graphify refresh after merge
verification:
  - focused recovery/runtime Vitest RED: passed (6 expected failures, 31 existing passes)
  - focused recovery/runtime Vitest GREEN: passed 37/37
  - pinned Qdrant 1.18.2 local snapshot/restore integration: passed 5/5
  - pinned wrapper local-only boot and S3 fail-closed smoke: passed
  - staging Compose local render without S3 inputs: passed
  - recovery systemd rootless namespace verification: passed
  - package type-check: passed
  - artifact validation, Markdown validation, and process verification: passed
  - Q12-LR1 persistence regression RED: passed (3 expected failures, 5 existing passes)
  - Q12-LR1 focused recovery/runtime GREEN: passed 37/37
  - pinned wrapper named-volume replacement and negative deletion recovery: passed 7/7
  - corrected package type-check: passed
  - managed transport isolation RED on Docker-selected port 41352: passed (expected 6/7)
  - managed transport isolation GREEN on Docker-selected port 40776: passed 7/7
  - integration-root managed transport on Docker-selected port 41262: passed 7/7
  - integration-root workspace type-check: passed
  - integration-root CI/CD workflow gate and process verification: passed
changed_files:
  - .env.production.example
  - deploy/qdrant/secret-entrypoint.sh
  - deploy/systemd/megacampus-qdrant-snapshot.service
  - docker-compose.infra.yml
  - docs/operations/qdrant-self-hosted.md
  - packages/course-gen-platform/.env.example
  - packages/course-gen-platform/tests/integration/qdrant-snapshot-restore.test.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-runtime-contract.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/recovery-systemd.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/restore-drill.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/snapshot.test.ts
  - packages/course-gen-platform/tools/qdrant/snapshot-recovery.ts
  - packages/course-gen-platform/tools/qdrant/snapshot.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5.md
explicit_defers:
  - mc2-jz6y0.13.6 - mandatory production gate for HTTPS off-host S3-compatible snapshots, lifecycle, restore drill, alerts, and rollback evidence
---

# Summary

The owner-approved development-staging recovery mode now keeps Qdrant 1.18.2
snapshots in the persistent `qdrant-data` volume and does not mount, read, copy,
or require S3 credentials. Local manifests identify `storage_mode: local` and
omit `remote_object`; restore still uses the authenticated Qdrant transport into
an isolated collection and never mutates the stable alias.

The compromise is explicit: local snapshots protect against collection and
operator mistakes but not loss of the host, disk, volume, or datacenter. They do
not satisfy off-host RPO/DR. Production remains gated by `mc2-jz6y0.13.6`.

# Scope / Routing

This was a dedicated deployment stream with a strict Qdrant recovery write
zone. The orchestrator explicitly expanded the zone only for the snapshot and
restore systemd service contracts and their focused tests. No staging host,
service, secret, database, queue, alias, volume, registry, or notification was
mutated.

# Verification

The TDD RED run produced six requirement-specific failures: staging still used
S3, systemd hardcoded S3, the runbook lacked the manual-first wording, local
manifest construction required a remote prefix, explicit storage-mode parsing
was absent, and local retention failed without a remote object. The GREEN run
passed 37/37 focused unit/runtime tests.

An exact pinned
`qdrant/qdrant:v1.18.2@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c`
container passed the five-test local snapshot/restore suite. The suite proved a
streamed checksum, manifest without `remote_object`, exact point count, dense,
RU/EN BM25, Formula priority, negative tenant/course isolation, stable-alias
immutability, intentional mismatch failure, and owned-resource cleanup. The
container, listener, and temporary recovery directory were absent afterward.

The same pinned image booted through `secret-entrypoint.sh` in local mode with
only admin/read-only file secrets. A separate S3-mode invocation without bucket
configuration exited nonzero before Qdrant startup with the expected redacted
error. Synthetic staging Compose rendered with explicit `local` mode and no S3
input or rendered S3 key. Package type-check, rootless `systemd-analyze verify`,
artifact validation, Markdown validation (repository-compatible MD013/MD025
exclusions), and process verification all exited zero.

# Delivery / Cleanup

The implementation and correction reviews are accepted and integrated; all
owned worktrees, local branches, containers, volumes, listeners, keys, and
temporary recovery data are cleaned. The pushed evidence branches remain.
Only the parent-owned Graphify refresh remains pending after this durable docs
update.

# Risks / Follow-ups / Explicit Defers

- Local snapshots share the staging server failure domain with live Qdrant.
- `mc2-jz6y0.13.6` is a hard production launch gate, not an optional polish item.
- The parent integration workflow must emit
  `QDRANT_SNAPSHOT_STORAGE_MODE=local` into the staging environment; this stream
  does not own `.github/workflows/ci-cd.yml`.

# Correction Q12-LR1

The independent review of `ac494372` is immutable at review commit `6326769d`,
artifact `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5-review.md`, and parent
integration commit `146429bc`. It correctly found that pinned Qdrant 1.18.2
defaults local snapshots to `/qdrant/snapshots`, while the original staging
Compose persisted only `/qdrant/storage`.

The correction explicitly sets
`QDRANT__STORAGE__SNAPSHOTS_PATH=/qdrant/storage/snapshots` in both rendered
staging Compose and the fail-closed local wrapper branch. The S3 branch removes
that local-path override. A managed pinned-wrapper integration now creates a
checksummed snapshot on an owned named volume, replaces the container without
deleting the volume, and executes the existing exact isolated restore checks.
Its negative control deletes the owned volume, recreates an empty stable
collection/alias, and requires the drill to emit durable failed evidence and a
failure metric rather than success.

Q12-LR1 TDD evidence is exact. Before the fix, the focused runtime contract
reported three expected failures: the wrapper lacked a persistent snapshot
path, staging Compose lacked it, and rendered Compose returned no path inside a
volume mount. After the fix, the four-file focused suite passed 37/37.

The managed pinned-wrapper recovery suite passed 7/7. It created the snapshot
with the exact Qdrant 1.18.2 image and file-secret wrapper, preserved the named
volume while replacing the container, re-listed the same snapshot checksum,
and then passed count, dense, RU/EN BM25, Formula ordering, negative
tenant/course isolation, stable-alias immutability, and owned cleanup. The final
negative test deleted the owned named volume, recreated an empty verified
stable collection/alias, and proved the old manifest produced `status: failed`,
incremented `restoreFailuresTotal`, kept `lastOperationSuccess=false`, and did
not mutate the stable alias. All owned containers, volume, listeners, temporary
credentials, recovery directories, and dependency symlinks were removed after
verification.

## Managed transport isolation correction

A later orchestrator check found that the managed recovery test still hardcoded
`http://127.0.0.1:6333` in five transport call sites. Although this address is
Qdrant's own loopback from the server-side recovery perspective, it did not
prove that the test honored its owned endpoint and made the host-side test
contract ambiguous while unrelated `helixa-qdrant-1` listened on host port 6333.

The test now requires a credential-free HTTP origin in
`QDRANT_SNAPSHOT_TRANSPORT_URL` and uses it for every recovery location. Managed
containers receive only the explicit `host.docker.internal:host-gateway` route.
Docker chooses the owned host port atomically for the initial container through
`-p 127.0.0.1::6333`; the harness reads that assignment with
`docker port <owned-name> 6333/tcp`, validates it is numeric and not 6333, and
reuses it across controlled replacement.

The RED run used Docker-selected port `41352`: 6/7 passed and the only expected
failure proved `recoverSnapshot.location` still received the hardcoded 6333 URL
instead of `http://host.docker.internal:41352`. The GREEN run used a fresh
Docker-selected port `40776` and passed 7/7, including an assertion on the exact
owned recovery location, replacement persistence, full relevance/isolation,
negative volume deletion, and cleanup. Exact owned container/volume/port/tmp
matches were zero afterward. Read-only inspection showed `helixa-qdrant-1`
remained continuously up on host 6333/6334; no command targeted or mutated it.
