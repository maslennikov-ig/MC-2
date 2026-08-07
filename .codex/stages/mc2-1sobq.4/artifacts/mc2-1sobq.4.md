---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1sobq.4/stage-manifest.json
stream_owner: root-owner
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: Stage 2 conversion of scanned Russian documents
public_facade: no behaviour change; a reusable OCR scorer and a harder fixture corpus
bounded_acceptance: two-engine A/B on the same inputs, focused unit tests, type-check, lint
non_goals:
  - changing the default OCR engine or enabling a VLM
  - reading the 16 vector-outline PDFs (mc2-3gz2m)
  - production deploy and the chunk-strategy flip (Stage E)
evidence:
  - none
task_id: mc2-1sobq.4
epic_id: mc2-1sobq
stage_id: mc2-1sobq.4
session_id: docling-intelligence
milestone: measured rejection of RapidOCR and of a VLM pipeline
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: a measurement stage whose value is in the honesty of the gate, owned locally by the root
repo: mc-2
branch: develop
base_branch: develop
base_commit: 0732e3bb6
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/ocr-assertions.ts
  - packages/course-gen-platform/scripts/docling-quality-benchmark.ts
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/docling
  - docs/DOCLING-MCP-REFERENCE.md
success_criteria:
  - the A/B is reproducible from a deterministic corpus and exact ground truth
  - EasyOCR stays default because RapidOCR did not win on the same inputs
  - a VLM is enabled only on grounded controls, otherwise disabled with a recorded reason
  - the rejected candidate is explicit and EmptyConversionError is unweakened
  - the default Serve gains no global VLM load
selected_docs:
  - docling.datamodel.pipeline_options and docling_serve request fields introspected in the pinned image
  - Serve worker logs naming the RapidOCR supported-language list and the missing cyrillic checkpoint
selected_skills:
  - orchestration-bridge:orchestrator-stage
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: the RapidOCR probe image is local and disposable; the stack was restored to the shipped baseline and re-verified
risk_level: low
risk_tags:
  - rollback
affected_surfaces:
  - backend
invariants:
  - rollback
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: DOCLING-MCP-REFERENCE.md gained the OCR A/B table, the three RapidOCR constraints and the measured grounds for keeping VLM off
verification:
  - pnpm type-check: passed
  - pnpm lint: passed, 0 errors
  - vitest ocr-assertions.test.ts: 14 passed
  - live two-engine A/B on three degraded Russian fixtures: EasyOCR 0.9496, RapidOCR 0.7168
  - vector-outlines-negative and russian-raster-ocr re-verified on the restored baseline
changed_files:
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/ocr-assertions.ts
  - packages/course-gen-platform/scripts/docling-quality-benchmark.ts
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/generate-fixtures.py
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/manifest.json
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/docling/ocr-assertions.test.ts
  - docs/DOCLING-MCP-REFERENCE.md
explicit_defers:
  - RapidOCR retry needs a demonstrated win on this corpus; a VLM retry needs a host with enough RAM, same condition as mc2-x72bq
---

# Summary

Both candidates were measured on the same inputs and both were rejected.
EasyOCR stays the default at 0.9496 mean phrase similarity against RapidOCR's
0.7168; the VLM pipeline stays off because no VLM weights are in either image
and the host cannot hold one.

# Measured

The previous control corpus could not decide anything — both engines read a
clean 300 dpi render perfectly. Three new fixtures add deterministic damage,
mixed Cyrillic/Latin lines and a ruled Cyrillic table.

RapidOCR loses on large type and wins on table cells (1.000 vs 0.917) and on the
adversarial homoglyph line (0.744 vs 0.395). It also rejects `ru` outright, is
single-language, and needs a Cyrillic checkpoint absent from the shipped image —
which Docling refuses to download at request time, correctly.

# Verification

- `pnpm type-check`, `pnpm lint` (0 errors) green.
- 14 focused tests for the scorer; writing them found a real bug where a
  zero-scoring search returned an empty string and hid the homoglyph case.
- Stack restored to the shipped baseline and re-verified.

# Risks / Follow-ups

- The homoglyph check catches wholesale substitution, not alphabet inversion
  inside a mixed line: RapidOCR's `POCT И РOCT` for `РОСТ и POCT` was not
  flagged. Stated in the summary rather than hidden.
- Stage B's note that SmolVLM "stays in the image" is wrong; the model is not
  there. Corrected in this stage's summary and in the reference doc.
