# Q12 Live Cutover Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, independently review, and locally verify the sole fail-closed Q12 staging-cutover system defined by the owner-approved correction specification, without touching GHCR, the server, Supabase, Qdrant Cloud, staging, or production during implementation.

**Architecture:** Five isolated streams implement the backup/restore boundary, build-only operator publisher, ten-writer/database barrier, migration credential contract, and quiesce-aware blue/green handoff. Root then joins only accepted commits into a frozen manifest-driven supervisor whose journal, capabilities, rollback boundaries, smoke checks, and observation gate are testable without live mutation. TDD evidence and a separate independent review are required for every stream before integration.

**Tech Stack:** Bash 5, TypeScript, Node.js 22, pnpm, Vitest, Docker/Compose/Buildx, PostgreSQL 17 client tools, systemd units, canonical JSON/SHA-256, Git worktrees, Beads, Graphify.

## Global Constraints

- Binding design: `docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md`, SHA-256 `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`, owner-approved 2026-07-13.
- Qdrant stays pinned to `1.18.2`; Qdrant Cloud is never read, recovered, or mutated.
- Restore image is `public.ecr.aws/supabase/postgres:17.6.1.064`, OCI index `sha256:4c6d67181e482549bab276e8ae933f807be59ea1c371c225d85c189b0c14b9de`, linux/amd64 child `sha256:d00c45c73f9c3d130ea4f379d8ae7748b0711d628eea690d27d03198ed609f2f`.
- Source identity is PostgreSQL `17.6`, project `diqooqbuchsliypgwksu`, database `postgres`, migration frontier `20260704150249`.
- CA SHA-256 is `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`; credentials/capabilities never appear in argv, environment, Git, artifacts, logs, telemetry, Docker inspect output, or test snapshots.
- Development staging uses persistent local-disk backup/snapshot generations; off-host S3 remains deferred to production task `mc2-jz6y0.13.6`.
- The database write barrier spans backup, restore drill, migration, recovery, reindex, Qdrant verification, handoff, activation, smoke, and observation.
- The ten-writer set is exactly active production API/Web, three production workers, development API/Web, and three development workers; unrelated services are never stopped.
- Source recovery must finish at exactly `234 recoverable + 6 audited_failed`; reindex must verify exactly `12,114` Qdrant points.
- Courses without documents remain behavior-compatible; document evidence remains supplemental, conflict-explicit, baseline-first in Stage 5, and decision-aware in Stage 6.
- No stream may deploy, publish a registry image, migrate a live database, copy server sources, reindex live data, rotate a password, or mutate staging/production.
- A live retry after any terminal result requires password rotation; rotation is separately authorized and tracked by `mc2-jz6y0.13.8`.
- Every code change follows RED → observed expected failure → minimal GREEN → refactor; every stream commits and pushes only its dedicated `codex/` branch.

## File Ownership Map

| Stream | Owns                                                                                                                                                                                                                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G7     | `deploy/postgres/**`, `deploy/systemd/megacampus-supabase-backup.*`, `packages/course-gen-platform/tests/unit/ops/supabase-{backup,restore,schedule}*.test.ts`, Q12 backup/restore operations prose explicitly assigned in its brief                                                                        |
| P      | `deploy/qdrant/publish-qdrant-operator.sh`, `packages/course-gen-platform/tests/unit/ops/qdrant-operator-publisher.test.ts`                                                                                                                                                                                 |
| W      | `deploy/qdrant/source-recovery-run.sh`, `deploy/qdrant/q12-database-barrier.sh`, `packages/course-gen-platform/tools/qdrant/source-recovery-{database,reindex-adapters}.ts`, `reindex-course-embeddings.ts`, `packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh`, their exact focused tests |
| M      | both `packages/course-gen-platform/scripts/migrations/document-evidence-*.ts`, Q12 migration credential/guard tests                                                                                                                                                                                         |
| H      | `scripts/deploy_blue_green.sh`, `scripts/rollback_blue_green.sh`, `scripts/ci/test_blue_green_fail_closed.sh`, focused Q12 handoff tests                                                                                                                                                                    |
| Root   | `deploy/qdrant/q12-{live-cutover,capability-run,live-smoke}.sh`, `deploy/qdrant/q12-command-manifest.json`, Q12 supervisor tests, integration docs, stage artifacts, Beads, Graphify, final verification                                                                                                    |

## Parallel Decomposition Matrix

| Stream | Goal                                                                                                       | Agent                                                      | Write zone     | Dependencies                                 | Verification                                                                                              | Model/reasoning                                                              | Decision        | Reason                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| G7     | Atomic four-file shared-snapshot backup, Supabase-compatible exact restore, replacement timer              | visible DevOps worker, then correctness reviewer           | G7 row above   | approved spec only                           | backup/restore/schedule Vitest, Bash syntax, real-archive opt-in drill                                    | inherited model, high reasoning for backup/data-loss boundary                | parallel wave 1 | disjoint files and independent restore loop; specialist and write-isolation benefit |
| P      | Local build-only exact-SHA Qdrant operator publication                                                     | visible DevOps worker, then security/correctness reviewer  | P row above    | approved spec only                           | publisher Vitest, shell syntax, command capture and secret scan                                           | inherited model, high reasoning for registry credentials/supply chain        | parallel wave 1 | smallest independent critical path and isolated mutation surface                    |
| W      | Exact ten-writer quiesce plus durable database guard/capability adapters                                   | visible runtime/database worker, then correctness reviewer | W row above    | approved spec plus observed host inventory   | runtime/database/adapter tests, Compose fixtures, crash matrix                                            | inherited model, high reasoning for concurrency/database isolation           | parallel wave 1 | independent write zone; largest context-isolation and specialist benefit            |
| M      | File-only migration credentials and same-transaction guard publication                                     | visible database worker, then security reviewer            | M row above    | frozen W database-capability/guard interface | migration unit/integration tests and secret scans                                                         | inherited model, high reasoning for migrations/security                      | parallel wave 2 | starts only after W interface acceptance; otherwise disjoint                        |
| H      | Prepare/commit/finalize/rollback handoff under external quiesce                                            | visible deployment worker, then correctness reviewer       | H row above    | frozen W lease/quiesce interface             | normal and Q12 fail-closed shell fixtures                                                                 | inherited model, high reasoning for release/rollback state machine           | parallel wave 2 | parallel with M after W; disjoint files and verification                            |
| Root   | Frozen supervisor, integration, documentation, local acceptance, then separately authorized live execution | root orchestrator plus final correctness/docs reviewers    | Root row above | accepted G7/P/W/M/H                          | supervisor/capability/smoke tests, full local gates, canonical closeout; live observation only after gate | inherited model, xhigh-equivalent session reasoning for integration/security | sequential join | owns shared manifest and prevents cross-stream write conflicts                      |

---

### Task 1: G7 — Atomic Backup Generation, Exact Restore, and Replacement Schedule

**Files:**

- Modify: `deploy/postgres/backup-supabase.sh`
- Create: `deploy/postgres/restore-supabase-drill.sh`
- Create: `deploy/postgres/q12-source-manifest.ts`
- Create: `deploy/postgres/generate-role-bootstrap.ts`
- Create: `deploy/postgres/scheduled-backup-run.sh`
- Create: `deploy/postgres/install-supabase-backup-schedule.sh`
- Create: `deploy/systemd/megacampus-supabase-backup.service`
- Create: `deploy/systemd/megacampus-supabase-backup.timer`
- Modify: `packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts`
- Create: `packages/course-gen-platform/tests/unit/ops/supabase-restore-drill.test.ts`
- Create: `packages/course-gen-platform/tests/unit/ops/supabase-backup-schedule.test.ts`
- Modify: `docs/operations/qdrant-self-hosted.md` only for accepted backup/restore/schedule operator truth

**Interfaces:**

- Consumes: absolute owner-only DB URL/CA/capability paths; the exported PostgreSQL snapshot; exact PG17 clients; fixed image index/child digests.
- Produces: immutable `generation-<UTC>-<run-id>/` containing custom archive, password-free roles, `source-manifest.json`, `checksums.json`; atomic `latest.json`; `restore-supabase-drill.sh`; schedule installer and units.

- [ ] **Step 1: Add RED backup-generation tests.** Assert one exported snapshot is shared by dump and manifest, before/after normalized roles hashes must match, stderr allowlist is empty, all four files are required, publication is `RENAME_NOREPLACE`, a post-generation/pre-pointer failure retains evidence, pointer races never mix generations, retention never removes latest/unpointed incident/incomplete evidence, and no synthetic secret reaches output or artifacts.
- [ ] **Step 2: Run RED.** Run `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/ops/supabase-backup-operator.test.ts`; expected: new generation/snapshot/roles/pointer assertions fail against the existing single-dump operator.
- [ ] **Step 3: Implement the minimal atomic backup core.** Use a unique same-filesystem mode-`0700` generation directory, mode-`0600` files, direct PG17 tools, owner-only stderr files, explicit commit state, file/directory fsync, no-replace directory rename, and atomic `latest.json` replacement. Never execute the raw roles export.
- [ ] **Step 4: Run backup GREEN.** Re-run the command from Step 2; expected: all focused cases pass with zero leaked synthetic credentials and no temporary generation residue.
- [ ] **Step 5: Add RED restore/role-bootstrap tests.** Cover stock-image missing-role failure, exact extension drift, allowlisted missing roles only, membership grantor/options, role settings allowlist, database/extension owner and ACL equality, direct `supabase_admin` restore actor, direct synthetic `postgres` cleanup actor, fixed `default_transaction_read_only=off`, capability `set_config(..., false)`, single transaction, cron overrides, baseline cleanup, and cleanup-failure precedence.
- [ ] **Step 6: Run restore RED.** Run `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/ops/supabase-restore-drill.test.ts`; expected: missing entrypoint/bootstrap/manifest behavior fails.
- [ ] **Step 7: Implement minimal restore and manifest generators.** Pin the exact linux/amd64 child digest, use one internal network/kernel loopback port/explicit PG17 `pg_restore`, restore as direct `supabase_admin`, compare cutover then baseline manifests, and remove every captured container/network/volume/secret/temp resource on all exits.
- [ ] **Step 8: Run restore GREEN and the opt-in real archive fixture.** Run the focused Vitest command; when the owner-only diagnostic archive is present, run only the test's documented opt-in command and record archive hash, target digest, elapsed restore, equality result, and zero residue without copying the archive into Git.
- [ ] **Step 9: Add RED scheduler tests.** Assert the service/timer exact values, distinct locks, refusal during Q12, `Europe/Amsterdam`, `Persistent=true`, observed catch-up/no duplicate, timer enable only after backup+restore success, and no legacy-cron restoration.
- [ ] **Step 10: Run scheduler RED.** Run `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/ops/supabase-backup-schedule.test.ts`; expected: missing units/wrappers/installer fail.
- [ ] **Step 11: Implement units, scheduler wrapper, and fixed-hash installer.** Keep the scheduler wrapper outside the Q12 command surface and accept no URI/capability/command overrides.
- [ ] **Step 12: Run G7 GREEN.** Run all three G7 files together, `bash -n deploy/postgres/*.sh`, and the repository formatter on changed files; expected: zero failures and zero residue.
- [ ] **Step 13: Write the G7 artifact, commit, and push.** Validate the artifact, commit with a conventional message, push the dedicated branch, and return only commit(s), totals, artifact path, and concerns.

### Task 2: P — Build-only Exact-SHA Qdrant Operator Publisher

**Files:**

- Create: `deploy/qdrant/publish-qdrant-operator.sh`
- Create: `packages/course-gen-platform/tests/unit/ops/qdrant-operator-publisher.test.ts`

**Interfaces:**

- Consumes: full 40-hex reachable/pushed Git SHA, exact confirmation, GHCR package-write token via stdin only.
- Produces: one immutable linux/amd64 full-SHA tag, Buildx provenance metadata, independently verified remote digest; no deployment side effect.

- [ ] **Step 1: Write RED command-capture tests.** Cover invalid/unreachable/unpushed SHA, dirty/inherited Docker credentials, incorrect confirmation, stdin-only login, unique `0700` Docker config and `0600` config file, only `qdrant-operator` target, linux/amd64, full-SHA tag, provenance max, independent digest inspection, signal/failure cleanup, and cleanup failure overriding success.
- [ ] **Step 2: Run RED.** Run `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/ops/qdrant-operator-publisher.test.ts`; expected: missing publisher fails.
- [ ] **Step 3: Implement minimal publisher.** Create a clean detached worktree at the requested SHA, use a minimal environment and unique Docker config, consume token through `docker login --password-stdin`, build/push only the existing target, compare recorded and inspected digests, logout, and prove all temporary state is gone.
- [ ] **Step 4: Run GREEN and leak scans.** Re-run the focused test, `bash -n deploy/qdrant/publish-qdrant-operator.sh`, and scan captured argv/stdout/stderr/temp trees for the synthetic token; expected: all pass and no token match.
- [ ] **Step 5: Write artifact, commit, and push.** Do not run a real login/build/push; real GHCR publication remains a separately observed mutation after local acceptance.

### Task 3: W — Ten-writer Quiesce, Database Barrier, and Capability-bound Adapters

**Files:**

- Modify: `deploy/qdrant/source-recovery-run.sh`
- Create: `deploy/qdrant/q12-database-barrier.sh`
- Modify: `packages/course-gen-platform/tools/qdrant/source-recovery-database.ts`
- Modify: `packages/course-gen-platform/tools/qdrant/source-recovery-reindex-adapters.ts`
- Modify: `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts`
- Modify: `packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh`
- Modify: `packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-database-barrier.test.ts`
- Modify: focused source-recovery database/reindex/crash-matrix tests

**Interfaces:**

- Consumes: exact ten-writer Compose inventory, run ID, external quiesce manifest/held lock FD, owner-only database capability file.
- Produces: immutable writer inventory/quiesce manifest, durable guard/baseline/cron/default state, exact resume/rollback state, `x-q12-capability` support only for bound Q12 recovery/reindex operations.

- [ ] **Step 1: Write RED writer inventory/quiesce tests.** Model active blue/green alternatives, exact development services, absent/duplicate/recreated/restarting/unhealthy containers, immutable IDs/labels/images/restart policies, Web/API-first inbound shutdown, bounded worker stop, exact `502|503` SNI checks, unrelated-service preservation, partial-policy crash/reboot, standalone resume order, and external-quiesce no-start/no-stop behavior.
- [ ] **Step 2: Run writer RED.** Run `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/ops/qdrant-source-recovery-runtime.test.ts`; expected: current systemd-oriented assumptions or missing Compose backend fail the new exact fixtures.
- [ ] **Step 3: Implement the minimal local-Compose backend.** Reject remote contexts and name-substring inference, capture immutable identities before mutation, persist restart=`no` before stop, and restore only exact previously-running IDs in standalone mode.
- [ ] **Step 4: Run writer GREEN.** Re-run the focused runtime test and existing source-recovery acceptance/crash tests; expected: exact state and no unrelated Docker operations.
- [ ] **Step 5: Write RED database-barrier tests.** Cover deterministic all-at-once table locks, baseline capture after locks, exact `q12_guard` owner-only ACL/no sequences, row/TRUNCATE partition triggers, service-role header and direct capability rules, eight cron rows, empty pg_net, read-only default, session termination, PostgREST/Auth/Storage/Cron/pg_net rollback probes, same-transaction extension to newly migrated tables, verify-only post-migration commands, activation cleanup, and zero residue.
- [ ] **Step 6: Run barrier RED.** Run `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/ops/q12-database-barrier.test.ts`; expected: missing barrier entrypoint fails.
- [ ] **Step 7: Implement the minimal barrier entrypoint.** Use fixed subcommands (`install`, `verify-extended`, `activate`, `rollback`, `cleanup`), exact expected catalog input, file-only connection/capability paths, generated fully quoted deterministic lock/trigger SQL, owner-only ACL verification, and no learn-from-live repair path.
- [ ] **Step 8: Add RED adapter/entrypoint tests.** Assert only a verified Q12 bind inode/mode/path may be copied into tmpfs and sent as `x-q12-capability`; ordinary calls omit it; raw capability never appears in argv/env/log/inspect/artifacts; tmpfs copy is unlinked after read.
- [ ] **Step 9: Run adapter RED, implement minimal file/FD readers, then GREEN.** Run the exact source-recovery database/reindex adapter tests plus reindex CLI tests before and after implementation.
- [ ] **Step 10: Run W aggregate verification.** Run all changed source-recovery/runtime/barrier/reindex tests, `bash -n` on both scripts, package type-check, and synthetic leak scans; expected: zero failures, no service/container residue.
- [ ] **Step 11: Write artifact, commit, and push.** Include the frozen interface consumed by M/H, exact test totals, and explicit statement that no live writer/database was touched.

### Task 4: M — File-only Migration Credentials and Same-transaction Guards

**Files:**

- Modify: `packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts`
- Modify: `packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts`
- Modify: `packages/course-gen-platform/tests/integration/document-evidence-approved-migrations.test.ts`
- Create: `packages/course-gen-platform/tests/unit/scripts/q12-migration-credentials.test.ts`

**Interfaces:**

- Consumes: W's accepted file/FD validation and `q12_guard` SQL contract; absolute DB URL, CA, and capability paths.
- Produces: Q12-only CLI flags and a field-by-field `pg.ClientConfig` with fixed verified TLS and startup opt-out; new-table guards published in the same transaction before grants.

- [ ] **Step 1: Write RED credential tests.** Reject Q12 env/argv URLs, wrong URI protocol/host/port/database/user, any query/fragment, duplicate keys, multiline values, symlinks/inode swaps/unsafe parents/wrong owner or modes, wrong CA hash, URI-shaped errors, and any use of `connectionString`.
- [ ] **Step 2: Run RED.** Run `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/scripts/q12-migration-credentials.test.ts`; expected: new flags and validation are absent.
- [ ] **Step 3: Implement minimal file-only Q12 configuration.** Open without following symlinks, verify inode/device before and after, parse exact URI fields, build the ClientConfig from fields and CA bytes, prove session/database/server/read-write identity, and call parameterized `set_config(..., false)` on the same client before any migration SQL.
- [ ] **Step 4: Run credential GREEN and leak scan.** Re-run focused tests and scan captured errors/argv/env/logs for the synthetic URI/password/capability.
- [ ] **Step 5: Write RED migration guard tests.** Prove each transactional table and totals table installs/verifies guard before grants in the same commit, repeated uncapped writers commit zero rows before visibility, post-commit verification cannot repair drift, and concurrent-index packets reject table/schema/function/trigger/ACL/grant statements while preserving invalid-index recovery.
- [ ] **Step 6: Run RED, implement the minimal W-interface integration, then GREEN.** Run the exact migration integration test against the disposable PostgreSQL fixture; expected final result: all base/observability apply/resume/rollback and guard ordering cases pass with zero database residue.
- [ ] **Step 7: Run M aggregate verification, artifact, commit, and push.** Include both normal programmatic API compatibility and Q12 fail-closed evidence.

### Task 5: H — Quiesce-aware Blue/Green Handoff

**Files:**

- Modify: `scripts/deploy_blue_green.sh`
- Modify: `scripts/rollback_blue_green.sh`
- Modify: `scripts/ci/test_blue_green_fail_closed.sh`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-blue-green-handoff.test.ts`

**Interfaces:**

- Consumes: W's exact external quiesce manifest, held lease FD, release SHA, journal/checkpoint identity, claimed command capability, activation receipt.
- Produces: fixed `prepare-quiesced`, `commit-quiesced`, `finalize-quiesced`, and phase-aware rollback behavior while leaving normal mode byte-for-command compatible.

- [ ] **Step 1: Write RED normal/Q12 handoff tests.** Assert normal behavior remains compatible; prepare creates only target Web/API with `--no-start`, persists identities and restart=`no`, then direct-port health; commit changes Nginx/color and creates but never starts all workers; finalize requires the activation receipt before starts/policy restoration; old production IDs stay stopped/no-restart.
- [ ] **Step 2: Run RED.** Run `bash scripts/ci/test_blue_green_fail_closed.sh` and the focused Vitest file; expected: Q12 mode/subcommands are absent.
- [ ] **Step 3: Implement minimal three-call Q12 mode.** Require the same run/lease/checkpoint/release/manifest every time, reject manual/partial entry, and never prune or infer a replacement writer.
- [ ] **Step 4: Add RED rollback/crash tests.** Cover every boundary before/after Nginx reload and activation receipt, invalid/recreated IDs, lost lease, mismatched journal, pre-activation safe rollback, and post-activation finish-forward-only behavior.
- [ ] **Step 5: Implement minimal phase-aware rollback and run GREEN.** Re-run shell and Vitest suites; expected: no writer starts outside the supervisor-owned receipt path and no ordinary deployment behavior changes.
- [ ] **Step 6: Write artifact, commit, and push.** Record exact compatibility and fault-boundary totals; perform no deploy.

### Task 6: Root — Frozen Supervisor, Command Manifest, Smoke, and Recovery

**Files:**

- Create: `deploy/qdrant/q12-live-cutover.sh`
- Create: `deploy/qdrant/q12-capability-run.sh`
- Create: `deploy/qdrant/q12-command-manifest.json`
- Create: `deploy/qdrant/q12-live-smoke.sh`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-live-smoke.test.ts`
- Modify: `docs/operations/qdrant-self-hosted.md`
- Modify: `docs/operations/document-evidence.md`
- Modify: `.codex/handoff.md`, `.codex/stages/mc2-jz6y0/summary.md`, stream artifacts

**Interfaces:**

- Consumes: only accepted G7/P/W/M/H interfaces and immutable release/run inputs.
- Produces: the sole `plan|live|recover` Q12 entrypoint, fixed command manifest and single-use capability launcher, crash-durable journal/checkpoint, phase-aware recovery, live smoke/observation evidence, and terminal rotation requirement.

- [ ] **Step 1: Integrate only reviewed stream commits.** Inspect each diff/artifact/test log, rerun the stream's focused tests on its head, obtain a separate reviewer verdict with P0/P1 zero, then cherry-pick/merge into the integration branch one stream at a time and rerun the joined focused set.
- [ ] **Step 2: Write RED manifest/capability tests.** Assert the JSON contains only the exact approved command IDs/literal argv/minimal env; no shell text/`--`/extra argv/fresh lookup/unresolved placeholders; issue→claim uses no-replace rename/fsync/journal; replay and cleanup failure fail; database capability is never accepted as a host capability.
- [ ] **Step 3: Run RED.** Run the two Q12 manifest/supervisor Vitest files; expected: missing files fail.
- [ ] **Step 4: Implement the minimal manifest and launcher.** Bind run ID, release SHA, digest, resource hashes/inodes, command ID, canonical arg hash, checkpoint, and lease epoch before issuance; claim before exec; record completion only after command evidence is durable.
- [ ] **Step 5: Write RED supervisor journal/recovery tests.** Cover exact phases, one held lock, `O_APPEND|O_DSYNC`, fsync/CAS/hash chain, torn tail, signal/SSH loss/reboot, read-only `recover`, exact resume/rollback confirmation, database-default restore incidents, cron disable/no-restore, post-cutover scheduler lease, all rollback boundaries, and `rotation_required=true` for every terminal result.
- [ ] **Step 6: Implement minimal local/remote controller structure.** `--plan` performs no mutation; `live` accepts only alias `megacampus-prod`, fixed host-key/identity/UID/GID/hostname, exact release bundle hashes and fixed confirmation; remote children cannot be invoked manually.
- [ ] **Step 7: Write RED smoke/observation tests.** Require Stage 2/4/5/6 cycle cases, no-document compatibility, manual/automatic conflict paths, large batch/resume, tenant/course isolation, Qdrant `12,114` points, RU/EN BM25/RRF/Formula/grouping/IDs, notification firing+resolved, 60 continuous minutes plus complete cycle, exact rollout values and thresholds.
- [ ] **Step 8: Implement minimal frozen smoke and observation evaluator, then GREEN.** It only reads accepted live telemetry/results and cannot repair or bless live state.
- [ ] **Step 9: Run aggregate supervisor GREEN.** Run all Q12 supervisor/manifest/smoke tests, shell syntax, JSON parsing, command-ID exact-set test, capability/leak scans, and joined G7/P/W/M/H focused tests.
- [ ] **Step 10: Independently review the joined local branch.** Require correctness/security and documentation reviews; P0/P1 block, every correction gets an invariant test and delta review.

### Task 7: Local Release-confidence Verification and Closeout

**Files:**

- Modify only integration documentation/artifacts/Beads/Graphify outputs required by closeout.

**Interfaces:**

- Consumes: joined reviewed implementation.
- Produces: a pushed local-acceptance commit and a secret-free exact activation packet; it does not itself mutate GHCR/staging.

- [ ] **Step 1: Run focused gates.** Run the accepted G7/P/W/M/H/Root tests, source-recovery/reindex/migration/isolation sets, pinned Qdrant `1.18.2` integration, Compose validation, and the local S3-free snapshot/restore drill.
- [ ] **Step 2: Run workspace gates.** Run `pnpm type-check`, `pnpm build`, and `scripts/orchestration/run_process_verification.sh`; expected: exit 0 with recorded totals.
- [ ] **Step 3: Run documentation review.** Compare ops/deploy/migration/API/durable behavior against code and record `docs-reviewed: updated` or a concrete no-change reason.
- [ ] **Step 4: Refresh Graphify locally.** Run `graphify update . --no-cluster`, `graphify cluster-only . --no-label --no-viz`, and a focused Q12 query; use no external model/API mode and install no Git hook. Record `graph-reviewed: updated` with counts/commands.
- [ ] **Step 5: Run canonical stage gates.** Validate every artifact, run `check_stage_ready.py`, then `run_stage_closeout.py --stage mc2-jz6y0` in the appropriate dry-run/live-local mode required by current stage truth.
- [ ] **Step 6: Commit, pull/rebase safely, push, and verify clean synchronization.** Push Beads with `bd dolt push`; do not force-push or touch protected branches.

### Task 8: Separately Gated GHCR Publication and Live Q12 Execution

**Files:**

- No tracked implementation edits are permitted during the live run; only secret-free evidence/artifacts after observation.

**Interfaces:**

- Consumes: accepted pushed release SHA, scoped GHCR classic PAT through hidden stdin, current owner-only DB URI/CA files, live inventory, exact command bundle/digests/hashes, explicit current authorization packets.
- Produces: immutable operator digest, restore-validated local backup generation, guarded migration/recovery/reindex/cutover, observation evidence, replacement timer proof, then separately authorized credential rotation.

- [ ] **Step 1: Present the GHCR packet.** State exact tag/target/platform/provenance, token scope, external effects, cleanup, rollback (leave tag immutable/use prior digest), and observation. Ask for the scoped token/explicit mutation authorization only after local acceptance.
- [ ] **Step 2: Publish with the accepted local publisher.** Capture only digest/provenance/commit identity and cleanup evidence; never capture the token.
- [ ] **Step 3: Present/reconfirm the exact live packet.** Include server/Supabase/Qdrant/service/file/cron/container effects, secret needs, downtime, expected data effects, observation, phase-aware rollback, and terminal password-rotation requirement.
- [ ] **Step 4: Run `--plan`, revalidate all identities/hashes/inventories, and stop on any drift.** The plan mode must be demonstrably non-mutating.
- [ ] **Step 5: Execute only the sole supervisor if every gate remains true.** Do not manually run a child. On failure, follow only the phase journal's permitted rollback/incident path and rotate before retry.
- [ ] **Step 6: Observe for at least 60 continuous minutes and one complete live course cycle.** Record every exact threshold and cleanup result; a breach keeps Q12 open.
- [ ] **Step 7: Present the separate credential-rotation packet and obtain current authorization.** Rotate/update consumers/prove old rejection/observe Supavisor; without authorization, leave `mc2-jz6y0.13.8` and Q12 open with no retry or production-readiness claim.
- [ ] **Step 8: Close Beads/stage only after terminal evidence passes and all accepted changes are pushed.** External S3 remains explicitly deferred to production task `.13.6`.

## Plan Self-review

- Spec coverage: tasks map one-to-one to G7, P, W, M, H, Root, local closeout, GHCR, live cutover, observation, scheduler, and rotation boundaries; the no-S3 staging decision is explicit.
- Placeholder scan: no `TBD`, `TODO`, implicit “handle errors”, or unassigned implementation step remains.
- Interface consistency: W freezes the lease/database-capability contract before M/H; Root consumes accepted interfaces only; host command capability and database barrier capability remain distinct; live credentials never enter worker streams.
