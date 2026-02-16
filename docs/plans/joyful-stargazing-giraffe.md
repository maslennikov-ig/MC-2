# Plan: Устранение замедления Claude Code между шагами работы

## Context

Claude Code делает большие паузы (минуты) **между своими собственными шагами** во время работы. Не между сообщением пользователя и ответом, а между последовательными tool calls: шаг 1 → пауза → шаг 2 → пауза → шаг 3.

Каждый "шаг" — это полный API round-trip: Claude получает весь контекст (системный промпт + вся история) → генерирует следующее действие. Чем больше контекст, тем дольше каждый шаг.

## Результаты диагностики — 3 причины

### Причина 1: Модель Opus (~40-50% задержки)

Сейчас используется **claude-opus-4-6** — самая мощная, но и самая **медленная** модель. Opus генерирует ответ в 2-4 раза медленнее Sonnet на каждый API round-trip.

| Модель       | Время одного шага | 20 шагов подряд |
| ------------ | ----------------- | --------------- |
| **Opus 4.6** | ~10-20 сек        | **3-7 минут**   |
| Sonnet 4     | ~3-7 сек          | ~1-2 минуты     |

При многошаговой работе (чтение файлов → анализ → редактирование → проверка) Opus делает 15-30 API round-trips. Каждый медленнее чем у Sonnet.

### Причина 2: Раздутый системный промпт (~30% задержки)

С каждым шагом отправляется ~12-15K токенов кастомного контекста:

| Компонент                                | Токены | Можно сократить?      |
| ---------------------------------------- | ------ | --------------------- |
| **58 subagent types** (описания агентов) | ~3,500 | ДА — архивация до ~15 |
| **40 skills** (описания)                 | ~1,600 | ДА — архивация до ~15 |
| **CLAUDE.md**                            | ~2,400 | Частично              |
| **Beads workflow context**               | ~800   | Нет (нужен)           |
| **55 deferred MCP tools**                | ~200   | ДА — BASE профиль     |
| Base Claude Code prompt                  | ~3-5K  | Нет (системный)       |
| **Plugins** (2 шт)                       | ~200   | ДА                    |

### Причина 3: Растущая история разговора

Каждый tool call добавляет в контекст: запрос + результат + рассуждение Claude. После 20 шагов история может вырасти до 30-50K токенов сверх системного промпта.

## План оптимизации (по приоритету эффекта)

### Шаг 1: Использовать Sonnet для рутинных задач

Opus нужен для сложного архитектурного анализа и принятия решений. Для повседневной работы (чтение файлов, редактирование, запуск команд) Sonnet справляется не хуже, но в 2-4 раза быстрее.

**Действие**: Переключать модель через `/model sonnet` для рутинных задач. Opus оставить для сложных задач.

### Шаг 2: Архивировать неиспользуемые agents (58 → ~15)

**Директория**: `.claude/agents/` (54 файла, 1.2 MB)

Каждый agent = subagent_type в описании Task tool → отправляется КАЖДЫЙ шаг.

**Оставить (~15 основных)**:

- Core: `general-purpose`, `Plan`, `Bash`
- Frontend: `nextjs-ui-designer`, `fullstack-nextjs-specialist`
- Backend: `database-architect`, `api-builder`
- Testing: `test-writer`
- Spec workflow: `spec-impl`, `spec-design`, `spec-requirements`, `spec-tasks`, `spec-test`, `spec-judge`
- Debug: `problem-investigator`

**Переместить в `.claude/agents/_archive/` (~43)**:

- Pipeline: `stage-pipeline-specialist`, `langgraph-specialist`, `llm-service-specialist`, `orchestration-logic-specialist`
- Infra: `deployment-engineer`, `server-hardening-specialist`, `infrastructure-specialist`, `bullmq-worker-specialist`, `qdrant-specialist`, `rag-specialist`
- Supabase: `supabase-realtime-optimizer`, `supabase-fixer`, `supabase-auditor`, `supabase-storage-optimizer`
- Health workers: `bug-hunter`, `bug-fixer`, `reuse-hunter`, `reuse-fixer`, `dead-code-hunter`, `dead-code-remover`, `security-scanner`, `vulnerability-fixer`, `dependency-auditor`, `dependency-updater`
- Niche: `lms-integration-specialist`, `cost-calculator-specialist`, `quality-validator-specialist`, `judge-specialist`
- UI/UX: `mobile-responsiveness-tester`, `mobile-fixes-implementer`, `visual-effects-creator`, `performance-optimizer`
- Misc: `technical-writer`, `research-specialist`, `integration-tester`, `code-structure-refactorer`, `claude-code-guide`, `statusline-setup`, `meta-agent-v3`, `skill-builder-v2`, `utility-builder`, `typescript-types-specialist`, `code-reviewer`

**Экономия**: ~2,500-3,000 токенов на каждый шаг

### Шаг 3: Архивировать неиспользуемые skills (40 → ~15)

**Директория**: `.claude/skills/` (40 файлов, 864 KB)

**Оставить (~15 основных)**: `git-commit-helper`, `deploy`, `push`, `load-project-context`, `systematic-debugging`, `run-quality-gate`, `code-reviewer`, `code-review-inline`, `senior-architect`, `webapp-testing`, `ultra-think`, `frontend-aesthetics`, `save-session-context`, `format-commit-message`, `parse-error-logs`

**Переместить в `.claude/skills/_archive/` (~25)**: `process-logs`, `process-issues`, `health-bugs`, `reuse-health-inline`, `deps-health-inline`, `security-health-inline`, `cleanup-health-inline`, `pdf`, `work`, `tasks`, `senior-devops`, `senior-prompt-engineer`, `ux-researcher-designer`, `ui-design-system`, `format-markdown-table`, `format-todo-list`, `render-template`, `extract-version`, `validate-plan-file`, `validate-report-file`, `generate-report-header`, `calculate-priority-score`, `rollback-changes`, `generate-changelog`, `changelog-generator`, `parse-package-json`, `parse-git-status`, `supabase-performance-optimizer`

**Экономия**: ~800-1,000 токенов на каждый шаг

### Шаг 4: Создать MCP-профили BASE/FULL + зафиксировать версии

**Файлы**: `.mcp.base.json`, `.mcp.full.json`, `switch-mcp.sh`

- **BASE** (по умолчанию): context7 + sequential-thinking (2 сервера)
- **FULL**: + supabase + playwright + shadcn (5 серверов)
- Все пакеты с фиксированными версиями (без `@latest`)

```bash
# Переключение
./switch-mcp.sh base    # Для обычной работы
./switch-mcp.sh full    # Когда нужны supabase/playwright/shadcn
```

**Экономия**: меньше deferred tools в промпте + нет сетевых запросов на проверку версий при вызове MCP

## Суммарный ожидаемый эффект

| Оптимизация                     | Экономия (tokens/step) | Влияние на скорость                              |
| ------------------------------- | ---------------------- | ------------------------------------------------ |
| Sonnet вместо Opus (для рутины) | 0 токенов              | **Критическое** — 2-4x быстрее каждый шаг        |
| Архивация agents (58→15)        | ~2,500-3,000           | **Высокое** — каждый шаг быстрее                 |
| Архивация skills (40→15)        | ~800-1,000             | **Среднее** — каждый шаг быстрее                 |
| BASE MCP + фикс. версии         | ~100-200               | Заметное при MCP-вызовах                         |
| **ИТОГО**                       | **~3,500-4,200**       | **~25-30% меньше input tokens + 2-4x от Sonnet** |

## Verification

1. До изменений: замерить паузы между шагами на простой задаче (напр. "прочитай файл X и исправь Y")
2. После шага 2 (agents): повторить — паузы должны сократиться
3. После шага 3 (skills): ещё один замер
4. Попробовать ту же задачу на Sonnet — сравнить
5. Проверить `./switch-mcp.sh base` и `./switch-mcp.sh full`
6. Убедиться что архивированные агенты/скиллы можно легко вернуть (mv из \_archive/ обратно)

## Файлы для изменения

- `.claude/agents/` → переместить ~43 файла в `.claude/agents/_archive/`
- `.claude/skills/` → переместить ~25 файлов в `.claude/skills/_archive/`
- `.mcp.json` → зафиксировать версии
- `.mcp.base.json` → создать (BASE профиль)
- `.mcp.full.json` → создать (FULL профиль)
- `switch-mcp.sh` → создать (скрипт переключения)
