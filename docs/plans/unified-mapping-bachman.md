# Fix ESLint Errors + Make Lint Blocking in CI (mc2-j8i9)

## Context

Задача mc2-j8i9 просит: (1) вынести lint в параллельный CI job, (2) Docker resource limits. Оба пункта **уже сделаны**. Однако lint job имеет `continue-on-error: true` и ci-success gate его не проверяет — т.е. lint фактически бесполезен. Причина: `course-gen-platform` lint падает с 51 error.

**Цель**: Починить все 51 lint error, убрать `continue-on-error`, сделать lint блокирующим.

## Параллельный агент (mc2-zxuy)

Трогает: `classifier.ts`, `stage3/phase-classification.ts`, `stage5/generation-phases.ts`, `redis-cleanup.ts`, `web/app/api/` routes. **Конфликтов нет** — ни один из 25 наших файлов не пересекается.

## Ошибки (51 шт, 4 категории)

| Правило                | Кол-во | Стратегия фикса                                  |
| ---------------------- | ------ | ------------------------------------------------ |
| `require-await`        | 26     | Убрать `async` с функций без `await`             |
| `no-base-to-string`    | 22     | `String(obj)`, `JSON.stringify()` или `.message` |
| `no-floating-promises` | 2      | Добавить `void` для fire-and-forget              |
| `await-thenable`       | 1      | Убрать `await` с не-Promise значения             |

## План выполнения

### Step 1: Фикс lint errors (25 файлов)

**Batch 1 — Shared/infra (низкий риск):**

1. `src/shared/logger/index.ts` — 2 `no-base-to-string`
2. `src/shared/notifications/course-notifications.ts` — 1 `require-await`
3. `src/shared/regeneration/context-assembler.ts` — 3 `require-await`
4. `src/shared/regeneration/semantic-diff-generator.ts` — 1 `require-await`
5. `src/shared/validation/quality-validator.ts` — 1 `no-base-to-string`

**Batch 2 — Server/routers:** 6. `src/server/routers/metrics.ts` — 10 `require-await` (tRPC handlers, sync безопасен) 7. `src/server/routers/generation/editing/chat.router.ts` — 1 `no-base-to-string` 8. `src/server/routers/generation/editing/element-crud.router.ts` — 4 `no-base-to-string`

**Batch 3 — Orchestrators:** 9. `src/orchestrator/outbox-processor.ts` — 1 `require-await` 10. `src/orchestrator/processor.ts` — 1 `require-await`

**Batch 4 — Stage 4:** 11. `src/stages/stage4-analysis/orchestrator.ts` — 1 `await-thenable` + 1 `require-await` (+ caller fix) 12. `src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` — 1 `no-base-to-string` 13. `src/stages/stage4-analysis/phases/phase-1-classifier.ts` — 2 `no-base-to-string` 14. `src/stages/stage4-analysis/phases/phase-4-synthesis.ts` — 1 `no-base-to-string`

**Batch 5 — Stage 5:** 15. `src/stages/stage5-generation/orchestrator.ts` — 1 `require-await` 16. `src/stages/stage5-generation/phases/phase3-v2-spec-generator.ts` — 1 `require-await` 17. `src/stages/stage5-generation/utils/metadata-generator.ts` — 1 `no-base-to-string`

**Batch 6 — Stage 6:** 18. `src/stages/stage6-lesson-content/judge/arbiter/consolidate-verdicts.ts` — 1 `require-await` 19. `src/stages/stage6-lesson-content/utils/mermaid-validator.ts` — 1 `require-await`

**Batch 7 — Stage 7:** 20. `src/stages/stage7-enrichments/handlers/video-handler.ts` — 1 `require-await` 21. `src/stages/stage7-enrichments/prompts/audio-prompt.example.ts` — 1 `require-await` + 1 `no-floating-promises` 22. `src/stages/stage7-enrichments/services/auto-card-trigger.ts` — 1 `no-base-to-string` + 1 `require-await` 23. `src/stages/stage7-enrichments/services/enrichment-router.ts` — 1 `require-await` 24. `src/stages/stage7-enrichments/services/enrichment-utils.ts` — 8 `no-base-to-string` 25. `src/stages/stage7-enrichments/worker-entrypoint.ts` — 1 `no-floating-promises`

### Step 2: Обновить CI/CD pipeline

**Файл**: `.github/workflows/ci-cd.yml`

1. **Строка 129**: Убрать `continue-on-error: true` из lint job
2. **Строки 468-488**: Добавить проверку lint в ci-success gate:

```yaml
if [ "${{ needs.lint.result }}" != "success" ]; then
echo "Lint failed!"
exit 1
fi
```

### Step 3: Docker (ничего не делаем)

Resource limits уже стоят на всех сервисах. Пункт закрыт.

## Стратегии фикса

### `require-await`: убрать `async`

```typescript
// Before:
async function foo(): Promise<T> {
  return value;
}
// After:
function foo(): T {
  return value;
}
```

**Нюанс**: Если caller использует `await foo()`, это безопасно — `await` на не-Promise просто возвращает значение. Но если lint увидит `await-thenable`, убрать и `await` у caller.

### `no-base-to-string`: привести к строке

```typescript
// Before:
`Error: ${errorObj}`
// After:
`Error: ${errorObj instanceof Error ? errorObj.message : String(errorObj)}`;
// Или для structured logging:
logger.error({ error: errorObj }, 'Something failed');
```

### `no-floating-promises`: добавить `void`

```typescript
// Before:
someAsyncOp();
// After:
void someAsyncOp();
```

### `await-thenable`: убрать `await`

```typescript
// Before:
const result = await syncFunction();
// After:
const result = syncFunction();
```

## Верификация

```bash
# 1. Lint проходит (0 errors, <=850 warnings)
cd packages/course-gen-platform && pnpm lint

# 2. Type-check (убрать async может изменить return types)
pnpm type-check

# 3. Build
pnpm build

# 4. Unit tests
pnpm --filter course-gen-platform test
```

## Риски

- **Низкий**: `require-await` фиксы — убираем лишний keyword, поведение не меняется
- **Средний**: `no-base-to-string` — нужно правильно выбрать способ конвертации (`.message` vs `JSON.stringify`)
- **stage4 orchestrator**: `prepareDocumentInfos` — если убрать `async`, caller с `await` может вызвать `await-thenable`. Нужно обновить и caller.

## Делегирование

Фикс 51 ошибки в 25 файлах — рутинная работа, идеальна для делегирования subagent'ам (batch по 5-8 файлов параллельно). Верификация — обязательно лично.
