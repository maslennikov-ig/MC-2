#!/bin/bash
# Verify nginx configuration matches Blue/Green state
# Usage: ./verify-nginx.sh [host]
#
# Checks:
# 1. active_color file exists
# 2. Nginx config has correct ports for active color
# 3. Ports are actually listening
# 4. Sites respond correctly

set -e

HOST="${1:-megacampus-prod}"

echo "=== Nginx Configuration Verification ==="
echo "Host: $HOST"
echo ""

# 1. Get active color
echo "1. Checking active color..."
ACTIVE_COLOR=$(ssh $HOST "cat /opt/megacampus/active_color 2>/dev/null || echo 'NOT_SET'")
echo "   Active color: $ACTIVE_COLOR"

if [ "$ACTIVE_COLOR" = "NOT_SET" ]; then
    echo "   ⚠️  WARNING: active_color file not found!"
    echo "   Run: ssh $HOST 'echo blue > /opt/megacampus/active_color'"
fi

# 2. Determine expected ports
if [ "$ACTIVE_COLOR" = "blue" ]; then
    EXPECTED_WEB_PORT=3001
    EXPECTED_API_PORT=4001
elif [ "$ACTIVE_COLOR" = "green" ]; then
    EXPECTED_WEB_PORT=3002
    EXPECTED_API_PORT=4002
else
    EXPECTED_WEB_PORT="unknown"
    EXPECTED_API_PORT="unknown"
fi

echo "   Expected ports: web=$EXPECTED_WEB_PORT, api=$EXPECTED_API_PORT"
echo ""

# 3. Check nginx config ports
echo "2. Checking nginx config..."
NGINX_WEB_PORT=$(ssh $HOST "grep -oP 'server 127.0.0.1:\K\d+' /etc/nginx/sites-enabled/megacampus | head -1")
NGINX_API_PORT=$(ssh $HOST "grep -oP 'server 127.0.0.1:\K\d+' /etc/nginx/sites-enabled/megacampus | tail -1")
echo "   Nginx web port: $NGINX_WEB_PORT"
echo "   Nginx api port: $NGINX_API_PORT"

if [ "$NGINX_WEB_PORT" = "$EXPECTED_WEB_PORT" ] && [ "$NGINX_API_PORT" = "$EXPECTED_API_PORT" ]; then
    echo "   ✅ Nginx config matches active color"
else
    echo "   ❌ MISMATCH! Nginx ports don't match active color"
    echo "   Fix: ssh $HOST 'sed -e \"s/{{WEB_PORT}}/$EXPECTED_WEB_PORT/g\" -e \"s/{{API_PORT}}/$EXPECTED_API_PORT/g\" -e \"s/{{COLOR}}/$ACTIVE_COLOR/g\" /opt/megacampus/nginx.conf.template | sudo tee /etc/nginx/sites-enabled/megacampus > /dev/null && sudo nginx -s reload'"
fi
echo ""

# 4. Check listening ports
echo "3. Checking listening ports..."
LISTENING=$(ssh $HOST "ss -tlnp | grep -E ':(3001|3002|4001|4002)' | awk '{print \$4}' | cut -d: -f2 | sort -u | tr '\n' ' '")
echo "   Listening: $LISTENING"

if echo "$LISTENING" | grep -q "$EXPECTED_WEB_PORT"; then
    echo "   ✅ Web port $EXPECTED_WEB_PORT is listening"
else
    echo "   ❌ Web port $EXPECTED_WEB_PORT is NOT listening!"
fi

if echo "$LISTENING" | grep -q "$EXPECTED_API_PORT"; then
    echo "   ✅ API port $EXPECTED_API_PORT is listening"
else
    echo "   ❌ API port $EXPECTED_API_PORT is NOT listening!"
fi
echo ""

# 5. Check site response
echo "4. Checking site response..."
STAGING_STATUS=$(curl -sI https://ai.megacampus.ru 2>/dev/null | head -1)
DEV_STATUS=$(curl -sI https://dev.ai.megacampus.ru 2>/dev/null | head -1)

echo "   Staging: $STAGING_STATUS"
echo "   Dev: $DEV_STATUS"

if echo "$STAGING_STATUS" | grep -q "200"; then
    echo "   ✅ Staging site is healthy"
else
    echo "   ❌ Staging site is NOT healthy!"
fi

if echo "$DEV_STATUS" | grep -q "200"; then
    echo "   ✅ Dev site is healthy"
else
    echo "   ❌ Dev site is NOT healthy!"
fi
echo ""

# 6. Check enrichments
echo "5. Checking enrichments endpoint..."
ENRICHMENT_STATUS=$(curl -sI "https://ai.megacampus.ru/storage/enrichments/" 2>/dev/null | head -1)
echo "   Enrichments: $ENRICHMENT_STATUS"

echo ""
echo "=== Verification Complete ==="
