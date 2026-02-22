# Gastown: памятка для новых проектов

## Стандартный workflow

### 1. Создать проект как обычно

```bash
mkdir ~/code/my-new-project
cd ~/code/my-new-project
git init
```

### 2. Открыть в VS Code

Добавить папку как workspace в VS Code, запустить агента в терминале.

### 3. Подключить к Gastown (одна команда)

```bash
gt rig add my-new-project ~/code/my-new-project
```

Готово. Теперь проект подключён к глобальному Town workspace (`~/gt/`).

## Что даёт эта команда

| Возможность                         | Статус           |
| ----------------------------------- | ---------------- |
| Issue tracking (Beads)              | Автоматически    |
| Mayor координация                   | Автоматически    |
| Polecats (AI-workers)               | Готовы к запуску |
| Convoy tracking                     | Готово           |
| Refinery (merge queue)              | Готово           |
| Witness (мониторинг)                | Готово           |
| Multi-runtime (Claude/Codex/Gemini) | Готово           |

## Опционально: создать crew workspace

```bash
gt crew add me --rig my-new-project
```

## Быстрый старт работы

```bash
# Поставить задачу через Mayor
gt mayor attach
# "Создай convoy для задач X, Y, Z в my-new-project"

# Или вручную
bd create --title="Task description" --type=task
gt sling mc2-xxx my-new-project --agent claude-opus
```

## Полезные команды

```bash
gt rig list                    # Все подключённые проекты
gt rig remove my-project       # Отключить проект
gt agents                      # Активные агенты по всем проектам
gt convoy list                 # Все активные convoys
gt dashboard                   # Web-панель мониторинга
```

## Напоминание: рантаймы (настроены глобально)

```
claude-opus    → Claude Opus (сложные задачи)
claude-sonnet  → Claude Sonnet (рутина)
codex-53       → OpenAI Codex 5.3 (A/B тест)
gemini-pro     → Google Gemini (token-heavy задачи)
```
