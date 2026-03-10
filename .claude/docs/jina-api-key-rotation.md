# Jina API Key Rotation Guide

## What is it?

Jina AI provides the embedding API used for semantic matching in the course generation pipeline. The API key has a prepaid balance that needs periodic top-ups.

**Symptom when expired:** `[Startup] Failed to warm up embedding cache` with `JinaEmbeddingError: Insufficient account balance`.

**Impact:** Semantic matching degrades to fallback mode (still works, but lower quality).

## Where to update

The key must be updated in **5 locations**:

### 1. Local dev env (gitignored)

```
packages/course-gen-platform/.env
```

Line: `JINA_API_KEY=jina_...`

### 2. Server env files (4 files)

```bash
ssh megacampus-prod
cd /opt/megacampus

# All 4 files at once:
for f in .env.production .env.blue .env.green .env.dev; do
  sed -i "s/JINA_API_KEY=.*/JINA_API_KEY=<NEW_KEY>/" $f
done
```

### 3. GitHub Secrets (for CI/CD)

```bash
gh secret set JINA_API_KEY --body "<NEW_KEY>"
```

## After updating

Restart containers to pick up the new key:

```bash
ssh megacampus-prod "cd /opt/megacampus && \
  docker compose -f docker-compose.app.yml --env-file .env.\$(cat active_color) up -d --force-recreate api && \
  docker compose -f docker-compose.dev.yml up -d --force-recreate api-dev"
```

## Verification

Check that embedding cache warms up without errors:

```bash
ssh megacampus-prod "docker logs megacampus-api-\$(cat /opt/megacampus/active_color) 2>&1 | grep -i 'embedding cache'"
```

Expected output:

```
[Startup] Warming up embedding cache for semantic matching...
[Jina] Embedding request completed
[Startup] Embedding cache ready
```

## Quick reference

| Location                 | File/Command                        | Auto-reloads?      |
| ------------------------ | ----------------------------------- | ------------------ |
| Local `.env`             | `packages/course-gen-platform/.env` | On next `pnpm dev` |
| Server `.env.production` | `/opt/megacampus/.env.production`   | No, restart needed |
| Server `.env.blue`       | `/opt/megacampus/.env.blue`         | No, restart needed |
| Server `.env.green`      | `/opt/megacampus/.env.green`        | No, restart needed |
| Server `.env.dev`        | `/opt/megacampus/.env.dev`          | No, restart needed |
| GitHub Secrets           | `gh secret set JINA_API_KEY`        | On next CI/CD run  |
