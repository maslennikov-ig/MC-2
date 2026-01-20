# Deployment Guide

## Environments

| Environment | URL                          | Branch  | Deploy Strategy |
| ----------- | ---------------------------- | ------- | --------------- |
| Staging     | https://ai.megacampus.ru     | master  | Blue/Green      |
| Dev         | https://dev.ai.megacampus.ru | develop | Rolling         |
| Production  | TBD                          | TBD     | Blue/Green      |

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
- `nginx.conf.template` — Nginx config with port placeholders
- `scripts/deploy_blue_green.sh` — Deploy script
- `scripts/rollback_blue_green.sh` — Rollback script

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

```bash
# Edit nginx config
sudo nano /etc/nginx/sites-enabled/megacampus

# Test and reload
sudo nginx -t && sudo nginx -s reload
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

## Related Docs

- [ADR-004: Blue/Green Deployment Strategy](../../docs/ADR-004-blue-green-deployment.md)
- [ADR-005: Deployment Strategy and Environment Architecture](../../docs/ADR-005-deployment-strategy.md)
- [RFC-001: Branching Strategy](../../docs/RFC-001-branching-strategy.md)
