# Fix: Cover/Banner Generation UX

## Обнаруженные проблемы

### Проблема 1: Варианты cover не отображаются в Course Viewer (КРИТИЧЕСКАЯ)

**Симптом:** Генерация застревает на 50% (draft_ready), пользователь не видит вариантов для выбора.

**Причина:** Компонент `CoverPreview` (выбор 3 вариантов) существует, но используется только в админке (`generation-graph/`), не интегрирован в Course Viewer (`UnifiedEnrichmentCard`).

**Текущее поведение (баг):**

- `isActiveGenerationStatus('draft_ready')` = true
- UI показывает `EnrichmentGeneratingCard` с прогресс-баром на 50%
- Варианты НЕ отображаются → генерация "застревает"

**Правильное поведение:**

- При `draft_ready` показывать 3 варианта для выбора
- После выбора → запустить Phase 2

**Flow генерации cover/banner:**

```
Phase 1: generateDraft → 3 варианта промптов → status: draft_ready (50%)
         ↓
         ⚠️ ПОЛЬЗОВАТЕЛЬ ДОЛЖЕН ВЫБРАТЬ ВАРИАНТ (но UI не показывает!)
         ↓
Phase 2: generateFinal → финальное изображение → status: completed (100%)
```

**Данные из БД (4 застрявших enrichments):**

```
| lesson_title                          | status      |
|---------------------------------------|-------------|
| План взаимодействия: от диагностики   | draft_ready |
| Специфика рынка образовательных...    | draft_ready |
| Формирование ценностного предложения  | draft_ready |
| Сегментация аудитории                 | draft_ready |
```

### Проблема 2: Прогресс-бар создаёт впечатление зависания (UX)

**Симптом:** Прогресс застывает на 50%/58%, пользователь думает что система зависла.

**Причина:** Реальный прогресс обновляется только при смене статуса (0%, 25%, 50%, 75%, 100%). Между обновлениями — статичный бар.

---

## Архитектура (что уже есть)

### Backend (✅ готов)

- `approve-draft.ts` — endpoint для утверждения draft
- `approve-cover-draft.ts` — специфичный для cover с выбором варианта
- `get-generation-status.ts` — polling статуса

### Frontend компоненты

| Компонент                      | Где                               | Статус                          |
| ------------------------------ | --------------------------------- | ------------------------------- |
| `CoverPreview.tsx`             | `generation-graph/panels/stage7/` | ✅ Готов, показывает 3 варианта |
| `UnifiedEnrichmentCard.tsx`    | `course/viewer/components/`       | ❌ НЕ показывает варианты cover |
| `EnrichmentGeneratingCard.tsx` | `course/viewer/components/`       | ⚠️ Прогресс застывает           |
| `useSmoothProgress.ts`         | `lib/hooks/`                      | ✅ Плавная интерполяция         |

### Mapping прогресса

```typescript
pending:          0%
draft_generating: 25%
draft_ready:      50%  ← ЗАСТРЕВАЕТ
generating:       75%
completed:        100%
```

---

## План исправления

### Часть 1: Показать выбор вариантов в Course Viewer (P1 — критично)

#### 1.1. Изменить логику отображения карточки

**Файл:** `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

**Проблема (строки 271-282):**

```typescript
// Сейчас: показываем EnrichmentGeneratingCard если isGenerating
if (typeIsGenerating && generatingProgress) {
  return <EnrichmentGeneratingCard ... />
}
```

**Решение:** Проверять `draft_ready` отдельно и показывать варианты:

```typescript
// Показать варианты если draft_ready для cover/banner
const existingDraft = enrichments.find(
  (e) => e.enrichment_type === type && e.status === 'draft_ready'
)
if (existingDraft && (type === 'cover' || type === 'banner')) {
  return <CoverVariantSelector enrichment={existingDraft} onSelect={...} />
}

// Показать прогресс только для активной генерации (НЕ draft_ready)
if (typeIsGenerating && generatingProgress && generatingProgress.progress < 50) {
  return <EnrichmentGeneratingCard ... />
}
```

#### 1.2. Создать компонент выбора вариантов

**Новый файл:** `packages/web/components/course/viewer/components/CoverVariantSelector.tsx`

Компактный компонент для карточки:

- Показывает 3 варианта описаний (без промптов)
- Radio buttons для выбора
- Кнопка "Сгенерировать изображение"
- Вызывает `trpc.enrichment.approveCoverDraft`

#### 1.3. Добавить mutation для approve

**Файл:** `packages/web/lib/hooks/useEnrichmentGeneration.ts`

Добавить `approveCoverDraft` mutation:

```typescript
const approveDraft = async (enrichmentId: string, variantId: number) => {
  const response = await fetch(`${TRPC_URL}/enrichment.approveCoverDraft`, {
    method: 'POST',
    body: JSON.stringify({ enrichmentId, selectedVariant: variantId }),
  });
  // После approve — начать polling для Phase 2
  startPolling(enrichmentId, type);
};
```

#### 1.4. Исправить ACTIVE_GENERATION_STATUSES

**Файл:** `packages/shared-types/src/enrichment-on-demand.ts`

`draft_ready` НЕ должен считаться "активной генерацией" для показа прогресс-бара:

```typescript
// Статусы для показа прогресс-бара (без draft_ready)
export const PROGRESS_BAR_STATUSES = ['pending', 'draft_generating', 'generating'] as const;

// draft_ready — отдельное состояние "ожидание выбора"
export function isAwaitingSelection(status: string): boolean {
  return status === 'draft_ready';
}
```

### Часть 2: Улучшить UX прогресс-бара (P2 — улучшение)

**Подход:** "Honest Fake Progress" + Shimmer + Rotating Messages

#### 2.1. Asymptotic crawl в `useSmoothProgress.ts`

**Файл:** `packages/web/lib/hooks/useSmoothProgress.ts`

```typescript
interface UseSmoothProgressOptions {
  targetProgress: number;
  // NEW: медленно ползти к milestone когда застыл
  enableAsymptoticCrawl?: boolean;
  // NEW: не превышать этот порог (milestone)
  nextMilestone?: number;
}

// Логика:
// - Если target не менялся >3 сек И enableAsymptoticCrawl=true
// - Медленно увеличивать на ~0.1% каждые 500ms
// - НИКОГДА не превышать nextMilestone - 5%
// - Пример: target=50% → ползём до 53-55%, но НЕ до 75%
```

#### 2.2. Shimmer эффект на прогресс-бар

**Файл:** `packages/web/components/ui/smooth-progress.tsx`

```tsx
// Добавить shimmer overlay поверх заполненной части
{
  isActive && (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 animate-shimmer"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
          width: `${progress}%`,
        }}
      />
    </div>
  );
}
```

#### 2.3. Rotating status messages

**Новый файл:** `packages/web/lib/hooks/useRotatingStatusMessage.ts`

```typescript
const MESSAGES = {
  draft_generating: [
    'Анализируем контент урока...',
    'Подбираем визуальный стиль...',
    'Генерируем варианты...',
  ],
  generating: ['Создаём изображение...', 'Обрабатываем детали...', 'Почти готово...'],
};

// Сменять сообщение каждые 4 секунды
```

#### 2.4. Интеграция в EnrichmentGeneratingCard

**Файл:** `packages/web/components/course/viewer/components/EnrichmentGeneratingCard.tsx`

- Использовать `useSmoothProgress` с asymptotic crawl
- Добавить shimmer эффект
- Показывать rotating messages
- Пульсировать иконку при застое

**Визуальный результат:**

```
[████████████████▓▓░░░░░░░░░░░░] 53%  ← медленно ползёт
           ~~~~shimmer~~~~
Подбираем визуальный стиль... ← меняется каждые 4 сек
```

---

## Критические файлы

### Часть 1 (показ вариантов — КРИТИЧНО)

| Файл                                                                        | Изменение                                                |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`     | Логика: при draft_ready показывать варианты, не прогресс |
| `packages/web/components/course/viewer/components/CoverVariantSelector.tsx` | **НОВЫЙ** - компактный компонент выбора вариантов        |
| `packages/web/lib/hooks/useEnrichmentGeneration.ts`                         | Добавить `approveCoverDraft` mutation                    |
| `packages/shared-types/src/enrichment-on-demand.ts`                         | Разделить: `isProgressStatus` vs `isAwaitingSelection`   |

### Часть 2 (плавный прогресс — улучшение)

| Файл                                                                            | Изменение                             |
| ------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/web/lib/hooks/useSmoothProgress.ts`                                   | Asymptotic crawl + stalled detection  |
| `packages/web/components/ui/smooth-progress.tsx`                                | Shimmer overlay                       |
| `packages/web/components/course/viewer/components/EnrichmentGeneratingCard.tsx` | Интеграция + rotating messages        |
| `packages/web/lib/hooks/useRotatingStatusMessage.ts`                            | **НОВЫЙ** - хук для rotating messages |

---

## Порядок реализации

1. **Часть 1 сначала** (критично):
   - Без этого генерация не завершается
   - Разблокирует 4 застрявших enrichments

2. **Часть 2 потом** (улучшение):
   - Улучшит UX во время Phase 1 и Phase 2

---

## Верификация

1. **Type-check:** `pnpm type-check`
2. **Build:** `pnpm build`
3. **Manual test Часть 1:**
   - Перейти на урок с cover в статусе `draft_ready`
   - Должны показаться 3 варианта описаний
   - Выбрать вариант → нажать "Сгенерировать"
   - Phase 2 запускается, прогресс 75% → 100%
4. **Manual test Часть 2:**
   - Начать новую генерацию cover
   - Прогресс плавно ползёт (не застывает)
   - Shimmer эффект на прогресс-баре
   - Текст меняется каждые 4 секунды
5. **Проверить БД:**
   ```sql
   SELECT status, COUNT(*) FROM lesson_enrichments
   WHERE enrichment_type = 'cover' GROUP BY status;
   -- После теста: completed (не draft_ready)
   ```
