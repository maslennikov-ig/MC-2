---
task_id: mc2-c2m8a
stage_id: stage6-status-recovery
branch: codex/stage6-status-recovery
base_branch: develop
base_commit: 370f80aab182cfb9c57a9d531fb8869345596247
worktree: /home/me/.config/superpowers/worktrees/mc2/codex/stage6-status-recovery
status: completed
verification:
  - "pnpm -F web exec vitest run tests/unit/api/courses/check-status.test.ts"
  - "pnpm -F web exec tsc --noEmit"
  - "git diff --check"
changed_files:
  - packages/web/app/api/courses/[orgSlug]/[courseSlug]/check-status/route.ts
  - packages/web/app/[locale]/courses/[orgSlug]/[courseSlug]/generating/page.tsx
  - packages/web/lib/stage6-status-reconciliation.ts
  - packages/web/tests/unit/api/courses/check-status.test.ts
---

Implemented server-side Stage 6 status reconciliation based on the latest `lesson_contents`
row per expected lesson from `course_structure`.

Key outcomes:
- `check-status` GET now detects `stage_6_generating` courses whose latest lesson rows are all terminal.
- `check-status` POST now writes `courses.generation_status` and auto-resolves Stage 6 recovery to `stage_6_complete` or `completed`.
- generating workflow page runs reconciliation server-side on open, so stuck courses heal without client auto-POST.

Notes:
- `pnpm -F web exec tsc --noEmit` initially failed on missing built workspace outputs; after building workspace dependencies, the required verification command passed without touching unrelated source scope.
