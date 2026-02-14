# Process Logs Plan — 2026-02-14

## Context

Обработка ошибок из `/admin/logs`. Обнаружено **38,728 новых error_logs** + **2 generation_trace**.

**Распределение по окружению:**

- stage: 38,145 | dev: 78 | test: 357 | local (NULL): 148

**Отчёт тестера (Лилия Кустова, PRW-8314):** Ошибка 406 + 500 на странице `/generating` при отправке чат-сообщения "добавь отдельно методики Сони Любомирски". Корневая причина — отсутствие/дублирование конфигов чат-фаз в БД.

**to_verify auto-resolution:** 0 resolved, 0 reopened.

---

## Найденные проблемы (3 бага + cleanup)

### BUG 1 (CRITICAL): Дубликаты/отсутствие конфигов чат-фаз в БД

**Симптомы:** 406, 500, 503 ошибки при использовании чата на stage.

**Корневая причина:**

- `chat_intent_classification` — конфиг **полностью отсутствует** в БД
- `chat_stage_5_refinement` — **2 дубликата** → `.maybeSingle()` возвращает ошибку → 406
- `chat_stage_6_refinement` — **2 дубликата** → аналогично

**Затронутые fingerprints (9 штук):**

- `2ae7192c` — "chat_intent_classification" has no active config (4 шт)
- `268402955` — "chat_stage_5_refinement" has no active config (1 шт)
- `ceac0bf5` — Chat phase model config unavailable 503 (1 шт)
- `76a586bc` — tRPC SERVICE_UNAVAILABLE generation.chat (4 шт)
- `2777f219` — tRPC SERVICE_UNAVAILABLE chat_stage_5_refinement (1 шт)
- `88e9a779` — Error fetching phase config from DB (не подсчитан отдельно)
- `8fe4f739`, `b930a229`, `a8717d6d` — POST /trpc/generation.chat 503 (WARNING)

**Файлы:**

- `packages/course-gen-platform/src/shared/llm/model-config-service.ts:465-469` — fail-fast для chat фаз
- `packages/course-gen-platform/src/shared/llm/model-config-db.ts:128,223,237` — `.maybeSingle()` запросы

### BUG 2 (CRITICAL): Stage 4 Phase 0.5 Zod Validation — LLM возвращает null/undefined поля

**Симптомы:** Stage 4 analysis job failed, course generation полностью падает.

**Корневая причина:** LLM генерирует 13 вопросов, но у questions[12] поля `question_type=null`, `question_priority=undefined`, `question_category=undefined`, `suggested_answers=undefined`. Zod-схема не обрабатывает null/undefined.

**Детали:**

- `question_type: QuestionTypeSchema.default('open')` — `.default()` обрабатывает только `undefined`, не `null`
- `question_priority: createLLMEnumSchema(...)` — начинается с `z.string()`, нет `.default()`, null/undefined сразу падают
- `question_category: createLLMEnumSchema(...)` — аналогично
- `suggested_answers: z.preprocess(...)` — не обрабатывает `undefined` вход (проверяет только `Array.isArray`)
- Phase 0.5 **не имеет retry-механизма** (в отличие от Phase 1-4 с `executePhaseWithRetry`)

**Затронутые fingerprints (7 штук, все один курс `93d46f24`):**

- `78469124` — CRITICAL Validation failed
- `f54d42c2` — Job failed (11 шт stage + 11 dev)
- `15e03422` — Sandboxed processor failed
- `619950532` — Stage 4 analysis job failed
- `74fb9d9d` — Stage 4 analysis orchestration failed
- `7cd323ee` — LLM output failed Zod validation (1 stage + 1 dev)
- `6a3bb1a7` — Phase 0.5: Clarifying Questions failed

**Также 2 generation_trace ошибки** (id: `81b88058`, `0389ac9c`) — та же причина.

**Файлы:**

- `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts:109-186` (схемы), `:723-733` (валидация)
- `packages/shared-types/src/analysis-schemas.ts:113-137` — `createLLMEnumSchema`

### BUG 3 (LOW): tRPC health endpoint — monitoring probe

**Симптомы:** "No procedure found on path 'health'" (1 шт, stage)
**Fingerprint:** `65e0a8f1`
**Корневая причина:** Monitoring probe пытается вызвать `/api/trpc/health`, но такого роута нет. Уже есть auto-mute правило в `auto-classification.ts` line 88, но ошибка прошла без мьюта — возможно, формат сообщения не совпал.
**Действие:** Проверить, почему правило не сработало, и пометить как resolved вручную.

---

## План действий

### Шаг 0: Bulk-resolve стейлых ошибок (SQL, без кода)

```sql
-- 0a. Bulk-resolve local (NULL) environment errors
-- 0b. Bulk-resolve test environment errors
-- 0c. Bulk-resolve old Redis errors (stage/dev, Jan 20-24, fingerprints: 7743ae54, 5925adfd, 49e596a9, 6f6f8e7f)
```

**Fingerprints для bulk-resolve (старые/ожидаемые):**

- `7743ae54` — Worker error Redis ECONNREFUSED (37,932 шт, Jan 21-24)
- `5925adfd` — Redis connection error (130 шт, Jan 20-21)
- `49e596a9` — Redis reconnecting 100ms (21 шт, WARNING)
- `6f6f8e7f` — Redis reconnecting 200ms (18 шт, WARNING)
- `dbc3d5f9` — FSM initialization (test env only)

### Шаг 1: Fix BUG 1 — Seed/deduplicate chat configs (SQL migration)

**Файл:** `packages/course-gen-platform/supabase/migrations/YYYYMMDDHHMMSS_fix_chat_config_duplicates.sql`

```sql
-- 1. Delete duplicates for chat_stage_5_refinement (keep one)
DELETE FROM llm_model_config
WHERE phase_name = 'chat_stage_5_refinement'
  AND id NOT IN (
    SELECT id FROM llm_model_config
    WHERE phase_name = 'chat_stage_5_refinement'
    ORDER BY created_at ASC
    LIMIT 1
  );

-- 2. Delete duplicates for chat_stage_6_refinement (keep one)
DELETE FROM llm_model_config
WHERE phase_name = 'chat_stage_6_refinement'
  AND id NOT IN (
    SELECT id FROM llm_model_config
    WHERE phase_name = 'chat_stage_6_refinement'
    ORDER BY created_at ASC
    LIMIT 1
  );

-- 3. Insert chat_intent_classification (if not exists)
INSERT INTO llm_model_config (phase_name, config_type, model_id, fallback_model_id, temperature, max_tokens, context_tier, language, is_active)
VALUES ('chat_intent_classification', 'global', 'xiaomi/mimo-v2-flash', 'qwen/qwen3-235b-a22b-2507', 0.1, 200, 'standard', 'any', true)
ON CONFLICT DO NOTHING;
```

**Субагент:** `database-architect`
**Beads:** `bd create -t bug --priority 1 --title "Fix: Chat config duplicates + missing chat_intent_classification"`

### Шаг 2: Fix BUG 2 — Sanitize LLM output в Phase 0.5 Zod schema

**Файл:** `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

Добавить preprocessing для null/undefined в ClarifyingQuestionSchema:

```typescript
export const ClarifyingQuestionSchema = z.object({
  question_text: z.string().min(10).max(500),
  // Fix: z.preprocess to handle null → default 'open'
  question_type: z.preprocess(
    val => (val === null || val === undefined ? undefined : val),
    QuestionTypeSchema.default('open')
  ),
  // Fix: z.preprocess to handle null/undefined → default 'important'
  question_priority: z.preprocess(
    val => (val === null || val === undefined ? 'important' : val),
    createLLMEnumSchema([...], {...}, 'questionPriority')
  ),
  // Fix: z.preprocess to handle null/undefined → default 'content_structure'
  question_category: z.preprocess(
    val => (val === null || val === undefined ? 'content_structure' : val),
    createLLMEnumSchema([...], {...}, 'questionCategory')
  ),
  // Fix: also handle undefined input
  suggested_answers: z.preprocess(val => {
    if (val === null || val === undefined) return []; // empty → will fail min(2), filtered by outer logic
    if (!Array.isArray(val)) return val;
    return val.map(normalizeSuggestedAnswer).filter(a => a !== null).slice(0, 6);
  }, z.array(SuggestedAnswerSchema).min(2).max(6)),
});
```

Также: добавить фильтрацию невалидных вопросов ПЕРЕД Zod (defensive, на уровне parsedOutput):

- Если questions[i] не имеет question_text — удалить из массива
- Логировать предупреждение о фильтрации

**Субагент:** `stage-pipeline-specialist`
**Beads:** `bd create -t bug --priority 1 --title "Fix: Stage 4 Phase 0.5 LLM Zod validation null/undefined fields" --files "packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts"`

### Шаг 3: Auto-mute — добавить 2 новых правила

**Файл:** `packages/course-gen-platform/src/shared/logger/auto-classification.ts`

```typescript
// Rule #55: Worker ECONNREFUSED Redis
{
  pattern: /Worker error.*ECONNREFUSED|ECONNREFUSED.*6379/i,
  reason: 'external_service',
  description: 'Worker failed to connect to Redis - transient, will retry on reconnect',
},

// Rule #56: Stage 4 fallback initialization
{
  pattern: /Worker validation.*Stage 4 not initialized.*initializing as fallback/i,
  reason: 'graceful_fallback',
  description: 'Stage 4 not initialized, initializing as fallback - expected during recovery',
},
```

**Также обновить:**

- Комментарий `Current rule count: 50` → `56`
- Тест `auto-classification.test.ts` — добавить test cases
- SKILL.md — обновить таблицу (не критично, можно позже)

**Субагент:** выполнить самостоятельно (простое изменение)

### Шаг 4: Auto-mute — Phase5Assembly fallback (уже покрыт) + Stage 4 warnings

**Fingerprints для auto-mute (уже покрыты но попали в new):**

- `c3361cb5` — Phase5Assembly fallback (30 шт) — правило есть, пометить resolved
- `0ed9a6bc` — Stage 4 not initialized (16 шт) — добавляем правило в Шаге 3
- `b73f29037` — Job failed with permanent error (13 шт) — пометить resolved (это следствие BUG 2)

### Шаг 5: Mark all processed fingerprints as resolved в БД

После фиксов — через SQL пометить все обработанные fingerprints как resolved/to_verify.

### Шаг 6: Beads tasks + commit + deploy

```bash
# Create beads tasks
bd create -t bug --priority 1 --title "Fix: Chat config duplicates + missing intent_classification"
bd create -t bug --priority 1 --title "Fix: Stage 4 Phase 0.5 Zod null/undefined handling"
bd create -t chore --priority 3 --title "Add auto-mute rules: Worker ECONNREFUSED, Stage 4 fallback"

# After fixes
pnpm type-check && pnpm build
git add . && git commit && git push
```

---

## Verification

1. **BUG 1 (chat config):**
   - `SELECT count(*) FROM llm_model_config WHERE phase_name IN ('chat_intent_classification', 'chat_stage_5_refinement', 'chat_stage_6_refinement')` → ровно 3 строки
   - Тестер может повторить чат-сообщение без 406/500

2. **BUG 2 (Zod validation):**
   - `pnpm test -- --run tests/unit/` (юнит-тесты Phase 0.5)
   - Ручной тест: создать курс с документом → Phase 0.5 должна пройти даже если LLM вернёт null в некоторых полях

3. **Auto-mute:**
   - `pnpm test -- --run tests/unit/auto-classification.test.ts`
   - Новые ошибки с паттернами Worker ECONNREFUSED и Stage 4 fallback должны автоматически мьютиться

4. **Bulk-resolve:**
   - `SELECT count(*) FROM error_logs el LEFT JOIN log_issue_status lis ON lis.fingerprint = el.fingerprint WHERE lis.id IS NULL AND el.environment IS NOT NULL` → 0 новых серверных ошибок

---

## Summary

| #   | Severity | Bug                              | Action           | Субагент                  |
| --- | -------- | -------------------------------- | ---------------- | ------------------------- |
| 0   | —        | Stale errors (38K+)              | Bulk-resolve SQL | Self                      |
| 1   | CRITICAL | Chat config duplicates + missing | DB migration     | database-architect        |
| 2   | CRITICAL | Phase 0.5 Zod null handling      | Code fix         | stage-pipeline-specialist |
| 3   | LOW      | Auto-mute rules                  | Code fix         | Self                      |
| 4   | —        | Mark resolved                    | SQL              | Self                      |
