---
task_id: mc2-ql3
stage_id: stage6-quality-ladder
branch: codex/mc2-ql3-quality-ladder-visibility
base_branch: develop
base_commit: abacb9fd106bf858e714baa80ca7d682367b59f0
worktree: /home/me/.config/superpowers/worktrees/mc2/codex/mc2-ql3-quality-ladder-visibility
status: completed
verification:
  - pnpm -F @megacampus/shared-types build: passed
  - pnpm -F web exec vitest run components/generation-graph/hooks/__tests__/lessonInspectorQualityRecovery.test.ts components/generation-graph/panels/__tests__/ReviewRequiredUi.test.tsx: passed (2 files, 8 tests)
  - pnpm -F web exec tsc --noEmit: blocked_by_existing_repo_wide_typescript_issues_outside_scope (pre-existing trpc/router typing and missing package-entry failures across admin/generation-monitoring files; local Stage 6 slice compiled in targeted vitest)
  - git diff --check: passed
changed_files:
  - packages/shared-types/src/stage6-quality-recovery.ts
  - packages/shared-types/src/stage6-ui.types.ts
  - packages/web/components/generation-graph/hooks/lessonInspectorQualityRecovery.ts
  - packages/web/components/generation-graph/hooks/useLessonInspectorData.ts
  - packages/web/components/generation-graph/hooks/__tests__/lessonInspectorQualityRecovery.test.ts
  - packages/web/components/generation-graph/panels/__tests__/ReviewRequiredUi.test.tsx
  - packages/web/components/generation-graph/panels/lesson/LessonInspector.tsx
  - packages/web/components/generation-graph/panels/stage6/inspector/Stage6InspectorContent.tsx
  - packages/web/messages/en/generation.json
  - packages/web/messages/ru/generation.json
---

# Summary

Added an inspector-focused Stage 6 quality recovery summary that reads existing `qualityRecovery`, rejected-row metadata, judge output, and `qa_signals` without changing ladder execution or adding storage. The Lesson Inspector now distinguishes automatic terminal review (`stage_6_auto_last_chance` / `z-ai/glm-5`) from manual-top regeneration (`stage_6_manual_regeneration` / `openai/gpt-5.4`) and stays safe for legacy lessons without recovery metadata.

# Notes

The implementation intentionally keeps preview selection on the latest usable lesson content while separately reading the latest saved ladder/rejection metadata for reviewer UX. This preserves `mc2-ql1` ladder history semantics and avoids mixing manual-top regeneration with the automatic ladder display.
