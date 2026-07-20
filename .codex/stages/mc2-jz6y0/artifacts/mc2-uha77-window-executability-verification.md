---
schema_version: orchestration-artifact/v1
artifact_type: read-only-research
task_id: mc2-uha77
stage_id: mc2-jz6y0
agent_type: window-executability verification (read-only; no mutation)
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 8af76cfd4
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: read-only research; only this artifact was created.
risk_level: high
docs_reviewed: no-change-needed
graph_reviewed: no-change-needed
verification:
  - 'Every claim carries file:line evidence from the current worktree deploy/qdrant/q12-lifecycle-core.py and the ops test fixtures.'
  - 'No server/ssh/db/docker command was run; no prod mutation; only this artifact written.'
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-uha77-window-executability-verification.md
explicit_defers:
  - 'Window remains CLOSED: the owner-custody executor wiring (execute_forward_resume) into main() for live/recover is not implemented in deployed code; OQ4/OQ5/OQ6 remain open against the wired path. No prod mutation until these are resolved, reviewed, rehearsed, and the owner gives an explicit go on C1.'
---

# Summary

Verified, high confidence.

The Q12 live cutover window is **NOT executable against the current deployed
tree**. Opening it now via `deploy/qdrant/q12-live-cutover.sh live …` (or
`recover`, or the staged supervisor + manual-ordinary-command sequence) would
fail closed before any journal row is written. The last-mile production wiring
— a server-side **owner-custody executor** that provides `execute_forward_resume`
and is wired into `main()` for `live`/`recover` — is absent from deployed code;
it exists only as a **test fixture**.

# Evidence chain

1. **The deployed `live`/`recover` entrypoints instantiate only `ProductionExecutor`.**
   `main()` wires `controller(request, ProductionExecutor())` for both modes
   (`q12-lifecycle-core.py:7237`); supervisor uses the same executor (`:7204`),
   claim `:7240`, plan `LivePlanExecutor` `:7160`. No env seam or alternative
   executor selection exists (only these four instantiations of a concrete
   executor in the file).

2. **`ProductionExecutor` deliberately lacks `execute_forward_resume`.**
   The class comment states it does NOT provide it, because
   `writers.resume.forward` is "the SERVER-SIDE owner-custody child (real docker
   writers, owner custody), deliberately absent from ProductionExecutor here"
   (`:822-824`, `:3749-3752`). The unit test `q12-production-executor-cleanup`
   asserts `has_execute_forward_resume == false` (fixture runner
   `q12-production-executor-cleanup-runner.py:214`).

3. **`run_live` and `run_recover` hard-fail-closed in production at their FIRST
   statement.** `require_post_activate_executor(request, executor)` runs before
   the genesis row / Engine construction (`:3806` in run_live, `:3914` in
   run_recover). For `production is True` it raises
   `"writers.resume.forward requires the server-side owner-custody executor
(not wired here)"` when the executor lacks `execute_forward_resume`
   (`:3760-3763`). The deployed request always sets `production=True`
   (`:7234`). `stop_after` is not exposed on the CLI subparser (`:7141-7149`)
   and would not help — the pre-flight fires regardless of `stop_after`.

4. **The ordinary journal rows the window needs have no other producer.**
   `append_ordinary_lifecycle` — the only code that journals ordinary
   (`writers.quiesce`, `pg.backup`, migrations, `source.forward`, `reindex.*`,
   `deploy.*`, `writers.resume.*`) rows — is called ONLY from
   `run_joined_composer` (`:3212`), `run_live` (`:3826`), and `run_recover`
   (`:3968`). Supervisor mode journals only `root.advance` + `barrier.*` rows.
   So the staged-manual approach cannot substitute: the writer-fleet child
   `q12-writer-resume.py run_quiesce()` VALIDATES a pre-existing `phase.jsonl`
   HEAD `phase=="quiesced"` with a matching checkpoint and
   `writers.quiesce--cutover.json` capability (`:375-440`); it never creates
   that head. Only the (fail-closed-in-prod) controller can produce it.

5. **The real forward-resume driver is `source-recovery-run.sh
resume-writers-only` → `q12-writer-resume.py` forward branch
   (`:1088-1134`).** The fixture `execute_forward_resume`
   (`q12-retained-barrier-runner.py:760-830`) is a byte-twin _validation_ of
   that gate that returns a file artifact; it does NOT bounce the real docker
   writer fleet. It proves engine convergence, not production execution.

# What this means

- R8 delivered the production-twin journaling controller (`run_live`/`run_recover`)
  and proved its 81-row convergence + crash recovery against the **fixture**
  owner-custody executor. That is real and valuable, but it is not the same as
  a production-capable window.
- This is exactly the unresolved OQ2 of the 2026-07-17 operator procedure
  (no deployed producer of ordinary journal rows) and the "Task 9 live
  orchestration" scope the D5J amendment retained. R8 built the controller but
  left its production execution path deliberately un-wired.
- The prior "pre-window gate closed" via bounded server-mechanics probes
  validated trust-bridge / FD9-lease / uid mechanics only; it did not (and
  could not) close this executor-wiring gap.

# Remaining work to make the window openable (proposed)

1. Implement a deployed **owner-custody executor** (e.g.
   `OwnerCustodyExecutor(ProductionExecutor)`) that adds `execute_forward_resume`
   — driving the real `source-recovery-run.sh --operation resume-writers-only`
   child under the held FD9 lease and consuming its v2
   `guard_cleanup_complete` receipt — plus `execute_barrier_cleanup` (already on
   ProductionExecutor).
2. Wire it into `main()` for `live`/`recover` (replace the bare
   `ProductionExecutor()` at `:7237`), keeping the pre-flight as
   defense-in-depth.
3. TDD + independent correctness review; then a real rehearsal of the forward
   window against a disposable stack (the same #21 constraint applies — decide
   full-port vs. bounded probe coverage for the newly-wired path).
4. Re-verify the remaining OQs against the wired path (OQ4 resource-manifest
   constant, OQ5 snapshot exporter for `pg.backup` q12 mode, OQ6 `baseline.json`
   producer) — these are the ordinary-command-input authorities the controller
   substitutes at run time.
5. Author the current staged-window operator runbook (supersede the stale
   2026-07-17 artifact) with exact commands, STOP points, and rollback-abort.

# Verification

- All file:line citations from fresh reads of the current worktree (2026-07-19).
- No server, database, docker, or ssh command was executed; no prod mutation.

# Risks / Follow-ups

- **Blocking:** the window cannot open until the owner-custody executor is
  implemented, wired into `main()`, reviewed, and rehearsed (remaining-work
  items 1-3). Firing any live command before then fails closed at the
  pre-flight — no damage, but no progress.
- OQ4 (resource-manifest constant), OQ5 (q12 snapshot exporter for `pg.backup`),
  and OQ6 (`baseline.json` producer) remain open and must be resolved against
  the newly-wired path before the first real `pg.backup`/quiesce.
- The #21 constraint (the stock-CLI + prod-CA forward path is un-rehearsable
  against a disposable container) still applies to the newly-wired executor;
  decide full-port vs. bounded-probe rehearsal coverage.
- No secret value appears in this artifact; all secret references are paths.
