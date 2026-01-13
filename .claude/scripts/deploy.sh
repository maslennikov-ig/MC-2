#!/usr/bin/env bash
#
# Deploy Script - Merge current branch into master for production deployment
#
# Usage: ./deploy.sh [--force] [--yes] [--sync]
#        --force: Skip quality checks (type-check, build)
#        --yes: Skip confirmation prompt
#        --sync: Auto-sync develop with master after deploy

set -eo pipefail
# Note: -u (nounset) removed - causes issues with empty arrays
# pipefail kept but head/tail patterns handled carefully

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
log_success() { echo -e "${GREEN}✅ $*${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $*${NC}"; }
log_error() { echo -e "${RED}❌ $*${NC}" >&2; }

main() {
    cd "$PROJECT_ROOT"

    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                  Production Deploy                         ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""

    # Parse arguments
    local force_deploy="false"
    local auto_confirm="false"
    local auto_sync="false"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force|-f) force_deploy="true"; shift ;;
            --yes|-y) auto_confirm="true"; shift ;;
            --sync|-s) auto_sync="true"; shift ;;
            *) log_error "Unknown argument: $1"; exit 1 ;;
        esac
    done

    # Check current branch
    local current_branch=$(git branch --show-current)
    local source_branch="$current_branch"
    log_info "Current branch: $current_branch"

    # If on master, use develop as source
    if [ "$current_branch" = "master" ] || [ "$current_branch" = "main" ]; then
        log_warning "Already on master branch"
        if git rev-parse --verify develop >/dev/null 2>&1; then
            source_branch="develop"
            log_info "Will merge from: develop"
        else
            log_error "No develop branch to merge from"
            echo "Switch to the branch you want to deploy first:"
            echo "  git checkout <branch>"
            echo "  /deploy"
            exit 1
        fi
    fi

    # Ensure master branch exists
    if ! git rev-parse --verify master >/dev/null 2>&1; then
        log_error "Branch 'master' does not exist"
        exit 1
    fi

    # Fetch latest from remote
    log_info "Fetching latest from remote..."
    git fetch origin master "$source_branch" 2>/dev/null || true

    # Check if source branch has changes not in master
    local commits_ahead=$(git rev-list master.."$source_branch" --count 2>/dev/null || echo "0")
    if [ "$commits_ahead" -eq 0 ]; then
        log_warning "No new commits in $source_branch to deploy"
        echo "$source_branch is already merged into master"
        exit 0
    fi
    log_success "Found $commits_ahead commit(s) to deploy from $source_branch"

    # Show what will be deployed
    echo ""
    log_info "Commits to deploy ($source_branch → master):"
    git log master.."$source_branch" --oneline -20
    if [ "$commits_ahead" -gt 20 ]; then
        echo "  ... and $((commits_ahead - 20)) more commits"
    fi
    echo ""

    # Confirmation
    if [ "$auto_confirm" != "true" ]; then
        # Check if running interactively
        if [ -t 0 ]; then
            read -p "Deploy these $commits_ahead commit(s) to production? [Y/n]: " confirm
            if [[ ! "$confirm" =~ ^[Yy]?$ ]]; then
                log_warning "Deploy cancelled"
                exit 0
            fi
        else
            log_error "Non-interactive mode requires --yes flag"
            echo "Usage: /deploy --yes"
            exit 1
        fi
    fi

    # Run quality checks (unless --force)
    if [ "$force_deploy" != "true" ]; then
        log_info "Running quality checks..."

        # Stash any uncommitted changes
        local stash_needed="false"
        if ! git diff-index --quiet HEAD -- 2>/dev/null; then
            log_warning "Stashing uncommitted changes..."
            git stash push -m "deploy-temp-stash"
            stash_needed="true"
        fi

        # Checkout source branch to run checks
        git checkout "$source_branch" --quiet

        # Type check
        log_info "Running type-check..."
        if ! pnpm type-check; then
            log_error "Type-check failed! Fix errors before deploying."
            [ "$stash_needed" = "true" ] && git stash pop --quiet
            exit 1
        fi
        log_success "Type-check passed"

        # Build
        log_info "Running build..."
        if ! pnpm build; then
            log_error "Build failed! Fix errors before deploying."
            [ "$stash_needed" = "true" ] && git stash pop --quiet
            exit 1
        fi
        log_success "Build passed"

        # Restore stash if needed
        [ "$stash_needed" = "true" ] && git stash pop --quiet
    else
        log_warning "Skipping quality checks (--force)"
    fi

    # Sync Beads before deploy (if bd is available)
    if command -v bd &> /dev/null; then
        log_info "Syncing Beads..."
        bd sync 2>/dev/null || true
    fi

    # Switch to master
    log_info "Switching to master..."
    git checkout master --quiet

    # Pull latest master
    log_info "Pulling latest master..."
    git pull origin master --quiet 2>/dev/null || true

    # Merge source branch into master
    log_info "Merging $source_branch into master..."
    local merge_msg="deploy: merge $source_branch into master

Deploying $commits_ahead commit(s) to production from $source_branch.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

    if ! git merge "$source_branch" --no-ff -m "$merge_msg"; then
        log_error "Merge conflict! Resolve manually:"
        echo "  1. Fix conflicts"
        echo "  2. git add ."
        echo "  3. git commit"
        echo "  4. git push origin master"
        exit 1
    fi
    log_success "Merge successful"

    # Push to master (triggers deploy)
    log_info "Pushing to master (triggering deploy)..."
    if ! git push origin master; then
        log_error "Push failed!"
        echo "To retry: git push origin master"
        exit 1
    fi
    log_success "Pushed to master"

    # Switch back to source branch
    log_info "Switching back to $source_branch..."
    git checkout "$source_branch" --quiet

    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║              DEPLOY SUCCESSFUL! 🚀                        ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    log_success "Deployed $commits_ahead commit(s) to production"
    log_success "Merged: $source_branch → master"
    log_info "Current branch: $source_branch (ready for next work)"
    echo ""

    # Sync develop with master if deployed from feature branch
    if [ "$source_branch" != "develop" ]; then
        if [ "$auto_sync" = "true" ]; then
            # Auto-sync develop with master
            log_info "Syncing develop with master (--sync flag)..."
            git checkout develop --quiet
            if git merge master --no-edit; then
                git push origin develop --quiet 2>/dev/null || true
                log_success "develop synced with master"
                git checkout "$source_branch" --quiet
            else
                log_warning "Merge conflict while syncing develop"
                echo "Resolve manually, then: git push origin develop"
            fi
            echo ""
        else
            # Show reminder
            echo "┌─────────────────────────────────────────────────────────────┐"
            echo "│  ⚠️  IMPORTANT: Sync develop with master                    │"
            echo "│                                                             │"
            echo "│  You deployed from '$source_branch' (not develop)."
            echo "│  To keep develop up-to-date, run:                           │"
            echo "│                                                             │"
            echo "│    git checkout develop                                     │"
            echo "│    git merge master                                         │"
            echo "│    git push origin develop                                  │"
            echo "│                                                             │"
            echo "│  Or use: /deploy --sync  (auto-sync after deploy)           │"
            echo "└─────────────────────────────────────────────────────────────┘"
            echo ""
        fi
    fi
}

main "$@"
