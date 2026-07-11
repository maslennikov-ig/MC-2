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
DEPLOY_WEB_CHANGED=${DEPLOY_WEB_CHANGED:-true}
DEPLOY_API_CHANGED=${DEPLOY_API_CHANGED:-true}
DEPLOY_BRIDGE_CHANGED=${DEPLOY_BRIDGE_CHANGED:-true}
DEPLOY_CONFIG_CHANGED=${DEPLOY_CONFIG_CHANGED:-true}
APP_DEPLOY_NEEDED=false

read_secret_file() {
    local path="$1"
    local label="$2"
    local mode
    local value

    if [[ "$path" != /* ]]; then
        path="$BASE_PATH/${path#./}"
    fi
    [ -f "$path" ] && [ -r "$path" ] || { echo "ERROR: $label file is missing or unreadable" >&2; return 1; }
    mode="$(stat -c '%a' "$path")"
    (( (8#$mode & 077) == 0 )) || { echo "ERROR: $label file permissions are unsafe" >&2; return 1; }
    value="$(cat -- "$path"; printf x)"
    value="${value%x}"
    if [[ "$value" == *$'\r\n' ]]; then
        value="${value%$'\r\n'}"
    elif [[ "$value" == *$'\n' ]]; then
        value="${value%$'\n'}"
    fi
    [ -n "$value" ] && [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || {
        echo "ERROR: $label file must contain exactly one non-empty line" >&2
        return 1
    }
    REPLY="$value"
}

configured_path() {
    local env_file="$1"
    local key="$2"
    local fallback="$3"
    local value=''

    if [ -r "$env_file" ]; then
        value="$(awk -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2) }' "$env_file" | tail -n 1)"
    fi
    printf '%s' "${value:-$fallback}"
}

qdrant_staging_gate() {
    local read_only_key admin_key read_only_path admin_path

    echo "   Qdrant readiness endpoint..."
    for i in {1..12}; do
        if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:6335/readyz > /dev/null 2>&1; then
            break
        fi
        [ "$i" -lt 12 ] || { echo "ERROR: Qdrant readiness failed" >&2; return 1; }
        sleep 5
    done

    read_only_path="${QDRANT_READ_ONLY_API_KEY_FILE:-$(configured_path "$BASE_PATH/.env.$ENV" QDRANT_READ_ONLY_API_KEY_FILE "$BASE_PATH/secrets/qdrant_read_only_api_key")}"
    read_secret_file "$read_only_path" 'Qdrant read-only API key'
    read_only_key="$REPLY"
    unset REPLY
    echo "   Qdrant authenticated collections endpoint..."
    curl --fail --silent --show-error --max-time 5 \
        -H "api-key: $read_only_key" http://127.0.0.1:6335/collections > /dev/null
    unset read_only_key

    admin_path="${QDRANT_API_KEY_FILE:-$(configured_path "$BASE_PATH/.env.$ENV" QDRANT_API_KEY_FILE "$BASE_PATH/secrets/qdrant_api_key")}"
    read_secret_file "$admin_path" 'Qdrant admin API key'
    admin_key="$REPLY"
    unset REPLY
    echo "   Running qdrant:verify..."
    QDRANT_URL=http://qdrant:6333 QDRANT_API_KEY="$admin_key" \
        docker compose -f "$BASE_PATH/docker-compose.app.yml" \
        --env-file "$BASE_PATH/.env.$NEW_COLOR" run --rm --no-deps -T \
        -e QDRANT_URL -e QDRANT_API_KEY \
        --entrypoint node api \
        dist/shared/qdrant/create-collection.js --verify-only
    unset admin_key
}

if [ "$DEPLOY_WEB_CHANGED" = "true" ] || [ "$DEPLOY_API_CHANGED" = "true" ] || [ "$DEPLOY_CONFIG_CHANGED" = "true" ]; then
    APP_DEPLOY_NEEDED=true
fi

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
echo "   Changes: web=$DEPLOY_WEB_CHANGED api=$DEPLOY_API_CHANGED bridge=$DEPLOY_BRIDGE_CHANGED config=$DEPLOY_CONFIG_CHANGED"
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

# 3. Ensure data directories exist with correct ownership
# Docker bind mounts inherit host permissions. Container runs as nodejs (uid 1001).
# Without this, directories created by Docker daemon get root:root ownership,
# causing EACCES errors in container.
echo "Ensuring data directories exist with correct permissions..."
mkdir -p "$BASE_PATH/data/enrichments" \
         "$BASE_PATH/data/uploads" "$BASE_PATH/data/uploads-dev" \
         "$BASE_PATH/secrets/notebooklm"
sudo chown -R 1001:1001 "$BASE_PATH/data/enrichments" \
                         "$BASE_PATH/data/uploads" "$BASE_PATH/data/uploads-dev"
echo "   Data directories ready (owner: 1001:1001)."
echo ""

# 4. Ensure Infrastructure is Running (shared by all colors)
echo "Ensuring infrastructure is running..."
docker compose -f "$BASE_PATH/docker-compose.infra.yml" --env-file "$BASE_PATH/.env.$ENV" \
    up -d redis qdrant docling-mcp-internal docling-mcp notebooklm-bridge worker-stage7
echo "   Infrastructure ready."
echo ""

# 5. Prepare Environment Configuration
echo "Preparing environment..."
cp "$BASE_PATH/.env.$ENV" "$BASE_PATH/.env.$NEW_COLOR"
{
    echo "COLOR=$NEW_COLOR"
    echo "WEB_PORT=$NEW_WEB_PORT"
    echo "API_PORT=$NEW_API_PORT"
    echo "COMPOSE_PROJECT_NAME=megacampus-$NEW_COLOR"
} >> "$BASE_PATH/.env.$NEW_COLOR"

# 6. Docker Login to GHCR (if GITHUB_TOKEN provided)
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Logging in to GHCR..."
    echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GITHUB_ACTOR:-maslennikov-ig}" --password-stdin
fi

if [ "$APP_DEPLOY_NEEDED" = "true" ]; then
    # 7. Deploy Application to New Color
    echo "Cleaning up any leftover $NEW_COLOR containers from previous failed deploys..."
    # Force remove containers by name (handles orphans from different project names)
    docker stop "megacampus-api-$NEW_COLOR" "megacampus-web-$NEW_COLOR" 2>/dev/null || true
    docker rm -f "megacampus-api-$NEW_COLOR" "megacampus-web-$NEW_COLOR" 2>/dev/null || true
    # Also try compose down for proper cleanup
    # NOTE: do NOT use --remove-orphans here, it kills shared infra (Redis, docling-mcp)!
    docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" down 2>/dev/null || true

    PULL_SERVICES=()
    [ "$DEPLOY_WEB_CHANGED" = "true" ] && PULL_SERVICES+=("web")
    [ "$DEPLOY_API_CHANGED" = "true" ] && PULL_SERVICES+=("api")

    if [ "${#PULL_SERVICES[@]}" -gt 0 ]; then
        echo "Pulling changed app images: ${PULL_SERVICES[*]}"
        docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" pull "${PULL_SERVICES[@]}"
    else
        echo "No app image changes; using locally cached app images."
    fi

    qdrant_staging_gate

    echo "Starting $NEW_COLOR containers..."
    # NOTE: do NOT use --remove-orphans, it kills shared infra containers (Redis, workers, etc.)
    docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" up -d --force-recreate web api

    # 8. Health Check (check both web and api)
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

    # 9. Switch Traffic
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

    # 10. Update State
    echo "$NEW_COLOR" > "$BASE_PATH/active_color"

    # 11. Cleanup Old Application Environment
    echo ""
    echo "Stopping old application environment ($CURRENT_COLOR)..."
    docker compose -f "$BASE_PATH/docker-compose.app.yml" -p "megacampus-$CURRENT_COLOR" down 2>/dev/null || true
else
    echo "No web/api/config changes; skipping Blue/Green app switch."
fi

# 12. Update Workers with New Image
# Workers use the same api image but are NOT part of Blue/Green (no traffic switching needed).
# They must be restarted to pick up new code after each deploy.
WORKER_COMPOSE="$BASE_PATH/docker-compose.production.yml"
INFRA_COMPOSE="$BASE_PATH/docker-compose.infra.yml"

if [ "$DEPLOY_API_CHANGED" = "true" ] || [ "$DEPLOY_CONFIG_CHANGED" = "true" ]; then
    echo "Updating API-backed workers..."
    docker compose -f "$WORKER_COMPOSE" --env-file "$BASE_PATH/.env.$ENV" pull worker worker-stage6 2>/dev/null || true
    for SVC in worker worker-stage6; do
        echo "   Restarting $SVC..."
        docker compose -f "$WORKER_COMPOSE" --env-file "$BASE_PATH/.env.$ENV" up -d --force-recreate --no-deps "$SVC"
    done
    echo "   Updating worker-stage7..."
    docker compose -f "$INFRA_COMPOSE" pull worker-stage7 2>/dev/null || true
    docker compose -f "$INFRA_COMPOSE" up -d --force-recreate --no-deps worker-stage7
else
    echo "API image unchanged; skipping API-backed worker restarts."
fi

if [ "$DEPLOY_BRIDGE_CHANGED" = "true" ] || [ "$DEPLOY_CONFIG_CHANGED" = "true" ]; then
    echo "Updating notebooklm-bridge..."
    docker compose -f "$INFRA_COMPOSE" pull notebooklm-bridge 2>/dev/null || true
    docker compose -f "$INFRA_COMPOSE" up -d --force-recreate notebooklm-bridge
else
    echo "NotebookLM bridge unchanged; skipping bridge restart."
fi
echo ""

# 13. Docker Cleanup (prevent disk space exhaustion)
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
if [ "$APP_DEPLOY_NEEDED" = "true" ]; then
    echo "   Active: $NEW_COLOR"
    echo "   Web:    http://localhost:$NEW_WEB_PORT"
    echo "   API:    http://localhost:$NEW_API_PORT"
else
    echo "   Active: $CURRENT_COLOR (unchanged)"
fi
