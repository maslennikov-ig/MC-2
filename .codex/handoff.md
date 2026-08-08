# Orchestrator Handoff

Updated: 2026-08-08. Effective kernel: `shared-orchestration/v1`.
Current stage id: `mc2-q1ggs`

## Current stage

`mc2-q1ggs` is accepted locally. Product commit `beca7ef72` adds one cooperative non-blocking host
lock for production, development, rollback, legacy deploy, and wrapped infrastructure operations.
Separate accounts and narrower sudoers remain intentionally deferred until another regular
operator exists.

Focused red-green, deploy contract checks, `pnpm run type-check`, `pnpm run build`, and canonical
process verification passed. The task is closed in Beads. No server or access change was performed.

Implementation must remain repository-local. No account, sudoers, SSH, secret, deploy, migration,
reindex, or live production action is authorized.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order. The checked backlog
contains 49 work items plus 5 epics; do not re-open the 27 already closed with a commit or a
measurement, and do not re-rank by tracker priority.

Tier 1 is complete through `mc2-sznhi`; Tier 2 is complete through `mc2-3sz3d`; Tier 3 is complete
through `mc2-q1ggs`. The next item is `mc2-2vtmk` in exact spec order.

## Verification facts

- The default backend Vitest command is now fail-closed: an unmet Qdrant precondition and an empty
  run exit nonzero. It still requires the pinned Qdrant 1.18.2 precondition unless the operator
  explicitly sets `SKIP_QDRANT_TEST_SETUP=1`; use `vitest.config.unit.ts` for focused unit tests.
- Web tests work.
- Typical code gates are `pnpm type-check` and `pnpm build`.
- Repository deploy/rollback entrypoints now fail with exit 75 when
  `/opt/megacampus/.host-operation.lock` is held; manual infrastructure work must use
  `scripts/with_host_operation_lock.sh` to participate.
- `pnpm format:check` currently fails on 138 files plus 11 unparseable raw LLM captures; this is
  tracked repo-health work, not a reason to rewrite the captures.
- Before claiming delivery, run `scripts/orchestration/check_stranded_commits.py`.

## Live operational facts

- Uploads have a daily pull-based off-host copy on `helixa-new`; restore of one file matched
  `file_catalog.hash`. It is a second machine, not full disaster recovery.
- Nine source documents are accepted as lost; do not reopen them.
- Production Qdrant answers on host port 6335; 6333 is the empty dev instance.
- Monitoring drift is a separate job and must never become a deploy step because that can trigger
  rollback on configuration drift.
- `AGENTS.md` is rewritten by a `bd` hook: stage and commit explicit paths, never `git add -A`.

## Owner decisions

- `mc2-jz6y0.13.6` — re-decide off-host Qdrant snapshots now that a second host exists.
- `mc2-db696.61` — needs a live run and a cost/quality decision.
- `mc2-db696.11.6` — needs disposable staging resources and an approved LLM budget.

## Safety boundary

Do not perform reindex, schema migrations, secrets/access changes, or force-push. Deploy only under
the standing authorization and only on a green pipeline. Do not run live paid work without a
specific current budget/authority.

Do not touch `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`,
`mc2-1nots`, or `mc2-5e4ek.1`; see §9 of the active spec for exact reopen gates.

## Explicit defers

- `mc2-3gz2m` — unreadable vector diagrams; gated on
  `specs/025-remaining-debt/research-prompt.md`.
- `mc2-jz6y0.13.6`, `mc2-db696.61`, `mc2-db696.11.6` — owner decisions above.
- `mc2-p2908.1` — trace the existing Node `DEP0169 url.parse()` warning emitted by Next.js
  page-data workers during an otherwise successful production build.
- Separate deploy accounts and narrower sudoers — intentionally not planned after `mc2-q1ggs`;
  reconsider only if another regular production operator appears.
- `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`, `mc2-1nots`,
  `mc2-5e4ek.1` — excluded by §9, with repository or owner gates already recorded.

## Next recommended

Next stage id: `mc2-2vtmk`
Recommended action: inspect the dead `claude-deploy` GHCR credential and identify the smallest
repair that stays within §9; stop before any secret, access, or production change.

## Starter prompt for next orchestrator

Use $orchestrator-stage for the current Codex task.

Continue in exact spec order at `mc2-2vtmk`. Inspect repository and recorded host evidence first,
but stop before any secret, access, or production change prohibited by §9. Do not start
`mc2-3gz2m` or any other §9 work.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
