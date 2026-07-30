# Q12 W7 Live-Window Orchestrator Handoff (2026-07-24)

**Supersedes** `2026-07-23-q12-w7-window-orchestrator-handoff.md` (its server facts and deploy
mechanics remain valid; this doc updates state after the `.13.4.1` disposition-contract
amendment and completed plan-input staging).

Use `orchestration-bridge:orchestrator-stage`. Repo `/home/me/code/mc2`, worktree
`.worktrees/self-hosted-qdrant-platform`, working branch `develop` (ignore stale
`codex/self-hosted-qdrant-platform-plan` metadata). Goal: finish Q12 pre-window staging and
run the owner-present live window (`bd mc2-i9h3y`), holding C9 for an explicit owner go.

## Launch prompt (prompt-check: pass, claude/fable-5/handoff)

```text
Use orchestration-bridge:orchestrator-stage.

Goal: continue Q12 self-hosted-Qdrant W7 window prep and run the owner-present live window (bd mc2-i9h3y), holding C9 for my explicit go.

Context: repo /home/me/code/mc2, worktree .worktrees/self-hosted-qdrant-platform on develop (== origin @ d3cb0ee43). Read first: docs/superpowers/prompts/2026-07-24-q12-w7-window-orchestrator-handoff.md (state + constraints), then .codex/handoff.md, runbook docs/qdrant/q12-window-operator-runbook-v2.md, beads mc2-4sz9t → mc2-gyde8 → mc2-i9h3y. The .13.4.1 plan-input is staged (recovery-run-id a417a99c-db3a-45c8-9d32-561d8d068a3e); the disposition contract is file_catalog-only.

Rules: frozen manifest sha aaec6fc2… must not change (hard stop; re-verify after deploys). Prod Qdrant :6335 and the shared source stay read-only; dev :6333 is the rehearsal target; /usr/bin/python3.13 only. Secrets path-only, never printed or on argv. Deliver via /push-dev. Full shas only from git rev-parse. Stop and ask me: before C9, before any prod/staging mutation outside the staged plan, on any hard-gate failure.

Output: work the beads in order (mc2-4sz9t, mc2-gyde8, then mc2-i9h3y with me present), updating beads and .codex/handoff.md as you go; final report = what was completed with fresh command evidence, the refreshed window argument values, remaining gates, and docs-reviewed/graph-reviewed markers.
```

## Read first (in order)

1. `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md` (current-state SSoT)
2. `docs/qdrant/q12-window-operator-runbook-v2.md` — canonical C1..C10 procedure
3. `docs/superpowers/prompts/2026-07-23-q12-w7-window-orchestrator-handoff.md` — server
   facts + deploy/rehearsal mechanics (all still valid)
4. `docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md`
   §"Amendment 2026-07-24" — the file_catalog-only disposition contract
5. Beads: `mc2-4sz9t` → `mc2-gyde8` → `mc2-i9h3y` (dependency order), plus `mc2-1sns3`,
   `mc2-uha77`

## Hard constraints (verbatim)

- Frozen command manifest `deploy/qdrant/q12-command-manifest.json` sha256
  `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841` must not change —
  HARD STOP if it does; re-verify after every deploy.
- Prod Qdrant `127.0.0.1:6335` and the shared source stay read-only; dev Qdrant `:6333` is
  the isolated rehearsal target. Controller runs with `/usr/bin/python3.13` only.
- Secrets are path-only (`/opt/megacampus/secrets/*`, `.env.production`): never print
  values, never place them on argv; source env inside a server-side script.
- Deliver via `/push-dev`; never push `develop`/`master` directly.
- STOP and ask the owner: before C9 (never cross it without a fresh explicit owner
  instruction in the current session), before any prod/staging mutation outside the staged
  plan, and on any hard-gate failure. Full shas only from `git rev-parse` — never retype.

## State as of 2026-07-24 (`develop` == `origin/develop` @ `d3cb0ee43`)

- **Disposition contract amended** (owner-approved): `career_playbook_sources` is legally
  empty (all 21 rows cascade-deleted with parent playbooks; pg_stat proof on the bead), so
  `.13.4.1` dispositions are file_catalog-only. The manifest schema REJECTS
  `career_playbook_source_id`/`expected_career_playbook`; the
  `career_playbook_source_applied` checkpoint is gone; planner/verify read exactly 24
  file_catalog rows; C5 no longer touches `career_playbook_sources`. Legacy 23-char
  non-sha256 catalog hashes on the two invalid-path rows are representable
  (`CATALOG_HASH_PATTERN`). Evidence: 515/515 qdrant unit tests, tsc 0.
- **`.13.4.1` staging COMPLETE**: amended 4-file closure deployed 0444 byte-identical to
  `/opt/megacampus/packages/course-gen-platform/tools/qdrant/`; plan-input staged at
  `/var/lib/megacampus-source-recovery/plan-input.json` 1001:1001 0600 with
  run_id `a417a99c-db3a-45c8-9d32-561d8d068a3e` (**this is `--recovery-run-id`**),
  canonical sha `e9d41b175e09c7a07606e087967a1de93bd8cf6532de1f8a414f5ec878529950`
  (== raw bytes, verified), release_sha `d3cb0ee432184dcb8ba939b14c4bda8d22b89209`,
  exact 42 copies / 125 rows / 6+18 dispositions. State dirs 0700 1001:1001,
  capability dir empty, manifest/journal absent (stray `q12-plan-rehearsal-*.log` files in
  `state/` are tolerated by the wrapper).

## Remaining work (in order)

1. **`mc2-4sz9t`** — redeploy develop-HEAD `q12-lifecycle-core.py` (real-read build) and
   `source-recovery-run.sh` (acceptance emit tail) via the 0444 mechanics from the 07-23
   prompt (`scp` → `chmod u+w`/`cp`/`chmod 0444`, `py_compile`, manifest sha re-check),
   then ONE fresh green pre-window `plan` run (runbook §1.1) and record the fresh
   `--expected-catalog-sha256` + `--operator-digest` on `mc2-i9h3y` (07-23 values:
   `6f3cd00f…` / `sha256:0fe4265c…` — refresh both).
2. **`mc2-gyde8`** — derive the accepted coverage `org:course:run` triple from the Supabase
   accepted-coverage ledgers (read-only, never invented), stage
   `/opt/megacampus/backups/q12/<run-id>/accepted-coverage-run` controller-owned 0400 (one
   newline-terminated lower-case UUID triple) and `<run-root>/secrets/db-capability` 0400;
   emit-CLI smoke per runbook §1.10.
3. **`mc2-i9h3y`** — the owner-present window per runbook v2: C1..C8 (reversible;
   `--stop-after deploy.prepare` is the safe hold point; C2 quiesces production writers —
   schedule with the owner), **C9 pressed personally by the owner**, C10 + Phase D closeout.
   `writers.quiesce` publishes the quiesce manifest in-window (stepping hash ZERO→QSHA per
   the C0 operator procedure artifact) — it is not pre-staged.
4. Residuals: `mc2-1sns3` defer (b); `mc2-uha77` C0/OQ verification against the deployed
   tree.

## Verification gates

`pnpm type-check`; affected suites via `--config vitest.config.unit.ts` from
`packages/course-gen-platform` cwd with dummy `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`;
`NODE_OPTIONS=--max-old-space-size=8192` for git commits (eslint OOMs otherwise); frozen
manifest sha after every change; `scripts/orchestration/run_stage_closeout.py --stage <id>`
at stage close; record `docs-reviewed` and `graph-reviewed`. Record decision-affecting
findings on the relevant bead and in `.codex/handoff.md` — do not lose window-grade
discoveries. Known failure mode: review subagents may idle without delivering a report —
after two silent checkpoints (~10 min), interrupt and verify root-owned.
