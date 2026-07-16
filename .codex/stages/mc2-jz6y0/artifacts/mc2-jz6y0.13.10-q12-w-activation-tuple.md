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
  - 'git rev-parse 60910053 (the accepted W integration base commit) -> 60910053… (field 1); sha256sum deploy/qdrant/q12-command-manifest.json -> aaec6fc2… (field 2); sha256sum deploy/qdrant/q12-database-barrier.sh -> 134255ce… (field 4)'
  - 'MC2_Q12_REAL_PG17=1 pnpm exec vitest run tests/unit/ops/q12-w-activation-lock-proof-pg17.test.ts -> 2 passed (structural + mechanical PG17 lock proof); catalog-parametric via MC2_Q12_ACTIVATION_CATALOG_FILE'
  - 'pnpm exec vitest run (no flag) -> 1 passed | 1 skipped; prettier --check clean; new files add zero type errors; git diff --check clean'
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
| 4   | `activation_barrier_sha256`        | `134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68`              | `sha256(deploy/qdrant/q12-database-barrier.sh)` at `60910053`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5   | `activation_sql_projection_sha256` | `a42d6d39f3383c50de15b8aac5b1efd2e486c51bb6a47052a6d805d1589f224e`              | Layer-1 value: sha256 of the full generated `activate` sqlPath (8839 bytes). CATALOG-BOUND — production re-freeze REQUIRED (checklist).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6   | `activation_normal_slice_sha256`   | `d413fbd79350f0bbd7e387f03cb242b2239640de1f7a8761ffa5fadd6a85b83f`              | Layer-1: `between(sql, NORMAL_BEGIN, NORMAL_END)` (8622 bytes). CATALOG-BOUND — re-freeze REQUIRED.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | `activation_recovery_slice_sha256` | `c41cf104c423623a56a3131c6e8d8148fae2db5af44772157c1e5a57be2d0063`              | `between(sql, RECOVERY_BEGIN, RECOVERY_END)` (103 bytes). CATALOG-INDEPENDENT (`BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SELECT q12_guard.verify_activated_state(); COMMIT;`) — production-faithful, no re-freeze.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 8   | `activation_lock_catalog_sha256`   | `cbfa2f092fe6370cd9929208029e083b3466d4fe9cf90c3b2801e8914285929a`              | Layer-1: sha256 of `deploy/qdrant/q12-activation-lock-catalog.test-reference.json` (sorted set of the 79 relations locked `ACCESS EXCLUSIVE`). CATALOG-BOUND — re-freeze REQUIRED.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 9   | `activation_lock_order_sha256`     | `26163c334f89331a54f3e0572da8e7e6e32bf83c7c266d2c32dc1b63138d3848`              | Layer-1: sha256 of `deploy/qdrant/q12-activation-lock-order.test-reference.json` (LOCK TABLE token order). CATALOG-BOUND — re-freeze REQUIRED.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 10  | `managed_inventory_schema_sha256`  | `f2bb0bee394111073a86e421bc11470531880c6ce0c0933a436080eaab6dd56d`              | sha256 of `deploy/qdrant/q12-managed-session-inventory-schema.json` (contract :257-269). CATALOG-INDEPENDENT; canonicalization is a flagged determination (Risks c).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11  | `managed_inventory_sha256`         | **RATIFIED** `c90edb78341fb83a6d954212daca675f5bac89f17bd5611ceb6db3e56559bac6` | 2026-07-16 owner-authorized read-only live inventory: three identical `pg_stat_activity` samples over the verify-full DSN yielded 13 stable identities (+ the probe's own contract identity appended). Canonical NFC sorted-key JSON now at `deploy/qdrant/q12-managed-session-inventory.json` (ratified 2026-07-16; the rename does not change canonical bytes — hash recomputed identically). Independent ratification review `mc2-jz6y0.13.19-field11-ratification-review.md`: verdict PASS, P0/P1 zero, P2=1/P3=2, checklist 1–8 all PASS, hash reproduced. Carried note F1 (P2): `transaction_free_required=false` on the `supabase_admin` managed client identities follows the accepted `.13.14` trusted-provider residual boundary — an open transaction on those rows does not trip the projection drift gate; contract `:283` "where required" permits non-probe clients to carry `false`. Hash and key sets pinned by `packages/course-gen-platform/tests/unit/ops/q12-managed-session-inventory.test.ts`. |

Key determinism fact (narrows re-freeze to pure catalog substitution): the generated
activation SQL embeds **neither `run_id` nor `catalog_sha256`** (verified by the repro
tool). So fields 5/6/8/9 are a pure function of the barrier bytes + the
expected-post-migration-catalog input; only the catalog changes at re-freeze.

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
