# План исправления ошибок курса AMX-5817

**Дата**: 2026-02-02
**Beads Issues**: mc2-m20j, mc2-iiej, mc2-zoj2, mc2-1nym, mc2-a0uw, mc2-pzrw

---

## История похожих проблем (из Beads)

| Issue        | Статус       | Описание                                | Связь                        |
| ------------ | ------------ | --------------------------------------- | ---------------------------- |
| **mc2-xzvc** | CLOSED 23.01 | Миграция storage на локальный сервер    | Bucket удалён намеренно      |
| **mc2-gqjx** | CLOSED 30.01 | Удаление bucket course-enrichments      | Bucket удалён после миграции |
| **mc2-hr2s** | CLOSED 21.01 | Fix prompt markers, CJK, mermaid        | LLM проблемы исправлялись    |
| **mc2-ndhm** | CLOSED 22.01 | Patcher retry logic after hallucination | Retry логика добавлена       |
| **mc2-xuyi** | CLOSED 16.01 | Jina ConcurrencyLimiter (semaphore)     | Rate limit уже исправлялся   |
| **mc2-qys4** | CLOSED 28.01 | RefinementChat error recovery           | Chat проблемы исправлялись   |

### Выводы из истории

1. **Bucket**: Удалён намеренно, storage на локальном сервере → проверить USE_LOCAL_STORAGE
2. **LLM**: Исправления были, но регрессия → нужна более глубокая защита
3. **Jina**: ConcurrencyLimiter был добавлен → почему снова 429?

---

## Обзор проблем

| #   | Issue    | Severity    | Описание                                             |
| --- | -------- | ----------- | ---------------------------------------------------- |
| 1   | mc2-m20j | P0 Critical | Bucket not found — Storage bucket не существует      |
| 2   | mc2-iiej | P1 High     | Чат не работает — Сообщения не отправляются          |
| 3   | mc2-zoj2 | P1 High     | LLM галлюцинации — Patcher возвращает prompt markers |
| 4   | mc2-1nym | P1 High     | JSON repair failed — Невалидный JSON                 |
| 5   | mc2-a0uw | P2 Medium   | Jina API 429 — Rate limiting                         |
| 6   | mc2-pzrw | P3 Low      | Job token missing                                    |

---

## Fix 1: Bucket not found (mc2-m20j) — P0

### Причина (ОБНОВЛЕНО после анализа истории)

**Bucket был СОЗНАТЕЛЬНО удалён** 30.01.2026 (mc2-gqjx) после миграции на локальное хранилище (mc2-xzvc).

**Проблема**: На staging должен быть установлен `USE_LOCAL_STORAGE=true`, но похоже что переменная не передаётся в worker-stage7.

### Диагностика (перед исправлением)

```bash
# 1. Проверить переменные на сервере
ssh megacampus-prod "docker exec worker-stage7 printenv | grep STORAGE"

# 2. Проверить docker-compose
cat deploy/docker-compose.production.yml | grep -A5 worker-stage7
```

### Вероятное исправление

**НЕ создавать bucket заново!** Storage должен быть локальным.

**Файл**: `deploy/docker-compose.production.yml` или `.env.production`

```yaml
# Проверить что worker-stage7 имеет:
environment:
  - USE_LOCAL_STORAGE=true
```

### Альтернатива (если нужен Supabase для dev)

Если локальная разработка использует Supabase, создать bucket только для dev:

```bash
# Только для local development
pnpm supabase storage create course-enrichments --public
```

### Верификация

```bash
# 1. SSH на сервер
ssh megacampus-prod

# 2. Проверить что USE_LOCAL_STORAGE=true
docker exec worker-stage7 printenv | grep LOCAL_STORAGE

# 3. Проверить логи
docker logs worker-stage7 --tail 100 | grep -i storage

# 4. Если нужно перезапустить
docker-compose -f docker-compose.production.yml restart worker-stage7
```

---

## Fix 2: Чат не работает (mc2-iiej) — P1

### Причина

`RefinementChat` компонент не имеет блокировки во время активной генерации. `GlobalCourseChat` был удалён, но блокировка не перенесена.

### Файлы для изменения

| Файл                                                                       | Действие |
| -------------------------------------------------------------------------- | -------- |
| `web/components/generation-graph/panels/RefinementChat.tsx`                | MODIFY   |
| `web/components/generation-graph/panels/NodeDetailsDrawer.tsx`             | MODIFY   |
| `course-gen-platform/src/server/routers/generation/editing/chat.router.ts` | MODIFY   |
| `web/messages/ru/generation.json`                                          | MODIFY   |

### Шаги реализации

**1. Добавить props в RefinementChat**

```typescript
// File: RefinementChat.tsx

interface RefinementChatProps {
  // existing props...
  isGenerating?: boolean;
  blockedMessage?: string;
}

// In component:
const isChatBlocked = isGenerating || isProcessing;

// Disable textarea and send button when blocked
disabled = { isChatBlocked };
```

**2. Передать isGenerating из NodeDetailsDrawer**

```typescript
// File: NodeDetailsDrawer.tsx

const isGenerationActive = useMemo(() => {
  if (!generationStatus) return false
  const blockedPatterns = ['_init', '_processing', '_generating', '_classifying']
  return blockedPatterns.some(p => generationStatus.includes(p))
}, [generationStatus])

<RefinementChat
  isGenerating={isGenerationActive}
  blockedMessage={t('refinementChat.generationInProgress')}
/>
```

**3. Добавить валидацию на backend**

```typescript
// File: chat.router.ts

const BLOCKED_PATTERNS = ['_init', '_processing', '_generating', '_classifying'];

// In chat mutation:
const isBlocked = BLOCKED_PATTERNS.some(p => (course.generation_status || '').includes(p));

if (isBlocked) {
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'Chat unavailable during generation',
  });
}
```

**4. Добавить переводы**

```json
// ru/generation.json
{
  "refinementChat": {
    "generationInProgress": "Чат недоступен во время генерации. Подождите завершения этапа."
  }
}
```

### Верификация

```bash
# 1. Start course generation
# 2. Try to send chat message during stage_3_generating
# 3. Verify chat is blocked with message
# 4. Wait for awaiting_approval, verify chat works
```

---

## Fix 3: LLM галлюцинации (mc2-zoj2, mc2-1nym) — P1

### Причина (ОБНОВЛЕНО после анализа истории)

**Исправления уже были сделаны** 21-22.01.2026 (mc2-hr2s, mc2-ndhm):

- Validation для prompt markers
- Retry логика после rejection

**Проблема**: Регрессия или новые модели/промпты вызывают галлюцинации.

### Диагностика

```bash
# 1. Проверить какая модель используется для patcher
grep -r "stage_6_patcher" packages/course-gen-platform/

# 2. Посмотреть конфиг модели
SELECT * FROM llm_model_config WHERE phase_name = 'stage_6_patcher';

# 3. Проверить логи на fallback
grep "fallback\|Retrying" /var/log/worker-stage6.log | tail -50
```

### Вероятные причины регрессии

1. Смена модели (Qwen3 вместо более стабильной)
2. Fallback модель не настроена
3. Retry логика не срабатывает

### Файлы для проверки

| Файл                     | Проверить                                    |
| ------------------------ | -------------------------------------------- |
| `patcher-prompt.ts`      | Есть ли ## маркеры? Были ли заменены на XML? |
| `patcher/index.ts`       | Работает ли retry с fallback?                |
| `llm_model_config` table | Есть ли fallback_model_id для patcher?       |

### Шаги исправления

**1. Проверить и усилить промпт** (если ## всё ещё используется)

```typescript
// Заменить ## на XML теги
// Добавить anti-hallucination инструкции
```

**2. Проверить/настроить fallback модель**

```sql
-- Убедиться что есть fallback
UPDATE llm_model_config
SET fallback_model_id = 'google/gemini-2.5-flash'
WHERE phase_name = 'stage_6_patcher' AND fallback_model_id IS NULL;
```

**3. Улучшить JSON repair (если нужно)**

```typescript
// Добавить детекцию Markdown перед JSON repair
```

### Верификация

```bash
# 1. Проверить что validation работает
grep -A10 "PROMPT_TEMPLATE_MARKERS" packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-content.ts

# 2. Проверить retry логику
grep -A20 "markerValidation" packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/index.ts
```

---

## Fix 4: Jina API 429 (mc2-a0uw) — P2

### Причина (ОБНОВЛЕНО после анализа истории)

**ConcurrencyLimiter уже был добавлен** 16.01.2026 (mc2-xuyi) в `jina-client.ts`.

**Проблема**: Limiter обходится или есть другой код вызывающий Jina напрямую.

### Диагностика

```bash
# 1. Найти все места вызова Jina API
grep -r "jina" --include="*.ts" packages/ | grep -v test | grep -v node_modules

# 2. Проверить что все используют jina-client.ts
grep -r "makeJinaRequest\|getJinaEmbeddings" packages/
```

### Вероятные причины

1. Новый код вызывает Jina напрямую (не через jina-client)
2. ConcurrencyLimiter сломан после рефакторинга
3. Параллельные workers с отдельными limiters

### Файл для проверки

`packages/course-gen-platform/src/shared/embeddings/jina-client.ts`

### Верификация

```bash
# Проверить что ConcurrencyLimiter существует
grep -A20 "ConcurrencyLimiter" packages/course-gen-platform/src/shared/embeddings/jina-client.ts
```

---

## Fix 5: Job token missing (mc2-pzrw) — P3

### Причина

Job создаётся без передачи token для pause/delay функциональности.

**Низкий приоритет** — функционально не критично, только warning в логах.

---

## Порядок реализации

1. **mc2-m20j** — Bucket (блокирует сохранение карточек)
2. **mc2-iiej** — Чат (пользователь ждёт)
3. **mc2-zoj2 + mc2-1nym** — LLM issues (связаны)
4. **mc2-a0uw** — Jina rate limiting
5. **mc2-pzrw** — Job token (опционально)

---

## Критические файлы

### Fix 1 (Bucket)

- `packages/course-gen-platform/supabase/migrations/` — новая миграция
- `packages/course-gen-platform/src/stages/stage7-enrichments/services/storage-service.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/services/unified-storage-service.ts`

### Fix 2 (Chat)

- `packages/web/components/generation-graph/panels/RefinementChat.tsx`
- `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`
- `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts`

### Fix 3 (LLM)

- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/patcher-prompt.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/index.ts`
- `packages/course-gen-platform/src/shared/utils/json-repair.ts`

---

## Верификация после всех исправлений

```bash
# 1. Type check
pnpm type-check

# 2. Build
pnpm build

# 3. Tests
pnpm test

# 4. Manual testing on staging
# - Create new course with files
# - Verify card generation works
# - Verify chat works during awaiting_approval
# - Verify chat blocked during generation
# - Check logs for LLM hallucination retries
```
