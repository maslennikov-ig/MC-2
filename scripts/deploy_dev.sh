#!/bin/bash
set -e

# MegaCampus Dev Environment Deployment Script
# Simple rolling deployment for develop branch
# Usage: ./deploy_dev.sh

BASE_PATH="/opt/megacampus"

echo "Starting Dev Environment Deployment"
echo "   Domain: dev.ai.megacampus.ru"
echo "   Ports:  web:3010, api:4010"
echo ""

# 1. Docker Login to GHCR (if GITHUB_TOKEN provided)
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Logging in to GHCR..."
    echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GITHUB_ACTOR:-maslennikov-ig}" --password-stdin
fi

# 2. Clean up any conflicting containers from previous failed deploys
echo "Cleaning up orphan dev containers..."
# Docker filter doesn't support regex, so we explicitly list dev container names
docker rm -f megacampus-api-dev megacampus-web-dev 2>/dev/null || true

# 3. Check docling-mcp image exists (manually built, 8GB)
DOCLING_IMAGE="ghcr.io/maslennikov-ig/mc-2/docling-mcp:latest"
if ! docker image inspect "$DOCLING_IMAGE" > /dev/null 2>&1; then
    echo ""
    echo "ERROR: docling-mcp image not found!"
    echo ""
    echo "This image is built manually (too large for CI/CD)."
    echo "To fix, run one of:"
    echo ""
    echo "  # Option 1: Retag from old name (if exists)"
    echo "  docker tag ghcr.io/maslennikov-ig/megacampusai/docling-mcp:latest $DOCLING_IMAGE"
    echo ""
    echo "  # Option 2: Rebuild (~30 min)"
    echo "  cd $BASE_PATH && docker build -t $DOCLING_IMAGE \\"
    echo "    -f packages/course-gen-platform/docker/docling-mcp/Dockerfile ."
    echo ""
    exit 1
fi

# 4. Ensure infrastructure is running (shared with staging)
echo "Ensuring infrastructure is running..."
docker compose -f "$BASE_PATH/docker-compose.infra.yml" up -d
echo "   Infrastructure ready."
echo ""

# 4. Pull latest images
echo "Pulling latest develop images..."
docker compose -f "$BASE_PATH/docker-compose.dev.yml" --env-file "$BASE_PATH/.env.dev" pull

# 5. Deploy dev containers (do NOT use --remove-orphans, it kills shared infra!)
echo "Deploying dev containers..."
docker compose -f "$BASE_PATH/docker-compose.dev.yml" --env-file "$BASE_PATH/.env.dev" up -d --force-recreate

# 6. Health Check
echo "Performing Health Checks..."

# Check API health
API_HEALTHY=false
echo "   Checking API on localhost:4010..."
for i in {1..12}; do
    if curl -s -f "http://localhost:4010/health" > /dev/null 2>&1; then
        echo "   API health check passed!"
        API_HEALTHY=true
        break
    fi
    echo "   Waiting for API... ($i/12)"
    sleep 5
done

# Check Web health
WEB_HEALTHY=false
echo "   Checking Web on localhost:3010..."
for i in {1..12}; do
    if curl -s -f "http://localhost:3010" > /dev/null 2>&1; then
        echo "   Web health check passed!"
        WEB_HEALTHY=true
        break
    fi
    echo "   Waiting for Web... ($i/12)"
    sleep 5
done

if [ "$API_HEALTHY" = false ] || [ "$WEB_HEALTHY" = false ]; then
    echo ""
    echo "Health check failed!"
    [ "$API_HEALTHY" = false ] && echo "   - API not healthy"
    [ "$WEB_HEALTHY" = false ] && echo "   - Web not healthy"
    echo ""
    echo "Check logs with: docker compose -f docker-compose.dev.yml logs"
    exit 1
fi

# 7. Docker Cleanup (prevent disk space exhaustion)
echo ""
echo "Cleaning up Docker resources..."

# Remove dangling images (not tagged, safe to remove)
# NOTE: Using -f (dangling only), NOT -a which would remove docling-mcp (8GB, manually built)
DANGLING_CLEANED=$(docker image prune -f 2>/dev/null | tail -1 || echo "0B")
echo "   Dangling images cleaned: $DANGLING_CLEANED"

# Remove unused build cache older than 7 days
BUILD_CACHE_CLEANED=$(docker builder prune -f --filter "until=168h" 2>/dev/null | tail -1 || echo "0B")
echo "   Build cache cleaned: $BUILD_CACHE_CLEANED"

# Report disk space
DISK_FREE=$(df -h / | awk 'NR==2 {print $4}')
DISK_USED=$(df -h / | awk 'NR==2 {print $5}')
echo "   Disk status: $DISK_FREE free ($DISK_USED used)"

# Warning if disk is critically low
DISK_PERCENT=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_PERCENT" -gt 90 ]; then
    echo ""
    echo "⚠️  WARNING: Disk usage above 90%!"
    echo "   Consider running: docker system prune -a --volumes"
fi

echo ""
echo "Dev Deployment Complete!"
echo "   Web: https://dev.ai.megacampus.ru"
echo "   API: https://dev.ai.megacampus.ru/health"
