# Claude Code Settings Reference

> Полный справочник настроек `.claude/settings.json` с ранжированием по полезности.
>
> **Актуально для**: Claude Code 2.1.12 (январь 2026)
>
> **Источники**: [Официальная документация](https://code.claude.com/docs/en/settings), [GitHub CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

## Расположение файлов настроек

| Scope             | Файл                                     | Приоритет |
| ----------------- | ---------------------------------------- | --------- |
| Managed (IT)      | `/etc/claude-code/managed-settings.json` | Высший    |
| Local (личный)    | `.claude/settings.local.json`            | Высокий   |
| Project (команда) | `.claude/settings.json`                  | Средний   |
| User (глобальный) | `~/.claude/settings.json`                | Низший    |

---

## Tier 1: Критически полезные

### plansDirectory

```json
{ "plansDirectory": "./docs/plans" }
```

Куда сохраняются планы при планировании. По умолчанию `~/.claude/plans`.

### env.ENABLE_TOOL_SEARCH

```json
{
  "env": {
    "ENABLE_TOOL_SEARCH": "auto:5"
  }
}
```

Активирует поиск MCP tools вместо загрузки всех сразу. Экономит контекст.

| Значение | Поведение                                 |
| -------- | ----------------------------------------- |
| `auto`   | Активируется при >10% контекста (default) |
| `auto:N` | Активируется при >N% контекста            |
| `true`   | Всегда включен                            |
| `false`  | Выключен                                  |

### permissions.allow / deny

```json
{
  "permissions": {
    "allow": ["Bash(npm run:*)", "Bash(pnpm:*)", "Bash(git:*)", "Edit(src/**)"],
    "deny": ["Read(.env*)", "Bash(rm -rf:*)"]
  }
}
```

Автоматическое разрешение/запрет операций без запроса.

### enableAllProjectMcpServers

```json
{ "enableAllProjectMcpServers": true }
```

Автоматически разрешает все MCP серверы из `.mcp.json`. Без этого — запрос на каждый.

### model

```json
{ "model": "claude-sonnet-4-20250514" }
```

Переопределяет модель по умолчанию.

### alwaysThinkingEnabled

```json
{ "alwaysThinkingEnabled": true }
```

Extended thinking по умолчанию для всех сессий. Улучшает качество сложных задач.

---

## Tier 2: Очень полезные

### language

```json
{ "language": "russian" }
```

Язык ответов Claude. Полезно для не-английских проектов.

### autoUpdatesChannel

```json
{ "autoUpdatesChannel": "stable" }
```

Канал обновлений.

| Значение | Поведение                                    |
| -------- | -------------------------------------------- |
| `latest` | Последняя версия (default)                   |
| `stable` | Версия недельной давности (более стабильная) |

### permissions.defaultMode

```json
{
  "permissions": {
    "defaultMode": "acceptEdits"
  }
}
```

Режим разрешений при старте.

| Значение            | Поведение                              |
| ------------------- | -------------------------------------- |
| `default`           | Спрашивает разрешения                  |
| `acceptEdits`       | Автоматически принимает редактирования |
| `bypassPermissions` | Пропускает все запросы (опасно)        |

### permissions.additionalDirectories

```json
{
  "permissions": {
    "additionalDirectories": ["/home/me/other-project"]
  }
}
```

Дополнительные директории, к которым Claude имеет доступ.

### hooks

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "bd prime" }]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "bd sync" }]
      }
    ]
  }
}
```

Команды, выполняемые на события.

**События:**

- `SessionStart` — старт сессии
- `SessionEnd` — конец сессии
- `Stop` / `SubagentStop` — остановка
- `PreToolUse` / `PostToolUse` — до/после инструмента
- `PreCompact` — перед компактификацией
- `UserPromptSubmit` — отправка промпта

### enabledMcpjsonServers

```json
{
  "enabledMcpjsonServers": ["context7", "supabase", "playwright"]
}
```

Выборочное включение MCP серверов (вместо всех).

---

## Tier 3: Полезные

### attribution.commit / attribution.pr

```json
{
  "attribution": {
    "commit": "Co-Authored-By: Claude <noreply@anthropic.com>",
    "pr": ""
  }
}
```

Настройка атрибуции в коммитах и PR. Пустая строка — отключает.

### cleanupPeriodDays

```json
{ "cleanupPeriodDays": 7 }
```

Через сколько дней удалять неактивные сессии. Default: 30.

### sandbox.enabled

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true
  }
}
```

Песочница для bash команд (macOS/Linux). Безопасность.

### env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE

```json
{
  "env": {
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "80"
  }
}
```

При каком % заполнения контекста запускать auto-compaction. Default: ~90%.

### env.MAX_THINKING_TOKENS

```json
{
  "env": {
    "MAX_THINKING_TOKENS": "50000"
  }
}
```

Бюджет токенов для extended thinking.

### env.CLAUDE_CODE_MAX_OUTPUT_TOKENS

```json
{
  "env": {
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "32000"
  }
}
```

Максимум токенов на ответ. Max: 64000.

### env.CLAUDE_CODE_SUBAGENT_MODEL

```json
{
  "env": {
    "CLAUDE_CODE_SUBAGENT_MODEL": "claude-sonnet-4-20250514"
  }
}
```

Переопределяет модель для субагентов (Task tool).

---

## Tier 4: Ситуационно полезные

### respectGitignore

```json
{ "respectGitignore": false }
```

Учитывать ли `.gitignore` в `@` file picker. Default: true.

### showTurnDuration

```json
{ "showTurnDuration": false }
```

Показывать "Cooked for 1m 6s". Default: true.

### spinnerTipsEnabled

```json
{ "spinnerTipsEnabled": false }
```

Показывать tips в спиннере. Default: true.

### terminalProgressBarEnabled

```json
{ "terminalProgressBarEnabled": false }
```

Progress bar в терминале. Default: true.

### statusLine

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/status-script.sh"
  }
}
```

Кастомная строка статуса.

### fileSuggestion

```json
{
  "fileSuggestion": {
    "type": "command",
    "command": "/path/to/file-suggester.sh"
  }
}
```

Кастомный автокомплит для `@`.

### env.BASH_DEFAULT_TIMEOUT_MS

```json
{
  "env": {
    "BASH_DEFAULT_TIMEOUT_MS": "300000"
  }
}
```

Таймаут bash команд по умолчанию (ms). Default: 120000.

### env.BASH_MAX_TIMEOUT_MS

```json
{
  "env": {
    "BASH_MAX_TIMEOUT_MS": "600000"
  }
}
```

Максимальный таймаут bash. Default: 600000.

### env.MAX_MCP_OUTPUT_TOKENS

```json
{
  "env": {
    "MAX_MCP_OUTPUT_TOKENS": "50000"
  }
}
```

Максимум токенов в ответах MCP. Default: 25000.

### env.MCP_TIMEOUT / MCP_TOOL_TIMEOUT

```json
{
  "env": {
    "MCP_TIMEOUT": "60000",
    "MCP_TOOL_TIMEOUT": "120000"
  }
}
```

Таймауты для MCP серверов и инструментов.

### env.CLAUDE_CODE_TMPDIR

```json
{
  "env": {
    "CLAUDE_CODE_TMPDIR": "/custom/temp"
  }
}
```

Переопределение temp директории (v2.1.5+).

### env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS

```json
{
  "env": {
    "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS": "1"
  }
}
```

Отключает фоновые задачи и Ctrl+B (v2.1.4+).

### env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR

```json
{
  "env": {
    "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR": "1"
  }
}
```

Возврат в исходную директорию после каждой bash команды.

### env.SLASH_COMMAND_TOOL_CHAR_BUDGET

```json
{
  "env": {
    "SLASH_COMMAND_TOOL_CHAR_BUDGET": "20000"
  }
}
```

Максимум символов для метаданных slash команд. Default: 15000.

---

## Tier 5: Для enterprise / специфических случаев

### API и аутентификация

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-...",
    "CLAUDE_CODE_USE_BEDROCK": "1",
    "CLAUDE_CODE_USE_VERTEX": "1"
  }
}
```

Настройки API ключей и провайдеров (Bedrock, Vertex, Foundry).

### apiKeyHelper

```json
{ "apiKeyHelper": "/path/to/get-api-key.sh" }
```

Скрипт для динамического получения API ключа.

### forceLoginMethod / forceLoginOrgUUID

```json
{
  "forceLoginMethod": "console",
  "forceLoginOrgUUID": "uuid-here"
}
```

Принудительный метод логина и организация.

### Proxy настройки

```json
{
  "env": {
    "HTTP_PROXY": "http://proxy:8080",
    "HTTPS_PROXY": "http://proxy:8080",
    "NO_PROXY": "localhost,127.0.0.1"
  }
}
```

### companyAnnouncements

```json
{
  "companyAnnouncements": ["Не забудьте обновить документацию!", "Код-ревью обязателен для всех PR"]
}
```

Объявления при старте (случайный выбор).

### Отключение функций

```json
{
  "env": {
    "DISABLE_TELEMETRY": "1",
    "DISABLE_ERROR_REPORTING": "1",
    "DISABLE_AUTOUPDATER": "1",
    "DISABLE_COST_WARNINGS": "1",
    "DISABLE_BUG_COMMAND": "1",
    "DISABLE_NON_ESSENTIAL_MODEL_CALLS": "1",
    "DISABLE_PROMPT_CACHING": "1"
  }
}
```

### env.FORCE_AUTOUPDATE_PLUGINS

```json
{
  "env": {
    "FORCE_AUTOUPDATE_PLUGINS": "true"
  }
}
```

Обновление плагинов даже при выключенном auto-updater (v2.1.2+).

### env.CLAUDE_CODE_HIDE_ACCOUNT_INFO

```json
{
  "env": {
    "CLAUDE_CODE_HIDE_ACCOUNT_INFO": "1"
  }
}
```

Скрыть email и организацию в UI. Полезно для стримов.

### env.IS_DEMO

```json
{
  "env": {
    "IS_DEMO": "true"
  }
}
```

Режим демо — скрывает аккаунт, пропускает onboarding.

### Плагины

```json
{
  "enabledPlugins": {
    "my-plugin@marketplace": true
  },
  "extraKnownMarketplaces": {
    "internal": {
      "source": { "type": "url", "url": "https://internal/marketplace.json" }
    }
  }
}
```

---

## Полный пример settings.json

```json
{
  "plansDirectory": "./docs/plans",
  "language": "russian",
  "alwaysThinkingEnabled": false,
  "enableAllProjectMcpServers": true,
  "cleanupPeriodDays": 14,

  "permissions": {
    "allow": ["Bash(pnpm:*)", "Bash(npm:*)", "Bash(git:*)", "Bash(bd:*)"],
    "deny": ["Read(.env*)", "Read(**/credentials*)"],
    "defaultMode": "default"
  },

  "attribution": {
    "commit": "Co-Authored-By: Claude <noreply@anthropic.com>",
    "pr": ""
  },

  "env": {
    "ENABLE_TOOL_SEARCH": "auto:5",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "85",
    "MAX_MCP_OUTPUT_TOKENS": "30000"
  }
}
```

---

## Новое в v2.1.x (январь 2026)

### Hook event: Setup

```json
{
  "hooks": {
    "Setup": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "npm install" }]
      }
    ]
  }
}
```

Запускается при `claude --init`, `--init-only`, `--maintenance`.

### Hooks: once: true

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "bd prime", "once": true }]
      }
    ]
  }
}
```

Выполнить хук только один раз за сессию.

### Wildcard MCP permissions

```json
{
  "permissions": {
    "allow": ["mcp__supabase__*"],
    "deny": ["mcp__filesystem__*"]
  }
}
```

Разрешить/запретить все инструменты MCP сервера одной строкой.

### ${CLAUDE_SESSION_ID} в skills

Подстановка текущего session ID в skill frontmatter и env.

### CLI: --tools

```bash
claude --tools Read,Write,Bash
```

Ограничить доступные инструменты в сессии.

---

## См. также

- [Официальная документация](https://code.claude.com/docs/en/settings)
- [MCP конфигурация](https://code.claude.com/docs/en/mcp)
- [GitHub CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- [ClaudeLog](https://claudelog.com/claude-code-changelog/)
