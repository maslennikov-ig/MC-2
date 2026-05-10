# Repository Guidelines

`AGENTS.md` is the primary portable contract for this repository. Read it first, then read `.codex/orchestrator.toml`, then `.codex/handoff.md`.

## Repository Shape

- Single-repo pnpm monorepo with:
  - `packages/web` — frontend
  - `packages/course-gen-platform` — backend/platform
  - `packages/shared-types` — shared contracts
- Delivery defaults:
  - `develop` is the dev delivery branch
  - `master` is the staging branch
  - `/push-dev` is the normal dev delivery path
  - `/push` is the release/version flow
  - `/deploy` is the staging deploy flow

## Canonical Verification

Use the repo-local verification commands from `.codex/orchestrator.toml`.
Use `scripts/orchestration/run_process_verification.sh` as the process-verification entrypoint before claiming the orchestration layer is in a good state.
Use `scripts/orchestration/run_stage_closeout.py --stage <stage_id>` when a stage is actually closing; it is the canonical two-phase closeout entrypoint.

Typical code-change gates in this repo include:

- `pnpm type-check`
- `pnpm build`

## Autonomy Policy

- Act without asking on reversible local work: reading files, editing tracked repo files, updating repo-local orchestration docs, running local verification, and updating Beads when task truth is clear.
- Ask before destructive, hard-to-reverse, or high-impact externally visible actions that are not already explicitly required by the repo contract.
- Always ask before deploys, prod/staging mutations, permission scope expansion, force-push/history rewrite, or when requirements remain materially ambiguous.

## Safety Boundaries

- Import shared contracts only from `@megacampus/shared-types`.
- Never hardcode credentials or store unsafe env values in tracked files.
- Prefer isolated worktrees or feature branches for delegated or parallel streams; do not treat the dirty primary worktree as a safe delegation baseline.
- Do not leave silent technical debt. Fix in-scope issues before close; any justified defer must be explicit, bounded, tracked in Beads, and listed in `.codex/handoff.md` under `Explicit defers`.

## Operational State

- `.codex/orchestrator.toml` is the machine-readable repo-local contract.
- `.codex/handoff.md` is current-state only.
- `.codex/stages/<stage_id>/summary.md` stores tracked stage summaries.
- `.codex/stages/<stage_id>/artifacts/<task_id>.md` stores tracked delegated artifacts.
- `.codex/manual-agent-prompt-template.md` is the prompt skeleton for user-launched delegated streams.
- The delegated completion inbox lives in shared git-common-dir runtime state so parallel worktrees report into one repo-local queue.
- Completion-inbox state is transport/review state, not task truth.
- `.codex/agent-reports/` is the legacy local-only pre-v2 archive.
- `scripts/orchestration/validate_artifact.py` validates tracked artifacts.
- `scripts/orchestration/check_stage_ready.py <stage_id>` is the minimal hard stop before stage close.
- `scripts/orchestration/run_stage_closeout.py --stage <stage_id>` runs stage-close verification before delivery.
- `scripts/orchestration/cleanup_stage_workspace.py --stage <stage_id>` removes safe local worktrees and branches for completed stage deliveries.
- `scripts/orchestration/report_child_completion.py` records delegated completion events.
- `scripts/orchestration/review_completion_inbox.py` shows unread completion events and review decisions.
- Beads remains the source of truth for queue, status, and dependencies.
