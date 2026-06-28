---
stage_id: mc2-db696.102
status: ready_for_delivery
branch: develop
beads:
  - mc2-db696.102
  - mc2-db696.103
docs_reviewed: updated
graph_reviewed: blocked
---

# Career Playbook Timeout And CTA Delivery

## Summary

- `mc2-db696.102`: diagnosed a live Career Playbook generation orphan for `Менеджер маркетинга` (`6bb32d29-bf64-4195-94ea-90ca769bf0d3`). The playbook stayed `generating`, but its BullMQ job was missing from production Redis; it was requeued with the same jobId after user authorization.
- Root cause: Career Playbook runtime read `llm_model_config.timeout_ms = 300000` but did not enforce it for LangChain/OpenRouter invokes. A hung provider call could therefore block until the 120-minute processor TTL and prevent retry/fallback.
- Fix: `nodes/runtime.ts` now enforces per-call timeout with `Promise.race`, forwards timeout to model creation, and `langchain-models.ts` passes it to `ChatOpenAI`.
- `mc2-db696.103`: shortened the Russian wizard generation CTA from `Сгенерировать должностную инструкцию` to `Сгенерировать инструкцию` so the button text fits.

## Verification

- RED timeout test: `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/runtime.test.ts` failed before the runtime fix because a hung promise stayed pending.
- RED CTA test: `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx` failed before the copy change because the button still exposed the long label.
- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx` passed, 35/35.
- `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/runtime.test.ts tests/unit/stages/stage-career-playbook/cross-block-judge.test.ts tests/unit/stages/stage-career-playbook/graph.test.ts` passed, 21/21.
- `git diff --check` passed.
- `pnpm type-check` passed.
- `pnpm build` passed with existing Browserslist and `url.parse()` warnings.

## Delivery State

- User authorized push, merge, and deploy for this combined delivery.
- Beads `mc2-db696.102` and `mc2-db696.103` are closed after local verification.
- Commit/push/merge/deploy are still pending at the time of this summary update.
- `docs-reviewed: updated` - handoff and stage summary record the live incident, local code fix, UI copy fix, and delivery state; no public API, DB schema, route, migration, or operator doc changed.
- `graph-reviewed: blocked` - Graphify was used for routing; post-change `graphify update . && graphify cluster-only . --no-viz` refused non-force overwrite because the regenerated graph had 52,453 nodes vs existing 52,456. No `--force` was run.
