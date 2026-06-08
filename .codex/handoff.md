# Orchestrator Handoff

Updated: 2026-06-08
Stage: `mc2-xevm1`
Branch: `codex/career-playbook-source-evidence`

## Current State

- Career Playbook source evidence adaptation is implemented in the current branch.
- Business Context source evidence now prefers full Docling markdown from `file_catalog.markdown_content`; `processed_content` remains summary overview or fallback.
- Follow-up/spec-builder prompt input keeps the compatibility key `business_context_source_excerpts`, but the prompt wording and payload now describe a source evidence pack.
- Source evidence is trimmed by an aggregate 250,000 estimated-token budget across selected sources.
- Regression tests cover markdown-over-summary preference, budget trimming, markdown-first under tight budget, source-load fallback, and follow-up prompt propagation.
- Other worktree `/home/me/code/mc2-worktrees/career-playbook-business-context` remains untouched.

## Verification

- Passed: Career Playbook backend targeted tests — 18 tests.
- Passed: Career Playbook backend broad subset — 61 tests.
- Passed: `pnpm --filter @megacampus/course-gen-platform type-check`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.
- Passed: `git diff --check`.

## Next recommended

Next stage id: `mc2-db696.61`
Recommended action: finish closeout, commit, push `codex/career-playbook-source-evidence`, then merge/deploy only after explicit delivery request.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/stages/mc2-xevm1/summary.md`, Beads `mc2-xevm1`, `mc2-db696.61`, `mc2-db696.62`, and Graphify report. Continue from branch `codex/career-playbook-source-evidence`. Do not touch `/home/me/code/mc2-worktrees/career-playbook-business-context`.

## Delivery

- docs-reviewed: updated - `docs/career-playbook/architecture.md` documents Docling markdown source evidence, summary overview/fallback, 250k aggregate token budget, and unavailable source-content warnings.
- graph-reviewed: updated - `graphify update .` and `graphify cluster-only . --no-viz` completed successfully.
- Delivery requested: not yet.

## Explicit defers

- `mc2-db696.61` tracks evaluating whether follow-up generation should use a smaller/sharper source evidence budget than spec-builder.
- `mc2-db696.62` tracks passing rendered prompt token count into Career Playbook model routing and adding context-window guards.
