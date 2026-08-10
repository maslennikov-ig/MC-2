---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-3gz2m.1/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: Stage 2 document-processing owner
public_facade: existing EmptyConversionError until a candidate clears every gate
bounded_acceptance: select or reject local OCR candidates on one fixed corpus and implement only a passing path
non_goals:
  - cloud or paid OCR, production retry, reindex, migration, deploy, merge, push
  - secrets or access changes, glyph reconstruction, new resident service
evidence:
  - fixed-36-label-corpus
  - engine-comparison-json
  - focused-fail-closed-tests
task_id: mc2-3gz2m.1
epic_id: n/a
stage_id: mc2-3gz2m.1
session_id: mc2-3gz2m.1
milestone: alternative-outlined-russian-ocr-selection
milestone_status: accepted-measured-rejection
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: sequential model loads share one resource and acceptance boundary
repo: mc2
branch: develop
base_branch: develop
base_commit: 1e34a1060
worktree: /home/me/code/mc2
write_zone:
  - scripts/benchmarks
  - packages/course-gen-platform/src/stages/stage2-document-processing
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing
  - specs/025-remaining-debt
  - .codex/goals/mc2-3gz2m.1
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-3gz2m.1
success_criteria:
  - compare the pre-registered local candidates on the same 36 labels and scorer
  - enforce quality, time, memory, class-coverage and fail-closed gates
  - add product code only for a passing whole-page path
  - finish with focused tests, type-check, build and process verification
selected_docs:
  - EasyOCR 1.7.2 docs-resolve L1 then first-party fallback
  - PaddleOCR 3.7.0 docs-resolve L1 then first-party fallback
  - Surya OCR 0.22.1 docs-resolve L1 then first-party fallback
selected_skills:
  - orchestrator-stage
  - task-router
  - system-stability-check
  - technical-premortem
  - superpowers-writing-plans
  - superpowers-systematic-debugging
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: sequential-resource-bounded-root-owner
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: blocked
cleanup_notes: no experiment container or delegated worktree remains; ignored corpus, raw outputs and model caches are retained for the owner's next decision because destructive cache cleanup was not authorized
risk_level: medium
risk_tags:
  - rollback
  - concurrency
affected_surfaces:
  - backend
invariants:
  - rollback
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: alternative plan records documentation, candidates, gates and resource limits
verification:
  - same 36-label corpus and scorer used for EasyOCR and PaddleOCR
  - Surya classic rejected by the 2.8-GiB model-load gate
  - PaddleOCR-VL 1.6 rejected by the 180-second whole-page gate
  - python benchmark compile check passed through canonical stage closeout
  - pnpm type-check and pnpm build passed through canonical stage closeout
  - repository process verification passed through canonical stage closeout
changed_files:
  - scripts/benchmarks/outlined_pdf_ocr_ab.py
  - scripts/benchmarks/outlined_pdf_paddleocr.py
  - scripts/benchmarks/outlined_pdf_surya.py
  - specs/025-remaining-debt/alternative-ocr-plan.md
  - specs/025-remaining-debt/alternative-ocr-findings.md
  - .codex/goals/mc2-3gz2m.1/scope-criterion-snapshot.json
  - .codex/stages/mc2-3gz2m.1/stage-manifest.json
  - .codex/stages/mc2-3gz2m.1/summary.md
  - .codex/stages/mc2-3gz2m.1/artifacts/mc2-3gz2m.1.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
explicit_defers:
  - parent Bead mc2-3gz2m tracks the owner choice among a larger or GPU VLM host, paid managed OCR, or an editable-source requirement
---

# Summary

The original EasyOCR measurement remains accepted evidence. This stage rejects
all tested local CPU alternatives under one fixed quality and resource boundary:
PaddleOCR is the best classic engine but reaches only 19/36 labels, Surya classic
cannot load inside 2.8 GiB, and PaddleOCR-VL cannot finish a full page in 180
seconds. The unresolved product capability remains open.

# Scope / Routing

The root owns the benchmark, optional adapter and final acceptance. Candidates
run sequentially because they compete for the same memory budget; no parallel
worker or model process is useful or safe.

# Verification

Final acceptance passed through the canonical stage-close command containing
benchmark module compilation, `pnpm type-check`, `pnpm build`, and process
verification.

# Delivery / Cleanup

No push, merge or deploy is authorized for this stage. No experiment container
or delegated worktree remains. Local-only inputs, raw outputs and model caches
stay ignored and retained because destructive cache cleanup was not authorized.

# Risks / Follow-ups / Explicit Defers

The parent Bead `mc2-3gz2m` remains open for the owner choice among a larger or
GPU VLM host, managed paid OCR, or an editable-source/text-layer requirement.
