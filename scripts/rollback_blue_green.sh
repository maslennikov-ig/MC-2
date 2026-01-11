#!/bin/bash
set -e

# MegaCampus Blue/Green Rollback Script
# Usage: ./rollback_blue_green.sh [environment]
#
# Instantly switches traffic back to the previous color.
# Ports:
#   Blue:  web:3001, api:4001
#   Green: web:3002, api:4002

ENV=${1:-production}
BASE_PATH="/opt/megacampus"
NGINX_CONFIG_PATH="/etc/nginx/sites-enabled/megacampus"

# 1. Determine Current Active Color
if [ -f "$BASE_PATH/active_color" ]; then
    CURRENT_COLOR=$(cat "$BASE_PATH/active_color")
else
    echo "Error: active_color file not found. Cannot determine current state."
    echo "   Expected: $BASE_PATH/active_color"
    exit 1
fi

# 2. Determine Target Color (The previous one)
if [ "$CURRENT_COLOR" == "blue" ]; then
    TARGET_COLOR="green"
    TARGET_WEB_PORT=3002
    TARGET_API_PORT=4002
elif [ "$CURRENT_COLOR" == "green" ]; then
    TARGET_COLOR="blue"
    TARGET_WEB_PORT=3001
    TARGET_API_PORT=4001
else
    echo "Error: Unknown active color '$CURRENT_COLOR'."
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

# 4. Ensure Infrastructure is Running
echo "Ensuring infrastructure is running..."
docker compose -f "$BASE_PATH/docker-compose.infra.yml" up -d
echo "   Infrastructure ready."
echo ""

# 5. Start Target Application Environment (if not running)
echo "Ensuring $TARGET_COLOR application environment is running..."
docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$TARGET_COLOR" up -d --remove-orphans

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

# 9. Stop broken application environment
echo ""
echo "Stopping broken application environment ($CURRENT_COLOR)..."
docker compose -f "$BASE_PATH/docker-compose.app.yml" -p "megacampus-$CURRENT_COLOR" down 2>/dev/null || true

echo ""
echo "Rollback Complete!"
echo "   Active: $TARGET_COLOR"
echo "   Web:    http://localhost:$TARGET_WEB_PORT"
echo "   API:    http://localhost:$TARGET_API_PORT"
