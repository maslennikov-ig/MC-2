# Исследование: Параллельные Task Lists в Claude Code

## Проблема

При включении `CLAUDE_CODE_TASK_LIST_ID=my-project` все параллельные терминалы видят единый список задач. Это создаёт конфликты когда несколько оркестраторов работают параллельно.

---

## Результаты исследования

### 1. Как работает CLAUDE_CODE_TASK_LIST_ID

| Аспект            | Описание                                           |
| ----------------- | -------------------------------------------------- |
| **Назначение**    | Sharing task list между сессиями Claude Code       |
| **Хранение**      | `~/.claude/tasks/{TASK_LIST_ID}/`                  |
| **Синхронизация** | Real-time broadcast между сессиями с одинаковым ID |

**Источник**: [Official Claude Code Settings](https://code.claude.com/docs/en/settings)

### 2. Известные баги (актуальные)

| Issue                                                            | Проблема                                   | Workaround            |
| ---------------------------------------------------------------- | ------------------------------------------ | --------------------- |
| [#20664](https://github.com/anthropics/claude-code/issues/20664) | `--fork-session` не наследует task list ID | Передавать ID вручную |
| [#20424](https://github.com/anthropics/claude-code/issues/20424) | Не работает с non-interactive mode `-p`    | Нет                   |

### 3. Подходы сообщества к параллельной работе

#### Подход A: Разные TASK_LIST_ID для разных воркфлоу

```bash
# Терминал 1 - фронтенд
CLAUDE_CODE_TASK_LIST_ID=frontend-workflow claude

# Терминал 2 - бэкенд
CLAUDE_CODE_TASK_LIST_ID=backend-workflow claude

# Терминал 3 - исследование
CLAUDE_CODE_TASK_LIST_ID=research claude
```

**Плюсы**: Полная изоляция задач
**Минусы**: Нужно помнить/задавать вручную

#### Подход B: Git Worktrees (рекомендуется официально)

```bash
# Создать worktree для задачи
git worktree add ../project-feature-x -b feature-x

# Запустить Claude в отдельном worktree
cd ../project-feature-x && claude
```

**Плюсы**: Полная изоляция файлов + Git история
**Минусы**: Overhead на создание/удаление worktrees

**Источники**:

- [Official Docs - Common Workflows](https://code.claude.com/docs/en/common-workflows)
- [Git Worktree + Claude Code](https://dev.to/kevinz103/git-worktree-claude-code-my-secret-to-10x-developer-productivity-520b)

#### Подход C: parallel-cc (автоматизация)

[parallel-cc](https://github.com/frankbria/parallel-cc) автоматически:

1. Создаёт worktree для каждой новой сессии
2. Изолирует sessions через SQLite координатор
3. Cleanup при завершении

#### Подход D: Субагенты через Task tool (текущий)

Субагенты запускаемые через `Task` tool **уже работают изолированно** - они не используют shared task list, у них свой контекст.

### 4. Feature Request (закрыт)

[#4963](https://github.com/anthropics/claude-code/issues/4963) предлагал команды `/fork`, `/tasks merge` для автоматической оркестрации - **закрыт без реализации** (Jan 21, 2026).

---

## Рекомендации для нашего проекта

### Вариант 1: Скрипты запуска (простой)

Создать shell скрипты для каждого типа работы:

```bash
# scripts/claude-frontend.sh
#!/bin/bash
export CLAUDE_CODE_TASK_LIST_ID="mc2-frontend-$(date +%Y%m%d)"
cd /home/me/code/mc2
claude "$@"
```

```bash
# scripts/claude-backend.sh
#!/bin/bash
export CLAUDE_CODE_TASK_LIST_ID="mc2-backend-$(date +%Y%m%d)"
cd /home/me/code/mc2
claude "$@"
```

### Вариант 2: Динамический ID по терминалу

```bash
# В .bashrc/.zshrc
claude-isolated() {
  export CLAUDE_CODE_TASK_LIST_ID="mc2-$$-$(date +%H%M%S)"
  claude "$@"
}
```

Каждый терминал получит уникальный ID на основе PID + timestamp.

### Вариант 3: Worktrees для крупных задач

Для больших фич использовать worktrees:

```bash
# Создать worktree
git worktree add ../mc2-chat-fix -b fix/chat-workflow

# Работать в изоляции
cd ../mc2-chat-fix && claude
```

### Вариант 4: Убрать глобальный ID (вернуть изоляцию)

Удалить из `.claude/settings.json`:

```json
"CLAUDE_CODE_TASK_LIST_ID": "my-project"
```

Каждая сессия будет иметь свой локальный task list.

---

## Выбранное решение: Убрать глобальный ID

### Действия

1. **Удалить из `.claude/settings.json`:**

   ```json
   "CLAUDE_CODE_TASK_LIST_ID": "my-project"
   ```

2. **Результат:**
   - Каждый терминал получит изолированный task list
   - Координация задач через Beads (`bd`) - без изменений
   - Субагенты (Task tool) работают как раньше

### Что получаем

- ✅ Изоляция task lists между терминалами
- ✅ Координация через Beads (уже работает)
- ✅ Без manual overhead на ID
- ✅ Субагенты работают изолированно

### Файл для изменения

`/home/me/code/mc2/.claude/settings.json`

### Верификация

После удаления открыть два терминала:

```bash
# Терминал 1
claude
> /tasks  # Должен быть пустой список

# Терминал 2
claude
> /tasks  # Должен быть свой пустой список (не shared)
```

---

## Источники

- [Claude Code Settings - Environment Variables](https://code.claude.com/docs/en/settings)
- [Claude Code Common Workflows](https://code.claude.com/docs/en/common-workflows)
- [GitHub Issue #20664 - fork-session bug](https://github.com/anthropics/claude-code/issues/20664)
- [GitHub Issue #4963 - Parallel Task Management](https://github.com/anthropics/claude-code/issues/4963)
- [parallel-cc - Parallel Coordination Tool](https://github.com/frankbria/parallel-cc)
- [Multi-Agent Orchestration Article](https://dev.to/bredmond1019/multi-agent-orchestration-running-10-claude-instances-in-parallel-part-3-29da)
