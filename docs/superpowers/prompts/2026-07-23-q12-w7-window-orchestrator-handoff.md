# Q12 W7 Live-Window Orchestrator Handoff (2026-07-23)

Readiness package for the next orchestrator that opens the Q12 self-hosted-Qdrant live
cutover window (`mc2-i9h3y`, OWNER-GATED). Everything reversible outside the window is
done; this doc captures the current-state truth + the operational facts discovered during
the 2026-07-23 delivery so the window session starts fully grounded. Read this, then the
runbook and beads below.

## Read first (in order)

1. `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md` (SSoT + Explicit defers)
2. `docs/qdrant/q12-window-operator-runbook-v2.md` — the canonical C1..C10 window procedure
   (CLI invocation incl. `--recovery-run-id`, reversible `--stop-after` boundary, recover
   semantics, D4 oracle, #18 rollback, owner-held C9 gate)
3. `docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md` (§D2/§D3/§4)
4. Beads: `mc2-i9h3y` (this window), `mc2-1sns3` (W7a real leg), `mc2-uha77` (C0 runbook/OQ)

## Single source of truth

- **`develop` @ `62d8c2bd2`** is the SSoT, published to `origin/develop` (ahead 0 / behind 0).
  It is the verified superset of every Q12 line. Deliver via `/push-dev` (direct push to
  `develop`/`master` is contract-forbidden).
- Some environment/session metadata mislabels the working branch as
  `codex/self-hosted-qdrant-platform-plan` — **ignore it; that branch is STALE (~850 behind,
  no controller).** The working branch is `develop` (checked out in worktree
  `.worktrees/self-hosted-qdrant-platform`).
- Frozen command manifest sha256 = `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841`
  (`deploy/qdrant/q12-command-manifest.json`) — MUST NOT change. HARD STOP if it does.

## Done (2026-07-23, reversible/non-window work)

- **P2 deploy**: controller `aafbb9a1` (inc1-4 threading) installed at
  `/opt/megacampus/deploy/qdrant/q12-lifecycle-core.py` on `megacampus-prod` (rollback backup
  `.bak-0c9d23cc-20260723` retained). NOTE: the **real-read build is newer** (`develop`
  `55d999b15`+), so a controller re-deploy is required at window time (see below).
- **P1 value-machinery rehearsal**: W5 runner ran GREEN in-situ on the server (real
  `pg_export_snapshot`, tsx baseline, staged authority 0400, D5J recover determinism, D4
  oracle) against a disposable PG17.10 — prod Qdrant/source untouched.
- **W7a real-leg CODE SEAM** (3 TDD commits): `read_source_forward_acceptance` reads the
  on-disk authority; `computeSourceForwardAcceptance` emit-entrypoint; `emit-source-forward-acceptance.ts`
  CLI. 32/32 affected unit tests green, type-check clean, manifest untouched.

## Server operational facts (megacampus-prod — discovered this session, not in older docs)

- SSH `megacampus-prod` → user `claude-deploy`, **uid 1000** (real-controller/PG17 test gate
  is satisfied there).
- **Python: invoke `/usr/bin/python3.13` explicitly** (3.13.14). The default `python3` is
  3.12 and LACKS `os.POSIX_SPAWN_CLOSEFROM` → the controller's D6 path fails on it.
- `/opt/megacampus` is a **deployed rsync tree, NOT a git checkout**. It carries
  `packages/course-gen-platform/node_modules/.bin/tsx` + `deploy/postgres/q12-source-manifest.ts`,
  so the deployed controller (`repo_root = /opt/megacampus`) resolves tsx/baseline in place.
- **Qdrant topology**: dev target `megacampus-qdrant-dev` on `127.0.0.1:6333` (isolated write
  for source.forward/reindex rehearsal) vs prod `megacampus-qdrant` on `127.0.0.1:6335`
  (**do not mutate**). Redis on `127.0.0.1:6379`.
- Secrets (owner-only): `/opt/megacampus/secrets/supabase_db_url` (source DSN),
  `/opt/megacampus/secrets/qdrant_api_key`, `prod-ca-2021.crt`.
- Backups: daily timer publishes a fresh generation; pointer
  `/opt/megacampus/backups/supabase/latest.json` (the `<immutable-generation>` authority the
  controller's `read_pg_backup_generation` reads — this seam is fully real).

## Deploy + rehearsal mechanics (verified this session)

- Controller file is mode `0444` (hardened immutable). To re-deploy: `scp` to `~` on the
  server, then `chmod u+w <target> && cp ~/new <target> && chmod 0444 <target>`, verify
  sha256, `python3.13 -m py_compile`. Do NOT touch the manifest (already `aaec6fc2`). No
  service restart needed (the controller is a dormant on-demand tool).
- W5 rehearsal in-situ: place the runner under
  `/opt/megacampus/packages/course-gen-platform/tests/unit/ops/fixtures/` so its `parents[6]`
  resolves to `/opt/megacampus` (imports the deployed controller + finds tsx), run with
  `MC2_Q12_PLAN_DOCKER=/usr/bin/docker /usr/bin/python3.13 <runner>`; clean up the placed file.
- Local unit tests bypass the Qdrant global-setup via `--config vitest.config.unit.ts`
  (needs dummy `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` present). Git pre-commit `eslint --fix`
  needs `NODE_OPTIONS=--max-old-space-size=8192` (it OOMs at the 4 GB default).

## Remaining W7 window work (bounded, owner-gated)

1. **Re-deploy** the real-read controller build (`develop` HEAD) to `megacampus-prod` before
   the window (mechanics above).
2. **Shell wiring**: invoke the emit CLI from the deployed hardened
   `source-recovery-run.sh --operation forward` so it writes
   `<run_root>/source-forward-acceptance.json` (the authority `read_source_forward_acceptance`
   consumes). Deferred deliberately — this deployed-script change is only validated in-window;
   do not land it untested. Emit CLI + args: `emit-source-forward-acceptance.ts`
   (`--manifest --journal --recovery-run-id --accepted-coverage-run --output`).
3. **Full forward-window rehearsal** with real values — window-grade: needs a real reviewed
   recovery manifest.json + journal (produced by the real source.forward recovery) + the real
   Supabase accepted-coverage ledgers. Target: shared source READ-ONLY + dev Qdrant `:6333`
   isolated write. This IS the W7 source.forward window operation, not a light DEV run.
4. **C1..C10 + Phase D** per the runbook v2.

## Invariant gate — C9 (HARD)

C9 (the irreversible cutover / alias flip) is **held for explicit owner "go"** and must not be
executed on standing authorization. Reversible `--stop-after` boundaries before C9 are fine;
crossing C9 requires a fresh, explicit owner instruction in the current context. If any hard
gate fails (manifest drift, backup/restore/coverage mismatch, ownership conflict, secrets
unavailable), stop and report rather than partially activate.

## Verification gates

`pnpm type-check`; the affected unit suites via `vitest.config.unit.ts`; frozen manifest
sha re-checked after every change; `scripts/orchestration/run_stage_closeout.py --stage <id>`
at stage close. Record `docs-reviewed` and `graph-reviewed` at closeout.

## Significant-finding capture

Record any decision-affecting fact/risk/deferred issue on the relevant bead (`mc2-i9h3y` /
`mc2-1sns3`) and in `.codex/handoff.md` — short: finding, evidence, implication, confidence,
next action. Do not lose window-grade discoveries between sessions.
