# Orchestrator Handoff

Updated: 2026-08-08. Effective kernel: `shared-orchestration/v1`.
Current stage id: `mc2-3sz3d`

## Current stage

`mc2-3sz3d` is accepted locally. Product commit `f2eab74db` makes the default backend Vitest config
reject empty runs, makes cleanup failures force exit 1, and allows only
`SKIP_QDRANT_TEST_SETUP=1` to skip the Qdrant precondition while retaining worker startup.

Focused TDD passed 21/21 after 8 checks failed against the old behavior. The safe loopback child
process, `pnpm run type-check`, `pnpm run build`, and canonical process verification passed. The
historical configured-environment exit 0 was not rerun because Qdrant bootstrap may mutate live
state if its precondition starts passing.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order. The checked backlog
contains 49 work items plus 5 epics; do not re-open the 27 already closed with a commit or a
measurement, and do not re-rank by tracker priority.

Tier 1 is complete through `mc2-sznhi`. Tier 2 is active at `mc2-3sz3d`, the false-green backend
test bootstrap, in exact spec order. The next item, `mc2-q1ggs`, is an owner decision and a stop
boundary.

## Verification facts

- The default backend Vitest command is now fail-closed: an unmet Qdrant precondition and an empty
  run exit nonzero. It still requires the pinned Qdrant 1.18.2 precondition unless the operator
  explicitly sets `SKIP_QDRANT_TEST_SETUP=1`; use `vitest.config.unit.ts` for focused unit tests.
- Web tests work.
- Typical code gates are `pnpm type-check` and `pnpm build`.
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

- `mc2-q1ggs` — separate deploy accounts, shared lock, or narrower sudoers.
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
- `mc2-q1ggs`, `mc2-jz6y0.13.6`, `mc2-db696.61`, `mc2-db696.11.6` — owner decisions above.
- `mc2-p2908.1` — trace the existing Node `DEP0169 url.parse()` warning emitted by Next.js
  page-data workers during an otherwise successful production build.
- `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`, `mc2-1nots`,
  `mc2-5e4ek.1` — excluded by §9, with repository or owner gates already recorded.

## Next recommended

Next stage id: `mc2-q1ggs`
Recommended action: stop for the owner to choose between separate deploy accounts, a shared
cross-process lock, or narrower sudoers before any implementation or production-facing action.

## Starter prompt for next orchestrator

Do not start implementation for `mc2-q1ggs` until the owner chooses the operating model required by
§8. Preserve the exact order in `specs/026-post-triage-priorities/spec.md`; do not start
`mc2-3gz2m` or any §9 work.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
