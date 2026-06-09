# Stage mc2-db696.66 - Career Playbook Generation Progress UX

## Status

Implemented on branch `codex/career-playbook-generation-progress` in worktree
`/home/me/code/mc2-worktrees/career-playbook-generation-progress`.

## Changes

- Added `CareerPlaybookGenerationProgress` shared schema and persisted `generation_progress`
  inside existing Career Playbook `q_a_data` JSON.
- Replaced fixed generation fallback `80%` with staged progress:
  queued/preparing/profile/groups/judges/assembler/final review/completed/failed.
- Wired Career Playbook graph nodes to report progress and handler to persist progress
  best-effort without failing generation if a progress write fails.
- Exposed progress details through draft/status API mapping and frontend store.
- Moved final generation CTA/progress into the central review area and kept the right panel
  as compact status/summary only.
- Added auto-open to the generated Role Guide after completion, with test guard for jsdom.
- Reduced console noise:
  - Userback load failure is caught and logged as a warning instead of an unhandled promise.
  - PWA install prompt no longer calls `preventDefault()` when already installed or recently dismissed.
- Fixed shared `Progress` component accessibility by passing `value` to Radix root.

## Verification

- Passed: `pnpm --filter @megacampus/shared-types test -- tests/career-playbook.test.ts`
  - 18 tests.
- Passed: `SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_KEY=dummy pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/graph.test.ts tests/unit/orchestrator/handlers/career-playbook-handler.test.ts`
  - 14 tests.
- Passed: `pnpm --filter @megacampus/web test -- tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/wizard.test.tsx tests/unit/components/career-playbook/page-client.test.tsx`
  - 93 tests.
- Passed: `pnpm type-check`.
- Passed: `set -a; source <(tr -d '\r' < /home/me/code/mc2/packages/web/.env.local); set +a; pnpm build`.
- Passed: `git diff --check`.

## Notes

- `pnpm build` needs local web Supabase env values. They were sourced from
  `/home/me/code/mc2/packages/web/.env.local`; values were not copied into the worktree.
- Build warnings observed and treated as existing non-blockers:
  browserslist/caniuse-lite age, Node `url.parse()` deprecation, and earlier Supabase Edge runtime warnings.
- No SQL migration was added; progress is stored in existing JSONB.

## Review

- Local correctness review: no remaining must-fix findings.
- Improvement review: avoided adding another store-level source merge because it could reintroduce
  removed sources from stale business context; retained async upload wait in tests instead.
- docs-reviewed: no-change-needed - no public docs, API docs, migrations, or operator docs require updates.
- graph-reviewed: used - worktree has no `graphify-out`, but main repo graph report was read and focused
  `graphify query` was run for frontend/backend Career Playbook dependencies.
