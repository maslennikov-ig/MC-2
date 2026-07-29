# Orchestrator Handoff

Updated: 2026-07-29 (attempts #12 and #13; C1 and C2 now PASS, blocker moved to C3 `mc2-1cxna`)

## Single Source of Truth (2026-07-21 — owner-directed consolidation)

- **`develop` is the single source of truth** for all Q12 work; a 2026-07-21 containment audit
  proved it is the superset of every Q12 line (`codex/self-hosted-qdrant-platform`,
  `codex/q12-plan-builder`, `codex/q12-w-writer-barrier`, the W7a increments and the
  orchestration-infra commits are all in it). Keep those branches for history only.
- **Stale branches RETIRED (2026-07-27 audit).** The primary worktree sits on `develop`; new Q12
  work branches from it and is delivered via `/push-dev`. Video pipeline parked `mc2-hqfc3`.
- Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion.

## Product Truth

- Qdrant Cloud data was test-only and is lost. Do not recover or mutate it; rebuild the derived index from authoritative sources.
- Target remains private self-hosted Qdrant `1.18.2`, native multilingual BM25/IDF, server RRF/Formula priority, strict indexes, aliases, source reindex, Prometheus/Grafana/alerts, and secure loopback Web UI. Development staging uses persistent local-volume snapshots; off-host S3 is the production gate `mc2-jz6y0.13.6`.
- Documents are optional but important advisory evidence. A course without documents remains fully supported.
- Every uploaded document must receive a durable `assessed`, `degraded`, or `failed` coverage outcome; none may disappear through context truncation.
- Documents supplement the baseline structure. They may add facts, terminology, constraints, examples, and source-backed topics but cannot silently replace baseline curriculum requirements.
- Material document conflicts use a distinct required-question block. Manual mode pauses at the existing Phase 0.5 boundary. Automatic mode selects the recommendation and appends `resolved_by: system` / `answer_source: system` with rationale.

## Read First

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/project-index.md`,
`graphify-out/GRAPH_REPORT.md`. Design/plan pairs for the live line, under
`docs/superpowers/{specs,plans}/`: `2026-07-10-self-hosted-qdrant-platform`,
`2026-07-11-advisory-document-evidence-rag`, `2026-07-13-q12-live-cutover-corrections`,
`2026-07-13-q12-recoverable-lifecycle-addendum`, `2026-07-28-q12-window-preflight`.

## Accepted and Open Work

Accepted-and-integrated history for Q1-Q12 moved on 2026-07-25 to
`.codex/stages/mc2-jz6y0/summary.md` § "Accepted and open work history". Current open work is
`mc2-i9h3y` (owner-present window), BLOCKED by `mc2-1cxna`; tracked residuals `mc2-uha77`,
`mc2-8m90f`, `mc2-2vtmk`, `mc2-9vbzp`, `mc2-6l2yz`, `mc2-o0g75`, `mc2-c2p8z`, `mc2-n6szm`,
`mc2-qd12b`, `mc2-e21lo`, `mc2-zls0f`, `mc2-dizgy`, `mc2-0ie27`, plus `mc2-ivjyb`; see § "Explicit defers".

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: reopen the window once `mc2-1cxna` (P0) can NAME its failure. C1 and C2 both
PASS now: attempt #13 (2026-07-29 07:58Z) ran clean through the writer quiesce for the first time —
16 journal rows, the ten writers inventoried, stopped and manifested, the closed-inbound probe
satisfied by the real nginx — and died at C3 with `pg_dumpall before snapshot failed with status 1`
and nothing else, because `backup-supabase.sh` discarded the stderr it had already captured. That
discard is FIXED (`fail_command`, five call sites); the same command run read-only afterwards exits
0 with empty stderr on the restored database, so the cause lives in the guarded-window state — the
barrier's `ALTER DATABASE postgres SET default_transaction_read_only=on`, the pooler after C2
terminated backends, or a pooler connection limit. Reopen, read the new diagnostics, fix, and hold
at `--stop-after deploy.prepare` for the owner at C9. Three C2 defects are CLOSED and covered by
suites that drive the REAL child from the REAL controller: `mc2-awi6q` (the intent-row carry rule
plus two checkpoint files the controller never published) and `mc2-1kcbv` (writer selection swept
whole compose projects, so production's seven platform containers made it 17 instead of 10). Full
brief: `docs/superpowers/prompts/2026-07-28-q12-window-completion-orchestrator.md`.

`mc2-lzft4`, `mc2-1sns3`, `mc2-ot8se`, `mc2-38ivn`, `mc2-awi6q` and `mc2-1kcbv` are all CLOSED;
detail for each in the stage summary.

RUN ROOTS `6544c7dd-…` (#10), `8915724a-…` (#11), `d6dcb2b7-…` (#12) and `07810dcf-…` (#13) are
BURNT; `74000355-…` was abandoned before any journal row (D1 caught the drift below). A reopen needs
a fresh `plan` and a fresh run-id, and `--expected-catalog-sha256` is always the `sha256sum` of THAT
root's OWN `expected-post-migration-catalog.json` (barrier `:302`), never a value quoted for a prior
root. Everything else in the argv is settled below.

THE PLAN IS PERISHABLE (`mc2-0ie27`, found 2026-07-29). Supabase Realtime rotates daily
`realtime.messages_*` partitions on its own service timer — no pg_cron entry, so C2 stays green —
and every create/drop moves the structural catalog hash the barrier re-measures at C1. A plan
captured at 06:31Z was already stale by 07:00Z (`93ca595a…` -> `1a0ac0f0…`). D1 is the detector and
it works: it refused before the window opened, with zero mutation. Keep plan -> open to minutes.

PRODUCTION IS CLEAN after attempt #13. Attempt #13 is the first that actually STOPPED writers, so
production was really down 07:59Z-08:03Z. Recovery order that worked: (1) the barrier's OWN rendered
`$restore$` under that run's capability, then (2) every writer restored from THAT RUN'S OWN
`writer-quiesce-<run-id>.json` — `docker update --restart` back to each recorded prior policy
(`unless-stopped`), then `docker start` where `prior_running` was true. Verified: 17 containers up
and healthy, both public hosts 200, database-scope pre-flight EXIT=0 (C4 zero `q12_guard` residue,
C2 8 cron jobs active, C3 empty, D1 agrees, A/B/E pass). Full account in the stage summary.

The deployed Q12 tree is REINSTALLED from `develop` on every code delivery (replaced files kept
under `/opt/megacampus/backups/q12-assets/<utc>/`). Do NOT invoke `q12-live-cutover.sh` for `live`:
it execs `/usr/bin/python3`, 3.12 here, while the runbook requires 3.13+ (`mc2-zls0f`). Use
`/usr/bin/python3.13 … live …` per runbook §2 and run the gate by hand immediately before.

WINDOW STATE. Opened THIRTEEN times (2026-07-27/29); #1-#8 failed closed with ZERO mutation; #9-#12
installed the guard and were restored by hand; #13 also stopped the writers and was restored the same
way plus the writer replay above. The rendered restore block is byte-identical every time
(`2f11b8ed…`). Every attempt BURNS its run-id. C1 and C2 now PASS. Fifteen defects found, fourteen
fixed and most are now a PROBE (`mc2-34eua`→A2/A4, `mc2-2rzf6`→D1, `mc2-6fnrt`→E2,
`mc2-ipwyc`→A3/A5/B1/B2, `mc2-38ivn`→B3, `mc2-lzft4`→H2's expected value); `mc2-awi6q` and
`mc2-1kcbv` are CLOSED with suites that drive the REAL child from the REAL controller; `mc2-1cxna`
(C3) and `mc2-0ie27` (plan perishability) are OPEN. THE PATTERN behind almost all of them: the
checked environment substituted for the consuming one — a probe carried it in `mc2-lzft4`, a test
fixture in `mc2-awi6q` and `mc2-1kcbv`. Model the constraint, never the convenience.

BEFORE THE NEXT ATTEMPT — one command on the server immediately before the window:
`/usr/bin/python3 /opt/megacampus/deploy/qdrant/q12-window-preflight.py --scope all --run-root /opt/megacampus/backups/q12/<fresh-run-id>`.
Read-only by construction, through the pooled DSN, no lock, no run-id burned. Exits 0 only when all
25 frozen probes are `pass` or `unprovable` with named evidence; `--assert-fresh-report` refuses
`live` without a green report under 30 min old matching the deployed tree. It has gone fully green
before every attempt since #11 (22 pass; C5/C6/H4 unprovable with evidence) and the window still
failed past it three times: a probe covers nothing outside its reach. Contract: `docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md`.

Outside what the probe can do: run the controller DETACHED (`setsid nohup` — a dropped ssh once
killed a plan at exit 255, and after C2 that would strand stopped writers), and note that a push
touching `deploy/**` triggers Deploy to Dev, failing H4 for 30 minutes; docs-only, `.codex/**` and
test-only pushes do not (`scripts/ci/detect_deploy_changes.sh`). Deploy to Dev never scps
`deploy/qdrant` — only the master `Deploy to Production` job does (broken per `mc2-o0g75`).

WINDOW ARGV — SETTLED 2026-07-28 from artefacts, no re-plan. `--release-sha
23dfe973f18cc6067d386b6eb683bf6906142165`: `.env.green`'s `API_IMAGE` (`…@sha256:2f713f87…`) carries
`org.opencontainers.image.revision = 23dfe973f…` on the host, its `WEB_IMAGE` (`…@sha256:ca9afb99…`)
labels `50f670b9` but `git diff 50f670b9..23dfe973f -- packages/web packages/shared-types
packages/shared-utils` is EMPTY, and the staged root's catalog authority already records it.
`mc2-sdbua`'s closure is SUPERSEDED (it ruled on the spent root `0fa297e4` and re-made the
operator/app conflation `mc2-v7547` corrected; `b5eb528e…` labels `060b4faea`, no application
source). `--operator-digest b5eb528e…`,
`--recovery-run-id a417a99c-…`, 64 zeroes for the resource/quiesce digests on a first run.
`--stop-after deploy.prepare` is the sole resumable pre-C9 head; the barrier is invoked as argv[0],
so keep it mode 0555, not 0444.

CAPABILITY — SETTLED 2026-07-28 from the barrier's code, no owner decision needed: RE-MINT per run
root. `q12-database-barrier.sh:210` binds only the PATH to the run id; `install` registers whatever
digest the session supplies (`:945-948`) and `assert_capability`/`assert_controller_binding` compare
only against that row (`:984`, `:999`) — a per-run nonce with no external counterpart.
`accepted-coverage-run` is deterministic and not secret — copied verbatim.

The dead GHCR token (`mc2-2vtmk`) does not block the window.

## Starter prompt for next orchestrator

`docs/superpowers/prompts/2026-07-28-q12-window-completion-orchestrator.md` (prompt-check pass,
oversize warning). Its §1-§5 are now DONE (`mc2-1sns3`, the release-sha ruling, the capability
question, run-root staging and two opened windows); the live task is `mc2-awi6q`, then re-stage and
reopen. Fallback: Use $orchestrator-stage from this handoff plus the stage summary.

## Verification and Delivery

- Do not weaken RU/EN relevance, strict-mode, restore, resume, coverage, or tenant-isolation tests.
- Completed local gates at the delivered HEAD (backend/shared/web/PostgreSQL/Qdrant/Compose,
  `pnpm type-check`, `pnpm build`, process verification, Graphify refresh, canonical closeout):
  recorded in `.codex/stages/mc2-jz6y0/summary.md`.
- Keep durable docs, project index, Graphify, Beads, artifacts, stage summary and this handoff
  synchronized before any Q12 continuation; push all accepted commits under the repo contract. The
  primary worktree may contain unrelated `.claude/settings.json`; do not alter or include it.

## Explicit defers

- Review P2 `mc2-af1ay` on the `.13.4.1` amendment (duplicate operator-side `DispositionSchema`,
  `CATALOG_HASH_PATTERN`): DEFERRED past the live window — no operator churn before C1..C10.
  Detail in `.codex/stages/mc2-jz6y0/summary.md`.
- Q12 staging mutation is owner-authorized but NO-GO until the approved correction streams, a truthful
  fresh validated database backup, a Supabase-compatible restore and every documented hard gate pass.
  GHCR publication and password rotation keep their separate secret/effects gates. Missing-source
  product truth is settled by the approved six failed plus eighteen retained-derived-only
  dispositions. Do not partially activate.
- D6 `.13.19` is integrated; Root `.13.13` join is the next implementation stream. D6 pinned-server
  capability gates and the fields 5/6/8/9 production re-freeze (Task C7) stay live-window scope. No
  live action outside the owner-gated window.
- Known accepted boundaries (by design, not debt): recorded in
  `.codex/stages/mc2-jz6y0/summary.md` (W prefix-integrity scope, the §5 tamper-append case,
  M's residual P2-4 libpq variables).
- Off-host S3 is not a staging blocker after the 2026-07-12 owner decision; it
  remains the explicit production readiness defer `mc2-jz6y0.13.6`.
- Prometheus retention YAML migration is the bounded nonblocking defer
  `mc2-jz6y0.25`, due before the next Prometheus pin change.
- `codex/self-hosted-qdrant-platform` is intentionally retained for Q12; all other Q11-owned
  worktrees, branches, containers, ports and temporary data are cleaned
  (`.codex/stages/mc2-jz6y0/summary.md`).
- Stop if snapshot/alert secrets are required and unavailable, source gaps would change product truth, ownership conflicts cannot be isolated, or a required gate repeatedly fails after in-scope diagnosis.
- **Q12 W7 window — DURABLE PRECONDITIONS** (superseded argv removed 2026-07-27; the live argv lives
  in § "Next recommended" only, so there is one source of truth).
  - The C5/C6 accepted-coverage hard gate is RESOLVED (`mc2-tpdog`, `e7fef75d4`; spec §"Amendment
    2026-07-25" in `…specs/2026-07-12-q12-source-recovery-design.md`): acceptance derives from the
    recovered `file_catalog` rows against the sha-bound reviewed manifest, and the frozen manifest's
    `<accepted-coverage-run>` slot carries `catalog:<recovery-run-id>`.
  - EXECUTION IDENTITY (`mc2-1by33`): controller and writer operations run as uid 1000 (root cannot
    complete C2); only `source.forward` needs root, through the root-owned argv-whitelist launcher
    `deploy/qdrant/q12-privileged-launch.sh` (0555 root:root) via the account's existing sudo. It
    preflights the launcher + `sudo -n` before any journal row and publishes `writer-recovery-
state`, which C9 requires. Residual `mc2-9vbzp`; no full `live` rehearsal is possible outside
    the window.
  - `mc2-i9h3y` stays owner-gated: C2 quiesces production writers (schedule the slot with the owner)
    and C9 is pressed by the owner in person, with runbook §8 requiring a fresh green plan plus
    accepted C1..C8 at that moment.
  - Post-window defers: `mc2-8m90f`, `mc2-n6szm`.
- Capacity-triggered HA, quantization, on-disk hot indexes, custom sharding, and JWT RBAC remain out of scope.

docs-reviewed: updated — the D6 integration, ratified 11/11 tuple, review
lineage, and the next-step Root `.13.13` join now match Beads, the stage
summary, and the D6 artifact (independent docs review PASS after fixes).
project-index: reviewed-no-change — this slice changes stage evidence inside
existing entrypoints, not stable navigation.
graph-reviewed: updated — Graphify local code graph refreshed at the delivered
integration HEAD with `graphify update .` and
`graphify cluster-only . --no-viz --no-label`; no external model/API mode or
Git hook was used.
