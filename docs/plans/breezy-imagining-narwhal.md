# Plan: Audit Report — Verification, Prioritization & Beads Task Creation

## Context

7 февраля 2026 был проведён масштабный аудит кодовой базы MegaCampusAI (Gemini CLI). Отчёт: `docs/AUDIT_REPORT.md`, 22 раздела, покрывает `@megacampus/web`, `@megacampus/course-gen-platform`, `@megacampus/shared-types`.

**Цель**: верифицировать каждое утверждение аудита (все 22 раздела), отсечь ложные срабатывания, и создать приоритизированные задачи в Beads.

**Результат верификации**: ~65% находок подтверждены, ~35% — ложные, неточные или не требуют действий.

---

## Раздел-по-разделу: что берём, что нет

### Раздел 1: Executive Summary

Общий обзор. Информационный. **Действий не требует.**

### Раздел 2: Critical Findings

| Пункт                                          | Статус                           | Действие                                   |
| ---------------------------------------------- | -------------------------------- | ------------------------------------------ |
| 2.1 env.ts security (Service Role Key)         | ПОДТВЕРЖДЕНО                     | Task 1                                     |
| 2.2 Project structure confusion (src/i18n)     | ПОДТВЕРЖДЕНО, но нецелесообразно | Отложено (см. ниже)                        |
| 2.3 Code duplication (Supabase clients, utils) | ЧАСТИЧНО                         | Не подтверждена реальная дупликация утилит |

### Раздел 3: Configuration & Tooling

| Пункт                                    | Статус       | Действие |
| ---------------------------------------- | ------------ | -------- |
| 3.1 TS version mismatch (5.3.3 vs 5.9.3) | ПОДТВЕРЖДЕНО | Task 9   |
| 3.2 ESLint warn trap                     | ПОДТВЕРЖДЕНО | Task 9   |

### Раздел 4: Detailed Recommendations

| Пункт                               | Статус                   | Действие                        |
| ----------------------------------- | ------------------------ | ------------------------------- |
| Phase 1.1 @t3-oss/env-nextjs        | Overkill                 | Task 1 (server-only достаточно) |
| Phase 1.2 Fix TS version            | ПОДТВЕРЖДЕНО             | Task 9                          |
| Phase 1.3 Consolidate web structure | Нецелесообразно          | Отложено                        |
| Phase 2.1 Create shared-utils       | Архитектурное решение    | Отложено                        |
| Phase 2.2 Expand shared-types       | Opportunity              | Отложено                        |
| Phase 3.1 AppError class            | Долгосрочная архитектура | Отложено                        |
| Phase 3.2 Server Actions vs tRPC    | Архитектурная дискуссия  | Отложено                        |

### Раздел 5: Performance Opportunities

| Пункт                              | Статус               | Действие                  |
| ---------------------------------- | -------------------- | ------------------------- |
| Tailwind 4 optimized compiler      | Информационный       | Нет действий              |
| staleTimes / caching в next.config | Требует исследования | Task 14 (bundle analysis) |
| Bundle analyzer                    | ПОДТВЕРЖДЕНО         | Task 14                   |

### Раздел 6: Deep Dive Package Analysis

| Пункт                              | Статус                                                                         | Действие                 |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| 6.1 Web structure (move to src/)   | Нецелесообразно                                                                | Отложено                 |
| 6.1 tRPC Client manual types drift | ПОДТВЕРЖДЕНО                                                                   | Task 11 (часть evaluate) |
| 6.1 lib/validation.ts дублирование | **ЛОЖНОЕ**: validation.ts импортирует из shared-types (строка 4), не дублирует | Нет действий             |
| 6.2 Root clutter scripts           | ПОДТВЕРЖДЕНО                                                                   | Task 4                   |
| 6.2 Shared logic overlap           | Не подтверждена дупликация                                                     | Нет действий             |
| 6.3 trpc-client-sdk orphaned       | ПОДТВЕРЖДЕНО                                                                   | Task 11                  |
| 6.4 shared-types здоров            | Подтверждено                                                                   | Нет действий             |

### Раздел 7: Технический долг

| Пункт                              | Статус                                                       | Действие             |
| ---------------------------------- | ------------------------------------------------------------ | -------------------- |
| 7.1 importance_score мёртвый код   | **ЛОЖНОЕ**: активно используется в Stage 4 budget allocation | Нет действий         |
| 7.1 database.generated.ts дубликат | **ЛОЖНОЕ**: ре-экспорт из shared-types, 35 файлов зависят    | Нет действий         |
| 7.1 Hardcoded UUIDs в скриптах     | ПОДТВЕРЖДЕНО                                                 | Task 4 (перемещение) |
| 7.2 .claude copy/                  | **ЛОЖНОЕ**: не существует                                    | Нет действий         |
| 7.2 .test.ts.backup                | ПОДТВЕРЖДЕНО                                                 | Task 3               |
| 7.3 @googleapis/drive, bcryptjs    | ПОДТВЕРЖДЕНО                                                 | Task 5               |

### Раздел 8: Specific Cleanup Actions

| Пункт                             | Статус                                             | Действие     |
| --------------------------------- | -------------------------------------------------- | ------------ |
| 8.1 Files to DELETE               | ПОДТВЕРЖДЕНО (все файлы существуют)                | Task 3       |
| 8.2 Phase 6 RAG @deprecated       | **ЛОЖНОЕ**: нет @deprecated маркеров, активный код | Нет действий |
| 8.2 Legacy tRPC Client deprecated | ПОДТВЕРЖДЕНО (intentional migration)               | Task 11      |

### Раздел 9: Configuration & Infrastructure

| Пункт                                           | Статус                                                                        | Действие                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------- |
| 9.1 .env.example N8N keys                       | ПОДТВЕРЖДЕНО (N8N_API_URL/KEY deprecated, но N8N_WEBHOOK_SECRET ещё активен!) | Task 5                      |
| 9.1 Docker compose confusion                    | Нет confusion: 6 файлов для разных окружений                                  | Нет действий                |
| 9.2 Large files (coverage, uploads, daemon.log) | Файлы существуют локально, но НЕ tracked в git                                | Task 5 (.gitignore hygiene) |

### Раздел 10: Deep Architectural & Security

| Пункт                                     | Статус                                                      | Действие          |
| ----------------------------------------- | ----------------------------------------------------------- | ----------------- |
| 10.1 Zustand dual versions                | ПОДТВЕРЖДЕНО                                                | Task 12           |
| 10.1 @googleapis/drive dead               | ПОДТВЕРЖДЕНО                                                | Task 5            |
| 10.1 web-push orphaned                    | ПОДТВЕРЖДЕНО                                                | Tasks 3, 5        |
| 10.1 ioredis server-only guard            | ПОДТВЕРЖДЕНО (используется rate-limit.ts, draft-session.ts) | Task 1 (расширен) |
| 10.1 ioredis "ghost dependency"           | **ЛОЖНОЕ**: активно используется!                           | Нет действий      |
| 10.2 RLS USING(true)                      | ПОДТВЕРЖДЕНО (6 шт, не 3)                                   | Task 2            |
| 10.2 Orphaned storage data (zombie files) | ПОДТВЕРЖДЕНО: нет auto-trigger при удалении курсов          | Task 15 (новая)   |
| 10.3 docs/archieve typo                   | ПОДТВЕРЖДЕНО                                                | Task 5            |

### Раздел 11: Performance & Efficiency Roadmap

| Пункт                              | Статус                                 | Действие     |
| ---------------------------------- | -------------------------------------- | ------------ |
| 11.1 Parallel LLM calls (p-limit)  | Фича, не аудит                         | Отложено     |
| 11.1 Query consolidation (JOINs)   | Оптимизация, не аудит                  | Отложено     |
| 11.1 LLM caching (Redis)           | Фича, не аудит                         | Отложено     |
| 11.2 optimizePackageImports        | ПОДТВЕРЖДЕНО                           | Task 14      |
| 11.2 Image variants reduction      | Минорная оптимизация                   | Task 14      |
| 11.2 mermaid/elkjs dynamic loading | **ЛОЖНОЕ**: elkjs уже в Web Worker     | Нет действий |
| 11.3 Linting in CI                 | Уже сделано (ignoreDuringBuilds: true) | Нет действий |
| 11.3 Docker resource pinning       | ПОДТВЕРЖДЕНО                           | Task 14      |

### Раздел 12: Git History Security Scan

| Пункт                               | Статус                       | Действие     |
| ----------------------------------- | ---------------------------- | ------------ |
| 12.1 OpenAI/Supabase keys в истории | False positives подтверждены | Нет действий |
| 12.2 BFG for open sourcing          | Ситуативно, не планируется   | Отложено     |

### Раздел 13: Low-Level Resource & Memory Audit

| Пункт                                        | Статус                                            | Действие     |
| -------------------------------------------- | ------------------------------------------------- | ------------ |
| 13.1 useEffect cleanup leaks (GraphView.tsx) | **ЛОЖНОЕ**: все 14 хуков имеют корректный cleanup | Нет действий |
| 13.1 useAutoSave.ts leaks                    | **ЛОЖНОЕ**: файл не существует                    | Нет действий |
| 13.1 Zustand store bloat                     | Исследование необходимо                           | Отложено     |
| 13.2 Redis hygiene (removeOnComplete)        | Подтверждено: уже хорошо                          | Нет действий |
| 13.2 elkjs Web Worker                        | Подтверждено: уже хорошо                          | Нет действий |
| 13.2 Large PDF stream processing             | Спекулятивно                                      | Нет действий |
| 13.3 DB connection pooling                   | Спекулятивно                                      | Нет действий |

### Раздел 14: Dependency Health & Updates

| Пункт                            | Статус                             | Действие     |
| -------------------------------- | ---------------------------------- | ------------ |
| 14.1 Next.js 16                  | ИСКЛЮЧИТЬ (breaking)               | Нет действий |
| 14.1 ESLint 10                   | ИСКЛЮЧИТЬ (breaking)               | Отложено     |
| 14.1 Zod 4                       | ИСКЛЮЧИТЬ (breaking)               | Нет действий |
| 14.1 React 19.2.4                | ПОДТВЕРЖДЕНО (safe patch)          | Task 13      |
| 14.2 bcryptjs, @googleapis/drive | ПОДТВЕРЖДЕНО                       | Task 5       |
| 14.2 ioredis ghost               | **ЛОЖНОЕ**: НЕ ghost, используется | Нет действий |
| 14.3 archiver single-use         | Корректное использование           | Нет действий |

### Раздел 15: Detailed Dependency Risk Assessment

| Пункт                     | Статус        | Действие     |
| ------------------------- | ------------- | ------------ |
| 15.1 Next.js lock to 15.x | Уже корректно | Нет действий |
| 15.1 React safe patch     | ПОДТВЕРЖДЕНО  | Task 13      |
| 15.2 Zod pin to v3        | Уже корректно | Нет действий |
| 15.2 Zustand dual version | ПОДТВЕРЖДЕНО  | Task 12      |
| 15.3 ESLint 10            | Отложить      | Отложено     |
| 15.3 TS standardize       | ПОДТВЕРЖДЕНО  | Task 9       |

### Раздел 16: AI & LLM Stack Analysis

| Пункт                     | Статус       | Действие     |
| ------------------------- | ------------ | ------------ |
| 16.1 OpenAI SDK 6.13→6.18 | ПОДТВЕРЖДЕНО | Task 13      |
| 16.2 LangChain updates    | ПОДТВЕРЖДЕНО | Task 13      |
| 16.3 tiktoken stable      | Нет действий | Нет действий |

### Раздел 17: UI & Specialized Components

| Пункт                            | Статус                             | Действие |
| -------------------------------- | ---------------------------------- | -------- |
| 17.1 @paper-design/shaders-react | Pre-stable, рискованно             | Отложено |
| 17.1 framer-motion               | ПОДТВЕРЖДЕНО                       | Task 13  |
| 17.2 lucide-react                | Минорное                           | Task 13  |
| 17.2 react-player replacement    | Требует исследования               | Отложено |
| 17.3 react-resizable-panels 3→4  | BREAKING (major)                   | Отложено |
| 17.3 isomorphic-dompurify 3.x    | Активно используется, v2 стабильна | Отложено |

### Раздел 18: Hardcode & i18n Audit

| Пункт                              | Статус                  | Действие |
| ---------------------------------- | ----------------------- | -------- |
| 18.1 Hardcoded localhost URLs      | ПОДТВЕРЖДЕНО (33 файла) | Task 10  |
| 18.2 Profile page Russian hardcode | ПОДТВЕРЖДЕНО            | Task 6   |

### Раздел 19: Detailed i18n & Localization

| Пункт                                 | Статус                 | Действие          |
| ------------------------------------- | ---------------------- | ----------------- |
| 19.1 Profile page Cyrillic            | ПОДТВЕРЖДЕНО           | Task 6            |
| 19.1 Mocks page Cyrillic              | Допустимо для моков    | Нет действий      |
| 19.2 export-import.tsx English        | Admin-only, намеренно  | Нет действий      |
| 19.2 trace-viewer.tsx "Error" badge   | ПОДТВЕРЖДЕНО (минорно) | Task 8 (расширен) |
| 19.3 generation-graph locale drilling | ПОДТВЕРЖДЕНО           | Task 8            |
| 19.4 Backend validators Russian       | ПОДТВЕРЖДЕНО           | Task 7            |

### Раздел 20: Component & Type Deduplication

| Пункт                                  | Статус                                   | Действие     |
| -------------------------------------- | ---------------------------------------- | ------------ |
| 20.1 Zod schema fragmentation          | Opportunity, не баг                      | Отложено     |
| 20.2 database.generated.ts delete      | **ЛОЖНОЕ**: 35 файлов зависят            | Нет действий |
| 20.3 research-flag-detector.ts Russian | **ЛОЖНОЕ**: строки в LLM-промптах, не UI | Нет действий |
| 20.3 validators.ts Russian             | ПОДТВЕРЖДЕНО                             | Task 7       |

### Раздел 21: Type Integrity & Final Technical Debt

| Пункт                                        | Статус                                         | Действие        |
| -------------------------------------------- | ---------------------------------------------- | --------------- |
| 21.1 as any: 159 шт                          | **НЕТОЧНО**: реально ~731                      | Task 16 (новая) |
| 21.1 @ts-ignore: 351 шт                      | **НЕТОЧНО**: реально ~30 (аудит считал .next/) | Task 16         |
| 21.2 ModuleDashboard.tsx TODOs               | **ЛОЖНОЕ**: файл чист                          | Нет действий    |
| 21.2 Stage6InspectorContent.tsx TODOs        | **ЛОЖНОЕ**: файл не найден                     | Нет действий    |
| 21.2 initialize.ts TODOs                     | Intentional Stage 0 placeholders               | Нет действий    |
| 21.3 tRPC error shape lost in fetchWithRetry | **ЛОЖНОЕ**: shape корректно сохраняется        | Нет действий    |

### Раздел 22: Global Issue Map & Heatmap

| Пункт                                       | Статус         | Действие |
| ------------------------------------------- | -------------- | -------- |
| 22.1 as any heatmap                         | Информационный | Task 16  |
| 22.2 Hardcoded localhost list               | ПОДТВЕРЖДЕНО   | Task 10  |
| 22.3 gitignore patterns (coverage, uploads) | ПОДТВЕРЖДЕНО   | Task 5   |

---

## Ложные срабатывания аудита — итог (15 шт)

| #   | Утверждение аудита                                | Реальность                                               |
| --- | ------------------------------------------------- | -------------------------------------------------------- |
| 1   | `.claude copy/` — дубликат конфигурации           | **НЕ СУЩЕСТВУЕТ**                                        |
| 2   | `phase-6-rag-planning.ts` помечен `@deprecated`   | **Нет маркеров**, активный код                           |
| 3   | `database.generated.ts` — дубликат, удалить       | **Ре-экспорт** из shared-types, 35 файлов зависят        |
| 4   | Zod-схемы в web дублируют shared-types            | **Независимые** схемы                                    |
| 5   | `export-import.tsx` — English hardcode            | Admin-панель, **намеренно**                              |
| 6   | `as any`: 159 шт                                  | Реально **~731** (недосчитал 5x)                         |
| 7   | `@ts-ignore`: 351 шт                              | Реально **~30** (считал .next/ файлы)                    |
| 8   | `importance_score` мёртвый код                    | **Активно используется** в Stage 4 budget allocation     |
| 9   | `ioredis` ghost dependency                        | **Активно используется** rate-limit.ts, draft-session.ts |
| 10  | useEffect leaks в GraphView.tsx                   | **Все 14 хуков** имеют корректный cleanup                |
| 11  | `useAutoSave.ts` leaks                            | **Файл не существует**                                   |
| 12  | `research-flag-detector.ts` Russian hardcode      | Строки в **LLM-промптах**, не UI                         |
| 13  | Residual TODOs (ModuleDashboard, Stage6Inspector) | Файлы **чисты** или не существуют                        |
| 14  | `initialize.ts` TODOs — техдолг                   | **Intentional** Stage 0 placeholders                     |
| 15  | tRPC fetchWithRetry теряет error shape            | Error shape **корректно сохраняется**                    |

---

## Задачи для Beads (16 шт)

### Sprint 1: Security & Quick Wins (P1-P2, ~1-2 дня)

#### Task 1 — `[SEC] Add server-only import` (P1, S)

- **Type**: bug | **Labels**: security, frontend, nextjs
- **Суть**: Несколько серверных файлов экспортируют чувствительные данные без `import 'server-only'`. Пакет `server-only` есть в package.json, но не импортирован нигде кроме `lib/logger.ts`. Без него Client Component может случайно импортировать файл с секретами.
- **Scope**: Добавить `import 'server-only'` в:
  - `packages/web/lib/env.ts` (содержит SUPABASE_SERVICE_ROLE_KEY)
  - `packages/web/lib/supabase-admin.ts` (серверный Supabase клиент)
  - `packages/web/lib/redis-client.ts` (ioredis, Node.js only — middleware уже удалила его из Edge)
- Проверить `pnpm build`.
- **Subagent**: vulnerability-fixer

#### Task 2 — `[SEC] Review RLS USING(true)` (P1, M)

- **Type**: chore | **Labels**: database, security, migrations
- **Суть**: 6 миграций (аудит нашёл 3, мы нашли 6) имеют `USING (true)` — открытый доступ для всех authenticated:
  - `20250111_jwt_custom_claims.sql:103`
  - `20251222150000_add_log_issue_status_table.sql:285`
  - `20260129120000_benchmark_scoring_v2.sql:114`
  - `20260128201300_create_benchmark_tables.sql:155, 159`
  - `20260113150000_enhance_error_logs_problem_id.sql:40`
- **Scope**: Для каждой подтвердить намеренность или создать корректирующую миграцию.
- **Subagent**: database-architect

#### Task 3 — Delete dead files (P2, S)

- **Type**: chore | **Labels**: cleanup
- **Scope** (все файлы верифицированы, ноль импортов):
  - `packages/course-gen-platform/supabase/migrations/20251125120000_fix_lesson_contents_refinement.sql.obsolete`
  - `packages/course-gen-platform/tests/integration/document-processing-worker.test.ts.backup`
  - `packages/course-gen-platform/tests/integration/stage4-minimum-lesson-constraint.test.ts.DISABLED`
  - `packages/course-gen-platform/tests/integration/course-structure.test.ts.skip`
  - `packages/web/components/generation-graph/panels/stage6/dashboard/Stage6ControlTower.example.tsx`
  - `packages/web/lib/web-push.ts` (ноль импортов)
- **Subagent**: прямое выполнение

#### Task 4 — Move maintenance scripts (P2, S)

- **Type**: chore | **Labels**: cleanup, backend
- **Scope**: Переместить 5 скриптов из корня `packages/course-gen-platform/` в `scripts/maintenance/`:
  `requeue-failed-pdfs.mjs`, `requeue-single-pdf.mjs`, `cleanup-test-users.mjs`, `add-remaining-jobs.mjs`, `test-add-job.mjs`
- Заменить hardcoded UUIDs на переменные окружения.
- **Subagent**: прямое выполнение

#### Task 5 — Remove unused deps + cleanup (P2, S) — depends on Task 3

- **Type**: chore | **Labels**: frontend, cleanup
- **Scope**:
  1. Удалить из `packages/web/package.json`: `@googleapis/drive`, `bcryptjs`, `web-push`, `@types/web-push` (ноль импортов у всех)
  2. **НЕ удалять** `ioredis` (используется rate-limit.ts, draft-session.ts) и `server-only` (Task 1 добавит импорт)
  3. Добавить `.beads/*.log` в `.gitignore` (файл не tracked, но профилактика)
  4. Переименовать `docs/archieve` → `docs/archive`
  5. Удалить `N8N_API_URL` и `N8N_API_KEY` из `.env.example` (management API deprecated)
  6. Очистить мёртвый `N8N_WEBHOOK_URL` из `lib/env.ts` (интерфейс, loadConfig, ENV export), `lib/debug.ts`, `app/api/health/route.ts`. **НЕ трогать** `N8N_WEBHOOK_SECRET` и `N8N_CANCEL_WEBHOOK_URL` — они ещё используются в cancel/route.ts и webhooks/coursegen/route.ts
  7. `pnpm install`
- **Важно**: `coverage/` уже в .gitignore (строка 42), файл coverage-final.json не tracked. `.beads/daemon.log` тоже не tracked.
- **Subagent**: прямое выполнение

### Sprint 2: i18n (P2, ~2-3 дня)

#### Task 6 — `[i18n] Profile page` (P2, M)

- **Type**: bug | **Labels**: frontend, i18n, nextjs
- **Файлы**: `app/[locale]/profile/page.tsx`, `app/[locale]/profile/layout.tsx`
- **Суть**: Обширный hardcode на русском: error-сообщения (`'Не удалось загрузить профиль...'`), toast-уведомления (`'Аватар успешно обновлен'`), лейблы табов, confirm-диалоги, title в layout (`'Профиль | MegaCampusAI'`). Англоязычные пользователи видят русский текст.
- **Scope**: Извлечь все строки в translation files через `useTranslations()`.
- **Subagent**: nextjs-ui-designer

#### Task 7 — `[i18n] Backend validators` (P2, M)

- **Type**: bug | **Labels**: backend, i18n, pipeline, stages
- **Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/utils/validators.ts`
- **Суть**: `PROGRESS_MESSAGES` (`'Проверка документов...'`, `'Базовая категоризация курса...'`) и ошибки в `formatErrorMessage()` на русском. Пользователи с English locale видят русский прогресс генерации.
- **Scope**: Перенести в `BACKEND_TRANSLATIONS` из `shared/i18n/messages.ts` или использовать locale-нейтральные ключи.
- **НЕ трогать** `research-flag-detector.ts` (русские строки там — примеры в LLM-промптах, не UI).
- **Subagent**: stage-pipeline-specialist

#### Task 8 — `[i18n] generation-graph + trace-viewer` (P2, M)

- **Type**: chore | **Labels**: frontend, i18n, nextjs
- **Суть**: Часть компонентов используют `useTranslations()` (правильно), часть — prop `locale` с тернарными переводами (неправильно).
- **Компоненты для рефакторинга**: Stage5ProcessTab, OutputTab, Stage6QualityTab, Stage6InputTab, Stage6InspectorContent, SegmentedPillTrack
- **Дополнительно**: `trace-viewer.tsx` — Badge "Error" и fallback-текст ("No Trace Selected") без i18n
- **Subagent**: nextjs-ui-designer

### Sprint 3: Code Quality (P3, ~2-3 дня)

#### Task 9 — Standardize TS + ESLint (P3, S)

- **Type**: chore | **Labels**: types, config
- **Суть**: Root `^5.3.3` vs web `^5.9.3` — стандартизировать. ESLint `no-explicit-any` и `no-floating-promises` на `warn` → промоутить.
- **Scope**: Фаза 1 — выровнять TS. Фаза 2 — посчитать нарушения ESLint, затем промоутить в error.
- **Subagent**: прямое выполнение

#### Task 10 — Hardcoded localhost (P3, M)

- **Type**: chore | **Labels**: frontend, config
- **Суть**: 33 файла в `packages/web` содержат hardcoded `localhost:3000`, `localhost:3456`, `localhost:8000`.
- **Конкретные файлы** (из аудита): CourseVisualsManager.tsx, useAutoCard.ts, layout.tsx, useEnrichmentGeneration.ts, coursegen/\*/route.ts, admin/health/route.ts
- **Scope**: Заменить runtime hardcodes на `ENV.NEXT_PUBLIC_APP_URL` / `ENV.COURSEGEN_BACKEND_URL`. Исключить: defaults в env-конфиге, комментарии, тестовые fixtures.
- **Subagent**: fullstack-nextjs-specialist

#### Task 11 — Evaluate trpc-client-sdk (P3, S)

- **Type**: chore | **Labels**: backend, cleanup
- **Суть**: `packages/trpc-client-sdk/` — полноценный пакет с error utilities, но web его не импортирует. Web использует свой custom client с deprecated legacy API (lines 710-783).
- **Решение**: deprecate trpc-client-sdk и очистить legacy код из lib/trpc/client.ts, ИЛИ интегрировать SDK.
- **Subagent**: fullstack-nextjs-specialist

#### Task 12 — Zustand dual versions (P3, S)

- **Type**: chore | **Labels**: frontend, cleanup
- **Суть**: `pnpm-lock.yaml` содержит Zustand v4.5.7 и v5.0.9. Код корректно использует v5 syntax. v4 — фантом от транзитивной зависимости.
- **Scope**: `pnpm why zustand`, добавить `pnpm.overrides` если нужно.
- **Subagent**: прямое выполнение

### Sprint 4: Maintenance (P3-P4, по необходимости)

#### Task 13 — Safe dependency updates (P3, M)

- **Type**: chore | **Labels**: dependencies
- **Scope** (только minor/patch):
  - `openai`: 6.13 → 6.18
  - `@langchain/core`: 1.1.8 → 1.1.19
  - `@langchain/openai`: 1.2.0 → 1.2.5
  - `framer-motion`: 12.23 → 12.33
  - `lucide-react`: 0.554 → 0.563
  - `react`: 19.2.3 → 19.2.4 (если вышел)
- **ИСКЛЮЧИТЬ** (breaking/risky): Next.js 16, ESLint 10, Zod 4, react-resizable-panels 3→4, @paper-design/shaders-react (pre-stable), isomorphic-dompurify 3.x
- **Subagent**: прямое выполнение

#### Task 14 — Performance optimizations (P4, M)

- **Type**: chore | **Labels**: frontend, devops, performance
- **Scope**:
  1. `optimizePackageImports`: добавить `@radix-ui/react-*`, `date-fns`
  2. Docker: `deploy.resources.limits` для worker-сервиса в `docker-compose.production.yml`
  3. Настроить `@next/bundle-analyzer` для on-demand анализа
  4. Рассмотреть уменьшение `deviceSizes` с 8 до 5 вариантов
- **Subagent**: fullstack-nextjs-specialist

#### Task 15 — Supabase Storage cleanup on course deletion (P3, M) — НОВАЯ

- **Type**: bug | **Labels**: database, backend
- **Суть**: При удалении курсов CASCADE удаляет строки из БД (documents, sections, lessons), но файлы в Supabase Storage остаются "зомби". `unified-storage-service.ts` имеет `deleteEnrichmentAsset()`, но нет триггера при удалении курса.
- **Scope**: Добавить cleanup hook/trigger при удалении курса, который удаляет ассоциированные файлы из Storage.
- **Subagent**: fullstack-nextjs-specialist

#### Task 16 — Type safety: as any / @ts-ignore audit and policy (P4, M) — НОВАЯ

- **Type**: chore | **Labels**: types, config
- **Суть**: ~731 `as any` и ~30 `@ts-ignore` в кодовой базе. Аудит дал неточные числа (159 и 351), но проблема реальна. Основные offenders — тестовые файлы (document-processing-worker.test.ts: 65, section-batch-generator.test.ts: 49).
- **Scope**:
  1. Провести точный аудит: сколько в production-коде vs тестах
  2. Конвертировать `@ts-ignore` → `@ts-expect-error` (с причиной)
  3. Установить pre-commit hook против новых `@ts-ignore`
- **Subagent**: typescript-types-specialist

---

## Граф зависимостей

```
Task 1 (server-only)   ──┐
Task 2 (RLS review)    ──┤── Sprint 1 (параллельно)
Task 3 (delete files)  ──┤
Task 4 (move scripts)  ──┘
                           │
Task 5 (unused deps)   ───── depends on Task 3
                           │
Task 6 (i18n profile)  ──┐
Task 7 (i18n backend)  ──┤── Sprint 2 (параллельно)
Task 8 (i18n graph)    ──┘
                           │
Task 9 (TS/ESLint)     ──┐
Task 10 (localhost)    ──┤── Sprint 3 (параллельно)
Task 11 (trpc-sdk)     ──┤
Task 12 (zustand)      ──┘
                           │
Task 13 (deps)         ───── лучше после Task 12
Task 14 (perf)         ──┐
Task 15 (storage)      ──┤── Sprint 4 (параллельно)
Task 16 (type safety)  ──┘
```

---

## Сводная таблица

| #   | P   | Type  | Название                                                                  | Size | Labels                  |
| --- | --- | ----- | ------------------------------------------------------------------------- | ---- | ----------------------- |
| 1   | P1  | bug   | [SEC] Add server-only import (env.ts, supabase-admin.ts, redis-client.ts) | S    | security, frontend      |
| 2   | P1  | chore | [SEC] Review RLS USING(true) — 6 миграций                                 | M    | database, security      |
| 3   | P2  | chore | Delete dead files (6 файлов)                                              | S    | cleanup                 |
| 4   | P2  | chore | Move maintenance scripts to scripts/maintenance/                          | S    | cleanup, backend        |
| 5   | P2  | chore | Remove unused deps + gitignore + archieve + env.example                   | S    | frontend, cleanup       |
| 6   | P2  | bug   | [i18n] Profile page hardcoded Russian                                     | M    | frontend, i18n          |
| 7   | P2  | bug   | [i18n] Backend validators hardcoded Russian                               | M    | backend, i18n, pipeline |
| 8   | P2  | chore | [i18n] generation-graph + trace-viewer useTranslations()                  | M    | frontend, i18n          |
| 9   | P3  | chore | Standardize TS version + ESLint warn→error plan                           | S    | types, config           |
| 10  | P3  | chore | Replace hardcoded localhost URLs (33 files)                               | M    | frontend, config        |
| 11  | P3  | chore | Evaluate trpc-client-sdk: deprecate or integrate                          | S    | backend, cleanup        |
| 12  | P3  | chore | Zustand dual versions cleanup in lockfile                                 | S    | frontend, cleanup       |
| 13  | P3  | chore | Safe dep updates (openai, langchain, framer-motion, lucide)               | M    | dependencies            |
| 14  | P4  | chore | Performance: optimizePackageImports, Docker limits, bundle analyzer       | M    | frontend, devops        |
| 15  | P3  | bug   | Supabase Storage cleanup trigger on course deletion                       | M    | database, backend       |
| 16  | P4  | chore | Type safety: as any / @ts-ignore audit and policy                         | M    | types, config           |

**Итого**: 16 задач (2 P1, 6 P2, 5 P3, 3 P4)

---

## Отложено (архитектурные решения, отдельная дискуссия)

Эти рекомендации аудита подтверждены, но требуют отдельного архитектурного обсуждения:

| Пункт                                                      | Причина отложения                                       |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| Consolidate web structure (move app/components/lib → src/) | Сломает все import paths, высокий риск, низкая ценность |
| Create @megacampus/shared-utils package                    | Нет подтверждённой реальной дупликации утилит           |
| Standardize Error Handling (AppError class)                | Долгосрочная архитектура                                |
| Server Actions vs tRPC boundary                            | Архитектурная дискуссия                                 |
| Parallel LLM calls with p-limit (Stage 4/5)                | Feature, не аудит-задача                                |
| Query consolidation (JOINs in tRPC)                        | Оптимизация, отдельная инициатива                       |
| LLM caching in Redis                                       | Feature, не аудит-задача                                |
| react-resizable-panels 3→4                                 | Breaking major, отдельный спринт                        |
| react-player → @vidstack/react                             | Требует исследования                                    |
| isomorphic-dompurify 2→3                                   | Работает, v3 не даёт существенных преимуществ           |
| @paper-design/shaders-react 0.0.46→0.0.71                  | Pre-stable, высокий риск                                |
| ESLint 9→10                                                | Major, плагины могут сломаться                          |
| BFG Repo-Cleaner (перед open sourcing)                     | Не планируется open source                              |
| Zustand store bloat (clear stale data)                     | Требует профилирования                                  |

---

## Verification

После создания всех задач:

1. `bd list` — убедиться, что все 16 задач созданы
2. Проверить зависимость Task 5 → Task 3
3. `bd ready` — убедиться, что P1 задачи доступны для работы

## Implementation

1. Последовательно выполнить `bd create` для каждой из 16 задач
2. Установить зависимость: Task 5 зависит от Task 3
3. Коммит: audit report перемещён в docs/AUDIT_REPORT.md
