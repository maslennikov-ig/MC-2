---
task_id: mc2-dqbw1
stage_id: stage6-inspector-layout
repo: mc2
branch: codex/mc2-dqbw1-inspector-layout
base_branch: develop
base_commit: 370f80aab182cfb9c57a9d531fb8869345596247
worktree: /home/me/.config/superpowers/worktrees/mc2/codex/mc2-dqbw1-inspector-layout
status: accepted
verification:
  - pnpm -F web exec vitest run components/generation-graph/panels/lesson/__tests__/LessonInspectorLayout.test.tsx: passed (1 file, 2 tests)
  - pnpm -F web exec tsc --noEmit: blocked_by_existing_repo_wide_typescript_issues_outside_scope
  - git diff --check: passed
changed_files:
  - .codex/stages/stage6-inspector-layout/artifacts/mc2-dqbw1.md
  - packages/web/components/generation-graph/panels/lesson/LessonInspectorLayout.tsx
  - packages/web/components/generation-graph/panels/lesson/LessonInspectorLayout.measurements.ts
  - packages/web/components/generation-graph/panels/lesson/__tests__/LessonInspectorLayout.test.tsx
---

# Summary

Accepted `mc2-dqbw1` moved the Lesson Inspector split layout onto a measured hybrid path: it still prefers `react-resizable-panels`, performs one imperative layout recovery attempt after mount, and falls back to a stable fixed split when real container/panel measurements remain invalid inside the animated workflow drawer.

# Verification

Focused Vitest coverage for valid-versus-invalid measurements passed. `git diff --check` passed. The required `pnpm -F web exec tsc --noEmit` run failed on broad pre-existing workspace TypeScript issues unrelated to this write zone, including missing `@megacampus/shared-types` module resolution and existing tRPC typing debt in other `packages/web` areas.

# Risks / Follow-ups

This slice intentionally did not touch backend/data fetching logic. The fallback logger is minimal and only fires when the resizable layout remains invalid after the imperative recovery attempt, so any future blank-state investigation should use that signal together with real browser reproduction inside the animated `Sheet`.
