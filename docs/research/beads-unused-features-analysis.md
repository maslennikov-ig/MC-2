# Beads: Анализ неиспользуемых фич

> **Дата**: 2026-01-11
> **Цель**: Помочь принять решение о том, какие фичи Beads стоит интегрировать в mc2
> **Текущий статус**: 28 issues (15 open, 13 closed), 8 formulas

---

## Оглавление

1. [Directory Labels](#1-directory-labels)
2. [Wisps (Эфемерные issues)](#2-wisps-эфемерные-issues)
3. [Labels as State Cache](#3-labels-as-state-cache)
4. [Patrol Pattern](#4-patrol-pattern)
5. [Compaction](#5-compaction)
6. [Multi-Repo Hydration](#6-multi-repo-hydration)
7. [Custom SQLite Tables](#7-custom-sqlite-tables)
8. [Exclusive Lock Protocol](#8-exclusive-lock-protocol)
9. [bd duplicates](#9-bd-duplicates)
10. [Protected Branch Mode](#10-protected-branch-mode)
11. [Fork/Contributor Workflow](#11-forkcontributor-workflow)
12. [Adaptive Hash Length](#12-adaptive-hash-length)
13. [External Projects](#13-external-projects)
14. [Molecule Bonding](#14-molecule-bonding)
15. [Semantic Compaction (AI)](#15-semantic-compaction-ai)

---

## 1. Directory Labels

### Описание

Автоматическое присвоение labels к issues на основе путей к файлам, которые затрагивает задача. Особенно полезно для monorepo.

### Как работает

```yaml
# .beads/config.yaml
directory_labels:
  'packages/web': ['frontend', 'nextjs']
  'packages/course-gen-platform': ['backend', 'pipeline']
  'packages/shared-types': ['types', 'shared']
  'packages/course-gen-platform/src/stages': ['pipeline', 'stages']
```

```bash
# При создании issue с указанием файлов
bd create "Fix login page" --files packages/web/app/login/page.tsx
# Автоматически получает labels: frontend, nextjs

# Фильтрация по области
bd ready --label frontend      # Только frontend задачи
bd ready --label pipeline      # Только pipeline задачи
```

### Плюсы

- **Автоматическая категоризация** — не нужно вручную добавлять labels
- **Специализация агентов** — можно направлять frontend-агента только на frontend задачи
- **Статистика по областям** — `bd list --label frontend` покажет все frontend issues
- **Нулевые токены** — конфигурация, не увеличивает context

### Минусы

- **Требует флаг --files** — нужно указывать файлы при создании issue
- **Начальная настройка** — нужно продумать структуру labels
- **Может устареть** — при рефакторинге путей нужно обновлять config

### Применимость для mc2

**Высокая**. У нас чёткая monorepo структура:

- `packages/web` — frontend
- `packages/course-gen-platform` — backend/pipeline
- `packages/shared-types` — типы

### Моя рекомендация

⭐ **РЕКОМЕНДУЮ ДОБАВИТЬ**

Низкие затраты, высокая польза. Позволит специализировать субагентов:

- `bd ready --label frontend` → nextjs-ui-designer
- `bd ready --label pipeline` → stage-pipeline-specialist

### Сложность интеграции

🟢 **Низкая** — добавить 10 строк в config.yaml

---

## 2. Wisps (Эфемерные issues)

### Описание

Временные issues, которые не синхронизируются в git. Идеальны для рутинных проверок, экспериментов, одноразовых операций.

### Как работает

```bash
# Создать wisp из формулы (у нас есть healthcheck.formula.toml!)
bd mol wisp healthcheck

# Wisp создаётся локально, не попадает в git
# Output: bd-wisp-abc

# После выполнения — варианты:

# 1. Burn (уничтожить без следа)
bd mol burn bd-wisp-abc

# 2. Squash (сохранить важное в постоянный issue)
bd mol squash bd-wisp-abc --into mc2-epic-xyz

# 3. Pour (превратить в постоянный molecule)
bd mol pour bd-wisp-abc
```

### Плюсы

- **60% меньше CPU** — нет git sync операций
- **Чистая git история** — рутинные проверки не засоряют лог
- **Быстрый старт** — мгновенное создание без debounce
- **У нас уже есть формулы** — healthcheck, codereview, exploration

### Минусы

- **Теряются при crash** — если агент упадёт, wisp исчезнет
- **Нужно помнить cleanup** — burn или squash после использования
- **Нет аудита** — нельзя посмотреть историю wisps

### Применимость для mc2

**Высокая**. Идеально для:

- Health check workflows (`/health-bugs`, `/code-review-inline`)
- Exploration задач
- Экспериментов

### Моя рекомендация

⭐ **РЕКОМЕНДУЮ ДОБАВИТЬ**

У нас уже есть формулы! Просто начать использовать `bd mol wisp` вместо обычных issues для health workflows.

### Сложность интеграции

🟢 **Низкая** — просто использовать команду

---

## 3. Labels as State Cache

### Описание

Использование labels как кэша состояния для быстрых запросов. Вместо вычисления состояния каждый раз — хранить его в labels.

### Как работает

```bash
# Создать "role bead" для компонента системы
bd create "API Service Health" -t epic

# Обновлять состояние через labels
bd label mc2-api-health status:healthy
bd label mc2-api-health mode:normal
bd label mc2-api-health last-check:2026-01-11

# При проблеме
bd label mc2-api-health status:failing health:critical

# Быстрые запросы
bd list --label status:failing           # Все проблемные компоненты
bd list --label health:critical          # Критические проблемы
bd list --label mode:degraded            # Деградированные сервисы
```

### Плюсы

- **Мгновенные запросы** — O(1) вместо O(n) вычислений
- **Гибкая категоризация** — любые dimensions (status, health, mode, etc.)
- **История через events** — можно создавать event issues для audit trail

### Минусы

- **Дублирование данных** — состояние в labels и в реальности
- **Ручное обновление** — нужно не забывать обновлять labels
- **Может рассинхронизироваться** — labels могут устареть

### Применимость для mc2

**Средняя**. Может быть полезно для:

- Отслеживания состояния pipeline stages
- Мониторинга здоровья системы

### Моя рекомендация

🤔 **ОПЦИОНАЛЬНО**

Интересная концепция, но требует дисциплины. Можно попробовать для одного use case.

### Сложность интеграции

🟡 **Средняя** — нужно определить schema labels и workflow обновления

---

## 4. Patrol Pattern

### Описание

Паттерн для повторяющихся задач. Issue закрывается после выполнения, затем reopens для следующего цикла.

### Как работает

```bash
# Создать patrol epic
bd create "Daily Security Scan" -t epic --label patrol:security
# Output: mc2-patrol-sec

# Создать повторяющиеся subtasks
bd create "Check CVE database" -p mc2-patrol-sec
bd create "Scan dependencies" -p mc2-patrol-sec
bd create "Review access logs" -p mc2-patrol-sec

# Агент выполняет patrol
bd ready --label patrol:security
bd update mc2-xxx --status in_progress
# ... выполнение ...
bd close mc2-xxx --reason "All checks passed, no issues found"

# На следующий день — reopen
bd reopen mc2-xxx --reason "Daily patrol cycle"
```

### Плюсы

- **Полный audit trail** — видно все предыдущие выполнения
- **Структурированные рутины** — не забудешь что проверять
- **Discovered work** — найденные проблемы линкуются через `discovered-from`

### Минусы

- **Ручной reopen** — нужно помнить переоткрывать
- **Накапливается история** — много close/reopen в одном issue
- **Нет автоматизации** — Beads не делает cron

### Применимость для mc2

**Средняя**. Может быть полезно для:

- Регулярных security scans
- Dependency updates
- Health monitoring

### Моя рекомендация

🤔 **ОПЦИОНАЛЬНО**

Хорошая идея, но требует дисциплины. Альтернатива — использовать wisps для одноразовых проверок.

### Сложность интеграции

🟡 **Средняя** — нужно создать patrol epics и workflow

---

## 5. Compaction

### Описание

Сжатие старых закрытых issues для уменьшения размера базы данных. Можно с AI-summarization.

### Как работает

```bash
# Посмотреть статистику
bd admin compact --stats

# Dry run — посмотреть что будет сжато
bd admin compact --days 90 --dry-run

# Выполнить compaction (issues старше 90 дней)
bd admin compact --days 90

# С AI summarization
bd admin compact --days 90 --summarize

# Восстановить при необходимости
bd restore mc2-abc-compacted
```

### Плюсы

- **Меньше шума** — старые issues не засоряют списки
- **Быстрее запросы** — меньше данных для обработки
- **AI summaries** — сохраняется суть без деталей

### Минусы

- **Потеря деталей** — summary не заменит полную историю
- **Необратимо** — хотя можно restore из git
- **Overhead** — AI summarization стоит токенов

### Применимость для mc2

**Низкая сейчас**. У нас 28 issues — это мало.

**Рекомендация Steve Yegge**:

- Думать о cleanup при >200 issues
- Редко позволять >500 issues

### Моя рекомендация

❌ **НЕ СЕЙЧАС**

Вернуться к этому когда база вырастет до 200+ issues.

### Сложность интеграции

🟢 **Низкая** — просто запустить команду

---

## 6. Multi-Repo Hydration

### Описание

Агрегация issues из нескольких репозиториев в единую базу данных для unified view.

### Как работает

```yaml
# .beads/config.yaml
repos:
  additional:
    - path: ~/code/project-api
      import: true
    - path: ~/code/project-mobile
      import: true
```

```bash
# После настройки — видишь issues из всех репо
bd list                    # Все issues
bd list --source api       # Только из api репо
bd ready                   # Ready из всех репо
```

### Плюсы

- **Единый dashboard** — все проекты в одном месте
- **Cross-repo dependencies** — можно линковать issues между репо
- **Centralized management** — один `bd ready` для всего

### Минусы

- **Сложность sync** — больше потенциальных конфликтов
- **Размер базы** — растёт с каждым репо
- **Контекст** — нужно помнить какой issue откуда

### Применимость для mc2

**Низкая**. У нас monorepo — всё в одном месте.

### Моя рекомендация

❌ **НЕ НУЖНО**

Monorepo architecture делает это избыточным.

### Сложность интеграции

🟡 **Средняя**

---

## 7. Custom SQLite Tables

### Описание

Расширение SQLite схемы Beads кастомными таблицами для tracking дополнительных данных.

### Как работает

```go
// Получить shared database connection
db := storage.UnderlyingDB()

// Создать кастомную таблицу
_, err := db.Exec(`
  CREATE TABLE IF NOT EXISTS mc2_time_tracking (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,
    agent TEXT NOT NULL,
    seconds INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
  )
`)

// Запросы с JOIN
rows, err := db.Query(`
  SELECT i.id, i.title, SUM(t.seconds) as total_time
  FROM issues i
  JOIN mc2_time_tracking t ON i.id = t.issue_id
  WHERE i.status = 'closed'
  GROUP BY i.id
`)
```

### Use cases

- **Time tracking** — сколько времени на каждую задачу
- **Cost estimation** — стоимость в токенах
- **Test coverage** — связь с тестами
- **Deployment tracking** — когда что задеплоено

### Плюсы

- **Единая база** — всё в одном месте
- **SQL queries** — мощные JOINs
- **Automatic cleanup** — CASCADE delete

### Минусы

- **Требует Go код** — не CLI
- **Maintenance** — нужно поддерживать миграции
- **Не portable** — привязка к SQLite

### Применимость для mc2

**Низкая**. Избыточно для текущих потребностей.

### Моя рекомендация

❌ **НЕ НУЖНО**

Over-engineering для нашего случая.

### Сложность интеграции

🔴 **Высокая** — требует Go кода

---

## 8. Exclusive Lock Protocol

### Описание

Механизм блокировки базы данных для external tools (CI/CD, testing).

### Как работает

```bash
# CI pipeline создаёт lock
echo '{"holder": "ci-pipeline", "timestamp": "2026-01-11T10:00:00Z"}' > .beads/.exclusive-lock

# Daemon пропускает все операции пока lock существует
# CI имеет полный контроль над базой

# После завершения — удалить lock
rm .beads/.exclusive-lock
```

### Плюсы

- **Нет конфликтов** — daemon не вмешивается
- **Clean integration** — CI может делать batch операции
- **Auto-cleanup** — stale locks очищаются

### Минусы

- **Manual management** — нужно помнить создать/удалить
- **Blocking** — другие процессы ждут
- **Risk** — забытый lock блокирует всё

### Применимость для mc2

**Низкая сейчас**. Может понадобиться для CI/CD.

### Моя рекомендация

🤔 **ПОЗЖЕ**

Добавить когда будем настраивать CI/CD pipeline с Beads.

### Сложность интеграции

🟢 **Низкая**

---

## 9. bd duplicates

### Описание

Автоматический поиск и merge дубликатов issues на основе content hash.

### Как работает

```bash
# Найти дубликаты
bd duplicates

# Автоматический merge
bd duplicates --auto-merge

# Ручной merge
bd merge mc2-abc mc2-def --into mc2-abc
```

### Плюсы

- **Чистая база** — нет дублей
- **Automatic detection** — hash-based
- **Dependency migration** — links переносятся

### Минусы

- **False positives** — похожие != дубликаты
- **Редко нужно** — при правильном workflow дублей мало

### Применимость для mc2

**Низкая**. У нас контролируемое создание issues.

### Моя рекомендация

❌ **НЕ НУЖНО**

Запускать вручную если появятся дубли.

### Сложность интеграции

🟢 **Низкая** — просто команда

---

## 10. Protected Branch Mode

### Описание

Коммиты Beads идут в отдельную ветку `beads-sync` вместо main, для команд с protected main branch.

### Как работает

```bash
# Инициализация для команды
bd init --team

# Настройка
# .beads/config.yaml
sync:
  branch: "beads-sync"
```

### Плюсы

- **Совместимость** — работает с protected main
- **Clean history** — beads commits отдельно
- **PR workflow** — можно делать PR для sync

### Минусы

- **Усложнение** — две ветки для tracking
- **Merge overhead** — нужно мержить beads-sync

### Применимость для mc2

**Низкая**. У нас нет protected main.

### Моя рекомендация

❌ **НЕ НУЖНО**

Daemon auto-sync в main работает отлично.

### Сложность интеграции

🟡 **Средняя**

---

## 11. Fork/Contributor Workflow

### Описание

Режим для OSS contributors — issues идут в личный planning repo, не засоряя upstream.

### Как работает

```bash
# Инициализация как contributor
bd init --contributor

# Issues автоматически роутятся в ~/.beads-planning
# Upstream репо остаётся чистым
```

### Применимость для mc2

**Нулевая**. Мы не OSS проект.

### Моя рекомендация

❌ **НЕ НУЖНО**

### Сложность интеграции

🟢 **Низкая**

---

## 12. Adaptive Hash Length

### Описание

Автоматическое увеличение длины hash ID по мере роста базы для предотвращения коллизий.

### Как работает

```yaml
# .beads/config.yaml
min_hash_length: 4 # bd-a1b2 (начальный)
max_hash_length: 8 # bd-a1b2c3d4 (максимум)
max_collision_prob: 0.25 # Порог для увеличения
```

### Плюсы

- **Короткие IDs** — пока база маленькая
- **Автоматика** — не нужно думать о коллизиях
- **Scalable** — работает до миллионов issues

### Минусы

- **Inconsistent IDs** — старые короткие, новые длинные
- **Already configured** — у нас mc2 prefix работает

### Применимость для mc2

**Низкая**. Дефолтные настройки достаточны.

### Моя рекомендация

❌ **НЕ НУЖНО**

Дефолт работает, менять не стоит.

### Сложность интеграции

🟢 **Низкая** — просто config

---

## 13. External Projects

### Описание

Cross-project dependency linking между разными репозиториями.

### Как работает

```yaml
# .beads/config.yaml
external_projects:
  api: '/home/user/code/api-project'
  mobile: '/home/user/code/mobile-app'
```

```bash
# Линковка между проектами
bd dep add mc2-abc api:api-def
```

### Применимость для mc2

**Низкая**. Monorepo — всё внутри.

### Моя рекомендация

❌ **НЕ НУЖНО**

### Сложность интеграции

🟡 **Средняя**

---

## 14. Molecule Bonding

### Описание

Создание зависимостей между work graphs для compound workflows.

### Как работает

```bash
# Простое bonding (sequential)
bd mol bond mc2-epic-A mc2-epic-B
# B зависит от A, выполнится после A

# Parallel bonding
bd mol bond mc2-epic-A mc2-epic-B --type parallel
# Организационная связь без блокировки

# Conditional bonding
bd mol bond mc2-epic-A mc2-epic-B --type conditional
# B выполнится только если A failed
```

### Плюсы

- **Complex workflows** — многоэтапные процессы
- **Automatic unblocking** — завершение A разблокирует B
- **Compound traversal** — агент проходит через всё

### Минусы

- **Complexity** — нужно понимать dependency graph
- **Debugging** — сложно отслеживать состояние

### Применимость для mc2

**Средняя**. Может быть полезно для big features.

### Моя рекомендация

🤔 **ИЗУЧИТЬ**

У нас есть `bigfeature.formula.toml` — можно добавить bonding для workflow steps.

### Сложность интеграции

🟡 **Средняя**

---

## 15. Semantic Compaction (AI)

### Описание

AI-powered summarization при compaction — сохраняет суть закрытых issues.

### Как работает

```bash
# Compaction с AI summary
bd admin compact --days 90 --summarize

# AI создаёт summary:
# "Fixed authentication bug in login flow. Root cause: expired JWT not handled.
#  Solution: Added refresh token logic. 3 files changed, 2 tests added."
```

### Плюсы

- **Preserved context** — не теряется суть
- **Searchable** — можно найти по summary
- **Compact** — длинные discussions → короткий summary

### Минусы

- **Token cost** — AI summarization стоит денег
- **Quality varies** — AI может упустить важное
- **Latency** — медленнее обычной compaction

### Применимость для mc2

**Низкая сейчас**. База маленькая.

### Моя рекомендация

❌ **НЕ СЕЙЧАС**

Вернуться когда база вырастет.

### Сложность интеграции

🟢 **Низкая** — флаг к команде

---

## Сводная таблица решений

| #   | Feature               | Рекомендация     | Приоритет | Сложность  | Токены |
| --- | --------------------- | ---------------- | --------- | ---------- | ------ |
| 1   | Directory Labels      | ⭐ ДОБАВИТЬ      | Высокий   | 🟢 Низкая  | 0      |
| 2   | Wisps                 | ⭐ ДОБАВИТЬ      | Высокий   | 🟢 Низкая  | 0      |
| 3   | Labels as State Cache | 🤔 Опционально   | Средний   | 🟡 Средняя | 0      |
| 4   | Patrol Pattern        | 🤔 Опционально   | Средний   | 🟡 Средняя | 0      |
| 5   | Compaction            | ❌ Позже         | Низкий    | 🟢 Низкая  | 0      |
| 6   | Multi-Repo            | ❌ Не нужно      | -         | 🟡 Средняя | 0      |
| 7   | Custom Tables         | ❌ Не нужно      | -         | 🔴 Высокая | 0      |
| 8   | Exclusive Lock        | 🤔 Для CI        | Низкий    | 🟢 Низкая  | 0      |
| 9   | bd duplicates         | ❌ По требованию | -         | 🟢 Низкая  | 0      |
| 10  | Protected Branch      | ❌ Не нужно      | -         | 🟡 Средняя | 0      |
| 11  | Fork Workflow         | ❌ Не нужно      | -         | 🟢 Низкая  | 0      |
| 12  | Adaptive Hash         | ❌ Дефолт ОК     | -         | 🟢 Низкая  | 0      |
| 13  | External Projects     | ❌ Не нужно      | -         | 🟡 Средняя | 0      |
| 14  | Molecule Bonding      | 🤔 Изучить       | Средний   | 🟡 Средняя | 0      |
| 15  | Semantic Compaction   | ❌ Позже         | Низкий    | 🟢 Низкая  | Есть   |

---

## Мои топ-3 рекомендации

### 1. 🥇 Directory Labels

**Почему**: Нулевая стоимость, высокая польза для monorepo. Позволит специализировать субагентов.

### 2. 🥈 Wisps для Health Workflows

**Почему**: У нас уже есть формулы (healthcheck, codereview). Просто начать использовать для чистой git истории.

### 3. 🥉 Molecule Bonding

**Почему**: Может улучшить bigfeature workflow с явными зависимостями между этапами.

---

_Документ создан: 2026-01-11_
_Автор: Claude Code_
