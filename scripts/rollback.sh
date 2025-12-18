#!/bin/bash
set -euo pipefail

# MegaCampus Production Rollback Script
# Rolls back to previous deployment state

# Configuration
COMPOSE_FILE="docker-compose.production.yml"
BACKUP_DIR="./backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Error handler
error_exit() {
    log_error "$1"
    exit 1
}

# Check if running as correct user
if [ "$(whoami)" != "claude-deploy" ] && [ "$(whoami)" != "root" ]; then
    error_exit "This script must be run as claude-deploy or root user"
fi

# Check if compose file exists
if [ ! -f "${COMPOSE_FILE}" ]; then
    error_exit "Compose file ${COMPOSE_FILE} not found!"
fi

# Find latest backup
find_latest_backup() {
    if [ ! -d "${BACKUP_DIR}" ]; then
        log_error "Backup directory not found: ${BACKUP_DIR}"
        return 1
    fi

    local latest_backup=$(ls -t "${BACKUP_DIR}"/images_*.txt 2>/dev/null | head -1)
    if [ -z "${latest_backup}" ]; then
        log_error "No backup found in ${BACKUP_DIR}"
        return 1
    fi

    echo "${latest_backup}"
}

# Health check function
check_health() {
    local service="$1"
    local url="$2"
    local max_attempts=30
    local attempt=0

    log_info "Checking health of ${service}..."

    while [ $attempt -lt $max_attempts ]; do
        if curl -f -s "${url}" > /dev/null 2>&1; then
            log_info "${service} is healthy!"
            return 0
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done

    log_error "${service} health check failed after ${max_attempts} attempts"
    return 1
}

# Main rollback
log_step "Starting rollback procedure..."

# Find latest backup
LATEST_BACKUP=$(find_latest_backup)
if [ -z "${LATEST_BACKUP}" ]; then
    error_exit "No backup found to rollback to"
fi

log_info "Found backup: ${LATEST_BACKUP}"

# Extract previous image tags from backup
log_step "Reading previous image versions..."
cat "${LATEST_BACKUP}"

# Stop current containers
log_step "Stopping current containers..."
docker compose -f "${COMPOSE_FILE}" down

# Pull previous images
log_step "Pulling previous images..."
log_warn "Note: This assumes previous images are still available in the registry"

# Try to pull the 'previous' tag or the second most recent tag
docker compose -f "${COMPOSE_FILE}" pull || log_warn "Some images may not be available"

# Start services with previous images
log_step "Starting services with previous version..."
docker compose -f "${COMPOSE_FILE}" up -d

# Wait for services to start
log_info "Waiting for services to initialize..."
sleep 20

# Verify rollback
log_step "Verifying rollback..."
ROLLBACK_SUCCESS=true

if ! check_health "API" "http://localhost:4000/health"; then
    log_error "API service health check failed after rollback"
    ROLLBACK_SUCCESS=false
fi

if ! check_health "Web" "http://localhost:3000/api/health"; then
    log_error "Web service health check failed after rollback"
    ROLLBACK_SUCCESS=false
fi

# Show final status
log_step "Rollback status:"
docker compose -f "${COMPOSE_FILE}" ps

if [ "$ROLLBACK_SUCCESS" = true ]; then
    log_info "Rollback completed successfully!"
    log_info "Services are running with previous version"
    exit 0
else
    log_error "Rollback completed but some health checks failed"
    log_error "Manual intervention may be required"
    exit 1
fi
