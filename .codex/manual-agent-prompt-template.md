# Manual Agent Prompt Template

Use this template when the orchestrator prepares a prompt and the user launches the agent manually.

## Structure

```md
<one-line task title>

Task ID: <beads child task id>
Stage ID: <current stage id>

## Context

- Workspace root: <absolute path>
- Repo: <repo-or-n/a>
- Base branch: <name>
- Base commit: <sha>
- Dedicated worktree: <absolute path>
- Artifact path: <absolute path>
- Relevant contract files:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
- Prior artifacts / related links:
  - <absolute path or issue/comment link>

## Goal

<1 short paragraph with the exact expected outcome>

## Scope

- <flat bullets with what is in scope>
- <flat bullets with what is explicitly out of scope>

## Strict Write Zone

- <exact file/path set>
- Do not touch unrelated files.
- You are not alone in the codebase; do not revert others' work.

## Verification

- Run: `<exact command>`
- Run: `<exact command>`
- If a command is blocked by environment, state that explicitly in the artifact.

## Hard Requirements

1. <non-negotiable requirement>
2. <non-negotiable requirement>
3. <non-negotiable requirement>
4. If the orchestrator sends a follow-up correction for this same task, continue in the same task / branch / worktree unless the orchestrator explicitly tells you to split or reset the stream.
5. After writing the artifact, emit a completion event with `python3 scripts/orchestration/report_child_completion.py ...`. The event is the canonical return signal to the orchestrator.

Treat these as hard requirements, not nice-to-haves.

## Completion Event

After the artifact is ready, run:

`python3 scripts/orchestration/report_child_completion.py --task <task_id> --stage <stage_id> --artifact <artifact_path> --status <returned|blocked> --commit <commit_hash_or_n/a> --verify <passed|failed|blocked> --clean <yes|no>`

If event reporting is blocked, say so explicitly in the artifact and in the final chat line.

## Completion Format

Keep the final chat reply to 1-2 short lines for human visibility only. Put detailed narrative in the artifact, not in chat. The orchestrator should rely on the completion event, not on manual copy-paste.

Line 1:
`TASK <task_id> | STATUS <returned|blocked> | EVENT <recorded|failed> | ARTIFACT <artifact_path>`

Line 2:
Optional only when needed:
`NOTE: <one short blocker / defer / review warning sentence>`
```

## Notes

- Use this as a skeleton. Add repo-specific delivery rules, changelog rules, or PR rules when the repo contract requires them.
- Keep the chat reply short and uniform; it is a visibility hint, not the acceptance channel.
