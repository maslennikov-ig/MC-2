# Deployment Guide

## Environments

| Environment | URL                          | Branch    | Deploy Strategy | Auto-deploy? |
| ----------- | ---------------------------- | --------- | --------------- | ------------ |
| Staging     | https://ai.megacampus.ru     | `master`  | Blue/Green      | Yes (push)   |
| Dev         | https://dev.ai.megacampus.ru | `develop` | Rolling         | Yes (push)   |

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
| `DOCLING_MCP_URL`             | Docling MCP endpoint                 | `http://docling-mcp:8000/sse`   |
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

Zero-downtime deployment using nginx port switching.

### Ports

| Slot  | Web  | API  |
| ----- | ---- | ---- |
| Blue  | 3001 | 4001 |
| Green | 3002 | 4002 |
| Dev   | 3010 | 4010 |

### How It Works (13 steps)

1. **Read** active color from `active_color` file (default `blue`)
2. **Check** docling-mcp image exists (fails hard if missing — 8GB, manually built)
3. **Create** data dirs with `chown -R 1001:1001` (nodejs user in containers)
4. **Start infra**: `docker compose -f docker-compose.infra.yml up -d`
5. **Prepare** `.env.$NEW_COLOR` from `.env.production`
6. **Docker login** to GHCR (if `$GITHUB_TOKEN` set)
7. **Deploy app**: stop old color, pull images, `docker compose -f docker-compose.app.yml up --force-recreate`
8. **Health check**: API (12 attempts x 5s = 60s), then Web (12 x 5s)
9. **Switch nginx**: apply template via `sed`, test, reload
10. **Update** `active_color` file
11. **Stop** old color containers
12. **Update workers**: pull+restart `worker`, `worker-stage6` from `production.yml`; `worker-stage7`, `notebooklm-bridge` from `infra.yml`
13. **Cleanup**: `docker image prune -f` (dangling only), `builder prune --filter until=168h`, disk usage report

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
# Push to Dev (auto-deploys)
git push                  # develop → dev.ai.megacampus.ru

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

# Deploy
bash scripts/deploy_blue_green.sh production latest

# Rollback to previous color
bash scripts/rollback_blue_green.sh
```

## CI/CD Pipeline

`.github/workflows/ci-cd.yml` — Node 22, pnpm 8.15.0

### Stages

1. **setup** — `pnpm install --frozen-lockfile`, cache
2. **Parallel checks** — lint, type-check, security, test-unit (`continue-on-error: true`)
3. **build** — Build all packages (depends on type-check)
4. **ci-success** — Gate: all critical checks passed
5. **build-docker** — Matrix build: `web`, `api`, `notebooklm-bridge` → GHCR
   - `master`: tags `latest` + `master-<sha>`
   - `develop`: tags `develop` + `develop-<sha>`
   - `docling-mcp` is NOT built in CI (too large)
6. **deploy** (master only) — SCP files to server, run `deploy_blue_green.sh`
7. **rollback** — Auto on deploy failure
8. **deploy-dev** (develop only) — SCP `docker-compose.dev.yml` + nginx conf, run `deploy_dev.sh`
9. **notify** — Telegram notification

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

## Docling MCP Image

**IMPORTANT:** NOT built in CI/CD — too large (~8GB with PyTorch/CUDA).

| Property      | Value                                              |
| ------------- | -------------------------------------------------- |
| Image name    | `ghcr.io/maslennikov-ig/mc-2/docling-mcp:latest`   |
| Size          | ~8GB                                               |
| Build context | `packages/course-gen-platform/docker/docling-mcp/` |
| Pull policy   | `if_not_present` (never auto-pull)                 |
| RAM limit     | 4G                                                 |

### Manual Build (on server)

```bash
cd /opt/megacampus
docker build -t ghcr.io/maslennikov-ig/mc-2/docling-mcp:latest \
  -f packages/course-gen-platform/docker/docling-mcp/Dockerfile .
```

### If Image Missing After Cleanup

```bash
# Option 1: Retag from old name (if exists)
docker tag ghcr.io/maslennikov-ig/megacampusai/docling-mcp:latest \
  ghcr.io/maslennikov-ig/mc-2/docling-mcp:latest

# Option 2: Rebuild (takes ~30 min)
cd /opt/megacampus
docker build -t ghcr.io/maslennikov-ig/mc-2/docling-mcp:latest \
  -f packages/course-gen-platform/docker/docling-mcp/Dockerfile .
```

### Protect from Cleanup

```bash
# Use selective prune (dangling only, not -a)
docker image prune -f

# Or exclude docling when using -a
docker image prune -a --filter "label!=docling"
```

## Rollback

Instant rollback via nginx reload (9 steps):

1. Read active color, derive target (opposite)
2. Verify `.env.$TARGET_COLOR` exists
3. Start infra
4. Start target app containers
5. Health check target (6 attempts x 5s = 30s per service)
6. Apply nginx template → target
7. Update `active_color`
8. Stop broken color

**Time to rollback**: ~30 seconds

**Note**: Rollback does NOT restart workers (by design).

```bash
ssh megacampus-prod "bash /opt/megacampus/scripts/rollback_blue_green.sh"
```

## Nginx Configuration

**Single Source of Truth**: `deploy/nginx/`

| File                       | Environment | Description                         |
| -------------------------- | ----------- | ----------------------------------- |
| `megacampus.conf.template` | Staging     | Blue/Green with `{{WEB_PORT}}` vars |
| `megacampus-dev.conf`      | Dev         | Static ports 3010/4010              |

### Key Nginx Features

- **Enrichments**: `/storage/enrichments/` → `alias /opt/megacampus/data/enrichments/` with rate limiting (50r/s, burst 100)
  - Dev serves from `/opt/megacampus/data/enrichments-dev/`
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

### Data directory permissions

Containers run as UID 1001 (nodejs). If enrichments fail to save:

```bash
chown -R 1001:1001 /opt/megacampus/data/enrichments
chown -R 1001:1001 /opt/megacampus/data/enrichments-dev
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

| Resource        | Staging                             | Dev                         |
| --------------- | ----------------------------------- | --------------------------- |
| Compose file    | `app.yml` + `infra.yml`             | `docker-compose.dev.yml`    |
| Uploads dir     | `./data/uploads`                    | `./data/uploads-dev`        |
| Enrichments dir | `./data/enrichments`                | `./data/enrichments-dev`    |
| BullMQ main     | `course-generation`                 | `course-generation-dev`     |
| BullMQ stage6   | `stage6-lesson-content`             | `stage6-lesson-content-dev` |
| BullMQ stage7   | `stage7-enrichments`                | `stage7-enrichments-dev`    |
| Ports           | 3001/4001 (blue), 3002/4002 (green) | 3010/4010                   |
| NLM bridge port | internal only                       | 8010                        |
| Docker images   | `:latest`                           | `:develop`                  |
| Workers         | 3 separate containers               | 3 separate containers       |

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
