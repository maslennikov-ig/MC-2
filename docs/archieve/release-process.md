# Release Process

This document describes the **fully automated** release process for MegaCampusAI monorepo using the `/push` command.

## Overview

The `/push` command is **fully automated** - minimal manual input required!

**What it does automatically:**
- ✅ Analyzes all commits since last release
- ✅ Parses conventional commit messages
- ✅ Auto-detects version bump type (MAJOR/MINOR/PATCH)
- ✅ Generates CHANGELOG from git history
- ✅ Updates all package.json files in monorepo
- ✅ Creates release commit and tag
- ✅ Pushes to GitHub
- ✅ Automatic rollback on errors

**You just:**
1. Make commits using conventional commit format
2. Type `/push` (or `/push patch|minor|major` to override)
3. Review the preview
4. Confirm with `Y`

That's it! Everything else is derived from your git commit history.

## Quick Start

```bash
# Make commits using conventional commits format
git commit -m "feat: add user dashboard"
git commit -m "fix: resolve login bug"
git commit -m "feat(api): add analytics endpoint"

# Run the fully automated release command
/push

# Or override auto-detection:
/push minor    # Force MINOR version bump
/push patch    # Force PATCH version bump
/push major    # Force MAJOR version bump

# Review the generated changelog and version
# Confirm with Y
# Done! Version bumped, changelog generated, pushed to GitHub
```

## Implementation

The `/push` command runs `.claude/scripts/release.sh`, a comprehensive bash script that handles the entire release workflow.

### Script Location

- **Command**: `.claude/commands/push.md` (slash command definition)
- **Implementation**: `.claude/scripts/release.sh` (full automation script)

## Prerequisites

Before running `/push`, ensure:

1. **Valid Branch**: You're on a named branch (not detached HEAD)
   ```bash
   git branch --show-current
   ```

2. **Remote Configured**: Git remote is set up
   ```bash
   git remote -v
   ```

3. **Commits Made**: You have commits to release (since last tag)
   ```bash
   git log --oneline $(git describe --tags --abbrev=0)..HEAD
   ```

4. **Node.js Available**: Required for package.json manipulation
   ```bash
   node --version
   ```

5. **Conventional Commits** (recommended but not required):
   Use conventional commit format for automatic CHANGELOG generation
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve bug"
   ```

**Note:** The command works with ANY commits, but conventional commits give better changelogs!

## Conventional Commits Format

The `/push` command automatically parses your commit messages to generate the CHANGELOG and determine version bumps.

### Commit Types

| Type | Version Bump | CHANGELOG Section | Example |
|------|--------------|-------------------|---------|
| `feat:` | MINOR | Added | `feat: add user dashboard` |
| `fix:` | PATCH | Fixed | `fix: resolve login bug` |
| `feat!:` or `BREAKING CHANGE:` | MAJOR | Changed (breaking) | `feat!: redesign API` |
| `refactor:` | - | Changed | `refactor: simplify auth logic` |
| `perf:` | - | Changed | `perf: optimize query speed` |
| `docs:` | - | Not included | `docs: update README` |
| `chore:` | - | Not included | `chore: update dependencies` |
| `style:` | - | Not included | `style: format code` |
| `test:` | - | Not included | `test: add unit tests` |

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Examples

**New Feature (MINOR bump):**
```bash
git commit -m "feat: add user dashboard"
git commit -m "feat(api): add analytics endpoint"
```

**Bug Fix (PATCH bump):**
```bash
git commit -m "fix: resolve authentication timeout"
git commit -m "fix(auth): handle expired tokens"
```

**Breaking Change (MAJOR bump):**
```bash
git commit -m "feat!: redesign API structure"

# Or with footer:
git commit -m "feat: add new auth system

BREAKING CHANGE: API endpoints have been renamed"
```

**With Scope:**
```bash
git commit -m "feat(qdrant): add vector search"
git commit -m "fix(auth): session timeout issue"
```

### Auto-Detection Rules

Version bump is determined automatically:

1. **MAJOR (X.0.0)**: Any breaking change
   - Commits with `!` after type: `feat!:`, `fix!:`
   - Commits with `BREAKING CHANGE:` in footer

2. **MINOR (0.X.0)**: Any new features (no breaking)
   - Commits starting with `feat:`

3. **PATCH (0.0.X)**: Bug fixes only (no features or breaking)
   - Commits starting with `fix:`

4. **PATCH (default)**: If no conventional commits found

**You can override:** `/push patch`, `/push minor`, `/push major`

## Fully Automated Workflow

### Step 1: Pre-flight Checks

The script automatically verifies:
- ✓ Not in detached HEAD state
- ✓ Git remote configured
- ✓ Node.js available
- ✓ Current version readable from package.json
- ✓ Previous git tag found (if exists)
- ✓ Commits exist since last release

Example output:
```
🔍 Running pre-flight checks...

✅ On branch: 001-stage-0-foundation
✅ Remote configured
✅ Node.js available
✅ Current version: 0.1.0
✅ Last tag: v0.1.0
✅ Found 12 commits since last release
```

If any check fails, the script exits with a clear error message.

### Step 2: Commit Analysis

The script parses all commits since the last tag:

```
ℹ️  Analyzing commits since v0.1.0...

ℹ️  Commit summary:
  ✨ 5 features
  🐛 3 bug fixes
  ♻️  2 refactors
  📝 2 other changes
```

Each commit is categorized based on its conventional commit type.

### Step 3: Auto-Detect Version Bump

Based on commits, the version bump is **automatically determined**:

```
✅ Auto-detected version bump: minor (Found 5 new feature(s))
```

**Auto-detection logic:**
- Has breaking changes? → **MAJOR**
- Has new features? → **MINOR**
- Has bug fixes only? → **PATCH**
- No conventional commits? → **PATCH** (default)

Override with: `/push patch`, `/push minor`, or `/push major`

### Step 4: Auto-Generate CHANGELOG

The changelog is **automatically generated** from commit messages:

```markdown
## [0.2.0] - 2025-10-15

### Added
- **embeddings**: Hierarchical chunking strategy (abc123)
- **qdrant**: Vector search with BM25 hybrid (def456)
- New /push command for releases (ghi789)

### Fixed
- **auth**: Authentication timeout on session expiry (jkl012)
- Memory leak in file processor (mno345)

### Changed
- **api**: Refactored tRPC router structure (pqr678)
```

**Grouping logic:**
- `feat:` → **Added**
- `fix:` → **Fixed**
- `refactor:`, `perf:` → **Changed**
- `feat!:` or `BREAKING CHANGE:` → **Changed** (with ⚠️ BREAKING prefix)
- Scope extracted from `type(scope):` format

### Step 5: Preview and Confirm

The script shows a comprehensive preview of **everything it will do**:

```
═══════════════════════════════════════════════════════════
                    RELEASE PREVIEW
═══════════════════════════════════════════════════════════

📌 Version: 0.1.0 → 0.2.0 (MINOR)
   Reason: Found 5 new feature(s)

📊 Commits included: 12
   ✨ 5 features
   🐛 3 bug fixes
   ♻️  2 refactors
   📝 2 other changes

📦 Package Updates:
  ✓ package.json
  ✓ packages/course-gen-platform/package.json
  ✓ packages/shared-types/package.json
  ✓ packages/trpc-client-sdk/package.json

📄 CHANGELOG.md Entry:
───────────────────────────────────────────────────────────
## [0.2.0] - 2025-10-15

### Added
- **embeddings**: Hierarchical chunking strategy (abc123)
- **qdrant**: Vector search with BM25 hybrid (def456)
...
───────────────────────────────────────────────────────────

💬 Git Commit Message:
───────────────────────────────────────────────────────────
chore(release): v0.2.0

Release version 0.2.0 with 5 features and 3 fixes

Includes commits from v0.1.0 to HEAD

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
───────────────────────────────────────────────────────────

🏷️  Git Tag: v0.2.0
🌿 Branch: 001-stage-0-foundation

═══════════════════════════════════════════════════════════

Proceed with release? [Y/n]: _
```

**Your only input:** Type `Y` or press Enter to confirm!

### Step 6: Automatic Execution

If confirmed, the script executes:

```
ℹ️  Executing release...

ℹ️  Updating package.json files...
  ✓ package.json
  ✓ packages/course-gen-platform/package.json
  ✓ packages/shared-types/package.json
  ✓ packages/trpc-client-sdk/package.json

ℹ️  Updating CHANGELOG.md...
✅ CHANGELOG.md updated

ℹ️  Staging changes...
ℹ️  Creating release commit...
✅ Commit created

ℹ️  Creating git tag...
✅ Tag v0.2.0 created

ℹ️  Pushing to remote...
✅ Pushed to origin/001-stage-0-foundation

╔═══════════════════════════════════════════════════════════╗
║              RELEASE SUCCESSFUL! 🎉                       ║
╚═══════════════════════════════════════════════════════════╝

✅ Released v0.2.0
✅ Tag: v0.2.0
✅ Branch: 001-stage-0-foundation

ℹ️  Next steps:
  • Verify release on GitHub
  • Create GitHub Release from tag (optional)
  • Notify team if applicable
```

### Step 7: Automatic Rollback (on errors)

If ANY step fails, the script **automatically rolls back**:

```
❌ Error occurred during release process

⚠️  Rolling back changes...
✅ Deleted tag v0.2.0
✅ Rolled back commit
✅ Restored modified files

ℹ️  Rollback complete. Repository state restored.
```

Your repository is **always** left in a clean state!

## Monorepo Version Strategy

**All packages share the same version number.**

This means:
- `package.json` (root)
- `packages/course-gen-platform/package.json`
- `packages/shared-types/package.json`
- `packages/trpc-client-sdk/package.json`

All get updated to the same version simultaneously.

**Why synchronized versioning?**
- ✅ Simplified release management
- ✅ Clear project timeline
- ✅ Easier dependency tracking
- ✅ Suitable for tightly coupled packages
- ✅ No version compatibility matrix needed

**Workspace dependencies:**
- Dependencies using `workspace:*` protocol are **not modified**
- They continue to reference workspace packages correctly
- This is the recommended pnpm workspace pattern

## Changelog Format

Following [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2025-10-15

### Added
- New feature 1
- New feature 2

### Changed
- Changed item 1

### Fixed
- Bug fix 1

## [0.1.0] - 2025-10-01
...
```

**Key principles:**
- Newest versions first
- ISO 8601 date format (YYYY-MM-DD)
- Clear categorization (Added, Changed, Fixed)
- Human-readable descriptions
- [Unreleased] section for upcoming changes
- Commit hashes included in parentheses

## Commit Format

Following [Conventional Commits](https://www.conventionalcommits.org/):

```
chore(release): v0.2.0

Release version 0.2.0 with 5 features and 3 fixes

Includes commits from v0.1.0 to HEAD

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Format breakdown:**
- `chore(release):` - Type and scope
- `v0.2.0` - Version number
- Body explains what changed
- Co-authored attribution

## Git Tags

Annotated tags are created with format `v{version}`:

```bash
v0.1.0
v0.2.0
v1.0.0
```

Tag message includes the changelog entry for that version.

**View tags:**
```bash
git tag -l
git show v0.2.0
```

**Tags are pushed automatically** with `--follow-tags` flag.

## Error Handling

The script handles all error scenarios gracefully:

### No Commits Since Last Release

```
❌ No commits since last release (v0.1.0)
Nothing to release!
```

**Recovery:** Make some commits first!

### Detached HEAD

```
❌ You are in detached HEAD state
Checkout a branch first:
  git checkout main
```

**Recovery:**
```bash
git checkout 001-stage-0-foundation  # or your branch
/push
```

### No Remote Configured

```
❌ No remote 'origin' configured
```

**Recovery:**
```bash
git remote add origin <url>
```

### Push Failed

```
❌ Failed to push to remote

⚠️  Your changes are committed locally but push failed.

To retry push:
  git push origin <branch> --follow-tags

To rollback:
  git reset --hard HEAD~1
  git tag -d v0.2.0
```

**Recovery options:**

1. **Retry push** (if network/auth issue):
   ```bash
   git push origin 001-stage-0-foundation --follow-tags
   ```

2. **Pull and retry** (if remote diverged):
   ```bash
   git pull --rebase origin 001-stage-0-foundation
   git push origin 001-stage-0-foundation --follow-tags
   ```

3. **Rollback** (if you want to undo):
   ```bash
   git reset --hard HEAD~1
   git tag -d v0.2.0
   ```

### Automatic Rollback

If **any** error occurs during execution, the script automatically:
1. Deletes created tag (if created)
2. Reverts commit (if created)
3. Restores modified files (if modified)

Your repository is **always** left in a clean state!

## Usage Examples

### Example 1: Auto-Detect (Recommended)

```bash
# Make conventional commits
git commit -m "feat: add dashboard"
git commit -m "fix: resolve timeout"

# Run release with auto-detection
/push

# Review preview showing MINOR bump (has feat)
# Confirm with Y
# Done!
```

### Example 2: Manual Override

```bash
# Made several bug fixes
git commit -m "fix: bug 1"
git commit -m "fix: bug 2"

# Force PATCH bump explicitly
/push patch

# Confirm
# Done!
```

### Example 3: Breaking Change

```bash
# Made breaking change
git commit -m "feat!: redesign API

BREAKING CHANGE: All endpoints now use /api/v2 prefix"

# Run release (will auto-detect MAJOR)
/push

# Preview shows MAJOR bump (1.0.0)
# Confirm
# Done!
```

### Example 4: First Release

```bash
# First release ever (no previous tags)
git commit -m "feat: initial implementation"

# Run release
/push

# Will bump from current package.json version
# Creates first tag
# Done!
```

## Best Practices

### Before Release

1. **Test your changes**
   ```bash
   pnpm test
   pnpm type-check
   pnpm build
   ```

2. **Use conventional commits**
   ```bash
   # Good
   git commit -m "feat: add search feature"
   git commit -m "fix(auth): handle expired tokens"

   # Avoid (but still works)
   git commit -m "added stuff"
   git commit -m "bug fix"
   ```

3. **Verify branch is up-to-date**
   ```bash
   git pull --rebase origin <branch>
   ```

### During Release

1. **Review the preview carefully**
   - Check version bump is correct
   - Verify changelog entries make sense
   - Confirm all package.json files are listed

2. **Let auto-detection work**
   - Only override if you have a specific reason
   - Auto-detection is usually correct

### After Release

1. **Verify on GitHub**
   - Check commit appears in history
   - Check tag is present
   - Verify version in package.json

2. **Create GitHub Release** (optional)
   - Go to GitHub → Releases
   - Create release from tag
   - Copy changelog entries as description

3. **Notify team** (if applicable)
   - Slack/Discord notification
   - Update documentation
   - Close related issues

## Troubleshooting

### "bash: .claude/scripts/release.sh: No such file or directory"

Script file is missing. Verify:
```bash
ls -la .claude/scripts/release.sh
```

If missing, restore from git or recreate.

### "Permission denied"

Script not executable:
```bash
chmod +x .claude/scripts/release.sh
```

### "Failed to push: Permission denied (publickey)"

SSH key not configured:
```bash
# Check SSH key
ssh -T git@github.com

# Or switch to HTTPS
git remote set-url origin https://github.com/user/repo.git
```

### "Updates were rejected"

Remote branch has diverged:
```bash
# Pull latest changes
git pull --rebase origin <branch>

# Retry (push is automatic in script)
# Or manually:
git push origin <branch> --follow-tags
```

### "Tag already exists"

Tag was created previously:
```bash
# Delete local tag
git tag -d v0.2.0

# Delete remote tag (if pushed)
git push origin :refs/tags/v0.2.0

# Run /push again
```

## Advanced Usage

### Custom CHANGELOG Editing

After release, you can edit CHANGELOG.md to add more context:

```bash
# Release completed
# Edit CHANGELOG.md to add more details
vim CHANGELOG.md

# Amend the release commit
git add CHANGELOG.md
git commit --amend --no-edit

# Force push (⚠️ only if not yet merged to main)
git push origin <branch> --force --follow-tags
```

### Skipping Specific Commits in CHANGELOG

Use commit types that are ignored:
```bash
git commit -m "chore: update dependencies"  # Not in CHANGELOG
git commit -m "docs: fix typo"              # Not in CHANGELOG
git commit -m "test: add unit tests"        # Not in CHANGELOG
```

## Technical Details

### Script Architecture

The release script (`.claude/scripts/release.sh`) consists of:

1. **Configuration** (lines 1-30): Constants, colors, state tracking
2. **Utility functions** (lines 32-50): Logging, error handling
3. **Cleanup/Rollback** (lines 52-90): Automatic rollback on errors
4. **Pre-flight checks** (lines 92-140): Validation before execution
5. **Commit parsing** (lines 142-180): Conventional commit analysis
6. **Version detection** (lines 182-220): Auto-detect or manual
7. **CHANGELOG generation** (lines 222-280): Format changelog entries
8. **Package updates** (lines 282-320): Update all package.json files
9. **Execution** (lines 322-400): Create commit, tag, push
10. **Main workflow** (lines 402-450): Orchestrate all steps

### Dependencies

- **bash**: Shell interpreter (built-in on Linux/macOS)
- **git**: Version control (required)
- **node**: JavaScript runtime (for JSON manipulation)
- **find**: File search utility (built-in)

No external dependencies or npm packages required!

### File Modifications

The script modifies:
- All `package.json` files (version field only)
- `CHANGELOG.md` (prepends new entry)

All modifications are tracked for rollback if needed.

## References

- **Semantic Versioning**: https://semver.org/spec/v2.0.0.html
- **Keep a Changelog**: https://keepachangelog.com/en/1.1.0/
- **Conventional Commits**: https://www.conventionalcommits.org/

## Support

If you encounter issues not covered here:

1. Check the error message carefully
2. Review this documentation
3. Check git status: `git status`
4. Check git log: `git log --oneline -5`
5. Verify script exists: `ls -la .claude/scripts/release.sh`
6. Check script is executable: `bash .claude/scripts/release.sh --help`

The script is designed to be safe and always rollback on errors!
