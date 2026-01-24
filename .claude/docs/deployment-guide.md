# Deployment Guide

## Environments

| Environment | URL                          | Branch  | Deploy Strategy |
| ----------- | ---------------------------- | ------- | --------------- |
| Staging     | https://ai.megacampus.ru     | master  | Blue/Green      |
| Dev         | https://dev.ai.megacampus.ru | develop | Rolling         |
| Production  | TBD                          | TBD     | Blue/Green      |

## Environment Variables

### Client-Side Variables (NEXT*PUBLIC*\*)

Variables prefixed with `NEXT_PUBLIC_` are embedded into the JavaScript bundle at **build time**.

**Important**: Changing these variables requires rebuilding the Docker image.

| Variable                            | Description                | Default         |
| ----------------------------------- | -------------------------- | --------------- |
| `NEXT_PUBLIC_SUPABASE_URL`          | Supabase project URL       | Required        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Supabase anon key          | Required        |
| `NEXT_PUBLIC_COURSEGEN_BACKEND_URL` | API backend URL for client | Auto-detected\* |

\*Auto-detection: In production (non-localhost), uses relative URL `/api` which nginx proxies to API.

### Server-Side Variables

These are read at runtime and can be changed without rebuilding:

| Variable                    | Description                    | Default           |
| --------------------------- | ------------------------------ | ----------------- |
| `COURSEGEN_BACKEND_URL`     | API URL for server-side calls  | `http://api:4000` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) | Required          |

## Blue/Green Deployment

Zero-downtime deployment using nginx port switching.

### Ports

| Slot  | Web  | API  |
| ----- | ---- | ---- |
| Blue  | 3001 | 4001 |
| Green | 3002 | 4002 |

### How It Works

1. **Identify** current active color (blue or green)
2. **Deploy** new version to idle slot
3. **Health check** both web and api on new slot
4. **Switch** nginx to new slot if healthy
5. **Cleanup** stop old slot

### Files

- `docker-compose.infra.yml` — Shared infrastructure (redis, docling, workers)
- `docker-compose.app.yml` — Application services (web, api) with dynamic ports
- `deploy/nginx/megacampus.conf.template` — Nginx template (SINGLE SOURCE OF TRUTH)
- `scripts/deploy_blue_green.sh` — Deploy script
- `scripts/rollback_blue_green.sh` — Rollback script
- `scripts/verify-nginx.sh` — Nginx health check script

## Deploy Commands

### From Claude Code

```bash
# Regular push (no deploy)
/push patch

# Deploy to staging (master → ai.megacampus.ru)
/deploy

# Force deploy (skip type-check/build)
/deploy --force
```

### Manual (on server)

```bash
# Deploy
cd /opt/megacampus
bash scripts/deploy_blue_green.sh production latest

# Rollback to previous color
bash scripts/rollback_blue_green.sh
```

## Docling MCP Image

**IMPORTANT:** The `docling-mcp` image is NOT built in CI/CD — it's too large (~8GB with PyTorch/CUDA).

### Image Details

| Property      | Value                                              |
| ------------- | -------------------------------------------------- |
| Image name    | `ghcr.io/maslennikov-ig/mc-2/docling-mcp:latest`   |
| Size          | ~8GB                                               |
| Build context | `packages/course-gen-platform/docker/docling-mcp/` |
| Pull policy   | `if_not_present` (never auto-pull)                 |

### Manual Build (on server)

```bash
cd /opt/megacampus
docker build -t ghcr.io/maslennikov-ig/mc-2/docling-mcp:latest \
  -f packages/course-gen-platform/docker/docling-mcp/Dockerfile .
```

### If Image Missing After Cleanup

If `docker image prune -a` removes the docling image:

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

The image is protected by `pull_policy: if_not_present` in `docker-compose.infra.yml`.
However, `docker image prune -a` removes ALL unused images. To prevent this:

```bash
# Use selective prune (dangling only, not -a)
docker image prune -f

# Or exclude docling when using -a
docker image prune -a --filter "label!=docling"
```

## Rollback

Instant rollback via nginx reload:

1. Script restarts previous color containers
2. Health checks previous slot
3. Switches nginx back
4. Stops broken slot

**Time to rollback**: ~30 seconds (health check wait)

## CI/CD Pipeline

`.github/workflows/ci-cd.yml`:

1. **Setup** — Install dependencies
2. **Checks** — lint, type-check, security, test (parallel)
3. **Build** — Build packages
4. **Docker** — Build and push images to GHCR
5. **Deploy** — SSH to server, run deploy_blue_green.sh
6. **Verify** — Health checks via HTTPS
7. **Rollback** — Auto on failure
8. **Notify** — Telegram notification

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
```

### Manual nginx switch

**IMPORTANT**: Never edit `/etc/nginx/sites-enabled/megacampus` directly!
Edit `deploy/nginx/megacampus.conf.template` in repo and apply:

```bash
# 1. Check active color
cat /opt/megacampus/active_color  # → "blue" or "green"

# 2. Apply template with correct ports (example for blue)
sed -e 's/{{WEB_PORT}}/3001/g' -e 's/{{API_PORT}}/4001/g' -e 's/{{COLOR}}/blue/g' \
  /opt/megacampus/nginx.conf.template | sudo tee /etc/nginx/sites-enabled/megacampus > /dev/null

# 3. Test and reload
sudo nginx -t && sudo nginx -s reload
```

Or use verification script:

```bash
./scripts/verify-nginx.sh
```

### Health check manually

```bash
# Check web
curl -f http://localhost:3001
curl -f http://localhost:3002

# Check api
curl -f http://localhost:4001/health
curl -f http://localhost:4002/health
```

## Dev Environment (dev.ai.megacampus.ru)

Dev environment runs alongside staging on the same server with isolated resources.

### Key Differences from Staging

| Resource      | Staging                             | Dev                     |
| ------------- | ----------------------------------- | ----------------------- |
| Uploads dir   | `./data/uploads`                    | `./data/uploads-dev`    |
| BullMQ queues | `course-generation`                 | `course-generation-dev` |
| Ports         | 3001/4001 (blue), 3002/4002 (green) | 3010/4010               |

### Shared Infrastructure Requirements

**IMPORTANT:** `docling-mcp-internal` in `docker-compose.infra.yml` must mount BOTH directories:

```yaml
volumes:
  - ./data/uploads:/app/uploads:ro
  - ./data/uploads-dev:/app/uploads-dev:ro # Required for dev!
```

Without `uploads-dev` mount, document processing fails with "File not found" errors.

### Deploying Dev Changes

```bash
# Dev auto-deploys on push to develop
git push  # → dev.ai.megacampus.ru

# Manual restart if needed
ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.dev.yml up -d"
```

## Nginx Configuration

**Single Source of Truth**: `deploy/nginx/`

| File                       | Environment | Description                         |
| -------------------------- | ----------- | ----------------------------------- |
| `megacampus.conf.template` | Staging     | Blue/Green with `{{WEB_PORT}}` vars |
| `megacampus-dev.conf`      | Dev         | Static ports 3010/4010              |

See `deploy/nginx/README.md` for troubleshooting.

## Related Docs

- [ADR-004: Blue/Green Deployment Strategy](../../docs/ADR-004-blue-green-deployment.md)
- [ADR-005: Deployment Strategy and Environment Architecture](../../docs/ADR-005-deployment-strategy.md)
- [RFC-001: Branching Strategy](../../docs/RFC-001-branching-strategy.md)
- [Nginx Config README](../../deploy/nginx/README.md)
