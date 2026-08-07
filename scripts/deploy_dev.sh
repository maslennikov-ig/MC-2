#!/bin/bash
set -e

# MegaCampus Dev Environment Deployment Script
# Simple rolling deployment for develop branch
# Usage: ./deploy_dev.sh

BASE_PATH="/opt/megacampus"
source "$BASE_PATH/scripts/lib/docling-rollout.sh"
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

read_secret_file() {
    local path="$1"
    local label="$2"
    local mode
    local value

    if [[ "$path" != /* ]]; then
        path="$BASE_PATH/${path#./}"
    fi
    # Secret files are owned root:root 0400 (created by the production deploy); read
    # them via sudo, matching deploy_blue_green.sh's read_secret_file.
    sudo -n test -f "$path" && sudo -n test -r "$path" || { echo "ERROR: $label file is missing or unreadable" >&2; return 1; }
    mode="$(sudo -n stat -c '%a' "$path")"
    (( (8#$mode & 077) == 0 )) || { echo "ERROR: $label file permissions are unsafe" >&2; return 1; }
    value="$(sudo -n cat -- "$path"; printf x)"
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

qdrant_dev_gate() {
    local read_only_key admin_key read_only_path admin_path

    echo "   Qdrant readiness endpoint..."
    for i in {1..12}; do
        if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:6333/readyz > /dev/null 2>&1; then
            break
        fi
        [ "$i" -lt 12 ] || { echo "ERROR: Qdrant readiness failed" >&2; return 1; }
        sleep 5
    done

    read_only_path="${QDRANT_READ_ONLY_API_KEY_FILE:-$(configured_path "$BASE_PATH/.env.dev" QDRANT_READ_ONLY_API_KEY_FILE "$BASE_PATH/secrets/qdrant_read_only_api_key")}"
    read_secret_file "$read_only_path" 'Qdrant read-only API key'
    read_only_key="$REPLY"
    unset REPLY
    echo "   Qdrant authenticated collections endpoint..."
    curl --fail --silent --show-error --max-time 5 \
        -H "api-key: $read_only_key" http://127.0.0.1:6333/collections > /dev/null
    unset read_only_key

    admin_path="${QDRANT_API_KEY_FILE:-$(configured_path "$BASE_PATH/.env.dev" QDRANT_API_KEY_FILE "$BASE_PATH/secrets/qdrant_api_key")}"
    read_secret_file "$admin_path" 'Qdrant admin API key'
    admin_key="$REPLY"
    unset REPLY
    echo "   Running qdrant:verify..."
    QDRANT_URL=http://qdrant-dev:6333 QDRANT_API_KEY="$admin_key" \
        $DEV_COMPOSE run --rm --no-deps -T \
        -e QDRANT_URL -e QDRANT_API_KEY \
        --entrypoint tsx api-dev \
        dist/shared/qdrant/create-collection.js --verify-only
    unset admin_key
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

# 3. Keep the existing MCP 1.x runtime during client-first delivery. The
# v3/Serve services are added only after the production rollout flag is set.
docling_prepare_rollout "$BASE_PATH/.env.production"

# 4. Ensure data and secrets directories exist
echo "Ensuring data directories exist..."
mkdir -p "$BASE_PATH/data/enrichments" \
         "$BASE_PATH/data/uploads" "$BASE_PATH/data/uploads-dev"
# Same reason as deploy_blue_green.sh: $BASE_PATH/secrets is root-owned 0700, so the deploy user
# cannot create or stat through it. Dev shares this host and this directory.
sudo -n mkdir -p "$BASE_PATH/secrets/notebooklm"
echo "   Directories ready."

# 5. Ensure infrastructure is running (shared with staging)
echo "Ensuring infrastructure is running..."
INFRA_SERVICES=(redis notebooklm-bridge worker-stage7)
INFRA_SERVICES+=("${DOCLING_ROLLOUT_SERVICES[@]}")
# NOT a bare `up -d`: `docling-mcp-internal` declares `depends_on: docling-serve:
# service_healthy`, so compose WAITS on the new Serve and exits non-zero when it
# never gets there — up to ~330s of start_period plus retries. Under `set -e` a
# bare command would kill this script at that point, which is precisely BEFORE
# the rollback below. The single most likely Docling failure would therefore
# have left production with a stopped Serve, a crash-looping MCP and no
# automatic recovery, having never reached the recovery code written for it.
infra_up_failed=false
docker compose -f "$BASE_PATH/docker-compose.infra.yml" --env-file "$BASE_PATH/.env.production" \
    up -d "${INFRA_SERVICES[@]}" || infra_up_failed=true
if [ "$infra_up_failed" = true ] || ! docling_check_facade || \
    { [ "${#DOCLING_ROLLOUT_SERVICES[@]}" -gt 0 ] && ! docling_check_required_tools; }; then
    docling_rollback_rollout "$BASE_PATH/.env.production" "$BASE_PATH/docker-compose.infra.yml" \
        || { echo "ERROR: Docling MCP health failed and rollback failed" >&2; exit 1; }
    echo "ERROR: Docling MCP health failed; MCP 1.x was restored and Docling Serve stopped" >&2
    exit 1
fi
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
qdrant_dev_gate

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

QDRANT_HEALTHY=true

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
