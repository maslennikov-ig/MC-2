---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-3gz2m.2/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: Stage 2 document-processing owner
public_facade: existing EmptyConversionError unless every gate passes
bounded_acceptance: score one pinned Docling-native RapidOCR profile on the fixed corpus
non_goals:
  - cloud or paid OCR, production retry, reindex, migration, deploy, merge, push
  - secrets or access changes, glyph reconstruction, new resident service
evidence:
  - fixed-36-label-corpus
  - bounded-docling-rapidocr-result
task_id: mc2-3gz2m.2
stage_id: mc2-3gz2m.2
session_id: mc2-3gz2m.2
milestone: docling-native-rapidocr-measurement
milestone_status: accepted-measured-rejection
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one resource-bounded local measurement has no useful parallel stream
repo: mc2
branch: develop
base_branch: develop
base_commit: 1357e8c71
worktree: /home/me/code/mc2
write_zone:
  - scripts/benchmarks
  - specs/025-remaining-debt
  - .codex/goals/mc2-3gz2m.2
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-3gz2m.2
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: blocked
cleanup_notes: disposable images and ignored local corpus/results are retained because destructive cache cleanup was not authorized
risk_level: medium
risk_tags:
  - memory-exhaustion
  - false-success
affected_surfaces:
  - backend
docs_impact: behavior
docs_reviewed: used
docs_review_notes: official Docling and upstream GitHub evidence select this candidate
verification:
  - exact corpus SHA-256 values matched the accepted prior stage
  - exact current Docling image completed the full-page profile in 87.78 seconds
  - result was 0/36 labels, mean similarity 0.0289 and 0/16 small labels
  - process RSS was 2,719,920 KiB and cgroup peak was 3,759,906,816 bytes
  - pnpm type-check and pnpm build passed before process verification found only a 201-line handoff limit
  - final stage closeout reuses those unchanged passes and runs benchmark compilation plus process verification
changed_files:
  - scripts/benchmarks/outlined_pdf_docling_rapidocr.py
  - specs/025-remaining-debt/alternative-ocr-findings.md
  - .codex/goals/mc2-3gz2m.2/scope-criterion-snapshot.json
  - .codex/stages/mc2-3gz2m.2/stage-manifest.json
  - .codex/stages/mc2-3gz2m.2/summary.md
  - .codex/stages/mc2-3gz2m.2/artifacts/mc2-3gz2m.2.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
explicit_defers:
  - parent mc2-3gz2m remains open for a tiled-page adapter, larger or GPU VLM host, managed paid OCR, or editable-source policy
---

# Summary

The official Docling-native RapidOCR path passed the time and memory gates but
failed quality at 0/36 labels. No product profile was added.

# Verification

The exact current image completed the full-page run with network disabled.
Corpus hashes matched the accepted prior stage; sanitized metrics are recorded
in the stage summary and alternative OCR findings. Final repository acceptance
is owned by the canonical stage-close command.

# Risks / Follow-ups

Parent `mc2-3gz2m` remains open. Built-in full-page OCR is exhausted for this
document family; page tiling or a changed recognition/input policy remains.
