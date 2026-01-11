#!/bin/bash
set -e

# Usage: ./deploy_blue_green.sh <environment> <docker_tag>
ENV=$1
TAG=$2
BASE_PATH="/opt/megacampus"
NGINX_CONFIG_PATH="/etc/nginx/conf.d/megacampus.conf"

# 1. Determine Active Color (Default to blue if first run)
if [ -f "$BASE_PATH/active_color" ]; then
    CURRENT_COLOR=$(cat "$BASE_PATH/active_color")
else
    CURRENT_COLOR="blue"
fi

if [ "$CURRENT_COLOR" == "blue" ]; then
    NEW_COLOR="green"
    NEW_PORT=4002
else
    NEW_COLOR="blue"
    NEW_PORT=4001
fi

echo "🚀 Starting Blue/Green Deployment"
echo "Current: $CURRENT_COLOR | Target: $NEW_COLOR (Port: $NEW_PORT)"

# 2. Prepare Environment Configuration
# Copy the base .env file created by GitHub Actions and append Blue/Green specifics
cp "$BASE_PATH/.env.$ENV" "$BASE_PATH/.env.$NEW_COLOR"
echo "PORT=$NEW_PORT" >> "$BASE_PATH/.env.$NEW_COLOR"
echo "COMPOSE_PROJECT_NAME=megacampus-$NEW_COLOR" >> "$BASE_PATH/.env.$NEW_COLOR"

# 3. Deploy to New Color
echo "📦 Deploying to $NEW_COLOR environment..."
docker compose -f "$BASE_PATH/docker-compose.$ENV.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" pull
docker compose -f "$BASE_PATH/docker-compose.$ENV.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" up -d --remove-orphans

# 4. Health Check (Smoke Test)
echo "🏥 Performing Health Check on localhost:$NEW_PORT..."
HEALTHY=false
for i in {1..12}; do
    # Check internal health endpoint
    if curl -s -f "http://localhost:$NEW_PORT/api/health" > /dev/null; then
        echo "✅ Health check passed!"
        HEALTHY=true
        break
    fi
    echo "Waiting for service... ($i/12)"
    sleep 5
done

if [ "$HEALTHY" = false ]; then
    echo "❌ Health check failed. Rolling back (stopping $NEW_COLOR)..."
    docker compose -f "$BASE_PATH/docker-compose.$ENV.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" down
    exit 1
fi

# 5. Switch Traffic
echo "🔄 Switching Traffic to $NEW_COLOR..."

# Ensure template exists
if [ -f "$BASE_PATH/nginx.conf.template" ]; then
    # Replace {{PORT}} in template and write to Nginx config
    # Note: This requires the deploy user to have sudo permissions for 'tee' and 'nginx'
    sed "s/{{PORT}}/$NEW_PORT/g" "$BASE_PATH/nginx.conf.template" | sudo tee "$NGINX_CONFIG_PATH" > /dev/null
    sudo nginx -s reload
    echo "✅ Traffic switched successfully!"
else
    echo "⚠️ Nginx template not found at $BASE_PATH/nginx.conf.template. Traffic NOT switched."
    exit 1
fi

# 6. Update State
echo "$NEW_COLOR" > "$BASE_PATH/active_color"

# 7. Cleanup Old Environment
echo "🛑 Stopping old environment ($CURRENT_COLOR)..."
docker compose -p "megacampus-$CURRENT_COLOR" down

echo "🎉 Deployment Complete!"