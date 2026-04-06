---
description: Promote current branch into develop and push develop
argument-hint: [--yes|-y]
---

Promote the current feature branch into `develop` and push `develop` to Dev. This is **not** the release/version command.

- For **Dev delivery**: use this command
- For **Staging deploy**: use `/deploy`
- For **Release** (version bump + changelog): use `/push`

**Usage:**

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
cd "$PROJECT_ROOT" && bash .claude/scripts/push-dev.sh $ARGUMENTS
```
