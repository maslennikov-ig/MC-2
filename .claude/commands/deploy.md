---
description: Deploy to staging (ai.megacampus.ru) via Blue/Green
argument-hint: [--force] [--yes]
---

Merge **current branch** into master and push to trigger Blue/Green deployment.

**What happens:**

1. Merges your branch → master
2. CI/CD builds required images, including the deploy-relevant Qdrant operator
3. Server deploys to inactive color (Blue/Green switch)
4. Health check → nginx switches traffic
5. Existing bootstrapped deployments use Blue/Green switching; rollback is
   release-bound and recreates API/web/main/Stage 6 coherently

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

**Q12 boundary:** the owner authorized staging activation, but `/deploy` is not
the first-bootstrap command. Current project-CA, off-host-S3, and authoritative
source-path NO-GO inputs must be resolved first. Initial activation must publish
and pre-pull the exact operator digest, apply the guarded five-migration chain,
start Qdrant/monitoring only, bootstrap before verify, complete gap-free reindex,
and prove snapshot/restore/rollback. `--force` skips local quality checks only;
it cannot bypass these runtime gates.

**Flags:**

- `--force` / `-f`: Skip quality checks (type-check, build)
- `--yes` / `-y`: Skip confirmation prompt
- `--sync` / `-s`: Auto-sync develop with master after deploy

**Rollback:** If deploy fails, run on server:

```bash
ssh megacampus-prod \
  "bash /opt/megacampus/scripts/rollback_blue_green.sh production '<failed-40-character-release-commit>'"
```

Rollback requires the matching switched/accepted `deploy_state`, immutable
color images, and coherent main/Stage 6 worker recreation before nginx moves.
It is not a database, evidence, or Qdrant alias rollback.

**Usage:**

# Navigate to project root and run deploy script

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
cd "$PROJECT_ROOT" && bash .claude/scripts/deploy.sh $ARGUMENTS
