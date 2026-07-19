Target: Claude opus-4.8 orchestrator (orchestration-bridge:orchestrator-stage, complex tier)
Audience: fresh orchestrator picking up the Q12 live-window execution wiring cold

Goal: make the Q12 live cutover window executable end-to-end against production,
then (owner-gated) open it and run Phase D closeout. The R8 program proved the
live/recover journal-convergence controller against a FIXTURE executor and
deliberately left the real-execution wiring un-done; you deliver that wiring.

Success criteria:

- W1: a deployed owner-custody executor provides `execute_forward_resume` (drives
  the real `source-recovery-run.sh resume-writers-only` child under the FD9 lease)
  and is wired into `main()` for `live`/`recover`; the production pre-flight passes.
- W2: the production `run_live`/`run_recover` path substitutes REAL authorities
  for the 7 non-request placeholders (no fixture-derived snapshot/generation/
  recovery ids on the prod path); a real-run acceptance oracle is defined + tested;
  the fixture parity suite stays green.
- W3: `pg.backup` q12 mode runs against a real `pg_export_snapshot()` coordinator
  (OQ5) + real `baseline.json` (OQ6) in an isolated drill with zero residue.
- W4: an operator can STOP at a reversible checkpoint before the point of no
  return (`barrier.activate`) and only then cross C9; #18 rollback-abort preserved.
- W5: the newly-wired real path is rehearsed against a disposable stack (or the
  residual is explicitly bounded/tracked/owner-visible per found-defect #21).
- W6: a current operator runbook (superseding the 2026-07-17 procedure) lets a
  cold operator drive the window; W7 opens the window only on an explicit owner go.

Context: (read the sources below; do not copy them into sub-prompts)

- Design: docs/superpowers/specs/2026-07-19-q12-window-execution-wiring-design.md
- Plan + task graph + Beads: docs/superpowers/plans/2026-07-19-q12-window-execution-wiring.md
- Verified gap evidence: .codex/stages/mc2-jz6y0/artifacts/mc2-uha77-window-executability-verification.md
- Predecessor: docs/superpowers/specs/2026-07-17-q12-live-controller-design.md (+ plan)
- Command/placeholder contract: docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md
- Repo contract: AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md; graph GRAPH_REPORT.md
- Beads: stage mc2-jz6y0; tracking mc2-uha77; W1 mc2-yz3xe -> W2 mc2-j58wi ->
  W3 mc2-58tnx -> W4 mc2-dxcaa -> W5 mc2-v68w6 -> W6 mc2-naz8j -> W7 mc2-i9h3y.
- Branch codex/self-hosted-qdrant-platform, worktree base 8af76cfd4.

Constraints:

- Start with W0 (re-verify the §2 gap at current HEAD before building) — never
  trust this handoff over the files. Use superpowers TDD for file-changing streams
  and a targeted correctness review per stream.
- Do not change the frozen manifest (`q12-command-manifest.json` sha aaec6fc2…) —
  a manifest change is a HARD STOP. A barrier defrost needs explicit ratification
  - independent frozen-byte review + W-tuple field succession + CI guard update.
- Keep the fixture parity suite and the strict/recovery/rollback tests intact; add
  real-path tests alongside — do not weaken tests, the barrier, or rollback to go green.
- Never mutate/recover Qdrant Cloud. Owner secrets stay owner-only (0400/0600),
  path-only in code/docs; never print secret values. Workers/agents never touch
  prod; the orchestrator executes server actions.
- W7 is a real production mutation: no window action without a fresh pre-window
  `plan` and an explicit owner go on C1; the reversible-before-C9 boundary and the
  #18 rollback-abort path must be operator-visible.
- Prompt-authoring: use orchestration-bridge:prompt-authoring + `prompt-check`
  for every boundary-crossing worker/reviewer prompt.

Output: verified working wiring (W1–W3), safe STOP-point model (W4), rehearsal
evidence (W5), an operator runbook (W6), and — on owner authorization — an opened
window + Phase D closeout (W7); Beads and .codex/handoff.md kept current; each
tracked artifact validated with scripts/orchestration/validate_artifact.py.

Stop: stop and ask the owner before W7 (any production/live mutation), before any
barrier defrost, before any manifest change (hard stop), and whenever a design
decision materially changes a public contract, security boundary, or the window's
irreversibility model.
