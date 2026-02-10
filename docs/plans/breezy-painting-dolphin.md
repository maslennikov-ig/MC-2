# Plan: Healthcheck Cycle — mc2-wisp-0t4

## Context

Последний bug-hunting report — декабрь 2024 (14 месяцев назад). За это время кодовая база значительно изменилась. Предыдущий цикл нашёл 23 бага (все исправлены и закрыты), но формальные workflow-задачи epic'а остались открытыми. Нужен свежий цикл обнаружения и исправления багов.

## Подход

Использовать inline skill `/health-bugs` — он оркестрирует весь цикл из 7 фаз автоматически с интеграцией Beads.

## Шаги

### 1. Подготовка

- Закрыть устаревшие child-задачи epic'а (mc2-wisp-ldk, pvf, csu, 2pi, 337, o6h) — они от предыдущего цикла
- Взять epic `mc2-wisp-0t4` в работу: `bd update mc2-wisp-0t4 --status in_progress`

### 2. Запуск /health-bugs

Skill выполнит 7 фаз:

| Фаза | Действие                | Результат                                           |
| ---- | ----------------------- | --------------------------------------------------- |
| 1    | Pre-flight & Beads Init | `.tmp/current/` структура, wisp создан              |
| 2    | Detection (bug-hunter)  | `docs/reports/bugs/2026-02/bug-hunting-report.md`   |
| 2.5  | History Enrichment      | CRITICAL/HIGH баги обогащены историей из Beads      |
| 3    | Create Beads Issues     | Задачи созданы для каждого бага                     |
| 4    | Quality Gate            | `pnpm type-check` + `pnpm build`                    |
| 5    | Fixing Loop             | Исправление по приоритету: critical → high → medium |
| 6    | Verification            | Повторный скан, сравнение с оригиналом              |
| 7    | Final Summary           | Wisp закрыт, итоги                                  |

### 3. Закрытие

- Закрыть epic `mc2-wisp-0t4` с результатами
- Commit + push изменений

## Критические файлы

- `.claude/skills/health-bugs/SKILL.md` — определение workflow
- `.claude/agents/health/workers/bug-hunter.md` — конфигурация сканера
- `.claude/agents/health/workers/bug-fixer.md` — конфигурация фиксера
- `docs/reports/bugs/2026-02/bug-hunting-report.md` — выходной отчёт (будет создан)

## Верификация

- `pnpm type-check` проходит
- `pnpm build` проходит
- Повторный скан bug-hunter показывает уменьшение найденных проблем
- Все CRITICAL/HIGH баги исправлены или задокументированы

## Оценка объёма

Это большая задача (сканирование всей кодовой базы, исправление багов). Skill `/health-bugs` управляет процессом пофазно с остановками для одобрения после каждого уровня приоритета.
