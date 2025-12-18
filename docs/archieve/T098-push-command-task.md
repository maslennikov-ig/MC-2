# T098: Create `/push` Slash Command for Automated Release Management

**Agent**: [DIRECT] with technical-writer for documentation
**Priority**: Medium
**Dependencies**: None
**Development time**: 2-3 hours

## Purpose

Create a slash command `/push` that automates the release workflow by:
1. Analyzing staged changes to determine version bump type (MAJOR, MINOR, PATCH)
2. Updating version in all package.json files following Semantic Versioning
3. Generating and updating CHANGELOG.md following Keep a Changelog format
4. Creating a properly formatted git commit
5. Creating a git tag with version number
6. Pushing changes and tags to GitHub

## References

- **Semantic Versioning**: https://semver.org/
- **Keep a Changelog**: https://keepachangelog.com/en/1.1.0/

## Success Criteria

- [ ] Command prompts user to select version bump type (MAJOR, MINOR, PATCH)
- [ ] Command shows preview of changes before executing
- [ ] All package.json files updated with new version
- [ ] CHANGELOG.md updated with new version section
- [ ] Git commit created with conventional commit message
- [ ] Git tag created with `v{version}` format
- [ ] Changes and tags pushed to GitHub
- [ ] Error handling for uncommitted changes
- [ ] Error handling for network failures
- [ ] Rollback capability if push fails

## Implementation Details

### 1. File Location

Create command file: `.claude/commands/push.md`

### 2. Command Workflow

#### Step 1: Pre-flight Checks
```bash
# Check for uncommitted changes (must have staged changes ready)
git status --porcelain

# Check current branch
git branch --show-current

# Check if remote is configured
git remote -v

# Get current version from root package.json
cat package.json | grep version
```

#### Step 2: Version Bump Selection

Present user with options:
```
Select version bump type:

Current version: 0.1.0

1. MAJOR (0.1.0 → 1.0.0) - Incompatible API changes
2. MINOR (0.1.0 → 0.2.0) - Backward-compatible new features
3. PATCH (0.1.0 → 0.1.1) - Backward-compatible bug fixes
4. Cancel

Your choice: _
```

#### Step 3: Changelog Entry

Prompt user to categorize changes:
```
Describe your changes for CHANGELOG.md:

Categories (separate multiple items with newlines):
[A]dded - New features
[C]hanged - Changes in existing functionality
[D]eprecated - Soon-to-be removed features
[R]emoved - Removed features
[F]ixed - Bug fixes
[S]ecurity - Security fixes

Enter category letter and description (e.g., "A: New /push command"):
> A: Automated release management command
> F: Fixed version sync across packages
> (press Enter twice when done)
```

#### Step 4: Preview Changes

Show summary:
```
=== RELEASE PREVIEW ===

Version: 0.1.0 → 0.2.0 (MINOR)

Package updates:
- package.json: 0.1.0 → 0.2.0
- packages/course-gen-platform/package.json: 0.1.0 → 0.2.0
- packages/shared-types/package.json: 0.1.0 → 0.2.0
- packages/trpc-client-sdk/package.json: 0.1.0 → 0.2.0

CHANGELOG.md:
## [0.2.0] - 2025-10-15

### Added
- Automated release management command

### Fixed
- Fixed version sync across packages

Git commit message:
"chore(release): v0.2.0 - Add automated release management"

Git tag: v0.2.0

Proceed with release? [Y/n]: _
```

#### Step 5: Execute Release

If user confirms:
1. Update all package.json files with new version
2. Update CHANGELOG.md with new entry
3. Stage all changes: `git add -A`
4. Create commit: `git commit -m "chore(release): v{version} - {summary}"`
5. Create tag: `git tag -a v{version} -m "Release v{version}"`
6. Push: `git push origin {branch} --follow-tags`

### 3. Version Update Logic

**Find all package.json files:**
```bash
find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/dist/*"
```

**Update version in each file:**
```typescript
// Read package.json
const pkg = JSON.parse(fs.readFileSync(path, 'utf-8'));

// Update version
pkg.version = newVersion;

// Write back with proper formatting (2 spaces)
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
```

### 4. CHANGELOG.md Update Logic

**Current format** (based on existing CHANGELOG.md):
```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [NEW_VERSION] - DATE

### Added
- New feature 1
- New feature 2

### Changed
- Changed item 1

### Fixed
- Bug fix 1

## [PREVIOUS_VERSION] - DATE
...
```

**Update strategy:**
1. Insert new version section after `## [Unreleased]`
2. Use ISO 8601 date format: `YYYY-MM-DD`
3. Only include categories that have entries
4. Preserve existing changelog history

### 5. Conventional Commit Format

Use format: `chore(release): v{version} - {summary}`

Examples:
- `chore(release): v0.2.0 - Add automated release management`
- `chore(release): v0.1.1 - Fix authentication bugs`
- `chore(release): v1.0.0 - Initial production release`

### 6. Git Tag Format

Use annotated tags: `git tag -a v{version} -m "Release v{version}"`

Examples:
- `v0.1.0` (current)
- `v0.2.0` (next minor)
- `v1.0.0` (next major)

### 7. Error Handling

**Scenario 1: No staged changes**
```
❌ Error: No staged changes found.

Please stage your changes first:
  git add <files>

Then run /push again.
```

**Scenario 2: Push fails**
```
❌ Error: Failed to push to remote.

Your changes have been committed locally:
- Commit: abc1234
- Tag: v0.2.0

To retry push manually:
  git push origin {branch} --follow-tags

To rollback:
  git reset --hard HEAD~1
  git tag -d v0.2.0
```

**Scenario 3: Not on a branch**
```
❌ Error: You are in detached HEAD state.

Please checkout a branch first:
  git checkout main

Then run /push again.
```

### 8. Monorepo Considerations

**Version sync strategy**: All packages share the same version (current behavior)

**Rationale**:
- Simplified release management
- Clear project timeline
- Easier dependency tracking
- Suitable for tightly coupled packages

**Alternative** (future consideration):
- Independent versioning per package
- Use tools like Lerna or Changesets
- More complex but allows selective updates

## Implementation Files

### Main Command File

**File**: `.claude/commands/push.md`

**Content structure**:
```markdown
---
description: Automated release management with version bumping and changelog updates
---

## Overview

This command automates the release workflow:
1. Analyzes changes
2. Bumps version following Semantic Versioning
3. Updates CHANGELOG.md following Keep a Changelog format
4. Creates git commit and tag
5. Pushes to GitHub

## Prerequisites

- Staged changes ready to commit
- On a valid git branch
- Git remote configured

## Steps

[Detailed step-by-step implementation]

## Error Handling

[Error scenarios and recovery steps]
```

### Helper Scripts (Optional)

Consider creating helper scripts in `.claude/scripts/`:
- `bump-version.sh` - Updates all package.json files
- `update-changelog.sh` - Updates CHANGELOG.md
- `create-release.sh` - Creates commit, tag, and pushes

## Testing Strategy

1. **Dry run test**: Preview without executing
2. **Patch release test**: 0.1.0 → 0.1.1
3. **Minor release test**: 0.1.0 → 0.2.0
4. **Major release test**: 0.1.0 → 1.0.0
5. **Error handling test**: Test all error scenarios
6. **Rollback test**: Verify rollback procedure

## Documentation

Update the following files:
- `README.md` - Add `/push` command to available commands list
- `.claude/commands/push.md` - Complete command documentation
- `docs/release-process.md` - Document release workflow (NEW FILE)

## Future Enhancements

### Phase 2 (Optional):
- [ ] Automatic CHANGELOG generation from git commits
- [ ] Interactive commit selection for changelog
- [ ] Release notes generation
- [ ] GitHub Release creation via API
- [ ] Slack/Discord notification on release
- [ ] Pre-release version support (alpha, beta, rc)
- [ ] Custom version format support
- [ ] Multi-package version strategy (independent versioning)
- [ ] Integration with CI/CD pipeline
- [ ] Changelog validation and linting

### Phase 3 (Advanced):
- [ ] Automated dependency updates
- [ ] Breaking change detection
- [ ] API compatibility checking
- [ ] Automatic migration guide generation
- [ ] Release scheduling and automation

## Example Usage Scenarios

### Scenario 1: Bug Fix Release
```
User runs: /push

System:
  Current version: 0.1.0
  Select bump: PATCH
  User selects: 3 (PATCH)

  Category: Fixed
  User enters: "F: Fixed authentication timeout issue"

  Preview: 0.1.0 → 0.1.1
  Confirm: Y

  Result: Released v0.1.1 with bug fix
```

### Scenario 2: Feature Release
```
User runs: /push

System:
  Current version: 0.1.1
  Select bump: MINOR
  User selects: 2 (MINOR)

  Category: Added
  User enters:
    "A: New /push command for releases"
    "A: Automated changelog generation"

  Preview: 0.1.1 → 0.2.0
  Confirm: Y

  Result: Released v0.2.0 with new features
```

### Scenario 3: Breaking Change
```
User runs: /push

System:
  Current version: 0.2.0
  Select bump: MAJOR
  User selects: 1 (MAJOR)

  Category: Changed
  User enters:
    "C: Renamed API endpoints for consistency"
    "R: Removed deprecated authentication method"

  Preview: 0.2.0 → 1.0.0
  Confirm: Y

  Result: Released v1.0.0 with breaking changes
```

## Acceptance Criteria

- [ ] Command file created at `.claude/commands/push.md`
- [ ] Pre-flight checks implemented
- [ ] Version bump selection works
- [ ] Changelog update works
- [ ] All package.json files updated
- [ ] Git commit created with conventional format
- [ ] Git tag created with v{version} format
- [ ] Push to GitHub successful
- [ ] Error handling implemented
- [ ] Rollback procedure documented
- [ ] Command tested with all version bump types
- [ ] Documentation updated

## Estimated Complexity

- **Time**: 2-3 hours
- **Complexity**: Medium
- **Risk**: Low (non-destructive with rollback capability)

## Notes

- This command assumes staged changes are ready to commit
- All packages share the same version (monorepo strategy)
- Follows Semantic Versioning 2.0.0 specification
- Follows Keep a Changelog 1.1.0 format
- Uses conventional commit format for releases
- Requires manual conflict resolution if push fails
