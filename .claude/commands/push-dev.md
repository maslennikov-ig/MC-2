---
description: Promote current branch into develop and push develop
argument-hint: [--yes|-y]
---

Promote the current working branch into `develop` and push `develop` to Dev. This is **not** the release/version command.

- For **Dev delivery**: use this command
- For **Staging deploy**: use `/deploy`
- For **Release** (version bump + changelog): use `/push`

After a successful delivery the source branch is **deleted**, locally and on `origin`, and you
are left on `develop`. Its commits are in `develop`; the branch name is not history. Nothing is
deleted unless `git merge-base --is-ancestor` confirms `develop` contains the branch, and
`archive/*`, `backup/*` and anything in `.codex/stranded-commit-allowlist.txt` are never touched.

**Usage:**

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
cd "$PROJECT_ROOT" && bash .claude/scripts/push-dev.sh $ARGUMENTS
```
