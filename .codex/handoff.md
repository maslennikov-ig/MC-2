# Orchestrator Handoff

Updated: 2026-08-09. Effective kernel: `shared-orchestration/v1`.
Current stage id: `delivery-closeout`

## Current stage

The accessible backlog is delivered to `origin/develop` at `998782668` and deployed to staging in
the `develop -> master` merge `123152924`. The exact-SHA develop pipeline
[`31322960981`](https://github.com/maslennikov-ig/MC-2/actions/runs/31322960981) and staging
pipeline [`31324154741`](https://github.com/maslennikov-ig/MC-2/actions/runs/31324154741) are green;
the staging Blue/Green deploy, public health verification, monitoring drift check, and notification
all succeeded, while rollback was correctly skipped. A separate read-only request to
`https://ai.megacampus.ru/api/health` returned `{"status":"ok"}` after the workflow completed.

`mc2-5dzld`, `mc2-zt4ju`, `mc2-n6szm`, `mc2-1mmop`, and `mc2-iioip` are delivered in
commits `858e4a707`, `05d7fc7e7`, `e1857fadc`, `9d48cbfcc`, and `7d8e4b8eb` and closed in Beads.
The shared `mc2-iioip` implementation is delivered in orchestration-console `main` at `fada910`;
its full validation/smoke block passed and the merged feature branch was removed. `mc2-db696.57`,
`mc2-db696.60`, `mc2-db696.78`, and
`mc2-db696.79` are delivered in `968d8d513`, `22234881b`, `99e839520`, and `f52719137`.
`mc2-5e4ek.2`, `mc2-k2qih`, `mc2-mt07s`, `mc2-stds7`, and `mc2-68qwn` are delivered in
`1e4caad9f`, `02bb9a670`, `4dc9a24e7`, `8a613f98f`, and `c36adc111`. `mc2-vb8kl` is delivered
in `339cc6e00`. The backend test entrypoint repair is delivered in `4474b6f45`. `mc2-r7udy` is
blocked because a truthful worker lifecycle event needs a new
`system_metrics` enum value, which is a forbidden schema migration. `mc2-wxun` is delivered
in `460784fc8` with disabled-by-default Tier 1 shadow observability shared with `mc2-vjbb`; both
issues now stop at their separately authorized live experiment boundary.

The previous off-host Qdrant stage is delivered and deployed through green pipelines. Production
health is green, `helixa-new` retains three verified generations under the 14-day/14-copy bound,
and both backup and restore timers remain enabled.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order. The checked backlog
contains 49 work items plus 5 epics; do not re-open the 27 already closed with a commit or a
measurement, and do not re-rank by tracker priority.

Tier 1 is complete through `mc2-sznhi`; Tier 2 is complete through `mc2-3sz3d`; Tier 3 is complete
through `mc2-jz6y0.13.6`; Tier 4 is complete through `mc2-iioip`. All accessible Tier 5 repository
work is complete through the `mc2-wxun`/`mc2-vjbb` instrumentation boundary; live, migration,
research, and owner-decision items remain explicitly deferred.

## Verification facts

- Release acceptance passed via
  `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-wxun --level release --process-check`:
  `pnpm type-check`, `pnpm build`, 397 backend test files with 6,886 tests passed and 111 live-only
  skips, 92 web test files with 1,271 tests passed, process verification, stage readiness, and
  artifact validation were green.
- The develop exact-SHA pipeline `31322960981` passed all CI, image, contract, and dev-deploy jobs
  for `998782668`; the staging exact-SHA pipeline `31324154741` passed all CI, image, contract,
  Blue/Green deployment, health, and monitoring jobs for `123152924`.
- The migration-drift jobs concluded successfully, but their optional database probe was skipped
  because the available connection required SSL. This release contains no schema migration and
  does not use that skipped probe as migration evidence.
- `graph-reviewed: updated` — local-only Graphify refresh after code commit `4474b6f45` contains
  61,495 nodes, 88,538 edges, and 7,335 communities. Later commits are acceptance metadata and the
  delivery merge, so no second graph refresh is needed.

- The default backend Vitest command is now fail-closed: an unmet Qdrant precondition and an empty
  run exit nonzero. It still requires the pinned Qdrant 1.18.2 precondition unless the operator
  explicitly sets `SKIP_QDRANT_TEST_SETUP=1`; use `vitest.config.unit.ts` for focused unit tests.
- Web tests work.
- Typical code gates are `pnpm type-check` and `pnpm build`.
- Repository deploy/rollback entrypoints now fail with exit 75 when
  `/opt/megacampus/.host-operation.lock` is held; manual infrastructure work must use
  `scripts/with_host_operation_lock.sh` to participate.
- `mc2-jsamu` reproduced 138 format mismatches plus 11 raw-capture parse blockers. Narrow ignores
  removed all blockers; the 104 owned formatting files and global format/type/build acceptance are
  green.
- Before claiming delivery, run `scripts/orchestration/check_stranded_commits.py`.
- Accepted child-workspace cleanup is dry-run first: `cleanup_stage_workspace.py` prunes the exact
  Next cache only for clean, merged child worktrees and preserves dirty, unmerged, protected, and
  primary worktrees.
- The Career Playbook Business Context transition has a synthetic Chromium fixture that holds
  session sync and follow-up responses independently, proving sync-before-request ordering without
  a live generation call.
- Development CSP now derives exact private-network HTTP/WebSocket origins from configured backend
  and Supabase URLs; focused Chromium records no invalid CSP source console error.
- Career Playbook source jobs pass an explicit Phase 6 title-language mode, so their ids are no
  longer queried in `courses`; Russian title generation is covered by a deterministic unit test.
- Stage 5 approval controls, output quality UI, and backend approval derive `critical`, `warning`,
  or `pass` from one shared runtime helper; the three states have frontend unit coverage.
- Career Playbook reader rails now use 220 ms transform/opacity exit and layout motion, retain URL
  state and semantic removal, and disable motion for the reduced-motion preference. The focused
  Chromium scenario is committed for CI; locally its global setup stopped before the test because
  Supabase test credentials were absent.
- Stage 6 main generation and self-review phase routing pass non-ru/en language codes unchanged;
  the dead ru/en-normalizing model helper and language-keyed fallback map are removed. Deterministic
  `de` coverage proves routing only; no paid multilingual quality run was performed.
- Targeted refinement now counts budget-skipped work across the complete five-task selected set;
  combined eight-available/five-selected/three-executed coverage proves the count is two, not a
  negative cross-batch value.
- The named Q12 capture/projection surfaces have a tracked name-versus-text coercion audit. No
  second live hazard was found; a default structural guard and disposable PostgreSQL 17.10 test
  preserve source-manifest identities longer than 63 bytes.
- Qdrant reindex document-processing jobs skip all eight course-level Stage 2 progress writes by
  their existing job-id origin; ordinary jobs retain the original updates. No reindex was run.
- Tier 1 exits have a stable, zero-default shadow cohort. Complete `tier1_shadow` traces expose the
  raw dense gate score and exact active-hybrid Tier 2 result count without content or result impact;
  invalid rates fail closed and the active threshold remains 0.15.

## Live operational facts

- Uploads have a daily pull-based off-host copy on `helixa-new`; restore of one file matched
  `file_catalog.hash`. It is a second machine, not full disaster recovery.
- Qdrant now has a separate daily restricted pull to `helixa-new`: the measured generation is
  142,585,344 bytes with matching SHA-256, 14-day/14-copy bounds, exact incoming-size reservation
  above a 10 GiB free-space floor, and low CPU/I/O priority. Three generations occupy 409 MiB with
  48 GiB free. The exact digest-pinned 1.18.2 restore returned all 13,712 points green; both timers
  are enabled. Root-owned off-host metrics cannot be replaced by UID 1001. Production Prometheus
  scrapes independent backup/restore timestamps, and both Telegram-routed rules are healthy.
- Nine source documents are accepted as lost; do not reopen them.
- Production Qdrant answers on host port 6335; 6333 is the empty dev instance.
- Monitoring drift is a separate job and must never become a deploy step because that can trigger
  rollback on configuration drift.
- `AGENTS.md` is rewritten by a `bd` hook: stage and commit explicit paths, never `git add -A`.

## Owner decisions

- `mc2-jz6y0.13.6` — answered: use pull-based off-host snapshots on `helixa-new`, 14-day bounded retention, and low resource priority.
- `mc2-db696.61` — needs a live run and a cost/quality decision.
- `mc2-db696.11.6` — needs disposable staging resources and an approved LLM budget.

## Safety boundary

Do not perform reindex, schema migrations, force-push, or any secrets/access change outside the
explicitly authorized `mc2-2vtmk` GHCR credential repair. Deploy only under the standing
authorization and only on a green pipeline. Do not run live paid work without a specific current
budget/authority.

Do not touch `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`,
`mc2-1nots`, or `mc2-5e4ek.1`; see §9 of the active spec for exact reopen gates.

## Explicit defers

- Beads task `mc2-v6fqp` — evaluate a live Stage 6 multilingual quality matrix only after the
  owner approves a concrete LLM spend budget and disposable inputs; `mc2-mt07s` proves language
  routing metadata but intentionally makes no output-quality claim.
- Beads tasks `mc2-wxun` and `mc2-vjbb` — instrumentation is complete, disabled, and locally
  accepted; enabling a cohort, observing capacity, collecting 1-2 weeks of complete production
  traces, calculating false-positive/percentile results, staging a threshold, and deciding whether
  to change 0.15 are live/owner actions outside this stage.
- Beads task `mc2-r7udy` — worker lifecycle/heartbeat persistence needs a truthful new
  `metric_event_type` value (or a new table); both are schema migrations forbidden by the active
  specification. Reusing an unrelated enum would corrupt existing monitoring semantics.
- Beads task `mc2-xq2w0` — make the closeout debt-marker scan distinguish intentional
  `TODO`/`FIXME` test literals from new production debt; current formatting preserves those
  validator fixtures unchanged in meaning.
- Beads task `mc2-vr7ic` — make the pre-commit hook handle formatting-only legacy batches and
  deliberately tracked `.codex/goals` snapshots without requiring unrelated lint cleanup or a
  manual hook bypass.
- `mc2-3gz2m` — unreadable vector diagrams; gated on
  `specs/025-remaining-debt/research-prompt.md`.
- `mc2-6ye5z.4`, `mc2-6ye5z.5`, `mc2-6ye5z.8` — slide deck, report, and data-table enrichments
  require new PostgreSQL `enrichment_type` enum values; schema migrations are forbidden by the
  active specification, so partial integration would not meet their acceptance boundary.
- `mc2-db696.61`, `mc2-db696.11.6` — owner decisions above.
- `mc2-p2908.1` — trace the existing Node `DEP0169 url.parse()` warning emitted by Next.js
  page-data workers during an otherwise successful production build.
- Separate deploy accounts and narrower sudoers — intentionally not planned after `mc2-q1ggs`;
  reconsider only if another regular production operator appears.
- `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`, `mc2-1nots`,
  `mc2-5e4ek.1` — excluded by §9, with repository or owner gates already recorded.

## Next recommended

Accepted stage id: `mc2-wxun`
Current stage id: `delivery-closeout`
Next stage id: `owner-live-or-migration-boundary`
Recommended action: no accessible repository implementation remains under the active specification.
Choose a separately authorized deferred boundary: provide the missing `mc2-3gz2m` research, approve
a concrete paid/live experiment budget and disposable inputs, or explicitly authorize a future
schema-migration stage. Do not enable the RAG cohort, change the threshold, reindex, or migrate as
part of this completed delivery.

## Starter prompt for next orchestrator

Use $orchestrator-stage for the current Codex task.

`mc2-wxun` is committed in `460784fc8`; the orchestration-console compatibility fix is delivered in
`main` at `fada910`. The accessible repository backlog is delivered to `develop` at `998782668` and
deployed to staging at `123152924`; both exact-SHA pipelines are green and the public health endpoint
returned `ok`. Only the explicit live-budget, missing-research, schema-migration, and §9 defers remain.
Do not enable the cohort, change the threshold, reindex, migrate, force-push, or perform paid work
without a separately authorized next stage.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
