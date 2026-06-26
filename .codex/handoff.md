# Orchestrator Handoff

Updated: 2026-06-26
Stage: `mc2-db696.83` Career Playbook live-smoke fixes completed locally
Branch: `codex/career-playbook-live-smoke-fixes`
Beads: `mc2-db696.83`, `mc2-db696.84`, `mc2-db696.85`, `mc2-6g1rr` ready to close after final closeout; follow-ups `mc2-db696.86`, `mc2-db696.87` open

## Current State

- Implemented rollout-compatible Career Playbook public share fallback for environments missing image columns, plus idempotent repair migration `20260626153000_repair_career_playbook_image_columns.sql`.
- Hardened shared Jina embedding generation with provider-side `truncate: true` and adaptive split/retry for late-chunking token-window 422 responses.
- Updated official Career Playbook live smoke to submit `business_context`, support resume mode, wait for course document-processing status, and surface course bridge document-processing failures.
- Added Career Playbook group-generator fallback content and critical structured quality issues when required model group blocks are missing.
- Fixed backend tRPC auth header extraction so lowercase `authorization` works in local/live smoke clients.
- Live mutation smoke passed on a disposable fixture using local API/worker and dedicated queue.
- Smoke cleanup completed and was verified: generated playbooks/courses/files/jobs/errors/org/user/auth user removed, local upload directory removed, queue obliterated, and Qdrant vectors for smoke course IDs deleted.

## Verification

- `git diff --check` passed before closeout metadata edits.
- Targeted backend unit tests passed: `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/career-playbook-library-service.test.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/shared/embeddings/generate.test.ts tests/unit/smoke/career-playbook-live-smoke.test.ts tests/unit/stages/stage-career-playbook/group-generator.test.ts tests/unit/stages/stage-career-playbook/final-assembler.test.ts` — 6 files / 88 tests.
- `pnpm type-check` passed.
- `pnpm build` passed.
- Live Career Playbook mutation smoke with `--include-course-bridge` passed:
  - all 27 required blocks generated;
  - deterministic checks passed;
  - PDF export succeeded;
  - public share resolved through slug;
  - course bridge created a course and document processing reached `stage_2_awaiting_approval`.

## Explicit defers

- `mc2-db696.86`: configured dev/staging cloud Qdrant endpoint returned `Not Found`; live E2E passed by overriding to local Docker Qdrant. Fix endpoint/key/collection config before relying on deployed dev worker course bridge Stage 2.
- `mc2-db696.87`: Career Playbook cleanup helper has an import-time side effect in tsx stdin/script contexts; cleanup used an inline safe script. Make cleanup utilities import-safe.
- Pre-existing build warnings were not fixed: stale Browserslist `caniuse-lite` data and Node `[DEP0169] url.parse()` deprecation during Next build.
- No merge/deploy has been performed for this stage yet.

## Next recommended

Next stage id: `mc2-db696.86`
Recommended action: finish stage closeout, commit and push `codex/career-playbook-live-smoke-fixes`, then deliver to `develop` via the repo's normal dev path only after explicit merge/deploy authorization.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Continue from branch `codex/career-playbook-live-smoke-fixes` and stage `mc2-db696.83`. The implementation and live mutation smoke passed; verify closeout state, ensure Beads/stage artifacts are current, then push the feature branch. Do not merge to `develop` or deploy without explicit current authorization. Track remaining work in `mc2-db696.86` and `mc2-db696.87`.

## Closeout Markers

docs-reviewed: no-change-needed - touched behavior is internal backend/smoke resilience and one DB repair migration; stable project index already lists the relevant entrypoints and no public/operator docs need new instructions beyond Beads defers.
graph-reviewed: updated - `graphify update . --force` rebuilt the local code graph, then `graphify cluster-only . --no-viz` refreshed `GRAPH_REPORT.md`; final report shows 52,602 nodes, 77,116 edges, and 3,273 communities.
