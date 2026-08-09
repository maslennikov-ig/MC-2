# Orchestrator Handoff

Updated: 2026-08-09. Effective kernel: `shared-orchestration/v1`.
Current stage id: `mc2-db696.79`

## Current stage

`mc2-5dzld`, `mc2-zt4ju`, `mc2-n6szm`, `mc2-1mmop`, and `mc2-iioip` are delivered locally in
commits `858e4a707`, `05d7fc7e7`, `e1857fadc`, `9d48cbfcc`, and `7d8e4b8eb` and closed in Beads.
The shared `mc2-iioip` implementation is accepted in orchestration-console branch
`codex/prompt-check-markdown-headings` at `fada910`; its integration remains pending until the
accessible backlog is complete. `mc2-db696.57`, `mc2-db696.60`, and `mc2-db696.78` are delivered
locally in `968d8d513`, `22234881b`, and `99e839520`. The active item `mc2-db696.79` forwards the
Career Playbook source language into Phase 6 without treating a playbook id as a course id.

The previous off-host Qdrant stage is delivered and deployed through green pipelines. Production
health is green, `helixa-new` retains three verified generations under the 14-day/14-copy bound,
and both backup and restore timers remain enabled.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order. The checked backlog
contains 49 work items plus 5 epics; do not re-open the 27 already closed with a commit or a
measurement, and do not re-rank by tracker priority.

Tier 1 is complete through `mc2-sznhi`; Tier 2 is complete through `mc2-3sz3d`; Tier 3 is complete
through `mc2-jz6y0.13.6`; Tier 4 is complete through `mc2-iioip`. Tier 5 is active at
`mc2-db696.79` after `mc2-db696.78` and the research/migration gate review.

## Verification facts

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

Accepted stage id: `mc2-db696.78`
Current stage id: `mc2-db696.79`
Next stage id: `mc2-5e4ek.2`
Recommended action: accept and close the Career Playbook source-language fix, then inspect the next
Tier 5 item against repository truth.

## Starter prompt for next orchestrator

Use $orchestrator-stage for the current Codex task.

The item `mc2-db696.79` has green unit, lint, type-check, and build evidence awaiting stage closeout
and commit. Then continue with `mc2-5e4ek.2`. Do not reindex, migrate, force-push, perform paid
work, or deploy before a green pipeline.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
