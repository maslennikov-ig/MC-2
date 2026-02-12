# Plan: Surgical Course Editing v2.1 (Revised)

## Кратко

Этот документ — обновленная версия `docs/plans/mossy-greeting-trinket.md` с учетом реального состояния кода и БД.

Главная цель: реализовать surgical-редактирование Stage 5/6 через чат без индексных путей, убрать ручной toggle refine/regenerate, и подготовить безопасный переход на `course_nodes`.

Ключевая разница с v2: убраны рискованные шаги (`write-on-read` backfill, резкий разрыв API-контракта, слишком ранний отказ от fallback без фазовой деградации), добавлены rollout-флаги, dual-write/read-switch и четкие критерии завершения Stage 6.

---

## 1. Что уже есть в коде (baseline)

1. Intent classifier уже внедрен и умеет `ADD_LESSON`/`ADD_SECTION`, но flow фактически зажат условием в роутере:

- `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts:296`

2. Текущий chat request требует `intent` как обязательный (`refine|regenerate`):

- `packages/shared-types/src/chat-types.ts:132`

3. Stage 5 proposal-пайплайн и apply работают по path/index-модели (`sections[0].lessons[1]`):

- `packages/course-gen-platform/src/server/routers/generation/editing/chat-helpers.ts:132`
- `packages/shared-types/src/regeneration-types.ts:93`
- `packages/course-gen-platform/src/stages/stage5-generation/utils/course-structure-editor.ts:75`

4. `course_structure` схемы пока не содержат stable IDs для section/lesson:

- `packages/shared-types/src/generation-result.ts:297`
- `packages/shared-types/src/generation-result.ts:438`

5. В системе уже есть статусы Stage 6 и статус в `lesson_contents`, которые можно использовать как источник истины:

- `packages/shared-types/src/database.types.ts:3800`
- `packages/shared-types/src/database.types.ts:1404`

6. Model defaults и seed все еще тянут `mimo-v2-flash` как global default:

- `packages/shared-types/src/model-defaults.ts:23`
- `packages/course-gen-platform/src/config/config-seed.json:38`

---

## 2. Цели и границы

## 2.1 In scope

1. Убрать UI toggle Refine/Regenerate и перейти на auto-intent routing.
2. Перевести structural edits (`add/move/delete section/lesson`) на ID-based операции.
3. Снизить токены через skeleton + targeted context.
4. Ввести stable IDs в `course_structure` как переходный слой.
5. Подготовить и выполнить поэтапную миграцию на `course_nodes`.

## 2.2 Out of scope (в этой итерации)

1. Полная переработка Stage 6 pipeline.
2. CRDT/real-time multi-user editing.
3. Полный отказ от `course_structure` в одном релизе.

---

## 3. Критичные архитектурные решения (зафиксированы)

1. **Нет write-on-read в БД** для backfill ID.

- Разрешен только in-memory fallback для текущего запроса.
- Персистентный backfill делается отдельной миграцией/джобой.

2. **Мягкая эволюция chat API**.

- `intent` становится optional, но старые клиенты с `intent` продолжают работать.
- Сервер принимает оба режима в переходный период.

3. **Proposal слой расширяется, не заменяется одномоментно**.

- Добавляем `structural_operation`, но сохраняем существующие `field_updates`, `direct_action`, `lesson_patch`.

4. **Stage 6 readiness определяется status-first, content-second**.

- `generation_status` курса — первичный сигнал.
- `lesson_contents.status` используется для валидации/подстраховки.

5. **Fallback политика для моделей фазовая**.

- Для chat-фаз fallback управляется phase-конфигом.
- `global_default` не используется как скрытый fallback для chat routing.
- При отсутствии валидного phase config — явный 503 с трассировкой.

6. **`course_nodes` внедряется через dual-write и read flag**.

- Без одномоментного cutover.
- С parity-check и rollback switch.

---

## 4. Phase 0 — Stable IDs + Model Routing Foundation (2-4 дня)

## 4.1 Добавить IDs в типы и схемы

Изменения:

1. `Section` и `Lesson` получают `id?: string` (переходно optional).
2. Вводится root-level метка версии структуры, например `schema_version?: 2`.
3. Генерация Stage 5 создает `id` сразу для новых section/lesson.

Файлы:

1. `packages/shared-types/src/generation-result.ts`
2. `packages/course-gen-platform/src/stages/stage5-generation/...` (генерация структуры)
3. `packages/course-gen-platform/src/stages/stage5-generation/utils/course-structure-editor.ts`

## 4.2 Backfill стратегия (без write-on-read)

Изменения:

1. Добавить утилиту `ensureStableIdsInMemory(structure)`:

- используется в chat flow и apply flow;
- не пишет в БД автоматически.

2. Добавить отдельный idempotent backfill job/script:

- выбирает `courses.course_structure is not null`;
- добавляет отсутствующие IDs;
- пишет только если структура реально изменилась;
- использует optimistic concurrency (`updated_at` check).

3. Логировать метрики backfill:

- `courses_scanned`, `courses_updated`, `id_conflicts`, `retry_count`.

Файлы:

1. `packages/course-gen-platform/src/server/routers/generation/editing/...` (hook ensure in memory)
2. `packages/course-gen-platform/scripts/...` (backfill job)
3. `packages/course-gen-platform/tests/unit/...` (тесты backfill/ensure)

## 4.3 Model config для chat фаз

Изменения:

1. Зафиксировать phase names:

- `chat_intent_classification`
- `chat_stage_5_refinement`
- `chat_stage_6_refinement`

2. В `model-config-service`:

- phase-specific lookup обязателен для chat path;
- при missing/invalid phase config — 503 (явно), без silent fallback на global default.

3. `global_default` оставить для legacy/non-chat цепочек.

4. Добавить аудит-лог на fallback/503 для chat phase.

Файлы:

1. `packages/course-gen-platform/src/shared/llm/model-config-service.ts`
2. `packages/course-gen-platform/src/shared/llm/model-config-db.ts`
3. `packages/course-gen-platform/src/config/config-seed.json`
4. миграция seed-конфигов в `packages/course-gen-platform/supabase/migrations/...`

Гейт завершения Phase 0:

1. Новые Stage 5 структуры всегда содержат IDs.
2. Старые структуры читаются и обрабатываются без падений.
3. Chat phase model resolution не использует скрытый `global_default`.

---

## 5. Phase 1 — Toggle Removal + Auto-Intent (2-3 дня)

## 5.1 Контракт API (совместимый переход)

Изменения:

1. `chatRequestSchema.intent` -> optional.
2. Семантика:

- `intent='regenerate'` (legacy/explicit) => immediate regeneration route;
- `intent='refine'` или `intent` отсутствует => auto-intent classifier pipeline.

3. В БД поле `course_chat_messages.intent` остается nullable/legacy-compatible.

Файлы:

1. `packages/shared-types/src/chat-types.ts`
2. `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts`
3. `packages/web/components/generation-graph/hooks/useRefinement.ts`
4. `packages/web/components/generation-graph/panels/RefinementChat.tsx`

## 5.2 3-tier routing

Tier 0:

1. Новый `heuristics.ts` с RU/EN regex-гейтами:

- delete/move/update/get-info/full-regenerate.

Tier 1:

1. `classifier.ts` расширяется новым intent `FULL_REGENERATE`.
2. Confidence policy:

- `<0.6` => clarification response.

Tier 2:

1. Route:

- structural intents -> structural proposal flow;
- content intents -> targeted LLM;
- full regenerate -> async job.

Файлы:

1. `packages/course-gen-platform/src/shared/intent/heuristics.ts` (new)
2. `packages/course-gen-platform/src/shared/intent/classifier.ts`
3. `packages/course-gen-platform/src/server/routers/generation/editing/chat-intent-flow.ts`

## 5.3 Frontend

Изменения:

1. Удалить toggle кнопки refine/regenerate.
2. Оставить quick-actions, где нужно (например, explicit “Перегенерировать курс”).
3. Отображать clarification cards для ambiguous intent.

Гейт завершения Phase 1:

1. Пользователь может отправлять сообщение без выбора режима.
2. Regression: старые вызовы с `intent` продолжают работать.

---

## 6. Phase 2 — Structural Operations (4-6 дней)

## 6.1 Новый schema layer

Добавить `CourseOperation` и `structural_operation` proposal.

Минимальный набор операций:

1. `add_section`
2. `add_lesson`
3. `update_field`
4. `delete_element`
5. `move_element`

Контракт:

1. Все ID-ссылки по stable IDs.
2. Для новых узлов LLM использует `tempId` (`__new_1__`), сервер делает маппинг в реальные IDs.
3. Поля позиций только через `afterId|null` (никаких index путей).

Файлы:

1. `packages/shared-types/src/course-operations.ts` (new)
2. `packages/shared-types/src/chat-types.ts` (+proposal variant)

## 6.2 Apply sequencer

Изменения:

1. Новый `applySurgicalOperations()` (atomic batch semantics):

- preflight;
- tempId mapping;
- deterministic apply;
- renumber/duration recalc только в app code.

2. Ограничения безопасности:

- max operations: 15
- max delete operations: 3
- delete coverage <= 50% от lessons/sections

3. Validation:

- all referenced IDs exist;
- move target valid;
- no circular parent relation.

Файлы:

1. `packages/course-gen-platform/src/server/routers/generation/editing/surgical-operations.ts` (new)
2. `packages/course-gen-platform/src/server/routers/generation/editing/chat-apply-helpers.ts`

## 6.3 ID remap для LLM

Изменения:

1. Перед отправкой в LLM:

- `sec_hY7a3fRx` -> `sec_1`
- `lsn_kM9b2cQw` -> `lsn_3`

2. После ответа:

- обратный маппинг;
- проверка, что все remapped IDs существуют.

Файлы:

1. `packages/course-gen-platform/src/server/routers/generation/editing/surgical-id-remap.ts` (new)

## 6.4 Stage 6 при add lesson

Правило:

1. `generation_status in ('stage_6_complete', 'finalizing', 'completed')` => предлагать CTA “Сгенерировать контент для нового урока”.
2. Иначе — CTA не показывать.
3. Дополнительная проверка consistency:

- доля `lesson_contents` со `status in ('completed','review_required')` по lesson UUID нового курса.

Файлы:

1. `packages/course-gen-platform/src/server/routers/generation/editing/chat-intent-flow.ts`
2. `packages/web/components/generation-graph/...` (UI CTA)

Гейт завершения Phase 2:

1. `add/move/delete` выполняются без path/index.
2. Все операции проходят preflight и confirmation UI.

---

## 7. Phase 3 — Context Optimization (1-2 дня)

## 7.1 Skeleton + targeted context

Изменения:

1. В routing prompt вместо full structure:

- course skeleton (sections/lessons metadata);
- target fragment.

2. Полный `course_structure` не отправляется для локальных операций.

Файлы:

1. `packages/course-gen-platform/src/server/routers/generation/editing/chat-helpers.ts`
2. `packages/course-gen-platform/src/shared/intent/target-resolver.ts`

## 7.2 Prompt cache strategy

1. Static prefix: system/schema.
2. Semi-static: skeleton.
3. Dynamic: user message + short history.

Гейт завершения Phase 3:

1. Снижение input tokens для типового refine-запроса минимум на 60%.

---

## 8. Phase 4 — `course_nodes` Migration (6-9 дней)

## 8.1 Новая таблица

Базовая схема:

1. `id text pk`
2. `course_id uuid fk courses`
3. `parent_id text fk course_nodes`
4. `node_type enum('section','lesson')`
5. `order_key text not null`
6. `title text not null`
7. `data jsonb not null default '{}'`
8. `created_at/updated_at`

Ограничения и индексы:

1. `unique(course_id, parent_id, order_key)`
2. индекс `(course_id, parent_id, order_key)`
3. индекс `(course_id, id)`

## 8.2 Security (обязательно)

1. Включить RLS.
2. Политики зеркалят `courses` ownership/org access.
3. pgTAP тесты на read/write access.

## 8.3 Dual-write переход

Шаги:

1. Добавить конвертеры:

- `nestedJsonToCourseNodes()`
- `courseNodesToNestedJson()`

2. Включить `COURSE_NODES_DUAL_WRITE_ENABLED`:

- записи идут в JSON и `course_nodes`.

3. Parity checker:

- сравнивает восстановленную nested структуру с `courses.course_structure`.

4. После стабильности включить `COURSE_NODES_READ_ENABLED` для selected traffic.

5. Rollback:

- выключить read flag;
- продолжить читать из JSON.

## 8.4 Удаление legacy JSON

Только после:

1. 100% parity в мониторинге заданный период.
2. Все readers switched.
3. Пройден rollback drill.

Тогда:

1. удалить dual-write;
2. удалить `course_structure` зависимые readers;
3. опционально удалить/архивировать колонку `courses.course_structure`.

---

## 9. Feature flags и rollout

1. `CHAT_INTENT_ROUTING_ENABLED`
2. `CHAT_STRUCTURAL_PROPOSALS_ENABLED`
3. `COURSE_STABLE_IDS_REQUIRED` (guard after backfill)
4. `COURSE_NODES_DUAL_WRITE_ENABLED`
5. `COURSE_NODES_READ_ENABLED`

Rollout порядок:

1. Включать по одному флагу.
2. После каждого шага: метрики + error budget check.

---

## 10. Тестирование и верификация

## 10.1 Unit

1. `ensureStableIdsInMemory()`
2. Backfill idempotency и optimistic locking
3. Heuristics classification (ru/en)
4. `applySurgicalOperations()`
5. ID remap forward/backward
6. Phase-model resolution (chat-specific 503 path)

## 10.2 Integration

1. `generation.chat` без intent (auto)
2. legacy `intent='regenerate'`
3. structural proposal -> `applyProposal`
4. add lesson + Stage 6 CTA condition

## 10.3 DB / pgTAP

1. RLS для `course_nodes`
2. constraints/uniques for order_key
3. migration parity RPC/helpers (if added)

## 10.4 E2E (debug page)

Сценарии:

1. “Добавь урок про X после урока 2” -> structural proposal + apply
2. “Удали последнюю секцию” -> confirm -> apply
3. “Измени название курса на X” -> field update path
4. “Полностью переделай курс” -> async regenerate job
5. “Сколько уроков?” -> GET_INFO без generation model

## 10.5 Quality gates

1. `pnpm type-check`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm test:rls` (для миграционной части)

---

## 11. Обновленная оценка сроков

1. Phase 0: 2-4 дня
2. Phase 1: 2-3 дня
3. Phase 2: 4-6 дней
4. Phase 3: 1-2 дня
5. Phase 4: 6-9 дней

Итого:

1. До production-ready chat surgical flow (без полного cutover на `course_nodes`): 9-15 рабочих дней.
2. Полный переход на `course_nodes`: +6-9 рабочих дней.

---

## 12. Явные допущения

1. Проект допускает phased rollout через flags.
2. Backward compatibility нужна только на уровне текущего web client + backend API, но не для внешних публичных SDK.
3. Для Stage 6 критерий “complete” опирается на `generation_status` и дополнительно подтверждается `lesson_contents.status`.
4. Возможны временные dual-representations (`course_structure` + `course_nodes`) в течение нескольких релизов.

---

## 13. Что заменяет этот документ

1. Этот план дополняет и частично заменяет `docs/plans/mossy-greeting-trinket.md` как более безопасный и implementation-ready вариант.
2. Исходный документ сохраняется без изменений как исторический baseline.
