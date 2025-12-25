# Stage 6 "Glass Factory" UI/UX Redesign - Final Specification

> **Last Updated:** 2025-01-XX (synced with implementation)
> **Status:** ✅ 80% Implemented

## Overview

Stage 6 "Glass Factory" is the lesson content generation stage. Unlike Stages 4-5 which have linear pipelines, Stage 6 operates on **multiple entities**: modules and lessons.

**Design Philosophy: "Editorial IDE"**
Transition from a web-page layout to an Integrated Development Environment (IDE) architecture - mimicking professional tools like VS Code or Linear.

**Current Views:**
1. **Module Dashboard** - Overview of all lessons in a module with aggregated metrics
2. **Lesson Inspector** - Detailed view of individual lesson generation

**Color Scheme:** Blue/Cyan (`blue-500` / `cyan-400` dark mode)
**Metaphor:** Glass Factory producing refined educational content from raw materials

---

## Pipeline Architecture (UPDATED)

> **IMPORTANT:** The pipeline was refactored from 6 nodes to 3 nodes.

| Original Spec | Current Implementation |
|---------------|------------------------|
| Planner → Expander → Assembler → Smoother → SelfReviewer → Judge | **Generator → SelfReviewer → Judge** |
| 6 pipeline nodes | **3 pipeline nodes** |
| 6 segments in SegmentedPillTrack | **3 segments** |

**Rationale:** The Generator node consolidates the original planner/expander/assembler/smoother into a single generation step, simplifying the UI while maintaining the critical SelfReviewer and Judge quality gates.

---

## Consistency Requirements (from Stage 4/5 patterns)

### Must Follow Patterns:
```typescript
// Import patterns
import type { ... } from '@megacampus/shared-types';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { getTierModelName } from '@/lib/generation-graph/constants';
import { getSupabaseClient } from '@/lib/supabase/browser-client';

// Props interface pattern
interface Stage6ModuleDashboardProps {
  courseId?: string;
  data?: ModuleDashboardData | unknown;
  locale?: 'ru' | 'en';
}

// Translation pattern
const t = GRAPH_TRANSLATIONS.stage6;
const label = t?.moduleProgress?.[locale] ?? 'Module Progress';
```

---

## Current Problems Summary

### Module Dashboard Issues:
1. **Cost in USD ($0.42)** - Should show tokens (e.g., "124.5K tokens")
2. **Quality as decimal (0.92)** - Should be percentage (92%)
3. **Header takes excessive vertical space** - 4 large cards consume 200+ pixels
4. **No tier-based model naming** - Should use `getTierModelName()`
5. **Missing breakdown by status** - Need "5 completed, 3 active, 2 pending"

### Lesson Inspector Issues:
1. **Content tabs at BOTTOM** - Should be at TOP
2. **Accordion instead of tabs** - Creates visual clutter
3. **JudgeVotingPanel misplacement** - Should be in Quality tab
4. **No persistent metrics display** - Tokens/time/quality not visible while reading
5. **Missing SelfReviewer node** - New 6th pipeline node needs UI

---

## Final Design Decisions

### Decision 1: Stats Strip (Persistent Metrics Header)

**Verdict:** Do NOT hide metrics in a separate tab. Metrics are "vitals" that must be visible while reading or debugging.

**Implementation:** Sticky **Stats Strip** at the top of Right Panel, below tabs, above content.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Preview]  [Quality]  [Blueprint]  [Trace]            [Approve Lesson]  │ ← Tabs
├─────────────────────────────────────────────────────────────────────────┤
│ 💎 14.5k Tokens ($0.04)  │  ⏱️ 42s  │  ⚡ Premium  │  🛡️ 92% Quality   │ ← Stats Strip
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  # Lesson 1.2: Introduction to React                                    │
│  (Scrollable Content Area)                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Interaction:** Hover on `14.5k Tokens` → tooltip breakdown: `Planner: 1k, Expander: 12k, Judge: 1.5k`

---

### Decision 2: Segmented Pill Track (Dashboard Mini-Map)

**Verdict:** Simple progress bar is too vague. Segmented track shows pipeline topology.

**Implementation:** **Segmented Bar** - 3 connected pills with 1px gaps (updated from 6).

```
[ Lesson 1.2: Introduction to React  ]
[ ■ ▣ □ ]  ← Step 2 Active (SelfReviewer)
```

**Pipeline Order:**
1. **Generator** - Content generation
2. **SelfReviewer** - Auto-correction
3. **Judge** - Quality assessment

**Visual States:**
| State | Color | Description |
|-------|-------|-------------|
| Pending | Gray | Not started |
| Active | Cyan Pulse | Currently processing |
| Completed | Blue Solid | Done |
| SelfReview Fixed | Purple | Auto-fixed (visual distinction) |
| Failed | Red | Error |

**Tooltip on hover:** `"Step 2/3: Self-Reviewer (Fixing...)"`

---

### Decision 3: Blueprint Tab (Metadata)

**Verdict:** Rename "Metadata" to **Blueprint**. Metadata represents the *specification* for the lesson.

**Tab Order:**
1. **Preview** - The Content (Primary, default)
2. **Quality** - The Validation (Secondary)
3. **Blueprint** - The Specs (Reference) - Learning Objectives, Prerequisites, Target Audience
4. **Trace** - The Logs (Debugging)

**Separation of Concerns:**
- *Blueprint:* What we asked for
- *Preview:* What we got
- *Quality:* How good it is

---

### Decision 4: Two-Gate Waterfall (Quality Tab Structure)

**Verdict:** SelfReviewer runs *before* Judge - UI must show linear dependency. Do NOT place them side-by-side.

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│ GATE 1: Auto-Correction (SelfReviewer)                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🛡️ PASS: No issues found                                    │ │ ← Green Banner
│ │ 🔧 FIXED: [View Diff] - 2 issues auto-corrected             │ │ ← Blue Card
│ │ ⚠️ FLAGGED: Hallucination detected in Section 3             │ │ ← Amber Card
│ └─────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
│ GATE 2: Final Assessment (Judge)                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Rubric Grid: Depth 90% │ Clarity 95% │ Style 88%            │ │
│ │ Critique: "Good coverage, minor formatting issues..."       │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Logic:** If Gate 1 = `REGENERATE`, Gate 2 is disabled/hidden (Judge never ran).

---

## Module Dashboard Redesign

### The "Control Tower" Header (80px height)

Replaces 4 large cards with a single sticky, compact bar.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Module 3: React Hooks                                                   │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│ │ ■■■■□□□□□□ │ │ 1.2M Tkns  │ │ 92% Qual   │ │ 12m 45s    │ [Actions] │
│ │ 8/10 Ready │ │ Premium    │ │ ↑ +3%      │ │ ~2m left   │            │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Lesson Cards with Segmented Track

> **Status:** 🔴 `Stage6LessonCard` NOT implemented - uses legacy lesson panels.

```
┌───────────────────────────────────────────────────────────┐
│ Lesson 1.2: Introduction to React                    [→]  │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ [ ■ ▣ □ ]  Step 2/3: Self-Reviewer                 │   │
│ └─────────────────────────────────────────────────────┘   │
│ 45k Tokens  │  92% Quality  │  Theory                     │
└───────────────────────────────────────────────────────────┘
```

---

## Lesson Inspector Redesign

### Selected Layout: Single Panel with Tabs (Simplified)

> **UPDATED:** Implementation uses single-panel layout instead of split-pane.
> The left sidebar with PipelineStepper is NOT implemented.

**Current Implementation:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Preview] [Quality] [Blueprint] [Trace]    [Approve] [Edit] [Regenerate]│
├─────────────────────────────────────────────────────────────────────────┤
│ 💎 14.5k T  │  ⏱️ 42s  │  ⚡ Premium  │  🛡️ 92% Quality               │ ← Stats Strip
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   # Introduction to React Hooks                                         │
│                                                                         │
│   React Hooks are functions that let you use state and lifecycle        │
│   features in functional components...                                  │
│                                                                         │
│   (Scrollable Content Area)                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Original Plan (Deferred):**

```
┌────────────────────────┬────────────────────────────────────────────────┐
│   LEFT SIDEBAR         │              RIGHT PANEL                       │
│   (Fixed 280px)        │                                                │
│ ┌──────────────────┐   │ ┌──────────────────────────────────────────┐   │
│ │ Pipeline Stepper │   │ │ [Preview] [Quality] [Blueprint] [Trace] │   │
│ │ ✓ Generator  20s │   │ ├──────────────────────────────────────────┤   │
│ │ ● SelfReview 3s  │   │ │ Stats Strip                              │   │
│ │ ○ Judge          │   │ ├──────────────────────────────────────────┤   │
│ └──────────────────┘   │ │ Content...                               │   │
│ ┌──────────────────┐   │ │                                          │   │
│ │ [Approve Lesson] │   │ │                                          │   │
│ │ [↻ Regenerate]   │   │ └──────────────────────────────────────────┘   │
│ └──────────────────┘   │                                                │
└────────────────────────┴────────────────────────────────────────────────┘
```

### Tab Contents

| Tab | Purpose | Implementation Status |
|-----|---------|----------------------|
| **Preview** | Rendered Markdown content (default) | ✅ Inline in `Stage6InspectorContent` |
| **Quality** | Two-Gate Waterfall (SelfReview + Judge) | ✅ `Stage6QualityTab` component |
| **Blueprint** | Learning Objectives, Prerequisites | ✅ `Stage6BlueprintTab` component |
| **Trace** | Node-by-node logs, Activity | ✅ Inline in `Stage6InspectorContent` |

> **Note:** Preview and Trace tabs are rendered inline in `Stage6InspectorContent.tsx` rather than as separate components. Quality and Blueprint have dedicated components.

---

## Component Specifications

### Dashboard Components

```typescript
// Stage6ControlTower.tsx
interface Stage6ControlTowerProps {
  moduleTitle: string;
  moduleId: string;
  stats: {
    totalTokens: number;
    avgQuality: number; // 0-100 integer
    statusCounts: { completed: number; active: number; pending: number; failed: number };
    totalDurationMs: number;
    estimatedRemainingMs?: number;
  };
  modelTier: 'low' | 'medium' | 'high';
  locale?: 'ru' | 'en';
  onRegenerateAll: () => void;
  onExportAll: () => void;
}

// Stage6LessonCard.tsx
interface Stage6LessonCardProps {
  lesson: {
    id: string;
    title: string;
    type: 'theory' | 'quiz' | 'practice';
    orderIndex: number;
  };
  pipelineState: Record<Stage6NodeName, 'idle' | 'running' | 'completed' | 'failed'>;
  selfReviewOutcome?: 'PASS' | 'FIXED' | 'FLAG_TO_JUDGE' | 'REGENERATE';
  metrics: { tokens: number; quality: number | null };
  locale?: 'ru' | 'en';
  onOpen: () => void;
}

// SegmentedPillTrack.tsx
interface SegmentedPillTrackProps {
  nodes: Array<{
    id: Stage6NodeName;
    status: 'idle' | 'running' | 'completed' | 'failed';
  }>;
  selfReviewOutcome?: 'PASS' | 'FIXED' | 'FLAG_TO_JUDGE' | 'REGENERATE';
  locale?: 'ru' | 'en';
}
```

### Inspector Components

```typescript
// Stage6LessonInspector.tsx
interface Stage6LessonInspectorProps {
  data: LessonInspectorData;
  pipelineNodes: Array<{
    id: Stage6NodeName;
    status: 'idle' | 'running' | 'completed' | 'failed';
    durationMs: number;
    tokensUsed?: number;
  }>;
  selfReviewResult?: SelfReviewResult;
  judgeResult?: JudgeVerdictDisplay;

  // Actions
  onApprove: () => void;
  onRegenerate: (fromNode?: Stage6NodeName) => void;
  onEdit: () => void;
  onBack: () => void;
  onClose: () => void;

  // UI State
  activeTab: 'preview' | 'quality' | 'blueprint' | 'trace';
  onTabChange: (tab: string) => void;
  isApproving?: boolean;
  isRegenerating?: boolean;
  locale?: 'ru' | 'en';
}

// Stage6StatsStrip.tsx
interface Stage6StatsStripProps {
  tokens: number;
  costUsd?: number; // Optional, shown in tooltip
  durationMs: number;
  modelTier: 'low' | 'medium' | 'high';
  quality: number; // 0-100
  tokensBreakdown?: Record<Stage6NodeName, number>; // For tooltip
  locale?: 'ru' | 'en';
}

// Stage6QualityTab.tsx (Two-Gate Waterfall)
interface Stage6QualityTabProps {
  selfReviewResult?: SelfReviewResult;
  judgeResult?: JudgeVerdictDisplay;
  originalContent?: string; // For diff view
  fixedContent?: string;    // For diff view
  locale?: 'ru' | 'en';
}

// SelfReviewGate.tsx
interface SelfReviewGateProps {
  result: SelfReviewResult;
  originalContent?: string;
  fixedContent?: string;
  onViewDiff?: () => void;
  locale?: 'ru' | 'en';
}

// DiffViewer.tsx
interface DiffViewerProps {
  originalContent: string;
  fixedContent: string;
  changes?: SelfReviewResult['issues'];
}

// Stage6BlueprintTab.tsx
interface Stage6BlueprintTabProps {
  learningObjectives: string[];
  prerequisites?: string[];
  targetAudience?: string;
  estimatedDuration?: number; // minutes
  lessonType: 'theory' | 'quiz' | 'practice';
  locale?: 'ru' | 'en';
}
```

---

## SelfReviewer Visual States

| Decision | Sidebar Icon | Gate 1 Content | Color |
|----------|--------------|----------------|-------|
| **PASS** | Green Shield ✓ | "No issues found. Ready for Judge." | `green-500` |
| **FIXED** | Blue Wrench 🔧 | Diff View (red/green highlights) + "2 issues auto-corrected" | `blue-500` |
| **FLAG_TO_JUDGE** | Amber Triangle ⚠️ | List of warnings for human review | `amber-500` |
| **REGENERATE** | Red Refresh ↻ | Error message + "Requires full regeneration" | `red-500` |

---

## File Structure

### Current Implementation

```
packages/web/components/generation-graph/panels/stage6/
├── index.ts                          # Re-exports
│
├── dashboard/
│   ├── Stage6ControlTower.tsx        ✅ Compact header with metrics
│   └── SegmentedPillTrack.tsx        ✅ 3-segment pipeline visualization
│
├── inspector/
│   ├── Stage6InspectorContent.tsx    ✅ Main layout with inline Preview/Trace
│   ├── Stage6StatsStrip.tsx          ✅ Persistent metrics header
│   │
│   ├── tabs/
│   │   ├── Stage6QualityTab.tsx      ✅ Two-Gate Waterfall
│   │   └── Stage6BlueprintTab.tsx    ✅ Learning objectives, prerequisites
│   │
│   └── quality/
│       └── DiffViewer.tsx            ✅ Before/after comparison
```

### Not Implemented (Deferred)

```
├── dashboard/
│   ├── Stage6ModuleDashboard.tsx     🔴 Dashboard wrapper
│   └── Stage6LessonCard.tsx          🔴 Lesson card with segmented track
│
├── inspector/
│   ├── Stage6InspectorSidebar.tsx    🔴 Left panel with pipeline
│   ├── tabs/
│   │   ├── Stage6PreviewTab.tsx      🔴 (inline in InspectorContent)
│   │   └── Stage6TraceTab.tsx        🔴 (inline in InspectorContent)
│   └── quality/
│       ├── SelfReviewGate.tsx        🔴 (inline in QualityTab)
│       └── JudgeScorecard.tsx        🔴 (inline in QualityTab)
│
└── shared/
    ├── PipelineStepper.tsx           🔴 Vertical node stepper
    └── LessonTypeIcon.tsx            🔴 Theory/Quiz/Practice icons
```

---

## Translation Keys

> **Note:** Current implementation uses inline translations in components.
> TODO: Migrate to `GRAPH_TRANSLATIONS.stage6` for consistency with Stage 4/5.

```typescript
// lib/generation-graph/translations.ts
stage6: {
  // Dashboard
  controlTower: {
    title: { ru: 'Модуль', en: 'Module' },
    tokensUsed: { ru: 'Токены', en: 'Tokens' },
    avgQuality: { ru: 'Качество', en: 'Quality' },
    timeElapsed: { ru: 'Время', en: 'Time' },
    lessonsReady: { ru: 'Готово', en: 'Ready' },
    regenerateAll: { ru: 'Пересоздать все', en: 'Regenerate All' },
    exportAll: { ru: 'Экспорт', en: 'Export' },
  },

  // Lesson Card
  lessonCard: {
    stepProgress: { ru: 'Шаг', en: 'Step' },
    tokens: { ru: 'Т', en: 'T' }, // Abbreviated
  },

  // Inspector Tabs
  tabs: {
    preview: { ru: 'Просмотр', en: 'Preview' },
    quality: { ru: 'Качество', en: 'Quality' },
    blueprint: { ru: 'Спецификация', en: 'Blueprint' },
    trace: { ru: 'Трейс', en: 'Trace' },
  },

  // Stats Strip
  statsStrip: {
    tokens: { ru: 'Токены', en: 'Tokens' },
    time: { ru: 'Время', en: 'Time' },
    quality: { ru: 'Качество', en: 'Quality' },
    tier: { ru: 'Модель', en: 'Model' },
  },

  // Pipeline Nodes (UPDATED: 3 nodes instead of 6)
  nodes: {
    generator: { ru: 'Генератор', en: 'Generator' },
    selfReviewer: { ru: 'Самопроверка', en: 'Self-Review' },
    judge: { ru: 'Арбитр', en: 'Judge' },
  },

  // Quality Tab - Gate 1 (SelfReview)
  selfReview: {
    gateTitle: { ru: 'Автокоррекция', en: 'Auto-Correction' },
    passed: { ru: 'Проверка пройдена', en: 'Review Passed' },
    noIssues: { ru: 'Проблем не найдено', en: 'No issues found' },
    fixed: { ru: 'Исправлено автоматически', en: 'Auto-Fixed' },
    issuesFixed: { ru: 'исправлено', en: 'issues corrected' },
    viewDiff: { ru: 'Показать изменения', en: 'View Changes' },
    flagged: { ru: 'Требует внимания', en: 'Needs Review' },
    regenerate: { ru: 'Требуется перегенерация', en: 'Regeneration Required' },
  },

  // Quality Tab - Gate 2 (Judge)
  judge: {
    gateTitle: { ru: 'Финальная оценка', en: 'Final Assessment' },
    depth: { ru: 'Глубина', en: 'Depth' },
    clarity: { ru: 'Ясность', en: 'Clarity' },
    style: { ru: 'Стиль', en: 'Style' },
    critique: { ru: 'Комментарий', en: 'Critique' },
  },

  // Blueprint Tab
  blueprint: {
    learningObjectives: { ru: 'Цели обучения', en: 'Learning Objectives' },
    prerequisites: { ru: 'Пререквизиты', en: 'Prerequisites' },
    targetAudience: { ru: 'Целевая аудитория', en: 'Target Audience' },
    estimatedDuration: { ru: 'Длительность', en: 'Duration' },
    lessonType: { ru: 'Тип урока', en: 'Lesson Type' },
  },

  // Actions
  actions: {
    approve: { ru: 'Одобрить', en: 'Approve' },
    approving: { ru: 'Одобрение...', en: 'Approving...' },
    regenerate: { ru: 'Пересоздать', en: 'Regenerate' },
    regenerating: { ru: 'Пересоздание...', en: 'Regenerating...' },
    edit: { ru: 'Редактировать', en: 'Edit' },
  },

  // Status
  status: {
    completed: { ru: 'готово', en: 'completed' },
    active: { ru: 'в работе', en: 'active' },
    pending: { ru: 'ожидает', en: 'pending' },
    failed: { ru: 'ошибка', en: 'failed' },
  },
}
```

---

## Responsive Behavior

| Breakpoint | Dashboard | Inspector |
|------------|-----------|-----------|
| **Desktop (>1200px)** | Full Control Tower + Cards grid | Split layout (280px sidebar + fluid content) |
| **Tablet (768-1200px)** | Compact header + Cards list | Sidebar collapses to Icon Rail (50px), expand on hover |
| **Mobile (<768px)** | Progress bar + Tokens only, vertical card stack | Sidebar = hamburger drawer, tabs = horizontal scroll, Approve = FAB |

---

## Implementation Phases

### Phase 1: Dashboard Cleanup ✅ COMPLETE
1. ✅ Implement `Stage6ControlTower` (compact header)
2. ✅ Migrate metrics to Tokens/Percentage
3. ✅ Add tier-based model naming
4. ✅ Add status breakdown

### Phase 2: Inspector Shell ✅ COMPLETE
1. ⚠️ Build Split-Pane layout with `ResizablePanel` → **Simplified to single panel**
2. ✅ Move tabs to TOP of right panel
3. ✅ Implement `Stage6StatsStrip` (persistent metrics)
4. ✅ Update tab structure: Preview, Quality, Blueprint, Trace

### Phase 3: Pipeline Visualization ✅ COMPLETE
1. ✅ Build `SegmentedPillTrack` for lesson cards (3 nodes)
2. ✅ Connect node states to UI
3. 🔴 `PipelineStepper` in sidebar → **Deferred**

### Phase 4: Quality & SelfReview ✅ COMPLETE
1. ✅ Implement Two-Gate Waterfall in `Stage6QualityTab`
2. ✅ Build `DiffViewer` for FIXED state
3. ✅ Connect SelfReviewer results

### Remaining Work (Optional Enhancements)
1. 🔴 `Stage6LessonCard` component with segmented track
2. 🔴 `Stage6ModuleDashboard` wrapper component
3. 🔴 Left sidebar with `PipelineStepper`
4. 🔴 Migrate inline translations to `GRAPH_TRANSLATIONS.stage6`

---

## Technical Considerations

1. **State Management**
   - Preserve active tab when switching lessons
   - Use URL hash for deep-linking to tabs (`#quality`, `#blueprint`)

2. **Performance**
   - Lazy load DiffViewer (heavy diff computation)
   - Lazy load markdown renderer
   - Virtualize lesson list for large modules

3. **Accessibility**
   - Keyboard navigation between tabs (Arrow keys)
   - ARIA labels for tab panel and gates
   - Focus management on tab switch
   - Screen reader announcements for status changes

4. **Real-time Updates**
   - Stats Strip updates tokens/time during generation
   - Pipeline stepper animates active node
   - Segmented track pulses on active segment

---

## Reference Files

**Existing Stage 6 Implementation:**
- `panels/module/ModuleDashboard.tsx`
- `panels/module/ModuleDashboardHeader.tsx`
- `panels/lesson/LessonInspector.tsx`
- `panels/lesson/LessonInspectorLayout.tsx`
- `panels/lesson/ContentPreviewPanel.tsx`
- `panels/lesson/PipelinePanel.tsx`

**Stage 4/5 Patterns (for consistency):**
- `panels/stage4/Stage4ProcessTab.tsx` - Phase stepper pattern
- `panels/stage4/Stage4ActivityTab.tsx` - Grouped accordion pattern
- `panels/stage5/Stage5OutputTab.tsx` - Tree view pattern

**Self-Review Implementation:**
- `specs/022-lesson-enrichments/self-review-implementation-plan.md`
