Runtime: Claude Code CLI, VS Code integrated terminal on WSL
Target: orchestrator session in /home/me/code/mc2, branch develop
Audience: the agent implementing Beads task mc2-ot8se

Goal: implement the Q12 read-only window pre-flight, run it for real, and drive it to a fully green
report — one probe that asserts every environmental precondition the live cutover window depends on,
so those defects are found in minutes instead of one per window attempt. Take this to completion; do
not hand a half-finished stage back.

Context: read in this order before acting — AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md,
then docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md (the contract; its "Hard
invariants" and frozen "Probe list" ARE the acceptance criteria) and
docs/superpowers/plans/2026-07-28-q12-window-preflight.md (seven tasks, each with its own RED/GREEN
cycle and commit, plus the "After the pre-flight runs" sequence). Then `bd show mc2-ot8se` and claim
it with `bd update mc2-ot8se --claim`.

Why (full version in the contract's Problem section): nine window attempts produced nine defects,
all of one class — the environment the code was verified in was more permissive than the one it
runs in. The window fails closed at the first violation, so each expensive attempt yields one
finding. This moves discovery off the attempt path.

Write zone: deploy/qdrant/q12-window-preflight.py, q12-preflight-probes.py and
q12-deployed-asset-manifest.json (all new); q12-live-cutover.sh (task 7 only);
packages/course-gen-platform/tests/unit/ops/\*\*; the contract doc (amend only in lockstep with a
probe change); .codex/handoff.md (keep it at or under 200 lines).

Authority: the owner has granted full authority for everything this task needs — do not stop to ask
permission for work inside it. That covers all local edits in the write zone, Beads updates, commits
on develop and ordinary pushes once the gates pass and a fresh fetch shows the remote is neither
ahead nor diverged; running the pre-flight against production (read-only by construction); running
`plan` against production (read-only, makes its own fresh run root, burns no run-id); reinstalling
the deployed Q12 tree from develop — back the replaced files up under
/opt/megacampus/backups/q12-assets/ first, verify byte-equality after, refuse if a controller is
running; and filing plus fixing beads for whatever the pre-flight reports, looping until it is green.

Reserved to the owner, still: opening or advancing the Q12 window itself (bead mc2-i9h3y, an
owner-present window), anything at or past C9, force-push or history rewrite, credential changes,
and deploying an application release. Those are a different task, not a permission gap in this one
— if your work reaches them, stop and report.

Constraints:

- Do not touch deploy/qdrant/q12-database-barrier.sh, deploy/qdrant/q12-command-manifest.json
  (sha aaec6fc2… must not move), or .codex/stages/\*\* other than this prompt's own directory.
- TDD: RED before GREEN for every probe; two-way mutation checks where the plan calls for them.
- Read-only structurally: every database statement inside BEGIN READ ONLY, each transaction
  asserting transaction_read_only='on' before anything else. No DDL, no writes.
- Connect through the pooled DSN, never directly to the database host — bypassing the pooler is
  exactly what hid one of the nine defects.
- No secrets in logs, reports or arguments; treat .env\*, secrets/\*\* and credential stores as
  read-blocked.
- No silent skips or caps: every frozen probe id appears in the report with a verdict, and any bound
  you introduce is stated in the report and in your summary.
- If something cannot be established read-only, do not invent a mutation to prove it. Report it as
  `unprovable` with a real evidence pointer, exactly as the contract's C5/C6 do.
- Run anything long-running on the server detached (setsid nohup): a dropped ssh once killed a plan.

Success criteria:

- All seven plan tasks complete, each with its own commit.
- Gates run and quoted with real output. From packages/course-gen-platform:
  `npx vitest run --config vitest.config.unit.ts tests/unit/ops --maxWorkers=3` (maxWorkers=3 — at
  full parallelism the docker-backed suites contend and flake), and the same command under
  `MC2_Q12_REAL_PG17=1` for the two new suites. From the repo root: `pnpm type-check`, `pnpm build`,
  `bash scripts/orchestration/run_process_verification.sh`,
  `python3 scripts/orchestration/check_stranded_commits.py`.
- The pre-flight has actually been RUN, not merely written: `--scope host` on the server, then the
  server Q12 tree reinstalled, then a fresh `plan`, then `--scope all --run-root <fresh root>`.
- Every reported `fail` is fixed under TDD and delivered, and the pre-flight re-run, until the report
  is green — and each fixed defect lands as a new or strengthened probe, so the class cannot return
  silently.
- q12-live-cutover.sh refuses to open a window without a fresh green report matching the deployed
  tree; .codex/handoff.md names the command and the green report instead of describing a manual
  check, and records the fresh run root with its expected-catalog sha for the owner's window.
- `bd close mc2-ot8se` with the delivered commit shas in the reason, then `bd dolt push`.

Output: lead with the outcome and how to verify it — the green report path, what the probe list
covers, what it deliberately cannot prove and on what evidence, what the pre-flight found and how
each finding was fixed, anything you bounded, the commands and output behind the completion claim,
and plainly anything unfinished and why. End with exactly what the owner must do to open the window.

Stop: stop and report instead of continuing when a probe seems to require changing the frozen barrier
or the frozen manifest; when a pre-flight `fail` can only be cleared by a production change outside
this task's authority; when the ops suite fails in isolation rather than only under parallelism; when
the remote is ahead or diverged at push time; or when you find a tenth instance of the
environment-substitution class — file it as a bead with the probe id in the title and report before
continuing.
