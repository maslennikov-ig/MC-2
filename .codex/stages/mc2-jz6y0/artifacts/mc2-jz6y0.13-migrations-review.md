---
schema_version: orchestration-artifact/v1
artifact_type: independent-review
task_id: mc2-jz6y0.13.1-review
stage_id: mc2-jz6y0
agent_type: correctness-reviewer
repo: mc2
branch: codex/q12-migrations
base_branch: codex/self-hosted-qdrant-platform
base_commit: 61802284cf9ebd7ec4506f0afae34a01bb1c85f4
worktree: /home/me/code/mc2/.worktrees/q12-migrations
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Review-only branch remains for the orchestrator; temporary dependency links and disposable PostgreSQL are removed before handoff.
risk_level: high
docs_reviewed: no-change-needed
docs_review_notes: This review changes no product or operator documentation; it assesses the migration runner against the approved migration and Q12 activation contracts.
graph_reviewed: no-change-needed
graph_review_notes: Read-only review of a bounded migration runner used exact SQL, tests, and the established guarded runner pattern; no graph refresh is appropriate.
verification:
  - Reviewed commit 61802284 against base f9389b69 and all six approved forward/rollback SQL files.
  - Recomputed all six SHA-256 digests; every hard-coded digest matches its source.
  - Fresh disposable PostgreSQL 16 run passed 8/8 focused tests.
  - Fresh course-gen-platform type-check passed after linking the integration worktree dependency installation.
  - Reproduction proved rollback leaves 150/151 history and totals live while deleting 120/130/140 history and base tables.
  - Reproduction proved apply reports reused after the runs_tenant_select RLS policy is removed.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-migrations-review.md
explicit_defers:
  - Implementation fixes and regression tests for all P1 findings belong to the migration worker/orchestrator.
  - No remote database, staging, service, secret, deployment, or CI state was read or mutated.
---

# Summary

**Verdict: BLOCKED / DO NOT APPROVE REMOTE APPLY OR ROLLBACK.** The reviewed runner has 0 P0, 3 P1, 0 P2, and 0 P3 findings. Fixed source digests, order-sensitive confirmation, `sslmode=verify-full`, statement execution order, per-migration transactions, advisory locking, and credential-safe fail-closed CLI output are sound. The remaining gaps are activation blockers because the runner can certify an incomplete or security-drifted live schema and can roll back the base beneath later migrations.

| Priority | Count | Approval impact |
| --- | ---: | --- |
| P0 | 0 | None |
| P1 | 3 | Blocks approval and remote mutation |
| P2 | 0 | None |
| P3 | 0 | None |

## Findings

### P1 — Remote apply does not prove the exact repository migration frontier

- **File:** `packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts:459`
- **Evidence:** `assertApprovedHistoryTopology()` queries only the three entries in `DOCUMENT_EVIDENCE_APPROVED_MIGRATIONS`; `runDocumentEvidenceApprovedMigrations()` then applies those three without enumerating the repository migration manifest or comparing every expected pre-target migration to `supabase_migrations.schema_migrations`. The tests likewise assert only the fixed three-version array at `packages/course-gen-platform/tests/integration/document-evidence-approved-migrations.test.ts:22`.
- **Impact:** A remote target may have an unrelated repository migration pending before `20260711120000`, or an unexpected/unknown history tail, and this command will still proceed. It therefore does not satisfy Q12's hard gate that the remote frontier be exact before the approved `120 -> 151` sequence begins.
- **Required fix:** Add a fail-closed frontier manifest/gate that compares the normalized forward migration inventory and the remote history before mutation. It must reject every unexpected pending repository migration, unknown history row, duplicate/unsupported version, and non-exact `120/130/140/150/151` tail. Add PostgreSQL tests for an earlier pending repo migration, an unknown remote row, a gap, and a later unexpected row.

### P1 — Base rollback is allowed while dependent 150/151 migrations remain applied

- **File:** `packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts:522`
- **Evidence:** Rollback validates only `120/130/140` history and immediately reverses them; it never checks `20260711150000` or `20260711151000`. On disposable PostgreSQL, applying the approved base, applying the observability runner, and then invoking `migration:document-evidence-approved:rollback` returned `rolled_back`. Afterwards history still contained `20260711150000` and `20260711151000`, `document_evidence_observability_totals` still existed, and `document_evidence_runs` was gone.
- **Impact:** The supported package command can create a false migration history and orphan the 151 totals/RPC/functions after deleting their base tables. That is a deterministic staging schema-corruption path and invalidates rollback/recovery guarantees.
- **Required fix:** Before any base rollback, require downstream `151` and `150` history and live state to be absent (or orchestrate one guarded reverse transaction/workflow that first rolls them back in exact reverse order). Add a regression that applies `120 -> 151`, proves base rollback refuses, then proves the full `151 -> 120` rollback and reapply sequence.

### P1 — Live-state and recovery checks omit security-critical policy/RPC definitions

- **File:** `packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts:286`
- **Evidence:** `assertRelations()` checks only table name plus `relrowsecurity`; `assertProcedures()` checks only that selected signatures resolve; `assertIndexes()` checks only names. No policy predicate/role/command, grants/revokes, `SECURITY DEFINER`, `search_path`, function definition, trigger definition/enabled state, column definition, constraint expression, or index definition is compared. `assertMigrationAbsent()` at line 427 uses only one sentinel plus one residue check per migration. A disposable reproduction dropped `runs_tenant_select`; a subsequent apply returned `reused`, while `pg_policies` confirmed the policy count was zero.
- **Impact:** The runner can record/reuse history for a live database with missing tenant isolation or altered privileged RPC behavior. The same shallow sentinels can delete history during rollback recovery while unverified residue remains. This contradicts the required exact live object/RLS/policy/RPC/index verification and makes both history repair and idempotent reuse unsafe.
- **Required fix:** Build exact per-version live manifests and verify normalized table/column/constraint/index/trigger/function/policy/grant definitions, including RLS enablement, policy roles/actions/expressions, RPC `prosecdef`/`proconfig` and EXECUTE grants. Absence checks must cover every introduced object and modification. Add drift tests that remove/change a policy, change RPC security/search path/body, alter an index/constraint/trigger, and leave partial residue; every reuse/recovery path must fail closed.

# Verification

Fresh commands and outcomes:

```text
sha256sum <six approved forward/rollback SQL files>
=> all six values matched DOCUMENT_EVIDENCE_APPROVED_MIGRATIONS

DOCUMENT_EVIDENCE_DATABASE_URL=<loopback disposable PostgreSQL 16 URL> \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
  tests/integration/document-evidence-approved-migrations.test.ts \
  --config ../../vitest.shared.ts --reporter=verbose
=> 1 file passed, 8 tests passed, 0 failed

pnpm --filter @megacampus/course-gen-platform type-check
=> exit 0 after temporary links to the integration worktree dependency installation

pnpm --filter @megacampus/course-gen-platform migration:document-evidence-approved:apply
pnpm --filter @megacampus/course-gen-platform migration:document-evidence-observability:apply
pnpm --filter @megacampus/course-gen-platform migration:document-evidence-approved:rollback
=> base rollback reported rolled_back; 150/151 history and totals remained while base tables were removed

DROP POLICY runs_tenant_select ON public.document_evidence_runs;
pnpm --filter @megacampus/course-gen-platform migration:document-evidence-approved:apply
=> apply reported reused; policy count remained 0
```

The first attempted Vitest invocation used the package integration config and was not valid evidence: it selected the wrong package-relative path and entered unrelated Qdrant global setup. The recorded 8/8 result above uses the shared no-global-setup config and the correct package-relative test path.

# Risks / Follow-ups

Do not merge this implementation as an approved Q12 migration gate and do not run it against staging until all three P1 findings are fixed and independently re-reviewed. The next review must rerun the 8/8 suite plus the new frontier, downstream-order, security-drift, and residue regressions on disposable PostgreSQL. It must also verify a single documented `120 -> 151` apply and `151 -> 120` rollback workflow before remote authorization is consumed.
