# Orchestrator Handoff

Updated: 2026-07-28 (C1 wall removed: `cron.job` unguarded, `mc2-34eua`)

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

Recommended action: finish `mc2-1sns3` — the LAST open dependency of `mc2-i9h3y`, and the reason
the window bead still reads BLOCKED — then settle the `--release-sha` contradiction below, stage the
run root and open to the reversible `--stop-after deploy.prepare` hold. Full brief:
`docs/superpowers/prompts/2026-07-28-q12-window-completion-orchestrator.md`.

`mc2-ot8se` (the pre-flight) and `mc2-38ivn` (its first catch) are DONE. Probe B3 found a TENTH
instance of the class in minutes: the Supavisor pooler REWRITES `application_name` to `'Supavisor'`,
so the terminal proof's `barrier_era_session_count LIKE 'megacampus-q12-%'` could only ever read 0 —
it passed because no barrier-era session could be RECOGNISED. Fixed in the `mc2-ipwyc` shape (all
four barrier clients state the name in-session and assert it twice); W-tuple field 4 -> `f98a2ce4…`,
fields 5-10 BYTE-IDENTICAL, no re-freeze. Measured afterwards, read-only on the live pooler:
Supavisor RESETS session state on check-in, so a badge cannot outlive its session and the C10 count
stays reachable. Full round, including the review findings it closed, in the stage summary.

RUN ROOT for the window (plan re-run 2026-07-28, read-only, production; UNCHANGED by the B3 fix,
which moved no catalog-bound digest):
`/opt/megacampus/backups/q12/6544c7dd-e680-462d-bf8f-5db8fc01c9b6`

- `--expected-catalog-sha256 6be37e858e4fbd473a298cd1dfdaf49906e2c9964982801b39e1ac6104f7aaaa`
  (the sha256 of THAT root's OWN `expected-post-migration-catalog.json`)
- `baseline_structural_sha256 a2b2532406ad3a6f3fa904d9c6caed633dd2d3c90fc6e7ea4ee7668e8b5bd75b`
  (agrees with D1, measured in the barrier's `search_path`)
- `expected_post_migration_catalog_sha256 b1fe2b9cf95d4d6e263b5aa65a7fc907ab2521ed6b6f654c1623cd0487ffff0d`
- report `<run-root>/q12-window-preflight-20260728T144848Z.json`: 22 `pass`, 3 `unprovable` with
  evidence (C5/C6/H4), 0 `fail`; the gate accepts it. Reports EXPIRE 30 min after `captured_at`.
  Still missing from the root: `accepted-coverage-run` + `secrets/db-capability`.

The deployed Q12 tree was REINSTALLED from `develop` twice on 2026-07-28 (latest: the B3 fix at
tree `fc495354`; replaced files under `/opt/megacampus/backups/q12-assets/20260728T135316Z/`, the
earlier set under `…/20260728T124629Z/`); H2 proves all 26 assets byte-equal. The sixth digest pin
(`qdrant/qdrant`) had no hold tag and now has one (`mc2-y5tgw`).

WINDOW STATE. Opened NINE times (2026-07-27/28); #1-#8 failed closed with ZERO mutation, #9
installed the guard, aborted, and was restored by hand the same day with the barrier's own
`$restore$`. Production re-verified clean afterwards. Every attempt BURNS its run-id.

DEFECTS #7-#9, the `mc2-ipwyc` PAIR and `mc2-38ivn`: all found, fixed and delivered on `develop`
(chronology in `.codex/stages/mc2-jz6y0/summary.md`). Each is now a PROBE in
`q12-window-preflight.py` (`mc2-34eua` -> A2/A4, `mc2-2rzf6` -> D1, `mc2-6fnrt` -> E2,
`mc2-ipwyc` -> A3/A5/B1/B2, `mc2-38ivn` -> B3), so the class cannot return silently.

THE PATTERN behind all of them: the checked environment substituted for the consuming one — a
fixture published the step, an isolate had superuser rights, the real error was swallowed, a
host-only gate hid a rotten fixture, or the pooler dropped (or rewrote) what the test connection
delivered. Model the constraint, never the convenience.

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
the deployed tree: a gate, not a reminder. Coverage: A1-A7 guarded-set privilege reachability,
B1-B4 the pooled session, C1-C4 cron/queue/residue, D1 catalog agreement in the barrier's
`search_path`, E1/E2 quiesce feasibility, H1-H5 host. Contract:
`docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md`.

Outside what the probe can do: copy `accepted-coverage-run` + `secrets/db-capability` into the run
root at 0400 (`--expected-catalog-sha256` is the sha256 of THAT root's OWN catalog FILE, barrier
`:302`, never a value quoted for a prior root); run the controller DETACHED (`setsid nohup` — a
dropped ssh once killed a plan at exit 255, and after C2 that would strand stopped writers); and
note that a push to `develop` triggers Deploy to Dev, which fails H4 for 30 minutes, so land
deliveries BEFORE the window.

WINDOW ARGV — `--release-sha` IS CONTRADICTORY, settle before the window: this line and the staged
root's authority both say `23dfe973f18cc6067d386b6eb683bf6906142165`, but `mc2-sdbua`'s closure rules
the authority is `060b4faeac2e5ef6116aa26cda8e07e43e1343a6` (the operator image `.env.production`
pins was built from it). A ruling that moves it moves `--expected-catalog-sha256` via a re-plan.
`--operator-digest b5eb528e…`
(= the `.env.production` pin), `--recovery-run-id a417a99c-…`, 64 zeroes for the resource/quiesce
digests on a first run. `--stop-after deploy.prepare` is the sole resumable pre-C9 head. The barrier
is invoked as argv[0]: keep it mode 0555, not 0444.

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
