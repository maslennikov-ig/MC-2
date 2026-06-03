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
- `.codex/subagent-spawn-template.md` is the prompt skeleton for Codex subagents; `.codex/manual-agent-prompt-template.md` is fallback only.
- `.codex/agent-reports/` is the legacy local-only pre-v2 archive.
- `scripts/orchestration/validate_artifact.py` validates tracked artifacts.
- `scripts/orchestration/check_stage_ready.py <stage_id>` is the minimal hard stop before stage close.
- `scripts/orchestration/run_stage_closeout.py --stage <stage_id>` runs stage-close verification before delivery.
- `scripts/orchestration/cleanup_stage_workspace.py --stage <stage_id>` removes safe local worktrees and branches for completed stage deliveries.
- Beads remains the source of truth for queue, status, and dependencies.

## Knowledge Graph

- This repo uses a local Graphify graph under `graphify-out/`; read `graphify-out/GRAPH_REPORT.md` before broad search for architecture, impact, or unfamiliar code.
- Use focused `graphify query`, `graphify path`, or `graphify explain`; do not paste `graphify-out/graph.json` into chat context.
- The project-local Codex `PreToolUse` hook that runs `graphify hook-check` is allowed for Bash reminders.
- Do not install Graphify git hooks or configure external semantic/model backends unless explicitly asked.
- During closeout, record `graph-reviewed: used`, `graph-reviewed: updated`, `graph-reviewed: no-change-needed`, or `graph-reviewed: blocked`.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
