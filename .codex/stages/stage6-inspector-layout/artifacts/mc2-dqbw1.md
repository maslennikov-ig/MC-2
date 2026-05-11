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
  - pnpm -F web exec vitest run components/generation-graph/panels/lesson/__tests__/LessonInspectorLayout.test.tsx: passed (1 file, 4 tests)
  - git diff --check: passed
changed_files:
  - .codex/stages/stage6-inspector-layout/artifacts/mc2-dqbw1.md
  - packages/web/components/generation-graph/panels/lesson/LessonInspectorLayout.tsx
  - packages/web/components/generation-graph/panels/lesson/LessonInspectorLayout.measurements.ts
  - packages/web/components/generation-graph/panels/lesson/__tests__/LessonInspectorLayout.test.tsx
---

# Summary

Accepted `mc2-dqbw1` keeps the Lesson Inspector on the measured hybrid path but tightens the validity heuristic so a legally collapsed left pipeline panel is treated as valid. The resizable split remains the default, mount-time invalid measurements still get one imperative recovery attempt, and only a still-unusable preview/content side escalates to the fixed fallback inside the animated workflow drawer.

# Verification

Focused Vitest coverage now covers three critical states: valid resizable measurements, invalid mount measurements that recover via the imperative group API, and intentional left-panel collapse that must not trip the fallback. `git diff --check` passed.

# Risks / Follow-ups

This slice intentionally did not touch backend/data fetching logic. The fallback logger still stays minimal and only fires when the resizable layout remains unusable after the single recovery attempt, now including the last known group layout to help distinguish real broken measurements from legitimate user collapse.
