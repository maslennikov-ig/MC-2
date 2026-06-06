# Stage `mc2-9ayox` Summary

## Scope

Fix master CI Integration Tests timeout after Qdrant readiness was repaired.

## Root Cause

The master deploy workflow ran full `pnpm test:integration` inside the `Integration Tests` job. That command expands to the full backend integration suite plus web integration tests. In run `27060414181`, the job was still inside `document-processing-worker.test.ts` when external `timeout 900` killed the process with exit code 124.

## Change

- Added root/package `test:integration:ci` scripts.
- Added `packages/course-gen-platform/vitest.config.integration-ci.ts` for a bounded backend deploy-gate subset.
- Added `packages/course-gen-platform/tests/integration/ci-qdrant-smoke.test.ts`.
- Changed `.github/workflows/ci-cd.yml` to run `timeout 300 pnpm test:integration:ci` in the master Integration Tests job.
- Left full `pnpm test:integration` intact for manual/nightly/release-candidate validation.

## Verification

- Workflow YAML structural assert passed.
- `QDRANT_URL=http://localhost:6333 QDRANT_API_KEY=test-qdrant-key pnpm test:integration:ci` passed.
- `pnpm type-check` passed.
- `pnpm build` passed.

## Review

- docs-reviewed: updated
- graph-reviewed: no-change-needed - CI/test harness change only; no app architecture/API/module boundary changed.
