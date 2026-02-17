# Work with Tasks

Skill для работы с задачами: просмотр, выбор, выполнение с обязательным использованием Context7 для актуальной документации.

## Usage

Invoke via: `/work` or "покажи задачи" or "что делать"

Optional arguments:

- `/work` — показать готовые задачи (default: 20)
- `/work -n 50` — показать больше задач
- `/work -l frontend` — только frontend задачи
- `/work pick` — автовыбор задачи по приоритету
- `/work defer mc2-xxx +3m` — отложить задачу на 3 месяца
- `/work deferred` — показать отложенные задачи

---

## CRITICAL: Context7 MCP — MANDATORY

**Before implementing ANY task, query Context7 for up-to-date documentation on involved libraries.**

Skip only for trivial changes that don't touch library APIs (typos, comments, config values).

### How to use (2-step)

```
1. mcp__context7__resolve-library-id  — resolve library name to ID
2. mcp__context7__query-docs          — query docs by resolved ID + topic
```

When delegating to subagents — fetch docs first, include in delegation context.

---

## Step 1: Show Ready Tasks

Показать готовые задачи **без REF: документов**:

```bash
# Get arguments
LIMIT="${1:--n 20}"

# Show ready tasks, exclude REF: documents
bd ready $LIMIT 2>/dev/null | grep -v "\[chore\].*REF:" | head -30

# Count
echo ""
echo "---"
TOTAL=$(bd ready -n 100 2>/dev/null | grep -v "\[chore\].*REF:" | wc -l)
echo "Total ready: $TOTAL tasks (excluding REF: docs)"
```

If no tasks:

```markdown
No ready tasks found.

Options:

1. /process-issues — import from GitHub Issues
2. bd create 'Task title' -t task -p 2 — create manually
```

---

## Step 2: Task Selection Workflow

### Option A: User Selects Task

User says: "возьми mc2-xxx" or provides task ID

```bash
# Show task details
bd show mc2-xxx

# Claim task
bd update mc2-xxx --status in_progress
```

### Option B: Auto-Pick by Priority

User says: `/work pick` or "выбери задачу"

```bash
# Get highest priority task (P0 > P1 > P2 > P3 > P4)
TASK=$(bd ready -n 1 --sort priority 2>/dev/null | grep -v "\[chore\].*REF:" | head -1 | grep -oP 'mc2-[a-z0-9]+')

if [ -n "$TASK" ]; then
    echo "Selected: $TASK"
    bd show $TASK
    bd update $TASK --status in_progress
else
    echo "No tasks available"
fi
```

---

## Step 3: Working on Task

### Rules

1. **Read task description** before starting
2. **Query Context7** for documentation on involved libraries (MANDATORY)
3. **Gather context** — read related files, understand scope
4. **Delegate to subagent** if complex (see CLAUDE.md), include Context7 docs in delegation
5. **Verify changes** — type-check, build, tests
6. **Close task** when done

### Execution Pattern

```
1. bd show mc2-xxx                — read full description
2. Context7: resolve + query      — get docs for involved libraries (MANDATORY)
3. Gather context                 — read files, search codebase
4. Implement                      — delegate or execute directly
5. Verify                         — pnpm type-check && pnpm build
6. bd close mc2-xxx               — mark complete
7. git commit && git push         — commit changes
```

### Subagent Selection

| Domain           | Subagent                      | When                    |
| ---------------- | ----------------------------- | ----------------------- |
| DB/migrations    | `database-architect`          | Schema changes, RLS     |
| UI components    | `nextjs-ui-designer`          | New pages, components   |
| Backend services | `fullstack-nextjs-specialist` | APIs, workers           |
| Pipeline stages  | `stage-pipeline-specialist`   | Stages 1-7              |
| TypeScript types | `typescript-types-specialist` | Complex types, generics |

---

## Step 4: Closing Task

```bash
# Close with reason
bd close mc2-xxx --reason="Fixed: description of what was done"

# If task has GitHub reference, also close GitHub issue
# Check external-ref in task description
GITHUB_REF=$(bd show mc2-xxx 2>/dev/null | grep -oP 'external-ref.*gh-\K[0-9]+' | head -1)
if [[ -n "$GITHUB_REF" ]]; then
    gh issue close $GITHUB_REF --comment "Fixed in Beads task mc2-xxx"
fi
```

---

## Integration with /process-issues

When no local tasks → suggest importing from GitHub:

```
User: /work
Claude: No ready tasks.

Options:
1. /process-issues — Check GitHub for new issues
2. bd create "..." — Create task manually

User: /process-issues
Claude: [Processes GitHub issues, creates Beads tasks with external-ref]

User: /work
Claude: Found 3 ready tasks:
1. [P1] mc2-abc: Fix auth bug (gh-45)
2. [P2] mc2-def: Add feature X (gh-52)
...
```

---

## Task Sources

| Source                   | How to Create                                               | External Ref |
| ------------------------ | ----------------------------------------------------------- | ------------ |
| GitHub Issue             | `/process-issues`                                           | `gh-123`     |
| Manual                   | `bd create "Title" -t task`                                 | none         |
| Emergent (found at work) | `bd create "Found bug" -t bug --deps discovered-from:mc2-x` | none         |

---

## Defer Tasks (Откладывание)

Отложенные задачи скрыты из `bd ready` до указанной даты.

### Отложить задачу

```bash
# Отложить на время
bd update mc2-xxx --defer "+1w"    # на неделю
bd update mc2-xxx --defer "+2w"    # на 2 недели
bd update mc2-xxx --defer "+3m"    # на 3 месяца

# Отложить до даты
bd update mc2-xxx --defer "2025-03-01"
bd update mc2-xxx --defer "next monday"

# Снять defer (вернуть в работу)
bd update mc2-xxx --defer ""
```

### Массовое откладывание

```bash
# Отложить группу связанных задач
for id in mc2-aaa mc2-bbb mc2-ccc; do
    bd update $id --defer "+3m"
done
```

### Посмотреть отложенные

```bash
bd ready --include-deferred | grep -v "\[chore\].*REF:"
```

---

## Quick Reference

```bash
# View tasks
bd ready -n 20 | grep -v "REF:"    # Ready tasks
bd list --status in_progress       # Currently working on
bd show mc2-xxx                    # Task details

# Work lifecycle
bd update mc2-xxx --status in_progress  # Start
bd close mc2-xxx --reason="..."         # Finish

# Create tasks
bd create "Title" -t task -p 2          # Manual
bd create "Bug" -t bug -p 1 --external-ref="gh-99"  # From GitHub

# Labels
bd ready -l frontend      # Only frontend
bd ready -l backend       # Only backend

# Defer (откладывание)
bd update mc2-xxx --defer "+3m"       # Отложить на 3 месяца
bd update mc2-xxx --defer ""          # Снять defer
bd ready --include-deferred           # Показать отложенные

# Context7 (MANDATORY before implementation)
# Step 1: mcp__context7__resolve-library-id
# Step 2: mcp__context7__query-docs
```

---

## Step 5: Documentation Check (Optional)

После закрытия значимых задач — проверить/обновить REF: документацию.

### Когда нужна документация

| Тип изменения               | REF: документ        | Действие           |
| --------------------------- | -------------------- | ------------------ |
| Новая DB таблица/поле       | mc2-yp5 (Entities)   | bd update --append |
| Новая страница/роут         | mc2-w50 (Web Pages)  | bd update --append |
| Изменение pipeline/stages   | mc2-g06 (Stages)     | bd update --append |
| Новая технология/библиотека | mc2-0e0 (Tech Stack) | bd update --append |
| Новые i18n ключи            | mc2-mgb (Languages)  | bd update --append |

### Когда НЕ нужна документация

- Bug fixes (исправления багов)
- Refactoring без изменения API
- Test fixes
- Cosmetic UI changes
- Performance optimizations (если не меняют архитектуру)

### Workflow

```bash
# 1. Определить тип изменения
# Если затронуты: DB schema, pages, stages, tech, i18n → нужен REF: update

# 2. Найти соответствующий REF: документ
bd search "REF:" | grep -i <domain>

# 3. Посмотреть текущее содержимое
bd show mc2-xxx

# 4. Обновить документ
bd update mc2-xxx --description="$(cat <<'EOF'
... existing content ...

## New Addition (YYYY-MM-DD)
- Added: <what was added>
- Files: <affected files>
EOF
)"
```

### Quick Reference

```bash
# Entities (DB)
bd show mc2-yp5

# Web Pages
bd show mc2-w50

# Pipeline Stages
bd show mc2-g06

# Tech Stack
bd show mc2-0e0

# Languages/i18n
bd show mc2-mgb

# All REF: docs
bd search "REF:"
```

---

## Verification Checklist

Before closing any task:

- [ ] Task description read and understood
- [ ] Context7 queried for involved libraries (MANDATORY)
- [ ] Context gathered (files, patterns, recent commits)
- [ ] Implementation complete
- [ ] `pnpm type-check` passes
- [ ] `pnpm build` passes
- [ ] Changes committed
- [ ] Task closed with reason
- [ ] GitHub issue closed (if external-ref exists)
