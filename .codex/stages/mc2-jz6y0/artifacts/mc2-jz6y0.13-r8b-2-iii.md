---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8b-2-iii
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: d48a6441e
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch (codex/q12-live-controller) per the
  launching stream owner's explicit instruction; NOT pushed. No new worktree/branch created. The
  real-PG17 runner creates one disposable postgres:17.10-bookworm container (mc2-q12-r8b2i-src-*) and
  a /tmp/mc2-q12-barrier-* run root, both torn down in the runner's finally block; no persistent
  state, no shared/production DB, no Qdrant Cloud, no prod/staging. The gated test SKIPS without
  MC2_Q12_REAL_PG17=1, so ordinary CI touches no docker.
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log gains the R8-B-2-iii
  entry (real barrier cleanup off the activated state: controller journal to the claimed boundary +
  v1 archive, real DROP SCHEMA q12_guard CASCADE + 18-key terminal proof, cleanup idempotence, the
  R8-B-1 ProductionExecutor seam consuming the REAL terminal proof to promote the 10-key v2 + delete
  the db-capability, and the defrost-P3 literal SQLSTATE fold). No design decision changed; design §6b
  already ratifies barrier.cleanup as the direct-journaled post-activate lifecycle and R8-B-1 already
  owns the seam, so only an implementation-log entry was needed.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is confined to two existing test-harness files under
  packages/course-gen-platform/tests/unit/ops/ (the gated vitest wrapper + its python runner). No
  source module, no public surface, no durable-workflow edge, and NO change to
  deploy/qdrant/q12-lifecycle-core.py or any frozen/W-owned file. The seam it exercises
  (ProductionExecutor.prepare_barrier_cleanup/execute_barrier_cleanup, orchestrate_post_activate_cleanup)
  already exists in the graph at the right granularity. Delegated worktree stream; no local Graphify
  refresh performed here.
verification:
  - 'Branch confirmed codex/q12-live-controller for every commit (git rev-parse --abbrev-ref HEAD ==
    codex/q12-live-controller; HEAD at session start d48a6441e). RED test commit 1cbe848c6, GREEN
    runner commit be305d809, docs commit is this artifact + the plan-log entry.'
  - 'RED first: with only the test-side cleanup/seam/SQLSTATE assertions added (1cbe848c6) and the
    runner unchanged, the gated real-PG17 run FAILED (116403ms) at the first new assertion
    (Q12_PROBE_SQLSTATE=P0001 absent), while install->activate stayed green -- the captured gap. After
    wiring the runner (be305d809) the same gated run PASSED (1 passed, 118829ms).'
  - 'Gated real-PG17 chain (MC2_Q12_REAL_PG17=1 SUPABASE_URL=http://127.0.0.1:54321
    SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts
    tests/unit/ops/q12-live-real-verify-chain.test.ts) -> 1 passed in 118829ms. Real container +
    install(maintenance_guarded) -> verify-base -> verify-obs -> prepare-recovery(recovery_ready_guarded)
    -> activate(activated) -> REAL cleanup -> cleanup(idempotent) -> R8-B-1 seam. No DB-command stub (no
    MC2_Q12_BARRIER_TEST_MODE relaxation of the barrier DB path on any leg).'
  - 'REAL barrier cleanup (rc 0) drove real DROP SCHEMA q12_guard CASCADE off the ACTIVATED container
    and published the EXACT 18-key megacampus.q12.database-barrier-terminal-proof/v1: keys
    {schema_version, run_id, operation=cleanup, state=guard_cleanup_complete,
    expected_post_migration_catalog_sha256, database_barrier_baseline_sha256, predecessor_receipt_sha256,
    predecessor_receipt_archive_sha256, database_barrier_rollback_intent_sha256=null,
    input_checkpoint_sha256, intent_journal_entry_hash, structural_catalog_sha256, database_default_sha256,
    cron_jobs_sha256, guard_residue, required_phase_receipts_sha256=null, database_capability_sha256,
    completed_at}. structural_catalog_sha256 == expected_post_migration_catalog_sha256 == the real
    after-obs structural hash (q12_guard excluded from the structural catalog). guard_residue all-zero
    {q12_guard_schema_count:0, q12_guard_relation_count:0, q12_guard_function_count:0,
    q12_guard_type_count:0, q12_guard_trigger_count:0, q12_guard_event_trigger_count:0,
    barrier_era_session_count:0}. Independent live query: q12_guard schema/relation/function/event-trigger
    counts all 0.'
  - 'Cleanup re-drive idempotence: a second cleanup drive (rc 0) hit the barrier early
    terminal-proof re-validation branch (q12-database-barrier.sh:764-808), printed "guard_cleanup_complete
    proof already verified", and left the terminal proof byte-identical
    (sha256_after_rerun == sha256_after_barrier). No DB re-mutation (same cutover epoch; no recovery
    machinery).'
  - 'R8-B-1 seam consumes the REAL terminal proof end-to-end: the REAL
    ProductionExecutor.prepare_barrier_cleanup + execute_barrier_cleanup (q12-lifecycle-core.py:826-912),
    driven on the REAL run_root the barrier just populated, archived the v1 activate receipt byte-exact
    (archive_matches_activate_receipt == true) and promoted the receipt IN PLACE to the EXACT 10-key
    megacampus.q12.database-barrier-receipt/v2: keys {database_capability_deleted=true,
    expected_catalog_sha256, last_command=cleanup, probe_receipt_sha256, rollback_probes_verified=true,
    run_id, schema_version, state=guard_cleanup_complete, terminal_proof_sha256, zero_guard_residue=true}.
    terminal_proof_sha256 == sha256 of the REAL barrier terminal proof; probe_receipt_sha256 == the real
    probe digest. v2 bytes == the independently recomputed complete_object(expected_v2) (byte-match to the
    fixture contract q12-retained-barrier-runner.py:731-742). db-capability deleted
    (capability_exists_after_seam == false). The v2 matches the W forward resume gate shape
    (q12-writer-resume.py:1088-1101, READ-ONLY).'
  - 'Defrost P3 folded: the anti-weakening guard probe (moved to run PRE-cleanup, since DROP SCHEMA
    removes the guard) asserts the LITERAL SQLSTATE via a DO/EXCEPTION handler emitting
    Q12_PROBE_SQLSTATE=% then re-RAISE; all three q12_guard-table writes trip Q12_PROBE_SQLSTATE=P0001
    with the append-only message and NONE regresses to 42703 "has no field \"run_id\"".'
  - 'pnpm exec tsc --noEmit -> exit 0. Gated test SKIPS without MC2_Q12_REAL_PG17=1 (1 skipped, 514ms,
    no docker).'
  - 'Frozen barrier UNCHANGED: sha256sum deploy/qdrant/q12-database-barrier.sh ==
    bdb9d935e3c09fb01503ba9d016f36a9cf94db5539dfcdc73c1692eb442925ce. git status clean for
    q12-writer-resume.py, source-recovery-run.sh, q12-source-manifest.ts, q12-command-manifest.json,
    q12-structural-catalog.sql, q12-lifecycle-core.py. git diff --stat over the round shows ONLY the two
    write-zone files. No core edit (the R8-B-1 seam already existed).'
  - 'No FOUND DEFECT: the real-DB terminal proof, promoted v2, journal, and guard residue do not diverge
    from the fixture contract; they match the frozen barrier cleanup output, the R8-B-1 seam, and the W
    forward resume gate shape. validate_artifact.py on this file: OK.'
changed_files:
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-verify-chain-runner.py: extend
    past activate. The controller creates the byte-exact database-barrier-receipt-v1-before-cleanup.json
    archive; builds a REAL hash-chained guard_cleanup_complete journal (minimal 3-row intent ->
    capability_issued -> capability_claimed block, command_id=barrier.cleanup, lease_epoch=cutover) to
    the claimed boundary + the cleanup input checkpoint (journal_device/inode bound to the real journal);
    drives the frozen barrier cleanup twice (real DROP SCHEMA + 18-key terminal proof, then idempotent
    re-validation); independently queries q12_guard residue; imports q12-lifecycle-core.py and drives the
    REAL ProductionExecutor seam (v1 archive -> 10-key v2 -> db-capability deletion) on the real
    run_root; recomputes the exact v2 for the byte-match; and folds the defrost-P3 literal SQLSTATE
    capture into guard_probe (DO/EXCEPTION emitting Q12_PROBE_SQLSTATE=% + re-RAISE). Emits the new
    cleanup/seam result fields.'
  - "packages/course-gen-platform/tests/unit/ops/q12-live-real-verify-chain.test.ts: extend the gated
    assertions past activate -- the 18-key terminal proof shape + all-zero residue + q12_guard-gone live
    query, cleanup re-drive idempotence, the R8-B-1 seam's exact 10-key v2 (byte-match + real digests) +
    v1 archive byte-exactness + db-capability deletion, and the anti-weakening probe's literal
    SQLSTATE=P0001. describe/it titles and spawnSync/it timeouts updated for the longer chain."
  - 'docs/superpowers/plans/2026-07-17-q12-live-controller.md: R8-B-2-iii implementation-log entry.'
explicit_defers:
  - 'Recovery-epoch cleanup re-drive (barrier :514-518, lease_epoch cutover-recovery-N) is NOT
    exercised: same-cutover-epoch idempotence is proven (the early terminal-proof re-validation branch),
    but a multi-epoch recovery re-drive needs the resume/recover epoch machinery (disproportionate to
    drive by hand here). Deferred to stage iv / the server rehearsal.'
  - 'R8-B-2-iv (the full run_live probe + composed probe) remains downstream and unstarted, per the
    task scope boundary. This round proves the barrier-cleanup + R8-B-1 seam half end-to-end against
    real PG17; the run_live orchestration wiring is the next leg.'
  - 'The deployed SERVER barrier is out of scope and untouched (this round drives only disposable
    postgres:17.10-bookworm containers). The server-side full-path run_live rehearsal remains the
    orchestrator-pinned pre-window gate.'
---

# Summary

Implements R8-B-2-iii: drive the **REAL frozen barrier `cleanup`** off the activated state on real
PostgreSQL 17.10, then prove the **R8-B-1 controller seam** consumes the REAL terminal proof
end-to-end. No `deploy/qdrant/q12-lifecycle-core.py` change was needed or made — the R8-B-1 seam
(`ProductionExecutor.prepare_barrier_cleanup`/`execute_barrier_cleanup`, `orchestrate_post_activate_cleanup`)
already exists. This round is purely the real-PG17 **test-harness** extension of the same
`q12-live-real-verify-chain.test.ts` / `…-runner.py` past `activated`.

The verify-chain runner already stands up ONE disposable postgres:17.10 with the unprivileged
namespace + pooler-identity TLS proxy and drives install(`maintenance_guarded`) → verify-base →
verify-obs → prepare-recovery(`recovery_ready_guarded`) → activate(`activated`). This round adds, off
that same activated container:

1. **The controller-journal half.** The frozen barrier `cleanup` predecessor gate
   (`q12-database-barrier.sh:636-700`) requires the install baseline (already published), the activate
   receipt (already at `database-barrier-receipt.json`), a byte-exact predecessor-receipt ARCHIVE the
   controller creates before the barrier runs, and — unlike the head-only verify/activate legs — a
   FULLY re-hashed `phase.jsonl` (the cleanup projection at `:446-570` recomputes every entry hash and
   validates the chain to the claimed boundary). The controller builds a REAL hash-chained
   `guard_cleanup_complete` lifecycle — a minimal 3-row `intent → capability_issued →
capability_claimed` block, all `command_id=barrier.cleanup` / `lease_epoch=cutover` — which is the
   smallest journal the barrier's cleanup grammar accepts (the rows are filtered by phase+command_id
   and only need to be a valid trailing contiguous chain, so prior forward rows are optional), plus the
   matching cleanup input checkpoint with `journal_device`/`journal_inode` bound to the real journal.
2. **The REAL barrier cleanup.** Same real path as every other leg (bytes `bdb9d935…`, no
   `MC2_Q12_BARRIER_TEST_MODE` relaxation of the DB command): real `DROP SCHEMA q12_guard CASCADE`,
   zero-residue proof, and the 18-key terminal proof. An independent live `pg_namespace`/`pg_class`/
   `pg_proc` query confirms `q12_guard` is really gone.
3. **Cleanup idempotence.** A second cleanup drive hits the barrier's early terminal-proof
   re-validation branch (`:764-808`, before any DB work), re-validates the proof exact, and exits 0 —
   the proof is re-validated, not re-produced.
4. **The R8-B-1 seam end-to-end.** The REAL `ProductionExecutor` consumes the REAL barrier-produced
   artifacts (terminal proof + probe + activate v1 receipt + capability) to archive v1 byte-exact,
   promote the receipt IN PLACE to the exact 10-key `database-barrier-receipt/v2` (binding the REAL
   `terminal_proof_sha256`, `database_capability_deleted=true`), and delete the db-capability. The v2
   BYTE-MATCHES the fixture contract for the same inputs and satisfies the W forward resume gate shape.
5. **Defrost P3.** The anti-weakening guard probe is moved to run PRE-cleanup (the guard is dropped
   after) and now asserts the LITERAL `SQLSTATE=P0001` via a `DO/EXCEPTION` handler
   (`Q12_PROBE_SQLSTATE=%` + re-RAISE), not just the append-only message.

## The 18-key terminal proof and 10-key v2 observed (no FOUND DEFECT)

The barrier published the exact 18-key `megacampus.q12.database-barrier-terminal-proof/v1`
(`operation=cleanup`, `state=guard_cleanup_complete`, `structural_catalog_sha256 ==
expected_post_migration_catalog_sha256 ==` the real after-obs structural hash since `q12_guard` is
excluded from the structural catalog, `database_barrier_rollback_intent_sha256=null`,
`required_phase_receipts_sha256=null`, `guard_residue` all-zero). The seam promoted the exact 10-key
`megacampus.q12.database-barrier-receipt/v2` (`schema_version`, `run_id`, `state=guard_cleanup_complete`,
`expected_catalog_sha256`, `zero_guard_residue=true`, `last_command=cleanup`,
`rollback_probes_verified=true`, `probe_receipt_sha256`, `terminal_proof_sha256`,
`database_capability_deleted=true`), byte-identical to the independently recomputed contract
projection. There is no real-DB-vs-fixture divergence.

# Verification

See the frontmatter `verification` list for exact commands/results: RED (test-only assertions failed
on the SQLSTATE/cleanup gap, 116403ms) → GREEN (1 passed, 118829ms — real install → activate → cleanup
→ idempotent cleanup → seam, 18-key terminal proof, all-zero residue, q12_guard-gone live query, 10-key
v2 byte-match, db-capability deleted, literal SQLSTATE=P0001); `tsc --noEmit` 0; gated test skips
without the flag; barrier sha `bdb9d935…` byte-identical; W-owned + core + frozen manifest/catalog clean
(`git diff --stat` shows only the two write-zone test files). All vitest commands run with `cd
.../q12-live-controller/packages/course-gen-platform`.

# Risks / Follow-ups

- **Recovery-epoch cleanup re-drive not exercised (explicit defer).** Same-cutover-epoch idempotence is
  proven (the early terminal-proof re-validation branch); a multi-epoch `cutover-recovery-N` re-drive
  (barrier `:514-518`) needs the resume/recover epoch machinery and is deferred to stage iv / the server
  rehearsal.
- **R8-B-2-iv (full run_live probe + composed probe) remains downstream and unstarted**, per the task
  scope boundary. This round proves the barrier-cleanup + R8-B-1 seam half end-to-end against real
  PG17; the run_live orchestration wiring (with `execute_forward_resume` deliberately server-side/absent
  in the ProductionExecutor) is the next leg.
- **Server-side rehearsal.** The deployed SERVER barrier stays untouched; the orchestrator-pinned
  server-side full-path `run_live` rehearsal remains the non-negotiable pre-window gate.
