#!/usr/bin/env bash
#
# Dev Delivery Script - Merge current working branch into develop and push develop
#
# Usage: ./push-dev.sh [--yes] [-y]
#        --yes, -y: Skip confirmation prompt
#
# Notes:
# - This is a Dev delivery path only.
# - It does not create release tags or version bumps.
# - It never touches main/master or staging deploy flows.

set -euo pipefail
trap '' SIGPIPE

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

log_info() { echo -e "${BLUE}[info] $*${NC}"; }
log_success() { echo -e "${GREEN}[ok] $*${NC}"; }
log_warning() { echo -e "${YELLOW}[warn] $*${NC}"; }
log_error() { echo -e "${RED}[error] $*${NC}" >&2; }

show_usage() {
    cat <<'EOF'
Usage: bash .claude/scripts/push-dev.sh [--yes|-y]

Promote the current working branch into develop and push develop.
This is a Dev delivery command, not a release command.
EOF
}

main() {
    cd "$PROJECT_ROOT"

    echo ""
    echo "============================================================="
    echo "Dev Delivery"
    echo "============================================================="
    echo ""

    local auto_confirm="false"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --yes|-y) auto_confirm="true"; shift ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown argument: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    local current_branch
    current_branch="$(git branch --show-current)"

    if [ -z "$current_branch" ]; then
        log_error "Detached HEAD is not supported"
        exit 1
    fi

    log_info "Current branch: $current_branch"

    case "$current_branch" in
        main|master)
            log_error "Refusing to run from protected branch '$current_branch'"
            echo "Checkout a feature branch or develop first:"
            echo "  git checkout feature/<name>"
            echo "  git checkout codex/<name>"
            echo "  git checkout develop"
            exit 1
            ;;
        develop)
            ;;
        *)
            log_info "Using non-protected source branch: $current_branch"
            ;;
    esac

    if ! git rev-parse --verify develop >/dev/null 2>&1; then
        log_error "Branch 'develop' does not exist"
        exit 1
    fi

    local stash_needed="false"
    if [ -n "$(git status --porcelain)" ]; then
        log_warning "Uncommitted changes detected; stashing them temporarily"
        git stash push --include-untracked -m "push-dev-temp-stash" >/dev/null
        stash_needed="true"
    fi

    cleanup() {
        local exit_code=$?
        trap - EXIT

        if [ "$stash_needed" = "true" ]; then
            local top_stash
            top_stash="$(git stash list --format='%gd' | awk 'NR==1 {print; exit}')"
            if [ -n "$top_stash" ]; then
                log_info "Restoring stashed local changes..."
                if ! git stash pop --quiet; then
                    log_warning "Could not restore stashed changes automatically"
                    log_warning "Run 'git stash list' and 'git stash pop' manually if needed"
                    exit_code=1
                fi
            fi
        fi

        exit "$exit_code"
    }

    trap cleanup EXIT

    local original_branch="$current_branch"

    if [ "$current_branch" != "develop" ]; then
        log_info "Switching to develop..."
        git checkout develop --quiet
    fi

    log_info "Fetching latest develop from origin..."
    git fetch origin develop --quiet 2>/dev/null || true

    log_info "Fast-forwarding develop from origin..."
    if ! git pull --ff-only origin develop; then
        log_error "Unable to fast-forward develop from origin"
        echo "Resolve develop sync first, then rerun this command."
        exit 1
    fi

    local commits_ahead="0"
    if [ "$original_branch" = "develop" ]; then
        commits_ahead="$(git rev-list --count origin/develop..develop 2>/dev/null || echo "0")"
    else
        commits_ahead="$(git rev-list --count develop.."$original_branch" 2>/dev/null || echo "0")"
    fi

    if [ "$commits_ahead" -eq 0 ] && [ "$original_branch" != "develop" ]; then
        log_warning "No new commits to promote from $original_branch into develop"
        echo "$original_branch is already merged into develop"
        exit 0
    fi

    if [ "$original_branch" = "develop" ] && [ "$commits_ahead" -eq 0 ]; then
        log_warning "develop is already up to date with origin/develop"
        exit 0
    fi

    if [ "$original_branch" != "develop" ]; then
        log_success "Found $commits_ahead commit(s) to promote from $original_branch"
        echo ""
        log_info "Commits to promote ($original_branch -> develop):"
        git log develop.."$original_branch" --oneline -20
        if [ "$commits_ahead" -gt 20 ]; then
            echo "  ... and $((commits_ahead - 20)) more commits"
        fi
        echo ""

        if [ "$auto_confirm" != "true" ]; then
            if [ -t 0 ]; then
                read -p "Promote these $commits_ahead commit(s) to develop? [Y/n]: " confirm
                if [[ ! "$confirm" =~ ^[Yy]?$ ]]; then
                    log_warning "Promotion cancelled"
                    exit 0
                fi
            else
                log_error "Non-interactive mode requires --yes"
                echo "Usage: bash .claude/scripts/push-dev.sh --yes"
                exit 1
            fi
        fi

        log_info "Merging $original_branch into develop..."
        local merge_msg="dev: merge $original_branch into develop

Promoting $commits_ahead commit(s) from $original_branch into develop.

Generated by Dev delivery automation."

        if ! git merge "$original_branch" --no-ff -m "$merge_msg"; then
            git merge --abort >/dev/null 2>&1 || true
            git checkout "$original_branch" --quiet 2>/dev/null || true
            log_error "Merge conflict! Resolve manually:"
            echo "  1. Fix conflicts"
            echo "  2. git add ."
            echo "  3. git commit"
            echo "  4. git push origin develop"
            exit 1
        fi
        log_success "Merge successful"
    fi

    if command -v bd >/dev/null 2>&1; then
        log_info "Syncing Beads..."
        bd sync 2>/dev/null || true
    fi

    log_info "Pushing develop to origin..."
    if ! git push origin develop; then
        log_error "Push failed"
        echo "To retry: git push origin develop"
        exit 1
    fi
    log_success "Pushed develop to origin"

    if [ "$original_branch" != "develop" ]; then
        log_info "Switching back to $original_branch..."
        git checkout "$original_branch" --quiet
    fi

    echo ""
    echo "============================================================="
    echo "DEV DELIVERY SUCCESSFUL!"
    echo "============================================================="
    echo ""
    log_success "Delivered to develop: $original_branch -> develop"
    log_info "Current branch: $original_branch"
    echo ""
}

main "$@"
