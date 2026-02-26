# NLM Timeout Hardening to 60 Minutes (2026-02-21)

## Summary

Aligned NotebookLM audio/video generation timeouts to **60 minutes** across:

- Stage7 TypeScript bridge client (API/worker -> bridge HTTP call timeout)
- Python NotebookLM bridge service defaults (generation and queue wait)
- Local/dev/prod runtime wiring (`start-dev.sh`, `docker-compose`)
- Frontend long-running NLM progress window (`nlm_audio`, `nlm_video`)
- Smoke/preflight scripts used for local validation

## Files Changed

- `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`
  - Default bridge timeout changed to `60 * 60 * 1000`.
- `packages/course-gen-platform/tests/unit/stages/stage7-notebooklm-bridge-client.test.ts`
  - Updated assertions/messages to `3600000ms`.
- `packages/course-gen-platform/docker/notebooklm-bridge/app/config.py`
  - `NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS` default -> `3600.0`
  - `NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS` default -> `3600.0`
- `packages/course-gen-platform/docker/notebooklm-bridge/README.md`
  - Updated default timeout docs to `3600`.
- `packages/web/lib/hooks/useEnrichmentGeneration.ts`
  - NLM max generation duration -> `60 * 60 * 1000`.
- `packages/web/lib/hooks/__tests__/useEnrichmentGeneration.test.ts`
  - Updated expectations/test description for 60-minute duration.
- `packages/web/components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx`
  - Updated long-running countdown test inputs/expectations for 60-minute window.
- `scripts/nlm-preflight.sh`
  - Default `--timeout-seconds` -> `3600`.
- `packages/course-gen-platform/scripts/nlm-stage7-smoke.ts`
  - Default `--timeout-seconds` -> `3600`.
- `.env.example`
  - Added explicit defaults:
    - `NOTEBOOKLM_BRIDGE_TIMEOUT_MS=3600000`
    - `NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS=3600`
    - `NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS=3600`
- `packages/course-gen-platform/.env.example`
  - Added same explicit defaults as above.
- `docker-compose.dev.yml`
  - Added/normalized defaults:
    - Bridge: `NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS`, `NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS`
    - API/Stage7 worker: `NOTEBOOKLM_BRIDGE_TIMEOUT_MS`
- `docker-compose.production.yml`
  - Added/normalized defaults:
    - Bridge: `NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS`, `NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS`
    - API/Stage7 worker: `NOTEBOOKLM_BRIDGE_TIMEOUT_MS`
- `start-dev.sh`
  - Exports 60-minute timeout defaults for local API/worker.
  - Passes 60-minute generation/queue timeouts to local bridge container.

## Verification

Executed tests:

1. `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage7-notebooklm-bridge-client.test.ts`
   - Result: **passed** (9 tests)

2. `cd packages/course-gen-platform/docker/notebooklm-bridge && .venv/bin/python -m pytest -q tests/test_queue.py tests/test_api.py`
   - Result: **passed** (18 tests)

3. `pnpm --filter @megacampus/web test -- lib/hooks/__tests__/useEnrichmentGeneration.test.ts components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx`
   - Result: **passed** (89 tests)

## Notes for Runtime

- If any deployment environment still has explicit old timeout env values, those values will override defaults.
- For local dev, restart via `start-dev.sh` so the bridge image/container picks up updated defaults.
