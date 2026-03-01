# Fix: Мгновенное переключение вкладок в Course Viewer

## Context

Вкладки курс-вьювера (Содержание, Структура курса, Медиа) переключаются с заметной задержкой. Предыдущий план заменил `router.replace()` на `window.history.replaceState()` — но это не помогло, потому что не устранил корневую причину.

**Корневая причина**: Radix UI `TabsContent` по умолчанию **размонтирует** неактивный контент и **монтирует заново** при переключении. Каждое переключение вкладки уничтожает всё дерево компонентов и строит его с нуля:

- **Содержание** (самая тяжёлая): `ContentFormatSwitcher` (dynamic import, ssr: false) → `LessonContent` → `MarkdownRendererFull` (react-markdown + remark-gfm + remark-math + rehype-katex — полный re-parse markdown)
- **Медиа**: `EnrichmentsPanel` → инициализация `useEnrichmentGeneration`, `useEffect`-ы поллинга, монтаж 6-12 карточек обогащений
- **Структура**: лёгкая, но тоже пересоздаётся

При этом **уроки** переключаются быстро — потому что при смене урока меняются пропсы, а не происходит unmount/mount.

---

## Fix: `forceMount` + CSS скрытие

**Файл**: `packages/web/components/course/viewer/components/LessonView.tsx`

Добавить `forceMount` и `data-[state=inactive]:hidden` к каждому из 3 `TabsContent`:

```diff
- <TabsContent value="content" className="mt-0">
+ <TabsContent value="content" forceMount className="mt-0 data-[state=inactive]:hidden">

- <TabsContent value="structure" className="mt-0 p-6">
+ <TabsContent value="structure" forceMount className="mt-0 p-6 data-[state=inactive]:hidden">

- <TabsContent value="enrichments" className="mt-0 p-6">
+ <TabsContent value="enrichments" forceMount className="mt-0 p-6 data-[state=inactive]:hidden">
```

### Как это работает

Radix `TabsContent` с `forceMount` (подтверждено в `@radix-ui/react-tabs@1.1.13`, `dist/index.js:200`):

- `present: forceMount || isSelected` → с `forceMount` всегда `true` → компонент **никогда не размонтируется**
- `data-state` переключается между `"active"` и `"inactive"` (строка 203)
- Tailwind `data-[state=inactive]:hidden` применяет `display: none` к неактивным вкладкам

**Результат**: переключение вкладок становится мгновенным CSS-переключением `display: none` ↔ `display: block`. Никакого unmount/mount, re-parse markdown, re-init hooks, re-fetch URLs.

### Accessibility

Сохраняется полностью:

- `role="tabpanel"`, `aria-labelledby`, `id` — Radix устанавливает автоматически
- `tabIndex: 0` — остаётся на всех панелях
- Скрытые панели с `display: none` не доступны для скринридеров (корректное поведение)

---

## Файлы

| #   | Файл                                                              | Изменения                                                                                       |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `packages/web/components/course/viewer/components/LessonView.tsx` | Добавить `forceMount` и `data-[state=inactive]:hidden` к 3 `TabsContent` (строки 321, 340, 355) |

**1 файл, 3 строки.**

---

## Verification

1. **Визуально**: переключение между вкладками Содержание → Структура → Медиа должно быть мгновенным (без задержки/подвисания)
2. **DevTools Performance**: записать профиль переключения вкладки — не должно быть длинных задач (Long Tasks > 50ms)
3. **DevTools Elements**: при переключении неактивные `div[role="tabpanel"]` должны иметь `data-state="inactive"` и `display: none`, а не исчезать из DOM
4. **Type-check**: `pnpm --filter web type-check`
5. **Build**: `pnpm --filter web build`
