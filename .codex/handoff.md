# Orchestrator Handoff

Updated: 2026-07-28 (C1 wall removed: `cron.job` unguarded, `mc2-34eua`)

## Single Source of Truth (2026-07-21 — owner-directed consolidation)

- **`develop` is the single source of truth** for all Q12 work; a 2026-07-21 containment audit
  proved it is the superset of every Q12 line (`codex/self-hosted-qdrant-platform`,
  `codex/q12-plan-builder`, `codex/q12-w-writer-barrier`, the W7a increments and the
  orchestration-infra commits are all in it). Keep those branches for history only.
- **Stale branches RETIRED (2026-07-27 audit).** The primary worktree sits on `develop`; new Q12
  work branches from it and is delivered via `/push-dev`. Video pipeline parked `mc2-hqfc3`.

Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion

## Product Truth

- Qdrant Cloud data was test-only and is lost. Do not recover or mutate it; rebuild the derived index from authoritative sources.
- Target remains private self-hosted Qdrant `1.18.2`, native multilingual BM25/IDF, server RRF/Formula priority, strict indexes, aliases, source reindex, Prometheus/Grafana/alerts, and secure loopback Web UI. Development staging uses persistent local-volume snapshots; off-host S3 is the production gate `mc2-jz6y0.13.6`.
- Documents are optional but important advisory evidence. A course without documents remains fully supported.
- Every uploaded document must receive a durable `assessed`, `degraded`, or `failed` coverage outcome; none may disappear through context truncation.
- Documents supplement the baseline structure. They may add facts, terminology, constraints, examples, and source-backed topics but cannot silently replace baseline curriculum requirements.
- Material document conflicts use a distinct required-question block. Manual mode pauses at the existing Phase 0.5 boundary. Automatic mode selects the recommendation and appends `resolved_by: system` / `answer_source: system` with rationale.

## Read First

- `AGENTS.md`
- `.codex/orchestrator.toml`
- `.codex/handoff.md`
- `.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`
- `docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md`
- `docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md`
- `docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md`
- `docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md`
- `docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md`
- `docs/superpowers/plans/2026-07-13-q12-live-cutover-corrections.md`
- `docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md`
- `docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md`
- `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md`

## Accepted and Open Work

Accepted-and-integrated history for Q1-Q12 (including every `.13.*` sub-stream,
its review verdicts and evidence hashes) moved on 2026-07-25 to
`.codex/stages/mc2-jz6y0/summary.md` § "Accepted and open work history". Current open
work is `mc2-i9h3y` (owner-present window; UNBLOCKED — `mc2-8zxlc` closed 2026-07-28),
with `mc2-1sns3`, `mc2-uha77`, `mc2-8m90f`, `mc2-2vtmk`, `mc2-9vbzp`, `mc2-6l2yz`,
`mc2-o0g75`, `mc2-c2p8z`, `mc2-n6szm` and `mc2-qd12b` as tracked residuals; see § "Explicit defers".

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: RE-OPEN the window to the reversible `--stop-after deploy.prepare` hold. The C1
wall is REMOVED (`mc2-8zxlc` closed by `mc2-34eua`, owner-approved variant B, 2026-07-28) and BOTH
pre-window steps are DONE (2026-07-28): the server's Q12 deploy tree is byte-identical to `develop`
for all 40 tracked files (backups in `/opt/megacampus/backups/q12-assets/`), and a fresh `plan` has
emitted a 75-relation catalog. USE RUN ROOT `5e9b7256-4ae3-449c-95e0-d6aa4d225fc8` with
`--expected-catalog-sha256 c669b8dd90e42ab60896d342ccec2fbfa4df3ee2da2359d5746920510abbda33`; it is
complete (catalog 0400, `accepted-coverage-run` 0400, `secrets/db-capability` 0400, root 0700) and
its catalog holds auth 22 + public 47 + storage 5 + net 1 = 75, zero cron entries, cron_jobs still
baselined at 8. Production verified pristine after the plan: 0 q12 schemas, 0 q12 triggers, 8 cron
jobs ACTIVE, empty pg_net queue, no read-only default. The window was opened SIX times on 2026-07-27; every attempt failed closed with ZERO mutation and
each surfaced a real defect. The sixth named the true first wall: the guard needs ACCESS EXCLUSIVE
AND `CREATE TRIGGER` on every guarded relation, and `cron.job` is owned by `supabase_admin` with only
SELECT granted to `postgres` — 42501 both ways (ACCESS SHARE succeeds; measured). A privilege audit
of all 76 showed `cron.job` was the ONLY one out of reach — `auth`/`storage` are already selected by
`has_table_privilege(..., 'TRIGGER')` — so the set was curated against privileges and `cron.job` was
hardcoded past that filter. Guarding it was never a stronger guarantee, only an unreachable one.

VARIANT B AS BUILT (`mc2-34eua`): `cron.job` out of `guarded_relations` (75; the barrier now asserts
NO cron relation is guarded, proven load-bearing by two-way mutation). Retained, privilege-free:
`cron.alter_job` pause, the zero-active-jobs assertion (a read), the read-only database default, and
the guard trigger on `net.http_request_queue` — the only write path out for the two HOURLY jobs
(`cleanup-old-drafts-hourly` :00, `detect-stuck-generations` :30, both via `net.http_post`; the other
six are nightly). Lost: the trigger blocking mid-window re-activation and the lock's atomicity over
the pause — both need a superuser or Supabase automation. In `q12-source-manifest.ts` `authoritative`
(rows hashed, a read) is now SPLIT from trigger-guarded, so `cron.job` rows are still compared minus
`active`. Barrier `f183aa3c` -> `f4f90361`; W-tuple fields
4/5/6/8/9 amended; `aaec6fc2…` UNCHANGED (the catalog sha reaches argv as a runtime placeholder).
SECOND INSTANCE found by the
amendment: the D6 activation-truth probe took `LOCK TABLE ... IN SHARE MODE` over the same catalog,
and SHARE also needs UPDATE/DELETE/TRUNCATE/MAINTAIN — it would have raised 42501 on `cron.job` too,
as a pre-flight separate from `barrier.install`. `cron.job` is out of both its templates (the
`cron_jobs` READ stays); any D6 request must carry `projection_sql_sha256 = d5046e31…` (prior
`36d28034…`). The probe is not one of the 20 frozen commands.

CORRECTIONS: `mc2-7ohdj` was closed on an incomplete root cause — `cron.alter_job` is correct and
necessary but did not unblock C1, and was closed before the window proved it. The 2026-07-27 claim
that all real-PG17 suites were green did not cover `q12-cron-restore-loop-ambiguity`, which that same
change had left red (it pinned the superseded aliased UPDATE); retargeted and green, as is
`supabase-restore-drill`'s exact-guard case (`mc2-qd12b` tracks its class).

THE PATTERN behind all of them: the checked environment substituted for production — a fixture
published the step, an isolate had superuser rights, the real error was swallowed, or a host-only gate
hid a rotten fixture. Model the constraint, never the convenience.

Fixed and deployed (controller `cdfef48c`, plan capture `f55dc0b7`, barrier `f4f90361`, backup
`6680aa4f`; the whole Q12 tree is byte-equal to `develop` `4a9626fca` ON THE SERVER): `mc2-wwc9l`, `mc2-94mmf`, `mc2-vcmd7`, `mc2-orsez`, `mc2-fjcj2`, `mc2-1pwkl`, `mc2-h5l7m`,
`mc2-7ohdj`, `mc2-34eua` (see `.codex/stages/mc2-jz6y0/summary.md`). Two traps: `mc2-y5tgw` (a dev
deploy's `docker image prune -f` deletes the digest-pinned `qdrant-operator` and observability images
C1/C7 need; no pre-flight checks presence), and always run the controller DETACHED (`setsid nohup`) —
a dropped ssh once killed a plan (exit 255); after C2 that would strand stopped writers.

RELEASE IDENTITY SETTLED (`mc2-v7547`): `--release-sha` names the APP release `.env.green` pins,
`--operator-digest` the `qdrant-operator` image `.env.production` pins — they are DIFFERENT artifacts
and had been conflated. `.env.green` is re-pinned (backup `.env.green.bak-4128a938-20260727`, 0600
kept, `.env.blue` untouched) to api@`2f713f87` + web@`ca9afb99`, the per-package build of the
`23dfe973f` tree. No pull is needed; the dead GHCR token (`mc2-2vtmk`) does not block the window. The
17 career-playbook files newer than `23dfe973f` ride the next ordinary deploy — itself broken
(`mc2-o0g75`); colour env files are hand-maintained (`mc2-c2p8z`).

WINDOW ARGV: `--release-sha 23dfe973f18cc6067d386b6eb683bf6906142165`, `--operator-digest b5eb528e…`
(= `.env.production` pin), `--recovery-run-id a417a99c-…`, 64 zeroes for the resource/quiesce digests
on a first run. `--expected-catalog-sha256` is the sha256 of the run root's OWN catalog FILE (barrier
`:302`) — for run root `5e9b7256-…` it is `c669b8dd…`. Each attempt burns its run-id, so any FURTHER
retry needs another fresh run root plus its own `plan` (`plan` creates the root itself and only
reads production; then copy `accepted-coverage-run` + `secrets/db-capability` in at 0400). `--stop-after deploy.prepare` is
the sole resumable pre-C9 head. Do not change `aaec6fc2…`. The barrier is invoked as argv[0]: keep it
mode 0555, not 0444. Historical progress logs: `.codex/stages/mc2-jz6y0/summary.md`; this file is
current-state only.

## Starter prompt for next orchestrator

Full completion program authored (prompt-check pass): copy
`docs/superpowers/prompts/2026-07-16-q12-full-completion-orchestrator.md`
(authority: spec `…specs/2026-07-16-q12-full-completion-design.md` + plan
`…plans/2026-07-16-q12-full-completion.md`; Phase A local D6/Root → B GHCR
publish → C live cutover → D closeout; every remote/live and credentialed step
owner-gated). Fallback: Use $orchestrator-stage from this handoff plus the stage summary.

## Required Skills and Review

- Orchestration: `orchestrator-stage`, `task-router`, `subagent-driven-development`.
- Behavior changes: `brainstorming` where decisions remain, `test-driven-development`, `verification-before-completion`.
- Risk/closeout: `senior-architect`, `senior-devops`, `test-pass`, `orchestration-closeout`.
- Specialists: `docs_researcher`, search/data worker, `deploy_specialist`, `correctness_reviewer`, and `docs_reviewer`.

## Verification and Delivery

- Do not weaken RU/EN relevance, strict-mode, restore, resume, coverage, or tenant-isolation tests.
- Completed local gates: focused Stage 2/4/5/6 backend 1,893/1,893, shared 23/23, web 20/20, PostgreSQL 78/78, pinned Qdrant 15/15, applicable local snapshot/restore 5/5, Compose 8/8, `pnpm type-check`, and `pnpm build` 75/75. Process verification, final Graphify refresh, and canonical closeout are recorded at the delivered HEAD.
- Keep durable docs, project index, Graphify (`graphify update .`; `graphify cluster-only . --no-viz`), Beads, artifacts, stage summary, and this handoff synchronized before any Q12 continuation.
- All accepted branches/commits must be pushed under the repo contract.
- Primary worktree may contain unrelated `.claude/settings.json`; do not alter or include it.

## Explicit defers

- Review P2 on the `.13.4.1` amendment (`mc2-af1ay`): `source-recovery.ts` keeps a second
  operator-side `DispositionSchema` without the kind↔reason↔course_id superRefine from
  `source-recovery-manifest.ts` — rescued today because `assertExactRecoveryContract` runs the
  strict `normalizeRecoveryManifest`. DEFERRED past the live window (no operator churn before
  C1..C10): consolidate the duplicate schema, deduplicate `CATALOG_HASH_PATTERN`, consider
  excluding quote/backslash from its character class.
- Q12 staging mutation is owner-authorized but NO-GO until the approved correction streams, a truthful
  fresh validated database backup, a Supabase-compatible restore and every documented hard gate pass.
  GHCR publication and password rotation keep their separate secret/effects gates. Missing-source
  product truth is settled by the approved six failed plus eighteen retained-derived-only
  dispositions. Do not partially activate.
- D6 `.13.19` is integrated; Root `.13.13` join is the next implementation stream. D6 pinned-server
  capability gates and the fields 5/6/8/9 production re-freeze (Task C7) stay live-window scope. No
  live action outside the owner-gated window.
- Known accepted boundaries (by design, not debt): the joined composer's partial-capture fixture is
  truthful only while W validates held checkpoints as a creation-order prefix without a journaled
  counter (P2-3); §5 tamper-append of a fully VALID row is outside tamper protection by design (the
  guarded property is prefix integrity); M's residual P2-4 libpq variables are proven
  non-exploitable with the explicit `ssl` object.
- Off-host S3 is not a staging blocker after the 2026-07-12 owner decision; it
  remains the explicit production readiness defer `mc2-jz6y0.13.6`.
- Prometheus retention YAML migration is the bounded nonblocking defer
  `mc2-jz6y0.25`, due before the next Prometheus pin change.
- The current pushed `codex/self-hosted-qdrant-platform` integration branch/worktree is intentionally retained for Q12. Final cleanup returned non-zero only because it correctly refused to delete this checked-out continuation branch; all Q11-owned worktrees, local branches, containers, ports and temporary data are cleaned.
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
