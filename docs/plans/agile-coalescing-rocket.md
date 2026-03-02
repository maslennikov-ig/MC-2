# Mind Map: Fix Fullscreen + Shared State + Fold Depth

## Context

После предыдущего PR (v0.31.15) майнд-карта использует единый markmap SVG. Осталось 3 проблемы:

1. **Два крестика** в fullscreen — `DialogContent` (`dialog.tsx:48`) ВСЕГДА рендерит свой `<DialogPrimitive.Close>` (absolute top-4 right-4). Плюс наш `DialogClose` в header MindMapViewer. Итого два X.
2. **Состояние не сохраняется** — `{isDialogOpen && <MarkmapRenderer>}` создаёт НОВЫЙ экземпляр при каждом открытии fullscreen. Развёрнутые ветки и зум теряются.
3. **Слишком свёрнута** — `AUTO_FOLD_DEPTH=1` → `initialExpandLevel:1` → видно только root с collapsed children. Нужно: root + первый уровень веток раскрыт, level 2+ свёрнут.

## Plan

### Task 1: CSS fullscreen вместо Dialog — `MindMapViewer.tsx`

**Ключевое решение**: заменить Radix Dialog на CSS-based fullscreen toggle.

- ОДИН экземпляр `MarkmapRenderer`, всегда mounted
- `isFullscreen` state переключает CSS (`fixed inset-0 z-50`)
- fold/zoom state сохраняется (тот же SVG DOM, тот же markmap instance)
- Нет Dialog → нет дублирующего крестика (только наш)

**Удалить**: все Dialog импорты, `isDialogOpen` state

**Новая структура**:

```tsx
const [isFullscreen, setIsFullscreen] = useState(false);

return (
  <>
    {/* Backdrop */}
    {isFullscreen && (
      <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setIsFullscreen(false)} />
    )}

    <div
      className={isFullscreen ? 'fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900' : ''}
    >
      {/* Header — only fullscreen */}
      {isFullscreen && (
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <span>...</span>
          <Button onClick={() => setIsFullscreen(false)}>
            <X />
          </Button>
        </div>
      )}

      {/* ONE MarkmapRenderer — always mounted, className switches */}
      <div className={isFullscreen ? 'min-h-0 flex-1' : 'overflow-hidden rounded-lg border ...'}>
        <MarkmapRenderer
          data={markmapData}
          className={isFullscreen ? 'h-full' : 'aspect-video'}
          fitToViewLabel={t('viewer.mindMap.fitToView')}
        />
      </div>

      {/* Hint — only fullscreen */}
      {isFullscreen && <p className="...">...</p>}
    </div>

    {/* Stats + button — only when NOT fullscreen */}
    {!isFullscreen && (
      <div className="mt-3 ...">
        <Badge>...</Badge>
        <Button onClick={() => setIsFullscreen(true)}>View Full Map</Button>
      </div>
    )}
  </>
);
```

### Task 2: ResizeObserver для auto-fit — `MarkmapRenderer.tsx`

При inline → fullscreen контейнер резко меняет размер. Markmap не перерисовывается автоматически.

Добавить Effect 4 (ResizeObserver):

```tsx
// Effect 4: Re-fit on container resize (e.g. inline ↔ fullscreen toggle)
useEffect(() => {
  const container = svgRef.current?.parentElement;
  if (!container) return;

  const ro = new ResizeObserver(() => {
    void mmRef.current?.fit();
  });
  ro.observe(container);
  return () => ro.disconnect();
}, [mounted]);
```

### Task 3: Fold depth `1 → 2` — `mindmap-transform.ts`

```diff
- export const AUTO_FOLD_DEPTH = 1
+ export const AUTO_FOLD_DEPTH = 2
```

Эффект:

- `initialExpandLevel: 2` → root + level 1 раскрыты (ветки первого уровня видны)
- `payload.fold: 1` на `depth > 2` → level 2+ показаны как свёрнутые кружки
- Видно: root → ветки первого уровня → кликабельные точки для level 2+

## Files

| Файл                                                                    | Изменение                                     |
| ----------------------------------------------------------------------- | --------------------------------------------- |
| `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx`   | Dialog → CSS fullscreen, один MarkmapRenderer |
| `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx` | + ResizeObserver (Effect 4)                   |
| `packages/web/lib/helpers/mindmap-transform.ts`                         | `AUTO_FOLD_DEPTH: 1 → 2`                      |

## Verification

```bash
pnpm --filter web type-check && pnpm --filter web build
```

Визуально:

- Inline: root + level 1 раскрыт, level 2+ свёрнут
- Развернуть ветки → "View Full Map" → состояние сохранено
- Fullscreen — ОДИН крестик (наш), zoom/click работают
- Закрыть fullscreen → состояние веток сохраняется
