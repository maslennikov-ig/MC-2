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
    # Clean Stage 6 stalled jobs
    STALLED_COUNT=$(redis-cli SCARD "bull:course-generation:stalled" 2>/dev/null || echo "0")
    if [ "$STALLED_COUNT" != "0" ] && [ -n "$STALLED_COUNT" ]; then
        echo -e "   Found $STALLED_COUNT stalled Stage 6 jobs, cleaning..."
        redis-cli DEL "bull:course-generation:stalled" &>/dev/null
        echo -e "   ${GREEN}✅ Stalled Stage 6 jobs cleared${NC}"
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

# 5. Start Frontend (--hostname 0.0.0.0 for LAN access)
echo -e "\n${BLUE}🖥️  Starting Frontend (web)...${NC}"
(cd "$SCRIPT_DIR/packages/web" && pnpm dev:webpack --hostname 0.0.0.0 2>&1 | tee >(ansifilter > "$FRONTEND_LOG") | sed "s/^/[frontend] /" | log_service frontend "$FRONTEND_LOG") &
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
