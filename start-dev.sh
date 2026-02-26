#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS_DIR="$SCRIPT_DIR/logs/dev"
SESSION_ID=$(date +%Y%m%d-%H%M%S)

# Create logs directory
mkdir -p "$LOGS_DIR"

# Log files for current session
BACKEND_LOG="$LOGS_DIR/backend-$SESSION_ID.log"
WORKER_LOG="$LOGS_DIR/worker-$SESSION_ID.log"
WORKER_STAGE6_LOG="$LOGS_DIR/worker-stage6-$SESSION_ID.log"
WORKER_STAGE7_LOG="$LOGS_DIR/worker-stage7-$SESSION_ID.log"
FRONTEND_LOG="$LOGS_DIR/frontend-$SESSION_ID.log"
COMBINED_LOG="$LOGS_DIR/combined-$SESSION_ID.log"

# Symlinks to latest logs (for easy access)
ln -sf "backend-$SESSION_ID.log" "$LOGS_DIR/backend-latest.log"
ln -sf "worker-$SESSION_ID.log" "$LOGS_DIR/worker-latest.log"
ln -sf "worker-stage6-$SESSION_ID.log" "$LOGS_DIR/worker-stage6-latest.log"
ln -sf "worker-stage7-$SESSION_ID.log" "$LOGS_DIR/worker-stage7-latest.log"
ln -sf "frontend-$SESSION_ID.log" "$LOGS_DIR/frontend-latest.log"
ln -sf "combined-$SESSION_ID.log" "$LOGS_DIR/combined-latest.log"

# Cleanup old logs (keep last 10 sessions)
cleanup_old_logs() {
    for prefix in backend worker worker-stage6 worker-stage7 frontend combined; do
        ls -t "$LOGS_DIR/$prefix-"*.log 2>/dev/null | tail -n +11 | xargs -r rm -f
    done
}
cleanup_old_logs

# =============================================================================
# CLI OPTIONS
# =============================================================================
VERBOSE=false
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --verbose|-v) VERBOSE=true; shift ;;
        *) shift ;;
    esac
done

# Set log level based on verbosity
if [ "$VERBOSE" = true ]; then
    export LOG_LEVEL="trace"
    echo -e "${YELLOW}🔍 Verbose mode: LOG_LEVEL=trace (showing all logs)${NC}"
else
    export LOG_LEVEL="info"
fi

echo -e "${BLUE}🚀 Starting MegaCampusAI Development Environment...${NC}"
echo -e "${BLUE}📝 Logs: $LOGS_DIR${NC}"

# =============================================================================
# NOTEBOOKLM BRIDGE (OPTIONAL LOCAL SERVICE)
# =============================================================================
NLM_BRIDGE_CONTAINER="megacampus-notebooklm-bridge-local"
NLM_BRIDGE_IMAGE="megacampus/notebooklm-bridge-local:dev"
NLM_BRIDGE_PORT="8010"
NLM_BRIDGE_BUILD_CONTEXT="$SCRIPT_DIR/packages/course-gen-platform/docker/notebooklm-bridge"
NLM_BRIDGE_CACHE_DIR="$SCRIPT_DIR/.cache/notebooklm-bridge"
NLM_BRIDGE_HASH_FILE="$NLM_BRIDGE_CACHE_DIR/context.sha256"
NLM_BRIDGE_WAS_RUNNING=false
NLM_BRIDGE_STARTED_BY_SCRIPT=false

read_env_value() {
    local key="$1"
    local file="$2"
    if [ ! -f "$file" ]; then
        return 0
    fi
    grep -E "^${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2-
}

compute_bridge_context_hash() {
    local context_dir="$1"
    (
        cd "$context_dir" || exit 1
        find . -type f \
            ! -path './.git/*' \
            ! -path './__pycache__/*' \
            ! -path './.pytest_cache/*' \
            ! -name '*.pyc' \
            -print0 \
        | sort -z \
        | xargs -0 sha256sum
    ) | sha256sum | awk '{print $1}'
}

echo -e "\n${YELLOW}🎧 Starting local NotebookLM bridge...${NC}"

if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker not found. Cannot start local NotebookLM bridge.${NC}"
    exit 1
fi

if [ ! -d "$NLM_BRIDGE_BUILD_CONTEXT" ]; then
    echo -e "${RED}❌ NotebookLM bridge build context not found: $NLM_BRIDGE_BUILD_CONTEXT${NC}"
    exit 1
fi

if ! command -v sha256sum >/dev/null 2>&1; then
    echo -e "${RED}❌ sha256sum not found. Cannot detect NotebookLM bridge changes.${NC}"
    exit 1
fi

COURSE_ENV_FILE="$SCRIPT_DIR/packages/course-gen-platform/.env"
BRIDGE_TOKEN="${NOTEBOOKLM_BRIDGE_TOKEN:-$(read_env_value NOTEBOOKLM_BRIDGE_TOKEN "$COURSE_ENV_FILE")}"
AUTH_JSON="${NOTEBOOKLM_AUTH_JSON:-$(read_env_value NOTEBOOKLM_AUTH_JSON "$COURSE_ENV_FILE")}"
STORAGE_STATE_DIR="${NOTEBOOKLM_STORAGE_STATE_DIR:-$(read_env_value NOTEBOOKLM_STORAGE_STATE_DIR "$COURSE_ENV_FILE")}"
STORAGE_PATH="${NOTEBOOKLM_STORAGE_PATH:-$(read_env_value NOTEBOOKLM_STORAGE_PATH "$COURSE_ENV_FILE")}"

USE_AUTH_JSON=false
if [ -n "$AUTH_JSON" ]; then
    USE_AUTH_JSON=true
fi

if [ "$USE_AUTH_JSON" != "true" ]; then
    if [ -z "$STORAGE_STATE_DIR" ]; then
        STORAGE_STATE_DIR="$SCRIPT_DIR/secrets/notebooklm"
    fi
    if [ -z "$STORAGE_PATH" ]; then
        STORAGE_PATH="/app/secrets/notebooklm/storage_state.json"
    fi
    STORAGE_FILENAME="$(basename "$STORAGE_PATH")"
    LOCAL_STORAGE_STATE_FILE="$STORAGE_STATE_DIR/$STORAGE_FILENAME"
fi

if [ -z "$BRIDGE_TOKEN" ]; then
    echo -e "${RED}❌ NOTEBOOKLM_BRIDGE_TOKEN is not set (env or packages/course-gen-platform/.env).${NC}"
    echo -e "${YELLOW}   Generate one: openssl rand -hex 32${NC}"
    echo -e "${YELLOW}   Then set NOTEBOOKLM_BRIDGE_TOKEN in your shell or packages/course-gen-platform/.env${NC}"
    exit 1
fi

mkdir -p "$NLM_BRIDGE_CACHE_DIR"

if [ "$USE_AUTH_JSON" = "true" ]; then
    if [ -n "$STORAGE_PATH" ]; then
        echo -e "${YELLOW}⚠️  NOTEBOOKLM_STORAGE_PATH is set but will be ignored because NOTEBOOKLM_AUTH_JSON is provided.${NC}"
    fi
    echo -e "   ✅ Using NOTEBOOKLM_AUTH_JSON for NotebookLM bridge auth."
else
    mkdir -p "$STORAGE_STATE_DIR"

    if [ ! -f "$LOCAL_STORAGE_STATE_FILE" ]; then
        echo -e "${RED}❌ NotebookLM auth storage file not found: $LOCAL_STORAGE_STATE_FILE${NC}"
        echo -e "${YELLOW}   Run login first:${NC}"
        echo -e "${YELLOW}   notebooklm --storage $LOCAL_STORAGE_STATE_FILE login${NC}"
        exit 1
    fi

    if ! command -v python3 >/dev/null 2>&1; then
        echo -e "${RED}❌ python3 not found. Cannot validate NotebookLM auth storage.${NC}"
        exit 1
    fi

    STORAGE_VALIDATION_RESULT="$(python3 - "$LOCAL_STORAGE_STATE_FILE" <<'PY'
import json
import sys

path = sys.argv[1]

try:
    with open(path, "r", encoding="utf-8") as file:
        payload = json.load(file)
except Exception as error:
    print(f"Invalid storage_state.json: {error}")
    raise SystemExit(1)

cookies = payload.get("cookies")
if not isinstance(cookies, list):
    print("Invalid storage_state.json: missing top-level 'cookies' array")
    raise SystemExit(1)

cookie_names = sorted(
    {
        str(cookie.get("name"))
        for cookie in cookies
        if isinstance(cookie, dict) and cookie.get("name")
    }
)

if "SID" not in cookie_names:
    preview = ", ".join(cookie_names[:8]) if cookie_names else "(none)"
    print(f"Missing required NotebookLM cookie 'SID'. Found: {preview}")
    raise SystemExit(1)

print("ok")
PY
    )"

    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ NotebookLM auth storage is invalid: $STORAGE_VALIDATION_RESULT${NC}"
        echo -e "${YELLOW}   Re-run login with the same storage path:${NC}"
        echo -e "${YELLOW}   notebooklm --storage $LOCAL_STORAGE_STATE_FILE login${NC}"
        exit 1
    fi
fi

# Ensure API/worker always use local bridge in full dev mode
export NOTEBOOKLM_BRIDGE_URL="http://127.0.0.1:${NLM_BRIDGE_PORT}"
export NOTEBOOKLM_BRIDGE_TOKEN="$BRIDGE_TOKEN"
export NOTEBOOKLM_BRIDGE_TIMEOUT_MS="${NOTEBOOKLM_BRIDGE_TIMEOUT_MS:-3600000}"
export NOTEBOOKLM_BRIDGE_POLL_REQUEST_TIMEOUT_MS="${NOTEBOOKLM_BRIDGE_POLL_REQUEST_TIMEOUT_MS:-30000}"
export NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS="${NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS:-3600}"
export NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS="${NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS:-3600}"
export NOTEBOOKLM_HTTP_TIMEOUT_SECONDS="${NOTEBOOKLM_HTTP_TIMEOUT_SECONDS:-60}"
export NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT="${NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT:-12}"
export NOTEBOOKLM_LOG_LEVEL="${NOTEBOOKLM_LOG_LEVEL:-INFO}"
if [ "$USE_AUTH_JSON" = "true" ]; then
    export NOTEBOOKLM_AUTH_JSON="$AUTH_JSON"
    unset NOTEBOOKLM_STORAGE_STATE_DIR
    export NOTEBOOKLM_STORAGE_PATH=""
else
    unset NOTEBOOKLM_AUTH_JSON
    export NOTEBOOKLM_STORAGE_STATE_DIR="$STORAGE_STATE_DIR"
    export NOTEBOOKLM_STORAGE_PATH="$STORAGE_PATH"
fi

# Enable full local enrichments storage mode by default (audio/video/images)
export USE_LOCAL_STORAGE="${USE_LOCAL_STORAGE:-true}"
if [ "$USE_LOCAL_STORAGE" = "true" ] || [ "$USE_LOCAL_STORAGE" = "1" ]; then
    export ENRICHMENTS_LOCAL_PATH="${ENRICHMENTS_LOCAL_PATH:-$SCRIPT_DIR/data/enrichments}"
    export ENRICHMENTS_PUBLIC_URL="${ENRICHMENTS_PUBLIC_URL:-/storage/enrichments}"
    export ENRICHMENTS_PUBLIC_BASE_URL="${ENRICHMENTS_PUBLIC_BASE_URL:-http://127.0.0.1:3456}"
    mkdir -p "$ENRICHMENTS_LOCAL_PATH"
    echo -e "   ✅ Local enrichments storage enabled: $ENRICHMENTS_LOCAL_PATH"
fi

# Build local bridge image only when context changes (or image is missing).
CURRENT_BRIDGE_HASH="$(compute_bridge_context_hash "$NLM_BRIDGE_BUILD_CONTEXT")"
CACHED_BRIDGE_HASH="$(cat "$NLM_BRIDGE_HASH_FILE" 2>/dev/null || true)"
LOCAL_BRIDGE_IMAGE_ID="$(docker image inspect "$NLM_BRIDGE_IMAGE" --format '{{.Id}}' 2>/dev/null || true)"

if [ -z "$LOCAL_BRIDGE_IMAGE_ID" ] || [ "$CURRENT_BRIDGE_HASH" != "$CACHED_BRIDGE_HASH" ]; then
    echo -e "   🔨 Building local NotebookLM bridge image..."
    if ! docker build -t "$NLM_BRIDGE_IMAGE" "$NLM_BRIDGE_BUILD_CONTEXT" >/dev/null; then
        echo -e "${RED}❌ Failed to build local NotebookLM bridge image.${NC}"
        exit 1
    fi
    echo "$CURRENT_BRIDGE_HASH" > "$NLM_BRIDGE_HASH_FILE"
else
    echo -e "   ✅ NotebookLM bridge image unchanged (build skipped)."
fi

DESIRED_BRIDGE_IMAGE_ID="$(docker image inspect "$NLM_BRIDGE_IMAGE" --format '{{.Id}}' 2>/dev/null || true)"
EXISTING_BRIDGE_IMAGE_ID="$(docker inspect "$NLM_BRIDGE_CONTAINER" --format '{{.Image}}' 2>/dev/null || true)"

# Recreate container when image changed (keeps runtime in sync with local code).
if [ -n "$EXISTING_BRIDGE_IMAGE_ID" ] && [ -n "$DESIRED_BRIDGE_IMAGE_ID" ] && [ "$EXISTING_BRIDGE_IMAGE_ID" != "$DESIRED_BRIDGE_IMAGE_ID" ]; then
    echo -e "   ♻️  Recreating NotebookLM bridge container (image updated)..."
    docker rm -f "$NLM_BRIDGE_CONTAINER" >/dev/null 2>&1 || true
fi

if [ "$(docker ps -q -f name=^/${NLM_BRIDGE_CONTAINER}$)" ]; then
    NLM_BRIDGE_WAS_RUNNING=true
    echo -e "   ✅ NotebookLM bridge container already running."
elif [ "$(docker ps -aq -f name=^/${NLM_BRIDGE_CONTAINER}$)" ]; then
    echo -e "   🔄 NotebookLM bridge container exists but is stopped. Starting..."
    docker start "$NLM_BRIDGE_CONTAINER" >/dev/null
    NLM_BRIDGE_STARTED_BY_SCRIPT=true
else
    echo -e "   ✨ Creating NotebookLM bridge container..."
    docker_run_args=(
        -d
        --name "$NLM_BRIDGE_CONTAINER"
        -p "127.0.0.1:${NLM_BRIDGE_PORT}:8000"
        -e "NOTEBOOKLM_BRIDGE_TOKEN=$BRIDGE_TOKEN"
        -e "NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS=$NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS"
        -e "NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS=$NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS"
        -e "NOTEBOOKLM_HTTP_TIMEOUT_SECONDS=$NOTEBOOKLM_HTTP_TIMEOUT_SECONDS"
        -e "NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT=$NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT"
        -e "NOTEBOOKLM_LOG_LEVEL=$NOTEBOOKLM_LOG_LEVEL"
    )
    if [ "$USE_AUTH_JSON" = "true" ]; then
        docker_run_args+=(
            -e "NOTEBOOKLM_AUTH_JSON=$AUTH_JSON"
            -e "NOTEBOOKLM_STORAGE_PATH="
        )
    else
        docker_run_args+=(
            -e "NOTEBOOKLM_STORAGE_PATH=$STORAGE_PATH"
            -e "NOTEBOOKLM_HOME=/app/secrets/notebooklm"
            -v "$STORAGE_STATE_DIR:/app/secrets/notebooklm:ro"
        )
    fi
    docker run "${docker_run_args[@]}" "$NLM_BRIDGE_IMAGE" >/dev/null
    NLM_BRIDGE_STARTED_BY_SCRIPT=true
fi

if ! curl -sSf "http://127.0.0.1:${NLM_BRIDGE_PORT}/health" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  NotebookLM bridge started but health endpoint is not ready yet.${NC}"
else
    echo -e "   ${GREEN}✅ NotebookLM bridge healthy at http://127.0.0.1:${NLM_BRIDGE_PORT}${NC}"
fi

# Sanity check for schema compatibility (required by NLM hybrid source flow).
BRIDGE_SCHEMA_KEYS="$(docker exec "$NLM_BRIDGE_CONTAINER" sh -lc "python - <<'PY'
from app.models import MediaGenerationRequest
print(' '.join(MediaGenerationRequest.model_json_schema().get('properties', {}).keys()))
PY" 2>/dev/null || true)"

if [[ "$BRIDGE_SCHEMA_KEYS" != *"sources"* ]]; then
    echo -e "${RED}❌ NotebookLM bridge schema is outdated (missing 'sources').${NC}"
    echo -e "${YELLOW}   Rebuild failed or stale image is still running. Please re-run start-dev.sh.${NC}"
    exit 1
fi

# =============================================================================
# CLEANUP OLD PROCESSES (prevent duplicate workers)
# =============================================================================
echo -e "\n${YELLOW}🧹 Cleaning up old processes...${NC}"

# Kill any existing worker processes
OLD_WORKERS=$(pgrep -f 'worker-entrypoint' 2>/dev/null)
if [ -n "$OLD_WORKERS" ]; then
    echo -e "   Found old worker processes: $OLD_WORKERS"
    pkill -f 'worker-entrypoint' 2>/dev/null
    sleep 1
    echo -e "   ${GREEN}✅ Old workers killed${NC}"
else
    echo -e "   No old workers found"
fi

# Kill any existing backend processes on port 3456
OLD_BACKEND=$(lsof -ti:3456 2>/dev/null)
if [ -n "$OLD_BACKEND" ]; then
    echo -e "   Found old backend on port 3456: $OLD_BACKEND"
    kill $OLD_BACKEND 2>/dev/null
    sleep 1
    echo -e "   ${GREEN}✅ Old backend killed${NC}"
fi

# Clean stalled BullMQ jobs (optional - only if Redis is running)
if redis-cli ping &>/dev/null; then
    # Clean stalled jobs (use BULLMQ_QUEUE_NAME from .env, fallback to default)
    QUEUE_NAME=$(grep -oP 'BULLMQ_QUEUE_NAME=\K.*' "$SCRIPT_DIR/packages/course-gen-platform/.env" 2>/dev/null || echo "course-generation")
    STALLED_COUNT=$(redis-cli SCARD "bull:${QUEUE_NAME}:stalled" 2>/dev/null || echo "0")
    if [ "$STALLED_COUNT" != "0" ] && [ -n "$STALLED_COUNT" ]; then
        echo -e "   Found $STALLED_COUNT stalled jobs in ${QUEUE_NAME}, cleaning..."
        redis-cli DEL "bull:${QUEUE_NAME}:stalled" &>/dev/null
        echo -e "   ${GREEN}✅ Stalled jobs cleared${NC}"
    fi
    # Clean Stage 7 stalled jobs
    STALLED_COUNT_S7=$(redis-cli SCARD "bull:stage7-enrichments:stalled" 2>/dev/null || echo "0")
    if [ "$STALLED_COUNT_S7" != "0" ] && [ -n "$STALLED_COUNT_S7" ]; then
        echo -e "   Found $STALLED_COUNT_S7 stalled Stage 7 jobs, cleaning..."
        redis-cli DEL "bull:stage7-enrichments:stalled" &>/dev/null
        echo -e "   ${GREEN}✅ Stalled Stage 7 jobs cleared${NC}"
    fi
fi

# =============================================================================
# CHECK AND START REDIS
# =============================================================================
echo -e "\n${YELLOW}📦 Checking Redis status...${NC}"
if redis-cli ping &>/dev/null; then
    echo -e "✅ Redis is already running (native or other container)."
elif [ "$(docker ps -q -f name=megacampus-redis)" ]; then
    echo -e "✅ Redis container is already running."
elif [ "$(docker ps -aq -f status=exited -f name=megacampus-redis)" ]; then
    echo -e "🔄 Redis container exists but is stopped. Starting..."
    docker start megacampus-redis || echo -e "${YELLOW}⚠️  Could not start container, using existing Redis${NC}"
else
    echo -e "✨ Creating and starting new Redis container..."
    docker run -d --name megacampus-redis -p 6379:6379 redis:7-alpine || echo -e "${YELLOW}⚠️  Could not start container, checking for existing Redis...${NC}"
fi

# Final verification
if ! redis-cli ping &>/dev/null; then
    echo -e "${YELLOW}⚠️  Warning: Redis is not responding. Some features may not work.${NC}"
fi

# WSL detection for later use
IS_WSL=false
if grep -qi microsoft /proc/version 2>/dev/null; then
    IS_WSL=true
fi

# =============================================================================
# CLEANUP FUNCTION
# =============================================================================
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down services...${NC}"
    kill $(jobs -p) 2>/dev/null
    if [ "$NLM_BRIDGE_STARTED_BY_SCRIPT" = true ] && [ "$NLM_BRIDGE_WAS_RUNNING" = false ]; then
        echo -e "${YELLOW}🧩 Stopping local NotebookLM bridge container...${NC}"
        docker stop "$NLM_BRIDGE_CONTAINER" >/dev/null 2>&1 || true
    fi
    echo -e "${GREEN}👋 Development environment stopped.${NC}"
    echo -e "${BLUE}📝 Logs saved to: $LOGS_DIR${NC}"
    exit
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT SIGTERM

# Helper: log with timestamp and tee to combined log (ANSI-filtered)
log_service() {
    local service=$1
    local log_file=$2
    while IFS= read -r line; do
        local ts=$(date '+%H:%M:%S')
        echo "[$ts] $line" | tee >(ansifilter >> "$COMBINED_LOG")
    done
}

# =============================================================================
# START SERVICES
# =============================================================================

# 1. Start Backend (tRPC API server) on port 3456
echo -e "\n${BLUE}⚙️  Starting Backend (course-gen-platform) on port 3456...${NC}"
(PORT=3456 pnpm --filter course-gen-platform dev 2>&1 | tee "$BACKEND_LOG" | npx pino-pretty --colorize --translateTime 'HH:MM:ss' --ignore pid,hostname,service,environment,version | sed "s/^/[backend] /" | log_service backend "$BACKEND_LOG") &
BACKEND_PID=$!

# 2. Start BullMQ Worker (Stages 1-5)
echo -e "\n${BLUE}👷 Starting BullMQ Worker (Stages 1-5)...${NC}"
(pnpm --filter course-gen-platform dev:worker 2>&1 | tee "$WORKER_LOG" | npx pino-pretty --colorize --translateTime 'HH:MM:ss' --ignore pid,hostname,service,environment,version | sed "s/^/[worker] /" | log_service worker "$WORKER_LOG") &
WORKER_PID=$!

# 3. Start Stage 6 Worker (lesson content generation)
echo -e "\n${BLUE}📝 Starting Stage 6 Worker (lesson content)...${NC}"
(pnpm --filter course-gen-platform dev:worker:stage6 2>&1 | tee "$WORKER_STAGE6_LOG" | npx pino-pretty --colorize --translateTime 'HH:MM:ss' --ignore pid,hostname,service,environment,version | sed "s/^/[stage6] /" | log_service stage6 "$WORKER_STAGE6_LOG") &
WORKER_STAGE6_PID=$!

# 4. Start Stage 7 Enrichment Worker
echo -e "\n${BLUE}🎨 Starting Stage 7 Enrichment Worker...${NC}"
(pnpm --filter course-gen-platform dev:worker:stage7 2>&1 | tee "$WORKER_STAGE7_LOG" | npx pino-pretty --colorize --translateTime 'HH:MM:ss' --ignore pid,hostname,service,environment,version | sed "s/^/[stage7] /" | log_service stage7 "$WORKER_STAGE7_LOG") &
WORKER_STAGE7_PID=$!

# 5. Start Frontend (Turbopack, --hostname 0.0.0.0 for LAN access)
echo -e "\n${BLUE}🖥️  Starting Frontend (web, Turbopack)...${NC}"
(cd "$SCRIPT_DIR/packages/web" && pnpm dev --hostname 0.0.0.0 2>&1 | tee >(ansifilter > "$FRONTEND_LOG") | sed "s/^/[frontend] /" | log_service frontend "$FRONTEND_LOG") &
FRONTEND_PID=$!

# =============================================================================
# WAIT FOR SERVICES AND SHOW STATUS
# =============================================================================
echo -e "\n${YELLOW}⏳ Waiting for services to start...${NC}"
DETECTED_PORT=""
for i in {1..30}; do
    if [ -f "$FRONTEND_LOG" ]; then
        DETECTED_PORT=$(grep -oP 'Local:\s+http://localhost:\K\d+' "$FRONTEND_LOG" 2>/dev/null | head -1)
        if [ -n "$DETECTED_PORT" ]; then
            break
        fi
    fi
    sleep 1
done

# Fallback if port detection failed
if [ -z "$DETECTED_PORT" ]; then
    DETECTED_PORT="3000"
fi

# Detect local IP for LAN access (prefer 192.168.x.x for home WiFi)
LOCAL_IP=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep '^192\.168\.' | head -1)
if [ -z "$LOCAL_IP" ]; then
    # Fallback to first non-loopback IP
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(ip -4 addr show | grep -oP 'inet \K[\d.]+' | grep -v '127.0.0.1' | head -1)
fi

# =============================================================================
# WSL PORT FORWARDING (after port detection)
# =============================================================================
if [ "$IS_WSL" = true ] && [ -n "$LOCAL_IP" ]; then
    echo -e "${YELLOW}🌐 Setting up WSL port forwarding for LAN access...${NC}"
    # Configure portproxy for frontend only (backend works via mirrored networking)
    # Use specific external IP (not 0.0.0.0) to avoid blocking WSL from binding ports
    powershell.exe -Command "netsh interface portproxy delete v4tov4 listenport=$DETECTED_PORT listenaddress=$LOCAL_IP" >/dev/null 2>&1
    powershell.exe -Command "netsh interface portproxy add v4tov4 listenport=$DETECTED_PORT listenaddress=$LOCAL_IP connectport=$DETECTED_PORT connectaddress=127.0.0.1" >/dev/null 2>&1
    echo -e "   ${GREEN}✅ Port forwarding: $LOCAL_IP:$DETECTED_PORT${NC}"
fi

# =============================================================================
# OUTPUT STATUS
# =============================================================================
echo -e "\n${GREEN}✅ All services started!${NC}"
echo -e "   - ⚙️  Backend API: http://localhost:3456"
echo -e "   - 👷 BullMQ Worker (Stages 1-5): running"
echo -e "   - 📝 Stage 6 Worker (lesson content): running"
echo -e "   - 🎨 Stage 7 Worker (enrichments): running"
echo -e "   - 🖥️  Frontend: http://localhost:${DETECTED_PORT}"
echo -e "   - 📦 BullMQ UI: http://localhost:3456/admin/queues"
echo -e "   - 🎧 NotebookLM Bridge: http://127.0.0.1:${NLM_BRIDGE_PORT}"

if [ -n "$LOCAL_IP" ]; then
    echo -e ""
    echo -e "${BLUE}🌐 LAN Access (for other devices on your network):${NC}"
    echo -e "   - Frontend: http://${LOCAL_IP}:${DETECTED_PORT}"
    echo -e "   - Backend:  http://${LOCAL_IP}:3456"
fi

echo -e ""
echo -e "${BLUE}📝 Log files:${NC}"
echo -e "   - Backend:  $BACKEND_LOG"
echo -e "   - Worker:   $WORKER_LOG"
echo -e "   - Stage 6:  $WORKER_STAGE6_LOG"
echo -e "   - Stage 7:  $WORKER_STAGE7_LOG"
echo -e "   - Frontend: $FRONTEND_LOG"
echo -e "   - Combined: $COMBINED_LOG"
echo -e ""
echo -e "${YELLOW}💡 View logs in real-time:${NC}"
echo -e "   tail -f $LOGS_DIR/combined-latest.log"
echo -e "   tail -f $LOGS_DIR/backend-latest.log"
echo -e ""
echo -e "${YELLOW}💡 Options:${NC}"
echo -e "   ./start-dev.sh --verbose  # Show all logs (trace level)"
echo -e ""
echo -e "${YELLOW}Press Ctrl+C to stop all services.${NC}\n"

# Wait for all processes
wait $BACKEND_PID $WORKER_PID $WORKER_STAGE6_PID $WORKER_STAGE7_PID $FRONTEND_PID
