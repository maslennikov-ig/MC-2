# Orchestrator Handoff

Updated: 2026-06-26
Stage: Career Playbook images + E2E verification complete locally; delivery/commit/push pending
Branch: `codex/single-source-course-generation-flow`
Beads: `mc2-06s02` closed; `mc2-pmrmf`, `mc2-pmrmf.1`, `mc2-db696.11`, `mc2-db696.11.5` updated/blocked

## Current State

- Implemented generated 1:1 WebP card images for Career Playbooks / Role Guides.
- New `career_playbooks` image state columns are covered by migration: status, content, metadata, attempts, error message, and update timestamp.
- Career Playbook prompt registry includes `career_playbook_card`, with DB seed/update migration and typed prompt variables.
- Career Playbook BullMQ payloads support `GENERATE_IMAGE`; completed playbook persistence enqueues deterministic image jobs best-effort.
- New image generation service reuses course card image generation, WebP conversion, unified storage, `CardEnrichmentContent`, `EnrichmentMetadata`, and prompt service.
- Image generation failures mark only image state as failed and preserve completed playbook status.
- Owner-only `careerPlaybook.library.regenerateImage` queues image regeneration from the viewer flow.
- Library, authenticated viewer, and public viewer read paths expose image URL/status/alt/error fields and tolerate invalid `image_content` with a warning.
- Web library cards, authenticated viewer, inspector rail, and public viewer render generated images with fallback states and localized image status copy.
- Dry-run backfill script added for completed playbooks missing completed images; it only enqueues when run with `--enqueue`.
- Fixed Playwright managed webServer for Career Playbook E2E: Next now runs in `NODE_ENV=development` with `NEXT_PUBLIC_E2E=1`, so dev CSP allows local backend tRPC while test-only wizard auto-open stays disabled.
- Extracted `resolvePlaywrightWebServer` into a side-effect-free helper so Vitest does not import full Playwright runtime config.
- Fixed backend runtime import for `cardEnrichmentContentSchema`; authenticated viewer tRPC now loads the seeded `Sales Director` fixture.
- Durable docs updated in `docs/career-playbook/architecture.md`.

## Verification

- Direct backend health + authenticated tRPC `careerPlaybook.library.get` passed for fixture `00000000-0000-4000-8000-000000002001`.
- Official browser E2E passed: `pnpm --filter @megacampus/web test:e2e:career-playbook` — 5/5.
- Read-only smoke preflight passed on dev: `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target dev`.
- Read-only smoke preflight passed on staging with dedicated queue name: `BULLMQ_QUEUE_NAME=career-playbook-smoke-20260626 pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target staging`.
- Live staging mutation smoke remains blocked in non-mutating plan mode: missing tRPC URL, bearer token, expected disposable user/org ids, cleanup scope, max cost, and `--confirm-live-mutation`.
- Focused shared-types Vitest passed: `tests/career-playbook.test.ts` — 19 tests.
- Focused backend Vitest passed: `career-playbook-library-service`, `career-playbook-handler`, `stage-career-playbook-image-generation` — 23 tests.
- Focused web Vitest passed: `playwright-config`, Career Playbook viewer/library/public viewer/page-client tests — 37 tests.
- `pnpm type-check` passed.
- `pnpm build` passed.
- `git diff --check` passed.
- Graphify refreshed with `graphify update . --force`: 53,432 nodes, 78,354 edges, 3,289 communities.

## Explicit defers

- Existing completed Career Playbooks are not backfilled automatically. Use the new dry-run script first, then run with `--enqueue` only after explicit data-mutation authorization.
- Open Graph / social preview image support remains out of v1.
- Full live Dev/Staging Career Playbook mutation smoke was not run. Permission/budget were granted, but the runner still needs concrete disposable fixture/env values, API+worker dedicated queue alignment, and a real cleanup operation; its cleanup manifest is dry-run only.
- Phase 11 10-concurrent load test remains blocked downstream of live staging mutation smoke.
- Pre-existing build warnings were not fixed: Browserslist `caniuse-lite` stale, Supabase Edge runtime warnings, and Node `[DEP0169] url.parse()` deprecation in `next build`.

## Next recommended

Next stage id: `mc2-career-playbook-live-smoke-fixtures`
Recommended action: provision a disposable staging user/org/token, choose dedicated queue names for API and worker, define cleanup SQL/storage steps, set max-cost budget, then run `career-playbook-live-smoke --mode mutation-smoke` with `--include-course-bridge` only after API and worker are confirmed on the same queue.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Continue from `mc2-pmrmf`, `mc2-pmrmf.1`, `mc2-db696.11`, and `mc2-db696.11.5`: local Career Playbook E2E and build gates passed on 2026-06-26, but live mutation smoke is still blocked on disposable staging fixture/env, API+worker dedicated queue alignment, max-cost setting, and cleanup execution. Do not run mutation smoke until those values are present and cleanup is executable, not only a dry-run manifest.

## Closeout Markers

docs-reviewed: updated - `docs/career-playbook/architecture.md`, Beads notes, and this handoff reflect the new Career Playbook image behavior plus the Playwright E2E CSP/env fix.
graph-reviewed: updated - `graphify update . --force` completed after final code/test/handoff changes.
