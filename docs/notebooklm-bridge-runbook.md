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
  - Generate it locally (for example `openssl rand -hex 32`) and set the same value in:
    - bridge service env (`NOTEBOOKLM_BRIDGE_TOKEN`)
    - API/worker env (`NOTEBOOKLM_BRIDGE_TOKEN`)
- `NOTEBOOKLM_AUTH_JSON`
  - Preferred auth mode for dev/stage/prod.
  - Set to the raw `storage_state.json` JSON payload (usually from secret manager).
  - Keep `NOTEBOOKLM_STORAGE_PATH` empty when this is set.
  - Empty value is treated as disabled (bridge falls back to file mode).
- `NOTEBOOKLM_STORAGE_STATE_DIR`
  - Local file fallback: host directory that contains `storage_state.json` for `notebooklm-py`.
  - Mounted read-only into bridge container as `/app/secrets/notebooklm`.
- `NOTEBOOKLM_STORAGE_PATH`
  - Optional file fallback path in-container.
  - If set, bridge client initialization will prefer this path.
- `NOTEBOOKLM_HOME`
  - File fallback directory, default `/app/secrets/notebooklm`.
  - Used when `NOTEBOOKLM_STORAGE_PATH` is empty.

## Upstream NotebookLM Auth State

Preferred for dev/stage/prod: set `NOTEBOOKLM_AUTH_JSON` with the browser auth payload.
You can still generate it via `notebooklm` CLI:

```bash
mkdir -p ./secrets/notebooklm
notebooklm --storage ./secrets/notebooklm/storage_state.json login
export NOTEBOOKLM_AUTH_JSON="$(cat ./secrets/notebooklm/storage_state.json)"
```

Local file fallback is also supported using `NOTEBOOKLM_STORAGE_STATE_DIR` +
`NOTEBOOKLM_STORAGE_PATH`. If file auth expires, run the login command again to
refresh it.

## Local Run (Dev Compose)

1. Add bridge vars to `.env.dev` (copy placeholders from `.env.production.example` / `.env.example`).
   - Set `NOTEBOOKLM_BRIDGE_TOKEN`.
   - Preferred: set `NOTEBOOKLM_AUTH_JSON` and leave `NOTEBOOKLM_STORAGE_PATH` empty.
   - Local file fallback: set `NOTEBOOKLM_STORAGE_STATE_DIR` (default `./secrets/notebooklm`).
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
