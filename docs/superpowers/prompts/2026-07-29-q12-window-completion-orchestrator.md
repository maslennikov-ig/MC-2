# Q12 window completion — orchestrator prompt (2026-07-29)

Runtime: Claude Code CLI, VS Code terminal, WSL. Target: `/home/me/code/mc2`, branch `develop`,
HEAD `62e2df6ea`. Server alias `megacampus-prod`. Use `orchestration-bridge:orchestrator-stage`.
Stage `mc2-jz6y0`.

Goal: take `mc2-i9h3y` (Q12 live window C1..C10 + Phase D closeout) from blocked to held open at the
reversible `--stop-after deploy.prepare` boundary, with C9 ready for the owner. Everything before C9
is yours. Do not hand a half-finished stage back.

Context: `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, then the plan you are
executing — `docs/superpowers/plans/2026-07-29-q12-window-environment-preflight.md` — then
`docs/qdrant/q12-window-operator-runbook-v2.md` (the CURRENT runbook), the pre-flight contract
`docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md`, and
`.codex/stages/mc2-jz6y0/summary.md` for the account of every window attempt. `bd show mc2-i9h3y`
with its full DEPENDS ON graph, plus `bd show mc2-bh3ef`, `mc2-rjy9k`, `mc2-1cxna`, `mc2-0ie27`.
Claim with `bd update mc2-bh3ef --claim` before touching code.

Why: the window has been opened SIXTEEN times. It now clears C1, C2 and C3 in production and stops
at C4. On 2026-07-29 alone it produced five defects and **not one was logic** — every one was the
environment the code runs in, and three were the same cause in three different consumers. Each
discovery cost ~40 minutes of waiting (CI, the dev deploy, the 30-minute H4 quiet window) and 4-16
minutes of REAL production downtime, because C2 stops the ten writers and there is no resume from
mid-group. The owner has asked to stop paying that price. **Your first job is therefore not to
reopen the window.**

## What to do, in order

### 1. `mc2-bh3ef` (P0) — probe the frozen-env surface before the window

Not one of the five defects found on 2026-07-29 was logic. Three were the same cause in three
different consumers: the frozen `q12-command-manifest.json` pins `HOME=/root` for every command
while the commands run as the deploy operator, `/root` is `0700 root-owned`, and any child resolving
something under `$HOME` fails with `EACCES` — which is not "absent", so nothing falls back. libpq
died on its default client certificate; the docker CLI never found its buildx plugin. A fourth was
`/proc/self/fd/N` argv paths that do not survive a child's spawn chain.

Add a probe group to `deploy/qdrant/q12-window-preflight.py` covering **every** command in the frozen
manifest — not only the ones we have run — under its exact frozen env and as the user that will run
it: `$HOME` stat-able; docker CLI config + plugin discovery; a libpq connection through the pooled
DSN; argv paths that resolve in a child. Same contract as the existing 25: `pass`, `fail`, or
`unprovable` **with a named evidence pointer**, folded into `--scope all`.

**Every probe must be shown RED against the state that produced the 2026-07-29 defects** —
reinstate the old `HOME` or the old fd path in a scratch copy and prove the probe refuses. A probe
that cannot be shown red is not evidence; that is exactly how `mc2-lzft4` slipped through, where the
probe carried the substitution it existed to catch. Extend
`docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md`.

### 2. `mc2-rjy9k` (P1) — dry-run the children against the plan's isolate

`plan` already restores the source into a disposable PostgreSQL isolate in docker (`_drill_flow` →
`_restore_via_drill`, persist seam). Reuse it as a target and drive the real data-movement children
against it — `pg.restore`'s drill, `source.forward`, `reindex.*`, `deploy.prepare` — with no writer
stopped, no guard installed and no run-id burnt. Follow the repo idiom
(`q12-w5-production-rehearsal-runner.py`, whose docstring already bounds this as residual "#21").

State what the isolate cannot carry rather than papering over it: the barrier's dual-bind,
`quiesce_client_backends`, and `probe_closed_inbound`'s real nginx 502/503 (which needs the api/web
writers down) stay in-window residuals.

### 3. Then, and only then, open the window once

Land every delivery first — a push touching `deploy/**` triggers Deploy to Dev and fails probe H4
for 30 minutes (`mc2-urw5d`). Reinstall the deployed Q12 tree from `develop`, prove H2. Then, in one
sequence and with minutes between the steps, because the plan is perishable (`mc2-0ie27`): fresh
`plan` → stage the run root → the 25-probe pre-flight with `EXIT=0` → open the controller
**detached** (`setsid nohup`) to `--stop-after deploy.prepare`. Argv is settled in `.codex/handoff.md`
§ "Window argv"; `--expected-catalog-sha256` is always the `sha256sum` of THAT root's own
`expected-post-migration-catalog.json`, never a value quoted for a prior root.

`mc2-1cxna` is open only because C4's fix is deployed but not yet proven in a window. If the window
clears C4, close it with the evidence.

## Authority

Granted (owner, 2026-07-28/29): all local edits, including `deploy/qdrant/q12-writer-resume.py`,
`deploy/qdrant/q12-lifecycle-core.py`, `deploy/postgres/**` and
`packages/course-gen-platform/**`; Beads; commits on `develop` and ordinary pushes once gates pass
and a fresh fetch shows the remote neither ahead nor diverged; running the read-only pre-flight and
`plan` against production; reinstalling the deployed Q12 tree from `develop` (back up the replaced
files under `/opt/megacampus/backups/q12-assets/` first, prove byte-equality with probe H2 after,
refuse if a controller is running); staging the run root and minting the capability; and opening the
window to `--stop-after deploy.prepare`.

Reserved to the owner in person: C9 and anything past it; force-push; history rewrite; credential
rotation; deploying an application release.

## Constraints

- Read-only means read-only — every pre-flight statement inside `BEGIN READ ONLY`, asserting
  `transaction_read_only='on'` first. If something cannot be established read-only, report it
  `unprovable` with a real evidence pointer instead of inventing a mutation.
- Connect through the pooled DSN, never the database host directly.
- No secrets in logs, reports, prompts or arguments; reference credentials by PATH, and treat
  `.env*`, `secrets/**` and credential stores as value-blocked.
- Never retype a truncated digest: take every 64-hex value from command output, never from prose.
- Run anything long-running on the server detached; a dropped ssh once killed a plan at exit 255,
  and after C2 that would strand stopped writers.
- Every window attempt BURNS its run-id, and every attempt past C2 stops the ten writers — that is
  real production downtime. Do not open anything to see what happens.
- Do not move `deploy/qdrant/q12-command-manifest.json` (`aaec6fc2…`) or
  `deploy/qdrant/q12-database-barrier.sh` (W-tuple field 4, `f98a2ce4…`); the CI guard fails if one
  moves without the other.

## If an attempt fails

Recovery is routine and proven, in this order: render the barrier's OWN `$restore$` block from the
DEPLOYED barrier (`write_restore_sql true`, `drop_schema=true`; the rendered SQL is byte-identical
every time — `2f11b8ed5f8677d2f8a8c657771e833777822fc66ed8aab82ce233d6a5fb0eb0`) and run it under
that run's capability; then replay the ten writers from THAT RUN'S OWN
`writer-quiesce-<run-id>.json` — `docker update --restart` back to each recorded prior policy, then
`docker start` where `prior_running` was true. Verify after: 17 containers up, both public hosts
200, database-scope pre-flight `EXIT=0`, C4 zero `q12_guard` residue, D1 agreeing. The
post-COMMIT `pg_terminate_backend` tail fails every time — that is `mc2-e21lo`, the restore itself
has already committed.

## Stop and report

- When the window reaches C9.
- When a defect can only be cleared by moving the frozen manifest or the frozen barrier.
- When a pre-flight `fail` needs a production change outside this authority.
- When the ops suite fails in ISOLATION rather than only under parallelism.
- When the remote is ahead or diverged at push time.
- When you find a further instance of the environment-substitution class **that Phases 1–2 should
  have caught** — that means the probes are modelling the convenience again, and it is worth
  stopping over.

## Output

Output: lead with the outcome and how to verify it, then what changed and why, the commands and real output
behind the completion claim, anything bounded or unprovable and on what evidence, and plainly
anything unfinished. End with exactly what the owner must do at C9 — the command, its argv, and what
a good result looks like.
