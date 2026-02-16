# mc2-1x95: Add tests for MermaidDirect frontend component

## Context

`MermaidDirect.tsx` (587 lines) — клиентский React-компонент для рендеринга Mermaid-диаграмм. Критически важный компонент с **нулевым покрытием тестами**. Содержит:

- Dark/light theme detection через MutationObserver
- SVG post-processing для замены дефолтных цветов Mermaid на цвета темы
- Защиту от race conditions (render counter)
- Error state UI
- Утилиты: `parseColor`, `isLightColor`, `postProcessSvg` (не экспортированы — тестируем через компонент)

---

## File to Create

`packages/web/components/markdown/components/__tests__/MermaidDirect.test.tsx`

## File Under Test

`packages/web/components/markdown/components/MermaidDirect.tsx`

---

## Mock Strategy

### 1. `mermaid` library — полный мок

```typescript
const mockInitialize = vi.fn();
const mockRender = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: mockInitialize,
    render: mockRender,
  },
}));
```

### 2. SVG-фикстуры

| Fixture                        | Назначение                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `MOCK_SVG_CLEAN`               | Базовый SVG, без дефолтных цветов Mermaid — для тестов рендеринга                    |
| `MOCK_SVG_WITH_DEFAULT_COLORS` | SVG с дефолтными цветами (`#ECECFF`, `#9370DB`, `#f9f`) — для тестов postProcessSvg  |
| `MOCK_SVG_WITH_LIGHT_FILLS`    | SVG со светлыми цветами (`#90EE90`, `#FFFFE0`) — для тестов isLightColor в dark mode |
| `MOCK_SVG_STATE_DIAGRAM`       | SVG с `.state-start` / `.state-end` — для тестов стилизации state-диаграмм           |
| `MOCK_SVG_MINDMAP`             | SVG с `.mindmap-node` — для тестов стилизации mindmap текста                         |

### 3. Dark mode — через `document.documentElement.classList`

jsdom поддерживает MutationObserver нативно. Для переключения:

```typescript
await act(async () => {
  document.documentElement.classList.add('dark');
});
```

---

## Test Structure (~40 test cases)

### `describe('Rendering basics')` — 5 tests

- Renders figure with `role="img"` и default `aria-label="Mermaid diagram"`
- Custom `ariaLabel` передаётся на figure
- Custom `className` мёржится через `cn()`
- `mermaid-container` class на figure
- `mermaid-diagram` class на inner div

### `describe('Mermaid initialization')` — 4 tests

- `securityLevel: 'strict'`, `theme: 'base'`, `startOnLoad: false`
- Light theme variables по умолчанию
- Dark theme variables когда `.dark` class на html
- `flowchart: { htmlLabels: true, useMaxWidth: true, wrappingWidth: 200 }`

### `describe('Mermaid render call')` — 4 tests

- Вызывает `mermaid.render()` с trimmed chart content
- Render ID не содержит двоеточий (useId sanitization)
- innerHTML контейнера — возвращённый SVG
- `bindFunctions` вызывается если возвращён

### `describe('Diagram types')` — 4 tests (parametrized)

- flowchart TD, sequence diagram, mindmap, state diagram
- Проверяем что chart передаётся в `mermaid.render()` без модификации

### `describe('Error handling')` — 5 tests

- Error UI при reject `mermaid.render()`
- Error message отображается
- Оригинальный chart source в `<pre>`
- "Failed to render diagram" для non-Error exceptions
- Error state очищается при смене chart на валидный

### `describe('Empty and whitespace input')` — 2 tests

- Не вызывает `mermaid.render()` для пустой строки
- Не вызывает `mermaid.render()` для whitespace-only

### `describe('Dark/light theme switching')` — 4 tests

- Начальный light mode
- Начальный dark mode
- Re-render при переключении dark → light
- MutationObserver disconnect при unmount

### `describe('postProcessSvg color replacement')` — 7 tests

- Замена дефолтных fill цветов Mermaid на theme nodeBg
- Force `.node rect` fills и strokes
- Force `.nodeLabel` text fill
- Force edge/arrow stroke colors
- Force edgeLabel text colors
- Замена светлых fill в dark mode
- НЕ заменяет светлые fill в light mode

### `describe('State diagram styling')` — 3 tests

- `.state-start` без `.state-end` sibling → startNode colors
- `.state-start` с `.state-end` sibling → transparent + endNode border
- `.state-end` → endNode colors

### `describe('Race conditions')` — 1 test

- Stale render отбрасывается при быстрой смене chart

### `describe('Cyrillic and special characters')` — 3 tests

- Кириллица в нодах
- Спецсимволы в лейблах
- Смешанный Latin + Cyrillic текст

---

## Existing Code to Reuse

| What                                     | Path                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Test patterns (vi.mock, render, waitFor) | `packages/web/components/markdown/__tests__/MarkdownRendererClient.test.tsx` |
| MermaidDiagramProps type                 | `packages/web/components/markdown/types.ts:121-128`                          |
| Vitest config + jsdom setup              | `packages/web/vitest.config.ts`, `packages/web/vitest.setup.ts`              |

## Key Implementation Notes

1. `vi.mock('mermaid')` — hoisted, mock fns на module level
2. Каждый тест с non-empty chart — async с `waitFor` (mermaid.render async внутри useEffect)
3. `beforeEach`: reset mocks + remove `dark` class + set default mockRender.mockResolvedValue
4. postProcessSvg проверяем через `getAttribute('fill')` на DOM-элементах (не через computed styles)
5. Race condition тест — контролируемые Promise с отложенным resolve

---

## Verification

```bash
# Run tests
pnpm --filter web vitest run components/markdown/components/__tests__/MermaidDirect.test.tsx

# Type-check (no production code changes)
pnpm --filter web tsc --noEmit

# All web tests still pass
pnpm --filter web vitest run
```
