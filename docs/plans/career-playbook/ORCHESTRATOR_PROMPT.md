# Orchestrator Handoff Prompt

Это финальный промпт для оркестратора. Скопируйте всё ниже после линии и вставьте оркестратору.

---

# Задача: реализовать новый продуктовый трек "Career Playbook" на MC2

Ты — оркестратор для реализации нового продуктового трека на платформе MC2 (`/home/me/code/mc2`). Я подготовил полный handoff-пакет: утверждённый план, 5 детальных дизайн-документов и 11 phase-задач в beads с graph зависимостей.

## Что нужно знать перед стартом

**Главный план**: `docs/plans/quiet-waddling-starfish.md` — продуктовые решения, архитектура, файлы, error handling, verification. Прочитай его целиком первым.

**Handoff-пакет**: `docs/plans/career-playbook/` — детальные документы:
- `README.md` — индекс и workflow
- `01-db-schema.md` — Supabase миграция (для Phase 1)
- `02-fixed-questions-seed.md` — фиксированные стартовые вопросы wizard (для Phase 1)
- `03-prompts-structure.md` — все LLM prompts + `RoleProfileSpec` schema (для Phases 2-3)
- `04-course-bridge-flow.md` — алгоритм Role Guide → Course (для Phase 9)
- `05-frontend-architecture.md` — компоненты, store, i18n, streaming (для Phases 4-7)

**Beads tracking**:
- Epic: `mc2-db696`
- 11 phases: `mc2-db696.1` ... `mc2-db696.11` (parent-child)
- Граф зависимостей уже настроен — `bd ready` показывает только разблокированные задачи

**Контекст продукта**:
- MC2 = AI-платформа генерации обучающих курсов (Stage 1-6 pipeline через LangGraph + BullMQ)
- Career Playbook = новый параллельный трек: интерактивный Q&A конструктор Role Guide (26 блоков по методологии Netflix/Amazon/Toyota/Spotify/Bridgewater) + bridge к course generation
- Lead magnet для платформы: привлекает HR/бизнес-владельцев → конвертация в course generation
- Источник методологии: `.claude/skills/job-description/SKILL.md` + `docs/research/`
- Образец сгенерированного Role Guide: `docs/job-descriptions/sales-manager-b2b.md` (812 строк, 3 Mermaid)

## Workflow (выполняй строго по шагам)

### 1. Подготовка к фазе

```bash
# Найти ready задачу
bd ready --label "" | grep mc2-db696

# Прочитать детали
bd show mc2-db696.1

# Прочитать главный план и нужный детальный документ
# (например, для Phase 1 — quiet-waddling-starfish.md + career-playbook/01-db-schema.md + 02-fixed-questions-seed.md)
```

### 2. Изоляция (если фаза параллельная — 7, 8, 10 могут идти изолированно)

Используй worktree для не-blocking фаз:
```bash
git worktree add ../mc2-career-playbook-phase-N feature/career-playbook-phase-N develop
```

Для blocking-цепочки (1 → 2 → 3) — обычная ветка `feature/career-playbook-backend`.

### 3. Claim

```bash
bd update mc2-db696.N --status in_progress
```

### 4. Реализация (TDD)

Следуй существующим паттернам:
- Phases 2-3 (backend) — паттерн `packages/course-gen-platform/src/stages/stage6-lesson-content/`
- Phases 4-6 (frontend wizard/viewer) — паттерны `components/mocks/clarifying/MockVariant3Wizard.tsx`, `components/generation-graph/panels/RefinementChat.tsx`, `components/generation-graph/stores/batch-enrichment-store.ts`
- tRPC routers — паттерн `routers/clarifying.router.ts`
- Phase 9 (course bridge) — используй существующий `generation.start` flow

**TDD протокол**:
1. RED: пиши failing test для бизнес-логики
2. GREEN: минимальная имплементация чтобы тест проходил
3. REFACTOR: убери дубли, оставь чистый код

**MUST**:
- Реюз существующих utilities (см. план — секция "Reusable existing utilities")
- Type-safety: Zod на boundaries, TypeScript strict
- RLS на всех новых таблицах, где user_id involved
- nodeCosts tracking с Phase 2 (паттерн Stage 6)
- i18n keys в `messages/{ru,en}/career-playbook.json`

**MUST NOT**:
- Не добавляй billing / payment в MVP — безлимит для авторизованных
- Не пуш напрямую в master или develop — через PR
- Не используй `--no-verify` или `--no-gpg-sign` для bypass
- Не используй TodoWrite — только beads
- Не изобретай новую структуру блоков — следуй skill `.claude/skills/job-description/SKILL.md`
- Не игнорируй language параметр — контент на всех Stage 6 языках

### 5. Quality gates (обязательно перед close)

```bash
pnpm type-check                # должен пройти без ошибок
pnpm test --filter <package>   # все unit + integration tests зелёные
pnpm lint                      # без warnings
```

Если фаза включает UI:
- Запусти dev сервер локально
- Проверь golden path и 2-3 edge cases в браузере
- Mobile responsiveness (хотя бы 375px viewport)

### 6. Code review

После implementation, перед merge:
```
[invoke superpowers:requesting-code-review skill]
```

### 7. Close + sync

```bash
bd close mc2-db696.N --reason "Phase N complete: <short summary>"
bd dolt push
git push origin feature/career-playbook-phase-N
gh pr create --base develop --title "feat(career-playbook): Phase N — ..."
```

### 8. Следующая фаза

После merge PR:
```bash
git checkout develop && git pull
bd ready --label "" | grep mc2-db696
```

## Сравнение со Stage 6 — что копировать

| Что в Stage 6 | Куда в Career Playbook |
|---|---|
| `state.ts` (Annotation.Root) | `stage-career-playbook/state.ts` |
| `graph.ts` (StateGraph) | `stage-career-playbook/graph.ts` |
| `nodes/generator-node.ts` | `nodes/group-generator.ts` |
| `nodes/judge-node.ts` | `nodes/cross-block-judge.ts` |
| `nodes/section-regenerator-node.ts` | `nodes/block-regenerator.ts` |
| `LessonSpec` | `RoleProfileSpec` (см. 03-prompts-structure.md) |
| `rag/retriever.ts` | `rag/web-research.ts` (WebSearch вместо Qdrant) |
| `handler.ts` | `orchestrator/handlers/career-playbook-handler.ts` |
| Self-reviewer | Тот же паттерн перед judge |
| nodeCosts tracking | Тот же reducer, без изменений |

Бери паттерн целиком — не пиши заново то, что уже работает.

## Параллелизм

Если работаешь один (single session) — выполняй фазы последовательно по `bd ready`.

Если можешь параллелить (другая сессия / агент):
- После Phase 1: одновременно 2, 4, 7, 10
- После Phase 2: 5 (с 4) и 3 одновременно
- После Phase 3: 6 (с 5), 8, 9 одновременно

Используй разные worktrees (`superpowers:using-git-worktrees`) чтобы избежать конфликтов.

## Прогресс и отчётность

После каждой завершённой фазы — короткий status update:
- Что сделано (1-2 строки)
- Что разблокировалось (`bd ready` diff)
- Где сейчас работаешь дальше
- Open questions, если есть

## Edge cases и решения

| Случай | Действие |
|---|---|
| Beads ID `mc2-db696` не существует в твоей сессии | `bd ready` сам найдёт. Если совсем не видно — `bd import .beads/issues.jsonl` |
| Фаза заблокирована хотя должна быть ready | `bd dep list mc2-db696.N` → проверить зависимости, при необходимости `bd dep rm` (только если правда не нужна) |
| Конфликт миграций (другая ветка добавила миграцию параллельно) | Перенумеровать YYYYMMDD-имя своей миграции, rebase, обновить связанные tests |
| WebSearch API key недоступен в dev | Mock в integration tests, env var в .env.local. См. 04-course-bridge-flow.md edge cases |
| Stage 6 паттерн не подходит для конкретной ноды | Документируй deviation в комментарии + в PR description |
| Обнаружена проблема в existing коде (Stage 6) | Создавай `bd create -t bug --deps discovered-from:mc2-db696.N` — не фикси в этом PR |

## Финал

Когда все 11 фаз закрыты:
```bash
bd close mc2-db696 --reason "Career Playbook MVP shipped"
```

Обнови memory: `/home/me/.claude/projects/-home-me-code-mc2/memory/project_jd_catalog.md` — добавь "Status: shipped 2026-XX-XX" + ссылку на production URL.

---

**Сейчас**: начни с `bd show mc2-db696.1`, прочитай главный план + 01-db-schema.md + 02-fixed-questions-seed.md, и приступай к Phase 1.

Удачи. Если есть фундаментальный блокер — сразу пиши пользователю, не пытайся обойти молча.
