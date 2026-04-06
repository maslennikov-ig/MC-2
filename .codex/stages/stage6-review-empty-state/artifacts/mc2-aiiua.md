---
task_id: mc2-aiiua
stage_id: stage6-review-empty-state
repo: mc2
branch: codex/stage6-review-empty-state
base_branch: develop
base_commit: 370f80aab182cfb9c57a9d531fb8869345596247
worktree: /home/me/.config/superpowers/worktrees/mc2/codex/stage6-review-empty-state
status: accepted_followup
verification:
  - pnpm -F @megacampus/shared-types build: passed
  - pnpm -F web exec vitest run components/generation-graph/hooks/__tests__/useLessonInspectorData.test.ts components/generation-graph/panels/__tests__/ReviewRequiredUi.test.tsx: passed (2 files, 8 tests)
  - git diff --check: passed
changed_files:
  - packages/web/components/generation-graph/hooks/useLessonInspectorData.ts
  - packages/web/components/generation-graph/panels/stage6/inspector/Stage6InspectorContent.tsx
  - packages/web/components/generation-graph/hooks/__tests__/useLessonInspectorData.test.ts
  - packages/web/components/generation-graph/panels/__tests__/ReviewRequiredUi.test.tsx
---

# Summary

Stage 6 Lesson Inspector now distinguishes the latest lesson-content row used for review state from the row usable for preview rendering. For `review_required`, the latest row remains the source of truth, preview content is shown only when that same latest row is usable, and empty latest review rows now render an explicit review-needed empty state instead of silently falling back to older completed content.

# Verification

Fresh scope verification passed in this worktree: `@megacampus/shared-types` built successfully, the targeted vitest suite passed for the new selection and inspector UI scenarios, and `git diff --check` reported no whitespace or patch-shape issues.

# Risks / Follow-ups

This change intentionally preserves the existing completed-lesson preview behavior, so non-review lessons still use the latest usable content path. It does not attempt to synthesize markdown for empty review rows or change unrelated Stage 6 loading flows.
