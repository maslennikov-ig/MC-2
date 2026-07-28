# Orchestrator Handoff

Updated: 2026-07-28 (attempt #10 opened, failed closed at C2, production restored; blocker `mc2-lzft4`)

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
`mc2-i9h3y` (owner-present window), BLOCKED by `mc2-lzft4`; tracked residuals `mc2-uha77`,
`mc2-8m90f`, `mc2-2vtmk`, `mc2-9vbzp`, `mc2-6l2yz`, `mc2-o0g75`, `mc2-c2p8z`, `mc2-n6szm`,
`mc2-qd12b`, plus this round's `mc2-e21lo`, `mc2-zls0f` and `mc2-dizgy`; see § "Explicit defers".

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: fix `mc2-lzft4` (P0) — it is the ONLY thing between here and a reopen. Attempt
#10 opened on 2026-07-28, reached C2 and failed closed there; production was guarded for ~9 minutes
and is fully restored (evidence below). Everything else before C9 is settled: `mc2-1sns3` CLOSED,
the `--release-sha` identity ruled, the capability question answered, the argv fixed. Full brief:
`docs/superpowers/prompts/2026-07-28-q12-window-completion-orchestrator.md`.

`mc2-lzft4` — the tracked asset manifest declares `deploy/qdrant/q12-writer-resume.py` mode `0444`;
`source-recovery-run.sh:246-248` demands EXACTLY `root:root 0644` (the `mc2-jhqpw` hardening, which
had regressed silently). Probe H2 asserts mode against that manifest, so it PASSED on a host the
wrapper rejects — the probe built to catch this carried the substitution itself. C2's child refused
at its first check, so NO writer was quiesced. The host file is `0644` again, so H2 now reports the
truth (`mode 0444 -> 0644`) and the gate blocks a reopen. FIX, outside the last stage's write zone:
declare `0644` in `deploy/qdrant/q12-deployed-asset-manifest.json`; stop `q12-window-preflight.py
--emit-asset-manifest` deriving that mode from the git executable bit for root-owned assets, pinning
manifest expectations against the wrapper's own required modes instead; re-emit, redeploy, prove H2
green; then stage a FRESH run root with a FRESH run-id.

`mc2-1sns3` CLOSED 2026-07-28 (`1725a2df3`): `run_recover` never passed the staged-callback hook
into the driver it shares with `run_live`, so the two recover heads that re-drive a staged step
failed closed at the next command — fixed by moving the threading INTO the driver. Increment 5's
real leg is EXECUTED BY the window itself (W7a plan). `mc2-ot8se` and `mc2-38ivn` are DONE. Detail
for all of these in the stage summary.

RUN ROOT `6544c7dd-…` is BURNT (attempt #10: 11 durable rows, head
`writers.quiesce/capability_claimed`, not one of the seven recover heads). A reopen needs a fresh
`plan` run and a fresh run-id; `--expected-catalog-sha256` is always the sha256 of THAT root's OWN
`expected-post-migration-catalog.json` (barrier `:302`), never a value quoted for a prior root.
Everything else in the argv is settled below.

PRODUCTION IS CLEAN after attempt #10, restored with the barrier's OWN `$restore$`
(`drop_schema=true`, rendered from the DEPLOYED barrier, run under that run's capability). Verified
read-only afterwards: C4 zero `q12_guard` residue, C2 8 cron jobs active, C3 queue empty,
A5/B4/D1/E1/E2 pass, `pg_db_role_setting` back to exactly `['app.settings.jwt_exp=3600']`, every
production container up and healthy, `cutover.lock` free. Full account, including why the barrier's
own `rollback` command refuses here and the `mc2-e21lo` terminate-sweep finding, in the stage
summary.

The deployed Q12 tree is REINSTALLED from `develop` on every code delivery (replaced files kept
under `/opt/megacampus/backups/q12-assets/<utc>/`). Do NOT invoke `q12-live-cutover.sh` for `live`:
it execs `/usr/bin/python3`, 3.12 here, while the runbook requires 3.13+ (`mc2-zls0f`). Use
`/usr/bin/python3.13 deploy/qdrant/q12-lifecycle-core.py live …` per runbook §2 and run the gate by
hand immediately before.

WINDOW STATE. Opened TEN times (2026-07-27/28); #1-#8 failed closed with ZERO mutation, #9 and #10
installed the guard, aborted, and were restored by hand with the barrier's own `$restore$`.
Production re-verified clean after each. Every attempt BURNS its run-id. Ten of the eleven defects
are fixed and each is a PROBE (`mc2-34eua`→A2/A4, `mc2-2rzf6`→D1, `mc2-6fnrt`→E2,
`mc2-ipwyc`→A3/A5/B1/B2, `mc2-38ivn`→B3); the eleventh is `mc2-lzft4`, OPEN. THE PATTERN behind all
of them: the checked environment substituted for the consuming one — and in `mc2-lzft4` the PROBE
itself carried the substitution. Model the constraint, never the convenience.

BEFORE THE NEXT ATTEMPT — one command, not a checklist, on the server immediately before the window:
`/usr/bin/python3 /opt/megacampus/deploy/qdrant/q12-window-preflight.py --scope all --run-root /opt/megacampus/backups/q12/<fresh-run-id>`.
Read-only by construction, through the pooled DSN, no lock, no run-id burned. Exits 0 only when all
25 frozen probes are `pass` or `unprovable` with named evidence; `--assert-fresh-report` is the gate
that refuses `live` without a green report under 30 min old matching the deployed tree. `mc2-lzft4`
is the standing warning: a probe is only as good as the value it asserts against. Contract:
`docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md`.

Outside what the probe can do: run the controller DETACHED (`setsid nohup` — a dropped ssh once
killed a plan at exit 255, and after C2 that would strand stopped writers), and note that a push
touching `deploy/**` triggers Deploy to Dev, failing H4 for 30 minutes; docs-only and `.codex/**`
pushes do not (`scripts/ci/detect_deploy_changes.sh`).

WINDOW ARGV — SETTLED 2026-07-28 from artefacts, no re-plan. `--release-sha
23dfe973f18cc6067d386b6eb683bf6906142165`: `.env.green`'s `API_IMAGE` (`…@sha256:2f713f87…`) carries
`org.opencontainers.image.revision = 23dfe973f…` on the host, its `WEB_IMAGE` (`…@sha256:ca9afb99…`)
labels `50f670b9` but `git diff 50f670b9..23dfe973f -- packages/web packages/shared-types
packages/shared-utils` is EMPTY, and the staged root's catalog authority already records it.
`mc2-sdbua`'s closure is SUPERSEDED: it ruled on the now-spent root `0fa297e4` and re-made the
operator/app conflation `mc2-v7547` corrected — `b5eb528e…` labels `060b4faea`, which touched no
application source. `--operator-digest b5eb528e…`,
`--recovery-run-id a417a99c-…`, 64 zeroes for the resource/quiesce digests on a first run.
`--stop-after deploy.prepare` is the sole resumable pre-C9 head; the barrier is invoked as argv[0],
so keep it mode 0555, not 0444.

CAPABILITY — SETTLED 2026-07-28 from the barrier's code, no owner decision needed: RE-MINT per run
root. `q12-database-barrier.sh:210` binds only the PATH to the run id; `install` registers whatever
digest the session supplies (`:945-948`) and `assert_capability`/`assert_controller_binding` compare
only against that row (`:984`, `:999`) — a per-run nonce with no external counterpart. Probe C4
reports zero `q12_guard` residue, so carry-over would also have worked; re-minting was chosen
because the same 65-byte value sits in ten run roots from the burned attempts, one of which (#9)
installed the guard. `accepted-coverage-run` is deterministic and not secret — copied verbatim.

The dead GHCR token (`mc2-2vtmk`) does not block the window.

## Starter prompt for next orchestrator

`docs/superpowers/prompts/2026-07-28-q12-window-completion-orchestrator.md` (prompt-check pass,
oversize warning). Its §1-§3 are now DONE (`mc2-1sns3`, the release-sha ruling, the capability
question); the live task is `mc2-lzft4`, then re-stage and reopen. Fallback: Use $orchestrator-stage
from this handoff plus the stage summary.

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
