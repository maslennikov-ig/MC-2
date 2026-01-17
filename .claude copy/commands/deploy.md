---
description: Deploy to staging (ai.megacampus.ru) via Blue/Green
argument-hint: [--force] [--yes]
---

Merge **current branch** into master and push to trigger Blue/Green deployment.

**What happens:**

1. Merges your branch → master
2. CI/CD builds Docker images (web, api)
3. Server deploys to inactive color (Blue/Green switch)
4. Health check → nginx switches traffic
5. Zero downtime, instant rollback available

**Workflow:**

```
# Typical flow:
develop → /deploy → master → ai.megacampus.ru (Blue/Green)

# Direct from feature:
feature/x → /deploy → master → ai.megacampus.ru (Blue/Green)

# Dev auto-deploys on push (no /deploy needed):
develop → push → dev.ai.megacampus.ru (Rolling)
```

**Safety checks:**

- Ensures current branch has changes not in master
- Runs type-check and build before merging (skip with --force)
- Creates merge commit with deployment info
- Switches back to source branch after deploy

**Flags:**

- `--force` / `-f`: Skip quality checks (type-check, build)
- `--yes` / `-y`: Skip confirmation prompt
- `--sync` / `-s`: Auto-sync develop with master after deploy

**Rollback:** If deploy fails, run on server:

```bash
ssh megacampus-prod "bash /opt/megacampus/scripts/rollback_blue_green.sh"
```

**Usage:**

# Navigate to project root and run deploy script

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
cd "$PROJECT_ROOT" && bash .claude/scripts/deploy.sh $ARGUMENTS
