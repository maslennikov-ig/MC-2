Target: Codex / gpt-5.6, root engineering orchestrator
Audience: Codex task with access to `/home/me/code/mc2`

Goal:
Implement epic `mc2-jz6y0` end-to-end from the approved self-hosted Qdrant design and implementation plan. Deliver a secure, version-pinned, observable and recoverable self-hosted Qdrant platform; correct native BM25/RRF/Formula retrieval; verify locally; prepare staging activation; perform remote mutation only after explicit user authorization.

Success criteria:

- Tasks Q1-Q11 in the plan are implemented, reviewed, tested, committed and pushed on dedicated `codex/` branches/worktrees.
- Qdrant `1.18.2`, native multilingual BM25/IDF, complete priority payload, Formula Query, strict indexes, aliases, reindex, S3 snapshots/restore drill, Prometheus/Grafana/alerts and secure Web UI access satisfy the spec.
- Blocking focused tests, pinned integration, Compose validation, `pnpm type-check`, `pnpm build`, process verification and stage closeout pass.
- Staging cutover Q12 is either completed with explicit authorization and live evidence or remains an explicit blocked Beads child; no silent partial activation.

Context:

- Workspace: `/home/me/code/mc2`.
- Start from `origin/codex/self-hosted-qdrant-platform-plan`; resolve its current SHA before creating the implementation worktree.
- Read first: `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md`, and `docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md`.
- Old Cloud data was test-only and is lost. Do not attempt recovery or mutation; rebuild the derived index from available sources.
- Primary worktree may contain unrelated `.claude/settings.json` changes; do not alter or include them.

Execution contract:

1. Use `orchestrator-stage`, claim `mc2-jz6y0`, create Beads children for the plan's coherent streams, and publish the Parallel Decomposition Matrix before implementation.
2. Use `superpowers:subagent-driven-development` and `superpowers:test-driven-development`. Launch separate visible subagents for independent streams with dedicated branch/worktree, strict write zone, high reasoning for search/data/security work, artifacts, and exact verification. Review evidence and diffs before acceptance.
3. Execute tasks in dependency order from the plan. Do not weaken RU/EN relevance, strict-mode, restore, or isolation tests to make gates pass.
4. Use `test-pass`, `verification-before-completion`, then `orchestration-closeout`. Update docs, Graphify, Beads, stage artifacts/summary and current handoff. Push all accepted work per repo contract.
5. Before Q12, present exact remote actions, effects and rollback and obtain explicit current-task permission. Deploy, live reindex, secret changes and live mutation are outside pre-authorization.

Documentation:

- Qdrant official sources: installation, native BM25/full-text search, hybrid Query API/Formula, indexing, collections/aliases, administration/strict mode, snapshots, monitoring, self-hosted security, Web UI.
- Start at the URLs listed in the design's `Authoritative References`; re-check current pages before implementing version-sensitive request/config shapes.
- Use first-party Prometheus/Grafana/systemd docs for new operational configuration. Record consulted versions in the stage artifact.

Knowledge Graph:

- Graphify used: read `graphify-out/GRAPH_REPORT.md`; run focused `graphify query "Qdrant course embeddings upload search Stage 2 Stage 5 Stage 6" --graph graphify-out/graph.json --budget 2000` before broad code reads.
- Refresh with `graphify update .` and `graphify cluster-only . --no-viz` during closeout; do not enable external model/API extraction or Git hooks.

Asset Routing:

- Selected skills: `/home/me/.agents/skills/orchestrator-stage/SKILL.md`, `/home/me/.agents/skills/task-router/SKILL.md`, `/home/me/code/mc2/.agents/skills/senior-architect/SKILL.md`, `/home/me/code/mc2/.agents/skills/senior-devops/SKILL.md`, `/home/me/.agents/skills/test-pass/SKILL.md`, `/mnt/c/Users/masle/.codex/superpowers/skills/subagent-driven-development/SKILL.md`, `/mnt/c/Users/masle/.codex/superpowers/skills/test-driven-development/SKILL.md`, `/mnt/c/Users/masle/.codex/superpowers/skills/verification-before-completion/SKILL.md`, `/home/me/.agents/skills/orchestration-closeout/SKILL.md`, `/home/me/.agents/skills/prompt-authoring/SKILL.md`.
- Selected agents/personas: `docs_researcher` for version-sensitive first-party research; `worker` for bounded search/data implementation; `deploy_specialist` for Compose, backup and observability; `correctness_reviewer` for each accepted code stream; `docs_reviewer` before closeout.
- Agent types: choose the installed custom agent when its description matches; otherwise use the named built-in role. Inherit model; use high reasoning for architecture, data, security and review.
- Skill items to attach: attach the exact relevant `SKILL.md` paths above to each subagent when supported.
- Catalog candidates: none — installed skills and agents cover this task; do not repeat catalog discovery unless an assigned asset is unavailable.
- Child prompts follow `.codex/subagent-spawn-template.md`, including routing, ownership, verification, finding capture, artifact, completion event and stop rules.

Output:
Maintain `.codex/stages/mc2-jz6y0/` artifacts with findings, verification, changed files, docs impact and explicit defers. Report to the user in Russian: accepted outcomes, evidence, remaining activation gate, branch/commits/push, and rollback state.

Stop:
Stop and ask only when remote staging/prod mutation is next, required snapshot/alert secrets are unavailable, recoverable source gaps would change product truth, ownership conflicts cannot be isolated, or a required gate repeatedly fails after in-scope diagnosis. Continue all safe local implementation and documentation work before reporting such a blocker.
