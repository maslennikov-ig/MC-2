---
schema_version: orchestration-artifact/v1
artifact_type: accepted-w-evidence
task_id: mc2-jz6y0.13.10
stage_id: mc2-jz6y0
agent_type: writer-barrier-worker
repo: mc2
branch: codex/q12-w-activation-tuple
base_branch: codex/q12-w-writer-barrier
base_commit: 60910053455ac9af978c7951a562172e39623ca2
worktree: /home/me/code/mc2/.worktrees/q12-w-activation-tuple
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: worktree retained pending independent review; no accepted-W code path changed (barrier script untouched; extraction, tracked evidence assets, and one additive test only)
risk_level: high
verification:
  - 'node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs -> fields 5-10 reproduce byte-identically; emits the three tracked JSON assets deterministically'
  - 'git rev-parse 60910053 (the accepted W integration base commit) -> 60910053… (field 1); sha256sum deploy/qdrant/q12-command-manifest.json -> aaec6fc2… (field 2); sha256sum deploy/qdrant/q12-database-barrier.sh -> 3673ee49… (field 4; supersedes the historical 134255ce… value frozen at 60910053 — see the 2026-07-18 AMENDMENT note below)'
  - 'MC2_Q12_REAL_PG17=1 pnpm exec vitest run tests/unit/ops/q12-w-activation-lock-proof-pg17.test.ts -> 2 passed (structural + mechanical PG17 lock proof); catalog-parametric via MC2_Q12_ACTIVATION_CATALOG_FILE'
  - 'pnpm exec vitest run (no flag) -> 1 passed | 1 skipped; prettier --check clean; new files add zero type errors; git diff --check clean'
  - '2026-07-18 AMENDMENT re-verification: node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs re-run against the fixed barrier (sha256 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9) -> fields 5-10 reproduce BYTE-IDENTICALLY (zero change to the three tracked JSON assets); confirms field 7 activation_recovery_slice_sha256 is barrier-independent as well as catalog-independent. Only field 4 changes.'
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs
  - packages/course-gen-platform/tests/unit/ops/q12-w-activation-lock-proof-pg17.test.ts
  - deploy/qdrant/q12-activation-lock-catalog.test-reference.json
  - deploy/qdrant/q12-activation-lock-order.test-reference.json
  - deploy/qdrant/q12-managed-session-inventory-schema.json
explicit_defers:
  - 'LIVE-BOUNDARY RE-FREEZE CHECKLIST (single owner/live gate): field 11 managed identity roster + production re-freeze of fields 5/6/8/9 (catalog-bound hashes). See the checklist section.'
---

# Summary

Accepted-W evidence freezing the D6 activation tuple required by
`docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md`
(branch `codex/q12-d6-activation-truth`, `6183d87b`, lines 144-157). Derivation-only:
every field is derived from accepted bytes at `60910053` with an exact reproduction,
or routed to the live-boundary gate. No value is synthesized from general knowledge.
The barrier script is untouched (extraction + tracked evidence assets + one additive
test).

Per the orchestrator ruling, fields 5-9 are delivered in **two layers**: Layer 1 is
the tuple-v1 catalog-bound VALUES (test-reference catalog, flagged for production
re-freeze at the live boundary — the production catalog does not exist pre-live by
construction); Layer 2 is the catalog-INDEPENDENT control-flow invariant, the
permanent production-faithful truth, proven by the mechanical PG17 test.

## The tuple (field-by-field)

| #   | Field                              | Value                                                                           | Provenance / disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `w_integration_commit`             | `60910053455ac9af978c7951a562172e39623ca2`                                      | `git merge-base HEAD origin/codex/self-hosted-qdrant-platform` = the accepted W integration base commit (60910053), not the addendum branch HEAD.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | `command_manifest_sha256`          | `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841`              | `sha256(deploy/qdrant/q12-command-manifest.json)` at `60910053`. Contract-conflict RESOLVED (Risks a): historical `af9b21cb…` = sha256 at `c93d766d` (five-command manifest); superseded by the accepted D5J twenty-command expansion at `1817c5e9` → `aaec6fc2…`, i.e. the contract's `:178` "accepted integration successor".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 3   | `activation_barrier_path`          | `deploy/qdrant/q12-database-barrier.sh`                                         | Contract line 149; file present at `60910053`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4   | `activation_barrier_sha256`        | **AMENDED** `f98a2ce42e6b8992d386aab4e97321d439fa31e7ad0dd268f8d61123ead7be1f`  | `sha256(deploy/qdrant/q12-database-barrier.sh)` at the ratified **R8-B-2-ii defrost round** (found-defects #13 + #14; see the 2026-07-19 AMENDMENT note below the table). Sha succession: `134255ce…` (W base `60910053`, pre-fix) → `3673ee49…` (2026-07-18 frozen-barrier-fix) → `cb4c4f4a…` (defrost #13 interim) → `bdb9d935…` (defrost #13+#14) → `f183aa3c…` (2026-07-27 managed-cron round, mc2-7ohdj) → `f4f90361…` (2026-07-28 cron.job-unguarded round, mc2-34eua) → `56a7a88e…` (2026-07-28 session-level read-only round, mc2-ipwyc) → **`f98a2ce4…`** (2026-07-28 session-level application_name round, mc2-38ivn; current REPO field-4 truth). All prior values historical. The deployed SERVER barrier stays `3673ee49…` pending the team-lead's pre-rehearsal reinstall (explicit defer); this field pins REPO bytes.                                                                                                                                                                                 |
| 5   | `activation_sql_projection_sha256` | **AMENDED** `409eb9ca06f20d395f8f2d6636aa7c06220e5a6c45594b12935b6b5ccb30c3da`  | Layer-1 value: sha256 of the full generated `activate` sqlPath (8872 bytes; was `a42d6d39…` / 8839 bytes pre-defrost). MOVED by defrost #13 (+33B, the aliased cron.job restore UPDATE, which is in the activate projection); #14 adds zero motion here. CATALOG-BOUND — production re-freeze REQUIRED (checklist). Now 9213 bytes after mc2-34eua dropped `cron.job` from the lock list; see the 2026-07-19 and 2026-07-28 AMENDMENT notes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6   | `activation_normal_slice_sha256`   | **AMENDED** `eaa36af8af9faf2a778653bd2bd63aa17fe18d1310b00c6555869941016e4e61`  | Layer-1: `between(sql, NORMAL_BEGIN, NORMAL_END)` (8655 bytes; was `d413fbd7…` / 8622 bytes pre-defrost). MOVED by defrost #13 (+33B; the aliased cron.job restore UPDATE is in the NORMAL slice); #14 adds zero motion here. CATALOG-BOUND — re-freeze REQUIRED. Now 8996 bytes after mc2-34eua dropped `cron.job`; see the 2026-07-19 and 2026-07-28 AMENDMENT notes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 7   | `activation_recovery_slice_sha256` | `c41cf104c423623a56a3131c6e8d8148fae2db5af44772157c1e5a57be2d0063`              | `between(sql, RECOVERY_BEGIN, RECOVERY_END)` (103 bytes). CATALOG-INDEPENDENT (`BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SELECT q12_guard.verify_activated_state(); COMMIT;`) — production-faithful, no re-freeze.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 8   | `activation_lock_catalog_sha256`   | `05ee4e733ed59733d1effd20835089a2fa2996ba1a773b748ae515ba295dbf8f`              | Layer-1: sha256 of `deploy/qdrant/q12-activation-lock-catalog.test-reference.json` (sorted set of the 78 relations locked `ACCESS EXCLUSIVE`; was 79 before mc2-34eua removed `cron.job`). CATALOG-BOUND — re-freeze REQUIRED.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | `activation_lock_order_sha256`     | `de79e836a943bf9d4003a963bf3515b9401d5322b59067c8a6688e6c95de62ae`              | Layer-1: sha256 of `deploy/qdrant/q12-activation-lock-order.test-reference.json` (LOCK TABLE token order). CATALOG-BOUND — re-freeze REQUIRED.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 10  | `managed_inventory_schema_sha256`  | `f2bb0bee394111073a86e421bc11470531880c6ce0c0933a436080eaab6dd56d`              | sha256 of `deploy/qdrant/q12-managed-session-inventory-schema.json` (contract :257-269). CATALOG-INDEPENDENT; canonicalization is a flagged determination (Risks c).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11  | `managed_inventory_sha256`         | **RATIFIED** `c90edb78341fb83a6d954212daca675f5bac89f17bd5611ceb6db3e56559bac6` | 2026-07-16 owner-authorized read-only live inventory: three identical `pg_stat_activity` samples over the verify-full DSN yielded 13 stable identities (+ the probe's own contract identity appended). Canonical NFC sorted-key JSON now at `deploy/qdrant/q12-managed-session-inventory.json` (ratified 2026-07-16; the rename does not change canonical bytes — hash recomputed identically). Independent ratification review `mc2-jz6y0.13.19-field11-ratification-review.md`: verdict PASS, P0/P1 zero, P2=1/P3=2, checklist 1–8 all PASS, hash reproduced. Carried note F1 (P2): `transaction_free_required=false` on the `supabase_admin` managed client identities follows the accepted `.13.14` trusted-provider residual boundary — an open transaction on those rows does not trip the projection drift gate; contract `:283` "where required" permits non-probe clients to carry `false`. Hash and key sets pinned by `packages/course-gen-platform/tests/unit/ops/q12-managed-session-inventory.test.ts`. |

Key determinism fact (narrows re-freeze to pure catalog substitution): the generated
activation SQL embeds **neither `run_id` nor `catalog_sha256`** (verified by the repro
tool). So fields 5/6/8/9 are a pure function of the barrier bytes + the
expected-post-migration-catalog input; only the catalog changes at re-freeze.

### 2026-07-18 AMENDMENT — field-4 succession (RATIFIED cascade round)

Field 4 (`activation_barrier_sha256`) is amended in place: the accepted-W barrier
byte-value at `60910053` (`134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68`)
is superseded by the barrier sha256 produced by the separately authorized, ratified
**frozen-barrier-fix round** (PG17 ACL array-type fix + catalog-fd double-consumption +
operator-precedence/scalar-guard dialect fixes; independent correctness/docs review
`.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-barrier-fix-review.md`, verdict PASS/PASS,
merged): `3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9`. The old value
is now historical (it was the correct barrier sha256 AT `60910053`, before the fix; it is
no longer the current field-4 truth).

This is a Layer-1 amendment to field 4 ONLY. The repro tool
(`mc2-jz6y0.13.10-activation-tuple-repro.cjs`) was re-run against the fixed barrier bytes
and reproduces fields 5-10 **byte-identically** — zero change to the three tracked JSON
assets (`q12-activation-lock-catalog.test-reference.json`,
`q12-activation-lock-order.test-reference.json`, `q12-managed-session-inventory-schema.json`).
Field 7 (`activation_recovery_slice_sha256`) is confirmed catalog-INDEPENDENT (already
known) and, by this re-run, also barrier-fix-independent: the RECOVERY slice bytes the fix
touched are outside the hashed range. No re-freeze is triggered for fields 5-10 by this
amendment; the C7 production re-freeze of fields 5/6/8/9 (catalog-bound, checklist item 2
below) is unchanged and remains open. Field 11 is untouched (ratified separately, unrelated
to the barrier bytes).

### 2026-07-19 AMENDMENT — fields {4,5,6} succession (RATIFIED R8-B-2-ii defrost round)

The ratified **R8-B-2-ii defrost round** re-froze the barrier for two real PG17.10
production defects (the ninth and tenth frozen-artifact defects), each surfaced by
real install/activate and independently repro'd on disposable `postgres:17.10`:

- **Found-defect #13** — `write_restore_sql` (shared by `activate` + `rollback`) restored
  each captured cron job with an UNALIASED `UPDATE cron.job` inside a `FOR job IN …` loop;
  under `plpgsql.variable_conflict=error` the `job` reference is ambiguous (loop variable
  vs. the implicit whole-row alias), aborting real activate/rollback. Fix: aliased target
  `UPDATE cron.job AS restore_target … WHERE restore_target.jobid=…` (+33B). This edit is
  in the **activate SQL projection / NORMAL slice**, so it MOVED **fields 5 and 6**.
- **Found-defect #14** — `enforce_write_barrier()` read `OLD.singleton/run_id/…` in one IF
  expression whose leading `TG_TABLE_NAME='active_run' AND TG_OP='UPDATE'` terms do not
  short-circuit the row-field resolution under PG17.10; on the activate self-test UPDATE of
  the `run_id`-less `q12_guard.baseline` (`:1795`) this raised SQLSTATE 42703
  `record "old" has no field "run_id"`, uncaught by the P0001-only self-test handlers,
  aborting activate before `activated`. Fix (Candidate A): nest the `OLD.*` comparisons
  under an outer `IF TG_TABLE_NAME='active_run' AND TG_OP='UPDATE' THEN … END IF;` with
  fall-through to the append-only RAISE. This edit is in `write_install_sql`
  (`enforce_write_barrier` definition), which is NOT part of the `activate` projection, so
  it MOVED **field 4 only**.

**Ratified W-tuple motion (measured by re-running `mc2-jz6y0.13.10-activation-tuple-repro.cjs`
against the final barrier bytes):**

- field 4 `activation_barrier_sha256` → `f183aa3ce406fa02a8d093b617d576b1a31e42dd524e19120e7fbee7fe7fb8a9`
  (whole-file sha; both #13 and #14 land here). Prior: `3673ee49…` (pre-defrost) / `cb4c4f4a…` (#13 interim).
- field 5 `activation_sql_projection_sha256` → `fd4133b2a75c805eea53ea83e0bbdadbff07a1e864b975d64ac950edfa6d833b`
  (8872 bytes; +33B from #13). Prior: `a42d6d39…` (8839 bytes).
- field 6 `activation_normal_slice_sha256` → `6dee1107481cef831c0140b6d15e87ec8706d36cf752210a130be9e5df6cb289`
  (8655 bytes; +33B from #13). Prior: `d413fbd7…` (8622 bytes).
- fields 7/8/9/10 **BYTE-IDENTICAL** (repro-tool re-run): field 7 `c41cf104…`, field 8
  `cbfa2f09…`, field 9 `26163c33…`, field 10 `f2bb0bee…`. The three tracked JSON assets
  (`q12-activation-lock-catalog.test-reference.json`, `q12-activation-lock-order.test-reference.json`,
  `q12-managed-session-inventory-schema.json`) are unchanged (`git status` clean after the
  re-run). Ratified union = **{4,5,6} moved, {7,8,9,10} byte-identical** — the RULING-3
  hard-stop gate held (no motion beyond {4,5,6}).

This does NOT change checklist item 2 (fields 5/6/8/9 catalog-bound production re-freeze,
Task C7): fields 5/6 remain TEST-CATALOG-bound Layer-1 values, now reflecting the defrosted
barrier bytes. Field 11 untouched. GREEN evidence: real PG17.10 install→verify→prepare-recovery
→activate reaches `activated` (`last_command=activate`) with the #14 anti-weakening probe
proving every `q12_guard`-table write still trips the append-only guard (P0001, not 42703) —
`packages/course-gen-platform/tests/unit/ops/q12-live-real-verify-chain.test.ts`. Full round
provenance: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-ii-defrost.md`. The deployed
SERVER barrier stays `3673ee49…` until the team-lead's pre-rehearsal reinstall batch (explicit
defer); this tuple pins the REPO bytes.

## Layer 2 — catalog-independent control-flow invariant (permanent truth)

Contract :162's mechanically tested property. The `activate` NORMAL slice is, in
order: `BEGIN ISOLATION LEVEL READ COMMITTED;` → `SET LOCAL search_path=pg_catalog;`
→ `SELECT q12_guard.assert_controller_binding();` →
`LOCK TABLE <all guarded relations> IN ACCESS EXCLUSIVE MODE;` →
`SELECT q12_guard.verify_expected_guards(...)` → the `DO $restore$` mutation block and
`ALTER DATABASE postgres SET default_transaction_read_only=…` →
`SELECT q12_guard.verify_activated_state();`. The `ACCESS EXCLUSIVE` common lock is
acquired BEFORE any tenant mutation; no branch bypasses it (single linear path — the
recovery slice performs no mutation at all); `ACCESS EXCLUSIVE` conflicts with the
probe's `SHARE`. `lock_order` = LOCK TABLE token order; `lock_catalog` = its sorted
set. This holds for ANY catalog and is the production-faithful deliverable; the
mechanical test is catalog-parametric (`MC2_Q12_ACTIVATION_CATALOG_FILE`).

# Verification

Fresh runs at `60910053` (worktree clean):

- `node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs`
  reproduces fields 5-10 byte-identically and (idempotently) emits the three tracked
  JSON assets; confirms the SQL embeds neither `run_id` nor `catalog_sha256`.
- the accepted W integration base commit (60910053, the branch base — not this addendum branch HEAD) → field 1; `sha256sum` of the manifest/barrier → fields 2/4.
- `MC2_Q12_REAL_PG17=1 pnpm exec vitest run tests/unit/ops/q12-w-activation-lock-proof-pg17.test.ts`
  → 2 passed (structural lock-before-mutation + live `AccessExclusiveLock` on all 79
  guarded relations via `pg_locks` + concurrent `SHARE` conflict). Without the flag:
  1 passed / 1 skipped (no Docker needed for normal unit runs).
- `sha256sum` of the three assets equals fields 9 / 8 / 10 respectively.
- **2026-07-18 AMENDMENT re-verification (worktree `codex/q12-live-controller`,
  `fcd981b10`):** `sha256sum deploy/qdrant/q12-database-barrier.sh` ->
  `3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9`, matching the
  ratified frozen-barrier-fix round's output byte-for-byte. The repro tool re-run against
  this fixed barrier reproduces fields 5-10 byte-identically (see the amendment note
  above the Layer-2 section) — confirmed by direct `node
mc2-jz6y0.13.10-activation-tuple-repro.cjs` re-execution, zero diff to the three tracked
  JSON assets. A new CI guard
  (`packages/course-gen-platform/tests/unit/ops/q12-w-tuple-frozen-byte-guard.test.ts`)
  now makes fields 2 and 4 load-bearing against the real manifest/barrier bytes, read
  from this artifact table (not hardcoded), so any future edit to either file without a
  matching tuple amendment fails CI.

# LIVE-BOUNDARY RE-FREEZE CHECKLIST (single owner/live gate)

This is the sole input a separately authorized owner/live step must satisfy; it is
NOT a missing accepted artifact — these values are unknowable pre-live by
construction.

1. **Field 11 `managed_inventory_sha256` (identity roster).** The managed-session
   inventory identities (role/database/backend_type/application_identity/client_class/
   allowed_states/transaction_free_required per identity) are not enumerated in any
   accepted source. Sources exhaustively checked: D6 contract :255-283 (schema + only
   the probe's own `megacampus-q12-activation-truth`); `.codex/stages/mc2-jz6y0/
artifacts/mc2-jz6y0.13.4.*` and `.13.7-*`; `.13.14-managed-supabase-boundary.md`
   (trust-boundary MODEL + role categories `supabase_admin` superuser / reserved-role
   / background-worker only, no 7-field roster); D3 addendum-design specs. Synthesis
   from general Supabase knowledge is forbidden. Resolve via an authorized read-only
   live inventory beyond the remote boundary; then freeze `managed_inventory_sha256`
   against the frozen schema (field 10).
   **RESOLVED 2026-07-16:** the owner-authorized read-only live inventory was taken,
   frozen provisionally at `5836927e`, and ratified by independent review
   `mc2-jz6y0.13.19-field11-ratification-review.md` (PASS, P0/P1 zero; F1 carried as
   the accepted `.13.14` residual note). Field 11 = `c90edb78…` at
   `deploy/qdrant/q12-managed-session-inventory.json`, pinned by unit test.
   The re-freeze checklist now covers only item 2 (fields 5/6/8/9, Task C7).
2. **Fields 5/6/8/9 production re-freeze (catalog-bound hashes).** Re-run the repro
   tool and the parametric mechanical test with
   `MC2_Q12_ACTIVATION_CATALOG_FILE=<accepted production expected-post-migration-catalog>`;
   re-freeze `activation_sql_projection_sha256`, `activation_normal_slice_sha256`,
   `activation_lock_catalog_sha256`, `activation_lock_order_sha256` and their
   production JSON assets (drop the `.test-reference` suffix). Field 7 and field 10 do
   not change. The Layer-2 invariant is already proven and only re-runs.

# Risks / Follow-ups

- **(d) Field 4 — AMENDED 2026-07-18 (this cascade round).** The barrier fix (PG17
  ACL/fd/dialect corrections, review `mc2-jz6y0.13-barrier-fix-review.md` PASS/PASS)
  changed the barrier's byte-value. Field 4 is amended in place to the new sha256
  (`3673ee49…`); the old value (`134255ce…`) is historical only. This does NOT reopen
  or change the scope of checklist item 2 (fields 5/6/8/9 catalog-bound production
  re-freeze, Task C7) — the repro tool reproduced fields 5-10 byte-identically against
  the fixed barrier, confirmed by direct re-run this round.
- **(a) Field 2 — RESOLVED.** Contract :178 `af9b21cb…` is the historical
  five-command manifest sha256 at `c93d766d`; the accepted file at `60910053` is
  `aaec6fc2…`, the D5J twenty-command expansion at `1817c5e9`, which is exactly the
  contract's sanctioned "accepted integration successor". No contract edit required.
- **(b) Fields 5/6/8/9 — Option A, two-layer.** Layer-1 catalog-bound values are
  frozen with a visible re-freeze flag (checklist item 2); Layer-2 catalog-independent
  invariant is the permanent truth (mechanical test). 69/79 locked relations are
  synthetic test placeholders, so the Layer-1 values are explicitly not production.
- **(c) Field 10 canonicalization determination (flag).** The contract fixes the
  schema keys/scalars but not the exact bytes to hash. The frozen schema asset
  (`deploy/qdrant/q12-managed-session-inventory-schema.json`: top-level keys,
  contract-fixed scalars incl. `source_decision_sha256 = 7188d792…` the accepted D3
  recoverable-lifecycle-addendum SHA, and the 7-key identity item schema) is a
  documented determination — ratified by the lead (provisional), pending independent
  review of the tuple.
- **File placement.** Artifact + repro in `.codex/stages/mc2-jz6y0/artifacts/`;
  mechanical test in `tests/unit/ops/`; catalog-bound assets named
  `*.test-reference.json` (per the naming condition) and the catalog-independent
  schema asset under a normal name, all in `deploy/qdrant/`.

### 2026-07-27 AMENDMENT — field 4/5/6 succession (managed pg_cron round, `mc2-7ohdj`)

The frozen barrier paused and restored the maintenance window's cron jobs with a direct
`UPDATE cron.job`. That is impossible on the managed source: `cron.job` is owned by
`supabase_admin` and the connecting `postgres` role holds only SELECT (`postgres=r*`); it is
neither superuser nor a member of `supabase_admin`, so the write raises 42501
`permission denied for table job`. MEASURED on production — it is what stopped five live window
attempts at `barrier.install`, read from the Postgres logs. `cron.alter_job` was measured to
succeed there with a semantically empty call that left all eight jobs active, so both the install
pause and the activate restore now go through pg_cron's own API. Every surrounding assertion
(exact eight active rows, row/hash drift, settle-to-zero, exact-row restore drift) is unchanged.

The disposable PG17 container previously modelled `cron.job` as a plain superuser-owned table with
no pg_cron at all, which is why every local suite passed on a write production forbids; it now
reproduces the managed ACL and the sanctioned API, so this class fails in CI rather than in a live
window.

Re-measured with `node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs`
against the new barrier bytes:

- field 4 `activation_barrier_sha256` → `f183aa3ce406fa02a8d093b617d576b1a31e42dd524e19120e7fbee7fe7fb8a9` (prior `bdb9d935…`)
- field 5 `activation_sql_projection_sha256` → `fd4133b2a75c805eea53ea83e0bbdadbff07a1e864b975d64ac950edfa6d833b` (9227 bytes; prior `4aec7a61…`, 8872 bytes)
- field 6 `activation_normal_slice_sha256` → `6dee1107481cef831c0140b6d15e87ec8706d36cf752210a130be9e5df6cb289` (9010 bytes; prior `0c8eed33…`, 8655 bytes)
- fields 7/8/9 re-measured UNCHANGED (`c41cf104…`, `cbfa2f09…`, `26163c33…`) — the change is inside
  the normal activate slice only.

## 2026-07-28 AMENDMENT — cron.job removed from `guarded_relations` (mc2-34eua)

Owner-approved variant B. `cron.job` is owned by `supabase_admin`; production `postgres` holds
SELECT on it and neither UPDATE nor TRIGGER. The barrier's guard therefore cannot take
`ACCESS EXCLUSIVE` on it (any mode above ACCESS SHARE requires UPDATE/DELETE/TRUNCATE) and cannot
`CREATE TRIGGER` on it either. Measured on production 2026-07-27:

```
LOCK TABLE cron.job IN ACCESS EXCLUSIVE MODE  ->  ERROR 42501 permission denied for table job
LOCK TABLE cron.job IN ACCESS SHARE MODE      ->  success
has_table_privilege('postgres','cron.job',...) -> SELECT true, UPDATE/DELETE/TRUNCATE false
```

This was the C1 wall in window attempt #6 (run `f082e688-e184-4a26-93f2-081f97297855`). Guarding
`cron.job` was never a stronger guarantee — it was an unreachable one. A privilege audit of the
whole frozen set shows `cron.job` was the ONLY one of the 76 out of reach: `auth` and `storage` are
already selected by `has_table_privilege(..., 'TRIGGER')` (22 of 23 auth, 5 of 8 storage), so the
set was curated against privileges and `cron.job` was hardcoded past that filter.

The scheduler quiesce guarantee is retained by the layers that need no privilege:

1. `cron.alter_job(job_id, active := false)` pauses every job (pg_cron's own API, owner-executed).
2. The zero-active-jobs assertion (`SELECT count(*) FROM cron.job WHERE active` = 0) — a read.
3. `ALTER DATABASE postgres SET default_transaction_read_only=on`.
4. The guard trigger on `net.http_request_queue` — the scheduler's only write path out, since the
   two hourly jobs act through `net.http_post`.

Lost: the trigger that would have blocked re-activating a job mid-window, and the lock's atomicity
over the pause. Both require an actor who is a superuser or Supabase automation.

Re-measured with `node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs`
(its test catalog amended to 75 relations) against the new barrier bytes:

- field 4 `activation_barrier_sha256` → `f4f903611ba88738a6fdf99e7211c770e94e52c0c56da951f394058ac009c2cd` (prior `f183aa3c…`)
- field 5 `activation_sql_projection_sha256` → `b463c6420c860f6be2ddcd81e073cdb7692cdef393fb2225ba7fdb8b51d535d8` (9213 bytes; prior `fd4133b2…`, 9227 bytes — exactly the 14 bytes of `, "cron"."job"`)
- field 6 `activation_normal_slice_sha256` → `3a24e287a2dd4f10112779278338036492a3c57c75c79f2c859083d85a346dfe` (8996 bytes; prior `6dee1107…`, 9010 bytes — same 14 bytes)
- field 8 `activation_lock_catalog_sha256` → `05ee4e733ed59733d1effd20835089a2fa2996ba1a773b748ae515ba295dbf8f` (78 relations; prior `cbfa2f09…`, 79)
- field 9 `activation_lock_order_sha256` → `de79e836a943bf9d4003a963bf3515b9401d5322b59067c8a6688e6c95de62ae` (prior `26163c33…`)
- fields 7/10 re-measured UNCHANGED (`c41cf104…`, `f2bb0bee…`).

The frozen 20-command manifest is UNCHANGED (`aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841`):
the catalog sha reaches the barrier as the runtime-substituted `<expected-post-migration-catalog-sha256>`
placeholder, so `command_sha256` (argv-only) does not move.

The production run root must be re-planned so its `expected-post-migration-catalog.json` carries 75
relations; `plan` reads the live database and is read-only.

### Second instance found by the amendment: the D6 activation-truth probe

Fields 8/9 also govern `deploy/qdrant/q12-activation-truth-projection.sql`, whose
`full_catalog_share_lock` template took `LOCK TABLE ... IN SHARE MODE` over the same catalog and
whose `lock_projection` template enumerated the same relations per OID. SHARE is stronger than
ACCESS SHARE, so it requires UPDATE/DELETE/TRUNCATE/MAINTAIN exactly as ACCESS EXCLUSIVE does: the
D6 probe would have raised 42501 on `cron.job` too, as a separate live-window pre-flight from
`barrier.install`. `cron.job` is removed from both templates; the `cron_jobs` template still READS
it, which needs no privilege.

- `sha256(deploy/qdrant/q12-activation-truth-projection.sql)` →
  `d5046e313e99a36938ddd9820fb3bf5cc78b8c1a92265b72242b689af3aa3e40` (prior `36d28034…`). Any D6
  request authored for the live window must carry this value as `projection_sql_sha256`; the probe
  cross-checks the FD-11 bytes against it and refuses on mismatch.
- The probe is NOT one of the 20 frozen manifest commands, so `aaec6fc2…` is again untouched.

## AMENDMENT 2026-07-28 (second of the day) — mc2-ipwyc: the barrier could arm guards it could not disarm, and its session proofs proved nothing

Both defects were MEASURED ON THE LIVE DATABASE on 2026-07-28 while restoring production after
live-window attempt #9. Neither could surface in the fixtures: there every table belongs to
`postgres`, and every test connection reaches PostgreSQL directly instead of through the pooler.
Same class as the eight before them — the environment the barrier is CHECKED in is more permissive
than the one it RUNS in.

**Defect A — DROP TRIGGER needs OWNERSHIP; CREATE TRIGGER needs only the TRIGGER privilege.**
The guarded set is selected by "postgres has TRIGGER on this relation", which is exactly how the 22
`auth` and 5 `storage` tables qualify — and those are owned by `supabase_auth_admin` /
`supabase_storage_admin`. The `$restore$` block, shared by `activate` and `rollback`, dropped its
158 triggers one relation at a time and raised `must be owner of relation oauth_authorizations` on
production. `activate` runs that block PAST the point of no return, so this was a live C9 blocker.
(`cleanup` was never affected: it already used `DROP SCHEMA q12_guard CASCADE` — which is also how
the production restore succeeded, 158 → 0.)

Fix: `$restore$` now captures `pg_get_functiondef` of `q12_guard.enforce_write_barrier` and
`pg_get_triggerdef` of the six `q12_guard_immutable*` triggers from the catalog, asserts the
immutable set is exactly six, and disarms with one
`DROP FUNCTION q12_guard.enforce_write_barrier() CASCADE` — CASCADE does not re-check the owner of
each dependent object. On `activate` the captured definitions are replayed at the end of the block
(after the activation UPDATE, so it needs no trigger exemption); the activation guard immediately
after re-proves all six are present AND armed. On `rollback` the replay branch is dead
(`IF 'true'='false'`) because the schema is dropped a few statements later. No second copy of the
function or trigger bodies lives in the file, so neither can drift from what install created.

**Defect B — the Supavisor pooler never delivers the connection's startup `options`.**
Measured against the live pooler: connecting with `-c default_transaction_read_only=on` left the
setting at `off`. PostgreSQL's own precedence is intact (a delivered startup option beats the
per-database setting; proven on a disposable 17.10) — the option simply never arrives. So every
barrier runner that declared its read-only-ness in `options` and then PROVED it was silently
asserting whatever the DATABASE default happened to be. Benign before install, fatal after:

- the main runner's `transaction_read_only='off'` session proof cannot pass once install has set the
  database default read-only — a C9/C10 blocker on `activate` and `cleanup`;
- the terminal proof's `='on'` cannot pass once `$restore$` has put the default back — a C10 blocker
  on `cleanup` and `rollback`.

A third consequence, found by the gated real-PG17 verify chain while implementing Defect A: the
replayed `pg_get_functiondef` definition carries NO ACL, so PUBLIC would silently regain EXECUTE on
the guard function. `verify_activated_state` refuses any `q12_guard` function whose ACL names a
grantee other than its owner, so the replay re-applies install's own
`REVOKE ALL ON FUNCTION q12_guard.enforce_write_barrier() FROM PUBLIC`. The end-to-end
verify-base → verify-obs → prepare-recovery → activate → real frozen cleanup → terminal proof chain
is green against a live PostgreSQL 17.10 with the fix in place.

Fix: each runner states its intent with a session-level `SET default_transaction_read_only`
(the GUC is USERSET and the production DSN is session-mode port 5432) and keeps the proof as the
post-condition, which still fails closed on a genuinely read-only server where the SET cannot take
effect. The `prepare-recovery` inherited-read-only proof is deliberately NOT changed: its whole
purpose is to observe the inherited database default.

Re-measured with `node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs`
against the new barrier bytes:

- field 4 `activation_barrier_sha256` → `56a7a88eac92751a4a0613aff1b10b96f5628b950a5acb4988d06616271a4647` (prior `f4f90361…`)
- field 5 `activation_sql_projection_sha256` → `409eb9ca06f20d395f8f2d6636aa7c06220e5a6c45594b12935b6b5ccb30c3da` (10944 bytes; prior `b463c642…`, 9213 bytes)
- field 6 `activation_normal_slice_sha256` → `eaa36af8af9faf2a778653bd2bd63aa17fe18d1310b00c6555869941016e4e61` (10727 bytes; prior `3a24e287…`, 8996 bytes)
- fields 7/8/9/10 re-measured UNCHANGED (`c41cf104…`, `05ee4e73…`, `de79e836…`, `f2bb0bee…`): the
  lock catalog and its order did not move, and neither did the recovery slice.

The frozen 20-command manifest is UNCHANGED (`aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841`)
for the same reason as every prior barrier amendment: `command_sha256` covers argv only.

Repro: `packages/course-gen-platform/tests/unit/ops/q12-guard-trigger-ownership.test.ts`
(MC2_Q12_REAL_PG17=1) models the managed privilege split on a disposable PostgreSQL 17.10 — a
non-superuser barrier role and a foreign table owner — and proves the RED (`must be owner of
relation oauth_authorizations`), the GREEN (CASCADE + replay, immutable guard re-armed), and both
sides of the read-only finding. It is bound to the live barrier bytes, so it goes red if either fix
is reverted.

## 2026-07-28 AMENDMENT — every barrier session states its `application_name` (mc2-38ivn)

Found by window pre-flight probe B3 (`mc2-ot8se`), measured against the LIVE pooled DSN on
2026-07-28: Supavisor does not merely drop the startup parameter the way it drops `options`
(mc2-ipwyc) — it **substitutes its own value**. A session that asks for
`megacampus-q12-window-preflight-b3` reads back `'Supavisor'` from both
`current_setting('application_name')` and `pg_stat_activity`.

Consequence, and why this is a window blocker rather than cosmetics: the terminal proof's

```
(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid()
   AND datname='postgres' AND application_name LIKE 'megacampus-q12-%') AS barrier_era_session_count
```

is asserted `== 0` by the cleanup/rollback jq contract. Through the pooler that count could only
ever read 0 — not because no barrier-era session survived the window, but because no barrier-era
session could be recognised. It passed for the wrong reason, which is the same
environment-substitution class that cost nine window attempts. Every other consumer of the
`megacampus-q12-%` prefix was blind the same way.

NOT affected: `quiesce_client_backends()` matches on `usename`, not `application_name`, so client
quiescence was never blind (pre-flight probe E1 is green on production).

Fix, in the shape mc2-ipwyc established — state the intent in the session, never trust the
connection. All four barrier clients now issue `SET application_name='<their identity>'` right
beside the existing `SET default_transaction_read_only`, and each one's session proof was extended
to assert the name twice: `current_setting('application_name')` AND the value
`pg_stat_activity` publishes for its own backend. The proof therefore fails closed if a future
pooler release starts discarding the session-level SET as well:

| client                                    | statement of intent                                     |
| ----------------------------------------- | ------------------------------------------------------- |
| `megacampus-q12-database-barrier`         | main barrier session (all operations)                   |
| `megacampus-q12-install-baseline-proof`   | install baseline reconnect verifier                     |
| `megacampus-q12-recovery-readiness-proof` | `prepare-recovery` inherited-read-only proof            |
| `megacampus-q12-database-terminal-proof`  | terminal reconnect proof — the one the count belongs to |

The `prepare-recovery` client keeps observing the INHERITED read-only default (that proof is
untouched, exactly as the 2026-07-19 round required); only its name is now stated.

Re-measured with `node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs`
against the new barrier bytes:

- field 4 `activation_barrier_sha256` → `f98a2ce42e6b8992d386aab4e97321d439fa31e7ad0dd268f8d61123ead7be1f` (prior `56a7a88e…`)
- fields 5/6/7/8/9/10 re-measured BYTE-IDENTICAL (`409eb9ca…`, `eaa36af8…`, `c41cf104…`,
  `05ee4e73…`, `de79e836…`, `f2bb0bee…`): the change is confined to the embedded Node runners and
  touches no SQL projection, so no production re-freeze is required by this round.

The frozen 20-command manifest is UNCHANGED (`aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841`):
`command_sha256` covers argv only, and no argv moved.

Repro: `packages/course-gen-platform/tests/unit/ops/q12-database-barrier.test.ts`
(MC2_Q12_REAL_PG17=1) reproduces the pooler locally with a PostgreSQL 17 `ON login` event trigger
that re-sets `application_name` at session start — the session source outranks the startup packet,
and an in-session SET still overrides it, which is exactly the production shape. With
`log_line_prefix=%a` the server records the name it actually resolved: RED logs the terminal proof's
own statements as `Supavisor|LOG:`, GREEN logs them as `megacampus-q12-database-terminal-proof|LOG:`.
The same test holds one `megacampus-q12-intruder` session open across a cleanup run and requires the
terminal proof to refuse (`database terminal reconnect result is invalid`), so
`barrier_era_session_count` is proven live in both directions rather than vacuously zero.

### 2026-07-28 follow-up measurement — the pooler resets session state on check-in

Independent review of the mc2-38ivn round raised the one claim the round had NOT measured: the
barrier's own sessions are now visible under `megacampus-q12-%`, so if Supavisor returned a server
connection to its pool WITHOUT resetting session state, a badged backend could survive into the
terminal proof and fail `barrier_era_session_count == 0` at C10 — a failure mode that could not
exist before this fix. The reviewer also correctly refuted the evidence first offered for it: probe
E2 excludes its own pid, and the pre-flight opens one connection at a time, so a single reused
backend makes "E2 is green" equally consistent with reset and with same-connection retention.

Measured directly against the live pooled DSN on 2026-07-28, read-only, through the pre-flight's own
`build_pooled_session` seam, three rounds:

- connection A set `application_name` to a deliberately NON-`megacampus-q12-` badge (so the
  measurement could not poison E2 or the C10 counter either way) and disconnected;
- two connections B and C were then opened CONCURRENTLY, forcing the pool to hand out two backends.

In every round one of them landed on the exact backend pid A had badged, and read its own
`application_name` back as `'Supavisor'` — not the badge. A session GUC set on the same connection
(`megacampus.q12_capability`) also read back empty (length 0). Supavisor resets session state when a
connection is checked in, so the badge cannot outlive its session, and the C10 counter stays
reachable. The same measurement disposes of an adjacent worry the review raised: the capability GUC
the barrier sets with `set_config(..., false)` does not survive check-in either, so it cannot be
read by the next client of that connection.
