# Stage Summary: mc2-spb1n

Updated: 2026-06-13
Beads: `mc2-spb1n`
Branch: `codex/career-playbook-course-preview-bridge`
Delivery branch: `develop`

## Outcome

Delivered the Career Playbook Role Guide -> course bridge to Dev and verified the implemented preview/create/generation-start flow end to end on `https://dev.ai.megacampus.ru`.

## Classification And Routing

- Classification: medium/complex - cross-boundary frontend/backend delivery, Dev deploy, and live E2E.
- Routing: `orchestrator-stage`, `orchestration-closeout`, repo `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Graphify report.
- Delegation: no subagents used in the delivery/E2E continuation. The remaining work was sequential because CI, deploy, health, browser E2E, API logs, and DB verification all depended on the previous step's result and shared the same Dev environment.

## Parallel Decomposition Matrix

| Stream   | Goal                                                               | Owner | Write zone                                 | Dependencies                             | Verification                               | Reasoning | Decision   | Reason                                                        |
| -------- | ------------------------------------------------------------------ | ----- | ------------------------------------------ | ---------------------------------------- | ------------------------------------------ | --------- | ---------- | ------------------------------------------------------------- |
| Delivery | Merge feature branch to `develop` and deploy Dev                   | local | git refs, CI/CD                            | clean feature branch, green local checks | GitHub Actions + Dev health                | medium    | sequential | shared protected delivery path and single Dev deploy resource |
| E2E      | Verify preview, create, redirect, DB, and worker processing on Dev | local | ignored `output/playwright` artifacts only | successful Dev deploy                    | Playwright + Supabase DB + Dev logs        | high      | sequential | must run against deployed version                             |
| Closeout | Update task truth, handoff, Beads                                  | local | `.codex/handoff.md`, stage summary, Beads  | successful verification                  | git status, Beads close, docs/graph review | medium    | sequential | depends on final delivery/E2E facts                           |

## Changes Delivered

- `baa528b5 feat(career-playbook): create course from role guide`
- `c7d8534b fix(career-playbook): split source evidence helper`
- `a9eff134 test(career-playbook): expose course bridge trigger`
- `787b228f fix(career-playbook): use valid bridge processing method`

## Delivery Evidence

- Feature branch pushed: `codex/career-playbook-course-preview-bridge`.
- Develop merge `927a2ea1`: GitHub Actions run `27471885516` succeeded, including `Build Docker - web` and `Deploy to Dev`.
- Develop merge `913420bc`: GitHub Actions run `27472451330` succeeded, including Security Audit, Lint, Unit Tests, Type Check, Build Packages, `Build Docker - api`, Contract Tests, and `Deploy to Dev`.
- Dev health after deploy: `curl -fsS -D - https://dev.ai.megacampus.ru/health` returned `HTTP/2 200`, `x-environment: development`, queue `course-generation-dev`.

## E2E Evidence

- Command: `timeout 300 node output/playwright/dev-course-bridge-e2e.mjs`.
- Result: passed.
- Seeded playbook: `45b0932e-1dc9-450c-b85e-97239703ca03`.
- Created course: `ee09aae4-b39b-4857-84fe-a87bf755cf31`.
- Generating URL: `https://dev.ai.megacampus.ru/courses/default-organization/e2e-bridge-micro-course-20260613164505/generating`.
- Browser/API checks: `careerPlaybook.courseBridge.previewCourseFromPlaybook` 200; `careerPlaybook.courseBridge.createCourseFromPlaybook` 200; screenshots through generating page captured.
- DB post-check: course `generation_status = stage_2_awaiting_approval`, source file `vector_status = indexed`, `chunk_count = 2`, `processing_method = full_text`, job `document_processing` completed at 100% with no error.
- Artifacts: `output/playwright/course-bridge-dev/result.json`, screenshots, and logs.

## Verification

- Passed: `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/server/routers/career-playbook-course-bridge.service.test.ts` -> 19 tests.
- Passed: `pnpm --filter @megacampus/course-gen-platform type-check`.
- Passed: `pnpm --filter @megacampus/course-gen-platform lint` -> 0 errors, 95 warnings within budget.
- Passed: `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx` -> 19 tests.
- Passed: `pnpm --filter @megacampus/web type-check`.

## Docs And Graph

- docs-reviewed: updated - `.codex/handoff.md` and this stage summary record delivered behavior, CI/deploy IDs, live E2E evidence, and explicit defers.
- graph-reviewed: no-change-needed - closeout-only changes and the final hotfix did not introduce a new architectural boundary; earlier bridge graph refresh remains sufficient.

## Explicit Defers

- `mc2-dkkau`: `.claude/scripts/push-dev.sh` logs `Syncing Beads...` and calls unsupported `bd sync 2>/dev/null || true`; current installed `bd` has no `sync` subcommand. This did not block delivery, but the script should be corrected to use supported `bd dolt push` capability detection and visible warnings.
