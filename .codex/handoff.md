# Orchestrator Handoff

Updated: 2026-04-06
Current baseline branch: `develop`
Current baseline commit at handoff creation: `bdcd69bae3dc8e2d666940325ad230e6a2b6a3ad`

## Current repo state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Repo-local Beads is already initialized under `.beads/`.
- Existing local `.codex/config.toml` was reviewed and left untouched; it only sets shell environment policy.
- Repo-local orchestration contract now lives in `.codex/orchestrator.toml`, with factual session state in `.codex/handoff.md`.
- Delegated agent reports are intended to be local operational artifacts under `.codex/agent-reports/`, not normal tracked project files.
- The primary worktree is not a clean execution baseline:
  - local `.beads` state changes are present
  - `CLAUDE.md` already had an unrelated local modification before this orchestration batch
- Prefer isolated worktrees/branches for delegated or parallel execution streams.

## Delivery and workflow truth

- Day-to-day engineering happens from `develop`.
- Dev deploys target `https://dev.ai.megacampus.ru`.
- Staging deploys target `https://ai.megacampus.ru`.
- `/push` remains the release/version command.
- Dev delivery is normalized through `/push-dev`, which promotes the current branch into `develop` and pushes `develop`.

## Open ready follow-ups

- `mc2-dqbw1` — Lesson Inspector does not reliably show Stage 6 lesson content in the generation graph workflow.
- `mc2-ux7aq` — Generation graph should surface `review_required` lessons explicitly as a needs-review state.

## Current Stage 6 factual findings

- Stage 6 can legitimately finish lessons in `review_required`, but the current generation UI does not surface that state clearly to operators.
- The current generation preview path selects the latest `lesson_contents` row blindly, which can let a later empty or non-usable row hide an older usable `completed` version.
- Real course evidence was gathered on course slug `cozdanie-i-razvitie-korporativnyh-sotsial-nyh-setey-6da4d0ea`.

## Operational caveats

- Beads embedded storage showed intermittent local lock contention during investigation:
  - `another process holds the exclusive lock on /home/me/code/mc2/.beads/embeddeddolt`
- Treat `bd ready`/search/list results in the primary worktree as operationally useful but not guaranteed conflict-free when multiple local sessions are active.
- If Beads lock contention becomes a recurring blocker, create a separate follow-up instead of widening unrelated execution stages.

## Next recommended stage

- Run the next Stage 6 UI batch as separate manual-launch streams:
  - `mc2-ux7aq` for `review_required` visibility and operator UX
  - `mc2-dqbw1` (or a scoped child follow-up) for latest-usable-content resolution in Lesson Inspector preview

## Rules for the next orchestrator

- Read `AGENTS.md`, `README.md`, `CLAUDE.md`, `.codex/orchestrator.toml`, and `.codex/handoff.md` before planning or delegation.
- Do not assume a delegated stream is active until the user explicitly launches it.
- Keep reviews findings-first and treat review/verification as a corrective loop.
- Do not use the dirty primary worktree as the baseline for parallel agent execution when an isolated worktree is available.
- Keep secrets, access tokens, and server-only operational details out of tracked `.codex` files.
