---
task_id: mc2-ux7aq
stage_id: mc2-ux7aq
repo: mc2
branch: codex/mc2-ux7aq-review-required-ux
base_branch: develop
base_commit: 23e7c2a94bdb93efdf330b310112d827fe397bcc
worktree: /home/me/.config/superpowers/worktrees/mc2/codex/mc2-ux7aq-review-required-ux
status: accepted_followup
verification:
  - pnpm -F web exec vitest run components/generation-graph/hooks/__tests__/stage6-review-status.test.ts components/generation-graph/panels/__tests__/ReviewRequiredUi.test.tsx: passed (2 files, 10 tests)
  - git diff --check: passed
  - pnpm -F web exec tsc --noEmit: blocked_by_existing_repo_wide_typescript_issues_outside_scope
  - git commit pre-commit hook: blocked_by_existing_lint_debt_and_legacy_lint-staged_behavior
changed_files:
  - packages/web/components/generation-graph/hooks/useLessonInspectorData.ts
  - packages/web/components/generation-graph/hooks/useModuleDashboardData.ts
  - packages/web/components/generation-graph/hooks/__tests__/stage6-review-status.test.ts
  - packages/web/components/generation-graph/panels/NodeDetailsDrawer.lesson.tsx
  - packages/web/components/generation-graph/panels/__tests__/ReviewRequiredUi.test.tsx
  - packages/web/components/generation-graph/panels/lesson/LessonInspector.tsx
  - packages/web/components/generation-graph/panels/lesson/LessonPanelWithTabs.tsx
  - packages/web/components/generation-graph/panels/module/LessonMatrix.tsx
  - packages/web/components/generation-graph/panels/module/ModuleDashboard.tsx
  - packages/web/components/generation-graph/panels/module/ModuleDashboardHeader.tsx
  - packages/web/components/generation-graph/panels/stage6/dashboard/Stage6ControlTower.tsx
  - packages/web/components/generation-graph/panels/stage6/inspector/Stage6InspectorContent.tsx
  - packages/web/components/generation-graph/stage6-review-status.ts
  - packages/web/messages/en/generation.json
  - packages/web/messages/ru/generation.json
---

# Summary

Accepted child `mc2-ux7aq` stopped `review_required` Stage 6 lessons from disappearing into a generic pending state and surfaced them explicitly across the generation graph dashboards and inspector flows.

# Verification

Focused Vitest checks passed and `git diff --check` passed. Repo-wide TypeScript and pre-commit hook failures remained pre-existing baseline debt outside this task's scope, which the original report recorded explicitly.

# Risks / Follow-ups

This slice did not change backend approval/content selection or the blank Lesson Inspector loading path. `mc2-dqbw1` remains the separate follow-up for latest-usable-content resolution and Inspector loading behavior.
