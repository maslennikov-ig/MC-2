# Gastown: полный справочник команд

## Быстрый старт

```bash
# Найти работу
bd ready                              # Задачи без блокеров
gt ready                              # То же, но по всему Town

# Взять задачу и запустить агента
gt sling mc2-xxx mc2 --agent claude   # Запустить polecat на задаче
gt convoy list                        # Посмотреть прогресс
gt dashboard --open                   # Веб-панель мониторинга
```

---

## 1. Управление работой (Work Management)

### sling — главная команда запуска работы

```bash
# Базовый запуск: задача + rig + рантайм
gt sling mc2-xxx mc2                       # Claude (по умолчанию)
gt sling mc2-xxx mc2 --agent codex         # Codex 5.3
gt sling mc2-xxx mc2 --agent gemini        # Gemini

# Батч: несколько задач параллельно (каждая получает свой polecat)
gt sling mc2-xxx mc2-yyy mc2-zzz mc2       # 3 polecat'а одновременно
gt sling mc2-xxx mc2-yyy mc2 --max-concurrent 2  # Ограничить параллелизм

# Инструкции для агента (natural language)
gt sling mc2-xxx mc2 --args "focus on security"
gt sling mc2-xxx mc2 --args "patch release, no breaking changes"

# Стратегия мержа
gt sling mc2-xxx mc2 --merge=direct        # Push напрямую в main
gt sling mc2-xxx mc2 --merge=mr            # Merge queue (по умолчанию)
gt sling mc2-xxx mc2 --merge=local         # Оставить на feature branch

# Формулы (готовые workflow-шаблоны)
gt sling code-review mc2 --var scope=packages/web
gt sling mol-release mayor/

# Dry run
gt sling mc2-xxx mc2 -n                    # Показать, что будет сделано
```

### convoy — отслеживание батчей работ

```bash
gt convoy create "Sprint: NLM fixes" mc2-xxx mc2-yyy mc2-zzz
gt convoy list                             # Все конвои (dashboard view)
gt convoy list -i                          # Интерактивное дерево
gt convoy status <convoy-id>               # Прогресс конвоя
gt convoy add <convoy-id> mc2-aaa          # Добавить задачу в конвой
gt convoy close <convoy-id>                # Закрыть конвой
gt convoy land <convoy-id>                 # Land: cleanup worktrees + close
gt convoy stranded                         # Найти "потерянные" конвои
gt convoy check                            # Автозакрытие завершённых
```

### Прочие рабочие команды

```bash
gt ready                                   # Доступная работа по всем rig'ам
gt show <bead-id>                          # Детали задачи/bead
gt cat <bead-id>                           # Содержимое bead
gt close <bead-id> --reason "Done"         # Закрыть задачу
gt done                                    # Сигнал: работа готова к merge
gt hook <bead-id>                          # Повесить задачу на свой hook
gt unsling <bead-id>                       # Снять задачу с hook
gt park                                    # Припарковать работу для позже
gt resume                                  # Возобновить припаркованную работу
gt handoff <bead-id>                       # Передать работу свежей сессии
gt release <bead-id>                       # Вернуть задачу в pending
gt orphans                                 # Найти потерянную работу polecats
gt commit -m "message"                     # Git commit с идентичностью агента
```

---

## 2. Управление агентами (Agent Management)

### Polecats (AI-воркеры)

```bash
gt polecat list                            # Все polecats
gt polecat spawn mc2 --agent claude        # Создать нового polecat
gt polecat nuke <name>                     # Уничтожить polecat
gt polecat cv <name>                       # Послужной список (история работ)
```

### Crew (человеческие workspace'ы)

```bash
gt crew list                               # Все crew workspace'ы
gt crew add me --rig mc2                   # Создать свой workspace
gt crew remove me --rig mc2                # Удалить workspace
gt start mc2/me                            # Запустить crew сессию
```

### Роли и инфраструктурные агенты

```bash
gt agents                                  # Popup-меню всех активных агентов
gt mayor attach                            # Подключиться к Mayor
gt deacon status                           # Статус Deacon'а
gt witness status                          # Статус Witness'а (per-rig)
gt refinery status                         # Статус Refinery (merge queue)
gt role                                    # Текущая роль агента
gt dog list                                # Dogs (кросс-rig workers)
```

### Sessions

```bash
gt session list                            # Активные сессии
gt session kill <id>                       # Убить сессию
gt cycle                                   # Переключиться между сессиями
gt seance <session-id>                     # "Поговорить" с прошлой сессией
gt cleanup                                 # Очистить orphan-процессы Claude
```

---

## 3. Коммуникация между агентами

```bash
# Точечные сообщения
gt nudge <worker> "Check the failing test"       # Сообщение конкретному worker'у
gt mail send <agent> "status update"              # Асинхронное сообщение
gt mail check                                     # Проверить входящие
gt mail list                                      # Все сообщения

# Массовые
gt broadcast "Stop all work, critical bug found"  # Всем workers
gt broadcast --all "Town-wide announcement"       # Всем включая инфраструктуру

# Эскалация
gt escalate <bead-id> --severity critical         # Критическая эскалация
gt escalate <bead-id> --severity high             # Высокий приоритет

# Уведомления
gt notify                                         # Уровень уведомлений
gt dnd                                            # Режим "Не беспокоить"
gt peek <polecat-name>                            # Подсмотреть вывод polecat'а
```

---

## 4. Сервисы и инфраструктура

```bash
gt up                                      # Запустить все сервисы
gt down                                    # Остановить все
gt shutdown                                # Полный shutdown с cleanup
gt start                                   # Запустить Gas Town / crew

gt daemon status                           # Статус daemon'а
gt daemon restart                          # Перезапуск daemon'а
gt daemon logs                             # Логи daemon'а

gt dolt status                             # Статус Dolt SQL сервера
gt dolt start                              # Запустить Dolt
gt dolt stop                               # Остановить Dolt

gt boot status                             # Boot watchdog
gt boot triage                             # Ручной triage
```

---

## 5. Мониторинг и диагностика

```bash
# Дашборд
gt dashboard                               # Веб-дашборд (порт 8080)
gt dashboard --port 3000 --open            # Другой порт + открыть браузер

# Активность
gt feed                                    # Realtime TUI-дашборд
gt trail                                   # Недавние коммиты агентов
gt trail <agent-name>                      # Коммиты конкретного агента
gt status                                  # Общий статус town'а
gt status --fast                           # Быстрый (без mail lookup)
gt activity                                # Лог событий

# Аудит
gt audit <actor>                           # История работы агента
gt costs                                   # Стоимость Claude-сессий
gt log                                     # Общий лог town'а

# Здоровье
gt doctor                                  # Health checks
gt doctor --fix                            # Автоисправление
gt doctor --rig mc2                        # Проверка конкретного rig'а

# Patrolling
gt patrol list                             # Активные patrol'ы
gt patrol run code-review --vars "scope=packages/web"
gt patrol digest                           # Сводка patrol-циклов

# Прочее
gt info                                    # Что нового в Gas Town
gt whoami                                  # Текущая идентичность
gt stale                                   # Проверка актуальности binary
gt warrant list                            # Death warrants для stuck агентов
```

---

## 6. Workspace и конфигурация

### Rigs (проекты)

```bash
gt rig list                                # Все подключённые проекты
gt rig add <name> <git-url>                # Добавить проект
gt rig add <name> --adopt                  # Подключить существующую директорию
gt rig remove <name>                       # Отключить проект
gt init                                    # Инициализировать текущую директорию как rig
```

### Конфигурация

```bash
gt config agent list                       # Доступные рантаймы
gt config agent set <name> <command>       # Добавить рантайм
gt config get <key>                        # Получить настройку
gt config set <key> <value>                # Установить настройку
```

### Hooks и плагины

```bash
gt hooks list                              # Все hook'и
gt hooks sync                              # Синхронизировать hooks
gt plugin list                             # Установленные плагины
gt plugin install <name>                   # Установить плагин
```

### Формулы (workflow-шаблоны)

```bash
gt formula list                            # Все формулы
gt formula show <name>                     # Детали формулы
gt formula pour <name>                     # Создать molecule из формулы
```

### Прочее

```bash
gt shell status                            # Статус shell integration
gt theme                                   # Тема tmux
gt account list                            # Claude-аккаунты
gt namepool                                # Пул имён для polecats
gt completion bash                         # Автодополнение для bash
```

---

## 7. Рантаймы (настроены глобально)

| Agent    | CLI           | Для чего                              |
| -------- | ------------- | ------------------------------------- |
| `claude` | Claude Code   | Архитектура, сложная логика (default) |
| `codex`  | OpenAI Codex  | A/B тест на сложных задачах           |
| `gemini` | Google Gemini | Token-heavy задачи, большие файлы     |

---

## 8. Добавление нового проекта

```bash
# 1. Подключить к Gastown
gt rig add my-project https://github.com/user/repo.git
# или для локальной директории:
gt rig add my-project --adopt

# 2. Создать crew workspace (опционально)
gt crew add me --rig my-project

# 3. Начать работу
bd create --title "First task" --type task
gt sling <bead-id> my-project --agent claude
```

---

## 9. Типичные сценарии

### Одна задача, один агент

```bash
bd ready
gt sling mc2-xxx mc2                       # auto-convoy, auto-polecat
gt convoy list                             # следить за прогрессом
```

### Батч задач параллельно

```bash
gt convoy create "Sprint 42" mc2-a mc2-b mc2-c
gt sling mc2-a mc2-b mc2-c mc2             # 3 polecat'а
gt dashboard --open                        # мониторинг
```

### Тройной A/B тест

```bash
bd create --title "Complex task" --type task
gt sling mc2-xxx mc2 --agent claude
gt sling mc2-xxx mc2 --agent codex         # тот же bead, другой рантайм
gt sling mc2-xxx mc2 --agent gemini        # третий рантайм
gt convoy status <id>                      # сравнить результаты
```

### Code review через patrol

```bash
gt patrol run code-review --vars "scope=packages/web,topic=auth"
```

### Эскалация критической проблемы

```bash
gt escalate mc2-xxx --severity critical    # Mayor + email + SMS
```
