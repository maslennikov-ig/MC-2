# План: Демо-страница для сравнения вариантов индикации Placeholder vs Сгенерированного контента

## Проблема

На странице курса в разделе "Медиа" непонятно, что является placeholder, а что — сгенерированным контентом.

## Цель

Создать демо-страницу `/demo/placeholder-comparison` где пользователь сможет визуально сравнить:

1. Текущий вид (без индикации)
2. Вариант 1: Badge/Метка
3. Вариант 2: Визуальная обработка (opacity/blur/pattern)
4. Вариант 3: Рамка/Граница (dashed vs solid)

## Критические файлы

### Создать

- `packages/web/app/[locale]/demo/placeholder-comparison/page.tsx` — демо-страница

### Использовать как референс

- `packages/web/components/course/viewer/components/EnrichmentCardImage.tsx` — текущий компонент
- `packages/web/public/placeholders/Cover.webp` — placeholder изображение

## Структура демо-страницы

```
┌─────────────────────────────────────────────────────────────┐
│  Сравнение вариантов индикации: Placeholder vs Generated    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │   ТЕКУЩИЙ ВИД       │  │   ТЕКУЩИЙ ВИД       │          │
│  │   (Placeholder)     │  │   (Сгенерировано)   │          │
│  │                     │  │                     │          │
│  │   [Cover.webp]      │  │   [real-image.jpg]  │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  ─────────────── Вариант 1: Badge ───────────────          │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ [Превью]            │  │ [✓ Готово]          │          │
│  │                     │  │                     │          │
│  │   [Cover.webp]      │  │   [real-image.jpg]  │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  ─────────────── Вариант 2: Opacity/Pattern ─────────────  │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ ░░░░░░░░░░░░░░░░░░░ │  │                     │          │
│  │ ░░ (60% opacity) ░░ │  │   [real-image.jpg]  │          │
│  │ ░░░░░░░░░░░░░░░░░░░ │  │                     │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  ─────────────── Вариант 3: Border ───────────────         │
│                                                             │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  ╔═══════════════════════╗       │
│                           ║                       ║        │
│       [Cover.webp]        ║   [real-image.jpg]    ║        │
│                           ║                       ║        │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  ╚═══════════════════════╝       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Реализация

### Шаг 1: Создать демо-страницу

- Использовать реальные placeholder изображения из `/public/placeholders/`
- Для "сгенерированного" контента — использовать любое реальное изображение (можно unsplash или local)
- Показать все 4 варианта в сетке для сравнения

### Шаг 2: Варианты стилизации

**Вариант 1: Badge**

```tsx
// Placeholder badge
<Badge className="absolute top-3 right-3 bg-slate-500/80 text-white">
  Превью
</Badge>

// Generated badge
<Badge className="absolute top-3 right-3 bg-green-500/80 text-white">
  <Check className="w-3 h-3 mr-1" /> Готово
</Badge>
```

**Вариант 2: Visual Treatment**

```tsx
// Placeholder - opacity + optional pattern overlay
<div className="relative opacity-60">
  <Image src={placeholder} ... />
  <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.03)_10px,rgba(0,0,0,0.03)_20px)]" />
</div>

// Generated - full opacity
<Image src={generated} className="opacity-100" ... />
```

**Вариант 3: Border**

```tsx
// Placeholder - dashed border
<div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
  <Image src={placeholder} ... />
</div>

// Generated - solid border with accent + glow
<div className="border-2 border-solid border-purple-500 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(168,85,247,0.3)]">
  <Image src={generated} ... />
</div>
```

## Верификация

1. Запустить dev server: `pnpm dev`
2. Открыть `/demo/placeholder-comparison`
3. Визуально сравнить все варианты
4. Проверить в dark mode

## Следующие шаги после одобрения варианта

После выбора пользователем предпочтительного варианта — интегрировать в `EnrichmentCardImage.tsx`
