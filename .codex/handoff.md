# Orchestrator Handoff

Updated: 2026-06-28
Stage: `mc2-db696.102` Career Playbook marketing manager generation stuck
Branch: `develop`
Beads: `mc2-db696.102`, `.103`, `.88`, `.89`, `.90`, `.91`, `.92`, `.94`, `.98`, `.99`, `.100`, and `.101` closed

## Current State

- `mc2-db696.102`: live Career Playbook for `Менеджер маркетинга` (`6bb32d29-bf64-4195-94ea-90ca769bf0d3`) was orphaned in production: DB stayed `generating` / `reviewing_foundation` / `78%`, but Redis/BullMQ no longer had job `career-playbook-6bb32d29-bf64-4195-94ea-90ca769bf0d3`. With user authorization to restart the stuck generation, the same jobId was requeued in production at `2026-06-28 14:05 UTC`; BullMQ returned `active`, and live DB moved to `reviewing_operations` / `83%` by `14:06 UTC`.
- Root cause found for `.102`: Career Playbook `llm_model_config.timeout_ms` is configured as `300000`, but `nodes/runtime.ts` ignored timeoutMs and could wait for a hung LangChain/OpenRouter invoke until the 120-minute processor TTL. Local fix now enforces timeoutMs with a runtime `Promise.race` and passes timeout to `ChatOpenAI` factory. The fix is local only; no commit, push, merge, or deploy has been performed for `.102`.
- `mc2-db696.103`: fixed the Russian Career Playbook generation CTA overflow by shortening `Сгенерировать должностную инструкцию` to `Сгенерировать инструкцию` in the wizard messages and fallback copy. RED/GREEN wizard unit coverage was updated.
- Secondary ops finding for `.102`: Supabase Edge Function `detect-stuck-generations` cron is returning `401`, and that function targets `courses`, not `career_playbooks`, so it would not recover this Career Playbook orphan even if invoked successfully.
- `mc2-db696.101`: handoff state refresh remains local metadata from the previous delivery.
- `mc2-db696.100`: delivery lint hotfix completed. Commit `db3786cc` was pushed to `origin/develop`; `.claude/scripts/deploy.sh --yes` passed `pnpm type-check` and `pnpm build`, merged `develop` into `master`, and pushed merge commit `3c286763` to `origin/master`. GitHub Actions completed successfully for both develop and master.
- `mc2-db696.99`: delivery completed. Commit `7cbf74d7` was pushed to `origin/develop`; `.claude/scripts/deploy.sh --yes` passed `pnpm type-check` and `pnpm build`, merged `develop` into `master`, and pushed merge commit `ec7f033d` to `origin/master`. A follow-up handoff/Beads state commit `db8e2fcb` was later merged to master as `f4e8b8d6`.
- `mc2-db696.94`: implemented locally. Career Playbook quality diagnostic dedupe/filter helpers now live in `@megacampus/shared-types` and are reused by backend handler/library mapping and the web viewer.
- `mc2-db696.98`: implemented locally. Reader and library pages now share `normalizeVisibilityUpdateResponse` from `packages/web/components/career-playbook/library/normalizers.ts`.
- `mc2-db696.91`: locally resolved/not reproduced. `pnpm build` originally passed on stale local `next@15.5.12`; lockfile requires `15.5.19`. After `pnpm install --frozen-lockfile`, local `node_modules` uses `next@15.5.19` and `pnpm build` passes through trace collection.
- `mc2-db696.92`: review-and-fix pass remains closed locally. Accepted reviewer findings are implemented and verified.
- `mc2-db696.90`: quality diagnostics dedupe/filtering/fair retry implementation remains closed locally.
- `mc2-db696.89`: private share confirmation/public-link UX remains closed locally.
- `mc2-db696.88`: generation stability fix remains closed locally.
- Current worktree is dirty with `.102` timeout fix, `.103` CTA fix, Beads/handoff/stage updates; Beads are closed after local verification, but no commit, push, merge, or deploy has been performed for this combined delivery.

## Verification

- RED checks:
  - `pnpm --filter @megacampus/shared-types test -- tests/career-playbook.test.ts`: failed before shared diagnostic helper implementation.
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/library-normalizers.test.ts`: failed before visibility normalizer implementation.
- Targeted tests after `pnpm install --frozen-lockfile`:
  - `pnpm --filter @megacampus/shared-types test -- tests/career-playbook.test.ts`: passed.
  - `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/orchestrator/handlers/career-playbook-handler.test.ts tests/unit/stages/stage-career-playbook/graph.test.ts tests/unit/stages/stage-career-playbook/block-regenerator.test.ts tests/unit/career-playbook-library-service.test.ts`: passed.
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/library-normalizers.test.ts`: passed.
- Repo gates:
  - `pnpm lint`: passed after `mc2-db696.100` reduced backend warning count back to the configured `--max-warnings=95` budget.
  - `git diff --check`: passed.
  - `pnpm type-check`: passed.
  - `pnpm build`: passed on `next@15.5.19`.
- `mc2-db696.102` local verification:
  - RED: `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/runtime.test.ts` failed because a hung LLM promise stayed `pending` and fallback was not reached.
  - `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/runtime.test.ts`: passed, 4/4.
  - `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/runtime.test.ts tests/unit/stages/stage-career-playbook/cross-block-judge.test.ts tests/unit/stages/stage-career-playbook/graph.test.ts`: passed, 21/21.
  - `pnpm --filter @megacampus/course-gen-platform type-check`: passed.
  - `pnpm --filter @megacampus/course-gen-platform build`: passed.
  - `git diff --check`: passed.
- `mc2-db696.103` local verification:
  - RED: `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx` failed before the copy change because the button still exposed `Сгенерировать должностную инструкцию`.
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx`: passed, 35/35.
- Combined pre-delivery verification:
  - `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/runtime.test.ts tests/unit/stages/stage-career-playbook/cross-block-judge.test.ts tests/unit/stages/stage-career-playbook/graph.test.ts`: passed, 21/21.
  - `git diff --check`: passed.
  - `pnpm type-check`: passed.
  - `pnpm build`: passed with existing Browserslist and `url.parse()` warnings.
- Stage summary:
  - `.codex/stages/mc2-db696.102/summary.md`

## Explicit defers

- No code/test defers for `mc2-db696.94` or `mc2-db696.98`.
- `mc2-db696.91` was closed as locally resolved/not reproduced after synchronizing `node_modules` to the lockfile and passing `pnpm build`; no tracked code change was needed.
- `.102`/`.103` delivery is now authorized by the user with "Push, Merge, Deploy"; direct live requeue was performed for the stuck playbook after user authorization. No DB cleanup, cancel, deploy, or production code change has been performed yet in this turn.

## Next recommended

Next stage id: continue `mc2-db696.102`.
Recommended action: commit, push to `develop`, merge/deploy through the normal repo delivery flow, then run post-deploy smoke checks. Separately add/fix a Career Playbook stuck-generation recovery path. Keep monitoring live playbook `6bb32d29-bf64-4195-94ea-90ca769bf0d3`, which was requeued and had reached `reviewing_operations` / `83%` at `2026-06-28 14:11 UTC`.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2` to continue combined delivery for `mc2-db696.102` and `mc2-db696.103`. Preserve dirty `.beads/issues.jsonl`, `.codex/handoff.md`, `.codex/stages/mc2-db696.102/summary.md`, backend timeout files, and Career Playbook wizard CTA files. Local root cause: Career Playbook runtime ignored configured timeoutMs, so hung LLM calls could wait until the 120-minute processor TTL. UI fix: Russian CTA is now `Сгенерировать инструкцию`. Live playbook `6bb32d29-bf64-4195-94ea-90ca769bf0d3` was requeued in production after the old BullMQ job was confirmed missing; it had reached `reviewing_operations` / `83%` by `2026-06-28 14:11 UTC`.

## Closeout Markers

docs-reviewed: updated - handoff records live `.102` diagnosis and local timeout fix; no public API, schema, route, migration, deployment procedure, or operator workflow docs changed.
graph-reviewed: blocked - Graphify was used for routing; post-change `graphify update . && graphify cluster-only . --no-viz` refused non-force overwrite because the new graph had 52,453 nodes vs existing 52,456. No `--force` was run.
