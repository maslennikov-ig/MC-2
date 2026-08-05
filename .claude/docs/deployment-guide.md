# Deployment Guide

## Environments

| Environment | URL                          | Branch    | Deploy Strategy | Auto-deploy?            |
| ----------- | ---------------------------- | --------- | --------------- | ----------------------- |
| Staging     | https://ai.megacampus.ru     | `master`  | Blue/Green      | Yes (push)              |
| Dev         | https://dev.ai.megacampus.ru | `develop` | Rolling         | Yes (after `/push-dev`) |

Server: `95.81.98.230`, user: `claude-deploy`, path: `/opt/megacampus`

## Architecture Overview

### Docker Compose Files

| File                            | Purpose                                                     | Used by         |
| ------------------------------- | ----------------------------------------------------------- | --------------- |
| `docker-compose.infra.yml`      | Shared infra: redis, docling, worker, worker-s7, nlm-bridge | Staging + Dev   |
| `docker-compose.app.yml`        | App tier: web + api (dynamic ports via `$COLOR`)            | Staging (B/G)   |
| `docker-compose.production.yml` | Monolithic: all services (workers used in deploy step 12)   | Staging workers |
| `docker-compose.dev.yml`        | Dev: all services on isolated ports/queues                  | Dev             |
| `docker-compose.yml`            | Local development (redis + docling only)                    | Local dev       |

### Service Topology

**Staging (Blue/Green)**:

```
nginx → web:${WEB_PORT} + api:${API_PORT}
         ↓                    ↓
    megacampus-web-{color}  megacampus-api-{color}
                              ↓
                         megacampus-worker (from infra.yml)
                         megacampus-worker-stage6 (from production.yml)
                         megacampus-worker-stage7 (from infra.yml)
                         megacampus-notebooklm-bridge (from infra.yml)
                         megacampus-redis
                         megacampus-docling-mcp
```

**Dev**:

```
nginx → web-dev:3010 + api-dev:4010
         ↓                 ↓
    megacampus-web-dev   megacampus-api-dev
                           ↓
                      megacampus-worker-dev
                      megacampus-worker-stage6-dev
                      megacampus-worker-stage7-dev
                      megacampus-notebooklm-bridge-dev
                      (shared redis + docling from infra.yml)
```

## Environment Variables

### Client-Side Variables (NEXT*PUBLIC*\*)

Embedded into JavaScript bundle at **build time**. Changing requires image rebuild.

| Variable                            | Description                  | Default         |
| ----------------------------------- | ---------------------------- | --------------- |
| `NEXT_PUBLIC_SUPABASE_URL`          | Supabase project URL         | Required        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Supabase anon key            | Required        |
| `NEXT_PUBLIC_COURSEGEN_BACKEND_URL` | API backend URL for client   | Auto-detected\* |
| `NEXT_PUBLIC_SITE_URL`              | Site URL for links/redirects | Required        |

\*Auto-detection: In production (non-localhost), uses relative URL `/api` which nginx proxies to API.

### Server-Side Variables

Read at runtime, can be changed without rebuilding:

| Variable                      | Description                          | Default                         |
| ----------------------------- | ------------------------------------ | ------------------------------- |
| `COURSEGEN_BACKEND_URL`       | API URL for server-side calls        | `http://api:4000`               |
| `SUPABASE_SERVICE_ROLE_KEY`   | Service role key (server only)       | Required                        |
| `BULLMQ_QUEUE_NAME`           | Main queue name                      | `course-generation`             |
| `BULLMQ_STAGE6_QUEUE_NAME`    | Stage 6 queue name                   | `stage6-lesson-content`         |
| `BULLMQ_STAGE7_QUEUE_NAME`    | Stage 7 queue name                   | `stage7-enrichments`            |
| `USE_LOCAL_STORAGE`           | Use local filesystem for enrichments | `false`                         |
| `ENRICHMENTS_PUBLIC_URL`      | Public URL prefix for nginx          | —                               |
| `ENRICHMENTS_PUBLIC_BASE_URL` | Base domain for absolute URLs        | —                               |
| `ENRICHMENTS_LOCAL_PATH`      | Local storage path (workers only)    | —                               |
| `DOCLING_MCP_URL`             | Docling MCP endpoint                 | `http://docling-mcp:8000/mcp`   |
| `DOCLING_MCP_TIMEOUT`         | MCP tool timeout, milliseconds       | `1200000`                       |
| `DOCLING_MCP_MAX_RETRIES`     | Full-bundle reconnect retries        | `1`                             |
| `NOTEBOOKLM_BRIDGE_URL`       | NotebookLM bridge endpoint           | `http://notebooklm-bridge:8000` |
| `NOTEBOOKLM_BRIDGE_TOKEN`     | Bearer auth token for bridge         | Required                        |
| `LOG_LEVEL`                   | Pino log level                       | `info` (prod), `debug` (dev)    |

### Enrichment Storage (Critical)

Enrichments (audio, video, images) are stored on **local filesystem**, NOT Supabase Storage.

```
Worker (stage 7) → saves to ENRICHMENTS_LOCAL_PATH → ./data/enrichments/
Nginx → serves at /storage/enrichments/ → alias /opt/megacampus/data/enrichments/
API → builds URL using ENRICHMENTS_PUBLIC_URL + ENRICHMENTS_PUBLIC_BASE_URL
Browser → fetches from https://ai.megacampus.ru/storage/enrichments/...
```

**Both API and workers** must have `USE_LOCAL_STORAGE=true`. Without it on API, playback URLs return null (tries non-existent Supabase Storage).

| Variable                      | API                        | Workers                 |
| ----------------------------- | -------------------------- | ----------------------- |
| `USE_LOCAL_STORAGE`           | `true` (required)          | `true` (required)       |
| `ENRICHMENTS_PUBLIC_URL`      | `/storage/enrichments`     | `/storage/enrichments`  |
| `ENRICHMENTS_PUBLIC_BASE_URL` | `https://ai.megacampus.ru` | —                       |
| `ENRICHMENTS_LOCAL_PATH`      | —                          | `/app/data/enrichments` |

## Blue/Green Deployment

Release-bound deployment using immutable image digests and nginx port switching.
It is zero-downtime only after shared infrastructure and Qdrant are already
bootstrapped and verified; the ordinary deploy is not the first Q12 activation.

### Ports

| Slot  | Web  | API  |
| ----- | ---- | ---- |
| Blue  | 3001 | 4001 |
| Green | 3002 | 4002 |
| Dev   | 3010 | 4010 |

### Release-bound sequence

1. Require the exact 40-character release commit and read the active color.
2. Log in to GHCR when needed; pull the release-tagged `qdrant-operator`, resolve
   its repository digest, validate 64 lowercase hex, and persist only
   `QDRANT_OPERATOR_IMAGE_SHA256`.
3. Verify the manually managed Docling image and prepare host data directories.
4. Start the reviewed shared infrastructure with `.env.production`.
5. Resolve immutable web/API digests for both current and target colors and
   write mode-0600 color environment snapshots.
6. Run the authenticated Qdrant readiness/collections/schema verify-only gate.
   An empty first installation stops here; it must use the initial activation
   procedure below.
7. Recreate the inactive web/API color and health-check both services.
8. Record `deploy_state=status=switched`, atomically switch nginx, and update
   `active_color`.
9. Recreate main and Stage 6 workers from the same accepted color environment,
   update remaining changed background services, stop the old color, mark the
   transaction accepted, and prune only safe dangling/build cache data.

### Files

| File                                    | Role                                    |
| --------------------------------------- | --------------------------------------- |
| `docker-compose.infra.yml`              | Shared infra (redis, docling, workers)  |
| `docker-compose.app.yml`                | App services (web, api) with `$COLOR`   |
| `docker-compose.production.yml`         | Workers (stage6 restart in step 12)     |
| `deploy/nginx/megacampus.conf.template` | Nginx template (SINGLE SOURCE OF TRUTH) |
| `scripts/deploy_blue_green.sh`          | Deploy script (13 steps)                |
| `scripts/rollback_blue_green.sh`        | Rollback script (9 steps)               |
| `scripts/verify-nginx.sh`               | Nginx health check                      |

## Deploy Commands

### From Claude Code

```bash
# Deliver to Dev via develop
/push-dev                 # current branch -> develop -> dev.ai.megacampus.ru

# Deploy to Staging (master → ai.megacampus.ru)
/deploy

# Force deploy (skip type-check/build)
/deploy --force

# Create release (version bump + changelog, NOT deployment)
/push patch
```

### Manual (on server)

```bash
cd /opt/megacampus

# Deploy one immutable release commit
bash scripts/deploy_blue_green.sh production '<40-lowercase-hex-release-commit>'

# Roll back only that switched/accepted release transaction
bash scripts/rollback_blue_green.sh production '<same-40-character-release-commit>'
```

## CI/CD Pipeline

`.github/workflows/ci-cd.yml` — Node 22, pnpm 8.15.0

### Stages

1. **setup** — `pnpm install --frozen-lockfile`, cache
2. **changes** — `scripts/ci/detect_deploy_changes.sh` classifies changed paths and decides whether deploy/Docker build is needed
3. **Parallel checks** — lint, type-check, security, test-unit (`continue-on-error: true`)
4. **build** — Build all packages (depends on type-check)
5. **ci-success** — Gate: all critical checks passed
6. **build-docker** — Dynamic matrix build: changed `web`, `api`,
   `notebooklm-bridge`, and the deploy-relevant `qdrant-operator` target → GHCR
   - every release image receives the exact `${github.sha}` tag used by deploy;
   - mutable convenience tags are never consumed by the Qdrant operator path;
   - deploy resolves the operator tag to `repo@sha256:<digest>` and pre-pulls it;
   - Docling MCP/Serve are built only by the manual `build-docling-images.yml` workflow; no mutable tag is emitted
7. **deploy** (master only, deploy-relevant changes only) — SCP files to server, run `deploy_blue_green.sh`
8. **rollback** — Auto on deploy failure
9. **deploy-dev** (develop only, deploy-relevant changes only) — SCP `docker-compose.dev.yml` + nginx conf, run `deploy_dev.sh`
10. **notify** — Telegram notification only when deploy was relevant

### Deploy Gating

Docs/agent/artifact-only changes do not deploy or build Docker images. The workflow ignores pushes and pull requests that only touch:

- `.beads/**`, `.claude/**`, `.codex/**`, `.gemini/**`
- `docs/**`, `specs/**`, `output/**`, `.playwright-cli/**`
- Markdown-only files

Runtime changes are image-aware:

- `packages/web/**` builds/deploys `web`.
- `packages/course-gen-platform/**` builds/deploys `api`, except package-local docs/tests.
- `packages/shared-types/**`, `packages/shared-logger/**`, `packages/shared-utils/**`, root dependency/TS config files build/deploy both `web` and `api`.
- `packages/course-gen-platform/docker/notebooklm-bridge/**` builds/deploys `notebooklm-bridge`.
- Server deploy config such as `docker-compose*.yml`, `deploy/**`, `scripts/deploy*.sh`, and `nginx-docling-proxy.conf` can deploy without rebuilding images.

Deploy scripts receive `DEPLOY_WEB_CHANGED`, `DEPLOY_API_CHANGED`, `DEPLOY_BRIDGE_CHANGED`, and `DEPLOY_CONFIG_CHANGED` from CI. Manual server runs default these flags to `true` to preserve the full legacy deployment behavior.

### Post-CI Tests (non-blocking)

- `test-contract` — After ci-success, needs Redis, `continue-on-error: true`
- `test-integration` — After test-contract, master only, `continue-on-error: true`

## NotebookLM Bridge

FastAPI service wrapping `notebooklm-py` for AI audio/video generation.

| Property      | Value                                                    |
| ------------- | -------------------------------------------------------- |
| Image (prod)  | `ghcr.io/maslennikov-ig/mc-2/notebooklm-bridge:latest`   |
| Image (dev)   | `ghcr.io/maslennikov-ig/mc-2/notebooklm-bridge:develop`  |
| Port          | 8000 (internal), 8010 (dev external)                     |
| Build context | `packages/course-gen-platform/docker/notebooklm-bridge/` |
| Built in CI   | Yes (matrix build with web and api)                      |

Dev uses SOCKS5 geo-proxy: `HTTPS_PROXY=socks5h://172.19.0.1:1080`

See `.claude/docs/nlm-generation-guide.md` for NLM pipeline details.

## Docling Serve + MCP 3 images

The manual `build-docling-images.yml` workflow builds two CPU/amd64 images and
publishes only versioned tags. Copy its digest artifacts into repository
variables `DOCLING_SERVE_IMAGE` and `DOCLING_MCP_IMAGE`. Record the currently
running MCP 1.x image as `DOCLING_ROLLBACK_IMAGE` before the switch.

Normal deploys keep `DOCLING_STACK_V2_ENABLED=false`, so a client-first release
does not recreate Docling. Set it to `true` only after the A/B report is accepted
and a separate production deploy is approved. The deploy script rejects mutable
image references and verifies that the rollback digest matches the running MCP
container. After startup it performs an MCP initialize/list-tools probe; a
failed facade or tool check restores MCP 1.x and stops Docling Serve.

See `docs/DOCLING-MCP-REFERENCE.md` for topology, timeouts, quality settings,
benchmark commands, and rollback behavior.

## Rollback

### Self-hosted Qdrant activation boundary

The application runtime is designed for private, digest-pinned Qdrant `1.18.2`
at `http://qdrant:6333`. The stable `course_embeddings` alias points to a
versioned physical collection. Qdrant is a derived index: rebuild it from
`file_catalog` and authoritative source files; do not attempt to recover or
mutate the retired hosted proof-of-concept.

The repository includes Compose, `deploy/qdrant`, `deploy/systemd`, and
`ops/qdrant` assets. The owner authorized Q12 staging activation on 2026-07-12,
including live reindex, recovery, real notification, and document evidence at
`true/active/100`; no remote mutation has occurred. Activation remains NO-GO
until the project CA for verified remote migrations, off-host S3 inputs, and the
recorded authoritative source-path gaps are resolved.

Before an authorized activation, require:

1. Qdrant 1.18.2 matches `deploy/qdrant/image-lock.json`; Prometheus 3.13.1
   LTS, Grafana 12.4.5, node_exporter 1.12.0, and Alertmanager 0.33.1 match the
   separate monitoring ledger `ops/qdrant/image-lock.json`.
2. Target systemd is at least 247 (`LoadCredential`); verify the packaged
   `/opt/megacampus/deploy/qdrant/operator-compose.sh`, exact root-owned
   credentials, UID 1001 state, and conflict-free metrics GID. Host pnpm/source
   are not production prerequisites.
3. Qdrant, dashboard, Prometheus, Grafana, Alertmanager, and node_exporter are
   private/loopback only; `/metrics` is authenticated on listener 6333.
4. Native multilingual BM25/IDF, dense+sparse server RRF nested into Formula,
   strict indexes including float `document_weight`, and tenant isolation pass.
5. Reindex plan/execute/verify completes before atomic alias cutover; exact
   version snapshot/isolated restore and alias recreation are proven separately.

The exact preflight, monitoring, systemd, recovery, notification, and rollback
commands are maintained in `docs/operations/qdrant-self-hosted.md`.

### Q12 initial activation

Do not invoke `/deploy` first on an empty Qdrant: deploy runs verify-only and
must fail before traffic when the physical collection/alias is absent. After the
CA/S3/source NO-GO inputs are resolved, use the operations runbooks to:

1. apply and verify guarded migrations `120 -> 130 -> 140 -> 150 -> 151`;
2. provision exact assets, identities, directories, and secret metadata;
3. publish the release-SHA operator, resolve/persist/pre-pull its digest;
4. start only Qdrant and monitoring, then run `self-check`/`metrics-check`;
5. bootstrap before deploy verify, complete gap-free reindex and relevance/
   isolation checks, then prove snapshot/isolated restore and notifications;
6. invoke the normal release-bound deploy only after rollback evidence exists.

`/deploy --force`, mutable tags, and the retired Cloud endpoint are not
bootstrap alternatives.

Release-bound rollback follows the script's exact nine steps:

1. require the exact 40-character failed release commit and read active color;
2. require matching `deploy_state` at `switched` or `accepted`, then derive its
   recorded previous color;
3. verify the target color environment contains immutable web/API digests;
4. ensure shared infrastructure is running;
5. recreate the target web/API color from its preserved environment snapshot;
6. health-check both target services;
7. recreate the main and Stage 6 workers from that same target-color environment
   **before** traffic moves;
8. test/reload nginx, update `active_color`, and mark the transaction rolled back;
9. stop the broken app color while preserving diagnostics.

Do not promise an instant or fixed-duration rollback: image availability, cold
start, worker recreation, Qdrant/evidence containment, and health checks bound
the duration. This app rollback is separate from queue-quiesced evidence
containment and atomic alias rollback. It never down-migrates audit tables or
restores a snapshot over the active collection.

```bash
ssh megacampus-prod \
  "bash /opt/megacampus/scripts/rollback_blue_green.sh production '<40-character-release-commit>'"
```

## Nginx Configuration

**Single Source of Truth**: `deploy/nginx/`

| File                       | Environment | Description                         |
| -------------------------- | ----------- | ----------------------------------- |
| `megacampus.conf.template` | Staging     | Blue/Green with `{{WEB_PORT}}` vars |
| `megacampus-dev.conf`      | Dev         | Static ports 3010/4010              |

### Key Nginx Features

- **Enrichments**: `/storage/enrichments/` → `alias /opt/megacampus/data/enrichments/` with rate limiting (50r/s, burst 100)
  - Dev serves from the same `/opt/megacampus/data/enrichments/` (shared with staging)
- **API**: `/api/trpc/` rewritten to `/trpc/$1`, proxied to API upstream, 300s timeout
- **Bull Board**: `/admin/queues` IP-whitelisted (127.0.0.1, 95.81.98.230, 185.200.177.180, 80.74.28.160)
- **SSL**: Let's Encrypt, TLSv1.2 + TLSv1.3
- **Upload limit**: `client_max_body_size 100M`
- **Dev header**: `X-Environment: development`

### Manual Nginx Switch

**IMPORTANT**: Never edit `/etc/nginx/sites-enabled/megacampus` directly!

```bash
# 1. Check active color
cat /opt/megacampus/active_color  # → "blue" or "green"

# 2. Apply template with correct ports (example for blue)
sed -e 's/{{WEB_PORT}}/3001/g' -e 's/{{API_PORT}}/4001/g' -e 's/{{COLOR}}/blue/g' \
  /opt/megacampus/nginx.conf.template | sudo tee /etc/nginx/sites-enabled/megacampus > /dev/null

# 3. Test and reload
sudo nginx -t && sudo nginx -s reload
```

## Critical Operational Rules

### NEVER use `--remove-orphans` with docker compose

Our architecture uses **multiple compose files** sharing one Docker network (`megacampus-network`). Each compose file sees containers from other files as "orphans". Using `--remove-orphans` on any one file **kills containers from all other files**.

```
# WRONG — kills Redis, docling, workers:
docker compose -f docker-compose.app.yml up -d --remove-orphans

# CORRECT:
docker compose -f docker-compose.app.yml up -d --force-recreate
```

**Root cause of 2026-03-10 outage**: `--remove-orphans` in `deploy_blue_green.sh` killed Redis on every deployment. API containers lost BullMQ connection and never recovered (ioredis stays in "closed" state).

### NEVER create containers manually via `docker run`

Docker Compose automatically creates **DNS aliases** for each service (e.g., service `api` gets DNS alias `api` in the network). These aliases are used by:

- Health dashboard (`packages/web/app/api/admin/health/route.ts`) to check services
- Web container's `COURSEGEN_BACKEND_URL=http://api:4000`
- Workers connecting to `redis:6379`, `docling-mcp:8000`, etc.

Containers created via `docker run` do NOT get these aliases — only the container name is registered as DNS. This breaks inter-service communication.

```bash
# WRONG — no DNS alias "api", health dashboard breaks:
docker run --name megacampus-api-blue --network megacampus-network ...

# CORRECT — compose creates DNS alias "api" automatically:
docker compose -f docker-compose.app.yml --env-file .env.blue up -d api
```

### Service recovery order matters

If shared infrastructure dies, restart in this order:

```bash
cd /opt/megacampus

# 1. Infrastructure first (Redis, docling, workers)
docker compose -f docker-compose.infra.yml up -d

# 2. Then app tier (web, api) — MUST use compose, not docker run
docker compose -f docker-compose.app.yml --env-file .env.$(cat active_color) up -d

# 3. Then production workers
docker compose -f docker-compose.production.yml up -d

# 4. Dev environment (if needed)
docker compose -f docker-compose.dev.yml up -d
```

### Admin health dashboard dependencies

The health dashboard at `/admin` checks these services via Docker DNS:

| Service           | URL checked                            | Compose file     |
| ----------------- | -------------------------------------- | ---------------- |
| API               | `http://api:4000/health`               | `app.yml`        |
| Redis             | TCP `redis:6379`                       | `infra.yml`      |
| Docling MCP       | MCP connect + `listTools` on `/mcp`    | `infra.yml`      |
| NotebookLM Bridge | `http://notebooklm-bridge:8000/health` | `infra.yml`      |
| Supabase          | External HTTPS                         | Cloud (external) |

If any service shows red, verify: (1) container is running, (2) it was started via **docker compose** (not `docker run`), (3) it's on the `megacampus-network`.

### Docker image registry

All images use `ghcr.io/maslennikov-ig/mc-2/` prefix. The old prefix `ghcr.io/maslennikov-ig/megacampusai/` is deprecated. If image pulls fail with "denied", check and update image names in compose files.

---

## Troubleshooting

### Check current active color

```bash
cat /opt/megacampus/active_color
```

### Check container status

```bash
docker ps --filter "name=megacampus"
```

### View logs

```bash
# Web logs
docker logs megacampus-web-blue
docker logs megacampus-web-green

# API logs
docker logs megacampus-api-blue
docker logs megacampus-api-green

# Workers
docker logs megacampus-worker
docker logs megacampus-worker-stage7

# Dev
docker logs megacampus-api-dev
docker logs megacampus-worker-stage7-dev
```

### Health check manually

```bash
# Staging
curl -f http://localhost:3001      # web blue
curl -f http://localhost:3002      # web green
curl -f http://localhost:4001/health  # api blue
curl -f http://localhost:4002/health  # api green

# Dev
curl -f http://localhost:3010      # web dev
curl -f http://localhost:4010/health  # api dev
```

### All services red in admin health dashboard

**Symptom**: Admin panel shows all services as unhealthy (red), except database.

**Root causes** (check in order):

1. **API container created via `docker run`** — no DNS alias `api`. Fix: recreate via compose:

   ```bash
   docker stop megacampus-api-$(cat /opt/megacampus/active_color)
   docker rm megacampus-api-$(cat /opt/megacampus/active_color)
   docker compose -f docker-compose.app.yml --env-file .env.$(cat active_color) up -d
   ```

2. **Shared infrastructure down** (Redis, docling, etc.) — killed by `--remove-orphans` or manual cleanup:

   ```bash
   docker compose -f docker-compose.infra.yml up -d
   ```

3. **Network mismatch** — container on wrong Docker network:
   ```bash
   docker inspect megacampus-api-blue --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool
   # Should show megacampus-network
   ```

### Redis connection stuck after restart

**Symptom**: API logs show `[ioredis] Unhandled error: connect ECONNREFUSED`. Redis is running but API can't connect.

**Root cause**: ioredis connection pool stays in "closed" state after Redis restart. Simple `docker restart` does not help.

**Fix**: Full recreate of API container:

```bash
docker compose -f docker-compose.app.yml --env-file .env.$(cat /opt/megacampus/active_color) up -d --force-recreate api
```

### Docling MCP 502 Bad Gateway

**Symptom**: Admin health dashboard shows Docling MCP as "502 Bad Gateway". Document processing fails silently (empty error messages in error_logs).

**Root cause**: The `megacampus-docling-mcp` nginx proxy caches DNS at startup. If `megacampus-docling-mcp-internal` gets a new IP (after restart/redeploy), nginx sends traffic to the old IP → `connect() failed (111: Connection refused)`.

**Quick fix**:

```bash
docker restart megacampus-docling-mcp
```

**Permanent fix**: `nginx-docling-proxy.conf` now uses `resolver 127.0.0.11 valid=30s` + variable-based `proxy_pass` to re-resolve DNS dynamically. Redeploy infra to apply:

```bash
docker compose -f docker-compose.infra.yml up -d --force-recreate docling-mcp
```

**Verify**:

```bash
# From worker container — should return 200
docker exec megacampus-worker curl -s -o /dev/null -w '%{http_code}' http://megacampus-docling-mcp:8000/health

# Full MCP test — should return JSON-RPC response
docker exec megacampus-worker curl -s -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' \
  http://megacampus-docling-mcp:8000/mcp
```

### Data directory permissions

Containers run as UID 1001 (nodejs). If enrichments fail to save:

```bash
chown -R 1001:1001 /opt/megacampus/data/enrichments
```

## Local Development

When running locally with **shared Supabase** (cloud), configure queue isolation:

### Problem

- Local dev and staging share the same Supabase database
- Staging server runs 24/7 with its own outbox processor
- Without queue isolation, staging's outbox processor picks up your local jobs

### Solution

Add to `packages/course-gen-platform/.env`:

```bash
# Local development queue isolation
BULLMQ_QUEUE_NAME=course-generation-local
```

### If Jobs Were Already Created

```sql
-- Reset jobs to be picked up by local processor
UPDATE job_outbox
SET processed_at = NULL, target_queue = 'course-generation-local'
WHERE entity_id = '<course-id>';

-- Reset course status
UPDATE courses
SET generation_status = 'stage_2_init'
WHERE id = '<course-id>';
```

Then restart local backend/worker.

---

## Dev Environment (dev.ai.megacampus.ru)

Dev runs alongside staging on the same server with isolated resources.

### Key Differences from Staging

| Resource        | Staging                             | Dev                           |
| --------------- | ----------------------------------- | ----------------------------- |
| Compose file    | `app.yml` + `infra.yml`             | `docker-compose.dev.yml`      |
| Uploads dir     | `./data/uploads`                    | `./data/uploads-dev`          |
| Enrichments dir | `./data/enrichments`                | `./data/enrichments` (shared) |
| BullMQ main     | `course-generation`                 | `course-generation-dev`       |
| BullMQ stage6   | `stage6-lesson-content`             | `stage6-lesson-content-dev`   |
| BullMQ stage7   | `stage7-enrichments`                | `stage7-enrichments-dev`      |
| Ports           | 3001/4001 (blue), 3002/4002 (green) | 3010/4010                     |
| NLM bridge port | internal only                       | 8010                          |
| Docker images   | `:latest`                           | `:develop`                    |
| Workers         | 3 separate containers               | 3 separate containers         |

### Shared Infrastructure

`docling-mcp-internal` in `docker-compose.infra.yml` mounts BOTH upload directories:

```yaml
volumes:
  - ./data/uploads:/app/uploads:ro
  - ./data/uploads-dev:/app/uploads-dev:ro # Required for dev!
```

### Deploying Dev Changes

```bash
# Auto-deploy on push to develop
git push  # → dev.ai.megacampus.ru

# Manual restart
ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.dev.yml up -d"
```

## Related Docs

- `.claude/docs/nlm-generation-guide.md` — NLM audio/video generation pipeline
- [ADR-004: Blue/Green Deployment Strategy](../../docs/ADR-004-blue-green-deployment.md)
- [ADR-005: Deployment Strategy and Environment Architecture](../../docs/ADR-005-deployment-strategy.md)
- [RFC-001: Branching Strategy](../../docs/RFC-001-branching-strategy.md)
- [Nginx Config README](../../deploy/nginx/README.md)
