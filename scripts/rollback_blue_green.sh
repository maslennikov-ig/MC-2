#!/bin/bash
set -e

# MegaCampus Blue/Green Rollback Script
# Usage: ./rollback_blue_green.sh [environment] <expected_commit>
#
# Instantly switches traffic back to the previous color.
# Ports:
#   Blue:  web:3001, api:4001
#   Green: web:3002, api:4002

ENV=${1:-production}
EXPECTED_COMMIT=${2:-}
BASE_PATH=${BASE_PATH:-/opt/megacampus}
NGINX_CONFIG_PATH=${NGINX_CONFIG_PATH:-/etc/nginx/sites-enabled/megacampus}
DEPLOY_STATE="$BASE_PATH/deploy_state"

[[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]] || {
    echo "Error: rollback requires the exact 40-character release commit." >&2
    exit 1
}

state_value() {
    local key="$1"
    awk -v key="$key" 'index($0, key "=") == 1 { value=substr($0, length(key) + 2) } END { print value }' "$DEPLOY_STATE"
}

# 1. Determine Current Active Color
if [ -f "$BASE_PATH/active_color" ]; then
    CURRENT_COLOR=$(cat "$BASE_PATH/active_color")
else
    echo "Error: active_color file not found. Cannot determine current state."
    echo "   Expected: $BASE_PATH/active_color"
    exit 1
fi

# 2. Require a deployment transaction that actually switched traffic.
[ -r "$DEPLOY_STATE" ] || {
    echo "Error: deploy_state is missing; refusing an ambiguous rollback." >&2
    exit 1
}
DEPLOY_STATUS="$(state_value status)"
PREVIOUS_COLOR="$(state_value previous_color)"
SWITCHED_COLOR="$(state_value target_color)"
STATE_COMMIT="$(state_value commit)"
if [ "$STATE_COMMIT" != "$EXPECTED_COMMIT" ]; then
    echo "Error: deploy_state commit does not match the requested release; refusing stale rollback." >&2
    exit 1
fi
if [ "$DEPLOY_STATUS" != "switched" ] && [ "$DEPLOY_STATUS" != "accepted" ]; then
    echo "Error: deployment did not reach status=switched; refusing to promote an unaccepted target." >&2
    exit 1
fi
if [ "$CURRENT_COLOR" != "$SWITCHED_COLOR" ]; then
    echo "Error: active color does not match the switched deployment; refusing rollback." >&2
    exit 1
fi
TARGET_COLOR="$PREVIOUS_COLOR"
if [ "$TARGET_COLOR" == "green" ]; then
    TARGET_WEB_PORT=3002
    TARGET_API_PORT=4002
elif [ "$TARGET_COLOR" == "blue" ]; then
    TARGET_WEB_PORT=3001
    TARGET_API_PORT=4001
else
    echo "Error: Unknown rollback target color '$TARGET_COLOR'."
    exit 1
fi

echo "Initiating Rollback"
echo "   Current: $CURRENT_COLOR"
echo "   Target:  $TARGET_COLOR (web:$TARGET_WEB_PORT, api:$TARGET_API_PORT)"
echo ""

# 3. Verify Target Configuration Exists
if [ ! -f "$BASE_PATH/.env.$TARGET_COLOR" ]; then
    echo "Error: Configuration for $TARGET_COLOR not found."
    echo "   Expected: $BASE_PATH/.env.$TARGET_COLOR"
    echo ""
    echo "   This may mean there was no previous deployment to roll back to."
    exit 1
fi
for image_spec in \
    'WEB_IMAGE:ghcr.io/maslennikov-ig/mc-2/web' \
    'API_IMAGE:ghcr.io/maslennikov-ig/mc-2/api'; do
    image_key="${image_spec%%:*}"
    image_repository="${image_spec#*:}"
    image_value="$(awk -v key="$image_key" 'index($0, key "=") == 1 { value=substr($0, length(key) + 2) } END { print value }' "$BASE_PATH/.env.$TARGET_COLOR")"
    image_prefix="${image_repository}@sha256:"
    image_digest="${image_value#"$image_prefix"}"
    [[ "$image_value" == "$image_prefix"* && "$image_digest" =~ ^[0-9a-f]{64}$ ]] || {
        echo "Error: $image_key is missing or mutable in rollback target configuration." >&2
        exit 1
    }
done

# 4. Ensure Infrastructure is Running
echo "Ensuring infrastructure is running..."
docker compose -f "$BASE_PATH/docker-compose.infra.yml" --env-file "$BASE_PATH/.env.$ENV" up -d
echo "   Infrastructure ready."
echo ""

# 5. Start Target Application Environment (if not running)
echo "Ensuring $TARGET_COLOR application environment is running..."
docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$TARGET_COLOR" up -d --force-recreate

# 6. Health Check
echo "Performing Health Checks on $TARGET_COLOR..."

# Check API
API_HEALTHY=false
echo "   Checking API on localhost:$TARGET_API_PORT..."
for i in {1..6}; do
    if curl -s -f "http://localhost:$TARGET_API_PORT/health" > /dev/null 2>&1; then
        echo "   API health check passed!"
        API_HEALTHY=true
        break
    fi
    echo "   Waiting for API... ($i/6)"
    sleep 5
done

# Check Web
WEB_HEALTHY=false
echo "   Checking Web on localhost:$TARGET_WEB_PORT..."
for i in {1..6}; do
    if curl -s -f "http://localhost:$TARGET_WEB_PORT" > /dev/null 2>&1; then
        echo "   Web health check passed!"
        WEB_HEALTHY=true
        break
    fi
    echo "   Waiting for Web... ($i/6)"
    sleep 5
done

if [ "$API_HEALTHY" = false ] || [ "$WEB_HEALTHY" = false ]; then
    echo ""
    echo "Rollback target ($TARGET_COLOR) failed health check!"
    [ "$API_HEALTHY" = false ] && echo "   - API not healthy"
    [ "$WEB_HEALTHY" = false ] && echo "   - Web not healthy"
    echo ""
    echo "   Aborting rollback. Current active: $CURRENT_COLOR"
    exit 1
fi

echo ""

# Restore background consumers with the same environment snapshot as the
# rollback color before sending traffic back to it. This keeps Qdrant and
# document-evidence gates coherent across API, main worker, and Stage 6.
PRODUCTION_ENV_FILE="$BASE_PATH/.env.$TARGET_COLOR"
export PRODUCTION_ENV_FILE
docker compose -f "$BASE_PATH/docker-compose.production.yml" --env-file "$BASE_PATH/.env.$TARGET_COLOR" up -d --force-recreate --no-deps worker worker-stage6
unset PRODUCTION_ENV_FILE

# 7. Switch Traffic
echo "Switching Nginx to $TARGET_COLOR..."

if [ -f "$BASE_PATH/nginx.conf.template" ]; then
    sed -e "s/{{WEB_PORT}}/$TARGET_WEB_PORT/g" \
        -e "s/{{API_PORT}}/$TARGET_API_PORT/g" \
        -e "s/{{COLOR}}/$TARGET_COLOR/g" \
        "$BASE_PATH/nginx.conf.template" | sudo tee "$NGINX_CONFIG_PATH" > /dev/null

    if sudo nginx -t 2>/dev/null; then
        sudo nginx -s reload
        echo "   Traffic switched to $TARGET_COLOR!"
    else
        echo "   Nginx config test failed! Traffic NOT switched."
        exit 1
    fi
else
    echo "   Nginx template not found!"
    exit 1
fi

# 8. Update State
echo "$TARGET_COLOR" > "$BASE_PATH/active_color"
sed -i 's/^status=.*/status=rolled_back/' "$DEPLOY_STATE"

# 9. Stop broken application environment
echo ""
echo "Stopping broken application environment ($CURRENT_COLOR)..."
docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$CURRENT_COLOR" -p "megacampus-$CURRENT_COLOR" down 2>/dev/null || true

echo ""
echo "Rollback Complete!"
echo "   Active: $TARGET_COLOR"
echo "   Web:    http://localhost:$TARGET_WEB_PORT"
echo "   API:    http://localhost:$TARGET_API_PORT"
