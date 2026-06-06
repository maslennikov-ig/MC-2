# Stage `mc2-yyxzc` Summary

## Scope

- Investigated non-blocking master `Integration Tests` Qdrant readiness failures.
- Fixed `.github/workflows/ci-cd.yml` by adding the missing `qdrant` service to the `test-integration` job.

## Root Cause

- Runs `26950380871` and `27055076683` failed on `Wait for Qdrant`.
- `test-integration` waited on `http://localhost:6333/readyz` and passed local Qdrant env to tests, but only declared a `redis` service.
- Qdrant had been added to `test-contract`, not to the job that waits for it.

## Verification

- Parsed `.github/workflows/ci-cd.yml` with Python YAML and asserted:
  - `test-integration.services.qdrant` exists.
  - `QDRANT__SERVICE__API_KEY` is `test-qdrant-key`.
  - `6333:6333` is mapped.
  - `Wait for Qdrant` still checks `/readyz` with the matching API key.
  - `Run integration tests` uses `QDRANT_URL=http://localhost:6333` and `QDRANT_API_KEY=test-qdrant-key`.
- `git diff --check` passed.
- `actionlint` is not installed locally.

## Closeout Notes

- project-index: reviewed-no-change - no stable route, module, package, or verification entrypoint changed; only an existing CI job gained the missing service container.
- docs-reviewed: updated - `.codex/handoff.md` and this stage summary now record the CI root cause, local fix, and remaining GitHub Actions evidence requirement.
- graph-reviewed: no-change-needed - workflow/handoff-only change; no source-code structure, API, or architecture graph boundary changed.
