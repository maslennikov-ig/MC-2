# Plan: Stage 4 Post-Swap Fixes (тесты + Redis-кэш Phase 1 + прогресс Phase 0.5)

## Контекст

После реализации mc2-63bc (перестановка Phase 1 и Phase 0.5) выявлены три проблемы:

1. **Pre-existing баг**: 4 Stage 4 integration теста сломаны — импорт `../../src/types/analysis-result` (файл никогда не существовал)
2. **Phase 1 выполняется дважды при resume**: после ответа на clarifying questions создаётся новый BullMQ job, orchestrator стартует с нуля → Phase 1 (LLM call, 5-15 сек, ~$0.02) повторяется с идентичным результатом
3. **Phase 0.5 не обновляет прогресс**: progress bar застревает на 25% (конец Phase 1) пока Phase 0.5 работает (10-60 сек)

---

## Задача 1: Починить 4 сломанных Stage 4 integration теста

**Проблема**: `import { AnalysisResultSchema } from '../../src/types/analysis-result'` — файл не существует.
**`AnalysisResultSchema`** определён в `shared-types/src/analysis-schemas.ts:526`, экспортирован через `shared-types/src/index.ts:16`.

### Файлы (все в `packages/course-gen-platform/`)

| Файл                                                        | Строка |
| ----------------------------------------------------------- | ------ |
| `tests/integration/stage4-research-flag-detection.test.ts`  | 43     |
| `tests/integration/stage4-detailed-requirements.test.ts`    | 34     |
| `tests/integration/stage4-full-workflow.test.ts`            | 37     |
| `tests/integration/stage4-multi-document-synthesis.test.ts` | 38     |

### Замена (одинаковая для всех 4 файлов)

```typescript
// БЫЛО:
import { AnalysisResultSchema } from '../../src/types/analysis-result';
// СТАЛО:
import { AnalysisResultSchema } from '@megacampus/shared-types';
```

---

## Задача 2: Redis-кэш Phase 1 output при resume

**Проблема**: При resume после clarifying questions:

- `approveAndProceed` (clarifying.router.ts:1539) создаёт **новый** BullMQ job
- orchestrator стартует с нуля, Phase 1 (LLM call) повторяется
- В новом потоке Phase 1 **не получает** `clarifying_answers` → выдаёт **идентичный** результат
- Re-run = чистая трата токенов и времени

**Подход: Redis-кэш (без миграций)**

Используем `getRedisClient()` из `src/shared/cache/redis.ts` (уже есть для BullMQ).

### Файлы

| Файл                    | Изменение                                                          |
| ----------------------- | ------------------------------------------------------------------ |
| `orchestrator.ts`       | Перед Phase 1: проверить Redis-кэш. После Phase 1: записать в кэш. |
| `handler.ts` (optional) | После финального update — очистить кэш                             |

### Логика в orchestrator.ts (вставка вокруг строк 333-393)

```typescript
import { getRedisClient } from '../../../shared/cache/redis';

// Ключ кэша
const phase1CacheKey = `phase1_cache:${courseId}`;
const redis = getRedisClient();

let phase1Output: Phase1Output;

// Проверить кэш (resume path)
const cachedPhase1 = await redis.get(phase1CacheKey);
if (cachedPhase1) {
  phase1Output = JSON.parse(cachedPhase1) as Phase1Output;
  orchestrationLogger.info(
    { category: phase1Output.course_category.primary },
    'Phase 1: Using cached classification (resume)'
  );
} else {
  // First run: выполняем Phase 1
  await startPhase(1, courseId, supabase, orchestrationLogger);
  phase1Output = await executePhaseWithRetry(...);
  await completePhase(1, ...);

  // Сохраняем в Redis с TTL 24ч
  await redis.set(phase1CacheKey, JSON.stringify(phase1Output), 'EX', 86400);

  // logTrace и pedagogical_patterns logging — как раньше
}
```

### Детали

- **TTL**: 24 часа — покрывает 99%+ resume-сценариев, минимизирует stale risk (если админ сменит модель)
- **Fallback**: если кэш expired — Phase 1 просто перезапустится, тот же результат
- **Размер**: ~1-5 KB JSON, пренебрежимо для Redis
- **Очистка**: TTL auto-expiry. Опционально — `redis.del(key)` при restart_from_stage
- **startPhase/completePhase**: при cache hit пропускаем оба (прогресс уже был записан при первом запуске, а Phase 1 range 12-25% уже пройден)

### Вопрос: startPhase(1) при cache hit?

При resume прогресс уже на 25%+. Вызывать `startPhase(1)` (которая выставит 12%) было бы regression. Поэтому при cache hit — пропускаем startPhase/completePhase и просто используем данные.

---

## Задача 3: Прогресс-трекинг Phase 0.5

**Проблема**: `startPhase()`/`completePhase()` принимают `phaseNumber: 0|1|2|3|4|5|6` — нет `0.5`. Phase 0.5 не вызывает `updateCourseProgress()`. Прогресс замирает на 25%.

**Подход**: Прямые вызовы `updateCourseProgress()` в orchestrator.ts.

### Файлы

| Файл              | Изменение                                                      |
| ----------------- | -------------------------------------------------------------- |
| `validators.ts`   | Добавить `PROGRESS_MESSAGES` и `PROGRESS_RANGES` для Phase 0.5 |
| `orchestrator.ts` | 3 вызова `updateCourseProgress()` в блоке Phase 0.5            |

### Добавить в validators.ts

```typescript
// В PROGRESS_MESSAGES — между step_1_complete и step_2_start:
step_0_5_start: 'Генерация уточняющих вопросов...',
step_0_5_complete: 'Уточняющие вопросы обработаны',

// В PROGRESS_RANGES — между step_1 и step_2:
step_0_5: { start: 25, end: 28 },
```

### Вызовы в orchestrator.ts (блок Phase 0.5, строки 396-523)

1. **Перед генерацией вопросов** (после строки 417):

```typescript
await updateCourseProgress(
  courseId,
  'in_progress',
  PROGRESS_RANGES.step_0_5.start,
  PROGRESS_MESSAGES.step_0_5_start,
  supabase
);
```

2. **После auto-answer в automatic mode** (после строки 441):

```typescript
await updateCourseProgress(
  courseId,
  'in_progress',
  27,
  PROGRESS_MESSAGES.step_0_5_complete,
  supabase
);
```

3. **Когда все ответы получены и продолжаем** (после строки 513):

```typescript
await updateCourseProgress(
  courseId,
  'in_progress',
  PROGRESS_RANGES.step_0_5.end,
  PROGRESS_MESSAGES.step_0_5_complete,
  supabase
);
```

---

## Порядок выполнения

1. **Задачи 1 + 3** — независимые, параллельно (субагент или руками)
2. **Задача 2** — orchestrator.ts (пересекается с Задачей 3, лучше последовательно)

Рекомендация: сделать Задачу 1 (тесты) отдельно, затем Задачи 2+3 вместе в orchestrator.ts + validators.ts.

---

## Проверка

1. `pnpm type-check` — все пакеты
2. `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/integration/stage4-` — исправленные тесты (могут skip без env vars, но импорт должен resolve)
3. Ручная проверка Redis-кэша: первый запуск → `redis-cli GET phase1_cache:<courseId>` → должен быть JSON
4. Ручная проверка resume: ответить на вопросы → проверить логи "Using cached classification"
5. Прогресс: убедиться в логах что Phase 0.5 обновляет прогресс 25% → 27% → 28%
