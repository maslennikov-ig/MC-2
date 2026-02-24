#!/bin/bash
# Migrate enrichment files from Supabase Storage to local storage
#
# This script downloads files from Supabase Storage bucket and saves them locally.
# After migration, URLs in database will be updated via SQL migration.
#
# Usage:
#   ./scripts/migrate-enrichments.sh [OPTIONS]
#
# Options:
#   --dry-run       Show what would be downloaded without actually downloading
#   --backup        Create backup of existing local files before migration
#   --rollback      Restore from backup (requires previous --backup run)
#   --verify        Verify downloaded files by re-downloading and comparing checksums
#   --force         Overwrite existing files (default: skip existing)
#
# Examples:
#   ./scripts/migrate-enrichments.sh --dry-run          # Preview files to download
#   ./scripts/migrate-enrichments.sh --backup           # Migration with backup
#   ./scripts/migrate-enrichments.sh --rollback         # Restore from backup
#
# Prerequisites:
#   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
#   - curl and jq installed
#   - Run on production server with write access to /opt/megacampus/data/enrichments
#
# @see packages/course-gen-platform/supabase/migrations/20260123000006_migrate_enrichment_urls_to_local.sql

set -euo pipefail

# Configuration
SUPABASE_PROJECT_ID="diqooqbuchsliypgwksu"
BUCKET_NAME="course-enrichments"
LOCAL_PATH="${ENRICHMENTS_LOCAL_PATH:-/opt/megacampus/data/enrichments}"
BACKUP_PATH="${LOCAL_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
MANIFEST_FILE="${LOCAL_PATH}/.migration_manifest.json"

# Flags
DRY_RUN=false
CREATE_BACKUP=false
DO_ROLLBACK=false
VERIFY_FILES=false
FORCE_OVERWRITE=false

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

log_dry() {
    echo -e "${BLUE}[DRY-RUN]${NC} $1"
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --backup)
                CREATE_BACKUP=true
                shift
                ;;
            --rollback)
                DO_ROLLBACK=true
                shift
                ;;
            --verify)
                VERIFY_FILES=true
                shift
                ;;
            --force)
                FORCE_OVERWRITE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --dry-run       Show what would be downloaded without actually downloading"
    echo "  --backup        Create backup of existing local files before migration"
    echo "  --rollback      Restore from backup (requires previous --backup run)"
    echo "  --verify        Verify downloaded files by re-downloading and comparing checksums"
    echo "  --force         Overwrite existing files (default: skip existing)"
    echo "  -h, --help      Show this help message"
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

    # Check md5sum for verification
    if $VERIFY_FILES && ! command -v md5sum &> /dev/null; then
        log_error "md5sum is required for --verify mode"
        exit 1
    fi
}

# Create backup of existing files
create_backup() {
    if [ -d "$LOCAL_PATH" ] && [ "$(ls -A $LOCAL_PATH 2>/dev/null)" ]; then
        log_info "Creating backup at: $BACKUP_PATH"
        cp -r "$LOCAL_PATH" "$BACKUP_PATH"
        echo "$BACKUP_PATH" > "${LOCAL_PATH}/.last_backup_path"
        log_info "Backup created successfully"
    else
        log_info "No existing files to backup"
    fi
}

# Rollback from backup
rollback() {
    local last_backup_file="${LOCAL_PATH}/.last_backup_path"

    if [ ! -f "$last_backup_file" ]; then
        # Try to find the most recent backup
        local latest_backup=$(ls -td ${LOCAL_PATH}.backup.* 2>/dev/null | head -1)
        if [ -z "$latest_backup" ]; then
            log_error "No backup found to rollback from"
            log_info "Run migration with --backup flag first"
            exit 1
        fi
        log_info "Found backup: $latest_backup"
        read -p "Restore from this backup? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Rollback cancelled"
            exit 0
        fi
        local backup_to_restore="$latest_backup"
    else
        local backup_to_restore=$(cat "$last_backup_file")
    fi

    if [ ! -d "$backup_to_restore" ]; then
        log_error "Backup directory not found: $backup_to_restore"
        exit 1
    fi

    log_info "Rolling back from: $backup_to_restore"

    # Remove current files (except backup marker)
    if [ -d "$LOCAL_PATH" ]; then
        rm -rf "${LOCAL_PATH:?}"/*
    fi

    # Restore from backup
    cp -r "${backup_to_restore}/"* "$LOCAL_PATH/" 2>/dev/null || true

    log_info "Rollback completed successfully"
    log_warn "Note: Database URLs were NOT rolled back. Run reverse SQL migration if needed."
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

    # Skip if file exists and not forcing overwrite
    if [ -f "$local_path" ] && ! $FORCE_OVERWRITE; then
        log_info "Skipped (exists): $remote_path"
        return 0
    fi

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

# Verify file checksum
verify_file() {
    local remote_path="$1"
    local local_path="${LOCAL_PATH}/${remote_path}"
    local temp_file="/tmp/verify_$$_$(basename $remote_path)"

    # Download to temp
    curl -s -o "$temp_file" \
        "${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${remote_path}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

    # Compare checksums
    local local_md5=$(md5sum "$local_path" | cut -d' ' -f1)
    local remote_md5=$(md5sum "$temp_file" | cut -d' ' -f1)

    rm -f "$temp_file"

    if [ "$local_md5" = "$remote_md5" ]; then
        log_info "Verified: $remote_path (checksum: $local_md5)"
        return 0
    else
        log_error "Checksum mismatch: $remote_path (local: $local_md5, remote: $remote_md5)"
        return 1
    fi
}

# Collect all files to process
collect_files() {
    local files_list=()

    log_info "Listing bucket contents..."
    local courses=$(list_bucket_files "" | jq -r '.[] | select(.name != null and .id != null) | .name')

    for course in $courses; do
        # List files in course directory
        local files=$(list_bucket_files "$course/" | jq -r '.[] | select(.name != null and .name != ".emptyFolderPlaceholder") | .name')

        for file in $files; do
            # Check if it's a file (has extension) not a directory
            if [[ "$file" == *.* ]]; then
                echo "${course}/${file}"
            fi
        done

        # Also check for nested lesson directories
        local subdirs=$(list_bucket_files "$course/" | jq -r '.[] | select(.id == null) | .name')

        for subdir in $subdirs; do
            local lesson_files=$(list_bucket_files "${course}/${subdir}/" | jq -r '.[] | select(.name != null and .name != ".emptyFolderPlaceholder") | .name')

            for file in $lesson_files; do
                if [[ "$file" == *.* ]]; then
                    echo "${course}/${subdir}/${file}"
                fi
            done
        done
    done
}

# Main migration function
migrate_files() {
    log_info "Starting enrichment files migration from Supabase Storage"
    log_info "Target directory: $LOCAL_PATH"

    if $DRY_RUN; then
        log_dry "DRY RUN MODE - No files will be downloaded"
    fi

    # Create backup if requested
    if $CREATE_BACKUP && ! $DRY_RUN; then
        create_backup
    fi

    # Ensure target directory exists
    if ! $DRY_RUN; then
        mkdir -p "$LOCAL_PATH"
    fi

    local total=0
    local success=0
    local failed=0
    local skipped=0

    # Collect all files first
    log_info "Scanning bucket for files..."
    local all_files=$(collect_files)

    for file_path in $all_files; do
        total=$((total + 1))

        if $DRY_RUN; then
            local local_path="${LOCAL_PATH}/${file_path}"
            if [ -f "$local_path" ]; then
                log_dry "Would skip (exists): $file_path"
                skipped=$((skipped + 1))
            else
                log_dry "Would download: $file_path"
                success=$((success + 1))
            fi
        else
            if download_file "$file_path"; then
                success=$((success + 1))
            else
                failed=$((failed + 1))
            fi
        fi
    done

    # Summary
    echo ""
    log_info "====== Migration Summary ======"
    log_info "Total files found: $total"
    if $DRY_RUN; then
        log_info "Would download: $success"
        log_info "Would skip (exists): $skipped"
    else
        log_info "Downloaded: $success"
        log_warn "Failed: $failed"

        # Save manifest
        echo "{\"timestamp\": \"$(date -Iseconds)\", \"total\": $total, \"success\": $success, \"failed\": $failed}" > "$MANIFEST_FILE"
    fi

    if [ $failed -gt 0 ] && ! $DRY_RUN; then
        log_error "Some files failed to download. Check the logs above."
        exit 1
    fi
}

# Verify all downloaded files
verify_migration() {
    log_info "Verifying downloaded files..."

    local total=0
    local verified=0
    local failed=0

    local all_files=$(collect_files)

    for file_path in $all_files; do
        local local_path="${LOCAL_PATH}/${file_path}"
        if [ -f "$local_path" ]; then
            total=$((total + 1))
            if verify_file "$file_path"; then
                verified=$((verified + 1))
            else
                failed=$((failed + 1))
            fi
        fi
    done

    echo ""
    log_info "====== Verification Summary ======"
    log_info "Files checked: $total"
    log_info "Verified OK: $verified"
    log_warn "Failed verification: $failed"

    if [ $failed -gt 0 ]; then
        log_error "Some files failed verification. Consider re-downloading with --force"
        exit 1
    fi
}

# Run main
parse_args "$@"
check_prerequisites

if $DO_ROLLBACK; then
    rollback
    exit 0
fi

if $VERIFY_FILES; then
    verify_migration
    exit 0
fi

migrate_files

if ! $DRY_RUN; then
    log_info ""
    log_info "Next steps:"
    log_info "1. Verify files: $0 --verify"
    log_info "2. Apply SQL migration to update URLs in database"
    log_info "3. Deploy updated nginx config and restart nginx"
    log_info "4. Test that images load from /storage/enrichments/"
    log_info "5. After 1 week, delete Supabase Storage bucket"

    if $CREATE_BACKUP; then
        log_info ""
        log_info "To rollback if needed: $0 --rollback"
    fi
fi
