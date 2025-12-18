# MegaCampus Deployment Setup Guide

This guide explains how to set up automatic CI/CD deployment from GitHub to the production server.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [GitHub Repository Setup](#github-repository-setup)
3. [Server Setup](#server-setup)
4. [GitHub Actions Secrets](#github-actions-secrets)
5. [Environment Variables](#environment-variables)
6. [Manual Deployment](#manual-deployment)
7. [Rollback Procedure](#rollback-procedure)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

- GitHub repository with admin access
- Production server with SSH access
- Docker and Docker Compose installed on server
- Domain configured with SSL certificate

## GitHub Repository Setup

### 1. Enable GitHub Actions

1. Go to repository Settings > Actions > General
2. Enable "Allow all actions and reusable workflows"
3. Set "Workflow permissions" to "Read and write permissions"

### 2. Configure GitHub Container Registry

The CI/CD pipeline automatically pushes Docker images to GitHub Container Registry (GHCR).

1. Go to repository Settings > Packages
2. Ensure "Inherit access from repository" is enabled
3. The `GITHUB_TOKEN` is automatically provided by GitHub Actions

## Server Setup

### 1. SSH Access

The deployment user `claude-deploy` should have:
- SSH access to the server
- Docker permissions (member of `docker` group)
- Write access to `/opt/megacampus` directory

```bash
# On the server, create deployment directory
sudo mkdir -p /opt/megacampus
sudo chown claude-deploy:claude-deploy /opt/megacampus

# Add user to docker group
sudo usermod -aG docker claude-deploy
```

### 2. Server Directory Structure

```
/opt/megacampus/
├── .env.production          # Environment variables (create this)
├── docker-compose.production.yml
├── scripts/
│   ├── deploy.sh
│   └── rollback.sh
├── data/
│   └── uploads/            # Persistent file storage
└── backups/                # Deployment backups
```

### 3. Create Production Environment File

On the server, create `/opt/megacampus/.env.production`:

```bash
# Copy example file
cp .env.production.example .env.production

# Edit with actual values
nano .env.production
```

See `.env.production.example` for all required variables.

## GitHub Actions Secrets

### Required Secrets

Add these secrets in: **Settings > Secrets and variables > Actions > New repository secret**

#### 1. DEPLOY_SSH_KEY

The SSH private key for the `claude-deploy` user.

**To generate and configure:**

```bash
# On your local machine, generate SSH key pair
ssh-keygen -t ed25519 -C "github-deploy@megacampus" -f ~/.ssh/megacampus-deploy

# Copy public key to server
ssh-copy-id -i ~/.ssh/megacampus-deploy.pub claude-deploy@95.81.98.230

# Display private key to copy to GitHub
cat ~/.ssh/megacampus-deploy
```

**Add to GitHub:**
1. Go to Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Name: `DEPLOY_SSH_KEY`
4. Value: Paste the entire private key content (including `-----BEGIN` and `-----END` lines)
5. Click "Add secret"

#### 2. Additional Secrets (Optional)

These can be added if you want to override defaults:

- `DEPLOY_HOST`: Server IP (default: 95.81.98.230)
- `DEPLOY_USER`: SSH user (default: claude-deploy)
- `DEPLOY_PATH`: Deployment directory (default: /opt/megacampus)

### Verifying Secrets

After adding secrets, you can test the deployment workflow:

```bash
# Trigger manual deployment
gh workflow run deploy.yml
```

## Environment Variables

### Build-time Variables

These are embedded into the Docker images during build:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NODE_VERSION`
- `BUILD_DATE`
- `VCS_REF`

### Runtime Variables

These are loaded from `.env.production` on the server:

- All Supabase credentials
- API keys (OpenAI, Anthropic, Qdrant)
- Redis configuration
- Application URLs
- Security settings

See `.env.production.example` for complete list.

## CI/CD Pipeline

### Automatic Deployment

The pipeline automatically triggers on push to `main` branch:

1. **CI Pipeline** (`.github/workflows/ci.yml`):
   - Lint code
   - Type check
   - Build all packages
   - Run tests
   - Security audit

2. **CD Pipeline** (`.github/workflows/deploy.yml`):
   - Wait for CI to pass
   - Build Docker images
   - Push to GitHub Container Registry
   - SSH to production server
   - Execute rolling deployment
   - Verify health checks
   - Rollback on failure

### Manual Deployment

Trigger deployment manually using GitHub Actions UI:

1. Go to Actions tab
2. Select "CD - Deploy to Production"
3. Click "Run workflow"
4. Select branch and click "Run workflow"

## Manual Deployment

If you need to deploy manually from the server:

```bash
# SSH to server
ssh claude-deploy@95.81.98.230

# Navigate to deployment directory
cd /opt/megacampus

# Run deployment script
bash scripts/deploy.sh production latest
```

The deployment script will:
- Backup current state
- Pull latest code from git
- Pull latest Docker images
- Perform rolling update
- Run health checks
- Rollback on failure

## Rollback Procedure

### Automatic Rollback

The CD pipeline automatically rolls back if deployment fails.

### Manual Rollback

To manually rollback to previous version:

```bash
# SSH to server
ssh claude-deploy@95.81.98.230

# Navigate to deployment directory
cd /opt/megacampus

# Run rollback script
bash scripts/rollback.sh
```

The rollback script will:
- Find latest backup
- Stop current containers
- Start previous version
- Verify health checks

## Monitoring Deployment

### View Docker Logs

```bash
# View all service logs
docker compose -f docker-compose.production.yml logs -f

# View specific service
docker compose -f docker-compose.production.yml logs -f api
docker compose -f docker-compose.production.yml logs -f web
docker compose -f docker-compose.production.yml logs -f worker

# View last 100 lines
docker compose -f docker-compose.production.yml logs --tail=100 api
```

### Check Service Status

```bash
# View running containers
docker compose -f docker-compose.production.yml ps

# Check health status
docker compose -f docker-compose.production.yml ps --format json | jq '.[] | {name: .Name, health: .Health}'
```

### Health Check Endpoints

- Web: http://localhost:3000/api/health
- API: http://localhost:4000/health
- Docling MCP: http://localhost:8000/

## Troubleshooting

### Deployment Fails

1. **Check GitHub Actions logs**: Go to Actions tab and view failed workflow
2. **Check server logs**: SSH to server and view Docker logs
3. **Verify environment variables**: Ensure `.env.production` is correct
4. **Check disk space**: `df -h`
5. **Check Docker status**: `docker ps -a`

### SSH Connection Issues

```bash
# Test SSH connection
ssh -i ~/.ssh/megacampus-deploy claude-deploy@95.81.98.230

# Verify SSH key permissions
chmod 600 ~/.ssh/megacampus-deploy

# Test SSH key in GitHub secret
# Decode the secret and try connecting
```

### Docker Image Pull Fails

```bash
# Login to GitHub Container Registry manually
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Pull images manually
docker compose -f docker-compose.production.yml pull
```

### Health Checks Fail

```bash
# Check if service is listening
curl http://localhost:4000/health
curl http://localhost:3000/api/health

# Check service logs
docker compose -f docker-compose.production.yml logs api
docker compose -f docker-compose.production.yml logs web

# Restart specific service
docker compose -f docker-compose.production.yml restart api
```

### Out of Memory

```bash
# Check memory usage
docker stats

# Increase memory limits in docker-compose.production.yml
# Restart services with new limits
docker compose -f docker-compose.production.yml up -d
```

### Clean Up Docker Resources

```bash
# Remove unused containers
docker container prune -f

# Remove unused images
docker image prune -f

# Remove unused volumes
docker volume prune -f

# Remove everything unused
docker system prune -af
```

## Security Best Practices

1. **Never commit secrets**: Always use `.env.production` and GitHub Secrets
2. **Rotate SSH keys**: Regularly update deployment SSH keys
3. **Review permissions**: Ensure `claude-deploy` has minimal required permissions
4. **Monitor logs**: Regularly check logs for suspicious activity
5. **Update dependencies**: Keep Docker images and dependencies up to date
6. **Enable firewall**: Only expose necessary ports (80, 443)

## Performance Optimization

1. **Docker layer caching**: The build uses GitHub Actions cache
2. **Multi-stage builds**: Reduces final image size
3. **Resource limits**: Set appropriate CPU/memory limits in docker-compose
4. **Image cleanup**: Regular pruning of old Docker images
5. **Log rotation**: Configured in docker-compose logging options

## Support

For deployment issues:
1. Check this guide
2. Review GitHub Actions logs
3. Check server logs
4. Contact DevOps team

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
