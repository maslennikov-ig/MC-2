# Production Deployment Checklist

## Pre-Deployment Verification

### 1. Server Configuration
- [x] Git remote changed to new repository (MC-2)
- [x] Branch switched from main to master
- [x] Deploy scripts updated and copied to server
- [x] Docker compose configuration updated with new image paths
- [x] Backup of previous configuration created

### 2. GitHub Configuration
- [ ] Verify GitHub Secrets are configured (see below)
- [ ] Verify SSH deploy key has access to server
- [ ] Verify GitHub Token has packages:write permission
- [ ] Test SSH connection from GitHub Actions

### 3. Local Changes
- [x] `.github/workflows/ci.yml` - Updated to use master branch
- [x] `.github/workflows/deploy.yml` - Updated to use master branch
- [x] `scripts/deploy.sh` - Updated for dynamic branch detection
- [x] `docs/DEPLOYMENT.md` - Created comprehensive guide
- [x] `docs/DEPLOYMENT_CHECKLIST.md` - This checklist

### 4. Required GitHub Secrets

Run this check:
```bash
gh secret list
```

Expected secrets:
- `DEPLOY_SSH_KEY` - SSH private key for claude-deploy@95.81.98.230
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_JWT_SECRET`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `JINA_API_KEY`
- `OPENROUTER_API_KEY`
- `ENCRYPTION_KEY`

### 5. Server Verification

```bash
# Connect to server
ssh megacampus-prod

# Verify git configuration
cd /opt/megacampus/repo
git remote -v  # Should show MC-2 repository
git branch     # Should show * master

# Verify deploy files
ls -la /opt/megacampus/docker-compose.production.yml
ls -la /opt/megacampus/scripts/deploy.sh
ls -la /opt/megacampus/nginx-docling-proxy.conf

# Verify docker-compose uses new images
grep 'image:.*ghcr.io' /opt/megacampus/docker-compose.production.yml
# Should show: ghcr.io/maslennikov-ig/mc-2/...

# Check current containers
docker ps
```

## First Deployment Steps

### Option A: Automatic Deployment (Recommended)

1. **Commit and push changes**:
   ```bash
   git add .
   git commit -m "Configure automatic deployment to production server"
   git push origin master
   ```

2. **Monitor GitHub Actions**:
   ```bash
   # Watch workflow progress
   gh run watch

   # Or view in browser
   # https://github.com/maslennikov-ig/MC-2/actions
   ```

3. **Verify deployment**:
   ```bash
   # Check if new images are running
   ssh megacampus-prod "docker ps --format 'table {{.Names}}\t{{.Image}}'"

   # Check health
   curl -s https://ai.megacampus.ru/api/health | jq
   ```

### Option B: Manual Deployment (Testing)

1. **Build and push images locally** (optional test):
   ```bash
   # Build web image
   docker build -f packages/web/Dockerfile -t ghcr.io/maslennikov-ig/mc-2/web:test .

   # Build API image
   docker build -f packages/course-gen-platform/Dockerfile -t ghcr.io/maslennikov-ig/mc-2/api:test .
   ```

2. **Deploy manually on server**:
   ```bash
   ssh megacampus-prod
   cd /opt/megacampus

   # Set GitHub token (get from: gh auth token)
   export GITHUB_TOKEN=<your-token>
   export GITHUB_ACTOR=maslennikov-ig

   # Run deployment
   bash scripts/deploy.sh production latest
   ```

3. **Monitor deployment**:
   ```bash
   # Watch logs during deployment
   docker compose -f /opt/megacampus/docker-compose.production.yml logs -f
   ```

## Post-Deployment Verification

### 1. Service Health
```bash
# Check all containers are running
ssh megacampus-prod "docker ps"

# Check health status
ssh megacampus-prod "docker inspect --format='{{.State.Health.Status}}' megacampus-web"
ssh megacampus-prod "docker inspect --format='{{.State.Health.Status}}' megacampus-api"
ssh megacampus-prod "docker inspect --format='{{.State.Health.Status}}' megacampus-redis"
```

### 2. Application Health
```bash
# Web health check
curl -s https://ai.megacampus.ru/api/health | jq

# API health check (from server)
ssh megacampus-prod "curl -s http://localhost:4000/health | jq"
```

### 3. Container Logs
```bash
# Check for errors
ssh megacampus-prod "docker logs --tail 50 megacampus-web"
ssh megacampus-prod "docker logs --tail 50 megacampus-api"
ssh megacampus-prod "docker logs --tail 50 megacampus-worker"
```

### 4. Verify New Images
```bash
# Should show mc-2 images, not megacampusai
ssh megacampus-prod "docker images | grep megacampus"
```

## Rollback Plan

If deployment fails:

### Automatic Rollback
GitHub Actions will automatically rollback on failure.

### Manual Rollback
```bash
ssh megacampus-prod
cd /opt/megacampus
bash scripts/rollback.sh
```

### Emergency Rollback to Old Images
```bash
ssh megacampus-prod
cd /opt/megacampus

# Edit docker-compose.production.yml
# Change image paths back to:
# ghcr.io/maslennikov-ig/megacampusai/web:latest
# ghcr.io/maslennikov-ig/megacampusai/api:latest

docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d --force-recreate
```

## Common Issues

### Issue: Cannot pull images from new registry

**Solution**: Images need to be built first. Either:
1. Trigger GitHub Actions to build images, OR
2. Build and push images manually:
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u maslennikov-ig --password-stdin
   docker build -f packages/web/Dockerfile -t ghcr.io/maslennikov-ig/mc-2/web:latest .
   docker push ghcr.io/maslennikov-ig/mc-2/web:latest
   ```

### Issue: GitHub Actions SSH connection failed

**Solution**: Verify deploy key:
1. Check secret exists: `gh secret list | grep DEPLOY_SSH_KEY`
2. Verify key has access to server
3. Test manually: `ssh -i ~/.ssh/megacampus/claude-deploy claude-deploy@95.81.98.230`

### Issue: Containers start but health checks fail

**Solution**:
1. Check environment variables: `ssh megacampus-prod "cat /opt/megacampus/.env.production"`
2. Check container logs: `ssh megacampus-prod "docker logs megacampus-web"`
3. Verify secrets are correct in GitHub

## Next Steps After Successful Deployment

1. [ ] Monitor application for 1 hour
2. [ ] Test key functionality (course generation, file uploads)
3. [ ] Verify worker is processing jobs
4. [ ] Check log files for errors
5. [ ] Set up monitoring/alerting
6. [ ] Schedule regular backups
7. [ ] Document any issues encountered

## Quick Commands Reference

```bash
# Check workflow status
gh run list --workflow=deploy.yml --limit 5

# View latest run logs
gh run view --log

# Trigger manual deployment
gh workflow run deploy.yml

# Server status
ssh megacampus-prod "docker ps && df -h && free -h"

# Application logs
ssh megacampus-prod "docker compose -f /opt/megacampus/docker-compose.production.yml logs --tail=100 -f"

# Restart services
ssh megacampus-prod "docker compose -f /opt/megacampus/docker-compose.production.yml restart"
```

## Contact

For deployment issues:
- Check GitHub Actions logs first
- Review `/opt/megacampus/logs/` on server
- Check container logs with `docker logs`
- Review this checklist and DEPLOYMENT.md
