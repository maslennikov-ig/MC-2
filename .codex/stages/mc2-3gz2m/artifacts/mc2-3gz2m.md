---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-3gz2m/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: Stage 2 document-processing owner
public_facade: existing EmptyConversionError rejection
bounded_acceptance: decide whether pinned EasyOCR direct crops justify an outlined-PDF fallback
non_goals:
  - production document retry or reindex
  - schema, secret, access, deploy, merge, or push changes
  - VLM, glyph matching, new resident service, or larger host
evidence:
  - crop-downscale-ab
  - repository-ocr-scorer
  - existing-fail-closed-tests
task_id: mc2-3gz2m
epic_id: n/a
stage_id: mc2-3gz2m
session_id: mc2-3gz2m
milestone: outlined-russian-pdf-extraction-decision
milestone_status: accepted-measured-rejection
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: experiment and product decision share one quality and rollback boundary
repo: mc2
branch: develop
base_branch: develop
base_commit: 7b11f7d4d
worktree: /home/me/code/mc2
write_zone:
  - scripts/benchmarks/outlined_pdf_ocr_ab.py
  - specs/025-remaining-debt/plan.md
  - specs/025-remaining-debt/research-findings.md
  - .codex/goals/mc2-3gz2m
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-3gz2m
success_criteria:
  - compare 30-50 real labels at full crop resolution and the exact 0.1986 control
  - ship no fallback unless recall, character similarity, small-text, latency, and memory gates pass
  - preserve actionable failure when the recognition gate fails
  - focused tests, type-check, build, and process verification pass
selected_docs:
  - specs/025-remaining-debt/spec.md
  - specs/025-remaining-debt/research-prompt.md
  - EasyOCR 1.7.2 Context7 documentation
  - pypdfium2 5.12.1 Context7 documentation
  - Docling 2.118.0 Context7 documentation
selected_skills:
  - orchestrator-stage
  - task-router
  - technical-premortem
  - superpowers-writing-plans
  - superpowers-test-driven-development
  - orchestration-closeout
  - superpowers-verification-before-completion
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
cleanup_status: cleaned
cleanup_notes: local-only PDF, transcription, OCR output, and disposable container were excluded from git; no child workspace exists
risk_level: medium
risk_tags:
  - document-processing
  - ocr-quality
  - memory
affected_surfaces:
  - backend
  - tooling
invariants:
  - fail-closed
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: preserved research synthesis, benchmark protocol, measurements, decision, and recheck command
verification:
  - 36-label full-resolution result: 2.78% recall, 0.3551 mean similarity, 0/16 small labels, 41.36 seconds, 1408856 KiB RSS
  - 36-label 0.1986 control: 2.78% recall, 0.1181 mean similarity, 0/16 small labels, 3.53 seconds, 905560 KiB RSS
  - repository OCR scorer independently reproduced both aggregate scores
  - focused Stage 2 tests passed: 2 files and 23 tests
  - pnpm type-check passed
  - pnpm build passed with pre-existing DEP0169 warning tracked by mc2-p2908.1
changed_files:
  - scripts/benchmarks/outlined_pdf_ocr_ab.py
  - specs/025-remaining-debt/plan.md
  - specs/025-remaining-debt/research-findings.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-3gz2m/stage-manifest.json
  - .codex/stages/mc2-3gz2m/summary.md
  - .codex/stages/mc2-3gz2m/artifacts/mc2-3gz2m.md
  - .codex/stages/mc2-3gz2m/completions.ndjson
  - .codex/stages/mc2-3gz2m/review-state.json
explicit_defers:
  - none; a different OCR capability requires a new owner-approved stage rather than a continuation of this failed path
---

# Summary

The pinned EasyOCR crop experiment closed the remaining design uncertainty. Removing the
full-page downscale materially improves recognition, but full-resolution crops still fail the
pre-registered quality gate by a wide margin. No outlined-PDF fallback was added, and the current
actionable rejection remains the accepted behavior.

# Verification

Thirty-six real labels were scored with the repository's character-similarity implementation.
Full-resolution crops recovered only 1/36 labels at similarity 0.8 and none of the 16 small-body
labels. Focused fail-closed tests, type-check, build, and the benchmark harness passed.

# Delivery / Cleanup

Accepted as a measured rejection in the primary `develop` worktree. The proprietary PDF,
transcription and raw OCR output remain local-only and are not part of the repository.

# Risks / Follow-ups

Tiling this EasyOCR model would preserve more pixels but would not meet the measured recognition
quality for this font. A different OCR model, VLM, glyph reconstruction, new service, larger host,
or live retry is a separate owner-authorized stage, not deferred work inside this accepted task.
