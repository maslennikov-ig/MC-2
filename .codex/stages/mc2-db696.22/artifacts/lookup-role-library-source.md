---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-db696.22
stage_id: mc2-db696.22
agent_type: docs_researcher
subagent_model: inherit_orchestrator
reasoning_effort: medium
model_reasoning_rationale: Role source research needed authoritative source comparison but no code edits.
repo: /home/me/code/mc2
branch: codex/career-playbook-authoritative-roles-flow
base_branch: origin/develop
base_commit: a1a82bd317268fa8f507416bf17b62c03691147e
worktree: /home/me/code/mc2
write_zone:
  - read-only
success_criteria:
  - Evaluate practical occupation or role knowledge sources for RU/EN suggestions.
  - Recommend whether a ready library should be used for MVP.
selected_docs:
  - ESCO official pages and API/download notes
  - O*NET official database/API pages
  - ISCO official classification page
  - Lightcast API/access pages
  - OKZ official GostInfo/protect.gost.ru pages
selected_skills:
  - ux-researcher-designer
  - senior-architect
  - task-router
selected_agents:
  - Lookup visible docs_researcher
catalog_candidates:
  - none - source research did not require asset promotion
parallel_group: source-library
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only spawned thread; no child branch or workspace cleanup required.
risk_level: medium
verification:
  - Orchestrator documented recommendation and checked npm package candidates: passed
changed_files:
  - none
explicit_defers:
  - Full taxonomy import tracked as an explicit stage defer; no separate Beads task until scoped.
---

# Summary

Lookup found no open ready-made library that can be dropped into the MC2 constructor to provide robust multilingual RU/EN occupation autocomplete.

The accepted recommendation is a local source-aware index: OKZ for Russian classification when licensing/format are settled, O\*NET for English titles and alternates, ESCO for a multilingual EU backbone where available, and `mc2_overlay` for product-specific business variants such as B2B/B2C sales titles.

# Scope / Routing

The stream was read-only and did not redo local asset discovery. It informed the plan file and the change from `source: curated` to `source: mc2_overlay` with optional external source references.

# Verification

The orchestrator ran additional npm checks. `esco-js`, `jobtitles`, `job-title`, and `@occupation/onet` were not published packages. `professions`, `job-recognition`, and `@vantigo-ai/bls-soc-map` were not accepted because they do not solve RU/EN production autocomplete for this product.

# Delivery / Cleanup

The accepted recommendation was manually integrated into `docs/plans/career-playbook/2026-05-23-authoritative-role-source-and-other-flow.md` and the role suggestion source model.

# Risks / Follow-ups / Explicit Defers

Full taxonomy ingestion and normalized metadata persistence remain deferred until a dedicated data-import/backend scope exists.
