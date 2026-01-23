#!/bin/bash
# Migrate enrichment files from Supabase Storage to local storage
#
# This script downloads files from Supabase Storage bucket and saves them locally.
# After migration, URLs in database will be updated via SQL migration.
#
# Usage:
#   ./scripts/migrate-enrichments.sh
#
# Prerequisites:
#   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
#   - curl and jq installed
#   - Run on production server with write access to /opt/megacampus/data/enrichments
#
# @see packages/course-gen-platform/supabase/migrations/YYYYMMDD_migrate_enrichment_urls.sql

set -euo pipefail

# Configuration
SUPABASE_PROJECT_ID="diqooqbuchsliypgwksu"
BUCKET_NAME="course-enrichments"
LOCAL_PATH="${ENRICHMENTS_LOCAL_PATH:-/opt/megacampus/data/enrichments}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check prerequisites
check_prerequisites() {
    if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
        log_error "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required"
        log_info "Export them from .env.production or set manually"
        exit 1
    fi

    for cmd in curl jq; do
        if ! command -v $cmd &> /dev/null; then
            log_error "$cmd is required but not installed"
            exit 1
        fi
    done
}

# List all files in bucket
list_bucket_files() {
    local prefix="${1:-}"

    curl -s -X POST \
        "${SUPABASE_URL}/storage/v1/object/list/${BUCKET_NAME}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"prefix\": \"${prefix}\", \"limit\": 1000}"
}

# Download a single file
download_file() {
    local remote_path="$1"
    local local_path="${LOCAL_PATH}/${remote_path}"
    local local_dir=$(dirname "$local_path")

    # Create directory if needed
    mkdir -p "$local_dir"

    # Download file
    curl -s -o "$local_path" \
        "${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${remote_path}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

    if [ -f "$local_path" ] && [ -s "$local_path" ]; then
        log_info "Downloaded: $remote_path"
        return 0
    else
        log_warn "Failed to download: $remote_path"
        return 1
    fi
}

# Main migration function
migrate_files() {
    log_info "Starting enrichment files migration from Supabase Storage"
    log_info "Target directory: $LOCAL_PATH"

    # Ensure target directory exists
    mkdir -p "$LOCAL_PATH"

    local total=0
    local success=0
    local failed=0

    # List all course directories
    log_info "Listing bucket contents..."
    local courses=$(list_bucket_files "" | jq -r '.[] | select(.name != null and .id != null) | .name')

    for course in $courses; do
        log_info "Processing course: $course"

        # List files in course directory (including subdirectories)
        local files=$(list_bucket_files "$course/" | jq -r '.[] | select(.name != null and .name != ".emptyFolderPlaceholder") | .name')

        for file in $files; do
            local full_path="${course}/${file}"
            total=$((total + 1))

            if download_file "$full_path"; then
                success=$((success + 1))
            else
                failed=$((failed + 1))
            fi
        done

        # Also check for nested lesson directories
        local subdirs=$(list_bucket_files "$course/" | jq -r '.[] | select(.id == null) | .name')

        for subdir in $subdirs; do
            local lesson_files=$(list_bucket_files "${course}/${subdir}/" | jq -r '.[] | select(.name != null and .name != ".emptyFolderPlaceholder") | .name')

            for file in $lesson_files; do
                local full_path="${course}/${subdir}/${file}"
                total=$((total + 1))

                if download_file "$full_path"; then
                    success=$((success + 1))
                else
                    failed=$((failed + 1))
                fi
            done
        done
    done

    log_info "Migration complete!"
    log_info "Total files: $total"
    log_info "Successful: $success"
    log_warn "Failed: $failed"

    if [ $failed -gt 0 ]; then
        log_error "Some files failed to download. Check the logs above."
        exit 1
    fi
}

# Run main
check_prerequisites
migrate_files

log_info ""
log_info "Next steps:"
log_info "1. Verify files in $LOCAL_PATH"
log_info "2. Apply SQL migration to update URLs in database"
log_info "3. Deploy updated nginx config and restart nginx"
log_info "4. Test that images load from /storage/enrichments/"
log_info "5. After 1 week, delete Supabase Storage bucket"
