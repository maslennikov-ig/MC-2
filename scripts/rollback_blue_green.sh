#!/bin/bash
set -e

# Usage: ./rollback_blue_green.sh <environment>
ENV=$1

if [ -z "$ENV" ]; then
    echo "Usage: $0 <environment>"
    exit 1
fi

BASE_PATH="/opt/megacampus"
NGINX_CONFIG_PATH="/etc/nginx/conf.d/megacampus.conf"

# 1. Determine Current Active Color
if [ -f "$BASE_PATH/active_color" ]; then
    CURRENT_COLOR=$(cat "$BASE_PATH/active_color")
else
    echo "❌ Error: active_color file not found. Cannot determine current state for rollback."
    exit 1
fi

# 2. Determine Target Color (The previous one)
if [ "$CURRENT_COLOR" == "blue" ]; then
    TARGET_COLOR="green"
    TARGET_PORT=4002
elif [ "$CURRENT_COLOR" == "green" ]; then
    TARGET_COLOR="blue"
    TARGET_PORT=4001
else
    echo "❌ Error: Unknown active color '$CURRENT_COLOR'."
    exit 1
fi

echo "🔄 Initiating Rollback: $CURRENT_COLOR -> $TARGET_COLOR (Port: $TARGET_PORT)"

# 3. Verify Target Configuration Exists
if [ ! -f "$BASE_PATH/.env.$TARGET_COLOR" ]; then
    echo "❌ Error: Configuration for $TARGET_COLOR not found at $BASE_PATH/.env.$TARGET_COLOR"
    exit 1
fi

# 4. Start Target Environment
echo "📦 Starting $TARGET_COLOR environment..."
# We use the existing env file for the target color, preserving the previous version's config
docker compose -f "$BASE_PATH/docker-compose.$ENV.yml" --env-file "$BASE_PATH/.env.$TARGET_COLOR" up -d --remove-orphans

# 5. Health Check
echo "🏥 Performing Health Check on $TARGET_COLOR (localhost:$TARGET_PORT)..."
HEALTHY=false
for i in {1..12}; do
    if curl -s -f "http://localhost:$TARGET_PORT/api/health" > /dev/null; then
        echo "✅ Health check passed!"
        HEALTHY=true
        break
    fi
    echo "Waiting for service... ($i/12)"
    sleep 5
done

if [ "$HEALTHY" = false ]; then
    echo "❌ Rollback target ($TARGET_COLOR) failed health check. Aborting rollback."
    docker compose -f "$BASE_PATH/docker-compose.$ENV.yml" --env-file "$BASE_PATH/.env.$TARGET_COLOR" down
    exit 1
fi

# 6. Switch Traffic
echo "🔀 Switching Nginx to $TARGET_COLOR..."
sed "s/{{PORT}}/$TARGET_PORT/g" "$BASE_PATH/nginx.conf.template" | sudo tee "$NGINX_CONFIG_PATH" > /dev/null
sudo nginx -s reload

# 7. Update State & Cleanup
echo "$TARGET_COLOR" > "$BASE_PATH/active_color"
echo "🛑 Stopping broken environment ($CURRENT_COLOR)..."
docker compose -p "megacampus-$CURRENT_COLOR" down

echo "🎉 Rollback Complete! Active environment is now: $TARGET_COLOR"