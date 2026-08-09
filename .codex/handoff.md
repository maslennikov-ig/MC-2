# Orchestrator Handoff

Updated: 2026-08-09. Effective kernel: `shared-orchestration/v1`.
Current stage id: `mc2-2vtmk`

## Current stage

`mc2-2vtmk` is active. A read-only production probe as `claude-deploy` UID 1000 returned `denied`
for the current immutable private API image. It did not pull layers or expose credential/config
content. The issue is current, but the old claim that a PAT expired was imprecise.

Root cause: CI passed its job-scoped `GITHUB_TOKEN` to both deploy scripts, and `docker login` wrote
the token to the account's persistent config. That config was modified at `2026-08-08T11:29:49Z`,
inside successful run `31254580512` job `Deploy to Dev` (`11:29:22–11:31:29Z`). GitHub expires the
job token after the job. Commit `63b4e2efd` isolates CI login in a private temporary Docker config;
commit `38cf560d5` limits both deploy jobs to `contents: read` and `packages: read`. Focused tests,
type-check, build, and independent security re-review pass. Neither commit is pushed or deployed.

Do not install the replacement PAT until `63b4e2efd` is delivered on a green pipeline; the current
host scripts would overwrite it on the next deploy. After delivery, create a classic PAT with only
`read:packages`, install it via stdin as `claude-deploy`, and accept with the same manifest probe.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order. The checked backlog
contains 49 work items plus 5 epics; do not re-open the 27 already closed with a commit or a
measurement, and do not re-rank by tracker priority.

Tier 1 is complete through `mc2-sznhi`; Tier 2 is complete through `mc2-3sz3d`; Tier 3 is complete
through `mc2-q1ggs`. Work is active on `mc2-2vtmk` in exact spec order.

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

Do not perform reindex, schema migrations, force-push, or any secrets/access change outside the
explicitly authorized `mc2-2vtmk` GHCR credential repair. Deploy only under the standing
authorization and only on a green pipeline. Do not run live paid work without a specific current
budget/authority.

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

Active stage id: `mc2-2vtmk`
Recommended action: measure current `claude-deploy` GHCR access with a secret-safe manifest probe;
replace the credential only if denied, then prove the final state with the same probe.

## Starter prompt for next orchestrator

Use $orchestrator-stage for the current Codex task.

Continue the active `mc2-2vtmk` stage. The user authorized its read-only production check and, if
needed, credential reissuance. Keep the probe secret-safe and do not perform a deploy, image pull,
service mutation, root credential change, or any other §9 work.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
