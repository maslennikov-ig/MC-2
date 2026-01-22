# План: Использование обложек курсов

## Резюме

**Задача**: Интегрировать генерируемую обложку курса в UI
**Приоритеты**: Карточки курсов + OG Image при шаринге
**Особенность**: Обложка квадратная (1024x1024), модель `openai/gpt-5-image-mini`

---

## Текущее состояние

### Генерация

- **Модель**: `openai/gpt-5-image-mini` (OpenRouter)
- **Размер**: 1024x1024 (1:1 квадрат)
- **Стоимость**: $0.007 за изображение
- **Формат**: WebP (после конверсии)
- **Файл**: `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/card-handler.ts`

### Хранение

- **Таблица**: `lesson_enrichments`
- **Фильтр**: `enrichment_type='card'` AND `title='course-card'`
- **Storage**: Supabase bucket `course-enrichments`
- **URL**: `content.imageUrl`

### Использование сейчас

- ❌ Карточки курсов — только текст
- ❌ OG Image — статический
- ✅ Обложки уроков — работают (LessonCoverHero)

---

## План реализации

### Задача 1: Карточки курсов (Высокий приоритет)

**Файл**: `packages/web/app/[locale]/courses/_components/course-card.tsx`

**Текущая структура карточки**:

```
┌─────────────────────────────┐
│ [Badges: статус, сложность] │  CardHeader
│ Заголовок курса             │
├─────────────────────────────┤
│ Описание                    │  CardContent
│ Целевая аудитория           │
│ Результаты обучения         │
│ ┌─────┬─────┬─────┬─────┐   │
│ │Модул│Уроки│Время│Язык │   │  Stats grid
│ └─────┴─────┴─────┴─────┘   │
├─────────────────────────────┤
│     [Открыть курс →]        │  Button
├─────────────────────────────┤
│ ♥ 🔗 👁 🔧 🗑                │  CardFooter
└─────────────────────────────┘
```

**Варианты дизайна с квадратной обложкой**:

---

### Вариант A: Обложка как ФОН карточки

```
┌─────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  ← Обложка как background
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│    с gradient overlay
│░░░░░ [Badges] ░░░░░░░░░░░░░░│
│░░░░░ Заголовок ░░░░░░░░░░░░░│
│░░░░░ Описание... ░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
├─────────────────────────────┤
│ Модули | Уроки | Время      │  ← Статистика на светлом фоне
│     [Открыть курс →]        │
└─────────────────────────────┘
```

**Плюсы**:

- ✅ **Максимально визуальный эффект** — вся карточка "живая"
- ✅ **Уникальность** — каждый курс выглядит по-своему
- ✅ **Современный тренд** — Netflix, Spotify, Apple TV+ используют этот подход
- ✅ **Квадрат хорошо растягивается** — можно использовать `object-cover`

**Минусы**:

- ⚠️ **Читаемость текста** — нужен gradient overlay (затемнение снизу)
- ⚠️ **Качество обложки важнее** — плохая картинка испортит вид
- ⚠️ **Сложнее accessibility** — контраст текста может быть недостаточным
- ⚠️ **Курсы без обложки** — нужен красивый fallback gradient

---

### Вариант B: Обложка сверху (отдельный блок)

```
┌─────────────────────────────┐
│    ┌─────────────────┐      │
│    │                 │      │  Cover 1:1
│    │   [ОБЛОЖКА]     │      │  ~120-150px
│    │                 │      │
│    └─────────────────┘      │
├─────────────────────────────┤
│ [Badges] Заголовок          │
│ Описание...                 │
│ Модули: 5 | Уроки: 20       │
├─────────────────────────────┤
│     [Открыть курс →]        │
└─────────────────────────────┘
```

**Плюсы**:

- ✅ **Чёткое разделение** — картинка отдельно, текст отдельно
- ✅ **100% читаемость** — текст на чистом фоне
- ✅ **Проще реализовать** — не нужны overlay/gradient
- ✅ **Классический подход** — Coursera, Udemy, Skillshare

**Минусы**:

- ⚠️ **Занимает больше места** — карточка становится выше
- ⚠️ **Менее эффектно** — стандартный вид
- ⚠️ **Квадрат vs aspect** — квадрат 1:1 смотрится "тяжело" сверху

---

### Вариант C: Обложка слева (компактный)

```
┌───────┬─────────────────────┐
│       │ [Badges]            │
│ COVER │ Заголовок           │
│ 1:1   │ Описание...         │
│ 100px │ Модули | Уроки      │
│       │ [Открыть →]         │
└───────┴─────────────────────┘
```

**Плюсы**:

- ✅ **Компактность** — меньше высота карточки
- ✅ **Квадрат идеален** — 1:1 сбоку смотрится органично
- ✅ **Лучше для list view** — экономит вертикальное пространство

**Минусы**:

- ⚠️ **Меньше места для текста** — сжатое описание
- ⚠️ **Маленькая картинка** — ~100px не покажет детали
- ⚠️ **Не так визуально** — меньший акцент на обложке

---

## 🎯 Рекомендация

**Вариант A (фон)** — для вашего случая оптимален:

1. **Визуальный эффект максимальный** при минимуме изменений layout
2. **Квадратная обложка идеально подходит** — `object-cover` обрежет лишнее
3. **GPT-5 Image Mini генерирует качественные картинки** — можно использовать как фон
4. **Современно** — выделит платформу среди конкурентов
5. **Fallback прост** — gradient на основе `visual_style` курса

**Реализация**:

```tsx
<Card className="relative overflow-hidden">
  {/* Background image */}
  {coverUrl && (
    <div className="absolute inset-0">
      <Image src={coverUrl} fill className="object-cover" />
      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
    </div>
  )}

  {/* Content with relative positioning */}
  <div className="relative z-10 text-white">{/* ... existing content ... */}</div>
</Card>
```

**Изменения**:

1. Добавить prop `coverUrl?: string` в `CourseCardProps`
2. Получать cover из `lesson_enrichments` в parent компоненте
3. Рендерить `<Image>` с `object-cover` и `aspect-ratio: 1/1`
4. Fallback: gradient placeholder или иконка курса

**SQL для получения обложки**:

```sql
SELECT
  c.*,
  le.content->>'imageUrl' as cover_url
FROM courses c
LEFT JOIN lesson_enrichments le ON le.course_id = c.id
  AND le.enrichment_type = 'card'
  AND le.title = 'course-card'
WHERE c.user_id = $1
```

---

### Задача 2: OG Image для шаринга (Высокий приоритет)

**Текущее состояние**: Статический `og-image.jpg` для всего сайта

**Цель**: Динамический OG image для каждого курса

**Подход**: Next.js Image Response API (`@vercel/og`)

**Новый файл**: `packages/web/app/api/og/course/[slug]/route.tsx`

```typescript
import { ImageResponse } from 'next/og'

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  // 1. Получить данные курса и обложку
  // 2. Вернуть ImageResponse с композицией:
  //    - Фон с обложкой (или gradient)
  //    - Название курса
  //    - Лого платформы

  return new ImageResponse(
    <div style={{ /* 1200x630 layout */ }}>
      <img src={coverUrl} style={{ position: 'absolute', ... }} />
      <div style={{ /* overlay */ }}>
        <h1>{course.title}</h1>
        <p>{course.course_description}</p>
      </div>
    </div>,
    { width: 1200, height: 630 }
  )
}
```

**Дизайн OG image (1200x630)**:

```
┌──────────────────────────────────────┐
│                                      │
│  ┌────────┐                          │
│  │        │  НАЗВАНИЕ КУРСА          │
│  │ COVER  │                          │
│  │  1:1   │  Краткое описание...     │
│  │        │                          │
│  └────────┘                          │
│                          [ЛОГО]      │
└──────────────────────────────────────┘
```

**Интеграция в metadata**:

```typescript
// packages/web/app/[locale]/courses/[slug]/page.tsx
export async function generateMetadata({ params }) {
  return {
    openGraph: {
      images: [`/api/og/course/${params.slug}`],
    },
  };
}
```

---

## Технические детали

### Получение обложки курса

**Server Component / Server Action**:

```typescript
async function getCourseCover(courseId: string): Promise<string | null> {
  const { data } = await supabase
    .from('lesson_enrichments')
    .select('content')
    .eq('course_id', courseId)
    .eq('enrichment_type', 'card')
    .eq('title', 'course-card')
    .maybeSingle();

  return data?.content?.imageUrl ?? null;
}
```

### Fallback для курсов без обложки

Когда обложка ещё не сгенерирована:

1. **Gradient placeholder** на основе course.visual_style
2. **Иконка категории** (если есть)
3. **Первая буква названия** в стилизованном круге

---

## Файлы для изменения

| Файл                                  | Изменение                     |
| ------------------------------------- | ----------------------------- |
| `courses/_components/course-card.tsx` | Добавить отображение обложки  |
| `courses/page.tsx`                    | Запрашивать обложки в queries |
| `app/api/og/course/[slug]/route.tsx`  | Создать (новый)               |
| `courses/[slug]/page.tsx`             | Добавить dynamic OG metadata  |
| `lib/supabase/queries.ts`             | Добавить query для обложки    |

---

## Проверка

1. Карточки курсов:
   - Открыть `/courses`
   - Убедиться что курсы с готовой обложкой показывают её
   - Курсы без обложки показывают placeholder

2. OG Image:
   - Открыть `/api/og/course/{slug}` напрямую — должен вернуть PNG
   - Проверить через https://www.opengraph.xyz/
   - Поделиться ссылкой в Telegram/Slack — должна показаться карточка
