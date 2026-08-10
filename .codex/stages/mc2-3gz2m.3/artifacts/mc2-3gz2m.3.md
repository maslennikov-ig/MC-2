---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-3gz2m.3/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: Stage 2 document-processing owner
public_facade: existing EmptyConversionError
bounded_acceptance: run one high-resolution sequential direct-clip profile on the fixed corpus
non_goals:
  - VLM, glyph matching, new resident service, dependency addition
  - reindex, migration, production retry, paid call, secrets or access changes
evidence:
  - fixed-36-label-corpus
  - bounded-container-oom-result
task_id: mc2-3gz2m.3
stage_id: mc2-3gz2m.3
session_id: mc2-3gz2m.3
milestone: sequential-tiled-easyocr-measurement
milestone_status: accepted-measured-rejection
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one resource-bounded local measurement owns one acceptance boundary
repo: mc2
branch: develop
base_branch: develop
base_commit: ca93b93b4
worktree: /home/me/code/mc2
write_zone:
  - scripts/benchmarks
  - specs/025-remaining-debt
  - .codex/goals/mc2-3gz2m.3
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-3gz2m.3
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: removed the exact ignored OCR corpus/results/model environments and both disposable RapidOCR probe image tags; preserved the shared Docling image and unrelated Docker state
risk_level: medium
risk_tags:
  - memory-exhaustion
  - false-success
affected_surfaces:
  - backend
docs_impact: behavior
docs_reviewed: used
docs_review_notes: exact pypdfium2 tagged source defines safe direct-clip rendering
verification:
  - pure tile-geometry tests pass
  - exact bounded container was OOM-killed at 6 GiB before the first tile
  - pnpm type-check passed
  - pnpm build passed with only the known tracked DEP0169 warning
changed_files:
  - scripts/benchmarks/outlined_pdf_tiled_easyocr.py
  - scripts/benchmarks/test_outlined_pdf_tiled_easyocr.py
  - specs/025-remaining-debt/alternative-ocr-findings.md
  - specs/025-remaining-debt/plan.md
  - .codex/goals/mc2-3gz2m.3/scope-criterion-snapshot.json
  - .codex/stages/mc2-3gz2m.3/stage-manifest.json
  - .codex/stages/mc2-3gz2m.3/summary.md
  - .codex/stages/mc2-3gz2m.3/artifacts/mc2-3gz2m.3.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
explicit_defers:
  - no local tiled OCR path can be shipped under the fixed service memory boundary
---

# Summary

The high-resolution tiled profile exceeded a 6-GiB hard limit before its first
tile, so it cannot meet the existing fallback or service gates. Product behavior
remains the actionable rejection.

# Verification

The exact current Docling image ran locally with network and swap disabled. The
stage will close through the canonical stage-close command after repository
acceptance passes.

# Risks / Follow-ups

No safe local CPU recognition path remains. Any further attempt changes the
accepted infrastructure, paid-service or editable-input boundary.
