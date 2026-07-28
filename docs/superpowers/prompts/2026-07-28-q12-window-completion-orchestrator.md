# Q12 window completion — orchestrator prompt (2026-07-28)

Runtime: Claude Code CLI, VS Code terminal, WSL. Target: `/home/me/code/mc2`, branch `develop`,
HEAD `58356e307`. Server alias `megacampus-prod`. Use `orchestration-bridge:orchestrator-stage`.

Goal: take `mc2-i9h3y` (Q12 live window C1..C10 + Phase D closeout) from blocked to held open at the
reversible `--stop-after deploy.prepare` boundary, with C9 ready for the owner. Everything before C9
is yours. Do not hand a half-finished stage back.

Context: `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`; then
`docs/qdrant/q12-window-operator-runbook-v2.md` — the CURRENT runbook, which supersedes
`.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-c0-window-operator-procedure.md` (2026-07-17), whose
"Open questions OQ1–OQ6" are historical; do not treat them as live without re-deriving them against
the current tree. Then `.codex/stages/mc2-jz6y0/artifacts/mc2-uha77-window-executability-verification.md`,
`bd show mc2-i9h3y` with its full DEPENDS ON graph, and `bd show mc2-1sns3`. Chronology lives in
`.codex/stages/mc2-jz6y0/summary.md`; the pre-flight contract in
`docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md`. Claim with
`bd update mc2-1sns3 --claim` before touching code.

Why: nine window attempts produced nine defects, all of one class — the environment the code was
verified in was more permissive than the one it runs in. A tenth (`mc2-38ivn`) was caught by the
read-only pre-flight in minutes instead of by an attempt. Every attempt burns its run-id and costs a
re-stage, so the rest must be settled BEFORE anything opens.

Five things are left.

1. `mc2-1sns3` is the only open dependency of `mc2-i9h3y`, and it is code. `drive_forward_sequence`
   (`q12-lifecycle-core.py:4241`) never invokes the resolver callbacks `on_pg_backup_done` (`:777`)
   and `on_source_forward_accepted` (`:781`) — only their definitions exist, so a production
   `values=StagedValueResolver` run fails closed at `pg.restore` on an unresolved value. Increment 1
   (the `OwnerCustodyExecutor.execute_ordinary` seam) landed in `989dc473f`; increments 2–4 (thread
   the callbacks through the drive loop, unit-testable HERE with FAKE authorities per the 2026-07-20
   codesign §D2/§D3/§4) and increment 5 (the `MC2_Q12_REAL_PG17` gated real leg) are open. Plan:
   `docs/superpowers/plans/2026-07-21-q12-w7a-production-ordinary-execution.md`.

2. The window identity is contradictory and must be settled from evidence. `.codex/handoff.md` says
   `--release-sha 23dfe973f18cc6067d386b6eb683bf6906142165`. The closure of `mc2-sdbua` says the
   authority is `060b4faeac2e5ef6116aa26cda8e07e43e1343a6`, because the operator image
   `.env.production` pins (`QDRANT_OPERATOR_IMAGE_SHA256=b5eb528e…`, verified on the host
   2026-07-28) was built from it. The staged run root
   `/opt/megacampus/backups/q12/6544c7dd-e680-462d-bf8f-5db8fc01c9b6` carries an authority whose
   `release_sha` is `23dfe973f…` (verified 2026-07-28). Both cannot hold. Settle it from artefacts —
   image build provenance, `.env.green`/`.env.production` pins, the catalog authority bytes — and
   record the ruling in `mc2-i9h3y` and `.codex/handoff.md`. If it moves `--release-sha`, the run
   root must be re-planned, which moves `--expected-catalog-sha256`.

3. The `secrets/db-capability` carry-over question recorded on `mc2-i9h3y`: may the existing unspent
   capability move byte-identically into a new run root, or must it be re-minted per `mc2-gyde8`?
   The barrier binds only its PATH to the run id and records its sha256. Answer from the barrier's
   code and the minting contract first; re-minting is the conservative branch and is cheap, so
   prefer it when the evidence is ambiguous. Ask the owner only if the code genuinely leaves it open.

4. Stage the run root: `0700` directory, `accepted-coverage-run` at `0400` carrying
   `catalog:<--recovery-run-id>`, `secrets/db-capability` at `0400`. `--recovery-run-id` is
   `a417a99c-db3a-45c8-9d32-561d8d068a3e` (resolved 2026-07-24). `--expected-catalog-sha256` is the
   sha256 of THAT root's OWN catalog file (barrier `:302`), never a value quoted for a prior root.

5. Open it. Run `/usr/bin/python3 /opt/megacampus/deploy/qdrant/q12-window-preflight.py --scope all
--run-root <root>` IMMEDIATELY before; 25 frozen probes, exit 0 only when each is `pass` or
   `unprovable` WITH a named evidence pointer. `q12-live-cutover.sh` refuses `live`/`supervisor`
   without a green report under 30 minutes old whose `asset_manifest_sha256` matches the deployed
   tree — a gate, not a reminder. A push to `develop` triggers Deploy to Dev and fails probe H4 for
   30 minutes: land deliveries BEFORE the window. Run the controller DETACHED (`setsid nohup`) to
   `--stop-after deploy.prepare`, the sole resumable pre-C9 head.

Write zone: `packages/course-gen-platform/**`, `deploy/qdrant/q12-lifecycle-core.py`, the W7a plan,
`.codex/handoff.md` (≤200 lines), `.codex/stages/mc2-jz6y0/summary.md`, Beads. Do NOT move
`deploy/qdrant/q12-command-manifest.json` (`aaec6fc2…`) or `deploy/qdrant/q12-database-barrier.sh`;
the barrier is a W-tuple amendment round (tuple field 4 is `f98a2ce4…`) and the CI guard fails you
if one moves without the other.

Authority, granted by the owner on 2026-07-28 ("он может сам всё закончить без моей помощи, все
разрешения даю"): all local edits in the write zone; Beads; commits on `develop` and ordinary pushes
once gates pass and a fresh fetch shows the remote neither ahead nor diverged; running the read-only
pre-flight and `plan` against production; reinstalling the deployed Q12 tree from `develop` (back up
under `/opt/megacampus/backups/q12-assets/<utc>/` first, prove byte-equality afterwards with probe
H2, refuse if a controller is running); staging the run root, copying the capability by PATH; and
opening the window to `--stop-after deploy.prepare`.

Reserved to the owner in person, not a permission gap to argue around: C9 and anything past it — the
runbook holds that gate because it is the point of no return. Also force-push, history rewrite,
credential rotation, and deploying an application release.

Constraints: TDD, RED before GREEN for behaviour; mechanical work takes the `no-new-test` lane with
focused proof and a recorded reason. Read-only means read-only — every pre-flight statement inside
`BEGIN READ ONLY`, asserting `transaction_read_only='on'` first; if something cannot be established
read-only, report it `unprovable` with a real evidence pointer instead of inventing a mutation.
Connect through the pooled DSN, never the database host directly — reaching around the pooler hid
two of the ten defects. No secrets in logs, reports, prompts or arguments; reference credentials by
PATH, and treat `.env*`, `secrets/**` and credential stores as value-blocked. Never retype a
truncated digest: take every 64-hex value from command output, never from prose. Run anything
long-running on the server detached; a dropped ssh once killed a plan at exit 255, and after C2 that
would strand stopped writers. Every attempt BURNS its run-id — do not open anything to see what
happens. Gates: from `packages/course-gen-platform`, `npx vitest run --config vitest.config.unit.ts
tests/unit/ops --maxWorkers=3` plus the gated suites under `MC2_Q12_REAL_PG17=1`; from the repo root
`pnpm type-check`, `pnpm build`, `bash scripts/orchestration/run_process_verification.sh`,
`python3 scripts/orchestration/check_stranded_commits.py`.

Success: `mc2-1sns3` closed with delivered commit shas in the reason; the identity contradiction
settled and recorded; the capability question answered; the run root staged; a fresh green pre-flight
whose gate accepts it; the window held at `deploy.prepare` with journal and receipts consistent;
`.codex/handoff.md` naming the run root, the settled argv and the green report; Beads updated,
`bd dolt push` run, everything pushed to `origin/develop`.

Output: lead with the outcome and how to verify it, then what changed and why, the commands and real
output behind the completion claim, anything bounded or unprovable and on what evidence, and plainly
anything unfinished. End with exactly what the owner must do at C9 — the command, its argv, and what
a good result looks like.

Stop rules: stop and report when the window reaches C9; when a defect can only be cleared by moving
the frozen manifest or the frozen barrier; when a pre-flight `fail` needs a production change
outside this authority; when the ops suite fails in ISOLATION rather than only under parallelism;
when the remote is ahead or diverged at push time; when the §2 identity ruling cannot be settled from
evidence; or when you find an eleventh instance of the environment-substitution class — file it as a
bead with the probe id in the title and report before continuing.
