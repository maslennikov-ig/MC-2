#!/bin/bash
set -e

# MegaCampus Dev Environment Deployment Script
# Simple rolling deployment for develop branch
# Usage: ./deploy_dev.sh

BASE_PATH="/opt/megacampus"
DEPLOY_WEB_CHANGED=${DEPLOY_WEB_CHANGED:-true}
DEPLOY_API_CHANGED=${DEPLOY_API_CHANGED:-true}
DEPLOY_BRIDGE_CHANGED=${DEPLOY_BRIDGE_CHANGED:-true}
DEPLOY_CONFIG_CHANGED=${DEPLOY_CONFIG_CHANGED:-true}
APP_DEPLOY_NEEDED=false
WORKER_DEPLOY_NEEDED=false

if [ "$DEPLOY_WEB_CHANGED" = "true" ] || [ "$DEPLOY_API_CHANGED" = "true" ] || [ "$DEPLOY_BRIDGE_CHANGED" = "true" ] || [ "$DEPLOY_CONFIG_CHANGED" = "true" ]; then
    APP_DEPLOY_NEEDED=true
fi

if [ "$DEPLOY_API_CHANGED" = "true" ] || [ "$DEPLOY_CONFIG_CHANGED" = "true" ]; then
    WORKER_DEPLOY_NEEDED=true
fi

echo "Starting Dev Environment Deployment"
echo "   Domain: dev.ai.megacampus.ru"
echo "   Ports:  web:3010, api:4010"
echo "   Changes: web=$DEPLOY_WEB_CHANGED api=$DEPLOY_API_CHANGED bridge=$DEPLOY_BRIDGE_CHANGED config=$DEPLOY_CONFIG_CHANGED"
echo ""

container_running() {
    local container_name="$1"
    [ "$(docker inspect -f '{{.State.Running}}' "$container_name" 2>/dev/null || true)" = "true" ]
}

remove_legacy_compose_container() {
    local container_name="$1"
    local expected_service="$2"

    if ! docker inspect "$container_name" > /dev/null 2>&1; then
        return
    fi

    local compose_project
    local compose_service
    compose_project="$(docker inspect -f '{{ with index .Config.Labels "com.docker.compose.project" }}{{ . }}{{ end }}' "$container_name" 2>/dev/null || true)"
    compose_service="$(docker inspect -f '{{ with index .Config.Labels "com.docker.compose.service" }}{{ . }}{{ end }}' "$container_name" 2>/dev/null || true)"

    if [ "$compose_project" != "megacampus" ] || [ "$compose_service" != "$expected_service" ]; then
        echo "   Removing legacy $container_name container so compose can manage it..."
        docker rm -f "$container_name" 2>/dev/null || true
    fi
}

add_service_once() {
    local service="$1"
    local existing
    for existing in "${CORE_SERVICES[@]}"; do
        [ "$existing" = "$service" ] && return
    done
    CORE_SERVICES+=("$service")
}

# 1. Docker Login to GHCR (if GITHUB_TOKEN provided)
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Logging in to GHCR..."
    echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GITHUB_ACTOR:-maslennikov-ig}" --password-stdin
fi

# 2. Clean up any conflicting containers from previous failed deploys
echo "Checking for legacy dev containers..."
remove_legacy_compose_container megacampus-api-dev api-dev
remove_legacy_compose_container megacampus-web-dev web-dev

DEV_COMPOSE="docker compose -f $BASE_PATH/docker-compose.dev.yml --env-file $BASE_PATH/.env.dev"

# Qdrant used to be started outside docker-compose.dev.yml on some Dev hosts.
# Compose cannot adopt a container with the same container_name but different labels,
# so normalize only that legacy state before starting dependent workers.
if docker inspect megacampus-qdrant-dev > /dev/null 2>&1; then
    QDRANT_COMPOSE_PROJECT="$(docker inspect -f '{{ with index .Config.Labels "com.docker.compose.project" }}{{ . }}{{ end }}' megacampus-qdrant-dev 2>/dev/null || true)"
    QDRANT_COMPOSE_SERVICE="$(docker inspect -f '{{ with index .Config.Labels "com.docker.compose.service" }}{{ . }}{{ end }}' megacampus-qdrant-dev 2>/dev/null || true)"
    if [ "$QDRANT_COMPOSE_PROJECT" != "megacampus" ] || [ "$QDRANT_COMPOSE_SERVICE" != "qdrant-dev" ]; then
        echo "   Removing legacy megacampus-qdrant-dev container so compose can manage it..."
        docker rm -f megacampus-qdrant-dev 2>/dev/null || true
    fi
fi

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

# 4. Ensure data and secrets directories exist
echo "Ensuring data directories exist..."
mkdir -p "$BASE_PATH/data/enrichments" \
         "$BASE_PATH/data/uploads" "$BASE_PATH/data/uploads-dev" \
         "$BASE_PATH/secrets/notebooklm"
echo "   Directories ready."

# 5. Ensure infrastructure is running (shared with staging)
echo "Ensuring infrastructure is running..."
docker compose -f "$BASE_PATH/docker-compose.infra.yml" up -d
echo "   Infrastructure ready."
echo ""

# 6. Pull latest images
PULL_SERVICES=()
[ "$DEPLOY_WEB_CHANGED" = "true" ] && PULL_SERVICES+=("web-dev")
[ "$DEPLOY_API_CHANGED" = "true" ] && PULL_SERVICES+=("api-dev" "worker-dev" "worker-stage6-dev" "worker-stage7-dev")
[ "$DEPLOY_BRIDGE_CHANGED" = "true" ] && PULL_SERVICES+=("notebooklm-bridge-dev")

if [ "${#PULL_SERVICES[@]}" -gt 0 ]; then
    echo "Pulling changed develop images: ${PULL_SERVICES[*]}"
    docker compose -f "$BASE_PATH/docker-compose.dev.yml" --env-file "$BASE_PATH/.env.dev" pull "${PULL_SERVICES[@]}"
else
    echo "No develop image changes; using locally cached images."
fi

# 7. Deploy dev containers in stages
# Stage 1: Start core services (web, notebooklm-bridge, api) without workers
# Workers depend on api-dev:service_healthy which causes compose to exit 1
# if api takes time to start. So we start core services first, wait for health,
# then start workers.
echo "Ensuring Qdrant dev container is compose-managed..."
$DEV_COMPOSE up -d qdrant-dev

if [ "$APP_DEPLOY_NEEDED" = "true" ]; then
    CORE_SERVICES=()
    [ "$DEPLOY_WEB_CHANGED" = "true" ] && add_service_once "web-dev"
    [ "$DEPLOY_BRIDGE_CHANGED" = "true" ] && add_service_once "notebooklm-bridge-dev"
    [ "$DEPLOY_API_CHANGED" = "true" ] && add_service_once "api-dev"

    if [ "$DEPLOY_CONFIG_CHANGED" = "true" ]; then
        add_service_once "web-dev"
        add_service_once "notebooklm-bridge-dev"
        add_service_once "api-dev"
    fi
else
    CORE_SERVICES=()
fi

if ! container_running megacampus-web-dev; then
    echo "   web-dev container is missing or stopped; it will be started for health checks."
    add_service_once "web-dev"
fi

if ! container_running megacampus-notebooklm-bridge-dev; then
    echo "   notebooklm-bridge-dev container is missing or stopped; it will be started for API dependencies."
    add_service_once "notebooklm-bridge-dev"
fi

if ! container_running megacampus-api-dev; then
    echo "   api-dev container is missing or stopped; it will be started for health checks."
    add_service_once "api-dev"
fi

if [ "${#CORE_SERVICES[@]}" -gt 0 ]; then
    echo "Deploying required core dev containers: ${CORE_SERVICES[*]}"
    $DEV_COMPOSE up -d --force-recreate --no-deps "${CORE_SERVICES[@]}"
else
    echo "No core dev container recreate needed."
fi

# 8. Health Check — wait for API and Web before starting workers
echo "Performing Health Checks..."

# Check Qdrant readiness before accepting the deployment.
QDRANT_HEALTHY=false
QDRANT_API_KEY_VALUE="${QDRANT_API_KEY:-}"
if [ -z "$QDRANT_API_KEY_VALUE" ] && [ -f "$BASE_PATH/.env.dev" ]; then
    QDRANT_API_KEY_VALUE="$(grep -E '^QDRANT_API_KEY=' "$BASE_PATH/.env.dev" | tail -n 1 | cut -d= -f2-)"
fi
echo "   Checking Qdrant on localhost:6333..."
for i in {1..12}; do
    if curl -s -f -H "api-key: $QDRANT_API_KEY_VALUE" "http://localhost:6333/collections" > /dev/null 2>&1; then
        echo "   Qdrant health check passed!"
        QDRANT_HEALTHY=true
        break
    fi
    echo "   Waiting for Qdrant... ($i/12)"
    sleep 5
done

# Check API health
API_HEALTHY=false
echo "   Checking API on localhost:4010..."
for i in {1..24}; do
    if curl -s -f "http://localhost:4010/health" > /dev/null 2>&1; then
        echo "   API health check passed!"
        API_HEALTHY=true
        break
    fi
    # Show container status on every 4th attempt for debugging
    if [ $((i % 4)) -eq 0 ]; then
        echo "   Container status:"
        docker inspect --format='{{.State.Status}} (exit={{.State.ExitCode}})' megacampus-api-dev 2>/dev/null || echo "   (container not found)"
    fi
    echo "   Waiting for API... ($i/24)"
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

if [ "$QDRANT_HEALTHY" = false ] || [ "$API_HEALTHY" = false ] || [ "$WEB_HEALTHY" = false ]; then
    echo ""
    echo "Health check failed!"
    [ "$QDRANT_HEALTHY" = false ] && echo "   - Qdrant not healthy"
    [ "$API_HEALTHY" = false ] && echo "   - API not healthy"
    [ "$WEB_HEALTHY" = false ] && echo "   - Web not healthy"
    echo ""
    echo "=== API container logs (last 50 lines) ==="
    docker logs megacampus-api-dev --tail 50 2>&1 || true
    echo ""
    echo "=== API container inspect ==="
    docker inspect --format='Status={{.State.Status}} ExitCode={{.State.ExitCode}} OOMKilled={{.State.OOMKilled}} StartedAt={{.State.StartedAt}}' megacampus-api-dev 2>/dev/null || true
    echo ""
    exit 1
fi

if [ "$WORKER_DEPLOY_NEEDED" = "true" ]; then
    # Stage 2: Start workers now that API is healthy
    echo "Starting worker containers..."
    $DEV_COMPOSE up -d --force-recreate worker-dev worker-stage6-dev worker-stage7-dev
else
    echo "API image unchanged; skipping dev worker restarts."
fi

# 9. Docker Cleanup (prevent disk space exhaustion)
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
