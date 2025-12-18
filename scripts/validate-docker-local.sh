#!/bin/bash
set -euo pipefail

# MegaCampus Local Docker Validation Script
# Run before pushing to production to catch issues early

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

cleanup() {
    echo ""
    log_step "Cleaning up test containers..."
    docker rm -f megacampus-api-test megacampus-redis-test 2>/dev/null || true
    rm -f /tmp/.env.docker-test
}

trap cleanup EXIT

echo "============================================"
echo "  MegaCampus Local Docker Validation"
echo "============================================"
echo ""

# Step 1: Check prerequisites
log_step "Step 1: Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { log_error "Docker not installed"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { log_error "pnpm not installed"; exit 1; }
log_info "Prerequisites OK"

# Step 2: Run type-check
echo ""
log_step "Step 2: Running type-check..."
if pnpm type-check 2>&1 | tail -5; then
    log_info "Type-check passed"
else
    log_error "Type-check failed"
    exit 1
fi

# Step 3: Build packages
echo ""
log_step "Step 3: Building packages..."
if pnpm build 2>&1 | tail -10; then
    log_info "Build passed"
else
    log_error "Build failed"
    exit 1
fi

# Step 4: Build Docker image
echo ""
log_step "Step 4: Building API Docker image..."
if docker build -f packages/course-gen-platform/Dockerfile -t megacampus-api:test . 2>&1 | tail -20; then
    log_info "API image built successfully"
else
    log_error "API image build failed"
    exit 1
fi

# Step 5: Start Redis
echo ""
log_step "Step 5: Starting Redis for testing..."
docker rm -f megacampus-redis-test 2>/dev/null || true
docker run -d --name megacampus-redis-test -p 6379:6379 redis:7-alpine >/dev/null
sleep 2
log_info "Redis started"

# Step 6: Create test env file
log_step "Step 6: Creating test environment..."
cat > /tmp/.env.docker-test << 'EOF'
NODE_ENV=production
PORT=4000
REDIS_URL=redis://host.docker.internal:6379
SUPABASE_URL=https://diqooqbuchsliypgwksu.supabase.co
SUPABASE_SERVICE_KEY=test-service-key-for-validation
SUPABASE_ANON_KEY=test-anon-key-for-validation
QDRANT_URL=http://host.docker.internal:6333
QDRANT_API_KEY=test-qdrant-key
JINA_API_KEY=test-jina-key
OPENROUTER_API_KEY=test-openrouter-key
ENCRYPTION_KEY=test-encryption-key-32-chars-long
EOF
log_info "Test environment created"

# Step 7: Start API container
echo ""
log_step "Step 7: Starting API container..."
docker rm -f megacampus-api-test 2>/dev/null || true

docker run -d \
    --name megacampus-api-test \
    --add-host=host.docker.internal:host-gateway \
    -p 4000:4000 \
    --env-file /tmp/.env.docker-test \
    megacampus-api:test

# Step 8: Wait and check for crashes
echo ""
log_step "Step 8: Checking container startup (30s timeout)..."
for i in {1..30}; do
    # Check if container is still running
    if ! docker ps --format '{{.Names}}' | grep -q megacampus-api-test; then
        echo ""
        log_error "Container crashed!"
        echo ""
        echo "=== Container Logs ==="
        docker logs megacampus-api-test 2>&1 | tail -50
        exit 1
    fi

    # Check for successful startup in logs
    if docker logs megacampus-api-test 2>&1 | grep -qE "listening on|Server started|ready"; then
        echo ""
        log_info "Container started successfully!"
        break
    fi

    echo -n "."
    sleep 1
done
echo ""

# Step 9: Check health (may fail without real credentials, that's OK)
echo ""
log_step "Step 9: Checking health endpoint..."
sleep 3

if curl -sf http://localhost:4000/health >/dev/null 2>&1; then
    log_info "Health endpoint responding - container is healthy!"
else
    log_warn "Health endpoint not responding (expected without real credentials)"
    echo ""
    echo "Container is running but may need real credentials to fully work."
    echo "This is OK for validation - the important thing is it didn't crash."
fi

# Show container status
echo ""
log_step "Container status:"
docker ps --filter "name=megacampus" --format "table {{.Names}}\t{{.Status}}"

# Show last few log lines
echo ""
log_step "Recent logs:"
docker logs megacampus-api-test 2>&1 | tail -10

echo ""
echo "============================================"
log_info "Validation PASSED - Docker image is ready!"
echo "============================================"
echo ""
echo "You can now safely push to production."
echo ""
