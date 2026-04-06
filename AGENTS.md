# Repository Guidelines

## Orchestration

Uses **Gastown** (`gt`) + **Beads** (`bd`). Global tools at `~/gt/`.

Multi-runtime: `claude` (default), `codex`, `gemini` — all subscription-based.

## Workflow

```bash
bd ready                              # Find work
bd update <id> --status in_progress   # Claim
# ... work ...
bd close <id> --reason "Done"         # Close
git commit -m "..."                   # Prepare change
/push-dev --yes                       # Deliver to develop -> Dev
```

## Stack

Next.js 15, TypeScript 5.x strict, tRPC, BullMQ, Supabase, pnpm workspaces.

Packages: `web` (frontend), `course-gen-platform` (backend), `shared-types` (contracts).

## Rules

- `pnpm type-check && pnpm build` before commit
- Import types from `@megacampus/shared-types` only
- Never hardcode credentials
- Work on feature branches or `develop`; use `/push-dev` to merge/push into `develop` for Dev delivery
- `/push` is release/version tooling, not the Dev delivery path
- Follow conventional commits: `type(scope): summary`

## Session End

```bash
git status && git add <files> && git commit -m "..."
/push-dev --yes
bd close <id> --reason "..."
```

## Codex Skills

- Superpowers installed globally at `~/.codex/skills/superpowers`
- If `Skill` tool unavailable, load `SKILL.md` directly
- Keep instructions short and action-focused
