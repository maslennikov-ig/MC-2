# План: Плавная загрузка изображений (Image Loading UX)

## Проблема

Все картинки загружаются с "flash" эффектом — сначала пустое место, потом резкое появление:

- **Обложки курсов** на странице `/courses` (карточки курсов)
- **Карточки уроков** внутри курса (enrichment cards)
- **Обложки уроков** (lesson covers)

## Причины

1. **Нет skeleton/loading state** — пустое место вместо индикатора загрузки
2. **Нет fade-in анимации** — резкое появление вместо плавного

## Решение

Применить паттерн из `LessonCoverHero.tsx` (единственный компонент с хорошим UX) ко всем image компонентам.

---

## Файлы для изменения

| Файл                                                          | Что отображает                     | Изменения                   |
| ------------------------------------------------------------- | ---------------------------------- | --------------------------- |
| `app/[locale]/courses/_components/course-card.tsx`            | **Обложки курсов** (Course Covers) | Добавить skeleton + fade-in |
| `components/course/viewer/components/EnrichmentCardImage.tsx` | **Карточки уроков** (Lesson Cards) | Добавить skeleton + fade-in |

**Примечание:** `UnifiedEnrichmentCard.tsx` использует `EnrichmentCardImage` — исправление там автоматически улучшит этот компонент.

---

## Реализация

### 1. CourseCard.tsx — Обложки курсов (строки 480-504)

**Расположение:** `app/[locale]/courses/_components/course-card.tsx`

**Текущий код (строки 481-492):**

```tsx
{hasCover ? (
  <Image
    src={coverUrl}
    alt={`Обложка курса: ${course.title}`}
    fill
    className={cn(
      'object-cover transition-all duration-500',
      isHovered && 'scale-105 brightness-90 dark:scale-110 dark:brightness-75'
    )}
    sizes="..."
    priority={isAboveFold}
  />
) : ...}
```

**Добавить состояние:**

```tsx
const [imageLoaded, setImageLoaded] = useState(false)
```

**Изменить JSX (внутри `{hasCover ? ...}`):**

```tsx
<>
  {/* Skeleton while loading */}
  {!imageLoaded && (
    <div className="from-primary/20 to-secondary/20 absolute inset-0 animate-pulse bg-gradient-to-br" />
  )}
  <Image
    src={coverUrl}
    alt={`Обложка курса: ${course.title}`}
    fill
    onLoad={() => setImageLoaded(true)}
    className={cn(
      'object-cover transition-all duration-500',
      imageLoaded ? 'opacity-100' : 'opacity-0',
      isHovered && 'scale-105 brightness-90 dark:scale-110 dark:brightness-75'
    )}
    sizes="..."
    priority={isAboveFold}
  />
</>
```

### 2. EnrichmentCardImage.tsx — Карточки уроков

**Расположение:** `components/course/viewer/components/EnrichmentCardImage.tsx`

**Добавить состояние (после строки 46):**

```tsx
const [isLoaded, setIsLoaded] = useState(false)
```

**Добавить skeleton и fade-in (внутри div.relative):**

```tsx
{
  /* Skeleton while loading */
}
{
  !isLoaded && (
    <div className="bg-muted absolute inset-0 z-10 flex animate-pulse items-center justify-center">
      <Image className="text-muted-foreground/50 h-8 w-8" />
    </div>
  )
}

{
  /* Image with fade-in */
}
;<Image
  src={hasImage && imageUrl ? imageUrl : placeholderImage}
  alt={altText}
  fill
  onLoad={() => setIsLoaded(true)}
  className={cn(
    'object-cover transition-all duration-500',
    isLoaded ? 'opacity-100' : 'opacity-0',
    !hasImage && 'grayscale group-hover:grayscale-0',
    shouldShowPanel && 'scale-105 brightness-90 dark:brightness-75'
  )}
  sizes="..."
/>
```

---

## Верификация

1. Открыть `/ru/courses` — карточки курсов должны плавно появляться
2. Открыть курс с enrichments — карточки уроков должны плавно появляться
3. Проверить в DevTools Network: Slow 3G — должен быть виден skeleton во время загрузки
4. Нет CLS (Cumulative Layout Shift) — картинки не должны "прыгать"

---

## Альтернативы (не рекомендуются)

1. **blurDataURL** — требует генерации base64 для каждой картинки на сервере, сложно
2. **Plaiceholder library** — добавляет зависимость и build-time генерацию
3. **CSS background-image** — теряем оптимизацию Next.js Image

**Выбранный подход (skeleton + fade-in)** проще, не требует серверной логики, и уже работает в LessonCoverHero.
