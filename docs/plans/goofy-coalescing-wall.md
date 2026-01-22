# План: Демо-страница для сравнения overlay вариантов

## Задача

Создать демо-страницу со всеми тремя вариантами overlay для визуального сравнения.

---

## Шаг 1: Создать демо-страницу

**Файл**: `packages/web/app/[locale]/demo/card-overlays/page.tsx`

Страница содержит:

- 3 карточки рядом с разными overlay вариантами
- Одно и то же изображение для честного сравнения
- Кнопка переключения темы (light/dark)
- Названия вариантов для идентификации

---

## Шаг 2: Варианты overlay

### Вариант A: Адаптивный градиент

```tsx
<div className="absolute inset-0 z-[1] bg-gradient-to-t from-white/90 via-white/50 to-white/20 dark:from-black/90 dark:via-black/60 dark:to-black/30" />
```

- Light: белый градиент снизу вверх
- Dark: чёрный градиент снизу вверх

### Вариант B: Scrim только снизу (2/3)

```tsx
<div className="absolute inset-x-0 bottom-0 h-2/3 z-[1] bg-gradient-to-t from-white/95 via-white/70 to-transparent dark:from-black/95 dark:via-black/60 dark:to-transparent" />
```

- Overlay только в нижней части
- Изображение полностью видно вверху

### Вариант C: Оригинал dark + лёгкий light

```tsx
<div className="absolute inset-0 z-[1] bg-white/30 dark:bg-gradient-to-t dark:from-black/95 dark:via-black/75 dark:to-black/40" />
```

- Dark: как было до glassmorphism
- Light: простой белый overlay 30%

---

## Структура демо-карточки

```tsx
function DemoCard({ variant, label }: { variant: 'A' | 'B' | 'C'; label: string }) {
  const overlayClass = {
    A: 'bg-gradient-to-t from-white/90 via-white/50 to-white/20 dark:from-black/90 dark:via-black/60 dark:to-black/30',
    B: 'inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-white/95 via-white/70 to-transparent dark:from-black/95 dark:via-black/60 dark:to-transparent',
    C: 'bg-white/30 dark:bg-gradient-to-t dark:from-black/95 dark:via-black/75 dark:to-black/40',
  }[variant];

  return (
    <div className="relative h-[400px] w-[300px] rounded-xl overflow-hidden">
      {/* Image */}
      <Image src="/demo-cover.jpg" fill className="object-cover" />

      {/* Overlay */}
      <div className={cn('absolute z-[1]', variant === 'B' ? '' : 'inset-0', overlayClass)} />

      {/* Content */}
      <div className="absolute inset-0 z-[2] flex flex-col justify-end p-4">
        <span className="text-xs bg-black/50 text-white px-2 py-1 rounded mb-2 w-fit">{label}</span>
        <h3 className="text-white text-lg font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          Название курса
        </h3>
        <p className="text-gray-200 text-sm">Описание курса</p>
      </div>
    </div>
  );
}
```

---

## Демо-изображение

Использовать существующую обложку курса из проекта или Unsplash placeholder:

- `https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600` (код/технологии)

---

## URL демо-страницы

После создания: `http://localhost:3000/ru/demo/card-overlays`

---

## После выбора

1. Пользователь выбирает лучший вариант
2. Применяем выбранный overlay к `course-card.tsx`
3. Откатываем соответствующие стили (badges, text colors)
4. Удаляем демо-страницу

---

## Верификация

1. `pnpm type-check` — без ошибок
2. Открыть демо-страницу
3. Переключить тему
4. Сравнить варианты
