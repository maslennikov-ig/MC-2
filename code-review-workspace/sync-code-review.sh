#!/bin/bash
# Sync code-review skill and code-reviewer agent across all projects
# Source: mc2 (the reference project)
#
# What it does:
# 1. Deletes old code-reviewer skill (Python stubs)
# 2. Deletes code-review-inline orchestrator
# 3. Copies new code-review skill
# 4. Updates code-reviewer agent (if exists)
# 5. Commits changes in each project

set -euo pipefail

SOURCE_DIR="/home/me/code/mc2"
SKILL_SRC="$SOURCE_DIR/.claude/skills/code-review/SKILL.md"
AGENT_SRC="$SOURCE_DIR/.claude/agents/development/workers/code-reviewer.md"

# All projects with code-reviewer agent (excluding mc2 itself)
PROJECTS=(
  "/home/me/code/Happiness-Bot"
  "/home/me/code/aidevteam"
  "/home/me/code/anonymazer"
  "/home/me/code/articles"
  "/home/me/code/bobabuh"
  "/home/me/code/claude-code-orchestrator-kit"
  "/home/me/code/coffee"
  "/home/me/code/geotermo"
  "/home/me/code/gseg"
  "/home/me/code/happiness"
  "/home/me/code/helixa"
  "/home/me/code/jarvis"
  "/home/me/code/mc2-video"
  "/home/me/code/megacampus2-archive"
  "/home/me/code/moneco"
  "/home/me/code/psk-dom"
  "/home/me/code/rechka/rechka-frontend"
  "/home/me/code/repa-maks"
  "/home/me/code/symancy2"
  "/home/me/code/sz"
  "/home/me/code/treejar"
)

COMMIT_MSG="refactor(skills): replace old code-review tools with new skill

- Remove code-reviewer skill (empty Python stubs)
- Remove code-review-inline orchestrator (replaced by skill)
- Add code-review skill (structured review methodology)
- Update code-reviewer agent to use new skill as source of truth

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

echo "=== Code Review Sync ==="
echo "Source: $SOURCE_DIR"
echo "Projects: ${#PROJECTS[@]}"
echo ""

UPDATED=0
SKIPPED=0
ERRORS=0
UPTODATE=0

for PROJECT in "${PROJECTS[@]}"; do
  PROJECT_NAME=$(basename "$PROJECT")

  # Check if project exists and is a git repo
  if [ ! -d "$PROJECT/.git" ] && [ ! -d "$PROJECT/../.git" ]; then
    echo "SKIP  $PROJECT_NAME (not a git repo)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo -n "SYNC  $PROJECT_NAME ... "

  CHANGED=false

  # 1. Delete old code-reviewer skill
  if [ -d "$PROJECT/.claude/skills/code-reviewer" ]; then
    rm -rf "$PROJECT/.claude/skills/code-reviewer"
    CHANGED=true
  fi

  # 2. Delete code-review-inline orchestrator
  if [ -d "$PROJECT/.claude/skills/code-review-inline" ]; then
    rm -rf "$PROJECT/.claude/skills/code-review-inline"
    CHANGED=true
  fi

  # 3. Copy new code-review skill
  mkdir -p "$PROJECT/.claude/skills/code-review"
  if [ ! -f "$PROJECT/.claude/skills/code-review/SKILL.md" ] || \
     ! diff -q "$SKILL_SRC" "$PROJECT/.claude/skills/code-review/SKILL.md" > /dev/null 2>&1; then
    cp "$SKILL_SRC" "$PROJECT/.claude/skills/code-review/SKILL.md"
    CHANGED=true
  fi

  # 4. Update code-reviewer agent (only if it already exists)
  if [ -f "$PROJECT/.claude/agents/development/workers/code-reviewer.md" ]; then
    if ! diff -q "$AGENT_SRC" "$PROJECT/.claude/agents/development/workers/code-reviewer.md" > /dev/null 2>&1; then
      cp "$AGENT_SRC" "$PROJECT/.claude/agents/development/workers/code-reviewer.md"
      CHANGED=true
    fi
  fi

  # 5. Commit if changed
  if [ "$CHANGED" = true ]; then
    cd "$PROJECT"
    # Find the git root (for nested projects like rechka/rechka-frontend)
    GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
    cd "$GIT_ROOT"

    git add -A ".claude/skills/code-reviewer" ".claude/skills/code-review-inline" \
               ".claude/skills/code-review" ".claude/agents/development/workers/code-reviewer.md" \
               2>/dev/null || true

    # Check if there's anything to commit
    if git diff --cached --quiet 2>/dev/null; then
      echo "already up to date"
    else
      if git commit -m "$COMMIT_MSG" --no-verify 2>/dev/null; then
        echo "OK (committed)"
        UPDATED=$((UPDATED + 1))
      else
        echo "ERROR (commit failed)"
        ERRORS=$((ERRORS + 1))
      fi
    fi
    cd "$SOURCE_DIR"
  else
    echo "already up to date"
  fi
done

echo ""
echo "=== Summary ==="
echo "Updated: $UPDATED"
echo "Skipped: $SKIPPED"
echo "Errors:  $ERRORS"
echo ""
echo "To push all changes:"
echo "  for d in ${PROJECTS[*]}; do (cd \"\$d\" && git push 2>/dev/null); done"
