# План: Установка claude-mem + гайд для всех проектов

## Контекст

Устанавливаем [claude-mem](https://github.com/thedotmack/claude-mem) как dev-tool для автоматического сохранения контекста рабочих сессий Claude Code. Плагин глобальный — после установки работает во всех проектах (mc2, coffee/Symancy, и любых других). Нужно интегрировать без конфликтов с существующими Beads hooks и написать переносимый гайд.

**Текущее состояние**:

- Bun v1.2.22 уже установлен
- Один плагин уже установлен (`frontend-design@claude-plugins-official`)
- Hooks: SessionStart → `bd prime`, PreCompact → `bd prime`, Stop → `bd sync` + notification
- MCP: context7, sequential-thinking, supabase, playwright, shadcn

---

## Шаг 1: Установка плагина

Выполнить в Claude Code (через `/plugin` команды):

```
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

Это добавит в `~/.claude/plugins/known_marketplaces.json`:

```json
{
  "thedotmack": {
    "source": { "source": "github", "repo": "thedotmack/claude-mem" },
    "installLocation": "~/.claude/plugins/marketplaces/thedotmack"
  }
}
```

И в `~/.claude/plugins/installed_plugins.json`:

```json
{
  "claude-mem@thedotmack": [{ "scope": "user", ... }]
}
```

**Важно**: Перезапустить Claude Code после установки.

---

## Шаг 2: Настройка для наших проектов

После установки создастся `~/.claude-mem/settings.json` с дефолтами. Настроить:

### Файл: `~/.claude-mem/settings.json`

```json
{
  "CLAUDE_MEM_MODEL": "sonnet",
  "CLAUDE_MEM_CONTEXT_OBSERVATIONS": 30,
  "CLAUDE_MEM_CONTEXT_SESSION_COUNT": 5,
  "CLAUDE_MEM_CONTEXT_FULL_COUNT": 3,
  "CLAUDE_MEM_CONTEXT_FULL_FIELD": "narrative",
  "CLAUDE_MEM_LOG_LEVEL": "WARN",
  "CLAUDE_MEM_SKIP_TOOLS": [
    "ListMcpResourcesTool",
    "SlashCommand",
    "Skill",
    "TodoWrite",
    "AskUserQuestion",
    "TaskCreate",
    "TaskUpdate",
    "TaskList",
    "TaskGet",
    "ToolSearch",
    "EnterPlanMode",
    "ExitPlanMode"
  ]
}
```

**Обоснование настроек**:

- `MODEL: sonnet` — используется через подписку Claude Code (Agent SDK), дополнительных расходов нет
- `CONTEXT_OBSERVATIONS: 30` (вместо 50) — наши проекты уже тратят ~5000+ токенов на CLAUDE.md + bd prime + MCP, уменьшаем шум
- `SESSION_COUNT: 5` (вместо 10) — последние 5 сессий достаточно для контекста
- `FULL_COUNT: 3` (вместо 5) — меньше полных observations в контексте, экономим токены
- `LOG_LEVEL: WARN` — не засорять вывод в dev-режиме
- `SKIP_TOOLS` — расширенный список, исключаем task management и plan mode tools (они шумные и неинформативные для памяти)

---

## Шаг 3: Проверка совместимости hooks

### Текущие hooks (остаются без изменений):

**~/.claude/settings.json** (глобальные, пользовательские):

```json
{
  "hooks": {
    "PreCompact": [{ "command": "bd prime" }],
    "SessionStart": [{ "command": "bd prime" }]
  }
}
```

**Проектные (.claude/settings.local.json)** в mc2 и coffee:

```json
{
  "hooks": {
    "Stop": [{ "command": "bd sync + notification" }]
  }
}
```

### claude-mem hooks (из plugin system):

- `SessionStart` → инжектирует контекст из прошлых сессий
- `UserPromptSubmit` → инициализирует новую сессию
- `PostToolUse` → сохраняет observation для каждого tool call
- `Stop` → финализирует сессию
- `SessionEnd` → cleanup

### Порядок выполнения:

1. **Plugin hooks** выполняются через plugin system
2. **User hooks** выполняются через settings.json
3. Оба механизма **параллельные и независимые** — конфликтов нет

**Подтверждено**: claude-mem gracefully handles worker unavailability — если Worker не запущен, hooks просто пропускаются (`return { continue: true, suppressOutput: true }`).

---

## Шаг 4: Верификация после установки

1. Перезапустить Claude Code
2. Проверить Worker: `curl http://localhost:37777/health`
3. Провести короткую рабочую сессию (~10 мин)
4. Закрыть сессию
5. Открыть новую — должен появиться блок контекста от claude-mem
6. Открыть Web UI: http://localhost:37777 — проверить observations
7. Проверить MCP tools: `mem-search "test query"`

---

## Шаг 5: Написать гайд

### Файл: `~/.claude/docs/claude-mem-guide.md`

Переносимый гайд для установки claude-mem в любой проект. Содержание:

- Предпосылки (Bun, Claude Code с поддержкой плагинов)
- Установка (2 команды)
- Рекомендуемые настройки для проектов с Beads
- Как работает (схема hooks)
- Совместимость с существующими hooks
- Настройка шумоподавления (SKIP_TOOLS, CONTEXT_OBSERVATIONS)
- Troubleshooting
- Удаление

---

## Файлы для изменения

| Файл                                        | Действие         | Описание                             |
| ------------------------------------------- | ---------------- | ------------------------------------ |
| `~/.claude-mem/settings.json`               | Создать/изменить | Настройки claude-mem                 |
| `~/.claude/docs/claude-mem-guide.md`        | Создать          | Переносимый гайд                     |
| `~/.claude/settings.json`                   | НЕ трогать       | Существующие hooks остаются как есть |
| `.claude/settings.local.json` (mc2, coffee) | НЕ трогать       | Проектные hooks без изменений        |

**Примечание**: В самих проектах (mc2, coffee) ничего менять не нужно. claude-mem — глобальный плагин уровня пользователя.

---

## Rollback план

Если что-то пойдёт не так:

```
/plugin uninstall claude-mem
```

Данные останутся в `~/.claude-mem/` (можно удалить вручную: `rm -rf ~/.claude-mem/`).
Marketplace можно удалить: удалить запись `thedotmack` из `~/.claude/plugins/known_marketplaces.json`.

---

## Верификация (end-to-end)

1. Установить плагин → перезапустить Claude Code
2. Проверить `curl localhost:37777/health` → 200 OK
3. Провести рабочую сессию в mc2 (10+ мин, несколько file reads/edits)
4. Закрыть сессию → открыть новую
5. Убедиться что контекст инжектирован (в system prompt появится блок от claude-mem)
6. Переключиться в coffee (`cd /home/me/code/coffee`) → открыть сессию
7. Убедиться что контекст coffee-проекта отдельный от mc2
8. Проверить что Beads работает как раньше: `bd ready`, `bd show <id>`
9. Проверить Web UI: http://localhost:37777
10. Написать гайд `~/.claude/docs/claude-mem-guide.md`
