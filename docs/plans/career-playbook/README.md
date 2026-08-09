# Career Playbook — Handoff Package

Документация для оркестратора, реализующего трек Career Playbook на платформе MC2.

## Главный план

[../quiet-waddling-starfish.md](../quiet-waddling-starfish.md) — утверждённый план со всеми product decisions, архитектурой, файлами, error handling и verification.

## Runtime docs

[../../career-playbook/README.md](../../career-playbook/README.md) — текущие runtime entrypoints и verification команды.

[../../career-playbook/architecture.md](../../career-playbook/architecture.md) — карта web/backend/worker поверхностей, read-only smoke, staging cron план и performance/cost checklist.

## Детальные документы (этот пакет)

| #   | Документ                                               | Для какой фазы                                       |
| --- | ------------------------------------------------------ | ---------------------------------------------------- |
| 01  | [DB Schema](./01-db-schema.md)                         | Phase 1 (DB migration + RLS)                         |
| 02  | [Fixed Questions Seed](./02-fixed-questions-seed.md)   | Phase 1 (seed data для wizard)                       |
| 03  | [Prompts Structure](./03-prompts-structure.md)         | Phase 2-3 (все LLM prompts + RoleProfileSpec schema) |
| 04  | [Course Bridge Flow](./04-course-bridge-flow.md)       | Phase 9 (JD → Course с auto WebSearch)               |
| 05  | [Frontend Architecture](./05-frontend-architecture.md) | Phases 4-7 (компоненты, store, i18n, streaming)      |

## Beads tracking

- **Epic**: `mc2-db696` — Career Playbook track (lead-magnet konstruktor Role Guide)
- **Phase tasks**: `mc2-db696.1` .. `mc2-db696.11` (parent-child под epic)
- **Граф зависимостей**:
  ```
  1 (foundation, ready first)
  ├── 2 → 3
  ├── 4 → 5 (с 2) → 6 (с 3)
  ├── 7 (parallel)
  ├── 10 (parallel)
  │
  3 → 8 (PDF)
  3 → 9 (Course bridge)
  │
  All → 11 (Tests + smoke + verification)
  ```

Получить ready задачу: `bd ready --label "" | grep db696`
Посмотреть детали: `bd show mc2-db696.1`
Заклеймить и начать: `bd update mc2-db696.1 --status in_progress`

## Workflow для оркестратора

1. **Старт сессии**: `bd ready` → найти ready задачу из эпика mc2-db696
2. **Claim**: `bd update <id> --status in_progress`
3. **Прочитать**: главный план + соответствующий детальный документ для фазы
4. **Реализация**: TDD, переиспользовать существующие паттерны (см. план — секция "Reusable existing utilities")
5. **Tests**: вписаны в каждую фазу (см. описание phase в bd show)
6. **Code review**: `superpowers:requesting-code-review` skill после implementation
7. **Verification**: см. секцию "Verification Steps" в главном плане
8. **Close**: `bd close <id> --reason "..."`
9. **Sync**: `bd sync` + git push

## Ключевые принципы

- **Реюз > новый код**: 80% Phase 2-6 работы — это copy-and-adapt из `stage6-lesson-content/`
- **TDD везде**: пишем тесты first, особенно для prompt parsing, RoleProfileSpec extraction, judge logic
- **Никаких mock'ов БД** в integration tests — реальный Supabase test env
- **Quality gates**: type-check, lint, tests должны проходить перед каждым `bd close`
- **Безопасность**: все user-input идёт через Zod validation, RLS включён везде где user_id involved
- **Cost discipline**: nodeCosts tracking обязателен с самого начала Phase 2

## Что НЕ делать

- Не изобретать новую структуру блоков — следовать skill `.claude/skills/job-description/SKILL.md` (он source of truth по 26 блокам и методологии)
- Не добавлять billing / payment в MVP — безлимитно для авторизованных
- Не делать catalog как первичный продукт — конструктор первый, catalog потом
- Не использовать TodoWrite — только `bd` для tracking
- Не пушить напрямую в `master` — через PR в `develop`
- Не игнорировать language параметр — контент должен генерироваться на всех Stage 6 языках

## Чек-лист готовности к запуску фазы

Перед `bd update <phase-id> --status in_progress`:

- [ ] Прочитан главный план (`quiet-waddling-starfish.md`)
- [ ] Прочитан соответствующий детальный документ (01-05)
- [ ] Понятны input/output фазы (file paths, схемы)
- [ ] Понятны зависимости (что нужно от предыдущих фаз)
- [ ] Понятны verification criteria
- [ ] Есть рабочий worktree (если фаза параллельная) или ветка `feature/career-playbook-phase-N`
- [ ] Beads issue прочитан полностью: `bd show <phase-id>`
