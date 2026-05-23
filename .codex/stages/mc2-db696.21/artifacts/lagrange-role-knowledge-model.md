---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-db696.21
stage_id: mc2-db696.21
agent_type: explorer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Role knowledge-base modeling has multilingual, ranking, and future taxonomy implications.
repo: /home/me/code/mc2
branch: codex/career-playbook-role-suggestions
base_branch: origin/develop
base_commit: 17e826ee49ca862857cc832c562daf525a28211e
worktree: /home/me/code/mc2
write_zone:
  - read-only
success_criteria:
  - Propose a practical local data shape and search ranking for role suggestions.
selected_docs:
  - accepted mc2-db696.20 role knowledge-base artifact
  - ESCO/O*NET/ISCO/Lightcast evaluation summary
selected_skills:
  - ux-researcher-designer
  - senior-architect
selected_agents:
  - Lagrange
catalog_candidates:
  - none - installed skills and accepted artifacts were sufficient
parallel_group: 2-role-knowledge-model
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only spawned thread; no child branch or workspace to clean.
risk_level: medium
verification:
  - Orchestrator implemented and tested data shape, ranking, locale fallback, and grouping: passed
changed_files:
  - none
explicit_defers:
  - none
---

# Summary

Lagrange recommended a curated local role model with stable ids, departments, groups, seniority, RU/EN labels, aliases, acronyms, keywords, popularity rank, locale priority, and `source: curated`.

# Scope / Routing

The stream stayed read-only and did not re-open catalog discovery. Its output guided `role-title-suggestions.ts`, including popular suggestions, acronym ranking, alias search, alternate-language lookup, and department grouping.

# Verification

The orchestrator added data tests covering seed breadth, stable ids, popular ordering, `pm` acronym ranking, Russian developer aliases, alternate-language lookup, and grouping.

# Delivery / Cleanup

The accepted model was manually integrated in the local branch. The spawned thread was read-only, so no branch or worktree cleanup was required.

# Risks / Follow-ups / Explicit Defers

Large ESCO/O\*NET/ISCO/Lightcast imports remain deferred. A future ESCO subset should be build-time/import-time only with explicit attribution and fallback policy.
