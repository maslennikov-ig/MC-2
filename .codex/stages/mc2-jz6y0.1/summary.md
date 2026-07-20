---
stage_id: mc2-jz6y0.1
task_id: mc2-jz6y0.1
status: closed
branch: codex/self-hosted-qdrant-platform-plan
delivery_method: pushed-feature-branch
---

# Self-Hosted Qdrant Planning Stage

## Scope

- Audited current Qdrant application, test, Compose, deployment, and operations contracts.
- Compared useful OSS/self-hosted capabilities with the broken Cloud dependency.
- Wrote the approved architecture design, task-by-task execution plan, and a prompt-card for a fresh root orchestrator.
- Created implementation epic `mc2-jz6y0`; no runtime, cloud, dev, or staging mutation was performed.

## Routing

- Classification: complex, docs-sensitive, handoff-prone planning stage.
- Selected skills: `orchestrator-stage`, `task-router`, `superpowers:brainstorming`, `senior-architect`, `superpowers:writing-plans`, `prompt-authoring`, `verification-before-completion`, `orchestration-closeout`.
- Documentation: current official Qdrant installation, BM25, Query API/Formula, indexing, aliases, strict mode, snapshots, monitoring, security, and Web UI docs.
- Knowledge graph: read `graphify-out/GRAPH_REPORT.md` and ran a focused Qdrant query before code-path inspection.
- Selected agents/personas: none for this planning-only stage; the user asked for a manual prompt for a new orchestrator, not an active delegated implementation.
- Catalog candidates: none; installed skills and first-party docs covered the task.

## Parallel Decomposition

| Stream   | Goal                                             | Owner | Write zone          | Dependencies    | Verification                | Decision   | Reason                                |
| -------- | ------------------------------------------------ | ----- | ------------------- | --------------- | --------------------------- | ---------- | ------------------------------------- |
| Design   | settle useful self-hosted scope and defers       | local | design spec         | repo/docs audit | spec self-review            | sequential | plan depends on final contracts       |
| Plan     | map design to files, TDD, gates, rollout         | local | implementation plan | design          | coverage/placeholder scan   | sequential | exact interfaces depend on design     |
| Prompt   | make the plan executable by a fresh orchestrator | local | prompt-card         | design + plan   | `orch-prompts prompt-check` | sequential | prompt must reference final artifacts |
| Closeout | Beads, handoff, graph, delivery                  | local | `.codex`, Beads     | all artifacts   | stage closeout              | sequential | final truth depends on verification   |

## Outputs

- `docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md`
- `docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md`
- `docs/superpowers/prompts/2026-07-10-self-hosted-qdrant-orchestrator.md`

## Verification

- Prompt check: `orch-prompts prompt-check --runtime codex --profile gpt-5.6 --kind prompt-card --file docs/superpowers/prompts/2026-07-10-self-hosted-qdrant-orchestrator.md` passed at 5,996 characters.
- Placeholder/debt-marker scan over all three artifacts returned no matches.
- `git diff --check` passed before closeout.
- E2E/smoke: not applicable; this stage changes planning/orchestration documentation only and explicitly forbids runtime mutation.

## Delivery

- Commit: `77e3ebf4` (`docs(qdrant): add self-hosted implementation handoff`).
- Branch: `origin/codex/self-hosted-qdrant-platform-plan`.
- Beads: planning child `mc2-jz6y0.1` closed; implementation epic `mc2-jz6y0` remains open; obsolete Cloud endpoint bug `mc2-db696.86` closed as superseded.

## Documentation

- docs-reviewed: updated - durable architecture, implementation, routing, operator handoff, and project navigation are now recorded.
- project-index: updated - added stable locations for Superpowers specs, plans, and orchestrator prompts.
- graph-reviewed: updated - `graphify update .` rebuilt 52,566 nodes / 76,938 edges; `graphify cluster-only . --no-viz` refreshed communities/report locally. Cluster-only warned about a 10-node fuzzy-dedup reduction and did not require a force overwrite; no external semantic backend or Git hooks were used.

## Next Stage

- Next stage id: `mc2-jz6y0`.
- Recommended action: launch the fresh root orchestrator from the validated prompt-card and implement Q1-Q11 before requesting Q12 staging authorization.
- Starter prompt: `docs/superpowers/prompts/2026-07-10-self-hosted-qdrant-orchestrator.md`.

## Explicit Defers

- Staging cutover, live reindex, remote secrets, timer activation, and live smoke require explicit authorization in implementation Task Q12.
- Multi-node HA, quantization, on-disk hot indexes, custom sharding, JWT RBAC, and language-specific sparse fields remain measured capacity/product triggers in the design.
