#!/bin/bash
set -e

# MegaCampus Blue/Green Deployment Script
# Usage: ./deploy_blue_green.sh <environment> <docker_tag>
#
# Ports:
#   Blue:  web:3001, api:4001
#   Green: web:3002, api:4002

ENV=${1:-production}
TAG=${2:-latest}
BASE_PATH="/opt/megacampus"
NGINX_CONFIG_PATH="/etc/nginx/sites-enabled/megacampus"

# 1. Determine Active Color (Default to blue if first run)
if [ -f "$BASE_PATH/active_color" ]; then
    CURRENT_COLOR=$(cat "$BASE_PATH/active_color")
else
    CURRENT_COLOR="blue"
fi

if [ "$CURRENT_COLOR" == "blue" ]; then
    NEW_COLOR="green"
    NEW_WEB_PORT=3002
    NEW_API_PORT=4002
else
    NEW_COLOR="blue"
    NEW_WEB_PORT=3001
    NEW_API_PORT=4001
fi

echo "Starting Blue/Green Deployment"
echo "   Environment: $ENV"
echo "   Current: $CURRENT_COLOR"
echo "   Target:  $NEW_COLOR (web:$NEW_WEB_PORT, api:$NEW_API_PORT)"
echo ""

# 2. Check docling-mcp image exists (manually built, 8GB)
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

# 3. Ensure Infrastructure is Running (shared by all colors)
echo "Ensuring infrastructure is running..."
docker compose -f "$BASE_PATH/docker-compose.infra.yml" up -d
echo "   Infrastructure ready."
echo ""

# 3. Prepare Environment Configuration
echo "Preparing environment..."
cp "$BASE_PATH/.env.$ENV" "$BASE_PATH/.env.$NEW_COLOR"
{
    echo "COLOR=$NEW_COLOR"
    echo "WEB_PORT=$NEW_WEB_PORT"
    echo "API_PORT=$NEW_API_PORT"
    echo "COMPOSE_PROJECT_NAME=megacampus-$NEW_COLOR"
} >> "$BASE_PATH/.env.$NEW_COLOR"

# 4. Docker Login to GHCR (if GITHUB_TOKEN provided)
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Logging in to GHCR..."
    echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GITHUB_ACTOR:-maslennikov-ig}" --password-stdin
fi

# 5. Deploy Application to New Color
echo "Cleaning up any leftover $NEW_COLOR containers from previous failed deploys..."
docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" down --remove-orphans 2>/dev/null || true

echo "Pulling and starting $NEW_COLOR containers..."
docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" pull
docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" up -d --force-recreate --remove-orphans

# 6. Health Check (check both web and api)
echo "Performing Health Checks..."

# Check API health
API_HEALTHY=false
echo "   Checking API on localhost:$NEW_API_PORT..."
for i in {1..12}; do
    if curl -s -f "http://localhost:$NEW_API_PORT/health" > /dev/null 2>&1; then
        echo "   API health check passed!"
        API_HEALTHY=true
        break
    fi
    echo "   Waiting for API... ($i/12)"
    sleep 5
done

# Check Web health
WEB_HEALTHY=false
echo "   Checking Web on localhost:$NEW_WEB_PORT..."
for i in {1..12}; do
    if curl -s -f "http://localhost:$NEW_WEB_PORT" > /dev/null 2>&1; then
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
    echo "Rolling back (stopping $NEW_COLOR)..."
    docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" down
    exit 1
fi

echo ""

# 7. Switch Traffic
echo "Switching traffic to $NEW_COLOR..."

if [ -f "$BASE_PATH/nginx.conf.template" ]; then
    # Replace both WEB_PORT and API_PORT in template
    sed -e "s/{{WEB_PORT}}/$NEW_WEB_PORT/g" \
        -e "s/{{API_PORT}}/$NEW_API_PORT/g" \
        -e "s/{{COLOR}}/$NEW_COLOR/g" \
        "$BASE_PATH/nginx.conf.template" | sudo tee "$NGINX_CONFIG_PATH" > /dev/null

    # Test nginx config before reload
    if sudo nginx -t 2>/dev/null; then
        sudo nginx -s reload
        echo "   Traffic switched successfully!"
    else
        echo "   Nginx config test failed! Traffic NOT switched."
        exit 1
    fi
else
    echo "   Nginx template not found at $BASE_PATH/nginx.conf.template"
    echo "   Traffic NOT switched."
    exit 1
fi

# 8. Update State
echo "$NEW_COLOR" > "$BASE_PATH/active_color"

# 9. Cleanup Old Application Environment
echo ""
echo "Stopping old application environment ($CURRENT_COLOR)..."
docker compose -f "$BASE_PATH/docker-compose.app.yml" -p "megacampus-$CURRENT_COLOR" down 2>/dev/null || true

# 10. Docker Cleanup (prevent disk space exhaustion)
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
echo "Deployment Complete!"
echo "   Active: $NEW_COLOR"
echo "   Web:    http://localhost:$NEW_WEB_PORT"
echo "   API:    http://localhost:$NEW_API_PORT"
