# Расследование и предотвращение зависания Stage 5 (QUC-0414)

## Контекст

Курс **QUC-0414 "Изучение религий"** (id: `4da87c07-059b-4919-a001-f1a2e9e5fd34`) завис в статусе `stage_5_generating` с 17 марта ~19:04 UTC. Секции 1–11 сгенерированы успешно, section_12_start записан, но `section_12_complete` так и не появился. Ошибка не зафиксирована. Курс тестовый — восстановить его не критично, но важно понять причину и предотвратить повторение.

---

## Часть 1: Немедленное действие — откат Stage 5

RPC `restart_from_stage` (миграция `20251218`) уже поддерживает рестарт из **любого статуса** кроме `pending`. Прямой SQL не нужен.

**Действие:** Выполнить SQL через Supabase MCP для сброса статуса:

```sql
SELECT restart_from_stage(
  '4da87c07-059b-4919-a001-f1a2e9e5fd34',
  5,
  'bea6e29b-bbc7-4d45-b03a-a17c9ec4f11e'
);
```

Это сбросит `generation_status` → `stage_5_init`, очистит `course_structure`, `error_*` поля, удалит generation_trace записи stage_5. После этого пользователь может перезапустить stage 5 из UI.

---

## Часть 2: Расследование — почему зависло

### 2.1 Что произошло

| Время (UTC) | Событие                                |
| ----------- | -------------------------------------- |
| 18:21:15    | Stage 5 начался → `stage_5_generating` |
| 18:25:10    | Генерация секций началась (section_1)  |
| 19:03:58    | `section_12_start` — последняя запись  |
| +24 часа    | Тишина. Ни `_complete`, ни ошибки.     |

**Факты:**

- `error_data = null` в generation_trace — ошибка не была поймана приложением
- `generation_status_history` не содержит переход из `stage_5_generating` → ничего после
- `job_status` таблица пуста для этого курса — job не был отслежён через БД
- Модель: `moonshotai/kimi-k2-thinking` (timeout LLM-вызова: 5 мин)

### 2.2 Вероятная причина: крэш воркер-процесса

Поскольку нет ни ошибки, ни завершения — это не ошибка на уровне приложения (те пишут `error_data`). Это крэш на уровне процесса (OOM, деплой, перезагрузка, segfault).

### 2.3 Почему НЕ сработало самовосстановление

В системе есть 3 уровня защиты. Все 3 не сработали:

**1) Обработка ошибок в handler.ts (строка 260–266):**

```typescript
} catch (error) {
  return await this.handleExecutionError(...);  // → markCourseAsFailed()
} finally {
  await lockGuard.release();  // → clearInterval + releaseLock
}
```

- **Почему не сработал**: `try/catch/finally` выполняется только при нормальном exception. При крэше процесса (OOM kill, segfault) — не выполняется ничего.

**2) Safety net в worker.ts (строка 426–478):**

```typescript
worker.on('failed', async (job, error) => {
  // Safety net: update course generation_status when sandbox crashes
  await supabase.rpc('update_course_progress', { p_status: 'failed' });
});
```

- **Почему не сработал**: Событие `failed` срабатывает ТОЛЬКО если BullMQ обнаруживает stalled job и перемещает его в failed. Для этого нужен **живой Worker-процесс**, который проверяет stalled jobs.

**3) BullMQ stall detection (строка 514–524):**

```typescript
worker.on('stalled', jobId => {
  baseLogger.info({ jobId }, 'Job stalled');
  // Recovery handled by BullMQ retry mechanism
});
```

- **Почему не сработал**: В BullMQ v5 stall detection выполняется **внутри Worker-процесса**. Если процесс упал, проверки не выполняются. Когда процесс перезапускается, новый Worker _должен_ обнаружить stalled jobs, но:
  - Если процесс не был перезапущен → stall detection никогда не запустился
  - `stalledInterval` не указан явно (используется default 30s), но `lockDuration: 2700000` (45 мин) — job считается stalled только после истечения lock

**Итог: полная цепочка self-recovery зависит от того, что Worker-процесс жив. Если процесс умирает и не перезапускается — курс зависает навсегда.**

### 2.4 Шаги расследования на сервере

```bash
# 1. Проверить, работает ли воркер сейчас
ssh server "systemctl status course-gen-worker"  # или pm2/docker

# 2. Проверить логи за 17 марта ~19:00-19:30 UTC
ssh server "journalctl -u course-gen-worker --since '2026-03-17 19:00' --until '2026-03-17 20:00'"

# 3. Проверить OOM kills
ssh server "dmesg | grep -i 'oom\|killed'"

# 4. Проверить Redis для stalled jobs
ssh server "redis-cli LRANGE bull:course-generation-dev:stalled 0 -1"

# 5. Проверить active jobs в Redis (зависшие)
ssh server "redis-cli LRANGE bull:course-generation-dev:active 0 -1"
```

---

## Часть 3: Предотвращение — план изменений

### 3.1 Добавить Edge Function "stuck-generation-detector" (приоритет: HIGH)

Новая edge function (или расширение `cleanup-old-drafts`) которая:

- Запускается по cron каждый час
- Находит курсы в `*_generating` / `*_processing` / `*_analyzing` / `*_summarizing` дольше 2 часов
- Помечает их как `failed` через `update_course_progress` RPC
- Логирует в `error_logs` для видимости в админке

**Файлы:**

- Новый: `packages/course-gen-platform/supabase/functions/detect-stuck-generations/index.ts`
- Или расширить: `cleanup-old-drafts/index.ts` (добавить второй шаг)

```sql
-- Запрос для обнаружения зависших курсов
SELECT id, generation_status, last_progress_update
FROM courses
WHERE generation_status IN (
  'stage_2_processing', 'stage_3_summarizing',
  'stage_4_analyzing', 'stage_5_generating',
  'finalizing'
)
AND last_progress_update < NOW() - INTERVAL '2 hours';
```

Для каждого найденного курса:

```sql
SELECT update_course_progress(
  course_id, step_id, 'failed',
  'Автоматически помечено как failed: нет прогресса 2+ часа',
  'STUCK_GENERATION_TIMEOUT'
);
```

### 3.2 Явно настроить BullMQ stall detection (приоритет: MEDIUM)

**Файл:** `packages/course-gen-platform/src/orchestrator/worker.ts` (строка 290–312)

Добавить явные настройки:

```typescript
new Worker(QUEUE_NAME, processorFile, {
  // ...existing options...
  stalledInterval: 300000, // 5 минут (вместо default 30s — уменьшает нагрузку на Redis)
  maxStalledCount: 2, // После 2 stall detections → job fails (default: 1)
});
```

### 3.3 Убедиться в автоперезапуске воркера (приоритет: HIGH)

Проверить на сервере, что воркер-процесс настроен на автоматический перезапуск:

- systemd: `Restart=always` + `RestartSec=5`
- PM2: `--restart-delay 5000`
- Docker: `restart: unless-stopped`

Без автоперезапуска все механизмы stall detection бесполезны.

### 3.4 Расширить health check (приоритет: LOW)

**Файл:** `packages/web/app/api/admin/health/route.ts`

Health check уже детектит курсы без прогресса 2+ часа (строки 798–862), но только логирует `degraded`. Можно добавить webhook/Telegram-уведомление при обнаружении.

---

## Файлы для изменений

| Файл                                                   | Изменение                                                 |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `supabase/functions/detect-stuck-generations/index.ts` | **Новый**: Edge function для автодетекции зависших курсов |
| `src/orchestrator/worker.ts` (строки 290-312)          | Добавить `stalledInterval`, `maxStalledCount`             |
| Конфигурация сервера (systemd/PM2/Docker)              | Проверить `Restart=always`                                |

## Верификация

1. Откатить Stage 5 через SQL RPC → `generation_status = 'stage_5_init'`
2. Проверить логи сервера за 17 марта для понимания точной причины крэша
3. После деплоя edge function — тестово создать курс и убить воркер → через 2 часа курс должен автоматически получить статус `failed`
4. Проверить, что BullMQ stall detection корректно работает при рестарте воркера: создать job, убить воркер, перезапустить — job должен быть retry или failed
