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
  - Mounted **read-write** into the bridge container as `/app/secrets/notebooklm`. It was `:ro`
    until 2026-08-25, and that is not a hardening detail: `notebooklm-py` re-issues the rotating
    half of the session (`__Secure-1PSIDTS`, `__Secure-3PSIDTS`, `SIDCC`) while it works and writes
    it back. Mounted `:ro` it could not, and said so only at WARNING —
    `Failed to write updated cookies … Read-only file system`.
- `NOTEBOOKLM_MASTER_TOKEN_REFRESH_ENABLED` (default `true`)
  - The browserless cookie re-mint. See "Cookie refresh" below.
- `NOTEBOOKLM_MASTER_TOKEN_REFRESH_INTERVAL_SECONDS` (default `604800`, one week)
- `NOTEBOOKLM_MASTER_TOKEN_REFRESH_CHECK_INTERVAL_SECONDS` (default `3600`)
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
`NOTEBOOKLM_STORAGE_PATH`.

## Cookie refresh (no browser)

Cookies expired on 2026-03-31 and were noticed on 2026-08-22. The cause was not the expiry, it was
that every refresh needed a person with a browser and a password, so a refresh only ever happened
after something had already broken.

Since 2026-08-25 the bridge holds a durable `aas_et/` **master token** and re-mints the web session
from it with no browser at all. The loop lives in `app/master_token_refresh.py`, runs inside the
service, and therefore arrives wherever the image does — deliberately not a `deploy/systemd` timer,
because CI does not install those and `is-active` is green whether or not the file ever moves.

- Bootstrap (one browser sign-in, ever): `notebooklm login --master-token --account EMAIL
--oauth-token …`, run inside the container. The `oauth_token` is a single-use cookie from
  `accounts.google.com/EmbeddedSetup`. See `notebooklm-server-auth-refresh.md`.
- The durable token lands at `$NOTEBOOKLM_HOME/profiles/default/master_token.json`, mode 0600 —
  **not** beside `storage_state.json`, whatever the upstream docstring says. `get_storage_path`
  falls back to the home root; `get_master_token_path` does not.
- Judge it by the file, never by a status line: `stat -c %y` on `storage_state.json` must move.
  `/health` carries a `master_token` check that fails out loud when no token is present.

### Running the CLI in this container

Always put `--storage` **before** the subcommand:

```bash
notebooklm --storage /app/secrets/notebooklm/storage_state.json login --master-token-refresh
```

There are two flags spelled `--storage` — one on the group, one on `login` — and only the group's
one skips the CLI's startup migration, which MOVES the home-root `storage_state.json` into
`profiles/default/`. Both bridges read the home-root path, so `notebooklm login
--master-token-refresh` (no group flag) deletes the file the service depends on; measured on
2026-08-25, `/health` went to `auth_file: Not found` on both. The refresh loop reconciles that
within a tick and logs it at WARNING, but the position of the flag is what avoids it.

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
