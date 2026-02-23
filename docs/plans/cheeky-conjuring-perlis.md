# Plan: Universal Gastown Onboarding via Orchestrator Kit

## Status: COMPLETED

## Context

Пользователь хочет быстро разворачивать Gastown + Beads в любом проекте. Базовый репозиторий — `claude-code-orchestrator-kit` (`/home/me/code/claude-code-orchestrator-kit`), который уже содержит 39 агентов, 37 скиллов, 18 slash-команд, MCP-конфиги и beads-шаблоны. Сейчас в нём НЕТ Gastown-интеграции. В mc2 она есть, но хардкодит `mc2`.

**Задача**: Добавить в orchestrator-kit Gastown-команды (rig-aware), создать `/onboard` для полной провизии любого проекта, и обновить mc2 для использования универсальных версий.

**Что делает `gt rig add`** (30 шагов автоматически): bare repo, clones, Dolt DB, beads config, agents, routes.
**Что НЕ делает**: daemon.json update, slash-команды, gt doctor, beads init в проекте.

## Изменения

### Часть A: Orchestrator Kit (source of truth)

Все изменения в `/home/me/code/claude-code-orchestrator-kit/`.

#### A1. Создать `/work` команду (rig-aware)

Файл: `.claude/commands/work.md`

Аналог mc2-версии, но без хардкода:

- Определение рига: `RIG=$(basename "$(git rev-parse --show-toplevel)")`
- `cd ~/gt/$RIG/mayor/rig && bd create --title "..." --type task`
- `gt sling <bead-id> $RIG --agent <agent>`
- Поддержка `--agent`, `--ab`, `--all` (как в mc2)

#### A2. Создать `/status` команду (rig-aware)

Файл: `.claude/commands/status.md`

- `gt convoy list` — конвои
- `gt status --fast` — агенты
- `cd ~/gt/$RIG/mayor/rig && bd ready` — задачи

#### A3. Создать `/upgrade` команду (rig-aware)

Файл: `.claude/commands/upgrade.md`

Полный цикл обновления gt/bd. Вместо `--rig mc2` → `--rig $RIG` или итерация по `gt rig list`.

#### A4. Создать `/onboard` команду

Файл: `.claude/commands/onboard.md`

Единая команда для подключения проекта к Gastown. Запускается из директории проекта.

**Шаги:**

1. **Pre-flight**: `gt` и `bd` в PATH, демон работает, проект — git repo
2. **Определить параметры**: путь (`git rev-parse --show-toplevel`), имя рига (`$ARGUMENTS` или `basename`)
3. **Проверить, не подключён ли уже**: `gt rig list`
4. **`gt rig add <name> <path>`** — автопровизия
5. **Обновить `~/gt/mayor/daemon.json`**: добавить риг в `witness.rigs[]` и `refinery.rigs[]`
6. **Перезапустить демон**: очистить restart_state, `systemctl --user restart gastown-daemon`
7. **`gt doctor --fix --rig <name>`**
8. **Beads**: если `.beads/` нет → предложить `/beads-init`
9. **Скопировать Gastown-команды из кита в проект**:
   - Source: `/home/me/code/claude-code-orchestrator-kit/.claude/commands/`
   - Файлы: `work.md`, `status.md`, `upgrade.md`, `onboard.md`
   - Dest: `<project>/.claude/commands/`
   - НЕ перезаписывать существующие (спрашивать)
10. **Обновить CLAUDE.md** проекта: дописать Gastown-секцию (Quick Start, Infrastructure, Workflow)
11. **Отчёт**: что создано, doctor результаты, следующие шаги

#### A5. Добавить Gastown-секцию в CLAUDE.md кита

Файл: `CLAUDE.md`

Добавить после "Task Tracking with Beads" новую секцию:

```markdown
## Multi-Agent Orchestration with Gastown (Optional)

If project uses Gastown (`/onboard` was run), agents are dispatched to AI polecats:

### Quick Start

| Command                      | What it does               |
| ---------------------------- | -------------------------- |
| `/work "task"`               | Give task to AI agent      |
| `/work --agent codex "task"` | Use specific runtime       |
| `/status`                    | See convoys, agents, tasks |
| `bd ready`                   | Find available tasks       |
| `gt dashboard --open`        | Visual monitoring          |

### Infrastructure

- **Daemon**: Manages Dolt, heartbeats, patrols (auto-start via systemd)
- **Dolt**: Managed by daemon's `dolt_server` config
- **Witness/Refinery/Deacon**: Auto-spawned by daemon

### Initialize Gastown

Run `/onboard` to connect this project.
```

### Часть B: MC2 (потребитель)

Изменения в `/home/me/code/mc2/`.

#### B1. Обновить `/work` — сделать rig-aware

Файл: `.claude/commands/work.md`

Заменить хардкод `mc2` → auto-detect через `basename $(git rev-parse --show-toplevel)`.

#### B2. Обновить `/status` — сделать rig-aware

Файл: `.claude/commands/status.md`

Аналогично.

#### B3. Обновить `/upgrade` — сделать rig-aware

Файл: `.claude/commands/upgrade.md`

`--rig mc2` → `--rig $RIG`.

#### B4. Добавить `/onboard` в mc2

Скопировать `onboard.md` из кита → `mc2/.claude/commands/onboard.md`

## Файлы для изменения

**В orchestrator-kit** (`/home/me/code/claude-code-orchestrator-kit/`):

| Файл                          | Действие                                  |
| ----------------------------- | ----------------------------------------- |
| `.claude/commands/work.md`    | **Создать** — dispatch задач полекатам    |
| `.claude/commands/status.md`  | **Создать** — статус конвоев и задач      |
| `.claude/commands/upgrade.md` | **Создать** — безопасное обновление gt/bd |
| `.claude/commands/onboard.md` | **Создать** — полный онбординг проекта    |
| `CLAUDE.md`                   | Добавить Gastown-секцию                   |

**В mc2** (`/home/me/code/mc2/`):

| Файл                                     | Действие                          |
| ---------------------------------------- | --------------------------------- |
| `.claude/commands/work.md`               | Заменить `mc2` → auto-detect      |
| `.claude/commands/status.md`             | Заменить `mc2` → auto-detect      |
| `.claude/commands/upgrade.md`            | Заменить `mc2` → auto-detect      |
| `.claude/commands/onboard.md`            | **Создать** — скопировать из кита |
| `docs/gastown-new-project-cheatsheet.md` | Добавить секцию онбординга        |

## Определение рига

Конвенция: **имя рига = basename git-корня проекта**.

```bash
RIG=$(basename "$(git rev-parse --show-toplevel)")
```

## Верификация

1. В mc2: `/status` → определяет `mc2` автоматически
2. В mc2: `/work test task` → бид создаётся в mc2
3. В новом проекте: `/onboard` → полная провизия + файлы скопированы + doctor clean
4. `/upgrade all` → doctor по всем ригам
5. CLAUDE.md в orchestrator-kit содержит Gastown-секцию
