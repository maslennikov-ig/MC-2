# План: Улучшение читаемости карточек курсов с обложками

## Проблемы

1. **Текст сливается с обложкой** — градиент `via-black/60` недостаточен для светлых изображений
2. **Кнопка стала тёмной** — glassmorphism на тёмном фоне теряет визуальный акцент

## Решение: Вариант D (выбран)

- Усилить градиент overlay: `via-black/60` → `via-black/75`
- Кнопка: всегда фиолетовый градиент (убрать glassmorphism)
- Добавить text-shadow для заголовка

---

## Изменения

### Файл: `packages/web/app/[locale]/courses/_components/course-card.tsx`

#### 1. Градиент overlay (строка ~502)

```tsx
// Было:
<div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/90 via-black/60 to-black/30" />

// Стало:
<div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/95 via-black/75 to-black/40" />
```

#### 2. Кнопка "Открыть курс" (строки ~872-877)

```tsx
// Было:
className={cn(
  'h-10 w-full !rounded-full ...',
  hasCover
    ? 'border border-white/30 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30'
    : 'bg-gradient-to-r from-purple-600 to-purple-700 ...'
)}

// Стало (всегда фиолетовая):
className="h-10 w-full !rounded-full text-sm font-medium shadow-lg transition-all hover:shadow-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800"
```

#### 3. Text-shadow для заголовка (строка ~557)

```tsx
// Добавить к классам заголовка:
hasCover && '[text-shadow:_0_1px_3px_rgb(0_0_0_/_60%)]';
```

---

## Верификация

1. Открыть `/courses` и проверить карточки с обложками
2. Проверить в dark mode
3. Проверить на курсах с разными обложками (светлые/тёмные)
4. `pnpm type-check` (в packages/web)
5. `pnpm build` (в packages/web)
