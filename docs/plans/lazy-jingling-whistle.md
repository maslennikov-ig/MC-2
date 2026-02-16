# Plan: Bug Health Check (Inline Orchestration)

## Context

Запуск полного Bug Health Check по workflow `/health-bugs`. Цель — обнаружить баги в кодовой базе, создать Beads-задачи, исправить по приоритетам, верифицировать.

## Workflow

### Phase 1: Pre-flight & Beads Init

- `mkdir -p .tmp/current/{plans,changes,backups}`
- Создать Beads wisp: `bd mol wisp healthcheck`
- Инициализировать TodoWrite

### Phase 2: Detection

- Запустить `bug-hunter` subagent для полного сканирования
- Прочитать `bug-hunting-report.md`, распарсить баги по приоритетам
- Если 0 багов → Phase 7

### Phase 2.5: History Enrichment (только CRITICAL/HIGH)

- Поиск в Beads по ключевым словам закрытых задач
- Обогащение данных о багах историческим контекстом

### Phase 3: Create Beads Issues

- `bd create` для каждого бага с приоритетом
- Для CRITICAL/HIGH — с историческим контекстом

### Phase 4: Quality Gate (Pre-fix)

- `pnpm type-check && pnpm build`

### Phase 5: Fixing Loop (critical → high → medium → low)

- Для каждого приоритета запустить `bug-fixer` subagent
- Quality gate после каждого раунда
- Закрыть исправленные Beads-задачи

### Phase 6: Verification

- Повторный `bug-hunter` для проверки
- До 3 итераций если баги остаются

### Phase 7: Final Summary & Beads Complete

- `bd mol squash/burn` для wisp
- Создать задачи для неисправленных багов
- Git commit & push

## Verification

- `pnpm type-check` passes
- `pnpm build` passes
- bug-hunting-report.md создан
- Beads wisp закрыт
