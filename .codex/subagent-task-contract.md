# Subagent Task Contract

Use this contract when the orchestrator launches a built-in Codex subagent for a delegated stream.
The launch must create a separate visible Codex agent thread/run with a role/name. Inline chat-only delegation is not an acceptable `codex_subagents` launch.
Keep prompts outcome-first and compact; the subagent chooses the implementation approach inside these boundaries.
Use `.codex/subagent-spawn-template.md` as the concrete prompt shape.

## Required Prompt Blocks

- Task ID: Beads task id/reference for any write-heavy, delegated, long-running, or handoff-prone stream.
- Role: `worker` for bounded implementation/fixes, `code_mapper` for read-heavy codebase mapping, `docs_researcher` for version-sensitive docs, or another selected custom agent.
- Agent type to spawn: the exact built-in or custom `agent_type`; specialist roles are custom agent TOML files, not `AGENTS.md`.
- Visibility: separate spawned Codex agent thread/run; never inline-only.
- Model/reasoning: inherit by default; choose reasoning by complexity/risk; set explicit model only with current user authorization or a clear task-specific reason; record the rationale.
- Goal: finished outcome in one short paragraph.
- Success criteria: observable checks that decide acceptance.
- Documentation: Docs L1/L2 when dependencies, APIs, CLIs, or platform behavior matter: query `@neuledge/context` first with lockfile-routed package/version; use Context7 MCP or first-party docs as fallback only when L1 is missing, stale, or insufficient. Otherwise state `No dependency documentation lookup needed.`
- Asset Routing: selected docs, skills, agents/personas, agent type to spawn, skill items to attach, catalog candidates, or `none - <reason>` for each category. Do not omit this block.
- Skill items to attach: exact selected `SKILL.md` paths for structured `skill` items when the runtime supports them; text-only mentions are fallback.
- Parallel context: matrix stream id, sibling streams, and any sequencing/dependency boundaries.
- Ownership: write zone, read context, base branch/commit, dedicated branch/worktree for write-heavy workers unless the repo contract explicitly permits shared workspace, and unrelated-file limits.
- Verification: exact commands to run, plus blocked-command reporting.
- Output contract: changed files, verification evidence, blockers, explicit defers, and artifact/completion event when the repo defines them.
- Documentation impact: classify whether the stream changes stable docs needs (`none`, `tests-only`, `refactor`, `behavior`, `structural`, `api-contract`, `migration`, `ops-deploy`, or `docs-only`) and report the smallest needed docs update or no-change reason.
- Stop rules: ask or return blocked on unsafe scope expansion, missing docs, unclear protected boundaries, failed validation, or untracked debt.

## Worker Rules

- Workers are not alone in the codebase. They must not revert unrelated edits and must adapt to concurrent changes.
- Write-heavy streams own a disjoint write zone. If ownership conflicts appear, return blocked or ask the orchestrator to replan.
- Parallel workers must stay inside their assigned stream and must not opportunistically implement sibling-stream scope.
- Workers use the docs, skills, agents, attached skill items, and catalog candidates selected by the orchestrator. Do not run fresh asset discovery unless the selected assets are unavailable or a specialist blocker appears.
- Workers must stay within the assigned model/reasoning contract; if the assigned level is insufficient, return blocked and ask the orchestrator to replan instead of silently expanding scope.
- Details belong in the artifact or final summary, not a long chat transcript.
- Completion events are return signals only; the orchestrator still reviews diffs, artifacts, and verification before acceptance.

## Artifact Defaults

- Use `.codex/stage-artifact-template.md` when a delegated stream changes files or the repo contract requires artifacts.
- Record `agent_type`, model, reasoning effort, model/reasoning rationale, selected assets, write zone, success criteria, and documentation impact in the artifact so the orchestrator can verify scope compliance.
- Leave `delivery_method: not accepted`, `accepted_by_orchestrator: no`, `cleanup_status: pending`, and `cleanup_notes: awaiting orchestrator acceptance` until the orchestrator reviews the stream.
- Include `explicit_defers`; use `none` only when no justified defer exists.
- Do not leave new `TODO/FIXME/HACK/XXX` markers unless they are explicitly tracked as a defer.
