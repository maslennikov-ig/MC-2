---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-db696.20
stage_id: mc2-db696.20
agent_type: docs_researcher
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Knowledge-base choice has licensing, multilingual, and product-risk implications.
repo: /home/me/code/mc2
branch: codex/career-playbook-role-suggestions
base_branch: origin/develop
base_commit: 17e826ee49ca862857cc832c562daf525a28211e
worktree: /home/me/code/mc2
write_zone:
  - read-only
success_criteria:
  - Recommend a practical role knowledge-base approach for multilingual role suggestions.
selected_docs:
  - ESCO official taxonomy/download/API pages
  - O*NET official ETA and Web Services pages
  - ILO ISCO official classification pages
  - Lightcast Open Skills official pages
selected_skills:
  - ux-researcher-designer
  - senior-architect
selected_agents:
  - Atlas
catalog_candidates:
  - none - official sources were sufficient
parallel_group: 3-role-knowledge-base-research
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
  - Orchestrator cross-checked recommendation against MVP constraints and official-source findings: passed
changed_files:
  - none
explicit_defers:
  - none
---

# Summary

Atlas recommended a static curated RU/EN seed list for MVP. ESCO is the best first candidate for a later build-time imported subset, while O\*NET is strong but English/US-focused, ISCO is a taxonomy backbone, and Lightcast is likely too access/licensing-sensitive for MVP.

# Scope / Routing

The stream evaluated ESCO, O\*NET, ISCO/ILO, and Lightcast against multilingual labels, licensing/access, implementation complexity, and runtime reliability. It explicitly rejected live API calls in the user flow for MVP.

# Verification

The orchestrator accepted the recommendation because it matched the user's constraints: useful suggestions, no blocked manual entry, no paid or fragile runtime dependency, and language-aware labels with fallback behavior.

# Delivery / Cleanup

The accepted recommendation was manually integrated as a small tracked seed list in the frontend. The stream was read-only, so cleanup was not applicable beyond recording this artifact.

# Risks / Follow-ups / Explicit Defers

Future expansion can import a normalized ESCO subset at build/import time, but that is not required for MVP and should be separately scoped for dataset size, attribution, and RU-label fallback policy.
