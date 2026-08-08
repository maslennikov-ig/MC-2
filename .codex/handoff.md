# Orchestrator Handoff

Updated: 2026-08-08. Effective kernel: `shared-orchestration/v1`.
Current stage id: `mc2-dqbw1`

## Current stage

`mc2-dqbw1` is accepted locally. Product commit `7b29f9d29` makes Lesson Inspector clear loading
when auth resolves without a session while preserving the existing authenticated fetch. Focused
web TDD passed 1/1 after failing against the old behavior; `pnpm run type-check`, `pnpm run build`,
and canonical process verification passed.

This does not reproduce or settle the historical report from a valid superadmin session. That
separate cause requires a running application and Network trace.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order. The checked backlog
contains 49 work items plus 5 epics; do not re-open the 27 already closed with a commit or a
measurement, and do not re-rank by tracker priority.

After `mc2-dqbw1`, continue Tier 1 in exact spec order:

1. `mc2-sznhi` — make the teaser guard work outside ru/en.

Tier 2 then starts with `mc2-3sz3d`, the false-green backend test bootstrap.

## Verification facts

- The default backend Vitest command is not evidence: `tests/global-setup.ts:20` fails the Qdrant
  version check and then reports “No test files found, exiting with code 0”. Until `mc2-3sz3d` is
  fixed, use `vitest.config.unit.ts` for focused backend unit tests and state that distinction.
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

Next stage id: `mc2-sznhi`
Recommended action: make the teaser guard enforce the intended behavior outside `ru` and `en`,
using repository-owned locale handling and focused tests before the standard code gates.

## Starter prompt for next orchestrator

Use $orchestrator-stage for `mc2-sznhi`. Read `specs/026-post-triage-priorities/spec.md` first,
preserve its order, and make the teaser guard work outside `ru` and `en`. Do not start
`mc2-3gz2m` or any §9 work.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
