# Stage 6 Inspector Tabs

Tab components for the Lesson Inspector panel in Stage 6 (Lesson Content Generation).

## Stage6QualityTab

**Two-Gate Waterfall Layout** for displaying self-review and judge quality assessment results.

### Design Decision

> "SelfReviewer runs *before* Judge - UI must show linear dependency. Do NOT place them side-by-side."

The component enforces a **vertical waterfall flow** showing:
1. **Gate 1: Auto-Correction (SelfReviewer)** - Pre-judge validation
2. **↓ Connecting Arrow** - Visual dependency indicator
3. **Gate 2: Final Assessment (Judge)** - CLEV voting and quality evaluation

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ GATE 1: Auto-Correction (SelfReviewer)                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🛡️ PASS: No issues found                                    │ │ ← Green Banner
│ │ 🔧 FIXED: [View Diff] - 2 issues auto-corrected             │ │ ← Blue Card
│ │ ⚠️ FLAGGED: Hallucination detected in Section 3             │ │ ← Amber Card
│ │ 🔄 REGENERATE: Critical integrity failure                   │ │ ← Red Card
│ └─────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
│ GATE 2: Final Assessment (Judge)                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Rubric Grid: Depth 90% │ Clarity 95% │ Style 88%            │ │
│ │ Final Score: 87%                                            │ │
│ │ Verdict: ACCEPT_WITH_MINOR_REVISION                         │ │
│ │ Consensus: Unanimous (2/2 judges)                           │ │
│ │ Critique: "Good coverage, minor formatting issues..."       │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Props

```typescript
interface Stage6QualityTabProps {
  /** Self-review result from Gate 1 */
  selfReviewResult?: SelfReviewResult;
  /** Judge result from Gate 2 */
  judgeResult?: JudgeVerdictDisplay;
  /** Original content before fixes (for diff view) */
  originalContent?: string;
  /** Fixed content after self-review (for diff view) */
  fixedContent?: string;
  /** Locale for translations */
  locale?: 'ru' | 'en';
}
```

### SelfReview Status Types

| Status | Color | Icon | Behavior |
|--------|-------|------|----------|
| `PASS` | Green | ShieldCheck | Content is clean, proceed to Judge |
| `FIXED` | Blue | Wrench | Auto-fixed hygiene issues, show diff button |
| `FLAG_TO_JUDGE` | Amber | AlertTriangle | Semantic issues requiring Judge attention |
| `PASS_WITH_FLAGS` | Amber | AlertTriangle | Acceptable with informational observations |
| `REGENERATE` | Red | RefreshCw | Critical failure, Gate 2 disabled |

### Logic

- **If Gate 1 = `REGENERATE`**: Gate 2 is disabled/grayed (Judge never ran)
- **If Gate 1 = `FIXED`**: "View Diff" button appears to compare original vs fixed content
- **If Gate 1 = `PASS` or `FLAG_TO_JUDGE`**: Gate 2 shows normal judge results

### Usage Example

```tsx
import { Stage6QualityTab } from '@/components/generation-graph/panels/stage6/inspector/tabs';

function LessonInspector() {
  return (
    <Stage6QualityTab
      selfReviewResult={selfReviewData}
      judgeResult={judgeData}
      originalContent={originalMarkdown}
      fixedContent={fixedMarkdown}
      locale="en"
    />
  );
}
```

### Visual States

#### Gate 1: SelfReviewGate

- **Pending State**: Gray card with pulsing indicator
- **PASS State**: Green banner with ShieldCheck icon
- **FIXED State**: Blue card with Wrench icon + "View Diff" button
- **FLAG_TO_JUDGE State**: Amber card with AlertTriangle icon + issue list
- **REGENERATE State**: Red card with RefreshCw icon

#### Gate 2: JudgeGate

- **Disabled State**: Gray card with 50% opacity, "Skipped (Regeneration Required)" message
- **Pending State**: Gray card with pulsing indicator
- **Active State**: Cyan-themed card showing:
  - Final score (0-100%)
  - Verdict badge (color-coded)
  - Rubric grid with criteria scores
  - Consensus method indicator
  - Critique/reasoning text
  - Heuristic issues (if any)

### Localization

Component supports both English and Russian locales:

```tsx
// English
<Stage6QualityTab locale="en" {...props} />

// Russian
<Stage6QualityTab locale="ru" {...props} />
```

All UI strings are translated via internal translation function. Future enhancement: integrate with GRAPH_TRANSLATIONS.

### Type Dependencies

From `@megacampus/shared-types`:
- `SelfReviewResult` - Self-review node output
- `SelfReviewStatus` - Status enum (PASS, FIXED, FLAG_TO_JUDGE, PASS_WITH_FLAGS, REGENERATE)
- `JudgeVerdictDisplay` - Complete judge verdict with CLEV voting results
- `JudgeVerdictType` - Verdict enum (ACCEPT, ACCEPT_WITH_MINOR_REVISION, etc.)

### Future Enhancements

1. **Diff Viewer Modal**: Implement side-by-side diff comparison for FIXED status
2. **Translation Integration**: Use GRAPH_TRANSLATIONS instead of inline translations
3. **Expandable Sections**: Allow collapsing Gate 1/Gate 2 to save space
4. **Export to PDF**: Generate quality report PDF with all assessment details
5. **Judge Vote Expansion**: Show individual judge votes in expandable cards

### Related Components

- `SelfReviewPanel` - Detailed self-review visualization (separate panel)
- `JudgeVotingPanel` - Detailed CLEV voting visualization (separate panel)
- `LessonInspector` - Parent component containing all inspector tabs

### Testing

See `Stage6QualityTab.example.tsx` for comprehensive usage examples covering all status combinations.

---

**Location**: `/packages/web/components/generation-graph/panels/stage6/inspector/tabs/Stage6QualityTab.tsx`

**Created**: 2024-12-24 (Phase 4 of Stage 6 UI Implementation)

**Design Specification**: `specs/022-lesson-enrichments/stage-7-lesson-enrichments.md`
