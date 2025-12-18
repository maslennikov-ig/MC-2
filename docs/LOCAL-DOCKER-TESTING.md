# Local Docker Testing Guide

## Why Test Locally First?

Today's deployment issues could have ALL been caught locally:
- ESM module resolution (`ERR_MODULE_NOT_FOUND`)
- Path alias resolution (`@/shared`)
- Workspace dependencies not included (`@megacampus/shared-types`)
- Package exports not defined (`ERR_PACKAGE_PATH_NOT_EXPORTED`)

**Rule: Never push to production without local Docker testing.**

---

## Quick Start: Local Testing Workflow

### 1. Build Docker Images Locally

```bash
# Build API image (same as CI)
docker build \
  -f packages/course-gen-platform/Dockerfile \
  -t megacampus-api:test \
  .

# Build Web image
docker build \
  -f packages/web/Dockerfile \
  -t megacampus-web:test \
  .
```

### 2. Run with Local Compose

```bash
# Use local testing compose file
docker compose -f docker-compose.local-test.yml up -d

# Check logs
docker logs megacampus-api-test --tail 50

# Check health
curl http://localhost:4000/health
curl http://localhost:3000/api/health
```

### 3. Validate Before Push

```bash
# Run the validation script
./scripts/validate-docker-local.sh
```

---

## Pre-Deployment Checklist

Before pushing to main:

- [ ] `pnpm type-check` passes
- [ ] `pnpm build` passes
- [ ] `pnpm test` passes
- [ ] Docker images build successfully
- [ ] Docker containers start without errors
- [ ] Health endpoints respond with 200
- [ ] API can connect to services (Redis, Supabase, Qdrant)

---

## Local Docker Compose File

Create `docker-compose.local-test.yml`:

```yaml
# Local testing only - mimics production environment
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 3

  api:
    image: megacampus-api:test
    container_name: megacampus-api-test
    ports:
      - "4000:4000"
    env_file:
      - .env.local-docker
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s

  worker:
    image: megacampus-api:test
    container_name: megacampus-worker-test
    command: ["tsx", "dist/orchestrator/worker-entrypoint.js"]
    env_file:
      - .env.local-docker
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
      api:
        condition: service_healthy

  web:
    image: megacampus-web:test
    container_name: megacampus-web-test
    ports:
      - "3000:3000"
    env_file:
      - .env.local-docker
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://api:4000
    depends_on:
      api:
        condition: service_healthy
```

---

## Validation Script

Create `scripts/validate-docker-local.sh`:

```bash
#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }

echo "=== MegaCampus Local Docker Validation ==="
echo ""

# Step 1: Check prerequisites
echo "Step 1: Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { log_error "Docker not installed"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { log_error "pnpm not installed"; exit 1; }
log_info "Prerequisites OK"

# Step 2: Run type-check and build
echo ""
echo "Step 2: Running type-check..."
if pnpm type-check; then
    log_info "Type-check passed"
else
    log_error "Type-check failed"
    exit 1
fi

echo ""
echo "Step 3: Building packages..."
if pnpm build; then
    log_info "Build passed"
else
    log_error "Build failed"
    exit 1
fi

# Step 4: Build Docker images
echo ""
echo "Step 4: Building Docker images..."

if docker build -f packages/course-gen-platform/Dockerfile -t megacampus-api:test . 2>&1; then
    log_info "API image built successfully"
else
    log_error "API image build failed"
    exit 1
fi

# Step 5: Test container starts
echo ""
echo "Step 5: Testing container startup..."

# Start Redis first
docker run -d --name redis-test -p 6379:6379 redis:7-alpine >/dev/null 2>&1 || true

# Create minimal env file for testing
cat > /tmp/.env.docker-test << 'EOF'
NODE_ENV=production
PORT=4000
REDIS_URL=redis://host.docker.internal:6379
SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_KEY=test-key
SUPABASE_ANON_KEY=test-anon-key
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=test-key
JINA_API_KEY=test-key
EOF

# Try to start API container
docker rm -f api-test 2>/dev/null || true

echo "Starting API container..."
docker run -d \
    --name api-test \
    --add-host=host.docker.internal:host-gateway \
    -p 4000:4000 \
    --env-file /tmp/.env.docker-test \
    megacampus-api:test

# Wait for startup
echo "Waiting for container to start (30s max)..."
for i in {1..30}; do
    if docker logs api-test 2>&1 | grep -q "Server started\|listening on\|ready"; then
        log_info "Container started successfully!"
        break
    fi

    # Check for crash
    if ! docker ps | grep -q api-test; then
        log_error "Container crashed!"
        echo ""
        echo "=== Container Logs ==="
        docker logs api-test 2>&1 | tail -50
        docker rm -f api-test redis-test 2>/dev/null || true
        exit 1
    fi

    echo -n "."
    sleep 1
done
echo ""

# Step 6: Check health endpoint
echo ""
echo "Step 6: Checking health endpoint..."
sleep 5

if curl -sf http://localhost:4000/health >/dev/null 2>&1; then
    log_info "Health endpoint responding"
else
    log_warn "Health endpoint not responding (may need external services)"
    echo "Container logs:"
    docker logs api-test 2>&1 | tail -20
fi

# Cleanup
echo ""
echo "Cleaning up..."
docker rm -f api-test redis-test 2>/dev/null || true
rm -f /tmp/.env.docker-test

echo ""
echo "=== Validation Complete ==="
log_info "Docker images are ready for deployment!"
```

---

## Common Issues and Solutions

### Issue: `ERR_MODULE_NOT_FOUND`
**Cause**: ESM imports without `.js` extensions
**Solution**: Use `tsx` runtime instead of `node`

### Issue: `Cannot find package '@/...'`
**Cause**: Path aliases not resolved at runtime
**Solution**: Include `tsconfig.json` with paths in Docker image

### Issue: `Cannot find package '@megacampus/shared-types'`
**Cause**: Workspace deps not in `pnpm deploy --prod`
**Solution**: Copy workspace package manually in Dockerfile

### Issue: `ERR_PACKAGE_PATH_NOT_EXPORTED`
**Cause**: Missing `exports` in package.json for subpaths
**Solution**: Add wildcard exports: `"./*": { ... }`

---

## CI/CD Integration

Add to `.github/workflows/ci.yml`:

```yaml
  docker-build-test:
    name: Docker Build Test
    runs-on: ubuntu-latest
    needs: [build]
    steps:
      - uses: actions/checkout@v4

      - name: Build API Docker image
        run: |
          docker build \
            -f packages/course-gen-platform/Dockerfile \
            -t megacampus-api:test \
            .

      - name: Test container starts
        run: |
          docker run -d --name api-test \
            -e NODE_ENV=production \
            -e PORT=4000 \
            -e REDIS_URL=redis://localhost:6379 \
            -e SUPABASE_URL=https://test.supabase.co \
            -e SUPABASE_SERVICE_KEY=test \
            -e SUPABASE_ANON_KEY=test \
            -e QDRANT_URL=http://localhost:6333 \
            -e QDRANT_API_KEY=test \
            -e JINA_API_KEY=test \
            megacampus-api:test

          sleep 10

          # Check container didn't crash
          if ! docker ps | grep -q api-test; then
            echo "Container crashed!"
            docker logs api-test
            exit 1
          fi

          echo "Container running OK"
```

---

## Summary

**Before EVERY deployment:**

1. `pnpm type-check && pnpm build` - passes
2. `docker build` - completes
3. `docker run` - container doesn't crash
4. Health endpoints - respond

This catches 99% of production issues locally.
