---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-plan-live-review
stage_id: mc2-jz6y0
status: returned
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-plan-builder
base_branch: master
base_commit: 9f9a32c8
worktree: /home/me/code/mc2/.worktrees/q12-plan-builder
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: 'Read-only review; single write is this artifact. No branches/worktrees/resources created.'
risk_level: low
explicit_defers:
  - 'P2-1: MC2_Q12_PLAN_* seams honored from ambient env without production lockdown — fixed in round-7 (positive production guard).'
  - 'P2-2: no CI binding of the REAL write_persist_handle output to _read_handle — fixed in round-7 (docker-free contract test).'
  - 'P3: coordinator readline timeout, synthetic capability cleanup, Protocol teardown declaration, label-based docker sweep — round-7; binary-override ownership checks skipped as subsumed by P2-1.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-migration-plan-capture.py
  - deploy/qdrant/q12-migration-plan-roles.py
  - deploy/postgres/restore-supabase-drill.sh
  - packages/course-gen-platform/tests/unit/ops/q12-migration-plan.test.ts
  - packages/course-gen-platform/tests/unit/ops/supabase-restore-drill.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-migration-plan-runner.py
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-plan-builder.md
verification:
  - 'Pinned to git show/diff of range 9f9a32c8..1ee6a665 (17 commits, RED/GREEN/docs rounds); working tree clean at HEAD=1ee6a665.'
  - 'Frozen bytes at 1ee6a665: sha256(q12-database-barrier.sh)=134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68 and sha256(q12-command-manifest.json)=aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841 — intact; q12-structural-catalog.sql not in range.'
  - 'Confirmed the frozen-schema validator (validate_expected_catalog / _validate_guarded_relations / _validate_cron_jobs / _validate_migrations / assemble_expected_catalog) is UNCHANGED in this range via git diff — the round-1 clause-for-clause barrier fidelity still holds.'
  - "Read the whole LivePlanExecutor (lifecycle-core 4531-5372), the new q12-migration-plan-roles.py, the capture-helper delta, run_plan's emit/teardown ordering, and the drill persist seam (93f01595)."
  - 'Compared the §3 allowlists in q12-migration-plan-roles.py against deploy/postgres/generate-role-bootstrap.ts (MISSING_ROLE / ROLE_PRIVILEGE / ROLE_SETTING) — byte-identical sets.'
  - "Compared the real drill write_persist_handle byte-shape (restore-supabase-drill.sh) against _read_handle and against the plan test's fake-drill emitter — identical key set / schema_version / host / database=restore_test / port int / json.dumps(sort_keys=True)+newline / mode 0400."
  - 'Enumerated every acquired vs reclaimed resource in teardown(); traced fault-injection reachability (MC2_Q12_PLAN_FAULT ∈ {snapshot,equality,teardown}); traced coordinator lifecycle (readline, death mid-dump, COMMIT-on-RO).'
  - 'Confirmed docker-heavy suites are describe.runIf(REAL_PG17); read fail-closed negatives (malformed handle, snapshot fault) and the two real-drill persist-seam no-leak tests.'
  - 'Did NOT run docker or suites (per constraints); relied on orchestrator fresh runs: real-PG17 26 passed, no-docker 65|7 skipped, drill 46, regression 289, tsc 0, frozen bytes intact.'
---

# Summary

**Verdict: PASS.** The live plan orchestration delta (9f9a32c8..1ee6a665) is
correct, fail-closed, and does not weaken any frozen or consumer contract. The
round-1 deterministic builder is untouched here (I re-diffed the validator
functions — byte-unchanged), so every property from the first review still
holds, and this range's live leg is layered _underneath_ that same validator plus
three additional independent backstops: the source↔isolate structural-equality
proof, the self-binding sha, and the barrier's own re-verification against the
real database at cutover. Because of that layering, **no test/env seam can cause a
wrong catalog to be emitted or consumed** — a mis-set seam can only abort
fail-closed or drive an alternate-but-still-verified path. Frozen bytes are intact.

Two round-1 P3s are now fixed in-range: the capture `--container` seam is
`CONTAINER_RE`-anchored, and COPY text-format escaping is decoded before
`json.loads` (`_decode_copy`), plus a bool-as-int pin (864da98f).

No P0/P1. The two P2s are defense-in-depth / anti-drift, not live-window
defects:

- **P2-1 (production-reachability):** the executor reads all seams
  (`MC2_Q12_PLAN_RESTORE_MODE`, `SOURCE_CONTAINER`, `MIGRATION_APPLY`, `FAULT`,
  `RESTORE_IMAGE`, `DRILL`, `DOCKER`/`PSQL`/`PG_DUMP`/`PG_DUMPALL`) unconditionally
  from the ambient environment with no "production must use the pinned drill / no
  seams" lockdown. The downstream backstops mean the worst case is an unreviewed
  restore path or a fail-closed abort, never a bad cutover, but there is no
  positive production assertion.
- **P2-2 (mock-reality anti-drift):** no automated test binds the _real_
  `restore-supabase-drill.sh:write_persist_handle` output to the plan's
  `_read_handle`. I verified they match byte-for-byte today and the fake drill
  mirrors them, but the real emitter runs only in the CI-unreproducible drill;
  this is precisely the drift class that bit the earlier work.

The accepted CI-unreproducible boundary (real drill + real source manifest + real
CLIs on the pinned Supabase image, validated by the server-side pre-C1 run) was
respected and not counted against the delivery.

# Verification

## Emit / teardown ordering and cleanup-overrides-success

`run_plan` runs `capture -> assemble -> validate -> complete_object ->
immutable_publish(0o400)` inside a `try`, then `plan_executor.teardown()` in a
`finally`. The 0400 catalog is written to `run_root`
(`/opt/megacampus/backups/q12/<run_id>` or `/tmp/mc2-q12-plan-*`) — NOT the
workdir — so it durably survives teardown, which only reclaims the diagnostic
resources. A teardown `LifecycleError` propagates and skips `return result`
(cleanup overrides success). The `PlanExecutor` fixture runner gained a
`teardown()` no-op so the `finally` never `AttributeError`s.

## Fault injection is fail-direction-only (claim verified)

- `fault == "snapshot"` forces `snapshot = "not-a-valid-snapshot"` → `PLAN_SNAPSHOT_RE`
  rejects → abort before restore.
- `fault == "equality"` forces `isolate_structural = "0"*64` → equality gate fails → abort.
- `fault == "teardown"` appends an error _after_ all real reclamation has run → teardown raises but leaks nothing.

None suppresses a check or turns a failing path green; each only aborts or forces
a post-cleanup raise. Even set in production, `FAULT` cannot corrupt or leak.

## §3 role bootstrap fidelity (q12-migration-plan-roles.py)

The `MISSING_ROLE_ALLOWLIST`, `ROLE_PRIVILEGE_ALLOWLIST`, and
`ROLE_SETTING_ALLOWLIST` sets are byte-identical to `generate-role-bootstrap.ts`
(including the two byte-for-byte `postgres.search_path` renderings and
`supabase_read_only_user.default_transaction_read_only=on`). Identifiers are
`NAME_RE`-fullmatch + double-quote-escaped; literals single-quote-escaped;
`search_path` values are rendered raw only because the exact `name=value` pair is
allowlist-pinned. Elevated attributes outside the per-role allowlist, missing
roles outside the eight-role allowlist, and non-allowlisted settings are all hard
stops before any SQL is emitted; `_scan_secret` is a final backstop against
connection-string/JWT/password shapes; bootstrap roles are created password-free.
The capture projection excludes `pg_*` and `cli_login_postgres`, matching the TS
source filter.

## Snapshot coordinator lifecycle

One `REPEATABLE READ READ ONLY` session exports a snapshot and is held open across
source capture + dump + manifest, so all three read the same instant; `SET
TRANSACTION SNAPSHOT '<id>'` is `SNAPSHOT_RE`-validated (no injection). Roles are
exported before and after the snapshot-bound dump and asserted byte-stable after
normalizing the single PG17 `\restrict`/`\unrestrict` nonce pair (requiring it
present exactly once with matching nonce and correct order). Coordinator death
mid-dump invalidates the snapshot → `pg_dump --snapshot` fails → abort; a dead
coordinator at close surfaces via a non-zero `wait` → raise; `COMMIT` on a
read-only tx is valid. `_drill_flow` closes the coordinator in a `finally` before
restore, and `teardown()` is a backstop.

## Teardown completeness (acquired vs reclaimed)

Acquired: coordinator process, workdir (`/tmp/mc2-q12-plan-work-*`, holds the
0600 `libpq-service` with the source password), generation dir (holds
`database.dump` / `roles.sql` / `source-manifest.json` / `checksums.json`), the
persist handle, and container/network/volume. `teardown()` reclaims all of them —
coordinator, then container → volume → network (correct docker dependency order),
handle, generation, workdir — each best-effort with per-resource stderr capture,
raising an aggregated `LifecycleError` if any failed. The secret-bearing
`libpq-service` and the dump/roles/manifest are inside workdir/generation and are
removed on both success and failure paths.

## Drill persist seam (restore-supabase-drill.sh, 93f01595)

`validate_persist_handle` engages only when the env is set, requires `RUN_KIND ==
q12`, an absolute control-free path with a 0700 parent, and a non-symlink target
(fail-closed 64 otherwise). `write_persist_handle` opens `O_WRONLY|O_CREAT|O_EXCL|
O_NOFOLLOW,0o400` + `fsync` and writes `json.dumps(handle, sort_keys=True)+"\n"`.
`PERSIST_ENGAGED` flips to 1 only after a fully successful restore AND durable
handle publication; `cleanup_restore_docker_resources` skips docker teardown only
when it is 1, so every failure path keeps it 0 and runs full cleanup (no silent
leak), while `TEMP_ROOT` is always reclaimed. Default (env unset) behavior is
byte-identical and the frozen `pg_restore` argv is untouched. The emitted handle
shape matches `_read_handle` exactly, and `_read_handle` reads it through the
hardened `validate_regular_file` (O_NOFOLLOW parent walk, uid/gid==1000, mode
0400, nlink==1, dev/ino re-stat TOCTOU guard) before shape/identity validation.

## Test honesty

Docker suites are `describe.runIf(REAL_PG17)`. The plan drill-consumption test
uses a fake drill that creates a REAL container/network/volume, actually
`pg_restore`s the generation dump into `restore_test`, and emits the identical
persist-handle bytes — a high-fidelity stand-in, not a hollow mock. Negatives
prove fail-closed with no resource leak on a malformed handle and on a
coordinator snapshot fault (drill never invoked). The two real-drill persist-seam
tests source the drill's authoritative Docker lifecycle and prove hand-off (3
resources survive when engaged; caller reclaims them) and no-leak (full cleanup
when the restore fails before hand-off).

# Risks / Follow-ups

- **[P2-1 · production-reachability · confidence high]** The executor trusts all
  `MC2_Q12_PLAN_*` seams from the ambient environment with no production lockdown.
  `RESTORE_MODE=direct`, `SOURCE_CONTAINER`, `MIGRATION_APPLY`, `RESTORE_IMAGE`,
  and the binary overrides could redirect the restore/capture path if set in the
  server env. All correctness is backstopped downstream (structural-equality
  proof + unchanged frozen validator + self-binding sha + barrier re-verification
  at cutover), so no seam can cause a wrong catalog to be _consumed_ — impact is
  bounded to using an unreviewed path or a fail-closed abort. Recommend a positive
  guard: when `run_root` is the production path, reject any non-default seam
  (drill mode only, pinned image only, no source-container / migration-apply /
  fault).

- **[P2-2 · mock-reality anti-drift · confidence medium]** No CI test binds the
  real `write_persist_handle` output to `_read_handle`; the fake drill has its own
  hardcoded emitter, so a future field rename/addition in `write_persist_handle`
  would pass all of CI yet break only at the live window. They match byte-for-byte
  today. Recommend a docker-free unit test that sources the drill, calls
  `write_persist_handle` with synthetic argv into a temp path, and asserts
  `_read_handle` accepts the bytes.

- **[P3 · coordinator liveness · confidence medium]** `_open_snapshot_coordinator`
  does `proc.stdout.readline()` with no timeout; a source `psql` that connects but
  then stalls blocks the plan indefinitely. Operator-supervised, but recommend a
  `connect_timeout` in the libpq service file and/or a bounded read.

- **[P3 · teardown defense-in-depth · confidence medium]** If a returncode-0 drill
  ever emitted a malformed handle _after_ persisting resources, `_read_handle`
  raises before container/network/volume are registered, so `teardown()` would not
  reclaim them. Unreachable with the real drill (bad handle → non-zero →
  `PERSIST_ENGAGED=0` → full cleanup), but a label-based (`com.megacampus.q12.*`
  run_id) teardown sweep would harden against a future/buggy drill.

- **[P3 · residual clutter · confidence high]** The synthetic capability file
  (`run_root/secrets/db-capability`, 0400 `os.urandom`) created by
  `_prepare_capability` is never reclaimed by teardown. Not a secret; just left in
  the persisted run_root.

- **[P3 · typing nit · confidence high]** The `PlanExecutor` Protocol still
  declares only `capture`; `run_plan` now also calls `teardown`. Runtime is fine
  (both implementors define it, fixture runner added it), but the Protocol should
  declare `teardown` for clarity.

- **[P3 · binary trust · confidence low]** `_validated_binary` checks absolute +
  regular-file (+ non-symlink for psql) for `MC2_Q12_PLAN_DOCKER`/`PSQL`/etc. but
  not ownership/trust; combined with P2-1 an attacker holding both env and
  filesystem-write could still redirect. High-privilege precondition.

- **[Informational] §3 divergence:** the Python roles helper drops `pg_*`
  roles/edges entirely rather than performing `generate-role-bootstrap.ts`'s
  `pg_participants` source-vs-image equality cross-check. Safe (identical PG17
  built-ins; structural-equality gate backstops any restore drift) but an
  undocumented intentional divergence worth a comment.

# Round-7 delta

**Verdict: PASS.** Delta range `1ee6a665..7764cfb4` (271 insertions across
q12-lifecycle-core.py +92, q12-migration-plan-roles.py +10 doc-only, the plan
test +142, and the stage artifact). Tree clean at 7764cfb4; frozen bytes intact
(barrier `134255…`, manifest `aaec6f…`); the frozen-schema validator
(`validate_expected_catalog` / `assemble` / `_validate_*`) is byte-unchanged in
range — round-1/round-2 fidelity holds. Every round-2 P2/P3 I raised is now
closed, and I found no new findings and no regression. Counts for this delta:
P0=0, P1=0, P2=0, P3=0.

## The four gate checks

1. **Lockdown fires before any side effect and covers every seam incl. PG_DUMPALL —
   confirmed.** `assert_production_seam_lockdown(run_root)` is called in `run_plan`
   after `_plan_run_root` (pure path validation, no mkdir) and _before_
   `ensure_directory(run_root)`, the request build, and `capture()`; the only prior
   step is the read-only credential-file owner check, so no run dir, docker
   resource, or process exists when it fires. `PLAN_TEST_SEAM_ENV` = {RESTORE*MODE,
   RESTORE_IMAGE, SOURCE_CONTAINER, MIGRATION_APPLY, DRILL, FAULT, PG_DUMP,
   PG_DUMPALL, PSQL, DOCKER} — I grepped every `os.environ.get("MC2_Q12_PLAN*_")`read in lifecycle-core and the capture helper and it is exactly these ten (the`MC2*Q12_PLAN_ISOLATE*_`/`REPO_ROOT`names are child env the plan *sets*, not
seams it reads, and`MC2_Q12_RESTORE_PERSIST_HANDLE`is the drill's own
validated input). The guard only engages when`run_root`matches`/opt/megacampus/backups/q12/[^/]+`; `/tmp/mc2-q12-plan-\*`roots still allow
seams. The`it.each(SEAMS)` test proves all ten fail closed in production shape,
   the clean-env case proceeds, and a /tmp root still accepts a seam.

2. **P2-2 test drives the REAL drill bytes — confirmed.** `drillWritePersistHandle()`
   slices the exact `write_persist_handle() {` … `\nPY\n}` bytes out of
   `restore-supabase-drill.sh`, sources them into a bash harness, and invokes the
   real function; the emitted file is then read by the real
   `core.LivePlanExecutor()._read_handle` (module loaded from the real
   lifecycle-core). Positive asserts `ACCEPT mc2-c restore_test`; the negative drops
   `volume` and asserts `_read_handle` rejects. This is a genuine emitter↔consumer
   byte binding, not a re-implementation, so a future field rename in the drill
   fails CI instead of only the live window — exactly the drift closure I asked for.

3. **Label sweep cannot touch a different run — confirmed.** `_label_sweep` filters
   on `label=com.megacampus.q12.plan-run=<run_id>` and
   `label=com.megacampus.q12.restore-run=<run_id>`, where `run_id` is this run's
   validated UUID4; Docker `--filter label=key=value` is exact-value equality. The
   real drill labels its container/network/volume `com.megacampus.q12.restore-run=$RUN_ID`
   with the plan-passed `--run-id`, so the restore-run leg matches this run's
   drill resources and nothing else. A different run carries a different label
   value and is never listed, so it can never be `rm -f`/`network rm`/`volume rm`-ed.
   The sweep is a best-effort second pass (check=False, per-resource error capture)
   after the named teardown, so on the happy path the filtered list is already empty.

4. **No weakening — confirmed.** Frozen bytes and the frozen validator are
   unchanged; the lockdown is purely additive and production-scoped (test path
   untouched); the coordinator gains a 30 s `select()` bound that fails closed on a
   silent source (the previous `readline` still runs once readable); capability +
   secrets cleanup is additive and guarded by `secrets_existed` so a pre-existing
   operator `secrets/` dir is never `rmtree`d; the `PlanExecutor` Protocol now
   declares `teardown`; the roles change is a documentation comment recording the
   `pg_*` divergence. Nothing verified in rounds 1–2 is relaxed.

## Round-2 findings now closed

P2-1 (production seam lockdown), P2-2 (real-drill handle↔`_read_handle` binding),
P3 coordinator readline timeout, P3 malformed-handle-after-persist teardown gap
(label sweep), P3 synthetic capability/secrets leftover, P3 Protocol `teardown`
declaration, and the informational §3 `pg_*` divergence (now documented) are all
resolved in this range. The round-2 P3 binary-override ownership check remains
open but is subsumed by P2-1 in production (the DOCKER/PSQL/PG_DUMP overrides are
now rejected outright in a production run), so it is no longer live-window
relevant.
