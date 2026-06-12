# Subagent Spawn Template

Use this shape when the orchestrator launches a separate visible Codex subagent thread/run. Fill every block; use `none - <reason>` instead of omitting routing fields. Do not use this for inline chat-only delegation.

```md
Task ID: <beads-task-id>
Stage ID: <stage-id-or-n/a>
Agent Type: <worker|explorer|docs_researcher|skill_scout|custom-agent-name>
Agent Type To Spawn: <built-in-or-custom-agent_type, or none - reason>
Visibility: separate spawned Codex agent/thread/run; inline-only delegation is not allowed
Model: <inherit_orchestrator|explicit-model-id + authorization/reason>
Reasoning Effort: <inherit_orchestrator|role_default|low|medium|high|xhigh>
Model/Reasoning Rationale: <why this level is appropriate>

## Goal

<finished outcome in one short paragraph>

## Success Criteria

- <observable acceptance check>
- <observable acceptance check>

## Documentation

- <Docs L1/L2 source: @neuledge/context package@version first; Context7/first-party fallback only if L1 miss/stale/insufficient; or: No dependency documentation lookup needed.>

## Asset Routing

- Selected docs: <docs/source or none - reason>
- Selected skills: <skill name/path or none - reason>
- Selected agents/personas: <agent/persona or none - reason>
- Agent type to spawn: <built-in/custom agent_type or none - reason>
- Skill items to attach: <exact SKILL.md paths for structured skill items, or none - reason>
- Catalog candidates: <candidate/status or none - reason>
- Do not run fresh asset discovery unless these assets are unavailable or a specialist blocker appears.
- When the runtime supports structured launch items, attach the selected SKILL.md paths as `skill` items instead of only mentioning them in text.

## Context And Ownership

- Workspace root: <absolute path>
- Base branch: <branch-or-n/a>
- Base commit: <sha-or-n/a>
- Branch/worktree: <dedicated branch/worktree, or explicit shared-workspace exception>
- Parallel group: <matrix stream id and sibling streams, or none - sequential/local>
- Write zone: <files/modules owned by this stream>
- Read context: <files/docs/artifacts to inspect>
- You are not alone in the codebase; do not revert unrelated edits and adapt to concurrent changes.

## Verification

- Run: <exact command>
- If blocked, report the blocker and impact.

## Output Contract

- Changed files:
- Documentation impact: <none|tests-only|refactor|behavior|structural|api-contract|migration|ops-deploy|docs-only>
- Docs review note: <smallest needed docs update, or no-change reason>
- Verification evidence:
- Explicit defers:
- Artifact path: <path-or-n/a>
- Completion event: <command-or-n/a>

## Stop Rules

Return blocked or ask if scope expands, ownership conflicts, docs/assets are unavailable, verification cannot run, or the change would create untracked debt.
```
