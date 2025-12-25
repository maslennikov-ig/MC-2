# Stage 6 Quality Inspector Components

Components for displaying quality assessment results in the Stage 6 Lesson Content Inspector.

## Components

### DiffViewer

Side-by-side or unified diff viewer for showing changes made by SelfReviewer when status is `FIXED`.

**Location**: `DiffViewer.tsx`

**Purpose**: Display before/after comparison of lesson content when SelfReviewer automatically fixes hygiene issues.

#### Features

- **Two View Modes**:
  - **Unified** (default): Single column with additions/deletions inline
  - **Split**: Two columns side-by-side (original | fixed)

- **Visual Highlighting**:
  - Added lines: Green background (`bg-green-50 dark:bg-green-950/30`)
  - Removed lines: Red background (`bg-red-50 dark:bg-red-950/30`)
  - Unchanged lines: Default background

- **Header**:
  - Toggle buttons for unified/split view
  - Stats badges showing additions and deletions count
  - Green badge with plus icon for additions
  - Red badge with minus icon for deletions

- **Content Display**:
  - Line numbers for both original and fixed content
  - Change indicators: `+` for additions, `-` for deletions, ` ` for unchanged
  - Monospace font for code readability
  - Scroll area with 400px height for long diffs
  - Dark mode support

- **Internationalization**:
  - English (`en`) and Russian (`ru`) locale support
  - Translated labels for UI elements

#### Interface

```typescript
interface DiffViewerProps {
  /** Original content before fixes */
  originalContent: string;
  /** Fixed content after SelfReviewer */
  fixedContent: string;
  /** Optional list of changes for annotations (reserved for future use) */
  changes?: Array<{
    type: string;
    severity: string;
    location: string;
    description: string;
  }>;
  /** Locale for translations */
  locale?: 'ru' | 'en';
}
```

#### Usage

**Basic Example:**

```tsx
import { DiffViewer } from './DiffViewer';

<DiffViewer
  originalContent={originalMarkdown}
  fixedContent={patchedMarkdown}
  locale="en"
/>
```

**With Changes (future enhancement):**

```tsx
<DiffViewer
  originalContent={originalMarkdown}
  fixedContent={patchedMarkdown}
  changes={selfReviewResult.issues}
  locale="ru"
/>
```

**Integration with Stage6QualityTab:**

```tsx
// In Stage6QualityTab.tsx
const handleViewDiff = () => {
  setShowDiffModal(true);
};

{showDiffModal && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
    <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-auto">
      <h3 className="text-lg font-semibold mb-4">
        {locale === 'ru' ? 'Сравнение изменений' : 'Diff Viewer'}
      </h3>

      <DiffViewer
        originalContent={originalContent}
        fixedContent={fixedContent}
        changes={selfReviewResult.issues}
        locale={locale}
      />

      <div className="mt-4 flex justify-end">
        <Button onClick={() => setShowDiffModal(false)}>
          {locale === 'ru' ? 'Закрыть' : 'Close'}
        </Button>
      </div>
    </div>
  </div>
)}
```

#### Implementation Details

**Diff Algorithm:**

The component uses a simple line-based diff algorithm that compares content line-by-line. For production use with large files or more complex scenarios, consider replacing with a library like:

- `diff` (npm package)
- `diff-match-patch` (Google's algorithm)
- `jsdiff` (unified diff format)

**Current Algorithm Logic:**

1. Split original and fixed content by newlines
2. Compare lines sequentially
3. Detect additions, deletions, and unchanged lines
4. Look ahead one line to distinguish between changes and add/delete pairs
5. Track line numbers for both original and fixed content

**Performance Optimizations:**

- Uses `React.memo` to prevent unnecessary re-renders
- Uses `useMemo` to cache diff computation
- Monospace font with GPU acceleration for smooth scrolling
- Virtual scrolling via `ScrollArea` component

**Accessibility:**

- Semantic HTML structure
- Proper color contrast ratios (WCAG AA)
- Keyboard navigation support via Button components
- Screen reader compatible (line numbers marked as non-selectable)

#### Styling

**Theme**: Blue/Cyan for Stage 6 consistency

**Key Classes:**
- `font-mono text-xs` - Monospace font for code
- `bg-green-50 dark:bg-green-950/30` - Added lines
- `bg-red-50 dark:bg-red-950/30` - Removed lines
- `text-slate-500 dark:text-slate-500` - Line numbers
- `border-slate-200 dark:border-slate-700` - Borders

**Layout:**
- Fixed-height scroll area: `h-[400px]`
- Split view: `grid grid-cols-2 gap-px`
- Unified view: Single column flex layout

#### Future Enhancements

1. **Change Annotations**: Use `changes` prop to highlight specific issues inline
2. **Syntax Highlighting**: Add markdown/code syntax highlighting
3. **Expand/Collapse**: Collapse unchanged sections for large diffs
4. **Search**: Find text within diff
5. **Copy to Clipboard**: Copy original or fixed content
6. **Export**: Export diff as HTML or PDF
7. **Word-Level Diff**: Highlight specific word changes within lines
8. **Line Range Selection**: Select and copy specific line ranges

#### Testing

**Example File**: `DiffViewer.example.tsx`

Run the example in development:

1. Import the example component
2. Add to a test route or Storybook
3. Verify both unified and split views
4. Test dark mode toggle
5. Test with English and Russian locales

**Manual Test Cases:**

- [ ] Unified view displays correctly
- [ ] Split view displays correctly
- [ ] View mode toggle works
- [ ] Stats badges show correct counts
- [ ] Line numbers align properly
- [ ] Colors match design system (green/red)
- [ ] Dark mode works
- [ ] Scroll area handles long content
- [ ] English and Russian translations display

## File Structure

```
quality/
├── README.md              # This file
├── DiffViewer.tsx         # Main diff viewer component
└── DiffViewer.example.tsx # Usage examples
```

## Design Decisions

1. **Simple Diff Algorithm**: Chose simplicity over complexity for MVP. Can be enhanced later with a library if needed.

2. **Line-Based Comparison**: Most content changes are line-based (markdown sections, paragraphs). Word-level diff is future enhancement.

3. **Fixed Height Scroll Area**: Prevents layout shifts and provides consistent UX. 400px is optimal for most screen sizes.

4. **Unified Default View**: Most users prefer unified view for quick scanning. Split view available for detailed comparison.

5. **Monospace Font**: Essential for code/markdown alignment and readability.

6. **No External Dependencies**: Keeps bundle size small. Uses only existing UI components (Button, Badge, ScrollArea).

## Related Components

- **Stage6QualityTab**: Parent component that shows Gate 1 (SelfReviewer) and Gate 2 (Judge) results
- **SelfReviewPanel** (future): Dedicated panel for self-review details
- **JudgeVotingPanel**: Shows judge evaluation results

## References

- **Spec**: `/specs/022-lesson-enrichments/stage-7-lesson-enrichments.md`
- **Design**: Phase 4 - DiffViewer Component
- **Types**: `@megacampus/shared-types/judge-types` (SelfReviewResult, SelfReviewIssue)
