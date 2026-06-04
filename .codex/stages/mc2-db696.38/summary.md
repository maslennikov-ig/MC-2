# Stage mc2-db696.38 Summary

Status: locally verified; ready for review and `develop` delivery
Updated: 2026-05-28
Branch: `codex/career-playbook-smart-department`
Base: `origin/develop` at `9de0ed1654c9b9301a495d39f0bb9972d77c9f47`

## Scope

- Replaced the always-visible Career Playbook department step with derived department context.
- Known role titles infer and save department locally, skip the standalone department question, and show a compact functional-area chip with an edit action.
- Ambiguous role titles call `careerPlaybook.session.resolveDepartmentOptions` from the Next action and reveal only 2-5 LLM department candidates.
- LLM failure or invalid/no candidates reveals the existing full department list as fallback.
- Follow-up generation is guarded so it cannot start without a saved department context.
- Added shared department resolution types, tRPC input/output wiring, classifier prompt, runtime retry/fallback-model support, config seed, and Supabase migration.

## Routing

- Classification: medium/complex because the task crosses web state/UI, shared contracts, backend tRPC, LLM runtime, model config, and migration seed.
- Skills used: `orchestrator-stage`, `superpowers:systematic-debugging`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`.
- Documentation: no external version-sensitive dependency docs were needed; implementation followed existing repo-local tRPC, Zustand, Vitest, migration, and `llm_model_config` patterns.
- Knowledge graph: not configured; no `graphify-out/GRAPH_REPORT.md`.
- Catalog candidates: none; installed skills and local code patterns were sufficient.
- Subagents: none launched; current runtime/repo policy requires explicit spawned-subagent authorization for this stage, and the shared write zones made local sequential execution safer.

## Parallel Decomposition Matrix

| Stream      | Goal                                                        | Owner | Write zone                               | Dependencies               | Verification                           | Reasoning | Decision   | Reason                                                       |
| ----------- | ----------------------------------------------------------- | ----- | ---------------------------------------- | -------------------------- | -------------------------------------- | --------- | ---------- | ------------------------------------------------------------ |
| Source/docs | Confirm local model-config and docs impact                  | local | docs only                                | none                       | docs diff review                       | medium    | sequential | Source behavior is repo-local and documentation-sensitive    |
| Code/data   | UI/store, shared types, classifier, runtime, seed/migration | local | Career Playbook web/backend/shared files | shared department contract | focused tests, lint, type-check, build | high      | sequential | Files share one state/API contract and one verification loop |
| Review      | Check ranking/flow/regression risks                         | local | read-only                                | implementation diff        | `git diff --check`, targeted tests     | medium    | sequential | No current spawned reviewer authorization                    |
| Closeout    | Beads, handoff, summary, stage closeout                     | local | `.codex/*`, Beads                        | verification               | stage closeout                         | medium    | sequential | Must happen after code gates                                 |

## Verification Evidence

- TDD red check: store tests initially failed before implementation because the department question was still static/visible.
- `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts` - passed, 38 tests.
- `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/page-client.test.tsx tests/unit/components/career-playbook/wizard.test.tsx tests/unit/components/career-playbook/role-title-suggestions.test.ts` - passed, 89 tests.
- `pnpm --dir packages/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/department-classifier.test.ts tests/unit/stages/stage-career-playbook/runtime.test.ts tests/unit/stages/stage-career-playbook/model-routing-migration.test.ts tests/unit/server/routers/career-playbook.router.test.ts` - passed, 46 tests.
- `pnpm --filter @megacampus/web lint` - passed.
- `pnpm type-check` - passed.
- `pnpm build` - passed with existing Browserslist and `url.parse()` warnings.
- `git diff --check` - passed.

## Documentation

- `docs-reviewed: updated - docs/career-playbook/README.md, docs/career-playbook/architecture.md, and .codex/project-index.md now describe department resolution behavior, endpoint, classifier entrypoint, and model routing.`
- `graph-reviewed: no-change-needed - Graphify is not configured: no graphify-out/GRAPH_REPORT.md.`

## Explicit Defers

- No LLM call while the user types; classifier runs only from the Next action.
- No HH, ESCO, Wikidata, or other live role-title API in the constructor.
- No dev deploy is included in this implementation stage.
