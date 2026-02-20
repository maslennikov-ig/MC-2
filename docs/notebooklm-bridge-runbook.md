# NotebookLM Bridge Runbook

## Purpose

`notebooklm-bridge` is an internal service used by Stage 7 NLM enrichments (`nlm_audio`, `nlm_video`).  
API/worker call it through the existing TypeScript client using:

- `NOTEBOOKLM_BRIDGE_URL`
- `NOTEBOOKLM_BRIDGE_TOKEN`

## Environment Variables

- `NOTEBOOKLM_BRIDGE_URL`
  - Dev compose: `http://notebooklm-bridge-dev:8000`
  - Production compose: `http://notebooklm-bridge:8000`
  - These are wired directly in compose for API + Stage 7 worker.
- `NOTEBOOKLM_BRIDGE_TOKEN`
  - Shared bearer token for bridge authentication.
  - Set in `.env.dev` / `.env.production` (see examples).
- `NOTEBOOKLM_UPSTREAM_EMAIL`
- `NOTEBOOKLM_UPSTREAM_PASSWORD`
  - Upstream NotebookLM credentials used by bridge service.
  - Set in `.env.dev` / `.env.production` (see examples).

## Local Run (Dev Compose)

1. Add bridge vars to `.env.dev` (copy placeholders from `.env.production.example` / `.env.example`).
2. Start services:

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d notebooklm-bridge-dev api-dev worker-stage7-dev
```

3. Verify bridge health from host:

```bash
curl -sSf http://127.0.0.1:8010/health
```

4. Check logs if needed:

```bash
docker compose -f docker-compose.dev.yml logs -f notebooklm-bridge-dev
```

## Production Ops

- Start/restart bridge:

```bash
docker compose -f docker-compose.production.yml up -d notebooklm-bridge
```

- Check status/logs:

```bash
docker compose -f docker-compose.production.yml ps notebooklm-bridge
docker compose -f docker-compose.production.yml logs --tail=100 notebooklm-bridge
```

- Token rotation:
  1. Update `NOTEBOOKLM_BRIDGE_TOKEN` in `.env.production`.
  2. Restart `notebooklm-bridge`, `api`, and `worker-stage7`.
