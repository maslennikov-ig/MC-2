# Fix: Document processing crash for 9MB DOCX + console errors

## Context

Тестер (Лилия) сообщает о проблемах:

1. **Главная проблема**: 9MB DOCX файл ("Как работать в B24") стабильно падает при обработке. 4 попытки — 4 crash'а (QAS-5170, EWS-4263, WHM-7180, THJ-3678). Все другие файлы (до 778KB) обрабатываются успешно.

2. **Console errors**: `user_preferences 406`, `Failed to create draft session` — некритичные (уже обрабатываются в коде с graceful degradation).

### Корневая причина crash'а

Организация `premium` → файл обрабатывается через **Docling MCP** (не plain text). При обработке 9MB DOCX через MCP SDK (SSE/StreamableHTTP transport) происходит **uncaught exception** в worker thread:

- Ошибка НЕ попадает в processor.ts catch block (нет записей `[Sandbox]` в error_logs)
- Ошибка перехватывается BullMQ's `process.on('uncaughtException')` в main-base.js
- Error object создаётся с **пустым message** (`""`)
- Нашis serialization fix (`Object.defineProperty`) **не помогает** — он работает только ВНУТРИ catch block processor.ts, который не достигается

Вероятная причина uncaught exception: MCP SDK transport (EventSource/fetch) бросает ошибку через EventEmitter 'error' event без listener'а → Node.js создаёт uncaught exception. Или Docling MCP сервер не работает/не отвечает.

### Ранее сделанные фиксы (коммиты уже задеплоены)

- ✅ `702d0fea` — Safety net в `worker.on('failed')` (работает — статус обновляется на `failed`)
- ✅ `5d9ab227` — Serialization fix в processor.ts (не помогает — catch block не достигается)
- ✅ `4292cc5a` — Normalize course status для i18n (работает)

## Plan

### Step 1: Проверить доступность Docling на сервере

SSH на dev-сервер и проверить:

```bash
# Статус Docling контейнера
docker ps | grep docling

# Логи Docling за последний час
docker logs megacampus-docling-mcp-internal --since 1h 2>&1 | tail -50

# Проверить connectivity из worker контейнера
docker exec megacampus-worker-dev curl -s http://megacampus-docling-mcp:8000/mcp
```

Если Docling упал или недоступен → перезапустить, и повторить генерацию. Если работает → перейти к Step 2.

### Step 2: Добавить uncaughtException handler в processor.ts

**Файл**: `packages/course-gen-platform/src/orchestrator/processor.ts`

В начале модуля (до health check, строка ~236) добавить глобальные обработчики для worker thread:

```typescript
// Global error handlers for worker thread — capture errors that escape
// try-catch blocks (e.g., EventEmitter 'error' events from MCP transports).
// BullMQ's main-base.js also registers these, but it creates a generic Error().
// Our handler runs first (registered at module load) and captures full details.
const captureUncaughtError = (type: string) => (err: unknown) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error ? err.stack : undefined;
  baseLogger.error(
    { error: errorMessage, stack: errorStack, type },
    `Processor: ${type} in worker thread`
  );
  // Try to log to DB (best-effort, may fail in worker thread)
  logPermanentFailure({
    organization_id: 'unknown',
    error_message: `[WorkerThread ${type}] ${errorMessage}`,
    stack_trace: errorStack,
    severity: 'CRITICAL',
    metadata: { source: 'processor_global_handler', type },
  }).catch(() => {
    /* ignore */
  });
};

process.on('uncaughtException', captureUncaughtError('uncaughtException'));
process.on('unhandledRejection', captureUncaughtError('unhandledRejection'));
```

**Важно**: BullMQ's handler в main-base.js вызывает `process.exit()` после нашего. Наш handler логирует, BullMQ's handler отправляет ошибку parent'у и завершает процесс. Оба listener'а вызовутся в порядке регистрации.

### Step 3: Добавить error listener на MCP transport в DoclingClient

**Файл**: `packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts`

В методе `connect()` после создания transport, добавить error listener:

```typescript
// Prevent unhandled 'error' events on transport from crashing worker thread
if (this.transport && typeof (this.transport as any).on === 'function') {
  (this.transport as any).on('error', (err: Error) => {
    logger.error({ err }, 'Docling MCP transport error event');
    this.isConnected = false;
  });
}
```

Это предотвратит uncaught exception от EventEmitter.

### Step 4: Улучшить error message в safety net (worker.ts)

**Файл**: `packages/course-gen-platform/src/orchestrator/worker.ts`

В нашем safety net (строка ~376), `error?.message` пуст для sandbox crash'ей. Добавить fallback:

```typescript
error_message: error?.message || error?.stack?.split('\n')[0] || 'Worker thread crashed (no error details)',
```

### Step 5: Удалить неэффективный serialization fix

**Файл**: `packages/course-gen-platform/src/orchestrator/processor.ts` (строки ~393-405)

Заменить `Object.defineProperty` блок обратно на простой `throw error`. BullMQ's `errorToJSON()` уже использует `Object.getOwnPropertyNames()` для копирования всех свойств, включая non-enumerable — наш fix не нужен.

### Step 6: Перезапустить курсы после деплоя

Сначала задеплоить фикс (`git push`), дождаться CI/CD. Затем:

```sql
-- Перезапустить THJ-3678 (последняя попытка)
SELECT restart_from_stage(
  '135e961f-514d-4246-88ef-b0001a91d23d'::uuid,
  2::integer,
  'bea6e29b-bbc7-4d45-b03a-a17c9ec4f11e'::uuid
);
```

Если после деплоя фикса ошибка повторится — в error_logs будет **полный stack trace** из нашего uncaughtException handler (Step 2), и мы увидим реальную причину.

## Файлы для изменения

| Файл                                                                                   | Изменение                                            |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `packages/course-gen-platform/src/orchestrator/processor.ts`                           | uncaughtException handler + убрать serialization fix |
| `packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts` | error listener на transport                          |
| `packages/course-gen-platform/src/orchestrator/worker.ts`                              | Улучшить fallback message в safety net               |

## Verification

1. `pnpm --filter course-gen-platform type-check`
2. `pnpm --filter course-gen-platform build` (включая `build:processor` для tsup)
3. SSH на сервер: проверить Docling, посмотреть логи
4. После деплоя: перезапустить THJ-3678 и проверить error_logs:
   ```sql
   SELECT error_message, stack_trace, course_id
   FROM error_logs
   WHERE course_id = '135e961f-514d-4246-88ef-b0001a91d23d'
   ORDER BY created_at DESC LIMIT 5
   ```
5. Если Docling работает — курс обработается. Если нет — в error_logs будет полная диагностика.
