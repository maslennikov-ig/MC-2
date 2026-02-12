# HSY-4471: Исправление генерации обложек курсов

## Context

Курс **HSY-4471** ("Основы систематизации бизнеса") не отображает обложку в каталоге. Это **системная проблема**: 8 из 29 курсов не имеют обложки (3 застряли в `generating`, 5 — `failed`).

### Статистика course-card enrichments

| Статус                    | Кол-во | Причина                                                    |
| ------------------------- | ------ | ---------------------------------------------------------- |
| completed                 | 21     | OK                                                         |
| **generating (застряли)** | **3**  | Баг двойного retry — статус в БД не обновляется            |
| **failed**                | **5**  | `Bucket not found` — Supabase Storage bucket не существует |

### Затронутые курсы

**Stuck generating** (нет обложки, нет ошибки):

- HSY-4471, BUD-9766, UDE-9391

**Failed** (нет обложки, с ошибкой "Bucket not found"):

- DTS-0614, KRQ-4571, WEM-6453, YEW-1770, AMX-5817

---

## Корневая причина

### Баг 1: Двойной retry — enrichment навсегда в `generating`

В `job-processor.ts:384-402` внутренняя retry-логика использует `job.data.retryAttempt` (статичное значение из данных job'а = 0 для auto-triggered), а не `job.attemptsMade` (счётчик BullMQ):

```
catch (error) {
  const retryContext = { attempt: retryAttempt + 1, ... };  // retryAttempt = 0 → attempt = 1 (ВСЕГДА)

  if (shouldRetry(retryContext)) {  // attempt=1 < MAX_RETRIES=3 → true (ВСЕГДА для retryable ошибок)
    throw error;  // BullMQ перехватит и retry'нет
  }

  // ЭТА СТРОКА НИКОГДА НЕ ВЫПОЛНЯЕТСЯ для retryable ошибок:
  await updateEnrichmentStatus(enrichmentId, 'failed', ...);
}
```

**Цепочка:**

1. Job падает с retryable ошибкой (timeout/network)
2. `shouldRetry({ attempt: 1 })` → true (1 < 3) → throw
3. BullMQ retry #2 → та же ошибка → `shouldRetry({ attempt: 1 })` → true → throw
4. BullMQ retry #3 → та же ошибка → `shouldRetry({ attempt: 1 })` → true → throw
5. BullMQ исчерпал `attempts: 3` → job помечен `failed` **в Redis**
6. `worker.on('failed')` в `factory.ts:67-78` → **только логирует**, не обновляет БД
7. **Enrichment навсегда в `generating`** с `image_url = null`

### Баг 2: "Bucket not found" — уже исправлен (mc2-m20j)

5 failed enrichments (Feb 2-3) были сгенерированы ДО того как worker-stage7 получил `USE_LOCAL_STORAGE=true` в docker-compose. Supabase Storage bucket `course-enrichments` был осознанно удалён (mc2-gqjx, 30.01). С тех пор env var настроен правильно (`docker-compose.production.yml:311`), и при ретриггере генерация будет использовать локальное хранилище. Код-фикс не нужен — только ретриггер.

### Логи сервера

Логи worker-stage7 начинаются с 06.02 20:53 (после рестарта). Логи от 04-05.02 (когда enrichments зависли) ротированы. Точная ошибка неизвестна, но **не важна** — баг системный: любая retryable ошибка (timeout/network/rate limit) приводит к вечному `generating`.

### Баг 3: `regenerate` endpoint не принимает `generating`

`regenerate.ts:94` — `allowedStatuses = ['failed', 'cancelled', 'completed']`. Для застрявших enrichments стандартный API не работает.

---

## План исправления

### Шаг 1: Исправить баг двойного retry в job-processor.ts

**Файл:** `packages/course-gen-platform/src/stages/stage7-enrichments/services/job-processor.ts`

В catch-блоке (строки 384-402) заменить `retryAttempt` на `job.attemptsMade`:

```typescript
// БЫЛО (строка 387):
const retryContext = {
  enrichmentType,
  attempt: retryAttempt + 1,
  error: errorObj,
};

// СТАНЕТ:
const retryContext = {
  enrichmentType,
  attempt: job.attemptsMade + 1, // Используем реальный счётчик BullMQ
  error: errorObj,
};
```

Это гарантирует, что после 3 BullMQ-попыток `shouldRetry` вернёт false, и `updateEnrichmentStatus('failed')` будет вызван.

### Шаг 2: Добавить safety net — `worker.on('failed')` обновляет БД

**Файл:** `packages/course-gen-platform/src/stages/stage7-enrichments/factory.ts`

Заменить `worker.on('failed')` (строки 67-78) на обработчик, который обновляет статус:

```typescript
worker.on('failed', async (job, error) => {
  logger.error({ jobId: job?.id, enrichmentId: job?.data.enrichmentId, ... }, 'Stage 7 job failed');

  // Safety net: обновить статус enrichment в БД
  if (job?.data?.enrichmentId) {
    try {
      await updateEnrichmentStatus(
        job.data.enrichmentId,
        'failed',
        `BullMQ exhausted retries: ${error.message}`,
        { jobId: job.id, attempts: job.attemptsMade }
      );
    } catch (dbError) {
      logger.error({ ... }, 'Failed to update enrichment status after job failure');
    }
  }
});
```

Импортировать `updateEnrichmentStatus` из `./services/database-service`.

### Шаг 3: Добавить `generating` в `regenerate` endpoint

**Файл:** `packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate.ts`

Строка 94 — расширить допустимые статусы + добавить time check:

```typescript
const allowedStatuses = ['failed', 'cancelled', 'completed', 'generating'];

// После проверки статуса — добавить time guard для generating:
if (enrichment.status === 'generating') {
  const updatedAt = new Date(enrichment.updated_at);
  const stuckThresholdMs = 10 * 60 * 1000; // 10 минут
  if (Date.now() - updatedAt.getTime() < stuckThresholdMs) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Enrichment is still generating. Wait at least 10 minutes before regenerating.',
    });
  }
}
```

### Шаг 4: SQL — разблокировать 8 существующих проблемных enrichments

Перевести все 8 (3 `generating` + 5 `failed`) в `pending` для перегенерации:

```sql
UPDATE lesson_enrichments
SET status = 'pending',
    error_message = NULL,
    error_details = NULL,
    content = NULL,
    generation_attempt = generation_attempt + 1,
    updated_at = NOW()
WHERE enrichment_type = 'card'
  AND title = 'course-card'
  AND status IN ('generating', 'failed');
```

> **Важно:** После SQL нужно поставить job'ы в очередь. Это можно сделать через API endpoint или перезапуск auto-card-trigger для этих курсов.

---

## Критические файлы

| Файл                                                                                   | Изменение                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/course-gen-platform/src/stages/stage7-enrichments/services/job-processor.ts` | Строка 387: `retryAttempt + 1` → `job.attemptsMade + 1` |
| `packages/course-gen-platform/src/stages/stage7-enrichments/factory.ts`                | Строки 67-78: `worker.on('failed')` обновляет БД        |
| `packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate.ts`  | Строка 94: добавить `'generating'` + time check         |

---

## Верификация

1. `pnpm type-check` — типы после изменений
2. SQL: проверить что все 8 enrichments перешли в `pending`
3. Запустить генерацию для проблемных курсов (через API или auto-trigger)
4. Проверить результат:
   ```sql
   SELECT c.generation_code, le.status, le.content->>'imageUrl'
   FROM lesson_enrichments le
   JOIN courses c ON c.id = le.course_id
   WHERE le.enrichment_type = 'card' AND le.title = 'course-card'
   ORDER BY le.created_at DESC;
   ```
5. Визуально проверить каталог — обложки должны появиться
