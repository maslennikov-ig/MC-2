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
cleanup_notes: worktree retained pending independent review; no accepted-W code path changed (barrier script untouched; extraction + evidence only)
risk_level: high
verification:
  - 'node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs -> fields 5-10 reproduce deterministically'
  - 'sha256sum deploy/qdrant/q12-command-manifest.json -> aaec6fc2… (field 2)'
  - 'sha256sum deploy/qdrant/q12-database-barrier.sh -> 134255ce… (field 4)'
  - 'git rev-parse HEAD -> 60910053… (field 1)'
  - 'MC2_Q12_REAL_PG17=1 pnpm exec vitest run tests/unit/ops/q12-w-activation-lock-proof-pg17.test.ts -> 2 passed (structural + mechanical PG17 lock proof)'
  - 'pnpm exec vitest run (no flag) -> 1 passed | 1 skipped (mechanical gated); prettier --check clean; type-check introduces no errors in the new file'
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs
  - packages/course-gen-platform/tests/unit/ops/q12-w-activation-lock-proof-pg17.test.ts
explicit_defers:
  - 'Field 11 managed_inventory_sha256: STOP — managed identity roster not enumerated in any accepted source (owner/live gate).'
  - 'Fields 5/6/8/9 catalog binding: awaiting orchestrator A/B ruling (test-reference-catalog projection vs production-catalog gate).'
  - 'deploy/qdrant/ lock-catalog/order JSON assets: held pending the A/B ruling to avoid freezing test-catalog data as production assets.'
---

# Summary

Accepted-W evidence freezing the D6 activation tuple required by
`docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md`
(branch `codex/q12-d6-activation-truth`, `6183d87b`, lines 144-157). Derivation-only:
every field is either derived from accepted bytes at `60910053` with an exact
reproduction, or explicitly STOPped/flagged. No value is synthesized from general
knowledge. The barrier script is untouched (extraction + evidence only).

## The tuple (field-by-field)

| #   | Field                              | Value                                                              | Provenance / disposition                                                                                                                                                                                                                               |
| --- | ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `w_integration_commit`             | `60910053455ac9af978c7951a562172e39623ca2`                         | `git rev-parse HEAD` in this worktree; the accepted W integration commit.                                                                                                                                                                              |
| 2   | `command_manifest_sha256`          | `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841` | `sha256(deploy/qdrant/q12-command-manifest.json)` at `60910053`. **FLAG:** the D6 contract line 178 states `af9b21cb…`, which matches NO accepted byte at `60910053` (not the file, not any tested 5-ID projection). See Risks.                        |
| 3   | `activation_barrier_path`          | `deploy/qdrant/q12-database-barrier.sh`                            | Contract line 149; file present at `60910053`.                                                                                                                                                                                                         |
| 4   | `activation_barrier_sha256`        | `134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68` | `sha256(deploy/qdrant/q12-database-barrier.sh)` at `60910053`.                                                                                                                                                                                         |
| 5   | `activation_sql_projection_sha256` | `a42d6d39f3383c50de15b8aac5b1efd2e486c51bb6a47052a6d805d1589f224e` | sha256 of the full generated `activate` sqlPath (8839 bytes). **Determination + catalog FLAG** (see Risks).                                                                                                                                            |
| 6   | `activation_normal_slice_sha256`   | `d413fbd79350f0bbd7e387f03cb242b2239640de1f7a8761ffa5fadd6a85b83f` | `between(sql, "-- Q12_ACTIVATE_NORMAL_BEGIN", "-- Q12_ACTIVATE_NORMAL_END")` (8622 bytes). Catalog-bound.                                                                                                                                              |
| 7   | `activation_recovery_slice_sha256` | `c41cf104c423623a56a3131c6e8d8148fae2db5af44772157c1e5a57be2d0063` | `between(sql, "-- Q12_ACTIVATE_RECOVERY_BEGIN", "-- Q12_ACTIVATE_RECOVERY_END")` (103 bytes). **Catalog-INDEPENDENT** (`BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SELECT q12_guard.verify_activated_state(); COMMIT;`) — production-faithful. |
| 8   | `activation_lock_catalog_sha256`   | `cbfa2f092fe6370cd9929208029e083b3466d4fe9cf90c3b2801e8914285929a` | sha256 of the canonical sorted set of the 79 relations locked `IN ACCESS EXCLUSIVE MODE` in the normal slice. Catalog-bound + canonicalization determination (see Risks).                                                                              |
| 9   | `activation_lock_order_sha256`     | `26163c334f89331a54f3e0572da8e7e6e32bf83c7c266d2c32dc1b63138d3848` | sha256 of the ordered `LOCK TABLE` acquisition list (same 79 relations, token order). Catalog-bound.                                                                                                                                                   |
| 10  | `managed_inventory_schema_sha256`  | `f2bb0bee394111073a86e421bc11470531880c6ce0c0933a436080eaab6dd56d` | Frozen schema of `megacampus.q12.managed-session-inventory/v1` (contract :257-269). Canonicalization is a flagged determination (see Risks).                                                                                                           |
| 11  | `managed_inventory_sha256`         | **STOP — owner/live gate**                                         | The managed identity ROSTER is not enumerated in any accepted source. See Risks.                                                                                                                                                                       |

## Field 5-9 catalog determination

The `activate` sqlPath and its normal slice contain the guarded-relation list of
the `--expected-post-migration-catalog` INPUT. The only catalog present in
accepted-W bytes is the reference catalog embedded in the accepted-W test suite
(`packages/course-gen-platform/tests/unit/ops/q12-database-barrier.test.ts`,
`expectedCatalog()`). Fields 5/6/8/9 are therefore derived over that reference
catalog: 79 relations locked, of which 69 are synthetic placeholders
(`auth_table_00..21`, `public_table_00..46`) and 10 are non-placeholder
(`cron.job`, `net.http_request_queue`, `public.document_evidence_runs`,
`public.document_evidence_observability_totals`, `storage.{buckets,
buckets_analytics,objects,s3_multipart_uploads,s3_multipart_uploads_parts}`,
`supabase_migrations.schema_migrations`). Field 7 and the control-flow invariant
(below) are catalog-independent. The SQL embeds neither `run_id` nor
`catalog_sha256` (verified), so it is otherwise barrier-byte deterministic.

## Catalog-independent control-flow invariant (fields 8-9 purpose)

Contract :162 requires a mechanically tested property. The normal slice is, in
order: `BEGIN ISOLATION LEVEL READ COMMITTED;` → `SET LOCAL search_path=pg_catalog;`
→ `SELECT q12_guard.assert_controller_binding();` →
`LOCK TABLE <all guarded relations> IN ACCESS EXCLUSIVE MODE;` →
`SELECT q12_guard.verify_expected_guards(...)` → the `DO $restore$` mutation block
and `ALTER DATABASE postgres SET default_transaction_read_only=…` →
`SELECT q12_guard.verify_activated_state();`. The `LOCK TABLE ... ACCESS EXCLUSIVE`
is acquired BEFORE any tenant mutation and BEFORE `ALTER DATABASE`; no branch,
exception, resume, recovery or receipt-only path bypasses it (the recovery slice
performs no mutation at all). `ACCESS EXCLUSIVE` conflicts with the probe's
`SHARE`. This invariant holds for ANY catalog, so it is production-faithful even
though the specific relation LIST (fields 8-9 values) is catalog-bound.

# Verification

Fresh runs at `60910053` (worktree clean):

- `node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs`
  reproduces fields 5-10 deterministically (values above); confirms the generated
  SQL embeds neither `run_id` nor `catalog_sha256`.
- `git rev-parse HEAD` → `60910053455ac9af978c7951a562172e39623ca2` (field 1).
- `sha256sum deploy/qdrant/q12-command-manifest.json` → `aaec6fc2…` (field 2).
- `sha256sum deploy/qdrant/q12-database-barrier.sh` → `134255ce…` (field 4).
- Field 5-7 reproduction path: `bash deploy/qdrant/q12-database-barrier.sh activate <fixture argv>`
  with a fake node that `cp`s `$8` (sqlPath) to `SQL_LOG`, then `between()` on the
  activation markers (indices 1635/1802/1803/1808 of the barrier script).

Not yet run (next increment): the mechanical PG17 control-flow test (see Risks).

# Risks / Follow-ups

1. **Field 2 contract discrepancy (flag).** Contract :178 asserts the command
   manifest SHA is `af9b21cb…`; the accepted file at `60910053` hashes to
   `aaec6fc2…`, and `af9b21cb` appears nowhere in the repo. The tuple uses the
   derivable truth `aaec6fc2…` (matches the orchestrator's stated value). The
   reviewer/owner must reconcile the contract value (likely stale or a projection
   absent from accepted bytes).
2. **Fields 5/6/8/9 catalog binding (orchestrator A/B ruling pending).** These
   values bind the accepted-W test-reference catalog, not production
   (69/79 relations are synthetic placeholders). Option A: freeze the
   test-reference projection with this flag + the catalog-independent mechanical
   invariant. Option B: gate 5-9 pending an accepted production
   expected-post-migration-catalog (an owner/live artifact). Recommendation: A.
3. **Field 10 canonicalization determination (flag).** The contract fixes the
   schema keys/scalars but not the exact bytes to hash. The frozen schema object
   (top-level keys, contract-fixed scalars incl. `source_decision_sha256=7188d792…`
   the accepted D3 lifecycle-addendum SHA, and the 7-key identity item schema) is a
   documented determination; reviewer must ratify the canonical form.
4. **Field 11 STOP (owner/live gate).** The managed-session-inventory identity
   roster (role/database/backend_type/application_identity/client_class/
   allowed_states/transaction_free_required per identity) is not enumerated in any
   accepted source. Checked: D6 contract :255-283 (schema + only the probe's own
   `megacampus-q12-activation-truth` identity); `.codex/stages/mc2-jz6y0/artifacts/
mc2-jz6y0.13.4.*` and `.13.7-*`; `.13.14-managed-supabase-boundary.md` (trust-
   boundary MODEL + role categories `supabase_admin` superuser / reserved-role /
   background-worker, but no 7-field roster); D3 addendum-design specs. The contract
   itself (:44/:57) says D6 "consumes a hash-bound exact D3/W reviewed managed-
   session/background inventory" — that reviewed enumeration does not yet exist in
   accepted bytes. Per the derivation-only rule it is NOT synthesized; it becomes a
   separate owner/live gate.
5. **Mechanical PG17 test (DONE — `q12-w-activation-lock-proof-pg17.test.ts`,
   commit 2143bfd0).** Running the FULL real `install`→`activate` slices against a
   vanilla `postgres:17.10-bookworm` is infeasible (they assume the Supabase role /
   auth / storage / cron / net environment; the accepted-W suite deliberately tests
   the barrier via a fake node, not live execution). The mechanical proof therefore
   targets the contract's actual control-flow property directly: (a) STRUCTURAL
   (always-on) — exactly one `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` after the
   controller binding and before `verify_expected_guards`, the `DO $restore$`
   mutation block, and `ALTER DATABASE`, with no `IF/CASE/EXCEPTION/LOOP` before the
   lock; (b) MECHANICAL (gated `MC2_Q12_REAL_PG17=1`, disposable container) — a
   controller session running the exact accepted `LOCK TABLE` holds
   `AccessExclusiveLock` on ALL guarded relations (verified via `pg_locks`), and a
   concurrent `SHARE` on a guarded relation conflicts (lock timeout). The slice is
   generated live from the accepted barrier bytes. Verified: 2 passed with the flag;
   1 passed / 1 skipped without it. This proves the catalog-INDEPENDENT invariant;
   the specific relation LIST is the flagged test-reference catalog (see item 2).

## File placement (proposed; orchestrator finalizes)

- This artifact + the reproduction `.cjs`: `.codex/stages/mc2-jz6y0/artifacts/`
  (done).
- Lock-catalog/order JSON assets and the managed-inventory schema JSON: proposed
  `deploy/qdrant/` per the task, but HELD pending the A/B ruling (2) so
  test-catalog data is not frozen as a production asset; contents are reproducible
  via the `.cjs`.
- Mechanical test: `packages/course-gen-platform/tests/unit/ops/` alongside the
  existing PG17 tests.
