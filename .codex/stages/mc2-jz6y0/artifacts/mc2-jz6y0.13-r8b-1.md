---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8b-1
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: c52106c29
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch (codex/q12-live-controller) per the
  launching stream owner's explicit instruction; NOT pushed. No new worktree/branch created. The
  no-docker R8-B-1 tests create disposable /tmp/mc2-q12-r8b1-root-* temp roots torn down by the
  vitest afterEach; no persistent state. No docker/PG/Qdrant/Supabase touched (file-artifact half
  only; the barrier cleanup child that produces the terminal proof against real PG17 is R8-B-2).
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log updated with the
  R8-B-1 entry (real ProductionExecutor.prepare_barrier_cleanup + execute_barrier_cleanup
  file-artifact half; consume-not-fabricate delegation discipline; v1 archive -> exact 10-key v2
  promotion -> db-capability deletion; the resume-specific pre-flight split). No design decision
  changed; the design spec §6b already ratifies the seam split (executor owns the file artifacts,
  the barrier child owns the terminal proof) and the resume half staying server-side — this round
  is the implementation of the file-artifact executor half plus the resume-specific named
  fail-closed, so only an implementation-log entry was needed.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is confined to deploy/qdrant/q12-lifecycle-core.py (three methods added to the existing
  ProductionExecutor class + a two-branch split of the existing require_post_activate_executor
  pre-flight; no new module/service/public surface, no new durable-workflow edge) plus one new
  no-docker test file and its python runner fixture under
  packages/course-gen-platform/tests/unit/ops/. The existing local graph models
  q12-lifecycle-core.py at the right granularity. Delegated worktree stream; no local Graphify
  refresh performed here.
verification:
  - 'Branch confirmed codex/q12-live-controller for every commit (git rev-parse --abbrev-ref HEAD ==
    codex/q12-live-controller; HEAD at session start c52106c29).'
  - 'RED->GREEN->docs commits on codex/q12-live-controller (RED 365b5b745, GREEN e2f86f77a, docs =
    this artifact commit). RED confirmed FIRST: all 3 new tests failed against the pre-GREEN core
    (file-artifact test: ProductionExecutor lacked prepare_barrier_cleanup; the two resume tests got
    the generic "post-activate cleanup/resume executor not wired (deferred to R8)" instead of the
    resume-specific error).'
  - 'Target suite (no docker, no PG): SUPABASE_URL=http://127.0.0.1:54321
    SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts
    tests/unit/ops/q12-live-controller.test.ts tests/unit/ops/q12-production-executor-cleanup.test.ts
    -> 26 passed (23 R8-I controller unaffected + 3 new ProductionExecutor).'
  - 'Cross-fixture regression: q12-retained-barrier-quiesce-seam + q12-retained-barrier-w-composition
    -seam -> 50 passed; qdrant-source-recovery-runtime + q12-live-cutover + q12-live-cutover-cli ->
    410 passed (460 total, matching the R8-I-B baseline).'
  - 'pnpm exec tsc --noEmit -> exit 0.'
  - 'Frozen trio sha256sum UNCHANGED: q12-command-manifest.json
    aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841, q12-database-barrier.sh
    3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9, q12-structural-catalog.sql
    0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e.'
  - 'W-owned files clean in git status (q12-writer-resume.py, source-recovery-run.sh,
    q12-source-manifest.ts: no modification).'
  - 'OPERATIONS guard: "cleanup" NOT in OPERATIONS (grep of the tuple == 0) and NOT a manifest
    command id ("cleanup" and "barrier.cleanup" both absent from q12-command-manifest.json commands;
    barrier.cleanup stays the direct-journaled CLEANUP_COMMAND_ID, unchanged). No frozen-manifest
    hard stop.'
  - 'No real DB / docker / Qdrant Cloud / Supabase / prod touched: the file-artifact hook consumes
    an EXISTING seeded terminal proof + probe receipt (as the R8-B-2 barrier child would leave); no
    barrier child, container, or network invocation in this round.'
changed_files:
  - 'deploy/qdrant/q12-lifecycle-core.py: (1) ProductionExecutor.prepare_barrier_cleanup (~:814) —
    resolves the frozen q12-database-barrier.sh cleanup {argv, command_sha256}. (2)
    ProductionExecutor.execute_barrier_cleanup (~:836) — consumes the on-disk terminal proof + probe
    receipt via validate_regular_file, binds their real digests, archives the activate v1 receipt
    (immutable_publish 0400), promotes in place to the exact 10-key database-barrier-receipt/v2
    (atomic_replace 0400), and unlinks the db-capability; returns the cleanup outcome shape. (3)
    require_post_activate_executor (~:3717) — split into a file-artifact check (generic "not wired")
    and a resume check (resume-specific named refusal), pre-flight-first preserved.'
  - 'packages/course-gen-platform/tests/unit/ops/q12-production-executor-cleanup.test.ts: NEW
    no-docker vitest suite — file-artifact byte-twin proof (v1 archive, exact 10-key v2 binding the
    seeded terminal/probe digests, capability deletion, outcome shape) + production run_live and
    run_recover resume-specific fail-closed at the pre-flight (pre-flight-first proven by the /tmp
    root NOT raising "production run root mismatch").'
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-production-executor-cleanup-runner.py:
    NEW python runner — seeds the producer artifacts the barrier child + earlier phases leave (v1
    activate receipt, 18-key terminal proof, fixture _barrier_probe_object probe receipt,
    db-capability), drives the real ProductionExecutor hooks, and emits the produced v2/archive/
    capability facts + an independently recomputed byte-match anchor.'
  - 'docs/superpowers/plans/2026-07-17-q12-live-controller.md: R8-B-1 implementation-log entry.'
explicit_defers:
  - 'R8-B-2 (the REAL full-window PG17 leg): running the frozen q12-database-barrier.sh cleanup child
    against a disposable real PostgreSQL 17.10 to PRODUCE the 18-key terminal proof (and reconcile
    the child-side db-capability deletion vs the seam-side deletion) is downstream and NOT started
    here. This round delivers the file-artifact executor half consuming an existing terminal proof,
    as the task scoped.'
  - 'execute_forward_resume (writers.resume.forward) stays deliberately unimplemented on
    ProductionExecutor: it is the server-side owner-custody child (real docker writers, owner
    custody). Production runs fail closed with the resume-specific named refusal at the pre-flight.
    Wiring the real server-side resume executor is a separate downstream obligation; no defect found.'
---

# Summary

Implements design §6b.1 R8-B-1: the REAL `ProductionExecutor` post-activate **FILE-ARTIFACT** seam —
the production twin of the retained-barrier fixture's `LiveOrdinaryExecutor.execute_barrier_cleanup`
file-artifact half — with **no real DB, no docker, no barrier child run** this round.

## The two ProductionExecutor hooks (`deploy/qdrant/q12-lifecycle-core.py`)

- **`prepare_barrier_cleanup(context)`** (~`:814`): resolves the frozen `q12-database-barrier.sh
cleanup` command and returns the same `{argv, command_sha256}` shape the fixture returns and
  `orchestrate_post_activate_cleanup` carries into the journaled cleanup rows (§6b.4 — barrier.cleanup
  is direct-journaled, never manifest-resolved). The argv uses the real production path conventions
  from the manifest (`/opt/megacampus/secrets/...`, `run_root/secrets/db-capability`,
  `run_root/expected-post-migration-catalog.json`); `command_sha256 = sha256(canonical(argv))`.

- **`execute_barrier_cleanup(context, command)`** (~`:836`): the file-artifact controller steps.
  It **mirrors the real delegation discipline of `execute()`/`launch_claim()`** — it never fabricates
  producer data; it **consumes** the barrier child's own on-disk artifacts and binds their real
  digests, exactly as `execute()` binds `sha256(child stdout)`:
  1. reads the 18-key terminal proof (`database-barrier-cleanup-terminal-proof.json`) via
     `validate_regular_file(mode=0o400)` and binds `terminal_proof_sha256`;
  2. reads the prepare-recovery probe-receipt bootstrap (`database-barrier-probe-receipt.json`, the
     input the frozen barrier re-validates at `q12-database-barrier.sh:235` and the forward resume
     gate re-reads at `q12-writer-resume.py:1105`) and binds `probe_receipt_sha256`;
  3. **archives** the activate v1 receipt byte-exact to `database-barrier-receipt-v1-before-cleanup.json`
     (`immutable_publish`, 0400) — the frozen barrier requires this archive to equal the predecessor
     receipt (`q12-database-barrier.sh:640/644`);
  4. **promotes in place** to the exact 10-key `megacampus.q12.database-barrier-receipt/v2`
     (`state=guard_cleanup_complete`, `zero_guard_residue=true`, `last_command=cleanup`,
     `database_capability_deleted=true`) via `atomic_replace` (0400) — key-for-key what the forward
     resume gate demands (`q12-writer-resume.py:1090-1101`);
  5. **deletes** the db-capability (`run_root/secrets/db-capability`): validates the producer-owned
     0400 identity, then unlinks via the parent dirfd without following a link;
  6. returns the cleanup outcome (`cleanup_receipt_sha256` hex64, receipt, archive/probe paths, the
     bound digests, and the `command_sha256`) `orchestrate_post_activate_cleanup` consumes.

The produced v2 is a **byte twin** of the fixture's v2 for the same inputs: both build the identical
10-key dict from the same run_id / expected_catalog_sha256 / terminal-proof / probe digests through
the same `complete_object` (`sort_keys`) serializer. The one division-of-labor difference from the
fixture — the seam **consumes** the probe receipt (an earlier-phase / barrier-child artifact) rather
than re-writing it — leaves the on-disk bytes and the v2 digest identical, so the byte-level contract
does **not** diverge (no found-defect).

## The resume-specific named fail-closed (`require_post_activate_executor`, ~`:3717`)

The single generic pre-flight gate is split into two named checks, keeping the pre-flight the FIRST
statement of `run_live`/`run_recover` (before any journal row / run-root mutation):

- file-artifact half absent (`execute_barrier_cleanup is None`) → the generic
  `"post-activate cleanup/resume executor not wired (deferred to R8)"` (an un-seeded/legacy wiring);
- resume half absent (`execute_forward_resume is None`) → the resume-SPECIFIC
  `"writers.resume.forward requires the server-side owner-custody executor (not wired here)"`.

After R8-B-1 `ProductionExecutor` has `execute_barrier_cleanup` (file-artifact check passes) but not
`execute_forward_resume` (the server-side owner-custody child), so a production run still fails closed
— now with the resume-specific reason. The test proves pre-flight-first: a `/tmp` run root under
`production=true` would otherwise raise `"production run root mismatch"` from `Engine.__post_init__`;
getting the resume-specific error instead proves the pre-flight ran before Engine construction and
left the run root untouched (no `phase.jsonl`).

`orchestrate_post_activate_cleanup`, the journaled cleanup grammar (R8-I-A), `run_recover`'s dispatch
(R8-I-B), the composer body, and `stop_after` are **unchanged**; the fixture executors still provide
all three hooks, so every R5/R8-I test is unaffected.

## Commits (this branch, chronological)

- RED `365b5b745`: the new no-docker test suite + python runner (3 tests fail against the pre-GREEN
  core: missing hook + generic-not-resume-specific error).
- GREEN `e2f86f77a`: the two ProductionExecutor hooks + the resume-specific pre-flight split.
- docs: this artifact + the plan-log entry.

## HARD-STOP classes — none triggered

- No frozen byte modified (trio sha256 byte-identical) and no W-owned file touched.
- No `cleanup` in OPERATIONS and none as a manifest command id.
- No real DB / docker / Qdrant / Supabase / prod invoked (file-artifact half only; terminal proof
  consumed as seeded, as the R8-B-2 barrier child would produce it).
- No real-DB / file-artifact shape divergence from the fixture contract (the v2 is a byte twin).

# Verification

See the frontmatter `verification` list for exact commands/results (RED-first confirmation; 26-pass
controller+ProductionExecutor target suite; 460-pass cross-fixture regression; tsc 0; frozen trio
sha256 unchanged; W-owned clean; OPERATIONS/manifest guards; no docker/PG). All vitest commands run
with `cd .../q12-live-controller/packages/course-gen-platform` and the SUPABASE\_\* fixture env.

# Risks / Follow-ups

- R8-B-2 (real full-window PG17) must produce the 18-key terminal proof by running the frozen
  `q12-database-barrier.sh cleanup` child against a disposable PostgreSQL 17.10, and reconcile WHO
  deletes the db-capability: in this file-artifact round the seam deletes it (the barrier child did
  not run); when the real child runs it deletes the capability in the actual run root, so R8-B-2 must
  either make the seam deletion tolerant of an already-absent capability or leave the deletion to the
  child. This is a downstream reconciliation, not a divergence in the current file-artifact contract.
- The resume half (`execute_forward_resume`, server-side owner-custody) is deliberately absent;
  production stays fail-closed with the resume-specific reason. Wiring the real server-side resume
  executor is a separate downstream obligation.
