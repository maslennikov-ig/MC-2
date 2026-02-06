# Plan: Remove Deprecated assessment_types Field

## Problem

Поле `assessment_types` в `pedagogical_patterns` устарело:

- Домашние задания будут генерироваться отдельно (в "Дополнительных материалах")
- Поле вызывает ошибки валидации (peer_review vs peer-review)
- Не несёт критической функции — это advisory подсказка для LLM

## Decision

**Удалить поле полностью** вместо исправления валидации. Это проще и чище.

## Files to Modify (19 файлов)

### Core Types (3 файла)

| File                                     | Action                                  |
| ---------------------------------------- | --------------------------------------- |
| `shared-types/src/analysis-schemas.ts`   | Remove from `PedagogicalPatternsSchema` |
| `shared-types/src/analysis-result.ts`    | Remove from TypeScript interface        |
| `shared-types/src/regeneration-types.ts` | Remove if present                       |

### Stage 4 - Generation (2 файла)

| File                                         | Action                |
| -------------------------------------------- | --------------------- |
| `stage4-analysis/phases/phase-5-assembly.ts` | Stop generating field |
| `stage4-analysis/orchestrator.ts`            | Remove references     |

### Stage 5 - Usage (1 файл)

| File                                             | Action                                             |
| ------------------------------------------------ | -------------------------------------------------- |
| `stage5-generation/utils/analysis-formatters.ts` | Remove from `formatPedagogicalPatternsForPrompt()` |

### UI (2 файла)

| File                                                                   | Action            |
| ---------------------------------------------------------------------- | ----------------- |
| `web/components/generation-graph/panels/output/AnalysisResultView.tsx` | Remove display    |
| `web/components/generation-graph/panels/output/types.ts`               | Remove from types |

### Utilities (2 файла)

| File                                   | Action                                       |
| -------------------------------------- | -------------------------------------------- |
| `shared/utils/structure-normalizer.ts` | Remove from `normalizePedagogicalPatterns()` |
| `shared/utils/field-name-fix.ts`       | Remove variant mappings                      |

### Tests (9 файлов)

| File                                                      | Action               |
| --------------------------------------------------------- | -------------------- |
| `shared-types/tests/analysis-schemas.test.ts`             | Update test fixtures |
| `stage4-analysis/__tests__/backward-compat.test.ts`       | Update fixtures      |
| `stage5-generation/__tests__/analysis-formatters.test.ts` | Update tests         |
| `stage5-generation/regeneration/__tests__/*.test.ts` (2)  | Update fixtures      |
| `tests/unit/regeneration/*.test.ts` (2)                   | Update fixtures      |
| `tests/fixtures/analysis-result-fixture.ts`               | Remove field         |
| `tests/integration/analysis-pipeline-enhanced.test.ts`    | Update expectations  |

## Migration Strategy

### Backward Compatibility

Существующие курсы в БД могут иметь `assessment_types` в `analysis_result`.
**Решение:** Сделать поле optional в схеме, не ломать при чтении старых данных.

```typescript
// В PedagogicalPatternsSchema:
assessment_types: z.array(z.string()).optional(), // DEPRECATED - will be removed
```

## Verification

1. `pnpm type-check` — no type errors
2. `pnpm build` — builds successfully
3. `pnpm test` — all tests pass
4. Create new course — no assessment_types in analysis_result

## Beads Task

Создать задачу с описанием:

- **Почему удалили:** Поле устарело, домашки будут в отдельном модуле
- **Что затронуто:** 19 файлов
- **Как вернуть:** См. git history этого коммита
