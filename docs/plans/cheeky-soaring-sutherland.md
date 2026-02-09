# Plan: Update react-resizable-panels 3.0.6 → 4.6.2

## Context

Задача mc2-70a8 включала обновление двух пакетов. После анализа решено обновить только `react-resizable-panels` (3.0.6 → 4.6.2), т.к. `isomorphic-dompurify` v3 ещё в RC-стадии.

**Ценность обновления:**

- Пиксельные единицы размеров (`minSize="200px"`) — предсказуемое поведение панелей на разных экранах
- Улучшенный SSR / Server Components (Next.js 15)
- ARIA-совместимость (accessibility)

**Breaking changes в v4:**

- Экспорты: `PanelGroup` → `Group`, `PanelResizeHandle` → `Separator`
- Пропсы: `direction` → `orientation`
- CSS-селекторы: `data-[panel-group-direction=...]` → `aria-[orientation=...]`

## Scope: 2 файла + package.json

### 1. `packages/web/package.json`

- Обновить `react-resizable-panels`: `^3.0.6` → `^4.6.2`

### 2. `packages/web/components/ui/resizable.tsx` (shadcn-обёртка)

Наша обёртка абстрагирует потребителей от прямого API — поэтому **меняем только обёртку**, а `LessonInspectorLayout` не трогаем (он использует наши `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`).

Изменения в `resizable.tsx`:

```tsx
// Было:
import * as ResizablePrimitive from 'react-resizable-panels';
// Стало:
import { Group, Panel, Separator } from 'react-resizable-panels';
```

- `ResizablePanelGroup`: `ResizablePrimitive.PanelGroup` → `Group`, пропс `direction` оборачиваем в `orientation`
- CSS: `data-[panel-group-direction=vertical]` → `aria-[orientation=vertical]`
- `ResizablePanel`: `ResizablePrimitive.Panel` → `Panel`
- `ResizableHandle`: `ResizablePrimitive.PanelResizeHandle` → `Separator`
- TypeScript типы: `React.ComponentProps<typeof Group>` и т.д.

**Важно:** Наша обёртка принимает `direction` prop у `ResizablePanelGroup` — нужно сохранить внешний API (`direction`), а внутри маппить на `orientation`.

### 3. `packages/web/components/generation-graph/panels/lesson/LessonInspectorLayout.tsx`

- **Не трогаем!** Использует наши обёртки (`ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`), не прямой API библиотеки. Проп `direction="horizontal"` маппится внутри обёртки.

## Implementation Steps

1. `pnpm --filter web update react-resizable-panels@^4.6.2`
2. Обновить `resizable.tsx`:
   - Импорт: `{ Group, Panel, Separator }`
   - `ResizablePanelGroup`: маппинг `direction` → `orientation`, новые CSS-селекторы
   - `ResizablePanel`: реэкспорт `Panel`
   - `ResizableHandle`: использовать `Separator`, новые CSS-селекторы
3. Type-check: `pnpm --filter web type-check`
4. Build: `pnpm --filter web build`

## Verification

1. **Type-check**: `pnpm --filter web type-check` — должен пройти
2. **Build**: `pnpm --filter web build` — должен пройти
3. **Visual check**: На странице LessonInspector панели должны ресайзиться, коллапситься, handle должен быть видим
4. Других файлов, использующих `react-resizable-panels` напрямую, нет — только через обёртку

## Note: isomorphic-dompurify

Оставляем на `2.34.0`. Версия 3.x (`3.0.0-rc.2`) — release candidate, не production-ready. Обновим когда выйдет стабильная версия. Обновить описание задачи mc2-70a8.
