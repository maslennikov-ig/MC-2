---
description: Deploy to production by merging current branch into main
argument-hint: [--force] [--yes]
---

Merge **current branch** into main and push to trigger production deployment.

**Workflow:**
```
# On develop branch:
/push patch    → develop (no deploy)
/deploy        → develop → main (deploy!)

# On feature/auth branch:
/push patch    → feature/auth (no deploy)
/deploy        → feature/auth → main (deploy!)

# On main branch:
/push          → auto-switches to develop
/deploy        → merges develop → main
```

**Safety checks:**
- Ensures current branch has changes not in main
- Runs type-check and build before merging (skip with --force)
- Creates merge commit with deployment info
- Switches back to source branch after deploy

**Flags:**
- `--force` / `-f`: Skip quality checks (type-check, build)
- `--yes` / `-y`: Skip confirmation prompt
- `--sync` / `-s`: Auto-sync develop with main after deploy (recommended for feature branches)

**Usage:**

# Navigate to project root and run deploy script
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
cd "$PROJECT_ROOT" && bash .claude/scripts/deploy.sh $ARGUMENTS
