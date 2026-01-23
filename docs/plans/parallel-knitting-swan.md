# План: Улучшение баннера урока с информацией на изображении

## Цель

Переработать `LessonCoverHero` чтобы:

1. Показывать полное изображение 16:9 без обрезки
2. Перенести на баннер: Модуль + Заголовок + Время чтения
3. Обеспечить читаемость на любом фоне через gradient overlay

## Текущее состояние

- **LessonCoverHero**: фиксированная высота 200-300px, `object-cover` обрезает изображение
- **showOverlay**: отключён (`false`), есть готовый код overlay
- **Информация**: отображается отдельно под баннером в `lesson-content.tsx`
- **Генерация**: изображения всегда 16:9 (1344x768 px)

## Изменения

### 1. LessonCoverHero.tsx — адаптивный контейнер

**Файл**: `packages/web/components/course/viewer/components/LessonCoverHero.tsx`

```diff
- "h-[200px] sm:h-[250px] md:h-[300px]"
+ "aspect-video"  // 16:9 нативный aspect ratio
```

Контейнер будет занимать полную ширину и автоматически высоту по 16:9.

### 2. LessonCoverHero.tsx — расширенный overlay

**Добавить props**:

```typescript
interface LessonCoverHeroProps {
  imageUrl?: string | null;
  lessonTitle: string;
  sectionTitle?: string; // "Модуль 1: Основы"
  sectionNumber?: number; // NEW: номер модуля
  readingTime?: number; // NEW: время в минутах
  showOverlay?: boolean;
  // ...остальные
}
```

**Переработать overlay**:

```tsx
{
  showOverlay && isLoaded && (
    <motion.div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 md:p-8">
        {/* Модуль */}
        {sectionTitle && (
          <p className="text-white/90 text-sm font-medium mb-1 drop-shadow-md">
            Модуль {sectionNumber}: {sectionTitle}
          </p>
        )}
        {/* Заголовок */}
        <h2 className="text-white text-xl sm:text-2xl md:text-3xl font-bold line-clamp-2 drop-shadow-lg mb-2">
          {lessonTitle}
        </h2>
        {/* Время чтения */}
        {readingTime && (
          <div className="flex items-center gap-1.5 text-white/80 text-sm">
            <Clock className="w-4 h-4" />
            <span>{readingTime} мин</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
```

**Стили для читаемости на любом фоне**:

- Gradient: `from-black/70 via-black/30 to-transparent`
- Drop shadow на тексте: `drop-shadow-md`, `drop-shadow-lg`
- Прозрачность текста: `text-white/90`, `text-white/80`

### 3. lesson-content.tsx — использование overlay

**Файл**: `packages/web/components/common/lesson-content.tsx`

```diff
<LessonCoverHero
  imageUrl={coverImageUrl}
  lessonTitle={lesson.title}
+ sectionTitle={section?.title}
+ sectionNumber={section?.section_number}
+ readingTime={lesson.duration_minutes}
- showOverlay={false}
+ showOverlay={true}
/>
```

**Убрать дублирование** (удалить блок Lesson Header ниже баннера):

```diff
- {/* Lesson Header */}
- <div className="mb-8">
-   {section && (
-     <div className="text-purple-400 text-sm font-medium mb-2">
-       Модуль {section.section_number}: {section.title}
-     </div>
-   )}
-   <h1 className="text-3xl lg:text-4xl font-bold ...">
-     {lesson.title}
-   </h1>
-   <div className="flex flex-wrap gap-4 ...">
-     <Clock /> {lesson.duration_minutes} minutes
-   </div>
- </div>
```

**Условие**: показывать header только если нет баннера:

```tsx
{
  !coverImageUrl && <div className="mb-8">{/* Lesson Header - fallback без баннера */}</div>;
}
```

### 4. Темы (light/dark)

Gradient overlay работает одинаково для обеих тем — затемнение снизу делает текст читаемым независимо от темы интерфейса.

**Skeleton** для тёмной темы уже настроен:

```tsx
'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900';
```

## Файлы для изменения

| Файл                                                                   | Изменения                      |
| ---------------------------------------------------------------------- | ------------------------------ |
| `packages/web/components/course/viewer/components/LessonCoverHero.tsx` | Props + aspect-ratio + overlay |
| `packages/web/components/common/lesson-content.tsx`                    | Передать props, убрать дубли   |

## Визуальный результат

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              [Изображение 16:9 полностью]              │
│                                                         │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓ Модуль 1: Основы маркетинга                          ▓│
│▓ Сегментация аудитории: как найти клиента             ▓│
│▓ ⏱ 12 мин                                             ▓│
└─────────────────────────────────────────────────────────┘

[Цели обучения]
[Основной контент...]
```

## Проверка

1. **Визуально**: Открыть урок с cover image, проверить:
   - Изображение отображается полностью (не обрезано)
   - Текст читаемый на светлом и тёмном фоне изображения
   - Нет дублирования заголовка под баннером

2. **Без баннера**: Открыть урок без cover image — должен показываться старый header

3. **Темы**: Переключить тему — skeleton должен выглядеть хорошо в обеих

4. **Адаптивность**: Проверить на мобильном viewport — текст должен оставаться читаемым
