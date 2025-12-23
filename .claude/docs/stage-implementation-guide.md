# Stage Implementation Guide

> Reference document for implementing stage-specific UI in the Generation Graph.
> Based on Stage 1 "Course Passport" implementation.

## Overview

This document captures architectural decisions and patterns established during Stage 1 implementation. Use it as a reference when implementing UI for Stages 2-6, adapting patterns to each stage's specific requirements.

---

## Stage 1 Summary: "Course Passport"

### Concept
Stage 1 is unique: the user is the **AUTHOR**, not a reviewer. The UI must be authoritative, static, and "contractual" — showing what the user provided as input for course generation.

### Key Difference from Other Stages
- Data exists **BEFORE** generation starts (course is already created)
- No AI processing happens — just initialization/validation
- User cannot modify data here (read-only passport)

---

## Architecture Decisions

### 1. Data Flow Pattern

```
page.tsx (Server Component)
    ↓ constructs stage1CourseData from DB
GenerationProgressContainerEnhanced (Client)
    ↓ passes stage1CourseData prop
GraphViewWrapper
    ↓ passes to GraphView
GraphView → useGraphData hook
    ↓ passes to buildGraph
graph-builders.ts
    ↓ uses for Stage 1 node when no traces exist
```

**Key Insight**: Pre-load data at the top level (server component) and pass it down. Don't rely solely on generation traces for stages that have data before generation starts.

### 2. Pre-loaded Data Interface

```typescript
// In GraphViewWrapper.tsx
export interface Stage1CourseData {
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
}
```

Use generic `Record<string, unknown>` for data flow compatibility. Specific type validation happens in the panel components.

### 3. Node Status Logic

```typescript
// In graph-builders.ts
const isStage1 = i === 1;
const hasStage1Preload = isStage1 && stage1CourseData;

// If preloaded data exists and no traces yet, show as 'completed'
const effectiveStatus = hasStage1Preload && currentStatus === 'pending'
  ? 'completed' as NodeStatus
  : currentStatus;
```

---

## Component Structure

### Panel Components (4 tabs)

```
panels/stage1/
├── index.ts              # Re-exports
├── types.ts              # Stage-specific types
├── Stage1InputTab.tsx    # User's input parameters
├── Stage1ProcessTab.tsx  # Validation receipt
├── Stage1OutputTab.tsx   # Course passport (IDs, status)
└── Stage1ActivityTab.tsx # Activity timeline
```

### Tab Content Guidelines

| Tab | Purpose | Data Source |
|-----|---------|-------------|
| Input | Show user-provided parameters | `node.data.inputData` |
| Process | Show processing steps/validation | Derived from traces or synthetic |
| Output | Show results/artifacts | `node.data.outputData` |
| Activity | Show chronological events | Traces or synthetic events |

---

## i18n Implementation

### Translation Location
All stage-specific translations go in `lib/generation-graph/translations.ts`:

```typescript
export const GRAPH_TRANSLATIONS = {
  // ...existing sections...

  stage1: {
    // Input Tab
    identity: { ru: 'Идентификация', en: 'Identity' },
    topic: { ru: 'Тема курса', en: 'Course Topic' },
    // ... more keys
  },

  stageDescriptions: {
    stage_1: {
      ru: 'Паспорт курса — ваши исходные данные...',
      en: 'Course passport — your source data...',
    },
    // stage_2, stage_3, etc.
  },
};
```

### Translation Helper Pattern

```typescript
// In component
type Stage1TranslationKey = 'coursePassport' | 'courseId' | /* ... */;

function getTranslation(key: Stage1TranslationKey, locale: 'ru' | 'en'): string {
  const translations = GRAPH_TRANSLATIONS.stage1;
  if (!translations) return key;
  const entry = translations[key];
  if (!entry) return key;
  return entry[locale] || key;
}

// Usage in component
const t = useCallback(
  (key: Stage1TranslationKey) => getTranslation(key, locale),
  [locale]
);
```

### i18n Checklist
- [ ] No hardcoded user-visible text
- [ ] All strings in translations.ts with ru/en variants
- [ ] aria-labels are translated
- [ ] Error messages are translated
- [ ] Empty states are translated
- [ ] Fallback text uses translations, not inline ternaries

---

## Dark Theme Support

Use Tailwind's dark mode variants consistently:

```typescript
// Colors
'text-slate-600 dark:text-slate-400'
'bg-slate-100 dark:bg-slate-800'
'border-slate-200 dark:border-slate-700'

// For status colors
const STRATEGY_COLORS: Record<string, string> = {
  auto: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  // ...
};
```

---

## Synthetic Activity Events

When real traces don't exist (e.g., before generation starts), generate synthetic events from available data:

```typescript
function generateSyntheticEvents(
  inputData: Stage1InputData | undefined,
  outputData: Stage1OutputData | undefined,
  locale: 'ru' | 'en'
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  // Event: Course created
  if (outputData?.createdAt) {
    events.push({
      id: 'synthetic_course_created',
      timestamp: new Date(outputData.createdAt),
      actor: 'system',
      type: 'success',
      message: t('courseCreated'),
    });
  }

  // Event: Files uploaded
  if (inputData?.files?.length > 0) {
    events.push({
      id: 'synthetic_files_uploaded',
      timestamp: new Date(/* slightly after creation */),
      actor: 'user',
      type: 'success',
      message: locale === 'ru' ? `Загружено файлов: ${count}` : `Files uploaded: ${count}`,
    });
  }

  return events;
}
```

---

## Drawer Description Pattern

Each stage should have a meaningful description in the drawer header:

```typescript
// In NodeDetailsDrawer.tsx
<SheetDescription>
  {data?.stageNumber
    ? t(`stageDescriptions.stage_${data.stageNumber}`)
    : t('stageDescriptions.default')}
</SheetDescription>
```

Stage descriptions should explain:
- What this stage does
- What the user should expect
- Why it matters in the generation flow

---

## Production Quality Checklist

### Defensive Programming
- [ ] `Number.isFinite()` guards for numeric displays (file sizes, percentages)
- [ ] Safe array access with fallbacks
- [ ] Null checks before property access
- [ ] Try-catch for date parsing

### Accessibility
- [ ] aria-labels on interactive elements
- [ ] Keyboard navigation support
- [ ] Screen reader friendly content

### Performance
- [ ] `React.memo` for tab components
- [ ] `useMemo` for expensive computations
- [ ] `useCallback` for handlers passed as props
- [ ] `useRef` for timeout cleanup (race condition prevention)

### UX Polish
- [ ] Loading states
- [ ] Empty states with helpful messages
- [ ] Error states with recovery options
- [ ] Copy buttons with feedback

---

## File Locations Reference

```
packages/web/
├── components/generation-graph/
│   ├── GraphViewWrapper.tsx      # Stage1CourseData interface
│   ├── GraphView.tsx             # Passes stage1CourseData to hook
│   ├── hooks/
│   │   ├── useGraphData.ts       # Extracts and passes to builder
│   │   └── use-graph-data/
│   │       ├── types.ts          # Stage1CourseData, UseGraphDataOptions
│   │       └── utils/
│   │           └── graph-builders.ts  # Uses preloaded data for nodes
│   └── panels/
│       ├── NodeDetailsDrawer.tsx # Stage-specific tab routing
│       └── stage1/               # Stage 1 panel components
│           ├── types.ts
│           ├── Stage1InputTab.tsx
│           ├── Stage1ProcessTab.tsx
│           ├── Stage1OutputTab.tsx
│           └── Stage1ActivityTab.tsx
├── lib/generation-graph/
│   ├── translations.ts           # All translations
│   └── useTranslation.ts         # Translation hook
└── app/[locale]/courses/generating/[slug]/
    ├── page.tsx                  # Constructs stage1CourseData
    └── GenerationProgressContainerEnhanced.tsx  # Passes to wrapper
```

---

## Adapting for Other Stages

### Stage 2-3: Document Processing
- Multiple parallel items (documents)
- Progress per document
- Different tab content (document details, processing steps)

### Stage 4-5: Analysis & Structure
- Phases within stage (not just attempts)
- Complex output visualization
- Approval workflows

### Stage 6: Content Generation
- Lessons within modules (hierarchical)
- Individual lesson inspection
- Quality metrics per lesson

### Questions to Ask for Each Stage
1. What data exists before this stage runs?
2. What are the user's actions vs system actions?
3. What should Input/Process/Output/Activity tabs show?
4. Are there sub-items (documents, lessons) that need their own UI?
5. What approval/interaction points exist?

---

## Version History

| Date | Changes |
|------|---------|
| 2024-12-23 | Initial Stage 1 implementation |
