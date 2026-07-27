# Orchestrator Handoff

Updated: 2026-07-27 (workspace consolidated onto `develop`; SINGLE SOURCE OF TRUTH unchanged)

## Single Source of Truth (2026-07-21 — owner-directed consolidation)

- **`develop` is the single source of truth** for all Q12 work; a 2026-07-21 containment audit
  proved it is the superset of every Q12 line (`codex/self-hosted-qdrant-platform`,
  `codex/q12-plan-builder`, `codex/q12-w-writer-barrier`, the W7a increments and the
  orchestration-infra commits are all in it). Keep those branches for history only.
- **Stale branches RETIRED (2026-07-27 branch audit).** `codex/self-hosted-qdrant-platform-plan`
  and `codex/q12-window-live` are deleted; the primary worktree sits on `develop` and new Q12 work
  branches from it, delivered via `/push-dev`. Three stranded fixes recovered (`mc2-jc275`
  `959ce44de`, `mc2-v31gc` `c97dca206`, `mc2-sjpbx` `3232e83cf`); video pipeline parked `mc2-hqfc3`.

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
- `.codex/project-index.md`
- `graphify-out/GRAPH_REPORT.md`
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
work is `mc2-i9h3y` (owner-present window; blocked on `mc2-7ohdj`),
with `mc2-1sns3`, `mc2-uha77`, `mc2-8m90f`, `mc2-2vtmk`, `mc2-9vbzp`, `mc2-6l2yz`,
`mc2-o0g75`, `mc2-c2p8z` and `mc2-n6szm` as tracked residuals; see § "Explicit defers".

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: ANSWER `mc2-8zxlc` — it needs an action outside this repo. The window was opened
SIX times on 2026-07-27; every attempt failed closed with ZERO mutation and each surfaced a real
defect. The sixth named the true first wall through the barrier's new diagnostics: the guard takes
ACCESS EXCLUSIVE on every guarded relation (`:892`/`:1550`/`:1567`/`:1587`/`:1664`/`:1702`, targets
from `.guarded_relations` at `:812-822`) and `cron.job` is in that frozen set. MEASURED both ways on
production: ACCESS EXCLUSIVE raises 42501, ACCESS SHARE succeeds — PostgreSQL needs
UPDATE/DELETE/TRUNCATE for any stronger mode and `postgres` holds only SELECT (owner
`supabase_admin`, ACL `postgres=r*`, not superuser, not a member of `supabase_admin`). Unlike the
cron pause there is NO API alternative: locking is a table-privilege operation. (A) ask Supabase for
`GRANT UPDATE ON cron.job TO postgres` — one grant, no code change; or (B) drop `cron.job` from
`guarded_relations`, changing the FROZEN catalog and weakening the very guarantee the window exists
for. (A) recommended.

CORRECTION: `mc2-7ohdj` was closed on an incomplete root cause — the `cron.alter_job` move is correct
and necessary, but did not unblock C1 and was closed before the window proved it.

THE PATTERN behind all of them: the checked environment substituted for production — a fixture
published the step, an isolate had superuser rights, or the real error was swallowed. The container
had no pg_cron and modelled `cron.job` as a superuser-owned table, so writes production forbids passed
forever; it now reproduces the managed ACL and the sanctioned API. Extend that model to the LOCK
privilege next so `mc2-8zxlc`'s class fails in CI. Model the constraint, never the convenience.

Fixed and deployed (controller `8ba9db34`, backup `6680aa4f`, barrier `f183aa3c`, Q12 tree byte-equal
to `develop`, `aaec6fc2…` unchanged): `mc2-wwc9l` (frozen `HOME=/root`), `mc2-94mmf` + `mc2-vcmd7`
(swallowed child errors, both layers), `mc2-orsez` (unpublished barrier input checkpoint),
`mc2-fjcj2` (no production path ran the frozen cleanup child), `mc2-1pwkl` (colour env vars),
`mc2-h5l7m` (contradictory DSN shapes) and `mc2-7ohdj` (managed pg_cron pause). Two traps: `mc2-y5tgw` (a dev deploy's `docker image prune -f` deletes the digest-pinned
`qdrant-operator` and observability images C1/C7 need; no pre-flight checks presence), and always run
the controller DETACHED (`setsid nohup`) — a dropped ssh killed one plan (exit 255), which after C2
would strand stopped writers.

EVERY blocker so far was invisible locally for the SAME reason: a fixture, an isolate or a swallowed
error stood in for production. The suites no longer do so — they delegate to production and override
only the sandbox spawn.

RELEASE IDENTITY SETTLED (`mc2-v7547`). `--release-sha` and `--operator-digest` are DIFFERENT artifacts
and had been conflated: `060b4faea` touched only `deploy/qdrant` + `scripts`, so CI built only its
`qdrant-operator` image — `b5eb528e`, which `--operator-digest` keeps because it must equal
`.env.production`'s pin. `--release-sha` names the APP release `.env.green` pins; `.env.green` is
re-pinned (backup `.env.green.bak-4128a938-20260727`, two lines, 0600 kept, `.env.blue` untouched) to
api@`2f713f87` + web@`ca9afb99` — the exact per-package build of the `23dfe973f` tree, since
`packages/web`/`shared-types`/`shared-utils` did not change between `50f670b9` and `23dfe973f`. No pull
is needed; the dead GHCR token (`mc2-2vtmk`) does not block the window. The 17 career-playbook files
newer than `23dfe973f` ride the next ordinary deploy — itself broken (`mc2-o0g75`); colour env files
are hand-maintained (`mc2-c2p8z`).

WINDOW ARGV: `--release-sha 23dfe973f18cc6067d386b6eb683bf6906142165`, `--operator-digest b5eb528e…`
(= `.env.production` pin), `--recovery-run-id a417a99c-…`, 64 zeroes for the resource/quiesce digests
on a first run. `--expected-catalog-sha256` is the sha256 of the run root's OWN catalog FILE (barrier
`:302`) — take it from the fresh `plan`, not a previous run: it embeds `release_sha` (hence
`8ca17c43…` -> `aa96c170…`, stable across four plans). Each attempt burns its run-id, so every retry
needs a fresh run root (`mkdir -m 0700`, copy `accepted-coverage-run` + `secrets/db-capability`) plus
one `plan`. `--stop-after deploy.prepare` is the sole resumable pre-C9 head. Do not change
`aaec6fc2…`. The barrier is invoked as argv[0]: keep it mode 0555, not 0444. Historical progress
logs: `.codex/stages/mc2-jz6y0/summary.md`; this file is current-state only.

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

- Review P2 on the `.13.4.1` amendment (`mc2-af1ay`, independent review PASS 0 P0/P1):
  `source-recovery.ts` keeps a second operator-side `DispositionSchema` without the
  kind↔reason↔course_id superRefine that lives in `source-recovery-manifest.ts` — currently
  rescued because `assertExactRecoveryContract` runs `normalizeRecoveryManifest` (strict
  schema). DEFERRED until after the live window: consolidate the duplicate disposition
  schema, deduplicate the `CATALOG_HASH_PATTERN` constant across both copies, and consider
  tightening its character class (exclude quote/backslash) — no operator churn before
  C1..C10. Delta-review of `d3cb0ee43` also PASS 0 P0/P1 (both review passes and both
  root-owned passes agree). Tracked on `mc2-af1ay`.
- Q12 staging mutation is owner-authorized, but remains NO-GO until the
  approved local correction streams, truthful fresh validated database backup,
  Supabase-compatible restore and every documented hard gate pass. GHCR
  publication and password rotation retain their separate secret/effects gates.
  Missing-source product truth is resolved by the approved six failed plus
  eighteen retained-derived-only dispositions. Do not partially activate.
- D6 `.13.19` is integrated (see above); Root `.13.13` join is the next
  implementation stream. D6 pinned-server capability gates and the fields
  5/6/8/9 production re-freeze (Task C7) stay live-window scope. No live
  action outside the owner-gated window.
- Known accepted boundaries (documented by design, not debt): the joined
  composer's partial-capture fixture is truthful only while W validates held
  checkpoints as a creation-order prefix without a journaled counter (review
  P2-3); §5 tamper-append of a fully valid row is outside the tamper
  protection by design (append of VALID bytes is indistinguishable from
  authorship — the guarded property is prefix integrity); M's residual P2-4
  libpq variables (`PGSSLCERT`/`PGSSLKEY`/`PGSSLPASSWORD`/`PGCHANNELBINDING`/
  `PGGSSENCMODE`) are proven non-exploitable with the explicit `ssl` object.
- PG17 security-manifest digests are DONE: computed on the `.13.7` isolated
  restore and integrated into the allowlists at `b8204cde`.
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
