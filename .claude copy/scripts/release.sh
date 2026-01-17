#!/usr/bin/env bash
#
# Release Automation Script
# Automated release management with version bumping and changelog generation
#
# Features:
# - Auto-syncs package.json versions with latest git tag (prevents version conflicts)
# - Auto-detects version bump from conventional commits
# - Generates CHANGELOG.md entries with Keep a Changelog format
# - Supports security, deprecated, and removed categories
# - Safe rollback with file backups (no data loss on errors)
# - Rollback support for failed releases
#
# Usage: ./release.sh [patch|minor|major] [--yes] [--message "commit message"]
#        Leave empty for auto-detection from conventional commits
#        --yes: Skip confirmation prompt (for automation)
#        --message, -m: Custom commit message for auto-committing uncommitted changes
#
# Supported conventional commit types:
#   security:   → Security section (patch version)
#   feat:       → Added section (minor version)
#   fix:        → Fixed section (patch version)
#   deprecate:  → Deprecated section
#   remove:     → Removed section
#   refactor:   → Changed section
#   perf:       → Changed section
#   type!:      → Breaking changes (major version)

set -euo pipefail

# Ignore SIGPIPE - this prevents exit code 141 when pipe readers close early
# This is safe because we handle errors explicitly in critical sections
trap '' SIGPIPE

# === CONFIGURATION ===
readonly DATE=$(date +%Y-%m-%d)
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# State tracking for rollback
CREATED_COMMIT=""
CREATED_TAG=""
CUSTOM_COMMIT_MSG=""  # Custom message for auto-commit (set via --message flag)
declare -a MODIFIED_FILES=()
declare -a BACKUP_FILES=()  # Track backup files for safe rollback

# Commit categorization arrays
declare -a ALL_COMMITS=()
declare -a FEATURES=()
declare -a FIXES=()
declare -a BREAKING_CHANGES=()
declare -a REFACTORS=()
declare -a PERF=()
declare -a SECURITY_FIXES=()      # Security vulnerability fixes
declare -a DEPRECATIONS=()        # Deprecated features
declare -a REMOVALS=()            # Removed features
declare -a OTHER_CHANGES=()

# === SIGPIPE-SAFE UTILITIES ===
# These functions replace head to avoid SIGPIPE errors with pipefail in bash 3.2+
# When head closes the pipe early, the writing process receives SIGPIPE (exit 141)
# awk reads only needed lines and exits cleanly without triggering SIGPIPE

# Safe replacement for head -n N
# Usage: command | safe_head 5
safe_head() {
    local n="${1:-1}"
    awk -v n="$n" 'NR <= n {print} NR > n {exit}'
}

# Optimized version for getting first line only
# Usage: command | safe_first
safe_first() {
    awk 'NR==1 {print; exit}'
}

# Safe replacement for tail -n +N (skip first N-1 lines)
# Usage: command | safe_tail_from 5
safe_tail_from() {
    local n="${1:-1}"
    awk -v n="$n" 'NR >= n {print}'
}

# Get commits range handling first release edge case
# Usage: get_commits_range "$LAST_TAG"
get_commits_range() {
    local last_tag="$1"

    if [ -z "$last_tag" ]; then
        # First release - use special marker to include all commits
        # We can't use ${first_commit}^..HEAD because the first commit has no parent
        echo "__ALL_COMMITS__"
    else
        echo "${last_tag}..HEAD"
    fi
}

# === UTILITY FUNCTIONS ===

log_info() {
    echo -e "${BLUE}ℹ️  $*${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $*${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $*${NC}"
}

log_error() {
    echo -e "${RED}❌ $*${NC}" >&2
}

# === BACKUP AND RESTORE ===

create_backup() {
    local file="$1"

    # Only create backup if file exists
    if [ ! -f "$file" ]; then
        return 0
    fi

    local backup="${file}.backup.$$"
    cp "$file" "$backup" || {
        log_error "Failed to create backup of $file"
        exit 1
    }

    BACKUP_FILES+=("$backup")
    log_info "Created backup: ${backup##*/}"
}

restore_from_backups() {
    if [ ${#BACKUP_FILES[@]} -eq 0 ]; then
        return 0
    fi

    log_info "Restoring files from backups..."

    for backup in "${BACKUP_FILES[@]}"; do
        # Extract original filename by removing .backup.$$ suffix
        local original="${backup%.backup.*}"

        if [ -f "$backup" ]; then
            mv "$backup" "$original"
            log_success "Restored: ${original##*/}"
        fi
    done
}

cleanup_backups() {
    # Clean up backup files after successful release
    for backup in "${BACKUP_FILES[@]}"; do
        if [ -f "$backup" ]; then
            rm -f "$backup"
        fi
    done
}

# === CLEANUP AND ROLLBACK ===

cleanup() {
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo ""
        log_error "Error occurred during release process"
        echo ""
        log_warning "Rolling back changes..."

        # Delete tag if created
        if [ -n "$CREATED_TAG" ]; then
            git tag -d "$CREATED_TAG" 2>/dev/null || true
            log_success "Deleted tag $CREATED_TAG"
        fi

        # Rollback commit using reset --soft to preserve working directory
        if [ -n "$CREATED_COMMIT" ]; then
            git reset --soft HEAD~1 2>/dev/null || true
            log_success "Rolled back commit (working directory preserved)"
        fi

        # SAFE ROLLBACK: Restore from backups instead of git restore
        # This preserves any manual edits made before running the script
        restore_from_backups

        echo ""
        log_info "Rollback complete. Files restored from backups."
        echo ""
        exit $exit_code
    else
        # Success - clean up backup files
        cleanup_backups
    fi
}

trap cleanup EXIT

# === PRE-FLIGHT CHECKS ===

# Check if remote is ahead of local to prevent push conflicts
check_remote_status() {
    local branch="$1"
    local skip_check="${RELEASE_SKIP_REMOTE_CHECK:-false}"

    if [ "$skip_check" = "true" ]; then
        log_warning "Skipping remote status check (RELEASE_SKIP_REMOTE_CHECK=true)"
        return 0
    fi

    log_info "Checking remote status..."

    # Fetch latest from remote (without merging)
    if ! git fetch origin "$branch" --quiet 2>/dev/null; then
        log_warning "Could not fetch from remote (offline mode or no upstream)"
        return 0
    fi

    # Check if remote branch exists
    if ! git rev-parse "origin/$branch" >/dev/null 2>&1; then
        log_info "Remote branch origin/$branch does not exist yet (new branch)"
        return 0
    fi

    # Check if remote is ahead
    local behind
    behind=$(git rev-list --count "HEAD..origin/$branch" 2>/dev/null || echo "0")

    if [ "$behind" -gt 0 ]; then
        log_error "Remote is $behind commit(s) ahead of local"
        echo ""
        log_info "Please pull changes first:"
        echo "  git pull origin $branch"
        echo ""
        log_info "Or skip this check with:"
        echo "  RELEASE_SKIP_REMOTE_CHECK=true ./release.sh"
        exit 1
    fi

    log_success "Local branch is up to date with remote"
}

run_preflight_checks() {
    log_info "Running pre-flight checks..."
    echo ""

    # Check if we're in the project root
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        log_error "Not in project root. Could not find package.json"
        exit 1
    fi

    # Check if on a branch (not detached HEAD)
    BRANCH=$(git branch --show-current)
    if [ -z "$BRANCH" ]; then
        log_error "You are in detached HEAD state"
        echo "Checkout a branch first:"
        echo "  git checkout develop"
        exit 1
    fi
    log_success "On branch: $BRANCH"

    # Protected branch check - auto-switch to develop if on main
    if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
        log_warning "Cannot push directly to '$BRANCH' (protected, auto-deploys)"
        log_info "Switching to develop branch..."
        git checkout develop 2>/dev/null || git checkout -b develop
        BRANCH="develop"
        log_success "Now on branch: $BRANCH"
        echo ""
        log_info "Use /deploy to merge into main when ready"
    fi

    # Auto-commit uncommitted changes before release
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        log_info "Uncommitted changes detected. Auto-committing before release..."

        # Get file counts by status
        MODIFIED_COUNT=$(git diff --name-only | wc -l)
        STAGED_COUNT=$(git diff --cached --name-only | wc -l)
        UNTRACKED_COUNT=$(git ls-files --others --exclude-standard | wc -l)
        TOTAL_COUNT=$((MODIFIED_COUNT + STAGED_COUNT + UNTRACKED_COUNT))

        # Stage ALL changes (modified, deleted, new files)
        git add -A

        # Get detailed file list for commit body
        FILE_LIST=$(git diff --cached --name-status | sed 's/^/  /')

        # Get file changes with status (A=added, M=modified, D=deleted)
        local file_status=$(git diff --cached --name-status)

        # Count ALL types of changes (added, modified, deleted)
        # Claude/project tooling
        local new_agents=$(echo "$file_status" | grep "^A.*\.claude/agents/.*\.md$" | wc -l)
        local new_skills=$(echo "$file_status" | grep "^A.*\.claude/skills/.*/SKILL\.md$" | wc -l)
        local new_commands=$(echo "$file_status" | grep "^A.*\.claude/commands/.*\.md$" | wc -l)
        local modified_agents=$(echo "$file_status" | grep "^M.*\.claude/agents/.*\.md$" | wc -l)
        local modified_scripts=$(echo "$file_status" | grep "^M.*\.claude/scripts/.*\.sh$" | wc -l)
        local modified_skills=$(echo "$file_status" | grep "^M.*\.claude/skills/.*/SKILL\.md$" | wc -l)
        local modified_commands=$(echo "$file_status" | grep "^M.*\.claude/commands/.*\.md$" | wc -l)
        local modified_docs=$(echo "$file_status" | grep "\.md$" | grep -v "\.claude/" | wc -l)
        local modified_mcp=$(echo "$file_status" | grep "mcp/.*\.json$" | wc -l)
        local deleted_skills=$(echo "$file_status" | grep "^D.*\.claude/skills/.*/SKILL\.md$" | wc -l)
        local deleted_templates=$(echo "$file_status" | grep "^D.*\.claude/templates/.*\.md$" | wc -l)
        local deleted_other=$(echo "$file_status" | grep "^D" | grep -v "\.claude/skills/" | grep -v "\.claude/templates/" | wc -l)

        # Source code changes (TypeScript, JavaScript, Python, etc.)
        local new_source=$(echo "$file_status" | grep "^A" | grep -E "\.(ts|tsx|js|jsx|py|go|rs)$" | grep -v "\.test\." | grep -v "\.spec\." | wc -l)
        local modified_source=$(echo "$file_status" | grep "^M" | grep -E "\.(ts|tsx|js|jsx|py|go|rs)$" | grep -v "\.test\." | grep -v "\.spec\." | wc -l)
        local new_tests=$(echo "$file_status" | grep "^A" | grep -E "\.(test|spec)\.(ts|tsx|js|jsx)$" | wc -l)
        local modified_tests=$(echo "$file_status" | grep "^M" | grep -E "\.(test|spec)\.(ts|tsx|js|jsx)$" | wc -l)

        # Try to detect scope from file paths (packages/xxx/, src/xxx/, lib/xxx/, app/xxx/)
        local detected_scope=""
        local scope_candidates=$(echo "$file_status" | grep -E "^[AM]" | grep -E "\.(ts|tsx|js|jsx)$" | \
            sed -E 's/^[AM]\s+//' | \
            sed -E 's|^packages/([^/]+)/.*|\1|; s|^src/([^/]+)/.*|\1|; s|^lib/([^/]+)/.*|\1|; s|^app/([^/]+)/.*|\1|' | \
            sort | uniq -c | sort -rn | head -1 | awk '{print $2}')
        if [ -n "$scope_candidates" ] && [ "$scope_candidates" != "." ]; then
            detected_scope="$scope_candidates"
        fi

        # Build change summary array
        local changes=()

        # Source code features (new files = new functionality)
        [ "$new_source" -gt 0 ] && changes+=("add ${new_source} source file(s)")
        [ "$modified_source" -gt 0 ] && changes+=("update ${modified_source} source file(s)")
        [ "$new_tests" -gt 0 ] && changes+=("add ${new_tests} test(s)")
        [ "$modified_tests" -gt 0 ] && changes+=("update ${modified_tests} test(s)")

        # Claude tooling
        [ "$new_agents" -gt 0 ] && changes+=("add ${new_agents} agent(s)")
        [ "$new_skills" -gt 0 ] && changes+=("add ${new_skills} skill(s)")
        [ "$new_commands" -gt 0 ] && changes+=("add ${new_commands} command(s)")

        # Updates
        [ "$modified_scripts" -gt 0 ] && changes+=("update scripts")
        [ "$modified_agents" -gt 0 ] && changes+=("update ${modified_agents} agent(s)")
        [ "$modified_skills" -gt 0 ] && changes+=("update ${modified_skills} skill(s)")
        [ "$modified_commands" -gt 0 ] && changes+=("update ${modified_commands} command(s)")
        [ "$modified_mcp" -gt 0 ] && changes+=("update MCP configs")
        [ "$modified_docs" -gt 0 ] && changes+=("update docs")

        # Deletions
        [ "$deleted_skills" -gt 0 ] && changes+=("remove ${deleted_skills} skill(s)")
        [ "$deleted_templates" -gt 0 ] && changes+=("remove templates")
        [ "$deleted_other" -gt 0 ] && changes+=("cleanup ${deleted_other} file(s)")

        # Determine commit type based on what changed (prioritize source code)
        local commit_type="chore"
        local has_feat=false

        # New source files = feature
        if [ "$new_source" -gt 0 ]; then
            commit_type="feat"
            has_feat=true
        # Modified source files = fix (improvements/bug fixes)
        elif [ "$modified_source" -gt 0 ]; then
            commit_type="fix"
        # New agents/skills/commands = feature
        elif [ "$new_agents" -gt 0 ] || [ "$new_skills" -gt 0 ] || [ "$new_commands" -gt 0 ]; then
            commit_type="feat"
            has_feat=true
        # New tests only = test
        elif [ "$new_tests" -gt 0 ] || [ "$modified_tests" -gt 0 ]; then
            commit_type="test"
        # Only scripts modified = chore
        elif [ "$modified_scripts" -gt 0 ] && [ "$modified_scripts" -eq "$TOTAL_COUNT" ]; then
            commit_type="chore"
        # Only docs modified = docs
        elif [ "$modified_docs" -gt 0 ] && [ "$modified_docs" -eq "$TOTAL_COUNT" ]; then
            commit_type="docs"
        fi

        # Build commit message summary
        local commit_desc=""
        local change_count=${#changes[@]}

        if [ "$change_count" -eq 0 ]; then
            commit_desc="update project files"
        elif [ "$change_count" -eq 1 ]; then
            commit_desc="${changes[0]}"
        elif [ "$change_count" -eq 2 ]; then
            commit_desc="${changes[0]}, ${changes[1]}"
        else
            # Multiple changes - create summary
            commit_desc="${changes[0]}, ${changes[1]}, +$((change_count - 2)) more"
        fi

        # Build detailed body with all changes
        local changes_body=""
        for change in "${changes[@]}"; do
            changes_body="${changes_body}- ${change}\n"
        done

        # Build commit prefix with optional scope
        local commit_prefix="${commit_type}"
        if [ -n "$detected_scope" ]; then
            commit_prefix="${commit_type}(${detected_scope})"
        fi

        # Use custom message if provided, otherwise auto-generate
        if [ -n "${CUSTOM_COMMIT_MSG:-}" ]; then
            COMMIT_MSG="${CUSTOM_COMMIT_MSG}

Auto-committed ${TOTAL_COUNT} file(s) before creating release.

Files changed:
${FILE_LIST}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
            log_info "Using custom commit message: ${CUSTOM_COMMIT_MSG}"
        else
            COMMIT_MSG="${commit_prefix}: ${commit_desc}

Changes in this commit:
$(printf '%b' "$changes_body")
Auto-committed ${TOTAL_COUNT} file(s) before creating release.

Files changed:
${FILE_LIST}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
        fi

        # Create commit with retry for lint-staged modifications
        # lint-staged (via pre-commit hook) may modify files, requiring re-stage
        local commit_output
        local commit_exit_code

        commit_output=$(git commit -m "$COMMIT_MSG" 2>&1) || commit_exit_code=$?

        if [ -n "${commit_exit_code:-}" ]; then
            # Check if lint-staged modified files (common with prettier)
            if git diff --name-only | grep -q .; then
                log_info "lint-staged modified files, re-staging and retrying commit..."
                git add -A
                commit_output=$(git commit -m "$COMMIT_MSG" 2>&1) || {
                    log_error "Failed to auto-commit changes after retry"
                    log_error "Git output: $commit_output"
                    exit 1
                }
            else
                log_error "Failed to auto-commit changes"
                log_error "Git output: $commit_output"
                exit 1
            fi
        fi

        log_success "Changes committed (${TOTAL_COUNT} files)"
        log_info "Commit: ${commit_prefix}: ${commit_desc}"
    fi

    # Check if remote is configured
    if ! git remote -v | grep -q origin; then
        log_error "No remote 'origin' configured"
        exit 1
    fi
    log_success "Remote configured"

    # Check if remote is ahead of local
    check_remote_status "$BRANCH"

    # Check for Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    log_success "Node.js available"

    # Get current version
    CURRENT_VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")
    if [ -z "$CURRENT_VERSION" ]; then
        log_error "Could not read current version from package.json"
        exit 1
    fi
    log_success "Current version: $CURRENT_VERSION"

    # Get last git tag (across all branches using --all)
    # Using safe_first instead of head -n 1 to avoid SIGPIPE with pipefail
    LAST_TAG=$(git tag --sort=-version:refname | safe_first || echo "")
    if [ -z "$LAST_TAG" ]; then
        log_warning "No previous git tags found (first release)"
        log_info "Will include all commits from repository start"
        COMMITS_RANGE=$(get_commits_range "")
    else
        log_success "Last tag: $LAST_TAG"
        COMMITS_RANGE=$(get_commits_range "$LAST_TAG")

        # Sync package.json version with git tag if needed
        TAG_VERSION="${LAST_TAG#v}" # Remove 'v' prefix
        if [ "$CURRENT_VERSION" != "$TAG_VERSION" ]; then
            log_warning "Version mismatch: package.json ($CURRENT_VERSION) != tag ($TAG_VERSION)"
            log_info "Syncing package.json versions to $TAG_VERSION..."

            # Find and update all package.json files
            find "$PROJECT_ROOT" -name "package.json" -not -path "*/node_modules/*" -print0 | while IFS= read -r -d '' pkg_file; do
                if grep -q "\"version\"" "$pkg_file"; then
                    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$TAG_VERSION\"/" "$pkg_file"
                    MODIFIED_FILES+=("$pkg_file")
                fi
            done

            CURRENT_VERSION="$TAG_VERSION"
            log_success "Synced all package.json files to version $TAG_VERSION"
        fi
    fi

    # Check for commits since last tag
    if [ "$COMMITS_RANGE" = "__ALL_COMMITS__" ]; then
        # First release - count all commits
        COMMITS_COUNT=$(git rev-list HEAD --count 2>/dev/null || echo "0")
    else
        COMMITS_COUNT=$(git rev-list $COMMITS_RANGE --count 2>/dev/null || echo "0")
    fi
    if [ "$COMMITS_COUNT" -eq 0 ]; then
        log_error "No commits since last release ($LAST_TAG)"
        echo "Nothing to release!"
        exit 1
    fi
    log_success "Found $COMMITS_COUNT commits since last release"

    echo ""
}

# === COMMIT PARSING ===

parse_commits() {
    log_info "Analyzing commits since ${LAST_TAG:-start}..."
    echo ""

    # Get all commits with hash
    while IFS= read -r line; do
        if [ -n "$line" ]; then
            ALL_COMMITS+=("$line")
        fi
    done < <(
        if [ "$COMMITS_RANGE" = "__ALL_COMMITS__" ]; then
            git log --format="%h %s" HEAD
        else
            git log --format="%h %s" $COMMITS_RANGE
        fi
    )

    # Parse and categorize each commit
    # Define regex patterns as variables for proper bash regex matching
    local breaking_pattern='^[a-z]+(\([^)]+\))?!:'
    local feat_pattern='^feat(\([^)]+\))?:'
    local fix_pattern='^fix(\([^)]+\))?:'
    local refactor_pattern='^refactor(\([^)]+\))?:'
    local perf_pattern='^perf(\([^)]+\))?:'
    local security_pattern='^security(\([^)]+\))?:'
    local deprecate_pattern='^deprecate(\([^)]+\))?:'
    local remove_pattern='^remove(\([^)]+\))?:'

    for commit in "${ALL_COMMITS[@]}"; do
        local hash=$(echo "$commit" | awk '{print $1}')
        local message=$(echo "$commit" | cut -d' ' -f2-)

        # Check for breaking changes
        if [[ "$message" =~ $breaking_pattern ]] || echo "$message" | grep -q "BREAKING CHANGE:"; then
            BREAKING_CHANGES+=("$commit")
        # Check for security fixes (high priority!)
        elif [[ "$message" =~ $security_pattern ]]; then
            SECURITY_FIXES+=("$commit")
        # Check for features
        elif [[ "$message" =~ $feat_pattern ]]; then
            FEATURES+=("$commit")
        # Check for fixes
        elif [[ "$message" =~ $fix_pattern ]]; then
            FIXES+=("$commit")
        # Check for deprecations
        elif [[ "$message" =~ $deprecate_pattern ]]; then
            DEPRECATIONS+=("$commit")
        # Check for removals
        elif [[ "$message" =~ $remove_pattern ]]; then
            REMOVALS+=("$commit")
        # Check for refactors
        elif [[ "$message" =~ $refactor_pattern ]]; then
            REFACTORS+=("$commit")
        # Check for performance improvements
        elif [[ "$message" =~ $perf_pattern ]]; then
            PERF+=("$commit")
        # Everything else
        else
            OTHER_CHANGES+=("$commit")
        fi
    done

    # Display commit summary
    log_info "Commit summary:"
    [ ${#BREAKING_CHANGES[@]} -gt 0 ] && echo "  🔥 ${#BREAKING_CHANGES[@]} breaking changes"
    [ ${#SECURITY_FIXES[@]} -gt 0 ] && echo "  🔒 ${#SECURITY_FIXES[@]} security fixes"
    [ ${#FEATURES[@]} -gt 0 ] && echo "  ✨ ${#FEATURES[@]} features"
    [ ${#FIXES[@]} -gt 0 ] && echo "  🐛 ${#FIXES[@]} bug fixes"
    [ ${#DEPRECATIONS[@]} -gt 0 ] && echo "  ⚠️  ${#DEPRECATIONS[@]} deprecations"
    [ ${#REMOVALS[@]} -gt 0 ] && echo "  🗑️  ${#REMOVALS[@]} removals"
    [ ${#REFACTORS[@]} -gt 0 ] && echo "  ♻️  ${#REFACTORS[@]} refactors"
    [ ${#PERF[@]} -gt 0 ] && echo "  ⚡ ${#PERF[@]} performance improvements"
    [ ${#OTHER_CHANGES[@]} -gt 0 ] && echo "  📝 ${#OTHER_CHANGES[@]} other changes"
    echo ""
}

# === VERSION BUMP DETECTION ===

detect_version_bump() {
    local provided_bump="$1"

    # If bump type provided, validate and use it
    if [ -n "$provided_bump" ]; then
        if [[ ! "$provided_bump" =~ ^(patch|minor|major)$ ]]; then
            log_error "Invalid version bump type: $provided_bump"
            echo "Usage: ./release.sh [patch|minor|major]"
            exit 1
        fi
        BUMP_TYPE="$provided_bump"
        AUTO_DETECT_REASON="Manually specified"
        log_info "Using manual version bump: $BUMP_TYPE"
    else
        # Auto-detect from commits
        if [ ${#BREAKING_CHANGES[@]} -gt 0 ]; then
            BUMP_TYPE="major"
            AUTO_DETECT_REASON="Found ${#BREAKING_CHANGES[@]} breaking change(s)"
        elif [ ${#FEATURES[@]} -gt 0 ]; then
            BUMP_TYPE="minor"
            AUTO_DETECT_REASON="Found ${#FEATURES[@]} new feature(s)"
        elif [ ${#SECURITY_FIXES[@]} -gt 0 ]; then
            BUMP_TYPE="patch"
            AUTO_DETECT_REASON="Found ${#SECURITY_FIXES[@]} security fix(es)"
        elif [ ${#FIXES[@]} -gt 0 ]; then
            BUMP_TYPE="patch"
            AUTO_DETECT_REASON="Found ${#FIXES[@]} bug fix(es)"
        else
            BUMP_TYPE="patch"
            AUTO_DETECT_REASON="Default (no conventional commits detected)"
        fi
        log_success "Auto-detected version bump: $BUMP_TYPE ($AUTO_DETECT_REASON)"
    fi
    echo ""
}

# === VERSION CALCULATION ===

calculate_new_version() {
    local current="$CURRENT_VERSION"
    local IFS='.'
    read -ra parts <<< "$current"

    local major="${parts[0]}"
    local minor="${parts[1]}"
    local patch="${parts[2]}"

    case "$BUMP_TYPE" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
    esac

    NEW_VERSION="$major.$minor.$patch"
}

# === CHANGELOG GENERATION ===

generate_changelog_entry() {
    local version="$1"
    local date="$2"

    cat << EOF
## [$version] - $date

EOF

    # Security section (FIRST - highest priority!)
    if [ ${#SECURITY_FIXES[@]} -gt 0 ]; then
        echo "### Security"
        for commit in "${SECURITY_FIXES[@]}"; do
            format_changelog_line "$commit"
        done
        echo ""
    fi

    # Added section (features)
    if [ ${#FEATURES[@]} -gt 0 ]; then
        echo "### Added"
        for commit in "${FEATURES[@]}"; do
            format_changelog_line "$commit"
        done
        echo ""
    fi

    # Changed section (breaking, refactor, perf)
    if [ ${#BREAKING_CHANGES[@]} -gt 0 ] || [ ${#REFACTORS[@]} -gt 0 ] || [ ${#PERF[@]} -gt 0 ]; then
        echo "### Changed"
        for commit in "${BREAKING_CHANGES[@]}"; do
            format_changelog_line "$commit" "⚠️ BREAKING: "
        done
        for commit in "${REFACTORS[@]}"; do
            format_changelog_line "$commit"
        done
        for commit in "${PERF[@]}"; do
            format_changelog_line "$commit"
        done
        echo ""
    fi

    # Deprecated section
    if [ ${#DEPRECATIONS[@]} -gt 0 ]; then
        echo "### Deprecated"
        for commit in "${DEPRECATIONS[@]}"; do
            format_changelog_line "$commit"
        done
        echo ""
    fi

    # Removed section
    if [ ${#REMOVALS[@]} -gt 0 ]; then
        echo "### Removed"
        for commit in "${REMOVALS[@]}"; do
            format_changelog_line "$commit"
        done
        echo ""
    fi

    # Fixed section
    if [ ${#FIXES[@]} -gt 0 ]; then
        echo "### Fixed"
        for commit in "${FIXES[@]}"; do
            format_changelog_line "$commit"
        done
        echo ""
    fi

    # Other section (chore, docs, ci, build, test, style, etc.)
    if [ ${#OTHER_CHANGES[@]} -gt 0 ]; then
        echo "### Other"
        for commit in "${OTHER_CHANGES[@]}"; do
            format_changelog_line "$commit"
        done
        echo ""
    fi
}

format_changelog_line() {
    local commit="$1"
    local prefix="${2:-}"

    local hash=$(echo "$commit" | awk '{print $1}')
    local message=$(echo "$commit" | cut -d' ' -f2-)

    # Extract scope if present: "type(scope): message" -> "**scope**: message"
    local scope_pattern='^[a-z]+(\(([^)]+)\))?!?:[ ]+(.+)$'
    if [[ "$message" =~ $scope_pattern ]]; then
        local scope="${BASH_REMATCH[2]}"
        local msg="${BASH_REMATCH[3]}"

        if [ -n "$scope" ]; then
            echo "- ${prefix}**${scope}**: ${msg} (${hash})"
        else
            echo "- ${prefix}${msg} (${hash})"
        fi
    else
        # Not a conventional commit, use as-is
        echo "- ${prefix}${message} (${hash})"
    fi
}

# === USER-FACING RELEASE NOTES ===

# Transform technical scope to user-friendly name
get_friendly_scope_name() {
    local scope="$1"

    case "$scope" in
        auth|authentication) echo "Authentication" ;;
        api) echo "API" ;;
        ui|frontend) echo "Interface" ;;
        db|database) echo "Database" ;;
        perf|performance) echo "Performance" ;;
        security|sec) echo "Security" ;;
        agents) echo "AI Agents" ;;
        skills) echo "Skills" ;;
        commands) echo "Commands" ;;
        mcp) echo "MCP Servers" ;;
        docs) echo "Documentation" ;;
        ci|cd) echo "CI/CD" ;;
        *) echo "$scope" ;;
    esac
}

# Format a commit message for user-facing notes (no hash, friendly language)
format_user_facing_line() {
    local commit="$1"
    local message=$(echo "$commit" | cut -d' ' -f2-)

    # Extract scope and message: "type(scope): message" -> friendly format
    local scope_pattern='^[a-z]+(\(([^)]+)\))?!?:[ ]+(.+)$'
    if [[ "$message" =~ $scope_pattern ]]; then
        local scope="${BASH_REMATCH[2]}"
        local msg="${BASH_REMATCH[3]}"

        # Capitalize first letter of message
        msg="$(echo "${msg:0:1}" | tr '[:lower:]' '[:upper:]')${msg:1}"

        if [ -n "$scope" ]; then
            local friendly_scope=$(get_friendly_scope_name "$scope")
            echo "- **${friendly_scope}**: ${msg}"
        else
            echo "- ${msg}"
        fi
    else
        # Not a conventional commit, capitalize and use as-is
        local capitalized="$(echo "${message:0:1}" | tr '[:lower:]' '[:upper:]')${message:1}"
        echo "- ${capitalized}"
    fi
}

# Generate user-facing release notes (marketing format)
generate_user_facing_notes_entry() {
    local version="$1"
    local date="$2"

    cat << EOF
## v${version}

_Released on ${date}_

EOF

    # New Features (from feat commits)
    if [ ${#FEATURES[@]} -gt 0 ]; then
        echo "### ✨ New Features"
        echo ""
        for commit in "${FEATURES[@]}"; do
            format_user_facing_line "$commit"
        done
        echo ""
    fi

    # Improvements (from refactor + perf)
    if [ ${#REFACTORS[@]} -gt 0 ] || [ ${#PERF[@]} -gt 0 ]; then
        echo "### 🔧 Improvements"
        echo ""
        for commit in "${PERF[@]}"; do
            format_user_facing_line "$commit"
        done
        for commit in "${REFACTORS[@]}"; do
            format_user_facing_line "$commit"
        done
        echo ""
    fi

    # Security (from security commits)
    if [ ${#SECURITY_FIXES[@]} -gt 0 ]; then
        echo "### 🔒 Security"
        echo ""
        for commit in "${SECURITY_FIXES[@]}"; do
            format_user_facing_line "$commit"
        done
        echo ""
    fi

    # Bug Fixes
    if [ ${#FIXES[@]} -gt 0 ]; then
        echo "### 🐛 Bug Fixes"
        echo ""
        for commit in "${FIXES[@]}"; do
            format_user_facing_line "$commit"
        done
        echo ""
    fi

    # Breaking Changes (important for users!)
    if [ ${#BREAKING_CHANGES[@]} -gt 0 ]; then
        echo "### ⚠️ Breaking Changes"
        echo ""
        for commit in "${BREAKING_CHANGES[@]}"; do
            format_user_facing_line "$commit"
        done
        echo ""
    fi

    # Deprecations
    if [ ${#DEPRECATIONS[@]} -gt 0 ]; then
        echo "### 📦 Deprecated"
        echo ""
        for commit in "${DEPRECATIONS[@]}"; do
            format_user_facing_line "$commit"
        done
        echo ""
    fi

    # Note: We intentionally skip OTHER_CHANGES (chore, ci, docs, etc.)
    # as they are not relevant to end users

    cat << EOF
---

_This release was automatically generated from ${#ALL_COMMITS[@]} commits._
EOF
}

# === PACKAGE.JSON UPDATES ===

update_package_files() {
    local version="$1"

    log_info "Updating package.json files..."
    echo ""

    # Find all package.json files
    local package_files=$(find "$PROJECT_ROOT" -name "package.json" \
        -not -path "*/node_modules/*" \
        -not -path "*/.next/*" \
        -not -path "*/dist/*" \
        -not -path "*/.turbo/*" \
        -not -path "*/build/*")

    while IFS= read -r pkg; do
        if [ -n "$pkg" ]; then
            # Create backup BEFORE modifying
            create_backup "$pkg"

            # Track for rollback
            MODIFIED_FILES+=("$pkg")

            # Update version using Node.js for proper JSON handling
            node -e "
                const fs = require('fs');
                const path = '$pkg';
                const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
                data.version = '$version';
                fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
            " || {
                log_error "Failed to update $pkg"
                exit 1
            }

            # Show relative path
            local rel_path="${pkg#$PROJECT_ROOT/}"
            echo "  ✓ $rel_path"
        fi
    done <<< "$package_files"

    echo ""
}

# === CHANGELOG UPDATE ===

update_changelog() {
    local version="$1"
    local date="$2"

    log_info "Updating CHANGELOG.md..."

    local changelog_file="$PROJECT_ROOT/CHANGELOG.md"

    # Create backup BEFORE modifying
    create_backup "$changelog_file"

    # Track for rollback
    MODIFIED_FILES+=("$changelog_file")

    # Generate new entry to temp file (avoid pipe issues with large content)
    local temp_entry=$(mktemp)
    generate_changelog_entry "$version" "$date" > "$temp_entry"

    # Read existing changelog
    if [ -f "$changelog_file" ]; then
        local temp_output=$(mktemp)

        # Insert new entry after [Unreleased] section
        if grep -q "## \[Unreleased\]" "$changelog_file"; then
            # Find the line number of [Unreleased]
            local unreleased_line=$(grep -n "## \[Unreleased\]" "$changelog_file" | head -1 | cut -d: -f1)

            # Use sed to insert new entry after [Unreleased] line
            # This avoids piping large content through echo
            head -n "$unreleased_line" "$changelog_file" > "$temp_output"
            echo "" >> "$temp_output"
            cat "$temp_entry" >> "$temp_output"
            tail -n +"$((unreleased_line + 1))" "$changelog_file" >> "$temp_output"
        else
            # No [Unreleased] section, insert at the beginning after header (line 6)
            head -n 6 "$changelog_file" > "$temp_output"
            echo "" >> "$temp_output"
            cat "$temp_entry" >> "$temp_output"
            tail -n +7 "$changelog_file" >> "$temp_output"
        fi

        mv "$temp_output" "$changelog_file"
        rm -f "$temp_entry"
    else
        # Create new CHANGELOG.md
        cat > "$changelog_file" << EOF
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

EOF
        cat "$temp_entry" >> "$changelog_file"
        rm -f "$temp_entry"
    fi

    log_success "CHANGELOG.md updated"
    echo ""
}

# === RELEASE NOTES UPDATE ===

update_release_notes() {
    local version="$1"
    local date="$2"

    log_info "Generating RELEASE_NOTES.md..."

    local release_notes_file="$PROJECT_ROOT/RELEASE_NOTES.md"

    # Create backup BEFORE modifying (if exists)
    if [ -f "$release_notes_file" ]; then
        create_backup "$release_notes_file"
    fi

    # Track for rollback
    MODIFIED_FILES+=("$release_notes_file")

    # Generate new entry to temp file (avoid pipe issues)
    local temp_entry=$(mktemp)
    generate_user_facing_notes_entry "$version" "$date" > "$temp_entry"

    # Read existing release notes and prepend new entry
    if [ -f "$release_notes_file" ]; then
        local temp_output=$(mktemp)

        # Check if file has header "# Release Notes"
        if grep -q "^# Release Notes" "$release_notes_file"; then
            # Find the first ## section (first release) to insert before it
            local first_release_line=$(grep -n "^## v" "$release_notes_file" | head -1 | cut -d: -f1)

            if [ -n "$first_release_line" ] && [ "$first_release_line" -gt 0 ]; then
                # Insert new entry before the first release
                head -n "$((first_release_line - 1))" "$release_notes_file" > "$temp_output"
                cat "$temp_entry" >> "$temp_output"
                echo "" >> "$temp_output"
                tail -n +"$first_release_line" "$release_notes_file" >> "$temp_output"
            else
                # No releases yet, append after header
                head -n 4 "$release_notes_file" > "$temp_output"
                echo "" >> "$temp_output"
                cat "$temp_entry" >> "$temp_output"
            fi
        else
            # Old format or missing header - recreate with new structure
            cat > "$temp_output" << EOF
# Release Notes

User-facing release notes for all versions.

EOF
            cat "$temp_entry" >> "$temp_output"
            echo "" >> "$temp_output"
            echo "---" >> "$temp_output"
            echo "" >> "$temp_output"
            echo "## Previous Releases" >> "$temp_output"
            echo "" >> "$temp_output"
            cat "$release_notes_file" >> "$temp_output"
        fi

        mv "$temp_output" "$release_notes_file"
        rm -f "$temp_entry"
    else
        # Create new RELEASE_NOTES.md with header
        cat > "$release_notes_file" << EOF
# Release Notes

User-facing release notes for all versions.

EOF
        cat "$temp_entry" >> "$release_notes_file"
        rm -f "$temp_entry"
    fi

    log_success "RELEASE_NOTES.md updated"
    echo ""
}

# === PREVIEW ===

show_preview() {
    cat << EOF
═══════════════════════════════════════════════════════════
                    RELEASE PREVIEW
═══════════════════════════════════════════════════════════

📌 Version: $CURRENT_VERSION → $NEW_VERSION (${BUMP_TYPE^^})
   Reason: $AUTO_DETECT_REASON

📊 Commits included: ${#ALL_COMMITS[@]}
EOF

    [ ${#BREAKING_CHANGES[@]} -gt 0 ] && echo "   🔥 ${#BREAKING_CHANGES[@]} breaking changes"
    [ ${#SECURITY_FIXES[@]} -gt 0 ] && echo "   🔒 ${#SECURITY_FIXES[@]} security fixes"
    [ ${#FEATURES[@]} -gt 0 ] && echo "   ✨ ${#FEATURES[@]} features"
    [ ${#FIXES[@]} -gt 0 ] && echo "   🐛 ${#FIXES[@]} bug fixes"
    [ ${#DEPRECATIONS[@]} -gt 0 ] && echo "   ⚠️  ${#DEPRECATIONS[@]} deprecations"
    [ ${#REMOVALS[@]} -gt 0 ] && echo "   🗑️  ${#REMOVALS[@]} removals"
    [ ${#REFACTORS[@]} -gt 0 ] && echo "   ♻️  ${#REFACTORS[@]} refactors"
    [ ${#PERF[@]} -gt 0 ] && echo "   ⚡ ${#PERF[@]} performance improvements"
    [ ${#OTHER_CHANGES[@]} -gt 0 ] && echo "   📝 ${#OTHER_CHANGES[@]} other changes"

    cat << EOF

📦 Package Updates:
EOF

    find "$PROJECT_ROOT" -name "package.json" \
        -not -path "*/node_modules/*" \
        -not -path "*/.next/*" \
        -not -path "*/dist/*" \
        -not -path "*/.turbo/*" \
        -not -path "*/build/*" | while read -r pkg; do
        local rel_path="${pkg#$PROJECT_ROOT/}"
        echo "  ✓ $rel_path"
    done

    cat << EOF

📄 CHANGELOG.md Entry (Technical):
───────────────────────────────────────────────────────────
$(generate_changelog_entry "$NEW_VERSION" "$DATE")───────────────────────────────────────────────────────────

📣 RELEASE_NOTES.md (User-Facing):
───────────────────────────────────────────────────────────
$(generate_user_facing_notes_entry "$NEW_VERSION" "$DATE")───────────────────────────────────────────────────────────

💬 Git Commit Message:
───────────────────────────────────────────────────────────
chore(release): v$NEW_VERSION

Release version $NEW_VERSION with ${#FEATURES[@]} features and ${#FIXES[@]} fixes

Includes commits from ${LAST_TAG:-start} to HEAD

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
───────────────────────────────────────────────────────────

🏷️  Git Tag: v$NEW_VERSION
🌿 Branch: $BRANCH

═══════════════════════════════════════════════════════════
EOF
}

# === USER CONFIRMATION ===

get_user_confirmation() {
    local auto_confirm="$1"

    echo ""

    # Skip confirmation if --yes flag provided
    if [ "$auto_confirm" = "true" ]; then
        log_info "Auto-confirming release (--yes flag provided)"
        echo ""
        return 0
    fi

    read -p "Proceed with release? [Y/n]: " confirm

    if [[ ! "$confirm" =~ ^[Yy]?$ ]]; then
        log_warning "Release cancelled by user"
        exit 0
    fi

    echo ""
}

# === EXECUTE RELEASE ===

execute_release() {
    log_info "Executing release..."
    echo ""

    # Sync Beads before release (if bd is available)
    if command -v bd &> /dev/null; then
        log_info "Syncing Beads..."
        bd sync 2>/dev/null || true
        log_success "Beads synced"
    fi

    # Clean up backup files BEFORE staging
    cleanup_backups

    # Stage all changes
    log_info "Staging changes..."
    git add -A

    # Create commit
    log_info "Creating release commit..."
    git commit -m "chore(release): v$NEW_VERSION

Release version $NEW_VERSION with ${#FEATURES[@]} features and ${#FIXES[@]} fixes

Includes commits from ${LAST_TAG:-start} to HEAD

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>" || {
        log_error "Failed to create commit"
        exit 1
    }
    CREATED_COMMIT="true"
    log_success "Commit created"

    # Create tag (check if exists first)
    log_info "Creating git tag..."

    # Check if tag already exists
    if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
        log_error "Tag v$NEW_VERSION already exists!"
        echo ""
        log_info "Existing tags:"
        git tag --sort=-version:refname | safe_head 10
        echo ""
        log_info "Suggested actions:"
        echo "  1. Delete existing tag: git tag -d v$NEW_VERSION && git push origin :refs/tags/v$NEW_VERSION"
        echo "  2. Use different version: ./release.sh [patch|minor|major]"
        exit 1
    fi

    local tag_message="Release v$NEW_VERSION

$(generate_changelog_entry "$NEW_VERSION" "$DATE")"

    git tag -a "v$NEW_VERSION" -m "$tag_message" || {
        log_error "Failed to create tag"
        exit 1
    }
    CREATED_TAG="v$NEW_VERSION"
    log_success "Tag v$NEW_VERSION created"

    # Push to remote
    log_info "Pushing to remote..."
    git push origin "$BRANCH" --follow-tags || {
        log_error "Failed to push to remote"
        echo ""
        log_warning "Your changes are committed locally but push failed."
        echo ""
        echo "To retry push:"
        echo "  git push origin $BRANCH --follow-tags"
        echo ""
        echo "To rollback:"
        echo "  git reset --hard HEAD~1"
        echo "  git tag -d v$NEW_VERSION"
        echo ""
        exit 1
    }
    log_success "Pushed to origin/$BRANCH"

    echo ""
}

# === MAIN ===

main() {
    cd "$PROJECT_ROOT"

    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                    Release Automation                     ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""

    # Parse arguments
    local bump_arg=""
    local auto_confirm="false"
    local custom_commit_msg=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --yes|-y)
                auto_confirm="true"
                shift
                ;;
            --message|-m)
                if [[ -n "${2:-}" && ! "$2" =~ ^- ]]; then
                    custom_commit_msg="$2"
                    shift 2
                else
                    log_error "--message requires an argument"
                    echo "Usage: $0 [patch|minor|major] [--yes] [--message \"commit message\"]"
                    exit 1
                fi
                ;;
            patch|minor|major)
                bump_arg="$1"
                shift
                ;;
            *)
                log_error "Unknown argument: $1"
                echo "Usage: $0 [patch|minor|major] [--yes] [--message \"commit message\"]"
                exit 1
                ;;
        esac
    done

    # Export custom_commit_msg for use in run_preflight_checks
    CUSTOM_COMMIT_MSG="$custom_commit_msg"

    # Run workflow
    run_preflight_checks
    parse_commits
    detect_version_bump "$bump_arg"
    calculate_new_version

    # Show preview
    show_preview
    get_user_confirmation "$auto_confirm"

    # Execute release
    update_package_files "$NEW_VERSION"
    update_changelog "$NEW_VERSION" "$DATE"
    update_release_notes "$NEW_VERSION" "$DATE"
    execute_release

    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║              RELEASE SUCCESSFUL! 🎉                       ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    log_success "Released v$NEW_VERSION"
    log_success "Tag: v$NEW_VERSION"
    log_success "Branch: $BRANCH"
    echo ""
    log_info "Generated files:"
    echo "  • CHANGELOG.md (technical, for developers)"
    echo "  • RELEASE_NOTES.md (user-facing, for marketing)"
    echo ""
    log_info "Next steps:"
    echo "  • Verify release on GitHub: git remote -v"
    echo "  • Create GitHub Release from tag (optional)"
    echo "  • Copy RELEASE_NOTES.md content for announcements"
    echo "  • Notify team if applicable"
    echo ""
}

# Run main function
main "$@"
