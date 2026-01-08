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

*Prefix: `mc2` | Версия: 2026-01-08*
