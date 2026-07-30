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

Use `scripts/orchestration/check_stranded_commits.py` before claiming that finished work is delivered. It reports commits that exist only on a side branch and never reached `develop`, matching by commit subject because cherry-pick and squash change sha, tree and patch-id. Closing a Beads issue proves intent, not delivery; on 2026-07-27 an audit found three finished, reviewed, closed changes stranded for weeks. `/push-dev` runs it as an advisory step after delivery. Knowingly undelivered branches belong in `.codex/stranded-commit-allowlist.txt` with a recorded reason.

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
- `scripts/orchestration/check_stranded_commits.py` detects undelivered work; `.codex/stranded-commit-allowlist.txt` records the branches that are knowingly not in `develop` and why.
- Beads remains the source of truth for queue, status, and dependencies.

## Knowledge Graph

- This repo uses a local Graphify graph under `graphify-out/`; read `graphify-out/GRAPH_REPORT.md` before broad search for architecture, impact, or unfamiliar code.
- Use focused `graphify query`, `graphify path`, or `graphify explain`; do not paste `graphify-out/graph.json` into chat context.
- The project-local Codex `PreToolUse` hook that runs `graphify hook-check` is allowed for Bash reminders.
- Do not install Graphify git hooks or configure external semantic/model backends unless explicitly asked.
- During closeout, record `graph-reviewed: used`, `graph-reviewed: updated`, `graph-reviewed: no-change-needed`, or `graph-reviewed: blocked`.
- Graphify refresh policy: read-only audits only read/query; after code/docs/architecture/durable workflow changes, refresh the local graph during closeout when ownership/worktree state is safe, otherwise record `graph-reviewed: blocked` or `graph-reviewed: no-change-needed` with a concrete reason. Do not use external semantic/model/API modes or Graphify git hooks without explicit approval.

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

- Task truth for engineering work lives in `bd`. `TodoWrite` is allowed for in-session skill checklists; it is not a task tracker and does not replace `bd`.
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for cross-session project facts. The harness `MEMORY.md` remains the primary memory store — both are in use, neither is banned.

## Session Completion

**When ending a work session**, follow the repo delivery contract and current user authorization. Remote pushes are not automatic.

**WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Deliver when authorized** - `bd dolt push`, then ordinary `git push` only after fresh verification passes and a fetch proves the remote is not ahead or diverged
5. **Clean up** - Clear stashes, prune remote branches
6. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Use `bd` for task truth when available.
- Run quality gates before completion claims.
- Ordinary commits and ordinary push are allowed after fresh verification/closeout when the repo contract or current user request authorizes delivery. Before push, fetch and stop if remote is ahead/diverged, branch/protected-target is unclear, or uncommitted/staged scope is unsafe. Subagents may commit/push only their assigned branch/worktree when explicitly allowed by task/contract, never directly to protected/base branches.
<!-- END BEADS INTEGRATION -->
