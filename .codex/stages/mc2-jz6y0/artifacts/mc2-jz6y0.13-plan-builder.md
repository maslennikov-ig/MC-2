---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-plan-builder
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-plan-builder
base_branch: codex/self-hosted-qdrant-platform
base_commit: c1d0ca611fb5106d2a6752e3a755817948be92fd
worktree: /home/me/code/mc2/.worktrees/q12-plan-builder
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-plan-builder and branch
  codex/q12-plan-builder left in place for orchestrator integration; no push.
  Disposable postgres:17.10-bookworm resources from the real-PG17 suites are
  reclaimed on each run (executor teardown + fake-drill/test cleanup); post-run
  docker filters show zero leftovers.
risk_level: medium
verification:
  - 'Round-12 preserve equality-diff payloads RED->GREEN: 33e27794 -> c06f3a54. Surgical argv-gated seam so the full cloud-source-vs-pinned-image divergence survives for a product-truth ruling (the first-10 summary died with the workdir). New plan flag --keep-equality-diagnostics (argv, NOT env — production seam lockdown still rejects env seams): on equality failure the plan writes 3 owner-only files into <run_root>/equality-diagnostics/ (0700 dir, 0600 files) — source + isolate canonical payloads + the FULL unbounded diff (_structural_catalog_diff gained max_ids/max_lines=None); run_plan preserves the created run dir when diagnostics were written (else removed as before). No scrub needed: the frozen SQL stores subscription conninfo as connection_sha256 and carries no cron/row data, so the payload is secret-free by construction. Real-PG17 q12-migration-plan.test.ts: 52 passed — incl. flag-on preserves the 3 files with q12_drift_probe in the isolate payload + full diff; flag-off writes no diag dir. No-docker adds 2 cases (unbounded diff = 50 identifiers; run-dir preservation exception). tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql all byte-identical.'
  - 'Round-11 structural equality-proof diff diagnostics RED->GREEN: d28bdae1 -> 5ebeeaca. Makes the opaque structural-sha mismatch (rehearsal #4) self-diagnosing WITHOUT touching the frozen q12-structural-catalog.sql (verified byte-identical). capture.py --structural-payload selects the query's `payload` column (the exact pre-hash jsonb); the plan eagerly captures the source payload in the snapshot window and, on equality failure, captures the isolate payload and raises a bounded per-section diff (identifiers + sha digests only; statements/values never shown). Real-PG17 q12-migration-plan.test.ts: 49 passed — incl. the round-11 negative where a fake-drill injectDrift creates a function ONLY in the isolate and the error names [functions] + q12_drift_probe; the happy path survives the eager source-payload capture. No-docker adds 2 diff-engine cases (per-section add/remove/change identifiers + digests, 64-hex scrub, bounded output). tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql all byte-identical.'
  - 'Round-10 drill/backup tsx runner RED->GREEN: 268677a1 -> a1b24302. Fixes the rehearsal #3 killer: tsx is a devDependency of packages/course-gen-platform only and is NOT hoisted to the workspace root, so `pnpm exec tsx` from the repo root is unresolvable (ERR_PNPM). run_ts now invokes the package pnpm shim ($PROJECT_ROOT/packages/course-gen-platform/node_modules/.bin/tsx) with cwd=$PROJECT_ROOT + a fail-closed preflight naming the missing shim; backup-supabase.sh gets the same fix (bytes not sha-pinned). Drill suite supabase-restore-drill.test.ts: 47 passed (46 UNMODIFIED + 1 new RED-through-real-bytes runner test that extracts run_ts and proves it resolves via the package shim, not pnpm). Backup suites (operator+schedule): 65 passed (test-mode injection untouched). Plan suite: no-docker 39, real-PG17 46 passed (fake-drill path unaffected). tsc 0; drill+backup bash -n OK; frozen bytes aaec6fc2…/134255ce… intact (backup path in q12-command-manifest.json unchanged).'
  - 'Round-9 drill diagnostics + scheduled-mode RED->GREEN: 4e3fc6fb -> 87d2601c. Real-PG17 q12-migration-plan.test.ts: 46 passed — the end-to-end drill-seam test now proves the plan restores via the drill SCHEDULED mode; the fake drill mirrors the real drill Q12 activation cleanup (runs the real q12_guard.verify_capability() extracted from run-restore-cleanup.ts) in q12 mode and skips it in scheduled mode, reproducing the pre-C1 rehearsal failure (q12) and proving the fix (scheduled). No-docker adds a diagnostics case (_drill_failure_detail labeled stdout+stderr tails, secrets scrubbed, empty-stderr symptom). Drill suite supabase-restore-drill.test.ts: 46 passed UNMODIFIED (persist-seam extension to scheduled mode is env-gated + default byte-identical). tsc exit 0. Frozen bytes aaec6fc2… / 134255ce… intact.'
  - 'Round-8 drill-generation preflight RED->GREEN: 0791805e -> 53b6fcce. Closes the whole generation preflight the server pre-C1 rehearsal fail-closed on (generation basename is invalid). Real-PG17 q12-migration-plan.test.ts: 45 passed — the end-to-end drill-seam test now drives production _produce_generation output through a fake drill that MIRRORS the real drill preflight (basename ERE + validate_generation Python block, both extracted verbatim from the drill bytes), sweeping the full set: generation-<UTCstamp>Z-<uuid> basename, 4-file layout, 0600 modes, checksums schema/generation/files/sha256/size, source-manifest schema. No-docker adds 5 round-8 cases (contract + item-4 run-dir cleanup). Drill suite supabase-restore-drill.test.ts: 46 passed UNMODIFIED. tsc exit 0. Frozen bytes aaec6fc2… / 134255ce… intact.'
  - 'Round-8 broad no-docker ops set (tests/unit/ops/): 876 passed | 59 skipped, 1 pre-existing failure in qdrant-observability-contract.test.ts (Q9 observability: .env.production.example lacks QDRANT_METRICS_GID) — outside the round-8 change surface (round-8 touched only q12-lifecycle-core.py + q12-migration-plan.test.ts + the plan runner fixture; the observability test and its ops/qdrant inputs are untouched).'
  - 'Round-7 hardening RED->GREEN: 4e752470 -> c6ac3a8d (P2-1 seam lockdown, P2-2 handle write/read binding, P3 a-d). Snapshot coordinator: b32ce5ed -> e92ec529. Drill-seam consumption: 0e2cae74 -> a8f355f2. §3 role bootstrap: dc0d9cc6 -> 6a0825fa. Persist seam: 28e75d8c -> 93f01595. Live orchestration: ee04d555 -> 2b6b16ad. Builder: a46c6173 -> 28ec3448.'
  - 'Round-7 real-PG17: 40 passed (all gated tests, drill positive still ends clean through the enhanced teardown + label sweep). No-docker suites: 79 passed | 7 skipped (adds 12 P2-1 seam-lockdown cases + 2 P2-2 handle-binding cases). tsc exit 0.'
  - 'Real-PG17 (MC2_Q12_REAL_PG17=1): 26 passed clean (first try) — incl. the drill-consumption positive that binds source capture + pg_dump to one exported snapshot via the coordinator, and the malformed-snapshot negative that hard-stops before the drill is invoked.'
  - 'Unit + drill (no docker): q12-migration-plan.test.ts + supabase-restore-drill.test.ts = 65 passed | 7 skipped.'
  - 'Real-PG17 (MC2_Q12_REAL_PG17=1): 25 passed — capture, direct-mode end-to-end, drill-seam consumption (fake drill: correct drill argv + persist-handle env, restore_test dbname routing, migrate/capture through the handle, teardown of container/network/volume + handle + generation), malformed-handle fail-closed with zero leaked resource, plus equality-mismatch and teardown-override negatives.'
  - '44 existing drill tests pass UNMODIFIED (default byte-identical); pnpm type-check / tsc --noEmit exit 0; python3 compile OK; drill bash -n OK.'
  - 'Frozen bytes unchanged: q12-command-manifest.json aaec6fc2…, q12-database-barrier.sh 134255ce…; q12-live-cutover.test.ts and all existing tests untouched; frozen pg.restore argv untouched.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-live-cutover.sh
  - deploy/qdrant/q12-migration-plan-capture.py
  - deploy/qdrant/q12-migration-plan-roles.py
  - deploy/postgres/restore-supabase-drill.sh
  - deploy/postgres/backup-supabase.sh
  - packages/course-gen-platform/tests/unit/ops/q12-migration-plan.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-migration-plan-runner.py
  - packages/course-gen-platform/tests/unit/ops/supabase-restore-drill.test.ts
explicit_defers:
  - "Supabase-image-only leg (real drill restore of the real source on the pinned image + real migration CLIs) is CI-unreproducible: the drill checks the pinned image digest / Supabase role bootstrap / extension versions, and the CLIs' security manifests are pinned to the isolated restore of generation-20260716T105950Z (document-evidence-approved.ts:1250-1356). Validated by the owner's server-side pre-C1 `q12-live-cutover.sh plan` run (read-only on the source, fail-closed everywhere, so a defect blocks the window rather than corrupting anything). Loopback needs no --confirm/--allow-remote (document-evidence-approved.ts:648 returns early for 127.0.0.1/localhost/::1 before the remote gate). If prod schema drifted since that generation the manifests fail closed — a correct product-truth outcome, not to be relaxed."
---

# Summary

Round-12 preserves the FULL equality-diff evidence for a product-truth ruling
(`33e27794` -> `c06f3a54`). Rehearsal #5 emitted the round-11 named per-section diff
(extensions ~5, functions ~46, relations/types/schemas/constraints/indexes deltas, a db
comment delta, a courses.difficulty subobject only in the isolate). The source is
PostgreSQL 17.6 on AARCH64, the pinned image is 17.6 on x86_64 — same PG version, so this
is not simple version drift but per-arch/glibc + TLE-restore + deparse artifacts; the
owner needs the full payloads, which previously died with the workdir.

- New plan subcommand flag `--keep-equality-diagnostics` — argv, NOT an env seam, so
  `assert_production_seam_lockdown` still rejects every `MC2_Q12_PLAN_*` env seam in a
  production run. When set AND the equality proof fails, the plan writes exactly three
  owner-only files into `<run_root>/equality-diagnostics/` (0700 dir, 0600 files): the
  source and isolate canonical structural payloads and the FULL unbounded per-entry diff
  (`_structural_catalog_diff` now takes `max_ids`/`max_lines`; None = unbounded).
- `run_plan`s failed-run cleanup gains a documented exception: it preserves the run dir it
  created when equality diagnostics were written under it; everything else
  (containers/volume/network/handle/generation/workdir) is still torn down. Flag off ⇒
  behavior byte-identical to before.
- Scrub confirmation (item 2): reading the frozen SQL's payload assembly, subscription
  conninfo is stored as `connection_sha256` (pre-hashed, never plaintext), and the payload
  carries no cron command text or table row data (structural = schema only). The only free
  text is our own migration-history statements. So the payload is secret-free by
  construction and the preserved copies are written verbatim — scrubbing would corrupt the
  exact diagnostic the ruling needs. The hash/proof itself is untouched.

Round-11 makes the plan's structural-sha equality proof self-diagnosing (`d28bdae1` ->
`5ebeeaca`), after rehearsal #4 got the real drill to complete end-to-end on the pinned
image but the plan's own gate rejected the restore with an opaque
`isolated pre-migration structural catalog differs from the read-only source catalog`.
The drill's OWN baseline-equality compare passed, so the divergence lives in what
q12-structural-catalog.sql hashes BEYOND the drill's compare set.

- Diagnostic capture (no SQL change): the frozen `q12-structural-catalog.sql` emits BOTH
  `payload` (the canonical jsonb) and `structural_sha256` (its hash); the capture helper
  previously selected only the sha. A new `--structural-payload` projection selects the
  `payload` column instead — the exact pre-hash catalog — leaving the SQL byte-identical.
- Self-diagnosis: `_capture_source` eagerly captures the source's structural payload while
  the snapshot window is open (owner-only, under workdir), because the window closes before
  the equality proof runs. On mismatch the plan captures the isolate payload and raises a
  bounded, labeled diff — per top-level section the +added/-removed/~changed counts and up
  to 10 differing identifiers, each with a source/isolate sha digest. It emits ONLY
  identifiers + digests: no data values, no credentials, migration statements collapse to
  their object digest. Both payloads may sit 0600 under the workdir (teardown reclaims
  them); the error tail is the surviving evidence.
- Design sanity-check (item 3): the structural hash is a SUPERSET of the drill's own
  compare. The drill compares source-manifest vs restored catalog for the cutover_snapshot
  and baseline VIEWS (database identity, guarded relations, triggers, cron rows, extensions
  present) and passed. The structural hash additionally binds the full catalog surface the
  drill does NOT compare: extension VERSIONS and their instantiated function/catalog rows
  (the pinned self-hosted image instantiates CREATE EXTENSION at the image's version,
  which can differ from the managed cloud source), publications/subscriptions, comments,
  security labels, event triggers, collations/types/operators, and migration_history
  statements. Those are exactly the diff categories to expect. The structural SQL already
  excludes only the three drill overrides + is database-name-agnostic (line 69 / db_row);
  NO new exclusion or allowlist was added — the frozen barrier consumes the same hash at
  the live window, so weakening the proof would poison the catalog. If rehearsal #5's
  named diff shows a real irreconcilable divergence (e.g. image extension versions), that is
  a product-truth finding for the owner to rule on, not something to paper over.
- RED reproduces it: a fake-drill `injectDrift` variant creates a function ONLY in the
  isolate, so the isolate catalog diverges from the source and the equality proof must fail
  naming `[functions]` + the injected identifier.

Round-10 fixes the drill's tsx runner, which the round-9 diagnostics exposed on rehearsal
#3 (`268677a1` -> `a1b24302`). The self-describing tail read
`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL / Command "tsx" not found`.

- Root cause: `run_ts()` did `(cd "$PROJECT_ROOT" && /usr/bin/pnpm exec tsx "$@")`, but tsx
  is a devDependency of `packages/course-gen-platform` ONLY, not hoisted to the workspace
  root, and there is no hoist config — `pnpm exec tsx` from the repo root is unresolvable
  everywhere (server AND dev; `node_modules/.bin/tsx` at the root is absent). The drill's
  tsx leg had never been executable in reality; the fake pnpm in the suite masked it. This
  also broke the real C-window drill run and the scheduled backup (both run as root with
  PATH=/usr/sbin:/usr/bin:/sbin:/bin), so the fix repairs the live cutover path, not just
  plan mode.
- Fix: `run_ts()` invokes the package's own pnpm-generated shim directly
  (`$PROJECT_ROOT/packages/course-gen-platform/node_modules/.bin/tsx`), keeping
  cwd=$PROJECT_ROOT for the scripts' relative-path expectations. The shim is a `#!/bin/sh`
  script that execs `node` (resolved on PATH — /usr/bin/node on the server) with tsx's
  cli.mjs, and each machine's pnpm install regenerates it with that machine's absolute
  NODE_PATH. A fail-closed preflight in `parse_arguments` names the missing shim instead of
  surfacing an opaque ERR_PNPM mid-restore. NOTE: the team-lead's assumed shim shebang
  `#!/usr/bin/env node` is actually `#!/bin/sh` + internal `exec node` — the node-on-PATH
  assumption still holds and is stated in the script comment.
- Sweep of other pnpm-exec/tsx/node resolution in the drill + helpers:
  - `backup-supabase.sh:585` had the SAME `/usr/bin/pnpm exec tsx` bug (scheduled backup +
    cutover backup). Its bytes are NOT sha-pinned (only its PATH string appears in the
    frozen `q12-command-manifest.json`, whose sha is unchanged), so it is fixed with the
    same shim + preflight; its test-mode injection (which bypasses this line) is untouched
    and its 65 tests pass.
  - The plan's own node/tsx sites (`_produce_source_manifest`, `_apply_real_cli`) use
    `node --import tsx` with cwd=packages/course-gen-platform, so tsx resolves from the
    package's node_modules — consistent with the shim rule; they worked on the server and
    are left as-is (noted).
  - The helper shebangs (`#!/usr/bin/env -S pnpm exec tsx` on run-restore-cleanup.ts,
    q12-source-manifest.ts, generate-role-bootstrap.ts) are the same broken pattern but
    COSMETIC — every call site invokes them via a runner (tsx/`node --import tsx`), never
    executes them directly — so they are left unchanged and noted.
- RED reproduces the killer honestly: a new drill-suite test extracts the real `run_ts()`
  bytes and runs them in an env with the package shim present but NO root-resolvable tsx;
  the old runner fails, the shim runner succeeds.

Round-9 adds drill failure diagnostics and fixes the next mock-reality drift the pre-C1
rehearsal exposed (`4e3fc6fb` -> `87d2601c`). Rehearsal #2 passed the generation preflight
but died at the drill with an EMPTY detail (`isolated drill restore failed:` with nothing
after it); teardown was again perfect, which also destroyed the evidence.

- Diagnostics (primary): `_restore_via_drill` streams the drill's stdout AND stderr to
  owner-only (0600) files under the plan workdir and, on failure, raises a LifecycleError
  carrying the labeled last-60-line tail of BOTH streams with secret shapes scrubbed
  (`_scrub_plan_secret_text`: libpq URIs, service/pgpass passwords, 64-hex secrets,
  JWT/service-key shapes). The empty stderr was the symptom of a mid-drill step run
  without a `|| fail` wrapper: `set -e` exits with the reason on stdout, which the old
  code never captured. The tail now lands in the caller's log even though teardown
  reclaims the files.
- Root-cause fix (the concrete killer the sweep found): the plan restores a read-only
  PRE-cutover source, which has no `q12_guard` schema, but the drill's Q12 activation
  cleanup requires it — `run-restore-cleanup.ts` runs `q12_guard.verify_capability()` and
  `generate_cleanup_sql` emits `DROP SCHEMA q12_guard CASCADE`. The fake drill skipped
  that whole path, so CI never saw it. The plan now uses the drill's SCHEDULED mode (no
  capability, no activation cleanup — the same restore/role-bootstrap/extension/catalog
  compare), and the opt-in persist seam is extended to scheduled mode so the live isolate
  is still handed back to capture and migrate. Q12 mode and the real cutover path are
  untouched; the seam stays default byte-identical. `_prepare_capability` and the synthetic
  capability are removed. RED reproduces it via a fake drill that mirrors the real Q12
  activation cleanup (running the real `verify_capability()` extracted from the helper
  bytes) in q12 mode and skips it in scheduled mode.

Post-preflight sweep of the drill's Q12 path (each check vs the plan's scheduled-mode
generation; verified against the drill + helper bytes):

- generation basename / 4-file layout / 0600 modes / checksums schema+generation+sha256 /
  source-manifest schema — satisfied (round-8, enforced end-to-end by the mirrored fake
  drill).
- capability file content/shape — no longer applicable: scheduled mode takes no capability
  (`scheduled restore must not receive a Q12 capability`), and the capability CONTENT was
  only consumed by `run-restore-cleanup.ts` in Q12 mode, which the plan no longer uses.
- roles.sql / §3 role bootstrap (`generate-role-bootstrap.ts` + `verify-inventory`) — runs
  identically in scheduled mode; the source-manifest roles are the real
  `q12-source-manifest.ts` output. Satisfied on a faithful restore (server-validated).
- `create_database_sql` (cutover_snapshot.database name==postgres, owner, encoding, locale,
  acl, settings, role_settings) and `verify_extensions_and_toc` (cutover_snapshot.extensions
  - pinned image defaults) — consumed from the real manifest; mode-independent. Server-validated.
- archive TOC (`pg_restore --list`) + pgTLE offline scan + strict `pg_restore` restore — run
  in both modes; the fake drill exercises its own `pg_restore` into restore_test, but the
  pinned-image (17.6) `pg_restore` of the host `pg_dump` (17.x) archive is NOT CI-reproducible
  (needs the pinned Supabase image). FLAGGED: a host `pg_dump` newer than the image
  `pg_restore` could fail with an unsupported archive-format-version header exactly here; the
  new diagnostics will name it if it is the next failure. This stays on the server-validated
  boundary (decision B).
- Q12 activation cleanup (`generate_cleanup_sql` + `run-restore-cleanup.ts`) — REMOVED from
  the plan path by the scheduled-mode switch (the fix above).

Round-8 closes the whole drill generation preflight (`0791805e` -> `53b6fcce`), after
the server pre-C1 rehearsal fail-closed at the real drill with `generation basename is
invalid` (teardown was clean, so the safety contract held — this is the mock-reality
drift class the rehearsal is designed to catch).

- Root cause + fix: `_produce_generation` named the dir `generation-<16hex>`, but the
  drill requires `^generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$`
  (`restore-supabase-drill.sh` parse_arguments). `_generation_dirname` now builds
  `generation-<UTCstamp>Z-<run uuid>`; the stamp is bound once per run in `capture()`
  (deterministic per run, not per retry).
- Second latent mismatch (would have failed the very next check): the drill's
  `validate_generation` requires `checksums.json` carry `generation == basename`;
  `_write_checksums` omitted it. Now recorded.
- Full-set sweep instead of one field: the fake drill now MIRRORS the real drill's
  preflight — the basename ERE and the `validate_generation` Python block are extracted
  verbatim from the drill bytes (the P2-2 real-bytes technique) and run against the
  plan's actual generation before any resource is created. The real-PG17 end-to-end
  drill test therefore enforces the identical set the server drill does: 4-file layout,
  0600 modes, `checksums` schema/generation/files/sha256/size, `source-manifest` schema.
  A future drill preflight change now fails CI, not the live window. (The one real-drill
  check not mirrorable in CI — `pg_restore --list` TOC + pgTLE offline scan — needs the
  pinned Supabase image; the fake drill still does its own `pg_restore` into
  `restore_test`, and the real leg stays validated by the server pre-C1 run.)
- item-4 (leftover run dir): a failed pre-emission `run_plan` now removes ONLY a run dir
  it created; a caller-provided/pre-existing dir is preserved. The rehearsal's leftover
  `/opt/megacampus/backups/q12/49eca245-…` was an empty run dir left after teardown
  reclaimed capability/secrets; a failed pre-emission run now cleans the dir it made.

Round-7 is the final review-hardening pass (`4e752470` -> `c6ac3a8d`): 2 P2 + 4 P3.

- P2-1 production seam lockdown: `assert_production_seam_lockdown` makes a production
  plan run (run root under `/opt/megacampus/backups/q12`) reject any set
  `MC2_Q12_PLAN_...` test-seam environment variable by name, which also pins the
  drill restore mode and the pinned image (those diverge from the default only when
  their seam is set). Test seams stay usable with an explicit `/tmp/mc2-q12-plan-...`
  run root, which the seam-driven CI suites use.
- P2-2 anti mock-drift: a docker-free test drives the REAL `write_persist_handle`
  from `restore-supabase-drill.sh` and asserts the REAL `_read_handle` accepts its
  exact bytes and rejects a dropped field, so a future drill handle-field change
  fails CI instead of the live window.
- P3a: a bounded `select()` timeout on the snapshot-coordinator readline (a stalled
  source psql fails closed instead of blocking). P3b: teardown reclaims the synthetic
  capability file and the plan-created secrets dir. P3c: `teardown()` is declared in
  the `PlanExecutor` Protocol. P3d: teardown does a second-pass docker sweep by both
  the plan isolate label and the drill restore label for the run id, so a
  malformed-handle-after-persist path cannot leak a resource whose name never
  reached us.
- Notes: ownership checks on the binary-override seams were intentionally skipped —
  subsumed by P2-1 rejecting those seams in production. The §3 helper's documented
  divergence from `generate-role-bootstrap.ts` (the capture projection drops the
  PostgreSQL built-in roles and edges rather than doing the TS `pg_participants`
  cross-check) is recorded in `q12-migration-plan-roles.py` with rationale.

Round-6 fixed a real production-path defect and added snapshot coordination
(`b32ce5ed` -> `e92ec529`): `_produce_source_manifest` called
`q12-source-manifest.ts capture` with no `--snapshot`, which the CLI hard-rejects
(q12-source-manifest.ts:1440-1441). Rather than only add a flag, the generation
production now mirrors the reviewed backup coordinator (backup-supabase.sh:853-883):
`_open_snapshot_coordinator` opens ONE `REPEATABLE READ READ ONLY` session on the
source (host psql over the libpq service in production, `docker exec` for CI),
exports and fail-closed validates a `pg_export_snapshot()` id
(`^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$`), and keeps it open until the source
capture, dump, and manifest all read that instant. The source
structural/guarded/cron/frontier capture (`q12-migration-plan-capture.py` gained a
validated `--snapshot` -> `SET TRANSACTION SNAPSHOT`), `pg_dump --snapshot=`, and
the manifest `capture --snapshot` all bind to the exported snapshot; a dead
coordinator or malformed id hard-stops before any restore, and teardown closes the
session (COMMIT + `\q`). Cluster roles are not MVCC-snapshotted, so — like the
reviewed backup (backup-supabase.sh:589-614) — `roles.sql` is exported before and
after the snapshot-bound work and must be byte-identical after removing only the
PG17 `\restrict`/`\unrestrict` nonce pair; role drift during the window hard-stops.

Wired production `LivePlanExecutor` to restore through the reviewed
`restore-supabase-drill.sh` via its persist seam instead of the direct
`pg_dump | pg_restore` path (now a test-only seam, `MC2_Q12_PLAN_RESTORE_MODE=direct`).
Round-5 RED->GREEN: `0e2cae74` -> `a8f355f2`.

- `_produce_generation`: a diagnostic backup generation (NOT the accepted
  recoverable backup) — `database.dump` and `roles.sql` streamed read-only,
  `source-manifest.json` via the reviewed `q12-source-manifest.ts` in production
  (placeholder under a CI source container), `checksums.json` computed.
- `_restore_via_drill`: invoke the drill with a synthetic run capability and
  `MC2_Q12_RESTORE_PERSIST_HANDLE`, then parse and fail-closed validate the
  owner-only 0400 handle (schema_version / run_id / host / int port / restore_test).
- `_read_handle` + dbname routing: migrate and capture run against the handle's
  `restore_test` connection; the capture helper gained a validated `--dbname`
  (`q12-migration-plan-capture.py`) so it never silently reads `postgres` when the
  drill restored into `restore_test`. Source `guarded_relations`/`cron_jobs`/
  `baseline`/`frontier` still come from the SOURCE capture (live OIDs the barrier
  re-matches); the isolate contributes only checkpoint structural shas and relation
  deltas.
- `teardown` reclaims the drill's container/network/volume PLUS the persist handle
  and the diagnostic generation; a teardown failure overrides success.

Load-bearing justification for reusing the drill's `restore_test` (team-lead item 3):
`q12-structural-catalog.sql` has no database-name field in `database_row`
(lines 33-88 build owner/encoding/locale/acl/settings/comment/… but never
`datname`; `current_database()` appears only in the WHERE at line 88) and excludes
the three drill overrides from the settings hash (`default_transaction_read_only`,
`cron.database_name`, `cron.launch_active_jobs` at line 69), so the source
`postgres` and the isolated `restore_test` yield the same structural sha — the
pre-migration equality proof holds against the drill restore. The one real
database-property difference the real drill replicates is the db comment; the CI
fake drill replicates it too.

# Verification

- Drill-consumption RED (`0e2cae74`, impl absent): both fake-drill tests failed
  (no drill invocation). GREEN (`a8f355f2`) they pass.
- Real-PG17 (`MC2_Q12_REAL_PG17=1`): `25 passed`. The fake-drill test restores into
  `restore_test`, publishes a 0400 handle, and asserts LivePlanExecutor passed the
  drill `--run-id`/`--generation`/`--q12-db-capability-file` argv + the
  `MC2_Q12_RESTORE_PERSIST_HANDLE` env, migrated/captured `restore_test` through the
  handle, emitted a barrier-valid catalog (76 guarded, observability delta =
  `document_evidence_observability_totals`), and tore down container+network+volume
  - handle + generation (zero leftovers). The malformed-handle case fails closed
    with no leaked resource. Direct-mode end-to-end, equality-mismatch, and
    teardown-override still hold; the §3 role bootstrap still gates the restore.
- Unit + drill (no docker): `65 passed | 6 skipped`; 44 existing drill tests
  unmodified; `tsc` exit 0; frozen bytes re-verified; `q12-live-cutover.test.ts`
  untouched.
- P3 (team-lead item 4): the migration CLIs run in loopback mode with only
  `SUPABASE_DB_URL` — `validateDocumentEvidenceApprovedMigrationTarget`
  (document-evidence-approved.ts:634) returns at :648 for 127.0.0.1/localhost/::1
  BEFORE the `--allow-remote`/`--confirm`/sslmode gate; `apply` applies all three
  base files and observability `apply-all` applies both. Loopback accepts the
  `restore_test` dbname (the URL path segment is the database).

# Risks / Follow-ups

- The Supabase-image-only leg (real drill + real source + real CLIs, and the real
  `q12-source-manifest.ts` generation) is server-validated per decision B; CI proves
  the whole consumption mechanics with a fake drill on vanilla PG17. This boundary
  is intentional and fail-closed (the pre-C1 run is read-only on the source), so a
  defect blocks the window rather than corrupting anything — see `explicit_defers`.
- The gated real-PG17 suite's container-readiness race is fixed: EVERY `pg_isready`
  wait in the file (the round-2 capture test at :387, both `beforeAll` sources at
  :652/:1053, and the fake-drill script at :1123) is now marker-gated on
  "PostgreSQL init process complete; ready for start up." — the temp init server
  stops before that line prints, so a post-marker `pg_isready` reflects only the
  final server and setup can never land in the restart window. Re-verified stable
  across four consecutive `MC2_Q12_REAL_PG17=1` runs (25 passed each). The suite is
  skipped without the flag, so the default path is deterministic and docker-free.
- The drill persist seam (round 3) and the direct restore + §3 bootstrap (round 4)
  remain: the seam is the reuse point this stream consumes; the direct path stays as
  the CI seam and is not reachable in production.
