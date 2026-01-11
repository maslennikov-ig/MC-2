#!/usr/bin/env bash
#
# Deploy Script - Merge develop into main for production deployment
#
# Usage: ./deploy.sh [--force] [--yes]
#        --force: Skip quality checks (type-check, build)
#        --yes: Skip confirmation prompt

set -euo pipefail

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

    # If on main, use develop as source
    if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
        log_warning "Already on main branch"
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

    # Ensure main branch exists
    if ! git rev-parse --verify main >/dev/null 2>&1; then
        log_error "Branch 'main' does not exist"
        exit 1
    fi

    # Fetch latest from remote
    log_info "Fetching latest from remote..."
    git fetch origin main "$source_branch" 2>/dev/null || true

    # Check if source branch has changes not in main
    local commits_ahead=$(git rev-list main.."$source_branch" --count 2>/dev/null || echo "0")
    if [ "$commits_ahead" -eq 0 ]; then
        log_warning "No new commits in $source_branch to deploy"
        echo "$source_branch is already merged into main"
        exit 0
    fi
    log_success "Found $commits_ahead commit(s) to deploy from $source_branch"

    # Show what will be deployed
    echo ""
    log_info "Commits to deploy ($source_branch → main):"
    git log main.."$source_branch" --oneline | head -20
    echo ""

    # Confirmation
    if [ "$auto_confirm" != "true" ]; then
        read -p "Deploy these $commits_ahead commit(s) to production? [Y/n]: " confirm
        if [[ ! "$confirm" =~ ^[Yy]?$ ]]; then
            log_warning "Deploy cancelled"
            exit 0
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

    # Switch to main
    log_info "Switching to main..."
    git checkout main --quiet

    # Pull latest main
    log_info "Pulling latest main..."
    git pull origin main --quiet 2>/dev/null || true

    # Merge source branch into main
    log_info "Merging $source_branch into main..."
    local merge_msg="deploy: merge $source_branch into main

Deploying $commits_ahead commit(s) to production from $source_branch.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

    if ! git merge "$source_branch" --no-ff -m "$merge_msg"; then
        log_error "Merge conflict! Resolve manually:"
        echo "  1. Fix conflicts"
        echo "  2. git add ."
        echo "  3. git commit"
        echo "  4. git push origin main"
        exit 1
    fi
    log_success "Merge successful"

    # Push to main (triggers deploy)
    log_info "Pushing to main (triggering deploy)..."
    if ! git push origin main; then
        log_error "Push failed!"
        echo "To retry: git push origin main"
        exit 1
    fi
    log_success "Pushed to main"

    # Switch back to source branch
    log_info "Switching back to $source_branch..."
    git checkout "$source_branch" --quiet

    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║              DEPLOY SUCCESSFUL! 🚀                        ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    log_success "Deployed $commits_ahead commit(s) to production"
    log_success "Merged: $source_branch → main"
    log_info "Current branch: $source_branch (ready for next work)"
    echo ""

    # Sync develop with main if deployed from feature branch
    if [ "$source_branch" != "develop" ]; then
        if [ "$auto_sync" = "true" ]; then
            # Auto-sync develop with main
            log_info "Syncing develop with main (--sync flag)..."
            git checkout develop --quiet
            if git merge main --no-edit; then
                git push origin develop --quiet 2>/dev/null || true
                log_success "develop synced with main"
                git checkout "$source_branch" --quiet
            else
                log_warning "Merge conflict while syncing develop"
                echo "Resolve manually, then: git push origin develop"
            fi
            echo ""
        else
            # Show reminder
            echo "┌─────────────────────────────────────────────────────────────┐"
            echo "│  ⚠️  IMPORTANT: Sync develop with main                      │"
            echo "│                                                             │"
            echo "│  You deployed from '$source_branch' (not develop)."
            echo "│  To keep develop up-to-date, run:                           │"
            echo "│                                                             │"
            echo "│    git checkout develop                                     │"
            echo "│    git merge main                                           │"
            echo "│    git push origin develop                                  │"
            echo "│                                                             │"
            echo "│  Or use: /deploy --sync  (auto-sync after deploy)           │"
            echo "└─────────────────────────────────────────────────────────────┘"
            echo ""
        fi
    fi
}

main "$@"
