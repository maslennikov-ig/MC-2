# План: Ручное управление Visual Enrichments

## Цель

Перевести генерацию изображений (card, cover) с автоматического режима на ручной (on-demand), добавить UI для управления визуальными ассетами курса и уроков.

## Текущее состояние

### Auto-triggers в workflow:

| Место                            | Функция                    | Статус      |
| -------------------------------- | -------------------------- | ----------- |
| Stage 5 handler.ts:917-926       | `triggerCourseCard()`      | **АКТИВНА** |
| Stage 5 handler.ts:932-962       | `triggerAllLessonCovers()` | Отключена   |
| Stage 6 job-processor.ts:509-515 | `triggerLessonCard()`      | Отключена   |

### On-demand API (tRPC):

- **Поддерживаются**: quiz, audio, presentation
- **Не поддерживаются**: card, cover

### UI компоненты:

- `EnrichmentPlaceholderCard` - on-demand генерация quiz/audio/presentation
- `LessonCoverHero` - отображение cover (если есть)
- Нет UI для генерации card/cover вручную

---

## Шаги реализации

### Фаза 1: Отключение auto-triggers

**1.1. Отключить `triggerCourseCard()` в Stage 5**

Файл: `packages/course-gen-platform/src/stages/stage5-generation/handler.ts`

```typescript
// Строки 917-926: закомментировать блок
// DISABLED: Auto card generation - now manual via UI
// triggerCourseCard({
//   courseId: course_id,
//   userId: user_id,
//   organizationId: organization_id,
// }).catch(err => { ... });
```

**1.2. Удалить импорт (если не используется)**

```typescript
// Строка 44-46: оставить только если нужны для manual triggers
import {} from // triggerCourseCard,  // DISABLED
// triggerAllLessonCovers,  // DISABLED
'../stage7-enrichments/services/auto-card-trigger';
```

---

### Фаза 2: Расширение On-Demand API

**2.1. Добавить типы для visual enrichments**

Файл: `packages/shared-types/src/enrichment-on-demand.ts`

```typescript
// Расширить onDemandEnrichmentTypeSchema
export const onDemandEnrichmentTypeSchema = z.enum([
  'quiz',
  'audio',
  'presentation',
  'card',
  'cover', // НОВЫЕ
]);

// Добавить настройки для card/cover
export const onDemandCardSettingsSchema = z
  .object({
    style: z.enum(['realistic', 'abstract', 'minimalist']).default('realistic'),
    colorScheme: z.enum(['auto', 'warm', 'cool', 'monochrome']).default('auto'),
  })
  .optional();

export const onDemandCoverSettingsSchema = z
  .object({
    style: z.enum(['realistic', 'abstract', 'minimalist', 'dramatic']).default('realistic'),
    colorScheme: z.enum(['auto', 'warm', 'cool', 'monochrome']).default('auto'),
    includeTitle: z.boolean().default(false),
  })
  .optional();
```

**2.2. Обновить generateOnDemand процедуру**

Файл: `packages/course-gen-platform/src/server/routers/enrichment/procedures/generate-on-demand.ts`

- Добавить обработку типов `card` и `cover`
- Передавать settings в job

**2.3. Обновить enrichment-router.ts**

Файл: `packages/course-gen-platform/src/stages/stage7-enrichments/services/enrichment-router.ts`

- Убедиться что card/cover handlers вызываются для on-demand jobs

---

### Фаза 3: UI для генерации изображений

**3.1. Создать ImagePlaceholderCard компонент**

Файл: `packages/web/components/course/viewer/components/ImagePlaceholderCard.tsx`

Аналог `EnrichmentPlaceholderCard` для визуальных ассетов:

- Тип: cover или card
- Опции: style, colorScheme, includeTitle
- Показ estimated cost (~$0.04)
- Кнопка "Generate"

**3.2. Добавить секцию "Images" в EnrichmentsPanel**

Файл: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

```tsx
// В начале панели добавить секцию
<section className="space-y-4">
  <h3>Images</h3>
  {hasCover ? (
    <ImageEnrichmentCard type="cover" enrichment={coverEnrichment} />
  ) : (
    <ImagePlaceholderCard type="cover" lessonId={lessonId} />
  )}
</section>
```

**3.3. Добавить placeholder в LessonContent когда cover отсутствует**

Файл: `packages/web/components/common/lesson-content.tsx`

Вместо пустого места показать:

```tsx
{
  hasCover ? (
    <LessonCoverHero cover={coverEnrichment} />
  ) : (
    <CoverPlaceholder lessonId={lessonId} onGenerate={handleGenerate} />
  );
}
```

**3.4. Расширить useEnrichmentGeneration hook**

Файл: `packages/web/lib/hooks/useEnrichmentGeneration.ts`

- Добавить поддержку типов `card` и `cover`
- Те же polling/progress механизмы

---

### Фаза 4: Страница управления визуальными ассетами курса

**4.1. Создать страницу `/courses/[slug]/visuals`**

Файл: `packages/web/app/[locale]/courses/[slug]/visuals/page.tsx`

Содержимое:

- **Course Thumbnail** - генерация/регенерация course card
- **Lesson Covers** - batch операции для всех covers
- **Lesson Cards** - batch операции для всех cards (опционально)

**4.2. Создать CourseVisualsManager компонент**

Файл: `packages/web/components/course/CourseVisualsManager.tsx`

Функциональность:

- Показ статуса: N/M сгенерировано
- Batch settings: style, colorScheme
- Кнопка "Generate Missing"
- Progress bar при batch генерации
- Список уроков с индивидуальными кнопками

**4.3. Добавить batch API эндпоинты**

Файл: `packages/course-gen-platform/src/server/routers/enrichment/router.ts`

```typescript
generateBatchCovers: protectedProcedure
  .input(z.object({
    courseId: z.string().uuid(),
    settings: onDemandCoverSettingsSchema,
    skipExisting: z.boolean().default(true),
  }))
  .mutation(async ({ ctx, input }) => {
    // Использовать существующую логику из triggerAllLessonCovers
  }),

generateBatchCards: protectedProcedure
  .input(z.object({
    courseId: z.string().uuid(),
    settings: onDemandCardSettingsSchema,
    skipExisting: z.boolean().default(true),
  }))
  .mutation(async ({ ctx, input }) => {
    // Использовать существующую логику из triggerAllLessonCards
  }),
```

---

### Фаза 5: UI/UX улучшения

**5.1. Показ стоимости перед генерацией (в токенах)**

Стоимость отображается в токенах (внутренняя валюта платформы), а не в долларах.

В `ImagePlaceholderCard`:

```tsx
<Badge variant="outline" className="text-muted-foreground">
  <Coins className="h-3 w-3 mr-1" />
  ~5000 токенов
</Badge>
```

В batch UI:

```tsx
<p className="text-sm text-muted-foreground">
  Estimated cost: ~{missingCount * 5000} токенов ({missingCount} images)
</p>
```

**Примечание:** Конкретное значение токенов (5000) нужно уточнить на основе текущей конфигурации системы тарификации.

**5.2. Добавить i18n переводы**

Файлы: `packages/web/messages/{en,ru}/enrichments.json`

```json
{
  "images": {
    "title": "Images",
    "cover": {
      "title": "Lesson Cover",
      "description": "Hero banner displayed at the top of the lesson",
      "generateButton": "Generate Cover"
    },
    "card": {
      "title": "Lesson Thumbnail",
      "description": "Small preview image for navigation"
    },
    "style": {
      "realistic": "Realistic",
      "abstract": "Abstract",
      "minimalist": "Minimalist"
    },
    "estimatedCost": "Estimated cost",
    "tokens": "tokens"
  }
}
```

**5.3. Добавить кнопку доступа к Visuals page**

В `Toolbar.tsx` или course header:

```tsx
<Button variant="outline" asChild>
  <Link href={`/courses/${slug}/visuals`}>
    <ImageIcon className="h-4 w-4 mr-2" />
    Manage Images
  </Link>
</Button>
```

---

## Файлы для изменения

### Backend (course-gen-platform)

| Файл                                                         | Изменения                        |
| ------------------------------------------------------------ | -------------------------------- |
| `stages/stage5-generation/handler.ts`                        | Отключить triggerCourseCard      |
| `server/routers/enrichment/procedures/generate-on-demand.ts` | Добавить card/cover              |
| `server/routers/enrichment/router.ts`                        | Добавить batch endpoints         |
| `stages/stage7-enrichments/services/enrichment-router.ts`    | Проверить routing для card/cover |

### Shared Types

| Файл                                       | Изменения                    |
| ------------------------------------------ | ---------------------------- |
| `shared-types/src/enrichment-on-demand.ts` | Типы для card/cover settings |

### Frontend (web)

| Файл                                                           | Изменения                   |
| -------------------------------------------------------------- | --------------------------- |
| `components/course/viewer/components/EnrichmentsPanel.tsx`     | Добавить Images секцию      |
| `components/course/viewer/components/ImagePlaceholderCard.tsx` | **НОВЫЙ**                   |
| `components/course/viewer/components/ImageEnrichmentCard.tsx`  | **НОВЫЙ**                   |
| `components/common/lesson-content.tsx`                         | Placeholder когда нет cover |
| `components/course/CourseVisualsManager.tsx`                   | **НОВЫЙ**                   |
| `app/[locale]/courses/[slug]/visuals/page.tsx`                 | **НОВАЯ СТРАНИЦА**          |
| `lib/hooks/useEnrichmentGeneration.ts`                         | Поддержка card/cover        |
| `lib/generation-graph/enrichment-config.ts`                    | Конфиг для card/cover       |
| `messages/en/enrichments.json`                                 | Переводы                    |
| `messages/ru/enrichments.json`                                 | Переводы                    |

---

## Верификация

### После Фазы 1:

- [ ] Type-check проходит
- [ ] Новые курсы НЕ генерируют карточки автоматически
- [ ] Логи Stage 5 не содержат "triggerCourseCard"

### После Фазы 2:

- [ ] `generateOnDemand` принимает type='cover' и type='card'
- [ ] Job создается в очереди stage7-enrichments
- [ ] Изображение генерируется и сохраняется

### После Фазы 3:

- [ ] В "Media" табе есть секция "Images"
- [ ] Placeholder показывается когда cover отсутствует
- [ ] Кнопка "Generate" запускает генерацию
- [ ] Progress отображается во время генерации
- [ ] Готовое изображение отображается

### После Фазы 4:

- [ ] Страница `/courses/[slug]/visuals` открывается
- [ ] Batch "Generate Missing Covers" работает
- [ ] Progress показывает N/M

### После Фазы 5:

- [ ] Стоимость отображается в токенах (~5000 токенов)
- [ ] Локализация работает (en/ru)
- [ ] Кнопка в toolbar ведет на visuals page

---

## Риски и митигации

| Риск                                         | Митигация                                             |
| -------------------------------------------- | ----------------------------------------------------- |
| Пользователи ожидают автоматические карточки | Добавить onboarding tooltip, batch кнопку             |
| Высокая стоимость генерации                  | Показывать стоимость в токенах перед генерацией       |
| Race conditions при batch                    | Использовать существующую логику из auto-card-trigger |
