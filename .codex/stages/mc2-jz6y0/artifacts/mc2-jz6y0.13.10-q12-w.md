---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.10
stage_id: mc2-jz6y0
agent_type: writer-barrier-worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: fail-closed PostgreSQL and Compose cutover behavior spans durable receipts, exact writer identity, crash recovery, and production trust boundaries
repo: mc2
branch: codex/q12-w-writer-barrier
base_branch: codex/q12-g7-backup-restore
base_commit: dfdcdcc7d6dafe6094eb469cedd929ed0904cb92
worktree: /home/me/code/mc2/.worktrees/q12-w-writer-barrier
write_zone:
  - deploy/qdrant/source-recovery-run.sh
  - deploy/qdrant/q12-writer-resume.py
  - deploy/qdrant/q12-database-barrier.sh
  - deploy/qdrant/q12-structural-catalog.sql
  - packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh
  - packages/course-gen-platform/tools/qdrant/source-recovery-database.ts
  - packages/course-gen-platform/tools/qdrant/source-recovery-reindex-adapters.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
  - focused unit tests and this artifact
selected_docs:
  - Q12 durable recovery projections addendum SHA-256 28655ffe401efe39b09ba436d101aeed055c8fe25cb8a8e4fd3e90720e745ab4
  - Q12 live-cutover base design SHA-256 5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15
  - Q12 normative lifecycle addendum SHA-256 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27 (final normative pass; P0=P1=P2=P3=0)
  - PostgreSQL 17 system catalog overview - https://www.postgresql.org/docs/17/catalogs-overview.html
  - PostgreSQL 17 event trigger behavior - https://www.postgresql.org/docs/17/event-trigger-matrix.html
  - PostgreSQL 17 acldefault object codes - https://www.postgresql.org/docs/17/functions-info.html
  - PostgreSQL 17 CREATE TRANSFORM - https://www.postgresql.org/docs/17/sql-createtransform.html
  - PostgreSQL 17 COMMENT - https://www.postgresql.org/docs/17/sql-comment.html
  - PostgreSQL 17 SECURITY LABEL - https://www.postgresql.org/docs/17/sql-security-label.html
  - Supabase Event Triggers - https://supabase.com/docs/guides/database/postgres/event-triggers
  - Supautils privileged-role behavior - https://github.com/supabase/supautils
selected_skills:
  - senior-devops
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - writer-barrier worker
catalog_candidates:
  - none - installed DevOps, debugging, TDD, and verification assets cover the bounded stream
parallel_decision: sequential - the database barrier, immutable artifacts, and writer lifecycle share one fail-closed state machine and exact test fixture
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: blocked
cleanup_notes: branch/worktree must remain available for Root independent acceptance and integration; removing the current checked-out worker worktree before acceptance would destroy the required review surface
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: this artifact records the D4 RED-GREEN implementation and exact approved design hash; no operator runbook surface changed, and root owns consolidated docs review at integration
graph_reviewed: blocked
graph_review_notes: graphify-out/GRAPH_REPORT.md is absent from this isolated worktree; root must query/refresh the local graph after accepted integration
verification:
  - initial D4 runtime RED reproduced exactly 120 of 129 passing and nine expected failures, comprising eight journal-graph cases and one immutable recovery-publication case
  - Task 2 exact resume-capability RED-to-GREEN completed and the then-current source-recovery runtime passed 137 of 137 with zero failures
  - Task 3 quiesce/recovery-prefix and immutable inventory/transition/final coverage passed in the complete source-recovery runtime at 152 of 152 with zero failures
  - Task 4 database baseline/proof/crash/mismatch coverage passed 45 of 45, including terminal reconnect RED 0 of 2 to GREEN 2 of 2; the three fail-closed source/reindex adapter files passed 98 of 98 without adapter-code changes
  - round-two P1 targeted RED selected six new cases and failed all six for the intended missing guards: two old-execution/new-completion existing-proof modes, three full DB capability-directory incidents, and one locally rehashed rollback cross-wire; the other 121 tests were filter-pending
  - round-two targeted GREEN passed all 6 of 6 selected tests; the complete runtime JSON then passed 127 of 127 with zero failures and zero pending tests
  - round-two joined runtime/database JSON with the actual protected PostgreSQL 17 reconnect active passed 178 of 178 across 6 suites with zero failures and zero pending tests
  - final P1 positive RED selected the linked pre-issuance orphan and historical completed barrier.install cases and failed exactly 2 of 2 for the intended false rejections; the other 127 tests were filter-pending
  - final P1 targeted GREEN passed 2 of 2; complete runtime passed 129 of 129; joined runtime/database with actual PostgreSQL 17 reconnect passed 180 of 180 across 6 suites
  - frozen real-PG17 five-file barrier/runtime/database/adapters/reindex aggregate passed 278 of 278 across 17 suites with zero failures and zero pending tests
  - opt-in stock PostgreSQL 17 fixture passed 34 of 34 including fresh-session default read-only and explicit primary READ WRITE proof
  - workspace pnpm type-check passed across all five projects; workspace pnpm build passed with synthetic test-only Supabase environment values
  - Prettier check passed every changed TypeScript test/tool file
  - ESLint completed with zero errors; the database test uses the same narrow max-lines exemption as the exhaustive runtime suite because splitting the shared exact durable fixture would duplicate or weaken cross-artifact invariants
  - bash syntax passed source-recovery-run.sh, q12-database-barrier.sh, and the Qdrant operator entrypoint; Python byte-compilation passed q12-writer-resume.py
  - structural catalog retained exact SHA-256 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e, 1254 lines, and one semicolon-free query
  - git diff --check and secret/live-command scans passed; no current-run synthetic process, temporary run root, PostgreSQL 17 container, or matching Docker volume remained
  - retained-recovery positive RED selected exactly the two legal historical-authority cases and failed 0 of 2, with 138 filter-pending tests: one immutable cutover capability completed at cutover-recovery-1, and one directly linked cutover to cutover-recovery-1 capability chain
  - retained recovery now distinguishes capability execution epoch from journal completion epoch: only a one-record cutover execution may complete at exactly cutover-recovery-1; a reissued recovery tip must execute and complete in its own exact epoch
  - every retained chain has one completed tip, is walked backward across every record exactly once, starts at cutover, advances through every consecutive cutover-recovery-N epoch without a gap, keeps predecessors superseded and only the tip completed, and preserves one exact command/run/release/operator/resource/quiesce contract
  - an additional command-contract RED proved a linked recovery tip with a changed command SHA was accepted before the guard; after correction the same case fails before Docker and the legal chain preserves the identical command SHA from predecessor through tip
  - final retained-history focused GREEN passed 16 of 16 selected positives and prior negatives; complete runtime passed 141 of 141 with zero failures and zero pending tests
  - canonical joined runtime plus database-barrier validation with actual PostgreSQL 17 passed 192 of 192 across 6 suites; auxiliary runtime plus source-recovery-database validation passed 153 of 153 across 6 suites
  - final real-PG17 structural fixture passed 34 of 34, and the five-file barrier/runtime/database/adapters/reindex aggregate passed 290 of 290 across 17 suites, all with zero failures and zero pending tests
  - retained-recovery closeout reran workspace type-check and synthetic-environment build, Prettier, ESLint, Python byte-compilation, Bash syntax, git diff checking, and unchanged structural SQL hash/line/semicolon invariants; all blocking checks passed and ESLint retained only the same 13 fixture warnings
  - commit and push state is committed and pushed on codex/q12-w-writer-barrier; exact branch-tip SHA is returned out-of-band because an artifact cannot self-reference its own commit
changed_files:
  - deploy/qdrant/source-recovery-run.sh
  - deploy/qdrant/q12-writer-resume.py
  - deploy/qdrant/q12-database-barrier.sh
  - deploy/qdrant/q12-structural-catalog.sql
  - packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh
  - packages/course-gen-platform/tools/qdrant/source-recovery-database.ts
  - packages/course-gen-platform/tools/qdrant/source-recovery-reindex-adapters.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-database.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-database-barrier.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-structural-catalog-pg17.test.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w.md
explicit_defers:
  - independent correctness and docs review, integration, canonical graph refresh, and stage-wide gates remain root-owned
  - no live database, Supabase, Docker service, Qdrant, staging, production, credential, or remote mutation was performed
---

# Summary

The approved D4 hardening delta was reproduced RED exactly before implementation:
eight malformed journal-graph cases and one pre-existing non-exact immutable
writer-recovery publication were the only failures (120/129 remained green).
The resume controller now rejects any missing, reordered, repeated, unknown,
cross-mode, wrong-outcome, ordinary accepted-object, or duplicate publication
row in the complete forward graph while preserving the bounded recovery suffix
and exact rollback conditional ordering. Writer-recovery completion no longer
uses replacement publication: it accepts only byte-exact existing evidence or
uses Linux `renameat2(RENAME_NOREPLACE)`, followed by directory sync and reopened
owner/mode/hash validation. Those pre-review totals were superseded by the
independent acceptance fix cycles below; the current runtime is 129/129 and the
current real-PG17 joined W aggregate is 278/278 with zero pending tests.

The W delta implements the approved local writer/database lifecycle without any
remote activation. `barrier.prepare-recovery` publishes
`recovery_ready_guarded` only from the exact final verified migration receipt.
The frozen writer commands are `writers.resume.forward` and
`writers.resume.rollback`, exposed only as:

```text
/opt/megacampus/deploy/qdrant/source-recovery-run.sh \
  --operation resume-writers-only \
  --resume-mode forward|rollback \
  --run-id <run-id>
```

The external resume controller accepts no path, database, CA, capability,
Qdrant, or generic environment argument. The shell launches it with exactly
`PATH`, `LC_ALL=C`, `LANG=C`, `HOME=/root`, and
`Q12_EXTERNAL_QUIESCE_LEASE_FD=9`; stdin is `/dev/null`; and the only inherited
descriptors are 0, 1, 2, and the held canonical cutover lease on FD 9. It
requires the fixed run root, exact owner/mode, exact artifact schemas and
hashes, the exact Docker identities, and a
`cutover|cutover-recovery-N` resume epoch. It rejects
`postcutover_schedule` and `credential_rotation` because those epochs belong
only to their later phase mappings.

Before Docker inspection, the controller validates the complete canonical
journal from sequence 1 through the current checkpoint: exact 19-key entries,
canonical UTF-8 JSONL encoding, safe integers, previous-hash continuity, and
recomputed entry hashes. The final manifest, handoff/rollback state, and resume
authority each require their own immediately adjacent intent/accepted
publication pair with the exact accepted object kind and digest. The current
head must remain an unaccepted `resume_committing_forward|rollback` intent
bound to the exact authority, final manifest, quiesce manifest, and checkpoint.

Forward selects the new five production writers plus the original five
development writers and holds the old five production writers stopped with
restart `no`. Rollback selects the original ten and holds the captured partial
target set of 0..5 stopped with restart `no`. Both modes start workers, then
API, then Web; verify each class before advancing; and restore restart policies
only after every required start is healthy. The previous unreachable in-process
Compose restore functions were removed, leaving `resume-writers-only` as the
only Compose restart path.

Every start, health, policy, identity, input-swap, signal, and protected crash
failure compensates the complete final set to stopped/restart-`no` and proves
the held set unchanged. The shell holds its host lock and waits for the Python
controller to finish compensation on INT/TERM. A crash after exact terminal
state but before receipt publication is completed without replay under a new
recovery epoch. A partial crash is compensated and fails closed, requiring the
next recovery epoch.

The terminal `megacampus.q12.writer-resume-state/v1` receipt has exactly the
normative 14 keys. `release_sha` is intentionally absent and is transitively
bound by the exact final-manifest and authority hashes; an extra
`release_sha` is rejected. Publication uses an owner-correct, fsynced temporary
inode and `renameat2(RENAME_NOREPLACE)`, so a crash after rename leaves exactly
one terminal receipt and no hard-link temporary residue.

# Database and catalog outcome

The PostgreSQL guard freezes the exact structural catalog, row/TRUNCATE/event
trigger sets, ACLs, owners, run/catalog binding, cron and pg_net state.
`assert_capability()` supports the approved migration client boundary while
`assert_controller_binding()` independently requires the direct-controller run,
capability, and catalog bindings. Activation retry after a DB COMMIT can publish
its receipt only after complete read-only durable-state proof. Cleanup and
rollback never infer success from a missing guard schema and never forge a
terminal receipt after a protected post-COMMIT fault.

The canonical PostgreSQL 17 payload projects 40 structural families, including
the 19 expanded DDL families and explicit schema-less COMMENT/SECURITY LABEL
classes. Secret-valued FDW, server, table, column, user-mapping, and subscription
options are represented only by SHA-256. The real PostgreSQL 17 fixture proves
hash drift/restoration, OID-order parity, transaction races, fresh-session
read-only inheritance, and explicit primary READ WRITE control.

Task 4 adds the exact immutable eleven-key install baseline before the first v1
receipt. Production install evidence is derived through a separate read-only
PostgreSQL 17 reconnect from immutable `q12_guard.baseline`; raw database
defaults and cron commands remain inside the database while only their frozen
canonical hashes enter host evidence. Cleanup and rollback validate the exact
baseline, checkpoint, journal head, v1/archive, capability, and rollback intent,
then publish only their exact immutable eighteen-key terminal proof. W neither
deletes the DB capability nor replaces receipt v1 with v2; those mutations
remain Root-owned. A separate read-only terminal reconnect executes the exact
structural SQL and reprojects database-default, all eight cron rows, and seven
zero-residue counts before proof publication. Exact existing proof retry performs no DB-child replay, and
any replacement, extra key, cross-binding, or non-exact proof fails closed.

# Independent acceptance fix cycle

The round-one independent review reported one P0 and six P1 findings. All seven
are corrected in this branch:

- post-cleanup writer resume accepts only the exact canonical v2 database
  receipt, bound terminal proof, baseline, predecessor v1/archive, absent DB
  capability, and a complete mode-specific accepted database lifecycle;
- uninterrupted and consecutive recovery-epoch database lifecycles bind the
  exact claimed child checkpoint, capability checkpoint anchor, completed host
  capability, and supersession link before any Docker inspection/start;
- Q12 `--stop-writers` is rejected before writer mutation; Q12 source recovery
  consumes only the separately capability-gated immutable external quiesce
  manifest, while the general non-Q12 compatibility path remains available;
- exact issued/claimed orphan histories are recoverable for both quiesce and
  resume, and exact stopped/no state with no recovery publication proceeds
  through the normal path;
- the database child validates the full canonical journal/hash chain, derives
  the current recovery epoch, and rejects corrupt earlier rows even when the
  tail/checkpoint matches;
- rollback binds valid receipt state to `last_command`, the current capability
  checkpoint, and the exact required phase receipt set/hash;
- a protected test-only seam drives the actual terminal Node/`pg` runner against
  disposable PostgreSQL 17.10 without weakening production identity, pinned CA,
  or TLS. The seam exposed and fixed consumed shared URL/CA/structural FD
  offsets and an over-escaped trailing-newline regex. Separate O_NOFOLLOW
  terminal descriptors are now identity-rechecked before reconnect.

# Verification evidence

```text
MC2_Q12_REAL_PG17=1 \
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=synthetic-test-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/q12-database-barrier.test.ts \
  tests/unit/ops/qdrant-source-recovery-runtime.test.ts \
  tests/unit/tools/qdrant/source-recovery-database.test.ts \
  tests/unit/tools/qdrant/source-recovery-reindex-adapters.test.ts \
  tests/unit/tools/qdrant/reindex-course-embeddings.test.ts
# 5 files, 278/278 passed, 0 pending (MC2_Q12_REAL_PG17=1)

MC2_Q12_REAL_PG17=1 \
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=synthetic-test-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/q12-structural-catalog-pg17.test.ts
# 34/34 passed, 0 pending

pnpm type-check
# exit 0

SUPABASE_SERVICE_ROLE_KEY=synthetic-test-key \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon-key \
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=synthetic-test-key \
pnpm build
# exit 0
```

The preserved D4 RED run reached 120/129 with exactly eight malformed graph
failures plus the immutable recovery-publication failure. The first minimal
GREEN implementation made those 9/9 pass; full runtime exposed three ordering/
recovery compatibility regressions, which were traced to the bounded recovery
suffix and rejection-message ordering, corrected without weakening the D4
cases, and rerun to 129/129.

The earlier pre-hardening combined run reached 215/216 because the test sent
SIGTERM to the whole synthetic process group and timed out while shell and
controller raced. The leftover local synthetic process was explicitly stopped.
The test was corrected to exercise the actual supervisor boundary: signal the
shell, forward to the controller, and wait for proven compensation. That test
then passed three consecutive isolated runs. After the final normative
hardening pass, the complete runtime file passed 108/108 and the fresh combined
run passed 241/241. The D4/Task 2/Task 3/Task 4 totals were the accepted baseline
for round-one review. The subsequent seven-finding fix cycle supersedes them
with runtime 121/121, database 51/51 with the actual PG17 reconnect active,
real-PG17 aggregate 270/270, and structural PostgreSQL 17 34/34, all with zero
pending tests. Final current-run process, temporary, container, and volume
checks were empty; older unrelated `/tmp` fixtures dated before this worker
session were outside the write zone and were not altered.

# Round-two P1 correction

The round-two rereview found two P1 authority gaps. The focused RED
run selected six new cases and failed exactly six: forward and rollback exact
terminal proofs whose immutable capability/proof retain the old execution epoch
while only `capability_completed -> accepted` use the next recovery epoch;
unreferenced, duplicate, and opposing terminal-operation DB capability files; and a
writer rollback receipt SHA changed with its local nested hash recomputed.

The resume validator models DB execution and completion epochs separately.
It accepts the frozen existing-proof continuation without issuing, claiming, or
replaying a child, while retaining the uninterrupted and ordinary recovery
graphs. Before Docker inspection it scans all exact `issued`, `claimed`,
`completed`, and `superseded` directories for the current terminal operation,
walks the supersedes chain backward from its sole completed execution
capability, and binds every journal-current node to its epoch, exact location,
immutable predecessor, and checkpoint. The sole journal-less exception is the
frozen first pre-issuance orphan: it must be the directly linked superseded
cutover node with an intent-bound checkpoint. Unlinked, forked, duplicate,
misplaced, broken-link, wrong-epoch/checkpoint, or extra same-operation records
fail closed. The opposing cleanup/rollback terminal record remains a conflict,
while valid retained `barrier.install`, `barrier.activate`, and other
prior-contract commands are ignored solely for presence. Rollback additionally
requires canonical byte equality of the writer and DB-intent required receipt
arrays plus exact equality of their frozen nested hashes.

Fresh final evidence is runtime `129/129`, joined runtime plus actual
disposable PG17 reconnect `180/180` across 6 suites, structural PG17 `34/34`,
and the five-file real-PG17 aggregate `278/278` across 17 suites, all with zero
failed or pending tests. Workspace type-check and synthetic-env build exited
zero. The structural SQL remains SHA-256
`0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e`,
1,254 lines, and semicolon-free.

`docs-reviewed: updated` — this artifact and the ignored implementer report
record the round-two contract and evidence; frozen normative docs and operator
surfaces need no change. `graph-reviewed: blocked` — this isolated worktree has
no `graphify-out/GRAPH_REPORT.md`; Root owns refresh after accepted integration.
The branch remains pending Root rereview and is not self-accepted by W.

# Final barrier classifier P1 correction

The final terminal rereview identified one remaining fail-open namespace edge:
the resume validator skipped every `barrier.*` file whose name did not begin
with cleanup or rollback. A focused RED selected seven cases. The separately
journal-bound historical install positive passed, while exactly six classifier
negatives failed because the old validator returned success: canonical
`barrier.evil` in each of issued, claimed, completed, and superseded; a
malformed known-command basename; and a known install basename cross-wired to
an embedded activate command. Every negative also proved that no Docker inspect
or start occurred.

The capability namespace is now the closed seven-command set
`barrier.install`, `barrier.activate`, `barrier.verify-after-base`,
`barrier.verify-after-observability`, `barrier.prepare-recovery`,
`barrier.cleanup`, and `barrier.rollback`. Every `barrier.*` entry in all four
lifecycle directories must first pass exact basename/epoch classification,
safe owner/mode/identity opening, exact canonical schema/bytes, and embedded
run/command/epoch/field validation. Cleanup and rollback then retain the
existing current-terminal conflict rule and complete backward supersession
chain. A recognized prior command is excluded from that chain only as a
completed capability bound exactly to one already validated completed journal
row with its own command SHA, capability digest, epoch, release, operator,
resource, and then-current quiesce hash. No D4 checkpoint is invented for a
prior command.

The historical install fixture is no longer a renamed cleanup capability. It
has its own command SHA and capability digest, a canonical completed path, and
a matching `maintenance_guarded/completed` journal row. Its quiesce hash is the
pre-quiesce zero hash in both capability and journal, so acceptance does not
depend on future terminal quiesce state.

Fresh classifier evidence is focused GREEN `7/7` and complete runtime
`135/135`, with zero failed or pending tests. Joined runtime plus the actual
disposable PostgreSQL 17 reconnect passed `186/186` across 6 suites; structural
PostgreSQL 17 passed `34/34`; and the five-file real-PG17 aggregate passed
`284/284` across 17 suites, all with zero failed or pending tests. Workspace
type-check and the final synthetic-env build exited zero. Prettier, Python
byte-compilation, Bash syntax, `git diff --check`, unchanged structural SQL
hash/line/semicolon invariants, artifact/process checks, secret/live/debt
scans, and current-run cleanup passed. ESLint reports zero errors and the same
13 pre-existing unsafe-`any` warnings in the exhaustive runtime fixture; the
classifier introduced no new complexity warning.

`docs-reviewed: updated` — this artifact and the ignored implementer report
record the final classifier contract and evidence; frozen normative docs and
operator-facing surfaces need no change. `graph-reviewed: blocked` — this
isolated worktree has no `graphify-out/GRAPH_REPORT.md`; Root owns refresh after
accepted integration. W does not claim acceptance; the pushed branch is
returned for final Root rereview.

# Retained historical authority semantics

The classifier rereview exposed a semantic overstatement in the prior section:
matching an arbitrary completed journal row did not prove a retained command's
normative phase/context, and validating files independently did not prove one
current authority. The required adversarial RED failed `0/2` because the old
code accepted both a canonical install at `snapshot_exported` with the future
quiesce hash and two independently completed install authorities. A follow-up
RED failed `0/1` because a lone recovery-epoch install without its predecessor
was also accepted.

Historical records are now grouped by command. The deliberately conservative
supported lifecycle is exactly one completed initial-`cutover` capability with
no supersedes predecessor; all historical recovery, companion lifecycle,
forked, orphaned, duplicate, or ambiguous records fail closed. Supported
records must bind one exact completed journal row at install→
`maintenance_guarded`, verify-after-base→`base_migration_guarded`,
verify-after-observability→`observability_migration_guarded`,
prepare-recovery→`recovery_ready_guarded`, or activate→`activated`. Install
requires the pre-quiesce zero hash, while the later four require the accepted
quiesce manifest hash. Exact own command SHA, capability digest, epoch,
release, operator, resource, and quiesce equality remains mandatory; no D4
checkpoint or new recovery contract was added.

Fresh final evidence is focused GREEN `13/13`, runtime `138/138`, joined
runtime plus actual disposable PostgreSQL 17 `189/189` across 6 suites,
structural PG17 `34/34`, and the real-PG17 five-file aggregate `287/287` across
17 suites, all with zero failed or pending tests. Workspace type-check and the
final synthetic-env build exited zero. Prettier, Python byte-compilation, Bash
syntax, `git diff --check`, unchanged structural SQL invariants,
artifact/process validation, secret/live/debt scans, and current-run cleanup
passed. ESLint reports zero errors and the same 13 pre-existing unsafe-`any`
warnings.

`docs-reviewed: updated` — this artifact and the ignored implementer report
correct the retained-history semantic/uniqueness claim; frozen normative docs
and operator surfaces need no change. `graph-reviewed: blocked` — this isolated
worktree has no `graphify-out/GRAPH_REPORT.md`; Root owns refresh after accepted
integration. W does not claim acceptance; the branch is returned for Root
rereview.

# Risks / Follow-ups

All changes are local to `codex/q12-w-writer-barrier`; no external state exists
to roll back. Before integration, the branch commit can be reverted as one
unit. After integration, root must rerun canonical stage-wide verification and
refresh Graphify locally. Live cutover, Supabase/Qdrant mutation, service or
secret changes, and any staging/production activation remain outside this
stream and require the root-owned explicit remote gate.
