# Q12 Live-Window Execution Wiring — Plan

- Date: 2026-07-19
- Design: `docs/superpowers/specs/2026-07-19-q12-window-execution-wiring-design.md`
- Stage: `mc2-jz6y0`; tracking bead `mc2-uha77`; branch
  `codex/self-hosted-qdrant-platform` (worktree base `8af76cfd4`)
- Tier: complex (multiple file-changing streams, a real-execution wiring, an
  owner-gated production window). Orchestrator-led per
  `orchestration-bridge:orchestrator-stage`.

## Task graph

```
W0 (rehydrate/baseline) ─▶ W1 (owner-custody executor + wiring)
                        └▶ W2 (real value plumbing) ─▶ W3 (snapshot coord + baseline.json)
W1,W2,W3 ─▶ W4 (STOP-point model) ─▶ W5 (rehearsal) ─▶ W6 (runbook) ─▶ W7 (open window, OWNER-GATED)
```

W1 and the W2/W3 chain are independent enough to run as two streams
(W1 = executor wiring; W2/W3 = value/producer plumbing) with `write_isolation`
worktrees; they converge at W4.

## W0 — Rehydrate + baseline (read-only)

- Read the design spec, the verification artifact
  `mc2-uha77-window-executability-verification.md`, the 2026-07-17 live-controller
  design/plan, and the D5J amendment.
- Re-verify the §2 gap claims still hold at the current HEAD (`git log`,
  re-grep `execute_forward_resume`, `derive_joined_fixture_values` callers,
  `main()` executor wiring).
- Run the baseline focused Q12 unit suite + `pnpm type-check` to record a green
  starting matrix.
- Acceptance: gap re-confirmed with fresh evidence; baseline matrix recorded on
  `mc2-uha77`.

## W1 — Owner-custody executor + wiring (file-changing)

- Add a deployed executor (e.g. `OwnerCustodyExecutor(ProductionExecutor)` in
  `deploy/qdrant/q12-lifecycle-core.py`) providing `execute_forward_resume`
  (design §W1) that drives `source-recovery-run.sh --operation resume-writers-only
--resume-mode forward --run-id <recovery-run-id>` under the FD9 lease and
  returns `{status:"resumed", ok:true, validated_receipt_sha256}`.
- Wire it into `main()` for `live`/`recover` (replace bare `ProductionExecutor()`
  `:7237`); keep the pre-flight gate.
- TDD: RED test that a production `live`/`recover` now passes the pre-flight and
  invokes the resume child (mock the subprocess boundary); assert the
  receipt-sha binding check (`:3523-3525`). Keep
  `q12-production-executor-cleanup` semantics for the bare `ProductionExecutor`.
- Acceptance: pre-flight passes for the wired executor; resume child invoked with
  the exact argv/env under the held lease; receipt-sha binding enforced; focused
  suite + type-check green; independent correctness review clean.

## W2 — Real production value plumbing (file-changing; largest)

- On the production path, replace `derive_joined_fixture_values` substitution
  with the D5J single-authority real values for the 7 non-request placeholders
  (design §W2 table). Keep the fixture derivation for the non-production
  (composer/parity) path.
- Define and document the **real-run acceptance oracle** (composer byte-parity
  does NOT apply once `command_sha256` binds real argv): real child exit-0 +
  real barrier receipt state-machine + real coverage evidence. Add real-path
  unit/integration tests; keep the fixture parity suite intact.
- Acceptance: production `run_live`/`run_recover` resolve every ordinary command
  with a real, existing authority (no fixture-derived snapshot/generation/
  recovery ids on the prod path); real-run oracle defined + tested; fixture
  parity suite still green; independent review clean.

## W3 — Snapshot coordinator (OQ5) + baseline.json (OQ6) (file-changing)

- Deployed q12-mode snapshot coordinator: hold a REPEATABLE READ
  `pg_export_snapshot()` open across `pg.backup` (reuse/extend the plan-internal
  coordinator `q12-lifecycle-core.py:5718-5774`) without manual operator psql.
- Producer for `<run-root>/baseline.json` (`backup-supabase.sh:924-931`).
- Acceptance: `pg.backup` q12 mode runs against a real exported snapshot + real
  baseline in an isolated drill; zero residue; independent review clean.

## W4 — Safe STOP-point operator model (file-changing)

- Implement a reversible operator STOP before the point of no return: expose
  `--stop-after` on the `live` CLI (checkpoints exist `:3597-3603`) and define
  the deliberate continue (`recover` or `live`-continue) through `activate`;
  OR document an equivalent staged sequence. Preserve the #18 rollback-abort
  boundary and make it operator-visible.
- Acceptance: an operator can stop at a reversible checkpoint, verify, and only
  then cross C9; rollback-abort proven before `activate`; tests green.

## W5 — Rehearsal (respect #21) (file-changing tests/tools)

- Define + implement rehearsal coverage for the newly-wired real path (design
  §W5): fusion argv-rewrite rehearsal executor against a disposable stack, or
  extended bounded probes covering the resume + real-value legs. Document what
  stays IN-WINDOW-only under #18.
- Acceptance: the wired resume + real-value path is exercised against a
  disposable stack (or the residual is explicitly bounded, tracked, and
  owner-visible); green.

## W6 — Current operator runbook (docs)

- Author `.codex/stages/mc2-jz6y0/artifacts/<id>-c0-window-operator-procedure-v2.md`
  (supersede the 2026-07-17 procedure) with exact commands, real inputs, STOP
  points, per-step verification, rollback-abort; fold in OQ1 (dual-state
  quiesce). Validate with `validate_artifact.py`.
- Acceptance: a cold operator can drive the window from the runbook alone;
  docs review clean.

## W7 — Open the window (OWNER-GATED)

- Pre-window `plan` → present `release-sha`/`operator-digest`/`CAT_SHA` →
  explicit owner go on C1 → C1..C10 with STOP points (reversible before C9,
  finish-forward after) → 60-min observation → Phase D closeout (D1 smoke;
  D2 rotation OWNER-GATED/deferred; D3 off-host S3 `mc2-jz6y0.13.6`;
  D4 Prometheus retention; D5 `run_stage_closeout.py --stage mc2-jz6y0`).
- Acceptance: reads served from self-hosted Qdrant; monitoring green; closeout
  gates pass; handoff + docs updated.

## Beads

- Parent/tracking: `mc2-uha77`.
- Children (create at pickup): `W1 executor+wiring`, `W2 real-value plumbing`,
  `W3 snapshot+baseline`, `W4 stop-point model`, `W5 rehearsal`,
  `W6 runbook`, `W7 open-window (owner-gated)`. Dependencies per the task graph.

## Explicit defers / risks

- The window stays CLOSED until W1–W6 land, are reviewed, and rehearsed.
- OQ4 is controller-owned already; OQ5/OQ6 are open (W3).
- The real-run acceptance oracle (W2) is a genuine design decision — do not
  paper over it by keeping fixture substitution on the prod path.
- #21: some recovery-epoch legs are IN-WINDOW-only under #18 rollback-abort;
  keep that surface honest, do not silently drop it.
