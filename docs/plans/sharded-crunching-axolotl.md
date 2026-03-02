# FlashcardViewer UI Redesign

## Context

Текущий FlashcardViewer выглядит генерично: плоские amber/emerald borders, кнопки "Still Learning"/"Know It" неконсистентны с дизайн-системой, карточки растягиваются на всю ширину, нет иммерсивного режима изучения. Нужно сделать визуально привлекательный, полированный UI с fullscreen-режимом для сфокусированного обучения.

**Подход**: кастомная реализация на уже установленном Framer Motion v12.33.0 + Tailwind + shadcn/ui. Никаких внешних библиотек не требуется.

## Files to Modify

| File                                                                    | Change                                    |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx` | Полная переработка UI (~400 → ~580 строк) |
| `packages/web/messages/en/enrichments.json`                             | +7 i18n ключей                            |
| `packages/web/messages/ru/enrichments.json`                             | +7 i18n ключей                            |

Reference (read-only): `MindMapViewer.tsx` — паттерн fullscreen.

## Implementation Steps

### 1. Card Visual Redesign

**Ограничение ширины и центрирование**:

- `max-w-lg mx-auto` для inline, `max-w-xl mx-auto` для fullscreen
- `min-h-[220px]` вместо текущих `160px`

**Градиенты вместо плоских цветов**:

- Front: `bg-gradient-to-br from-slate-50 to-white` + `shadow-lg` + `border-slate-200/60` + `rounded-2xl`
- Back: `bg-gradient-to-br from-emerald-50 to-white` + subtle emerald shadow
- Dark mode: `from-slate-800 to-slate-900` / `from-emerald-950/40 to-slate-900`

**Типографика**: `text-lg font-medium leading-relaxed` вместо `text-base`

**Иконки вместо текстовых лейблов**: `<HelpCircle>` (front) и `<Lightbulb>` (back) вместо uppercase "QUESTION"/"ANSWER"

**Spring анимация**: `{ type: 'spring', stiffness: 300, damping: 30 }` вместо `{ duration: 0.4, ease: 'easeInOut' }`, perspective: `1200px`

### 2. Button Redesign

Заменить кастомные red/green outline кнопки на стандартные shadcn/ui варианты:

- "Still Learning" → `variant="secondary"` + `<ThumbsDown>` (нейтральный фон)
- "Know It" → `variant="default"` + `<ThumbsUp>` (primary заливка)
- `flex-1` для равной ширины, `max-w-lg mx-auto` для центрирования
- Микроанимация уже есть через существующий `btn-interactive` класс

### 3. Progress Dot Indicators

Добавить под progress bar точечные индикаторы статуса каждой карточки:

- Зеленая точка = "знаю", Amber = "учу", Серая = не просмотрено
- Ring вокруг текущей карточки
- Кликабельные для прямой навигации
- Показывать только если `totalCards <= 30` (иначе только progress bar)

### 4. Fullscreen Mode (паттерн MindMapViewer)

**Структура**: Fragment wrapper → backdrop overlay → fixed container

- Backdrop: `fixed inset-0 z-40 bg-black/80 backdrop-blur-sm`
- Container: `fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-950`
- Header: иконка + "Flashcards" + счетчик карточек + кнопка закрытия (X)
- Progress bar: тонкий `h-1` под header
- Card area: `flex-1 flex items-center justify-center` — карточка по центру экрана
- Footer: hint "Arrow keys to navigate, Space to flip, Esc to exit"
- Кнопка "Study Mode" (Maximize2 иконка) в inline view

**Keyboard**: `useEffect` → Escape (закрыть), ArrowLeft/Right (навигация), Space/Enter (flip)
**Body scroll lock**: `overflow: hidden` при fullscreen

### 5. Navigation Click Zones (fullscreen only)

Невидимые зоны по краям card area:

- Левая треть → предыдущая карточка
- Правая треть → следующая карточка
- Средняя треть → flip (как сейчас)
- На hover показываются полупрозрачные ChevronLeft/ChevronRight в кружке

### 6. Mobile Swipe (fullscreen only)

Framer Motion `drag="x"`:

- `dragConstraints={{ left: 0, right: 0 }}` — snap back
- `dragElastic={0.3}` — сопротивление
- Threshold: `80px` для срабатывания
- Отключено в inline mode (`drag={false}`)

### 7. Summary Screen Upgrade

- `max-w-lg mx-auto` + `rounded-2xl` + нейтральный gradient
- Анимированный trophy (spring entrance: scale 0→1)
- Круглый индикатор score (вместо progress bar)
- Условное сообщение: >=80% "Excellent work!" / <80% "Keep practicing"
- Amber для "learning" вместо red (менее негативно)

### 8. i18n Keys (7 новых)

**EN**: `title`, `enterFullscreen` ("Study Mode"), `exitFullscreen`, `previousCard`, `nextCard`, `fullscreenHint`, `greatJob`, `keepPracticing`

**RU**: `title` ("Карточки"), `enterFullscreen` ("Режим изучения"), `fullscreenHint` ("Стрелки для навигации, Пробел для переворота, Esc для выхода") и т.д.

## What Stays Unchanged

- Props interface (`FlashcardViewerProps`) — drop-in replacement
- localStorage format — совместимость с сохраненным прогрессом
- All handler logic (flip, know, don't know, shuffle, reset, next, prev)
- Parent components (LessonMaterialsSwitcher, EnrichmentCard) — не трогаем
- Shared types — не трогаем

## Verification

1. `pnpm type-check` — нет ошибок типов
2. `pnpm build` — билд проходит
3. Визуальная проверка через Playwright:
   - Inline mode: карточки отцентрированы, не на всю ширину
   - Flip animation: spring, выглядит smooth
   - Кнопки: consistent с design system
   - Dark mode: корректные градиенты
   - Fullscreen: backdrop blur, карточка по центру, клавиши работают
   - Mobile: swipe, click zones
   - Summary: анимированный trophy, score circle
4. Проверить оба контекста рендеринга: tab в switcher и enrichment card
