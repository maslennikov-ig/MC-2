# Исследование: Логика перегенерации в Pipeline

**Контекст:** Проверка наличия "умной перегенерации" после задачи mc2-f7ec

## Результат исследования

**Логика перегенерации УЖЕ РЕАЛИЗОВАНА** на нескольких уровнях:

### 1. UnifiedRegenerator (внутри этапа)

Файл: `packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts`

5 слоёв восстановления:

- Layer 1: Auto-repair (jsonrepair + Zod) — 0 токенов, 95-98% успех
- Layer 2: Critique-revise (LLM feedback) — ~1000 токенов
- Layer 3: Partial regen (только failed fields) — ~1500 токенов
- Layer 4: Model escalation (20B → 120B) — ~5000 токенов
- Layer 5: Emergency fallback (Gemini) — ~3000 токенов

### 2. BullMQ retry для транзиентных ошибок

- LLMError, NetworkError, RateLimitError → retry
- Exponential backoff: 2^attempt \* 1000ms
- До 3 попыток

### 3. Ручной restart через UI

Файл: `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts`

- `restartStage` API позволяет вернуться на любой этап

## Вывод

**VALIDATION_FAILED** в Stage 5 означает:

1. UnifiedRegenerator уже прошёл все 5 слоёв
2. Все попытки исчерпаны
3. Ретраить бессмысленно

**Изменение в mc2-f7ec корректно** — не нужна дополнительная задача.

## Статус: Исследование завершено, новых задач не требуется
