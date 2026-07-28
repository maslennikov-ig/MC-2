# Orchestrator Handoff

Updated: 2026-07-28 (window identity + capability settled; `mc2-1sns3` closed — see § "Next recommended")

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

Accepted-and-integrated history for Q1-Q12 (including every `.13.*` sub-stream,
its review verdicts and evidence hashes) moved on 2026-07-25 to
`.codex/stages/mc2-jz6y0/summary.md` § "Accepted and open work history". Current open
work is `mc2-i9h3y` (owner-present window; UNBLOCKED — `mc2-8zxlc` closed 2026-07-28),
with `mc2-1sns3`, `mc2-uha77`, `mc2-8m90f`, `mc2-2vtmk`, `mc2-9vbzp`, `mc2-6l2yz`,
`mc2-o0g75`, `mc2-c2p8z`, `mc2-n6szm` and `mc2-qd12b` as tracked residuals; see § "Explicit defers".

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: the window is READY TO OPEN and everything before C9 is settled — `mc2-1sns3` is
CLOSED, the `--release-sha` identity is ruled, the capability question is answered, and the run root
is staged. What remains is the owner-held C9. Full brief:
`docs/superpowers/prompts/2026-07-28-q12-window-completion-orchestrator.md`.

`mc2-1sns3` CLOSED 2026-07-28 (`1725a2df3`). Its last real gap: W7a increments 2-3 wired the staged
callbacks as a hook `run_live` passed into `drive_forward_sequence`, and `run_recover` shares that
driver but passed none — so the two recover heads that RE-DRIVE a staged step (head 1
`barrier.install/completed`, head 4 `barrier.prepare-recovery/completed`) failed closed at the next
command with "unresolved command placeholder", AFTER C2 has quiesced the writers. Increment 4 had
proved the threaders re-drive-SAFE by calling them directly, never that the recover path CALLS them
— the same substitution class. Fixed by moving the threading INTO the driver, so no caller can
forget it. Increment 5's real leg is EXECUTED BY the window itself (W7a plan): its inputs exist only
once the real `source.forward` has run. `mc2-ot8se` (the pre-flight) and `mc2-38ivn` (probe B3: the
Supavisor pooler REWRITES `application_name`) are DONE; W-tuple field 4 → `f98a2ce4…`, fields 5-10
byte-identical, no re-freeze. Full round in the stage summary.

RUN ROOT for the window (plan re-run 2026-07-28, read-only, production):
`/opt/megacampus/backups/q12/6544c7dd-e680-462d-bf8f-5db8fc01c9b6`

- `--expected-catalog-sha256 6be37e858e4fbd473a298cd1dfdaf49906e2c9964982801b39e1ac6104f7aaaa`
  — the sha256 of THAT root's OWN `expected-post-migration-catalog.json` (barrier `:302`), never a
  value quoted for a prior root; its `baseline_structural_sha256 a2b25324…` agrees with probe D1.
- Pre-flight reports land in the run root and EXPIRE 30 min after `captured_at`; the last green one
  read 22 `pass`, 3 `unprovable` with evidence (C5/C6/H4), 0 `fail`.

The deployed Q12 tree is REINSTALLED from `develop` on every code delivery (replaced files kept
under `/opt/megacampus/backups/q12-assets/<utc>/`); H2 proves all 26 assets byte-equal to the
tracked manifest. The sixth digest pin (`qdrant/qdrant`) now has a hold tag (`mc2-y5tgw`).

WINDOW STATE. Opened NINE times (2026-07-27/28); #1-#8 failed closed with ZERO mutation, #9
installed the guard, aborted, and was restored by hand the same day with the barrier's own
`$restore$`. Production re-verified clean afterwards. Every attempt BURNS its run-id. All ten
defects are fixed on `develop` and each is now a PROBE (`mc2-34eua`→A2/A4, `mc2-2rzf6`→D1,
`mc2-6fnrt`→E2, `mc2-ipwyc`→A3/A5/B1/B2, `mc2-38ivn`→B3); chronology in the stage summary. THE
PATTERN behind all of them, and behind the `mc2-1sns3` recover gap closed above: the checked
environment substituted for the consuming one. Model the constraint, never the convenience.

BEFORE THE NEXT ATTEMPT — one command, not a checklist. Run this on the server, immediately before
the window, and read its report:

```
/usr/bin/python3 /opt/megacampus/deploy/qdrant/q12-window-preflight.py \
  --scope all --run-root /opt/megacampus/backups/q12/<fresh-run-id>
```

Read-only by construction (every statement inside `BEGIN READ ONLY`, asserting
`transaction_read_only='on'` first), through the pooled DSN, no lock, no run-id burned — re-run it
as often as wanted. Exits 0 only when all 25 frozen probes are `pass` or `unprovable` with a named
evidence pointer, and publishes a 0400 report in the run root. `q12-live-cutover.sh` REFUSES
`live`/`supervisor` without a green report under 30 min old whose `asset_manifest_sha256` matches
the deployed tree: a gate, not a reminder. Contract:
`docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md`.

Outside what the probe can do: run the controller DETACHED (`setsid nohup` — a dropped ssh once
killed a plan at exit 255, and after C2 that would strand stopped writers), and note that a push
touching `deploy/**` triggers Deploy to Dev, which fails H4 for 30 minutes — docs-only and
`.codex/**` pushes do not (`scripts/ci/detect_deploy_changes.sh`), so land code BEFORE the window.

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

RELEASE IDENTITY SETTLED (`mc2-v7547`): `--release-sha` names the APP release `.env.green`
pins, `--operator-digest` the `qdrant-operator` image `.env.production` pins — different
artifacts, once conflated. Detail, including the `.env.green` re-pin and its backup, moved to
`.codex/stages/mc2-jz6y0/summary.md` on 2026-07-28. The dead GHCR token (`mc2-2vtmk`) does not
block the window.

## Starter prompt for next orchestrator

`docs/superpowers/prompts/2026-07-28-q12-window-completion-orchestrator.md` (prompt-check pass,
oversize warning; finish `mc2-1sns3`, settle the release-sha ruling, stage, open to
`deploy.prepare`, stop at the owner-held C9). Historical:
`docs/superpowers/prompts/2026-07-16-q12-full-completion-orchestrator.md` (prompt-check pass;
Phase A local D6/Root -> B GHCR publish -> C live cutover -> D closeout, every remote/live and
credentialed step owner-gated). Fallback: Use $orchestrator-stage from this handoff plus the stage summary.

## Verification and Delivery

- Do not weaken RU/EN relevance, strict-mode, restore, resume, coverage, or tenant-isolation tests.
- Completed local gates at the delivered HEAD (backend/shared/web/PostgreSQL/Qdrant/Compose,
  `pnpm type-check`, `pnpm build`, process verification, Graphify refresh, canonical closeout):
  recorded in `.codex/stages/mc2-jz6y0/summary.md`.
- Keep durable docs, project index, Graphify (`graphify update .`; `graphify cluster-only . --no-viz`), Beads, artifacts, stage summary, and this handoff synchronized before any Q12 continuation.
- All accepted branches/commits must be pushed under the repo contract.
- Primary worktree may contain unrelated `.claude/settings.json`; do not alter or include it.

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
