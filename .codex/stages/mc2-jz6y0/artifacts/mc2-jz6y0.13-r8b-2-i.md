---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8b-2-i
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: a15f54eef
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch (codex/q12-live-controller) per the
  launching stream owner's explicit instruction; NOT pushed. No new worktree/branch created. The
  real-PG17 runner creates one disposable postgres:17.10-bookworm container (mc2-q12-r8b2i-src-*)
  and a /tmp/mc2-q12-barrier-* run root, both torn down in the runner's finally block; no persistent
  state, no shared/production DB, no Qdrant Cloud, no prod. The gated test SKIPS without
  MC2_Q12_REAL_PG17=1, so ordinary CI touches no docker.
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log gains the R8-B-2-i
  entry (the real barrier verify-extended chain extension: real post-migration structural hashes,
  install -> maintenance_guarded, real base/observability migration + extend_guard, the two real
  verify-extended barriers, the byte-match to the frozen forward predecessor-gate receipt shape, and
  the out-of-scope rollback-gate note). No design decision changed; design §6b already ratifies the
  verify-extended checkpoints (verify-after-base/verify-after-observability) as forward barrier
  operations, so only an implementation-log entry was needed.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is confined to two NEW test-harness files under
  packages/course-gen-platform/tests/unit/ops/ (a gated vitest wrapper + its python runner that
  imports/reuses the R4 runner's helpers). No source module, no public surface, no durable-workflow
  edge, and NO change to deploy/qdrant/q12-lifecycle-core.py or any frozen/W-owned file. The existing
  local graph already models the barrier/harness lineage at the right granularity. Delegated worktree
  stream; no local Graphify refresh performed here.
verification:
  - 'Branch confirmed codex/q12-live-controller for every commit (git rev-parse --abbrev-ref HEAD ==
    codex/q12-live-controller; HEAD at session start a15f54eef).'
  - 'Gated real-PG17 verify chain (MC2_Q12_REAL_PG17=1 SUPABASE_URL=... SUPABASE_SERVICE_KEY=... pnpm
    exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-live-real-verify-chain.test.ts)
    -> 1 passed in 113916ms. Real container + REAL install (maintenance_guarded) + REAL base migration
    + REAL verify-extended --after-migration 20260711140000 (rc 0, receipt state
    20260711140000_guard_verified) + REAL observability migration + REAL verify-extended
    --after-migration 20260711151000 (rc 0, receipt state 20260711151000_guard_verified). Barrier
    stdout: "q12 database barrier: 20260711140000_guard_verified verified" and "...
    20260711151000_guard_verified verified". No DB-command stub (no MC2_Q12_BARRIER_TEST_MODE
    relaxation of the barrier DB path).'
  - 'BYTE-MATCH to the frozen contract: both real verify-extended receipts equal, key-for-key/
    value-for-value, {schema_version: megacampus.q12.database-barrier-receipt/v1, run_id, state:
    <mig>_guard_verified, zero_guard_residue: false, expected_catalog_sha256: <catalog sha, hex64>,
    last_command: verify-extended, rollback_probes_verified: true, probe_receipt_sha256: <bound
    hex64>} -- exactly what the forward prepare-recovery predecessor gate consumes
    (q12-database-barrier.sh:347-357). Guard surface: tables [active_run,baseline,migration_guards,
    probe], the 10 q12_guard functions, 1 event trigger; migration_guards == [20260711140000] after
    base and == [20260711140000,20260711151000] after observability, each row catalog_sha256 == the
    real captured post-migration structural hash. post_verify_read_only=on, post_verify_cron_active=0.'
  - 'No-docker regression (SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key
    pnpm exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-live-controller.test.ts
    tests/unit/ops/q12-production-executor-cleanup.test.ts) -> 26 passed (23 controller + 3
    ProductionExecutor). Gated test SKIPS without MC2_Q12_REAL_PG17=1 (1 skipped, 557ms, no docker).'
  - 'pnpm exec tsc --noEmit -> exit 0.'
  - 'Frozen trio sha256sum UNCHANGED: q12-database-barrier.sh
    3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9, q12-structural-catalog.sql
    0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e, q12-command-manifest.json
    aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841.'
  - 'W-owned + core clean in git status (q12-writer-resume.py, source-recovery-run.sh,
    q12-source-manifest.ts, q12-lifecycle-core.py: no modification -- NO core .py change this round).
    "cleanup" NOT in the OPERATIONS tuple (deploy/qdrant/q12-lifecycle-core.py:27-33 unchanged;
    barrier.cleanup stays the direct-journaled CLEANUP_COMMAND_ID). No frozen-manifest hard stop.'
  - "No FOUND DEFECT: the real-DB receipts/journal/guard-surface do not diverge from the fixture
    contract; they match the frozen barrier's own verify-extended output and the forward predecessor
    gate. validate_artifact.py on this file: OK."
changed_files:
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-verify-chain-runner.py: NEW
    real-PG17 runner. Imports the R4 runner as a module and reuses its scaffolding (SEED_SQL,
    canonical, sha256_hex, write_canonical, _generate_self_signed, and the frozen identity constants
    PW/POOLER_HOST/POOLER_USER/RUN_ID/IMAGE/DOCKER/PROXY/BARRIER/REPO). Adds: a pre-install
    rolled-back structural-hash preflight (baseline / after-base / after-base+obs), the immutable
    expected-catalog build with those REAL migration hashes, the run-root scaffolding + namespace/
    proxy barrier driver (install + two verify-extended), the real migration replay
    (CREATE TABLE + q12_guard.extend_guard under the stored capability), the owner-only probe receipt,
    and the guard-surface post-mortem. Emits one JSON result object.'
  - 'packages/course-gen-platform/tests/unit/ops/q12-live-real-verify-chain.test.ts: NEW gated
    (describe.runIf(MC2_Q12_REAL_PG17==1)) vitest wrapper. Asserts install=maintenance_guarded, the
    two verify-extended receipts byte-for-byte (the forward predecessor-gate shape), the exact guard
    surface + migration_guards row sets, the distinct real structural hashes, and the intact barrier
    (read_only=on, cron_active=0).'
  - 'docs/superpowers/plans/2026-07-17-q12-live-controller.md: R8-B-2-i implementation-log entry
    (incl. the R8-B-1 self-correction and fixture-asymmetry provenance, and the out-of-scope
    rollback-gate note).'
explicit_defers:
  - 'R8-B-2-ii (prepare-recovery + activate) is downstream and NOT started here. The real
    verify-after-observability receipt this round produces (rollback_probes_verified=true, bound
    probe_receipt_sha256) is exactly the predecessor prepare-recovery requires
    (q12-database-barrier.sh:347-357), so the forward chain is set up for it.'
  - 'R8-B-2-iii (cleanup) and R8-B-2-iv (the full run_live probe + composed probe) remain downstream
    and unstarted, per the task scope boundary.'
  - "Rollback-path receipt-flag tension (out of scope, to re-examine in R8-B-2-ii/iii): the ROLLBACK
    predecessor gate (q12-database-barrier.sh:685 / q12-writer-resume.py:1188-1194) requires a
    guard_verified predecessor archive to carry rollback_probes_verified=false, whereas the frozen
    barrier WRITES rollback_probes_verified=true for verify-extended (and the forward prepare-recovery
    gate requires true). This is a pre-existing frozen rollback-path expectation, NOT a divergence in
    this forward sub-round's artifacts; flagged for the round that actually drives rollback."
---

# Summary

Implements R8-B-2-i: the real-PG17 **barrier VERIFY chain**, extending the R4 install harness through
the frozen `q12-database-barrier.sh verify-extended` subcommand. No `deploy/qdrant/q12-lifecycle-core.py`
change was needed or made — this round is purely the real-PG17 **test harness** extension. The two new
files drive, against the SAME disposable full-Supabase-shaped PostgreSQL 17.10 source the R4 install leg
stands up, the next real barrier steps after `maintenance_guarded`:

1. **install → `maintenance_guarded`** (the R4 acceptance, re-driven from the shared scaffolding).
2. **verify-after-base**: a REAL base migration (`public.document_evidence_runs` CREATE TABLE) applied
   under the stored `q12_guard` capability plus a REAL `q12_guard.extend_guard` — the production
   `applyQ12BasePacket` guard-publication step (`scripts/migrations/document-evidence-approved.ts`) —
   then a REAL `verify-extended --after-migration 20260711140000` → **`20260711140000_guard_verified`**.
3. **verify-after-observability**: a REAL observability migration
   (`public.document_evidence_observability_totals` + `extend_guard`) then a REAL `verify-extended
--after-migration 20260711151000` → **`20260711151000_guard_verified`**.

Neither verify-extended is DB-stubbed: each drives the frozen barrier's real DB command through the
same unprivileged user+mount+net namespace + pooler-identity TLS proxy the R4 install leg uses (the
barrier's production connection identity has no test-mode relaxation; only the CA pin is waived in
protected test mode). The migration structural hashes baked into the immutable expected catalog are the
REAL captured post-migration structural sha256s (a pre-install rolled-back preflight on the clean
source), so `q12_guard.verify_expected_guards` recomputes and matches at each checkpoint. This is exact
because `q12-structural-catalog.sql` deliberately excludes the `q12_guard` schema, its
`enforce_write_barrier` triggers, and its `q12_guard_ddl_command_start` event trigger — so the
post-install (guarded) structural hash equals the clean-target migration hash.

## Byte-match to the frozen contract (no FOUND DEFECT)

Both real verify-extended receipts equal, key-for-key and value-for-value, the frozen receipt shape the
**forward** `prepare-recovery` predecessor gate consumes (`q12-database-barrier.sh:347-357`):
`state=<migration>_guard_verified`, `last_command=verify-extended`, `zero_guard_residue=false`,
`rollback_probes_verified=true`, `probe_receipt_sha256` a bound `hex64`. The guard surface (four
`q12_guard` tables, ten functions, the single event trigger, and the exact `migration_guards` row set —
`[20260711140000]` after base, `[20260711140000,20260711151000]` after observability, each row's
`catalog_sha256` the real captured post-migration structural hash) is proven by verify-extended
returning `rc 0` (its own exhaustive `verify_expected_guards` guard-surface asserts must all hold
against the real database) and re-read as an independent post-mortem. There is no real-DB-vs-fixture
divergence: the produced artifacts match the frozen barrier's own verify-extended output and the
forward-path predecessor contract.

## Provenance (recorded per task)

- **R8-B-1 self-correction — the db-capability deletion owner.** Full reading of the frozen barrier
  confirms it **never unlinks the db-capability**: it opens the capability into an `O_NOFOLLOW` FD and
  only reads/validates/hashes it (`q12-database-barrier.sh:230,285,646,983-986,1053`); there is no
  `rm`/`unlink` of the capability anywhere in the script. The **controller** owns the deletion
  (R8-B-1's `ProductionExecutor.execute_barrier_cleanup`). So R8-B-1 stands correct as delivered — the
  "idempotent-absent" tweak (making the seam deletion tolerant of an already-absent capability, in case
  the barrier child had deleted it) was correctly **dropped**: the child does not delete it, so the
  seam remains the sole deleter and no already-absent tolerance is needed.
- **Accepted fixture asymmetry.** The fixture executor does not delete a capability (in the fixture
  path none exists to delete); production does (the seam). Because the barrier never touches the
  capability's existence and the receipt/journal bytes are derived solely from the capability's
  content digest (not its presence), the receipt/journal bytes are identical across the fixture and
  production paths — the byte-level contract is not violated by the asymmetry.

# Verification

See the frontmatter `verification` list for exact commands/results: the gated real-PG17 verify chain
(1 passed, 113916ms — real install + two real verify-extended barriers, byte-matched receipts + guard
surface); no-docker controller+ProductionExecutor 26/26; gated test skips without the flag; `tsc
--noEmit` 0; frozen trio sha256 byte-identical; W-owned + core clean; `cleanup` not in OPERATIONS. All
vitest commands run with `cd .../q12-live-controller/packages/course-gen-platform`.

# Risks / Follow-ups

- **Rollback-path receipt-flag tension (out of scope, flagged for R8-B-2-ii/iii).** The ROLLBACK
  predecessor gate (`q12-database-barrier.sh:685` / `q12-writer-resume.py:1188-1194`) requires a
  `guard_verified` predecessor archive to carry `rollback_probes_verified=false`, whereas the frozen
  barrier WRITES `true` for verify-extended (and the forward `prepare-recovery` gate requires `true`).
  This is a pre-existing frozen rollback-path expectation, NOT a divergence in this forward sub-round's
  artifacts (which match the frozen output + the forward contract). It should be re-examined when the
  rollback leg is actually driven; recommend a Beads issue if the rollback round confirms it is
  reachable.
- R8-B-2-ii (prepare-recovery/activate), R8-B-2-iii (cleanup), and R8-B-2-iv (full run_live probe +
  composed probe) remain downstream and unstarted, per the task scope boundary. The
  verify-after-observability receipt produced here is exactly the predecessor R8-B-2-ii's
  prepare-recovery requires.
