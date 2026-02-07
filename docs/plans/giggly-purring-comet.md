# Plan: Visual Style as Accordion Section + Remove Document Relations

## Context

On the Stage 4 output tab, "Visual Style" (`VisualStylePreview`) is currently a standalone always-visible Card positioned between AnalysisHero and the accordion. User wants it to be a collapsible accordion section (like "Course Classification", "Topic Analysis", etc.) placed at the bottom.

The "Document Relations" section is a deprecated remnant (`@deprecated` in shared-types, always `{}` for new courses). It should be removed.

## Changes

### 1. `AnalysisResultView.tsx` — add Visual Style accordion section, remove Documents

**File:** `packages/web/components/generation-graph/panels/output/AnalysisResultView.tsx`

**a) Add `visualStyle` prop:**

```ts
interface AnalysisResultViewProps {
  data: AnalysisResult;
  locale?: 'ru' | 'en';
  courseId?: string;
  editable?: boolean;
  autoFocus?: boolean;
  readOnly?: boolean;
  visualStyle?: VisualStyle | null; // NEW
}
```

Import `VisualStyle` from `@megacampus/shared-types` and icons (`Palette`, `Sparkles`, `Shapes`, `Heart`) from `lucide-react`.

**b) Add translations for visual style section:**

```ts
// ru:
visualStyleTitle: 'Визуальный стиль курса',
visualStyleDesc: 'Рекомендации для обложек и карточек',
visualStyleColorScheme: 'Цветовая палитра',
visualStyleAesthetic: 'Эстетика',
visualStyleVisualElements: 'Визуальные элементы',
visualStyleMood: 'Настроение',
visualStyleEmpty: 'Нет данных о визуальном стиле',
// en:
visualStyleTitle: 'Course Visual Style',
visualStyleDesc: 'Recommendations for covers and cards',
visualStyleColorScheme: 'Color Scheme',
visualStyleAesthetic: 'Aesthetic',
visualStyleVisualElements: 'Visual Elements',
visualStyleMood: 'Mood',
visualStyleEmpty: 'No visual style data',
```

Remove document-related translations: `documents`, `documentsDesc`, `section`, `noDocuments`.

**c) Replace Documents accordion with Visual Style accordion at the bottom (section #7):**

Remove the `{/* 7. Document Relations */}` AccordionItem block (lines ~693-716).

Add new AccordionItem `value="visualStyle"` at the same position. Render the 4 visual style properties using `LabeledValue` components (same pattern as other sections), with subtle icon+color accents:

```tsx
{
  visualStyle && (
    <AccordionItem value="visualStyle" title={t.visualStyleTitle} description={t.visualStyleDesc}>
      <div className="space-y-3">
        {/* Each item: icon + LabeledValue */}
        <div className="flex items-start gap-3 rounded-lg bg-pink-50 p-2.5 dark:bg-pink-950/30">
          <div className="...">
            <Palette className="h-4 w-4 text-pink-500" />
          </div>
          <LabeledValue label={t.visualStyleColorScheme} value={visualStyle.colorScheme} />
        </div>
        {/* ...same pattern for aesthetic, visualElements, mood */}
      </div>
    </AccordionItem>
  );
}
```

**d) Remove unused imports/code:**

- Remove `useFileCatalog` import and usage (line 20, 165)
- Remove `getDocumentDisplayName` memo (lines 168-175)

### 2. `Stage4OutputTab.tsx` — remove standalone VisualStylePreview, pass prop

**File:** `packages/web/components/generation-graph/panels/stage4/Stage4OutputTab.tsx`

- Remove line 333: `{visualStyle && <VisualStylePreview visualStyle={visualStyle} locale={locale} />}`
- Remove `VisualStylePreview` import (line 21)
- Pass `visualStyle` to `AnalysisResultView`:
  ```tsx
  <AnalysisResultView
    data={analysisResult}
    locale={locale}
    courseId={courseId}
    editable={editable}
    autoFocus={autoFocus}
    readOnly={readOnly}
    visualStyle={visualStyle} // NEW
  />
  ```

### 3. Cleanup `VisualStylePreview.tsx` and barrel export

- Delete `packages/web/components/generation-graph/panels/stage4/VisualStylePreview.tsx` (no longer used anywhere)
- Remove export from `packages/web/components/generation-graph/panels/stage4/index.ts` (line 15)

## Files Modified

| File                                                                            | Action                                                                                       |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/web/components/generation-graph/panels/output/AnalysisResultView.tsx` | Add visualStyle prop, add accordion section, remove documents section, remove useFileCatalog |
| `packages/web/components/generation-graph/panels/stage4/Stage4OutputTab.tsx`    | Remove standalone VisualStylePreview, pass visualStyle prop to AnalysisResultView            |
| `packages/web/components/generation-graph/panels/stage4/VisualStylePreview.tsx` | Delete file                                                                                  |
| `packages/web/components/generation-graph/panels/stage4/index.ts`               | Remove VisualStylePreview export                                                             |

## Verification

1. `pnpm type-check` — no type errors
2. `pnpm --filter @megacampus/web build` — builds successfully
3. Visual check: open Stage 4 output tab in browser, confirm:
   - Visual Style section appears at the bottom of accordion, collapsed by default
   - Clicking the header expands it, shows 4 properties with icons
   - Document Relations section is gone
   - All other sections work as before
