# Code Review Report: NLM Enrichments + NotebookLM Bridge

Date: 2026-02-20
Epic: `mc2-ccfza`

## Scope

Implemented and verified:

- New two-stage enrichment types:
  - `nlm_audio`
  - `nlm_video`
- New backend handlers and router wiring for Stage 7 generation flow.
- New `notebooklm-bridge-client` in API/worker runtime.
- New Python service `packages/course-gen-platform/docker/notebooklm-bridge` with:
  - `GET /health`
  - `POST /artifacts/generate-audio`
  - `POST /video/generate-overview`
  - Bearer auth via `NOTEBOOKLM_BRIDGE_TOKEN`
- Docker/ENV integration for dev/prod compose.
- Runbook for setup and operations.

## Key Files

- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-audio-handler.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-video-handler.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/services/enrichment-router.ts`
- `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`
- `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx`
- `packages/course-gen-platform/docker/notebooklm-bridge/app/main.py`
- `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`
- `packages/course-gen-platform/docker/notebooklm-bridge/tests/test_api.py`
- `docker-compose.dev.yml`
- `docker-compose.production.yml`
- `.env.example`
- `.env.production.example`
- `docs/notebooklm-bridge-runbook.md`

## Manual Review Notes

1. Contract compatibility checked between TS bridge client and Python bridge endpoints.
2. Removed inaccurate upstream email/password env assumptions from docs/examples.
3. Standardized auth-state flow via `notebooklm` CLI `storage_state.json` mounted into bridge container.
4. Defaulted bridge fallback to strict mode (`NOTEBOOKLM_ALLOW_FALLBACK=false`) to avoid silent placeholder artifacts in production.
5. Fixed TypeScript regression in `UnifiedEnrichmentCard` (invalid property access on `AudioDraftContent`).

## Verification Evidence

Executed locally:

```bash
cd packages/course-gen-platform/docker/notebooklm-bridge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q tests/test_api.py
```

Result: `5 passed`.

```bash
pnpm --filter @megacampus/course-gen-platform test -- \
  tests/unit/stages/stage7-notebooklm-bridge-client.test.ts \
  tests/unit/stages/stage7-enrichment-router.test.ts \
  tests/unit/enrichment-procedures/is-two-stage-type.test.ts
```

Result: `3 files, 21 tests passed`.

```bash
pnpm --filter @megacampus/web test -- \
  components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx \
  components/course/viewer/__tests__/EnrichmentsPanel.test.ts \
  components/course/viewer/__tests__/enrichment-config.test.ts
```

Result: `3 files, 58 tests passed`.

```bash
pnpm type-check
```

Result: passed for all workspaces after fixing `UnifiedEnrichmentCard` type issue.

```bash
pnpm lint
```

Result: passed (project baseline warnings only; no lint errors).

```bash
pnpm build
```

Result: passed for all workspaces (including Next.js production build).

```bash
cp .env.example .env.dev
cp .env.production.example .env.production
docker compose -f docker-compose.dev.yml --env-file .env.dev config
docker compose -f docker-compose.production.yml --env-file .env.production config
rm -f .env.dev .env.production
```

Result: both compose configs resolved successfully.

## Residual Risks

- `notebooklm-py` depends on browser auth state freshness (`storage_state.json`). Expired auth will cause generation failures until refreshed.
- Fallback mode remains available by explicit env (`NOTEBOOKLM_ALLOW_FALLBACK=true`); review this setting carefully in production.
