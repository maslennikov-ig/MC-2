---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-plan-live-review-r2
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/self-hosted-qdrant-platform
base_branch: master
base_commit: 7764cfb4
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only review; single write is this artifact. No branches/worktrees/docker resources created.'
risk_level: low
verification:
  - 'Pinned to git show/diff of range 7764cfb4..7ba8f372 (50 commits, rounds 8-19), read from the merged/pushed codex/self-hosted-qdrant-platform worktree; tree clean at HEAD 7ba8f372.'
  - 'Frozen bytes at 7ba8f372: sha256(q12-database-barrier.sh)=134255ce…, sha256(q12-command-manifest.json)=aaec6fc2…, sha256(q12-structural-catalog.sql)=0b8a943f… — all match the pinned values; barrier + manifest not in the range diff.'
  - 'git diff confirms validate_expected_catalog / assemble_expected_catalog / _validate_* are byte-unchanged in range — the clause-for-clause frozen-barrier mirror from rounds 1-2 still holds.'
  - "Read the full delta-composed prediction engine (_compose_identity / _index_by_identity / _check_restore_completeness / _compose_predicted_payload / _compose_checkpoint_hash / _render_payload_hash), MIGRATION_MODIFIED_IDENTITY_ALLOWLIST, the secret scrub + diff engine, capture()'s new flow, teardown, _lift_isolate_read_only, and the capture-helper --structural-payload / --render-hash modes."
  - 'Read the round-13 and round-19 composed==real real-PG17 CI tests, the round-13 unit engine suite, and the negatives; confirmed they compute the REAL post-migration source hash independently and assert byte-equality (incl. the seeded old-function CREATE OR REPLACE path).'
  - 'Read the frozen q12-structural-catalog.sql foreign-server/user-mapping/subscription projections to confirm secret VALUES are hashed (value_sha256 / connection_sha256), never emitted raw.'
  - 'Read the document-evidence-approved.ts / observability-index.ts diffs (frontier repair, search_path-independent reg*-name + pgcrypto checks) and the new frontier + pgcrypto unit tests and the reworked integration negatives.'
  - 'Read the restore-supabase-drill.sh + backup-supabase.sh diffs (tsx shim + fail-closed preflight, scheduled-mode persist-seam gate) and confirmed scheduled mode skips only the q12_guard activation cleanup, not restore verification.'
  - 'Confirmed production seam lockdown (assert_production_seam_lockdown over the 10 MC2_Q12_PLAN_* seams) is still called in run_plan before any side effect and unchanged.'
  - 'Did NOT run docker/suites/server mutations (constraint); relied on orchestrator evidence: rehearsal #13 (run f4afe952, release 7ba8f372) fully succeeded — status planned, catalog sha de9e6b03…, teardown clean.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-migration-plan-capture.py
  - deploy/postgres/restore-supabase-drill.sh
  - deploy/postgres/backup-supabase.sh
  - packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts
  - packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts
  - packages/course-gen-platform/tests/unit/ops/q12-migration-plan.test.ts
  - packages/course-gen-platform/tests/unit/ops/supabase-restore-drill.test.ts
  - packages/course-gen-platform/tests/unit/scripts/document-evidence-frontier.test.ts
  - packages/course-gen-platform/tests/unit/scripts/document-evidence-pgcrypto.test.ts
  - packages/course-gen-platform/tests/integration/document-evidence-approved-migrations.test.ts
explicit_defers:
  - "P3-1: _prepare_capability is now dead code (plan switched to the drill's scheduled mode, no capability) — teardown's capability/secrets branches are never exercised; harmless, remove for clarity post-C1."
  - 'P3-2: round-16 frontier assertion relaxed (no longer requires every pre-chain history to match a repo file; only forbids unreviewed history newer than the frozen frontier 20260704150249) — correct for MCP-stamped history and backstopped by the frozen barrier at cutover; flagged for explicit C1 awareness, no fix required.'
  - 'P3-3: --keep-equality-diagnostics preserves secret-free structural payloads under <run_root>/equality-diagnostics/ (0600, not teardown-reclaimed); do not pass the flag in C1 unless a ruling needs it, sweep afterward.'
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
No P0, no P1, no P2. Findings: three P3 (all defense-in-depth / hygiene), zero
blocking. C1 is clear from this review.

All three frozen artifacts are byte-identical to their pinned sha256, and the
frozen-barrier catalog validator (`validate_expected_catalog` and helpers) is
byte-unchanged in the range — the clause-for-clause mirror verified in the earlier
rounds still holds. The round-13 §2 method correction and the round-19 allowlist
change _how the per-migration `catalog_sha256` is predicted_, not what the barrier
enforces: at cutover the frozen barrier independently recomputes the real live
post-migration structural hash and compares it to the catalog, so a wrong
prediction can only **block** the cutover (fail-closed), never let a wrong catalog
through. The composition is additionally proven correct empirically: the round-13
and round-19 real-PG17 CI tests apply the exact five migration files directly to a
seeded source and assert the composed `catalog_sha256` equals the independently
computed real post-migration hash — including the seeded old-function
CREATE OR REPLACE path that exercises the single allowlist entry. Rehearsal #13
(release 7ba8f372) then succeeded end-to-end on the real server (catalog
de9e6b03…, teardown clean).

The one materially security-relevant behavioral change — the round-16 frontier
relaxation — is sound (see Verification) and does not open a cutover hole because
the frozen barrier remains the binding gate; it is recorded as P3-2 for explicit
C1 awareness only.

# Verification

## Frozen surface and fail-closed invariants (not weakened)

- Frozen bytes intact: barrier `134255ce…`, manifest `aaec6fc2…`, structural
  catalog `0b8a943f…`. `validate_expected_catalog` / `assemble_expected_catalog`
  / `_validate_*` unchanged in range.
- Production seam lockdown unchanged and still invoked in `run_plan`
  (`assert_production_seam_lockdown(run_root)`) before `ensure_directory` / request
  / capture, over all ten `MC2_Q12_PLAN_*` seams.
- Fault injection stays fail-direction only: `fault=="equality"` now drops a
  source object from the isolate view → object-INCOMPLETENESS → fatal;
  `fault=="snapshot"` → invalid snapshot id → abort before restore;
  `fault=="teardown"` → raise after all real reclamation. None makes a failing
  path pass.
- New hard stops all fail closed with no catalog emitted (proven by negatives):
  missing source object in the restore (`_check_restore_completeness`), a migration
  that REMOVES a pre-existing entry, and a migration that MODIFIES a non-allowlisted
  pre-existing entry (`_compose_predicted_payload`, fail-once aggregation).

## Delta-composed prediction (round-13) — sound and proven

The predicted live post-migration payload = SOURCE content for pre-existing
(unmodified) identities + isolate content for FRESH identities, delta-neutral
restore-artifact EXTRAS excluded, ordered by the isolate checkpoint order (which is
identity-determined and equals live order because `_COMPOSE_IDENTITY_KEYS` is a
superset of every section's ORDER BY key and the dump-unstable fields — column
attnum `position`, comment `subobject_id` — are kept in CONTENT, not identity).
The payload is hashed THROUGH postgres (`--render-hash`: `…::jsonb::text` then
`extensions.digest`, dollar-quoted with a reserved-tag guard and a `json.loads`
pre-check — no injection), so it is byte-comparable to the frozen SQL/barrier hash.
The round-13 CI test seeds a source with a check-constraint written to renormalize
on dump/restore and a dropped-column attnum gap, runs the plan, then applies the
same migrations to the source and asserts composed == real at both checkpoints —
a genuine, non-self-referential byte-equality proof.

## Round-19 allowlist — modification-only, single-identity, sound composition

`MIGRATION_MODIFIED_IDENTITY_ALLOWLIST` has exactly one entry
(`functions: schema=public|name=auto_answer_questions_atomic|identity_arguments=p_course_id uuid|kind=f`).
For an allowlisted MODIFIED identity the composer takes the ISOLATE POST content
(the migration's CREATE OR REPLACE fully overwrites the object, so live POST ==
isolate POST on the identical migration SQL / pinned PG 17.6). A REMOVED
pre-existing entry is always fatal (never allowlisted); any modified identity not
on the list is fatal. The round-19 CI test pre-seeds the OLD function from the
exact prod-producing repo file so the window MODIFIES (not adds) it, and asserts
composed == real stays byte-equal — the precise case CI previously missed
(disclosed honestly in the test comment).

## Restore completeness and the barrier backstop

`_check_restore_completeness` makes MISSING source identities absolutely fatal and
tolerates only delta-neutral EXTRAS (excluded from the composed payload; an extra
that mutates/disappears across checkpoints hard-stops in `_compose_predicted_payload`).
Because the composed hash feeds `migrations[].catalog_sha256`, and the frozen
barrier recomputes the real live hash and compares at cutover, the whole
prediction chain is fail-closed end-to-end.

## CLIs (cutover-time live checks)

- **search_path-independence (round-18):** `requireSupabaseHistory`,
  `relationExists`, `totalsRelationExists`, and `assertPgcryptoDigestDependency`
  moved from `to_reg*(...)::text` string comparison (which drops the schema when it
  is on the session search_path — the exact reason the pgcrypto check failed
  against the real §3 postgres role `search_path="$user", public, extensions`) to
  `IS NOT NULL` existence on qualified inputs plus explicit catalog-fact assertions
  (`digest_schema='extensions'`, `digest_name='digest'`, `digest_arguments='bytea, text'`,
  result type/language/secdef/config). This STRENGTHENS the check and removes a
  latent search_path trap; the round-18 test runs the real check with `extensions`
  on the path (the shape that failed before).
- **frontier repair (round-16):** see P3-2. Anti-drift preserved: unknown history
  strictly newer than the frozen frontier, a version between frontier and the first
  chain version, a gapped prefix, and duplicate versions all still throw (unit +
  integration negatives). The repository-tree manifest pin
  (`REPOSITORY_MIGRATION_MANIFEST_SHA256`) is retained.
- **read-only override lift (round-17):** `_lift_isolate_read_only` mutates only
  the disposable loopback isolate (`restore_test`/`postgres`), the lifted GUC is
  excluded from the frozen structural settings hash, and it verifies `off` on a
  fresh connection before migrating (fail-closed otherwise).

## Secret hygiene

The frozen structural payload is secret-free by construction: subscription
`subconninfo` → `connection_sha256`, and every foreign-server `srvoptions` and
user-mapping `umoptions` VALUE → `value_sha256` (only option NAMES are cleartext),
with no cron command text or row data. So the opt-in
`equality-diagnostics` payloads (0600, owner-only) carry no secrets. All surfaced
diagnostics — the structural diff, `_compose_*` violation messages, and the drill
stdout/stderr failure tails — go through `_scrub_plan_secret_text` (libpq URI
password, `password=`, 64-hex secret, JWT/`sbp_`) and emit object values only as
sha digests. The libpq service file with the source password stays 0600 under the
teardown-reclaimed workdir.

## Teardown and tests

Teardown reclaims coordinator, container, volume, network, handle, generation,
capability, secrets, workdir, plus the run-id-scoped label sweep (plan-run +
drill restore-run). Drill stdout/stderr and the source structural payload live
under the workdir and are reclaimed. Tests were not weakened to force green: the
composed==real proofs compute the real hash independently; the reworked
integration negatives replace an obsolete premise (every history == a repo file,
now false under MCP) while KEEPING the drift/gap rejections and adding
newer-than-frontier and between-frontier negatives; `--render-hash` rejects
non-JSON and the reserved dollar-quote tag.

# Risks / Follow-ups

- **P3-1 (confidence high) — dead capability code.** The plan now drives the drill
  in scheduled mode (`--scheduled-run-id`, no capability), so `_prepare_capability`
  is defined but never called and the teardown `capability`/`secrets` branches are
  never exercised. Harmless (no capability file is created), but stale. Next
  action: remove `_prepare_capability` and the two resource keys post-C1.

- **P3-2 (confidence medium) — round-16 frontier relaxation.** The CLI no longer
  requires every pre-chain history version to match a repository file; it only
  forbids unreviewed history strictly newer than the frozen frontier
  `20260704150249` and still requires the chain to be a clean prefix. This is the
  correct and necessary fix for MCP-stamped apply-time history and provides
  equivalent anti-drift (proven by the frontier unit test + integration
  negatives), and the frozen barrier independently re-verifies the live
  post-migration catalog (guarded relations, per-migration `catalog_sha256`,
  frontier) at cutover, so it does not open a cutover hole. Next action: none
  required; noted so C1 operators know the CLI trusts history at/below the frontier
  without repo cross-reference, with the barrier as the binding gate.

- **P3-3 (confidence low) — preserved diagnostics persistence.** With
  `--keep-equality-diagnostics`, secret-free structural payloads + the full diff
  are written under `<run_root>/equality-diagnostics/` (0600) and are NOT reclaimed
  by teardown (intentional, for a product-truth ruling). Production runs without
  the flag create nothing. Next action: do not pass the flag in C1 unless a ruling
  needs it; sweep `<run_root>/equality-diagnostics/` afterward.

- **Informational — dbname interpolation.** `_lift_isolate_read_only` interpolates
  `dbname` into `ALTER DATABASE "{dbname}" SET …` without escaping; today `dbname`
  is a fixed/validated value (`restore_test` from the owner-checked handle, or
  literal `postgres`), so there is no injection. Relies on that invariant holding.
