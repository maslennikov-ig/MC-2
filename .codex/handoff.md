# Orchestrator Handoff

Updated: 2026-08-11. Effective kernel: `shared-orchestration/v1`.
Current stage id: `mc2-db696.11.6`

## Current stage

`mc2-db696.11.6` is accepted on `codex/career-playbook-load-test`. One isolated dev batch picked
up ten main generation jobs within 1,359 ms; all ten completed while worker readiness remained
live. All durations and costs are tracked: total USD 1.19633817 and maximum single run USD
0.160969265, below the approved USD 5.00/USD 0.50 limits. Exact cleanup removed the disposable
auth/public user, organization, ten playbooks, job/error rows, and isolated queue; database, auth,
queue, file, course, and Qdrant residue are zero.

The initial observer lost the longest result when its access token expired near one hour. A
refreshed resume read recovered it without another generation. The tRPC client now rotates the
Supabase session on 401 and retries once. Ten separate best-effort image children exposed a
Node/JSDOM OpenAI SDK guard; the server image client is corrected with focused coverage. No live
resource remains.

The accessible backlog, release audit, dependency remediation and CI-timeout correction are
delivered at `567566726` and staged via merge `e498451e8`. Exact-SHA develop run `31370658686` and
staging run `31371888070` are green; Blue/Green switching, public/active-color health and monitoring
checks passed, and the API health endpoint plus homepage were healthy afterward.

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

- Release acceptance for `mc2-sshkz` passed via
  `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-sshkz --level release --process-check`:
  `pnpm type-check`, `pnpm build`, `pnpm test`, process verification, stage readiness, and artifact
  validation were green. The final web unit total was 1,272/1,272 with zero skips.
- The 111 default backend skips are fully classified: 106 PostgreSQL 17 opt-ins, three pgcrypto
  fixture tests, and two mutually exclusive environment branches. Their opt-in runs passed 309,
  3, and 21 tests respectively with zero skips; the incompatible-Qdrant default runner exits 1
  instead of producing a false green.
- Develop exact-SHA run `31357791241` deployed `50208b60a` to dev. API health and the English
  browser regression passed afterward with zero console messages and observed dynamic requests
  returning HTTP 200.
- Dependency-security remediation for `mc2-0ukr6` is accepted and delivered: the baseline 77
  findings (9 low, 38 moderate, 29 high, 1 critical) are zero in full, production-only, and dev-only
  audits. The Security Audit and aggregate `ci-success` gate now both fail closed. Canonical release
  acceptance passed; exact-SHA run `31364905125` deployed `d18910ee4` to dev, whose API returned
  `status: ok` and homepage returned HTTP 200. Closed `mc2-bwx1o` remains closed.
- Staging deploy correction `mc2-n4cog` is accepted and delivered: the original master run
  `31369687249` stopped safely before image build/deploy on a 30-second Stage 4 test timeout; the
  same focused file passed 11/11 locally after the narrow 60-second per-test limit. Exact develop
  run `31370658686` and exact master run `31371888070` then passed unit, integration, contract,
  lint, type-check, security, build, all four image builds, Blue/Green deploy, public verification,
  monitoring drift, and notification. Rollback was correctly skipped.
- The migration-drift jobs concluded successfully, but their optional database probe was skipped
  because the available connection required SSL. This release contains no schema migration and
  does not use that skipped probe as migration evidence.
- `graph-reviewed: updated` — the local-only Graphify refresh for `mc2-3gz2m` contains 61,555
  nodes, 88,596 edges, and 7,344 communities; no external semantic backend was used.
- The default backend Vitest command is now fail-closed: an unmet Qdrant precondition and an empty
  run exit nonzero. It still requires the pinned Qdrant 1.18.2 precondition unless the operator
  explicitly sets `SKIP_QDRANT_TEST_SETUP=1`; use `vitest.config.unit.ts` for focused unit tests.
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
- The alternative OCR child `mc2-3gz2m.1` exhausts the safe local CPU candidates: EasyOCR and
  PaddleOCR fail quality, Surya fails the load-memory gate, and PaddleOCR-VL fails whole-page
  latency. This closes only the experiment by measurement; parent capability `mc2-3gz2m` remains
  open and no fallback was shipped.
- The follow-up `mc2-3gz2m.2` proves the built-in official path is not the missing solution:
  Docling-native RapidOCR PP-OCRv5 Cyrillic finished in 87.78 seconds at 2,719,920 KiB process RSS
  and a 3,759,906,816-byte cgroup peak, but recovered 0/36 labels with mean similarity 0.0289.
- The web production build's Node `DEP0169` warning was traced to ioredis 5.8.2. Direct ioredis
  dependencies and BullMQ are aligned on ioredis 5.11.1; `NODE_OPTIONS=--throw-deprecation` now
  passes the complete web build.
- The package-manager `DEP0169` warning is also removed: pnpm 10.34.5 is pinned in the manifest and
  active CI. Its lockfile v9 format, explicit six-package build allowlist, fail-closed unreviewed
  build policy, explicit-script-only workspace behavior and legacy-compatible portable backend
  deploy pass focused clean-install/build/deploy proofs.
- Career Playbook 10-concurrent acceptance completed 10/10 main jobs with 1,359 ms pickup spread,
  64 readiness writes, USD 1.19633817 total cost, USD 0.160969265 max cost, and zero cleanup
  residue. The original 9/10 report was an observer-token expiry, not a generation failure; the
  refresh/retry path and the separately exposed image-client JSDOM guard now have focused coverage.
- `graph-reviewed: updated` — Graphify 0.9.14 rebuilt the local-only graph without external
  semantic backends to 61,733 nodes, 88,850 edges, and 7,352 communities.

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
- `mc2-6ye5z.4`, `mc2-6ye5z.5`, `mc2-6ye5z.8` — slide deck, report, and data-table enrichments
  require new PostgreSQL `enrichment_type` enum values; schema migrations are forbidden by the
  active specification, so partial integration would not meet their acceptance boundary.
- `mc2-db696.61` — owner decision above.
- Separate deploy accounts and narrower sudoers — intentionally not planned after `mc2-q1ggs`;
  reconsider only if another regular production operator appears.
- `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`, `mc2-1nots`,
  `mc2-5e4ek.1` — excluded by §9, with repository or owner gates already recorded.

## Next recommended

Accepted stage id: `mc2-db696.11.6`
Current stage id: `mc2-db696.11.6`
Next stage id: `mc2-db696.61` only after a separate live-cost/quality decision
Recommended action: preserve the accepted load result and zero-residue state. Do not start another
paid run automatically; the remaining `mc2-db696.61` decision has its own live budget boundary.

## Starter prompt for next orchestrator

Use $orchestrator-stage only after the owner selects an explicit remaining boundary. Do not enable
the cohort, change its threshold, reindex, migrate, force-push, deploy or perform paid work without
separate current authorization.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
