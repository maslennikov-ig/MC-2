---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-iioip/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: portable and cross-runtime prompt authors
public_facade: orch-prompts prompt-check
bounded_acceptance: both Label fields and equivalent Markdown headings satisfy required sections
non_goals:
  - running prompt-check on native same-session four-field prompts
  - changing prompt budgets, warnings, or required section sets
  - rewriting the current mc2 native subagent prompt template
evidence:
  - none
task_id: mc2-iioip
epic_id: n/a
stage_id: mc2-iioip
session_id: mc2-iioip
milestone: prompt-section-syntax-compatibility
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one root owner for a narrow shared prompt-parser compatibility fix
repo: orchestration-console
branch: codex/prompt-check-markdown-headings
base_branch: main
base_commit: 233c097
worktree: /home/me/.agents/orchestration-console
write_zone:
  - shared prompt checker, focused regression, console README, mc2 stage and Beads state
success_criteria:
  - required sections accept colon labels and exact Markdown heading aliases
  - existing Codex and Claude prompt checks remain green
  - external implementation is committed and console validation passes
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - /home/me/.agents/orchestration-console/AGENTS.md
selected_skills:
  - orchestrator-stage
  - prompt-authoring
  - task-router
  - superpowers:systematic-debugging
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local-root-owner
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: blocked
cleanup_notes: accepted-content, not-git-merged; external branch integration is intentionally pending until final delivery
risk_level: medium
risk_tags:
  - compatibility
affected_surfaces:
  - tooling
invariants:
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: orchestration-console README now documents Label fields and Markdown headings
verification:
  - baseline Markdown-heading regression: five required-section errors
  - focused post-fix prompt-authoring suite: 26 tests passed
  - cross-runtime Codex and Claude prompt suites: 43 tests passed
  - orchestration-console validate_console.py: passed with 32 manifest prompts
  - external implementation commit fada910: present
  - canonical mc2 closeout receipt ee1e2f5bb5ef53d655e18756533a9def52fdd264e3965368026dda9d76f59cff: passed
changed_files:
  - /home/me/.agents/orchestration-console/scripts/orchestration_panel.py
  - /home/me/.agents/orchestration-console/tests/test_prompt_authoring_guardrail.py
  - /home/me/.agents/orchestration-console/README.md
  - .beads/interactions.jsonl
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-iioip
explicit_defers:
  - external branch codex/prompt-check-markdown-headings must be merged and pushed during final delivery
---

# Summary

The shared `prompt-check` parser now recognizes each existing section alias either as a compatible
`Label:` field or as an exact Markdown heading. The required-section set and all existing substring
compatibility remain unchanged.

# Scope / Routing

The implementation lives in the shared orchestration-console, as the Beads task and specification
required. The current `mc2` native subagent template stays on its four-field contract and does not
invoke the portable prompt checker.

# Verification

The new regression first failed with missing goal, context, constraints, output, and stop sections.
After the parser change, it passed alongside the existing colon-form test, all 43 related Codex and
Claude tests, Python compilation, and complete console manifest validation.

# Delivery / Cleanup

Accepted as external commit `fada910`. Its feature branch remains intentionally unmerged and
unpushed until final delivery of the accessible backlog, so automatic cleanup is blocked.

# Risks / Follow-ups / Explicit Defers

Markdown matching is limited to actual ATX heading lines and exact normalized aliases; prose that
merely resembles a heading is not newly accepted. Final delivery must integrate and push the
external feature branch without rewriting history.
