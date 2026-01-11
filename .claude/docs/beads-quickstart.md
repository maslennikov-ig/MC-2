# Beads — Краткий справочник mc2

> Constitution v1.2.0: Все задачи ОБЯЗАТЕЛЬНО трекаются в Beads.

---

## SESSION CLOSE PROTOCOL (ОБЯЗАТЕЛЬНО!)

**НИКОГДА не говори "готово" без выполнения этих шагов:**

```bash
git status              # 1. Что изменилось?
git add <files>         # 2. Добавить код
bd sync                 # 3. Sync beads
git commit -m "... (mc2-xxx)"  # 4. Коммит с ID issue
bd sync                 # 5. Sync новые изменения
git push                # 6. Push в remote
```

**Работа НЕ завершена пока не сделан push!**

---

## Когда что использовать

| Сценарий | Инструмент | Команда |
|----------|------------|---------|
| Большая фича (>1 день) | Spec-kit → Beads | `/speckit.specify` → `/speckit.tobeads` |
| Маленькая фича (<1 день) | Beads | `bd create -t feature` |
| Баг | Beads | `bd create -t bug` |
| Tech debt | Beads | `bd create -t chore` |
| Исследование/spike | Beads wisp | `bd mol wisp exploration` |
| Hotfix (срочно!) | Beads wisp | `bd mol wisp hotfix` |
| Health check | Workflow | `bd mol wisp healthcheck` |
| Релиз | Workflow | `bd mol wisp release` |

---

## Сессия работы

```bash
# === СТАРТ ===
bd ready                    # Что доступно для работы?
bd info                     # Статус проекта

# === РАБОТА ===
bd update ID --status in_progress   # Взять задачу
# ... делаем работу ...
bd close ID --reason "Описание"     # Закрыть задачу
/push patch                         # Коммит (включает bd sync)

# === КОНЕЦ (ОБЯЗАТЕЛЬНО) ===
bd sync                     # Синхронизация перед выходом
```

---

## REF: Issues — Проектные знания

> **Правило**: При изменении DB-схемы, страниц, пайплайна или tech stack → обнови соответствующий REF: issue.

### Что такое REF: issues?

REF: issues — это **живая документация** проекта в формате Beads issues. Они содержат актуальную информацию о ключевых доменах и обновляются вместе с кодом.

### Доступные REF: issues

| ID | Название | Что содержит |
|----|----------|--------------|
| `mc2-yp5` | REF: Business Entities | Все сущности БД: courses, modules, slides и т.д. |
| `mc2-w50` | REF: Web App Pages | Все страницы веб-приложения и их назначение |
| `mc2-g06` | REF: Pipeline Stages 1-7 | Стадии генерации курса |
| `mc2-0e0` | REF: Tech Stack | Технологии, версии, архитектура |
| `mc2-4ul` | REF: Guides Index | Указатель на все гайды проекта |
| `mc2-wm8` | REF: Auth Patterns | Аутентификация и авторизация |
| `mc2-mgb` | REF: i18n Languages | Интернационализация (ru, en) |
| `mc2-vf0` | REF: Error Handling | Обработка ошибок |
| `mc2-w7r` | REF: Logging Conventions | Логирование |
| `mc2-6yg` | REF: Docker Services | Контейнеризация и деплой |

### Когда обновлять REF: issues

```bash
# Изменил схему БД → обнови REF: Business Entities
bd show mc2-yp5  # Посмотреть
# ... добавь новую сущность в описание ...

# Добавил страницу → обнови REF: Web App Pages
bd show mc2-w50

# Изменил стадию пайплайна → обнови REF: Pipeline Stages
bd show mc2-g06

# Добавил технологию → обнови REF: Tech Stack
bd show mc2-0e0
```

### Как использовать

```bash
# Перед работой — изучи релевантные REF:
bd show mc2-yp5    # Понять структуру данных
bd show mc2-g06    # Понять пайплайн

# В bd prime уже включены ключевые REF: issues
bd prime           # Автоматически покажет контекст
```

---

## Создание задач

### Базовая команда
```bash
bd create "Заголовок" -t тип -p приоритет -d "описание"
```

### Типы (-t)
| Тип | Когда |
|-----|-------|
| `feature` | Новая функциональность |
| `bug` | Исправление бага |
| `chore` | Tech debt, рефакторинг, конфиги |
| `docs` | Документация |
| `test` | Тесты |
| `epic` | Группа связанных задач |

### Приоритеты (-p)
| P | Значение |
|---|----------|
| 0 | Критический — блокирует релиз |
| 1 | Критический |
| 2 | Высокий |
| 3 | Средний (по умолчанию) |
| 4 | Низкий / бэклог |

### Примеры
```bash
# Простая задача
bd create "Добавить кнопку logout" -t feature -p 3

# С описанием
bd create "DEBT-001: Token batching" -t chore -p 2 -d "См. docs/Future/"

# Баг с ссылкой на источник
bd create "Кнопка не работает" -t bug -p 1 --deps discovered-from:mc2-abc
```

---

## Зависимости

```bash
# При создании
bd create "Задача" -t feature --deps ТИП:ID

# Добавить к существующей
bd dep add ISSUE DEPENDS_ON    # ISSUE зависит от DEPENDS_ON

# Посмотреть заблокированные
bd blocked
```

| Тип зависимости | Значение |
|-----------------|----------|
| `blocks:X` | Эта задача блокирует X |
| `blocked-by:X` | Эта задача заблокирована X |
| `discovered-from:X` | Найдена при работе над X |
| `parent:X` | Дочерняя задача для epic X |
| `related:X` | Связана с X (информационно) |

---

## Epic и иерархия

```bash
# Создать epic
bd create "User Authentication" -t epic -p 2

# Добавить дочерние задачи
bd create "Login form" -t feature --deps parent:mc2-epic-id
bd create "JWT tokens" -t feature --deps parent:mc2-epic-id
bd create "Logout" -t feature --deps parent:mc2-epic-id

# Посмотреть структуру
bd show mc2-epic-id --tree
```

---

## Молекулы (Workflows)

### Концепция
- **Formula** — шаблон workflow (в `.beads/formulas/`)
- **Wisp** — эфемерный экземпляр (можно сжечь или сжать)
- **Mol** — постоянный экземпляр

### Доступные формулы
```bash
bd formula list
```

| Formula | Назначение |
|---------|------------|
| `bigfeature` | Spec-kit → Beads pipeline для больших фич |
| `bugfix` | Стандартный процесс исправления бага |
| `hotfix` | Экстренное исправление в проде |
| `techdebt` | Работа с техническим долгом |
| `healthcheck` | Bug-hunter → fix цикл |
| `codereview` | Issues + Improvements анализ и фиксы |
| `release` | Процесс релиза версии |
| `exploration` | Исследование/spike |

### Запуск
```bash
# Эфемерный (wisp) — для исследований, можно удалить
bd mol wisp exploration --vars "question=Как сделать X?"

# Постоянный (pour) — для фич
bd mol pour bigfeature --vars "feature_name=auth"
```

### Завершение wisp
```bash
# Сжать в summary (сохранить результат)
bd mol squash WISP_ID

# Сжечь (удалить без следа)
bd mol burn WISP_ID
```

### Прогресс и навигация
```bash
bd mol progress WISP_ID     # Статус выполнения
bd mol current              # Текущая позиция в workflow
```

---

## Directory Labels (автокатегоризация)

Автоматическое присвоение labels на основе путей к файлам.

```bash
# При создании задачи с указанием файлов
bd create "Fix login page" --files packages/web/app/login/page.tsx
# → автоматически получит labels: frontend, nextjs

# Фильтрация по области
bd ready --label frontend    # Только frontend задачи
bd ready --label pipeline    # Только pipeline задачи
bd ready --label backend     # Только backend задачи
```

**Настроенные маппинги** (см. `.beads/config.yaml`):
| Путь | Labels |
|------|--------|
| `packages/web` | frontend, nextjs |
| `packages/web/app/[locale]/admin` | frontend, admin |
| `packages/course-gen-platform` | backend, pipeline |
| `packages/course-gen-platform/src/stages` | pipeline, stages |
| `packages/shared-types` | types, shared |

---

## Exclusive Lock (multi-terminal)

Защита от конфликтов при работе в нескольких терминалах параллельно.

```bash
# Терминал 1
bd update mc2-abc --status in_progress  # → захватил lock

# Терминал 2
bd update mc2-abc --status in_progress  # → WARNING: Issue locked by another session

# Найти незалоченные задачи
bd list --unlocked
```

**Конфигурация** (`.beads/config.yaml`):
- `timeout: 30m` — автоосвобождение через 30 минут неактивности
- `on-conflict: warn` — предупреждение при конфликте

---

## Patrol Pattern (повторяющиеся задачи)

Patrols — это стандартизированные повторяющиеся workflow.

```bash
# Вместо длинного текста "Запусти код-ревью, создай отчёт, создай задачи..."
bd patrol run code-review --vars "scope=packages/web,topic=auth-refactor"

# Health check
bd patrol run health-check
```

**Настроенные patrols** (`.beads/config.yaml`):
| Patrol | Formula | Описание |
|--------|---------|----------|
| `code-review` | codereview | Код-ревью после реализации |
| `health-check` | healthcheck | Проверка здоровья кодовой базы |

---

## Protected Branch Mode (безопасный deploy)

Защита от случайного push в production ветку.

**Текущая конфигурация:**
- `main` — production ветка (auto-deploy)
- `develop` — рабочая ветка

**Workflow:**
```bash
# 1. Работаем в develop
git checkout develop
# ... работа ...
/push patch                  # → push в develop (НЕ deploy)

# 2. Когда готовы к deploy
git checkout main
git merge develop
git push                     # → deploy на сервер
```

---

## Molecule Bonding (большие фичи)

Связывание нескольких molecules в pipeline для complex features.

**Настроенный pipeline** `bigfeature-pipeline`:
```
[spec] → [design] → [implement] → [review] → [release]
```

```bash
# Запуск bonded pipeline
bd mol bond bigfeature-pipeline --vars "feature_name=user-auth"

# Pipeline создаст связанные molecules с зависимостями
# Каждый этап требует manual approval (auto_advance: false)
```

---

## Spec-kit интеграция (большие фичи)

```bash
# 1. Требования
/speckit.specify

# 2. Уточнение (Q&A)
/speckit.clarify

# 3. Дизайн
/speckit.plan

# 4. Задачи
/speckit.tasks

# 5. Импорт в Beads
/speckit.tobeads

# 6. Работа через Beads
bd ready
bd update mc2-xxx --status in_progress
# ... implement ...
bd close mc2-xxx --reason "Done"
```

---

## Health Check Workflows (с Beads)

Все health workflows автоматически создают Beads wisp, issues для находок, и закрывают их после фикса.

### Доступные workflows

| Skill | Команда | Описание |
|-------|---------|----------|
| `code-review-inline` | "Код-ревью для ..." | Issues + Improvements |
| `bug-health-inline` | `/health-bugs` | Баги и ошибки |
| `security-health-inline` | `/security-health` | Security уязвимости |
| `cleanup-health-inline` | `/cleanup-health` | Dead code |
| `deps-health-inline` | `/deps-health` | Зависимости |
| `reuse-health-inline` | `/reuse-health` | Дубликаты кода |

### Code Review (Issues + Improvements)

```bash
# Запуск
"Код-ревью для packages/web"
"Код-ревью последних изменений и исправь всё"

# Что делает:
# 1. bd mol wisp exploration
# 2. Анализ → Issues (BUG:) + Improvements (IMPROVE:)
# 3. bd create для каждой находки
# 4. [Спрашивает] → Fix all / Issues only / Skip
# 5. Фиксит по приоритетам
# 6. bd close после фикса
# 7. bd mol squash + SESSION CLOSE PROTOCOL
```

**Категории:**

| Категория | Beads Prefix | Приоритеты |
|-----------|--------------|------------|
| Issues (баги) | `BUG:`, `CLEANUP:` | P0-P3 |
| Improvements | `IMPROVE:` | P2-P4 |

### Health Check (Bug/Security/Cleanup/Deps/Reuse)

```bash
# Общий паттерн для всех health workflows:
# 1. bd mol wisp {type}
# 2. Detection → Report
# 3. bd create для каждой находки
# 4. Fix по приоритетам (critical → low)
# 5. bd close после фикса
# 6. bd mol squash + SESSION CLOSE PROTOCOL
```

**Примеры:**
```bash
# Баги
/health-bugs

# Security
/security-health

# Dead code
/cleanup-health

# Зависимости
/deps-health

# Дубликаты
/reuse-health
```

---

## Emergent work (нашёл новую задачу)

```bash
# Нашёл баг во время работы над mc2-current
bd create "Найден баг: ..." -t bug --deps discovered-from:mc2-current

# Понял что нужна ещё одна задача
bd create "Также нужно сделать..." -t feature --deps blocks:mc2-current
```

---

## Поиск и фильтрация

```bash
bd ready                    # Готовые к работе (без блокеров)
bd list                     # Все открытые
bd list --all               # Включая закрытые
bd list -t bug              # Только баги
bd list -p 1                # Только P1
bd list --status in_progress # В работе

bd show ID                  # Детали задачи
bd show ID --tree           # С иерархией
```

---

## Управление задачами

```bash
# Изменить статус
bd update ID --status in_progress
bd update ID --status blocked
bd update ID --status open

# Изменить приоритет
bd update ID --priority 1

# Добавить метку
bd update ID --add-label security

# Закрыть (одну или несколько)
bd close ID --reason "Готово"
bd close ID1 ID2 ID3 --reason "Batch done"   # Несколько сразу
bd close ID --reason "Не актуально" --wontfix
```

---

## Синхронизация

```bash
bd sync                     # Sync DB ↔ JSONL ↔ Git
bd sync --force             # Принудительно из JSONL
```

**Автоматически:**
- `/push` включает `bd sync`
- Git hooks синхронизируют при commit

---

## Диагностика

```bash
bd doctor                   # Проверка здоровья
bd info                     # Статус проекта
bd prime                    # Контекст workflow (~1-2k tokens)
bd prime --full             # Полный контекст (CLI mode)
```

---

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| "No issues found" | `bd sync` или `bd daemon restart` |
| Daemon не стартует | `rm .beads/daemon.lock && bd daemon start` |
| Конфликты sync | `git status .beads/` → resolve → `bd sync` |
| Issue не найден | `bd sync --force` |
| Ошибки базы | `bd doctor` |

```bash
# Логи daemon
cat .beads/daemon.log

# Перезапуск
bd daemon restart
```

---

## Шпаргалка

```
┌──────────────────────────────────────────────────┐
│ СТАРТ     bd ready / bd prime                    │
│ ВЗЯТЬ     bd update ID --status in_progress      │
│ СОЗДАТЬ   bd create "..." -t type -p N           │
│ ЗАКРЫТЬ   bd close ID --reason "..."             │
├──────────────────────────────────────────────────┤
│ REF: ISSUES (живая документация)                 │
│   mc2-yp5  Business Entities (DB схема)          │
│   mc2-w50  Web App Pages                         │
│   mc2-g06  Pipeline Stages 1-7                   │
│   mc2-0e0  Tech Stack                            │
│   → Изменил домен? Обнови REF: issue!            │
├──────────────────────────────────────────────────┤
│ НОВЫЕ ФИЧИ                                       │
│   bd create "..." --files path/to/file.tsx       │
│   bd ready --label frontend                      │
│   bd list --unlocked (multi-terminal)            │
│   bd patrol run code-review --vars "scope=X"     │
│   bd mol bond bigfeature-pipeline                │
├──────────────────────────────────────────────────┤
│ ВЕТКИ (Protected Branch Mode)                    │
│   develop  — работа (НЕ deploy)                  │
│   main     — production (auto-deploy)            │
├──────────────────────────────────────────────────┤
│ КОНЕЦ СЕССИИ (ВСЕ 6 ШАГОВ!)                      │
│   1. git status                                  │
│   2. git add <files>                             │
│   3. bd sync                                     │
│   4. git commit -m "... (mc2-xxx)"               │
│   5. bd sync                                     │
│   6. git push                                    │
├──────────────────────────────────────────────────┤
│ WORKFLOWS bd formula list                        │
│           bd mol wisp NAME --vars "k=v"          │
│           bd mol squash/burn WISP_ID             │
├──────────────────────────────────────────────────┤
│ ПОИСК     bd ready / bd blocked                  │
│           bd list [-t type] [-p prio] [--status] │
│           bd show ID [--tree]                    │
└──────────────────────────────────────────────────┘
```

---

## Ссылки

- [Beads CLI Reference](https://github.com/steveyegge/beads/blob/main/docs/CLI_REFERENCE.md)
- [Molecules Guide](https://github.com/steveyegge/beads/blob/main/docs/MOLECULES.md)
- [mc2 Constitution v1.2.0](/.specify/memory/constitution.md)

---

*Prefix: `mc2` | Версия: 2026-01-11 v4 — добавлены Directory Labels, Exclusive Lock, Patrol, Protected Branch, Molecule Bonding*
