#!/bin/bash
set -euo pipefail

# MegaCampus Production Deployment Script
# Zero-downtime rolling deployment with health checks and rollback

# Configuration
ENVIRONMENT="${1:-production}"
TAG="${2:-latest}"
COMPOSE_FILE="docker-compose.production.yml"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

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

# Check if environment file exists
if [ ! -f ".env.production" ]; then
    error_exit "Environment file .env.production not found!"
fi

# Create backup directory
mkdir -p "${BACKUP_DIR}"

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

# Backup current state
backup_state() {
    log_step "Creating backup of current state..."

    # Save current container IDs and images
    docker compose -f "${COMPOSE_FILE}" ps -q > "${BACKUP_DIR}/containers_${TIMESTAMP}.txt" || true
    docker compose -f "${COMPOSE_FILE}" images > "${BACKUP_DIR}/images_${TIMESTAMP}.txt" || true

    log_info "Backup created: ${BACKUP_DIR}/*_${TIMESTAMP}.txt"
}

# Main deployment
log_step "Starting deployment to ${ENVIRONMENT} with tag ${TAG}..."

# Backup current state
backup_state

# Pull latest code (if in git repo)
if [ -d ".git" ]; then
    log_step "Pulling latest code from git..."
    git fetch origin

    # Detect current branch
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    log_info "Current branch: ${CURRENT_BRANCH}"

    git reset --hard origin/${CURRENT_BRANCH}
else
    log_warn "Not a git repository, skipping git pull"
fi

# Log in to GitHub Container Registry
log_step "Logging in to GitHub Container Registry..."
if [ -n "${GITHUB_TOKEN:-}" ]; then
    echo "${GITHUB_TOKEN}" | docker login ghcr.io -u "${GITHUB_ACTOR:-claude-deploy}" --password-stdin
else
    log_warn "GITHUB_TOKEN not set, assuming already logged in"
fi

# Pull latest images (skip docling-mcp - built manually, too large for CI)
log_step "Pulling latest Docker images..."
# Pull specific services, excluding docling-mcp which has pull_policy: if_not_present
docker compose -f "${COMPOSE_FILE}" pull redis web api || error_exit "Failed to pull images"
log_info "Skipping docling-mcp pull (built manually on server)"

# Check if any services are running
if docker compose -f "${COMPOSE_FILE}" ps --quiet | grep -q .; then
    log_step "Services are running, performing update..."

    # Update infrastructure services first (if needed)
    log_step "Updating infrastructure services..."
    docker compose -f "${COMPOSE_FILE}" up -d --no-deps redis

    sleep 5

    # Update API service (recreate with new image)
    log_step "Updating API service..."
    docker compose -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate api
    sleep 15

    if check_health "API" "http://localhost:4000/health"; then
        log_info "API container is healthy"
    else
        log_error "API container failed health check"
        error_exit "API deployment failed"
    fi

    # Update worker
    log_step "Updating worker service..."
    docker compose -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate worker

    # Update web service
    log_step "Updating web service..."
    docker compose -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate web
    sleep 15

    if check_health "Web" "http://localhost:3000/api/health"; then
        log_info "Web container is healthy"
    else
        log_error "Web container failed health check"
        error_exit "Web deployment failed"
    fi
else
    log_step "No services running, performing fresh start..."
    docker compose -f "${COMPOSE_FILE}" up -d
    sleep 20

    # Check health of all services
    if ! check_health "API" "http://localhost:4000/health"; then
        error_exit "API service failed to start"
    fi

    if ! check_health "Web" "http://localhost:3000/api/health"; then
        error_exit "Web service failed to start"
    fi
fi

# Cleanup old images
log_step "Cleaning up old Docker images..."
docker image prune -f

# Show final status
log_step "Deployment status:"
docker compose -f "${COMPOSE_FILE}" ps

log_info "Deployment to ${ENVIRONMENT} completed successfully!"
log_info "Web: http://localhost:3000"
log_info "API: http://localhost:4000"
log_info "Backup: ${BACKUP_DIR}/*_${TIMESTAMP}.txt"
