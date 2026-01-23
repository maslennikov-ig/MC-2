# План: Упростить cover/banner генерацию до single-stage

## Контекст

Текущий two-stage flow для cover/banner (draft_ready → выбор вариантов → generating) избыточен, так как:

- В UI **уже есть** опции для выбора стиля (style, colorScheme) и custom prompt **ДО** генерации
- Выбор из 3 промптов после генерации draft - лишний шаг

## Цель

Переключить cover/banner на single-stage flow как у card:

```
pending → generating → completed
```

## Изменения

### Backend (course-gen-platform)

#### 1. `src/server/routers/enrichment/helpers.ts`

**Строки 465-472:** Убрать 'cover' и 'banner' из `isTwoStageType()`

```typescript
// БЫЛО:
export function isTwoStageType(enrichmentType: string): boolean {
  return (
    enrichmentType === 'video' ||
    enrichmentType === 'presentation' ||
    enrichmentType === 'cover' ||
    enrichmentType === 'banner'
  );
}

// БУДЕТ:
export function isTwoStageType(enrichmentType: string): boolean {
  return enrichmentType === 'video' || enrichmentType === 'presentation';
}
```

#### 2. `src/stages/stage7-enrichments/handlers/cover-handler.ts`

**Строки 1193-1198:** Изменить на single-stage

```typescript
// БЫЛО:
export const coverHandler: EnrichmentHandler = {
  generationFlow: 'two-stage',
  generateDraft,
  generate,
  generateFinal,
};

// БУДЕТ:
export const coverHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
```

**Проверено:** Функция `generate()` (строки 683-1006) уже полностью готова:

- **Строка 764-765**: `input.settings?.style` → `getStylePreset()` → визуальный стиль
- **Строка 817-826**: `input.settings?.customPrompt` → добавляется к user message

### Shared Types

#### 3. `packages/shared-types/src/enrichment-on-demand.ts`

**Строки 370-383:** Убрать 'cover' и 'banner' из `TWO_STAGE_ENRICHMENT_TYPES`

```typescript
// БЫЛО:
export const TWO_STAGE_ENRICHMENT_TYPES = ['cover', 'banner'] as const;

// БУДЕТ:
export const TWO_STAGE_ENRICHMENT_TYPES = [] as const;
// Или оставить только если video/presentation будут two-stage
```

### Frontend (web) - откат добавленного кода

#### 4. `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

**Удалить:**

- Импорт `CoverVariantSelector`
- Импорты `isAwaitingSelection`, `isTwoStageType` из shared-types
- Логику показа CoverVariantSelector при draft_ready
- Деструктуризацию `approveCoverDraft`, `isApprovingDraft`

#### 5. `packages/web/lib/hooks/useEnrichmentGeneration.ts`

**Удалить:**

- State `approving`
- Функцию `approveCoverDraft`
- Функцию `isApprovingDraft`
- Их экспорт

#### 6. Удалить файлы (опционально)

- `packages/web/components/course/viewer/components/CoverVariantSelector.tsx`

Или оставить на случай если понадобится для video/presentation.

### БД: Миграция застрявших enrichments

#### 7. SQL миграция для 4 застрявших enrichments

```sql
-- Сбросить draft_ready → pending для re-generation
UPDATE lesson_enrichments
SET
  status = 'pending',
  content = NULL,
  updated_at = NOW()
WHERE status = 'draft_ready'
  AND enrichment_type IN ('cover', 'banner');
```

Или вручную через UI перегенерировать.

## Что НЕ меняем

- `useRotatingStatusMessage.ts` - полезен для всех enrichments
- `useSmoothProgress.ts` с asymptotic crawl - полезен
- `EnrichmentGeneratingCard.tsx` с shimmer - полезен
- `getNextMilestone()` в shared-types - полезен

## Критические файлы

| Файл                                       | Действие                              |
| ------------------------------------------ | ------------------------------------- |
| `course-gen-platform/.../helpers.ts`       | Убрать cover/banner из isTwoStageType |
| `course-gen-platform/.../cover-handler.ts` | generationFlow → 'single-stage'       |
| `shared-types/enrichment-on-demand.ts`     | Убрать из TWO_STAGE_ENRICHMENT_TYPES  |
| `web/.../EnrichmentsPanel.tsx`             | Откатить draft_ready логику           |
| `web/.../useEnrichmentGeneration.ts`       | Удалить approveCoverDraft             |
| `web/.../CoverVariantSelector.tsx`         | Удалить или оставить                  |

## Верификация

1. **Type-check:** `pnpm type-check`
2. **Build:** `pnpm build`
3. **SQL проверка:**
   ```sql
   SELECT enrichment_type, status, COUNT(*)
   FROM lesson_enrichments
   GROUP BY enrichment_type, status;
   ```
4. **Manual test:**
   - Нажать "Сгенерировать обложку" на уроке
   - Должен сразу начаться прогресс 0% → 75% → 100%
   - БЕЗ промежуточного шага выбора вариантов
5. **Проверить застрявшие:** перегенерировать или сбросить через SQL
