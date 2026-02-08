# Техническое задание: Отображение автоматических карточек в панели деталей нод

**Дата создания**: 2026-01-06
**Статус**: Draft
**Приоритет**: P2

---

## 1. Контекст

### 1.1 Текущее состояние

В системе реализована автоматическая генерация карточек (cards) после завершения этапов:

- **Stage 5** → `triggerCourseCard()` — карточка курса (1024×1024, квадрат)
- **Stage 6** → `triggerLessonCard()` — карточка урока (1024×1024, квадрат)

**Генерация использует visual_style из Stage 4:**

```typescript
// card-handler.ts:134-170
function getVisualStyle(course) {
  // Извлекает colorScheme, aesthetic, visualElements, mood
  // Использует для генерации промпта карточки
}
```

**Проблема**: Сгенерированные карточки **НЕ отображаются** при двойном клике на ноду Stage 5 или Stage 6. Пользователь не видит результат автоматической генерации в контексте этапа.

### 1.2 Отличие от Enrichments

| Характеристика | Автоматические карточки (Cards) | Enrichment обложки (Covers)  |
| -------------- | ------------------------------- | ---------------------------- |
| Триггер        | Автоматически после Stage 5/6   | Вручную через UI             |
| Размер         | 1024×1024 (1:1 квадрат)         | 1280×720 (16:9)              |
| Модель         | GPT-5 Image Mini ($0.007)       | SeedDream 4.5 ($0.042)       |
| Назначение     | Каталог курсов, навигация       | Hero-баннер урока            |
| Отображение    | В панели Stage 5/6              | В панели Stage 7 (Inspector) |

---

## 2. Требования

### 2.1 Функциональные требования

**FR-001**: При двойном клике на ноду Stage 5 (структура курса) должна отображаться автоматически сгенерированная карточка курса

**FR-002**: При двойном клике на ноду Stage 6 (урок) должна отображаться автоматически сгенерированная карточка урока

**FR-003**: Карточки должны генерироваться с использованием visual_style из Stage 4 для единой стилистики курса

**FR-004**: Отображение карточки не должно смешиваться с Enrichments — это отдельная секция

**FR-005**: Должно отображаться состояние генерации: pending, generating, completed, error

### 2.2 Нефункциональные требования

**NFR-001**: Изображение карточки должно кэшироваться для быстрой загрузки

**NFR-002**: При ошибке загрузки показывать placeholder с информацией о статусе

**NFR-003**: Адаптивный размер изображения (responsive)

---

## 3. Дизайн интерфейса

### 3.1 Stage 5 OutputTab — Карточка курса

**Расположение**: Новая секция **"Обложка курса"** (Course Card) после секции "Course Structure"

```
┌─────────────────────────────────────────────────────────┐
│ Stage 5 Output                                          │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📋 Metadata Card (existing)                          │ │
│ │ Course title, description, outcomes, prerequisites   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🌳 Structure Tree (existing)                         │ │
│ │ Sections & Lessons tree view                         │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🖼️ Course Card [NEW]                                 │ │
│ │ ┌─────────┐  Card title: "Обложка курса"             │ │
│ │ │         │  Status badge: ✓ Ready / ⏳ Generating   │ │
│ │ │  1024   │  Visual style info (color scheme)        │ │
│ │ │    ×    │  Generated at timestamp                  │ │
│ │ │  1024   │  Model: GPT-5 Image Mini                 │ │
│ │ │         │                                          │ │
│ │ └─────────┘  [Regenerate] button                     │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Stage 6 InspectorContent — Карточка урока

**Вариант A (рекомендуемый)**: Новая 5-я вкладка **"Card"**

```
┌─────────────────────────────────────────────────────────┐
│ [Preview] [Quality] [Blueprint] [Trace] [Card ✨]       │
├─────────────────────────────────────────────────────────┤
│ StatsStrip (existing)                                   │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────┐   │
│ │  Lesson Card                                       │   │
│ │  ┌──────────────┐                                  │   │
│ │  │              │  Status: ✓ Ready                 │   │
│ │  │    1024×     │  Generated: 2026-01-06 12:30     │   │
│ │  │     1024     │  Visual style: Blue gradients    │   │
│ │  │              │  Cost: $0.007                    │   │
│ │  └──────────────┘                                  │   │
│ │                                                    │   │
│ │  [🔄 Regenerate]                                   │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Вариант B**: Секция справа в Preview tab (для компактности)

```
┌─────────────────────────────────────────────────────────┐
│ Preview Tab                                             │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────────────────┬──────────────────────┐    │
│ │ Lesson Content            │ Lesson Card          │    │
│ │ (Markdown preview)        │ ┌────────────┐       │    │
│ │                           │ │            │       │    │
│ │ ...markdown content...    │ │   1:1      │       │    │
│ │                           │ │   image    │       │    │
│ │                           │ │            │       │    │
│ │                           │ └────────────┘       │    │
│ │                           │ [Regenerate]         │    │
│ └───────────────────────────┴──────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Технический дизайн

### 4.1 Компоненты

#### 4.1.1 AutoCardPreview (общий компонент)

```typescript
// packages/web/components/generation-graph/panels/shared/AutoCardPreview.tsx

interface AutoCardPreviewProps {
  /** Card type: course or lesson */
  cardType: 'course' | 'lesson';
  /** Course ID for fetching card */
  courseId: string;
  /** Lesson ID (only for lesson cards) */
  lessonId?: string;
  /** Locale for translations */
  locale?: 'ru' | 'en';
  /** Compact mode for sidebar display */
  compact?: boolean;
  /** Callback for regeneration */
  onRegenerate?: () => void;
}

interface CardData {
  imageUrl: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  generatedAt?: string;
  visualStyle?: {
    colorScheme: string;
    aesthetic: string;
  };
  error?: string;
}
```

#### 4.1.2 Hook для получения карточки

```typescript
// packages/web/hooks/useAutoCard.ts

function useAutoCard(params: {
  courseId: string;
  lessonId?: string;
  cardType: 'course' | 'lesson';
}): {
  card: CardData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};
```

### 4.2 API / tRPC процедуры

#### 4.2.1 Получение карточки

```typescript
// packages/course-gen-platform/src/server/routers/enrichment/procedures/get-auto-card.ts

export const getAutoCard = publicProcedure
  .input(
    z.object({
      courseId: z.string().uuid(),
      lessonId: z.string().uuid().optional(),
      cardType: z.enum(['course', 'lesson']),
    })
  )
  .query(async ({ input }) => {
    // Для course card: title = 'course-card'
    // Для lesson card: enrichment_type = 'card' AND title != 'course-card'
    const query = supabase
      .from('lesson_enrichments')
      .select('id, status, content, metadata, updated_at')
      .eq('course_id', input.courseId)
      .eq('enrichment_type', 'card');

    if (input.cardType === 'course') {
      query.eq('title', 'course-card');
    } else if (input.lessonId) {
      query.eq('lesson_id', input.lessonId).neq('title', 'course-card');
    }

    return query.maybeSingle();
  });
```

#### 4.2.2 Регенерация карточки

```typescript
// packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate-auto-card.ts

export const regenerateAutoCard = protectedProcedure
  .input(
    z.object({
      courseId: z.string().uuid(),
      lessonId: z.string().uuid().optional(),
      cardType: z.enum(['course', 'lesson']),
    })
  )
  .mutation(async ({ input }) => {
    // 1. Update status to 'pending'
    // 2. Re-trigger card generation via auto-card-trigger
  });
```

### 4.3 Интеграция с существующими компонентами

#### Stage 5: Stage5OutputTab.tsx

```diff
+ import { AutoCardPreview } from '../shared/AutoCardPreview';

  export const Stage5OutputTab = memo<Stage5OutputTabProps>(function Stage5OutputTab({
    outputData,
    courseId,
    ...
  }) {
    return (
      <div className="space-y-4 p-1">
        {/* Existing Metadata Card */}
        <Card>...</Card>

        {/* Existing Structure Tree Card */}
        <Card>...</Card>

+       {/* NEW: Course Card Preview */}
+       <AutoCardPreview
+         cardType="course"
+         courseId={courseId}
+         locale={locale}
+       />
      </div>
    );
  });
```

#### Stage 6: Stage6InspectorContent.tsx

```diff
+ import { AutoCardPreview } from '../shared/AutoCardPreview';

  export const Stage6InspectorContent = memo(function Stage6InspectorContent({
    ...
+   lessonId,
+   courseId,
  }) {
-   const [activeTab, setActiveTab] = useState<'preview' | 'quality' | 'blueprint' | 'trace'>('preview');
+   const [activeTab, setActiveTab] = useState<'preview' | 'quality' | 'blueprint' | 'trace' | 'card'>('preview');

    return (
      <div>
        <Tabs>
          <TabsList>
            <TabsTrigger value="preview">{labels.preview}</TabsTrigger>
            <TabsTrigger value="quality">{labels.quality}</TabsTrigger>
            <TabsTrigger value="blueprint">{labels.blueprint}</TabsTrigger>
            <TabsTrigger value="trace">{labels.trace}</TabsTrigger>
+           <TabsTrigger value="card">{labels.card}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Tab content */}
+       {activeTab === 'card' && (
+         <AutoCardPreview
+           cardType="lesson"
+           courseId={courseId}
+           lessonId={lessonId}
+           locale={locale}
+         />
+       )}
      </div>
    );
  });
```

---

## 5. Visual Style Integration

### 5.1 Цепочка использования visual_style

```
Stage 4 (Analysis)
    ↓
visual-style-generator.ts
    ↓
courses.visual_style (JSONB column)
    ↓
card-handler.ts → getVisualStyle()
    ↓
Image generation prompt includes:
  - colorScheme
  - aesthetic
  - visualElements
  - mood
    ↓
Generated card image (consistent with course style)
```

### 5.2 Отображение стиля в UI

В компоненте AutoCardPreview показывать информацию о visual_style:

```tsx
<div className="text-sm text-muted-foreground">
  <span className="font-medium">Visual Style:</span>
  <Badge variant="outline">{visualStyle.colorScheme}</Badge>
  <Badge variant="outline">{visualStyle.aesthetic}</Badge>
</div>
```

---

## 6. Состояния карточки

### 6.1 Pending (ожидание)

```
┌─────────────────────┐
│  ⏳ Generating...   │
│  ┌───────────────┐  │
│  │ ░░░░░░░░░░░░░ │  │
│  │ ░░ skeleton ░░│  │
│  │ ░░░░░░░░░░░░░ │  │
│  └───────────────┘  │
│  Card is being      │
│  generated...       │
└─────────────────────┘
```

### 6.2 Completed (готово)

```
┌─────────────────────┐
│  ✓ Ready            │
│  ┌───────────────┐  │
│  │               │  │
│  │  [Image]      │  │
│  │               │  │
│  └───────────────┘  │
│  Generated: 12:30   │
│  [🔄 Regenerate]    │
└─────────────────────┘
```

### 6.3 Error (ошибка)

```
┌─────────────────────┐
│  ⚠️ Error           │
│  ┌───────────────┐  │
│  │  ❌ Failed    │  │
│  │  to generate  │  │
│  └───────────────┘  │
│  Error: timeout     │
│  [🔄 Retry]         │
└─────────────────────┘
```

---

## 7. Задачи реализации

### Phase 1: Backend API (2 задачи)

- [ ] **T001**: Создать tRPC процедуру `getAutoCard` для получения карточки
- [ ] **T002**: Создать tRPC процедуру `regenerateAutoCard` для регенерации

### Phase 2: Shared Components (3 задачи)

- [ ] **T003**: Создать hook `useAutoCard` для получения данных карточки
- [ ] **T004**: Создать компонент `AutoCardPreview` с состояниями
- [ ] **T005**: Добавить переводы для card labels (ru/en)

### Phase 3: Stage 5 Integration (2 задачи)

- [ ] **T006**: Расширить props `Stage5OutputTab` для courseId
- [ ] **T007**: Добавить секцию Course Card в Stage5OutputTab

### Phase 4: Stage 6 Integration (3 задачи)

- [ ] **T008**: Расширить props `Stage6InspectorContent` для lessonId/courseId
- [ ] **T009**: Добавить вкладку "Card" в Stage6InspectorContent
- [ ] **T010**: Интегрировать AutoCardPreview в Card tab

### Phase 5: Testing & Polish (2 задачи)

- [ ] **T011**: Добавить unit-тесты для useAutoCard hook
- [ ] **T012**: E2E тест: двойной клик → отображение карточки

---

## 8. Зависимости

### 8.1 Существующий код (без изменений)

- `auto-card-trigger.ts` — триггеры генерации карточек
- `card-handler.ts` — обработчик генерации (использует visual_style)
- `visual-style-generator.ts` — генерация visual_style в Stage 4
- `CardEnrichmentContent` — Zod schema для content карточки

### 8.2 Требуется расширить

| Файл                         | Изменение                                      |
| ---------------------------- | ---------------------------------------------- |
| `Stage5OutputTab.tsx`        | Добавить props courseId, секция карточки       |
| `Stage6InspectorContent.tsx` | Добавить props lessonId/courseId, вкладка Card |
| `enrichment/router.ts`       | Добавить getAutoCard, regenerateAutoCard       |
| `translations.ts`            | Добавить labels для карточки                   |

---

## 9. Acceptance Criteria

1. **AC-001**: При двойном клике на ноду Stage 5 отображается карточка курса (или состояние генерации)
2. **AC-002**: При двойном клике на ноду Stage 6 отображается карточка урока во вкладке "Card"
3. **AC-003**: Карточка содержит информацию о visual_style (color scheme, aesthetic)
4. **AC-004**: Кнопка "Regenerate" перезапускает генерацию карточки
5. **AC-005**: Состояния pending/generating/completed/error корректно отображаются
6. **AC-006**: UI адаптивен (responsive) для разных размеров экрана

---

## 10. Риски и митигация

| Риск                          | Вероятность | Митигация                            |
| ----------------------------- | ----------- | ------------------------------------ |
| Карточка ещё не сгенерирована | Высокая     | Показывать skeleton с estimated time |
| visual_style отсутствует      | Средняя     | Использовать fallback стиль          |
| Большой размер изображения    | Низкая      | WebP формат, lazy loading            |

---

## 11. Метрики успеха

- **Охват**: 100% нод Stage 5/6 показывают карточку (или состояние генерации)
- **Производительность**: Загрузка карточки < 500ms
- **UX**: Пользователь понимает, что это автоматическая обложка (не enrichment)

---

## Appendix A: Существующие файлы (reference)

```
packages/course-gen-platform/src/stages/stage7-enrichments/
├── handlers/
│   └── card-handler.ts              # GPT-5 Mini, 1024×1024, uses visual_style
├── services/
│   └── auto-card-trigger.ts         # triggerCourseCard(), triggerLessonCard()

packages/course-gen-platform/src/stages/stage4-analysis/
└── utils/
    └── visual-style-generator.ts    # generateVisualStyle() → colorScheme, aesthetic, etc.

packages/web/components/generation-graph/panels/
├── stage5/
│   └── Stage5OutputTab.tsx          # Currently: Metadata + Structure Tree
├── stage6/inspector/
│   └── Stage6InspectorContent.tsx   # Currently: Preview | Quality | Blueprint | Trace
└── shared/
    └── AutoCardPreview.tsx          # NEW: Shared card preview component
```

---

**Автор**: Claude Code (Orchestrator)
**Версия**: 1.0
