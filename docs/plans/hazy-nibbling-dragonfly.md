# Plan: Обработка логов ошибок

## Context

В системе ~84K необработанных error_logs и 51 generation_trace. Анализ на 9 февраля показал:

- **stage**: 77K — весь шлейф от Redis MISCONF аварии Jan 21-24. **0 новых за последние 4 дня.** Production стабильный.
- **local/test**: 6K — тесты пишут в production DB (143 сегодня). Главная проблема засорения.
- **dev**: 1K — тестовая генерация на dev-сервере. 6 новых сегодня (все warnings, auto_muted паттерны).
- **3 подтверждённых бага** в коде (все на dev, все воспроизводимы)

## Классификация ошибок

### Группа A: Bulk resolve (не требуют кодовых исправлений)

| #   | Fingerprint                        | Сообщение                            | Кол-во | Причина резолва                                                                           |
| --- | ---------------------------------- | ------------------------------------ | ------ | ----------------------------------------------------------------------------------------- |
| A1  | `7743ae5415523e1a1fbf5b582fd82550` | Worker error (Redis MISCONF)         | 37,955 | Исторический инцидент Jan 21-24, Redis disk full. Устранён. Feb ошибки — тесты.           |
| A2  | `fc22b2db45fd8fba6392d6f2d9bb968a` | Stage 6 worker error (Redis MISCONF) | 38,286 | То же + Feb: `could not renew lock` от тестов (env=NULL)                                  |
| A3  | `a6ff4e93fa0084f164e5c99e96ec97aa` | Failed to log generation trace       | 463    | Уже в auto_muted паттернах. Pool pressure during generation.                              |
| A4  | `49d6bf3960ab467bcad18200401ab83d` | ModelConfigBunker LKG file write     | 63     | Уже в auto_muted паттернах. Race condition с atomic write.                                |
| A5  | `959f605b56741af9ba4a3c56d157175b` | Queue error                          | 48     | Redis-related, Jan 20-21 + 1 тестовый в Feb                                               |
| A6  | `462eda76a08617d7f199c15006d054e2` | Job processing failed (ENOENT)       | 31     | Docker volume mount issue на dev. Файлы не видны в контейнере. Инфраструктурная проблема. |
| A7  | `b348ce0913e97c84bd6de1fe37ec7702` | ModelConfigBunker DB sync failed     | 18     | External service sync issue, has retry with backoff.                                      |
| A8  | `dbc3d5f9d2ef2ec92eb2ade22188bbe3` | FSM init DB transaction failed       | 27     | Все от тестов (entity `00000000-*`, idempotency `*-test-*`).                              |
| A9  | `225f49cba4ee65818a9a65b9782c5aa6` | Warning: language consistency        | 769    | Heuristic false positives — Cyrillic в Russian курсах определяется как "foreign".         |
| A10 | `1a513f33ac138135c3a75d6630ff6706` | Mermaid pipeline: fallback           | 94     | Уже в auto_muted паттернах.                                                               |
| A11 | `ee29e6a211086d784e3737576cc95b64` | Orphaned job recovering              | 62     | Expected behavior — job recovery mechanism.                                               |
| A12 | `6a7bb9561174f55c715e1e99464be069` | Primary model attempt failed         | 16     | Cascading repair — fallback to next model.                                                |
| A13 | `c3361cb5d27c6de00e9966fe35f20fcc` | Phase5Assembly fallback              | 15     | Graceful fallback, expected behavior.                                                     |
| A14 | `9eb05e51241d4074ff39b6105fa5c0ff` | ModelConfigBunker LKG update         | 447    | Уже в auto_muted паттернах.                                                               |
| A15 | `182adf27c8e3a15c92a8fadfa661b4a9` | Lock contention                      | 2      | Course already being processed, expected concurrency guard.                               |
| A16 | —                                  | Local environment (NULL)             | 6,251  | Все локальные тесты/разработка.                                                           |

### Группа B: Подтверждённые баги (актуальны на 9 февраля)

| #      | Сообщение                                      | Кол-во | Env       | Последнее | Что исправить                                                                        |
| ------ | ---------------------------------------------- | ------ | --------- | --------- | ------------------------------------------------------------------------------------ |
| **B1** | Section index out of bounds (0-7)              | 6      | dev       | Feb 7     | **Stage 5: `total_sections` > `sections_breakdown.length`** — воспроизводимый баг    |
| **B2** | Cannot apply updates: analysis_result is empty | 2      | dev       | Feb 7     | **Defensive check** — уже работает правильно, но нужен UX guard (пометить to_verify) |
| **B3** | Job failed: JSON parsing / Validation          | 21     | dev+stage | Feb 7     | **Две подпроблемы:** JSON repair (graceful, resolve) + suggested_answers (проверить) |

### Группа C: generation_trace ошибки

Все 51 ошибок generation_trace — от одного курса `d4c22334-5de8-46bb-9d7b-f604ceb80927` (stage_5 fails) и `0bd64671-8c0c-4d11-8196-fdfcb465a6d1` (pedagogical_patterns validation). Связаны с багами B1 и стейлом данных после удаления `pedagogical_patterns`.

## План действий

### Шаг 1: Bulk resolve группы A + C (SQL)

Резолвим по каждому fingerprint группы A отдельным INSERT (чтобы не упереться в unique constraint на fingerprint). Для каждого fingerprint — один INSERT с конкретным notes.

Затем bulk resolve local (env=NULL) и generation_trace ошибки.

### Шаг 2: Предотвращение тестовых ошибок в логах (приоритет!)

**Проблема:** Тесты (unit + integration) подключаются к **production Supabase** и пишут ошибки в `error_logs` с `environment = NULL`. Это засоряет лог тысячами записей.

**Текущее поведение:**

- `.env` содержит production SUPABASE_URL/KEY — тесты используют ту же БД
- `detectEnvironment()` в `src/shared/logger/utils.ts` возвращает NULL (нет APP_URL в тестах)
- Нет проверки NODE_ENV в логгере

**Решение: Добавить `environment = 'test'` + auto_mute**

1. **Миграция**: расширить CHECK constraint — добавить `'test'`

   ```sql
   ALTER TABLE error_logs DROP CONSTRAINT IF EXISTS error_logs_environment_check;
   ALTER TABLE error_logs ADD CONSTRAINT error_logs_environment_check
     CHECK (environment IN ('dev', 'stage', 'test'));
   ```

2. **Обновить `detectEnvironment()`** в `src/shared/logger/utils.ts`:

   ```typescript
   if (process.env.NODE_ENV === 'test') return 'test';
   ```

3. **Обновить тип** `LogEnvironment` в `src/shared/logger/types.ts` — добавить `'test'`

4. **Vitest configs** уже устанавливают `NODE_ENV=test` (стандартное поведение vitest)

5. **Auto-mute правило** для `environment = 'test'` (новый reason: `test_environment`):
   - Будет работать по metadata/environment, не по message pattern
   - Добавить в `error-service.ts`: если `environment === 'test'` → сразу ставить `auto_muted`

**Файлы:**

- `packages/course-gen-platform/src/shared/logger/utils.ts`
- `packages/course-gen-platform/src/shared/logger/types.ts`
- `packages/course-gen-platform/src/shared/logger/error-service.ts`
- `packages/course-gen-platform/supabase/migrations/` (новая миграция)

### Шаг 3: Добавить auto_mute правила для инфраструктурных ошибок

Добавить в `auto-classification.ts` паттерны:

- `could not renew lock for job` → `job_lifecycle`
- `Missing key for job.*moveToDelayed` → `job_lifecycle`
- `Critical language consistency failure` → `expected_behavior`
- `already being processed: Lock held` → `expected_behavior`

**Файл:** `packages/course-gen-platform/src/shared/logger/auto-classification.ts`

### Шаг 4: Исправить баг B1 — Section index out of bounds

**Root cause:** `total_sections` (из Stage 4 UI/LLM) может быть больше `sections_breakdown.length`.

**Fix:** В `generation-phases.ts` (строка ~448) использовать `Math.min()`:

```typescript
const requestedSections =
  recommendedStructure.total_sections ?? recommendedStructure.sections_breakdown.length;
const availableSections = recommendedStructure.sections_breakdown.length;
if (requestedSections > availableSections) {
  this.logger.warn(
    { courseId, requestedSections, availableSections },
    'total_sections exceeds sections_breakdown, capping'
  );
}
const totalSections = Math.min(requestedSections, availableSections);
```

**Файл:** `packages/course-gen-platform/src/stages/stage5-generation/phases/generation-phases.ts`

### Шаг 5: Исправить баг B2 — applyProposal empty analysis_result

**Root cause:** Пользователь вызывает `applyProposal` когда `analysis_result` пустой (Stage 4 не завершилась).

**Это уже defensive validation** — ошибка корректна. Пометить `to_verify` — нужно проверить, почему пользователь попадает на экран редактирования без `analysis_result`. Возможно, фронтенд должен блокировать доступ.

### Шаг 6: Разобраться с багом B3 — LLM Validation failures

**B3a: JSON parsing failed** — graceful fallback, ошибка уже handled. Resolve.

**B3b: suggested_answers validation** — LLM возвращает strings вместо objects (20+ items). Нормализация в `phase-0.5-clarifying.ts` уже есть (`.slice(0, 6)` + string→object). Нужно верифицировать что preprocess работает. Если нет — поправить порядок.

**Файл:** `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

### Шаг 7: Обновить SKILL.md процесса обработки логов

Добавить в auto-muted таблицу новые правила и документировать `environment = 'test'` паттерн.

### Шаг 8: Коммит и push

```bash
git commit -m "fix: prevent test errors in prod logs + Stage 5 section bounds + auto-mute rules"
git push
```

## Ключевые файлы

| Файл                                                        | Что меняем                                      |
| ----------------------------------------------------------- | ----------------------------------------------- |
| `src/shared/logger/utils.ts`                                | Добавить `NODE_ENV=test` → `environment='test'` |
| `src/shared/logger/types.ts`                                | Добавить `'test'` в `LogEnvironment`            |
| `src/shared/logger/error-service.ts`                        | Auto-mute для `environment='test'`              |
| `src/shared/logger/auto-classification.ts`                  | 4 новых auto-mute правила                       |
| `supabase/migrations/`                                      | CHECK constraint: добавить `'test'`             |
| `src/stages/stage5-generation/phases/generation-phases.ts`  | Fix B1: cap totalSections                       |
| `src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` | Verify/fix B3 normalization                     |

Все пути относительно `packages/course-gen-platform/`.

## Верификация

1. `pnpm --filter course-gen-platform type-check` — типы без ошибок
2. `pnpm --filter course-gen-platform test` — unit тесты проходят
3. Проверить что auto-classification тест синхронизирован с новыми правилами
4. SQL: `SELECT COUNT(*) FROM error_logs WHERE environment = 'test'` — после запуска тестов должны появиться записи с `test`
5. SQL: перезапросить count новых ошибок — должен быть ~0 после bulk resolve
