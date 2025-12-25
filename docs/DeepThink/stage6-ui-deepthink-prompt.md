# DeepThink Prompt: Stage 6 "Glass Factory" UI/UX Redesign

## Task

You are a senior UI/UX architect tasked with redesigning the Stage 6 "Glass Factory" user interface for a course generation platform. Stage 6 handles lesson content generation and consists of two main views:

1. **Module Dashboard** - Overview of all lessons in a module
2. **Lesson Inspector** - Detailed view of individual lesson generation

Your goal is to propose a comprehensive UI/UX redesign that:
- Fixes the identified usability problems
- Maintains consistency with existing Stage 4/5 patterns
- Accommodates the upcoming SelfReviewer node feature
- Improves information hierarchy and user workflow

---

## Context

### Platform Overview

MegaCampusAI is an AI-powered course generation platform. It uses a 6-stage pipeline:
- Stage 1: Course Passport (user input)
- Stage 2: Document Processing (uploaded files)
- Stage 3: Document Classification (priority ranking)
- Stage 4: Deep Analysis (content analysis) - **Violet/Purple theme**
- Stage 5: Generation (course structure) - **Orange/Amber theme**
- Stage 6: Glass Factory (lesson content) - **Blue/Cyan theme**

### Design System

**Color Scheme for Stage 6:** Blue/Cyan (`blue-500` / `cyan-400` in dark mode)

**Metaphor:** "Glass Factory" - A factory producing refined, polished educational content from raw materials

**UI Patterns from Stage 4/5:**
- 4-tab structure: Input, Process, Output, Activity
- Translation system: GRAPH_TRANSLATIONS with ru/en keys
- Tier-based model naming (hide actual model names, show "Premium Model", etc.)
- Tokens displayed instead of cost in USD
- Quality as percentage (92%) not decimal (0.92)

### User Personas

1. **Course Creator** - Creates courses, reviews generated content, approves lessons
2. **Administrator** - Monitors generation progress, handles errors, manages quality
3. **Power User** - Needs detailed metrics, raw data access, debugging capabilities

---

## Current Problems to Solve

### Module Dashboard Issues

1. **Cost displayed in USD** - Should show tokens instead (users understand tokens better)
2. **Quality as decimal (0.92)** - Should be percentage (92%)
3. **Header takes too much space** - 4 large cards consume 200+ pixels
4. **Missing status breakdown** - Need "5 completed, 3 active, 2 pending"
5. **No tier-based model naming** - Should use getTierModelName()

### Lesson Inspector Issues (CRITICAL)

1. **Content tabs at BOTTOM of screen** - Tabs (Preview/Markdown/Metadata) are at bottom 1/3 of the screen, extremely inconvenient

2. **Accordion instead of proper tabs** - Content sections expand as accordion list, creating visual clutter

3. **JudgeVotingPanel misplacement** - Quality assessment panel takes space inline instead of being a separate tab

4. **No consolidated "Result" view** - Missing view showing:
   - Rendered lesson preview
   - Key metrics (tokens, time, quality)
   - Status badge

5. **Poor screen real estate** - Left panel (35%) mostly empty after showing 6 pipeline nodes

6. **Missing per-lesson metrics:**
   - Tokens used for this lesson
   - Processing time
   - Cost per lesson
   - Quality breakdown by node

### Upcoming Feature: SelfReviewer Node

A new node is being added to the pipeline:
```
Planner → Expander → Assembler → Smoother → SelfReviewer → Judge
```

SelfReviewer checks content before expensive LLM judges and can:
- PASS - Send to judges
- FIXED - Auto-fix minor issues and send to judges
- FLAG_TO_JUDGE - Flag issues for judge attention
- REGENERATE - Critical issues, need full regeneration

UI must accommodate:
- 6th node in pipeline stepper
- New tab/section for self-review results
- Display of issues found and fixes applied

---

## Your Deliverables

Please provide a comprehensive redesign proposal covering:

### 1. Layout Architecture

**For Module Dashboard:**
- Proposed header structure (compact vs current grid)
- Metrics to display and format (tokens vs $, % vs decimal)
- Status breakdown visualization
- Any additional information hierarchy changes

**For Lesson Inspector:**
- Choose and justify between:
  - **Option A**: Tab-based layout (tabs at top, full-width content)
  - **Option B**: Split layout (sidebar + content area with tabs)
- Tab structure and naming
- Default tab and user flow
- Footer/action bar design

### 2. Component Breakdown

List all components needed with:
- Component name
- Purpose
- Props interface (TypeScript)
- Child components

Example format:
```typescript
// Stage6LessonInspector.tsx
interface Stage6LessonInspectorProps {
  data: LessonInspectorData;
  onApprove: () => void;
  onRegenerate: () => void;
  isLoading?: boolean;
  locale?: 'ru' | 'en';
}
```

### 3. Information Architecture

For each view, define:
- What information is shown at each level
- Visual hierarchy (what's prominent vs secondary)
- User actions and their placement
- Empty states and loading states

### 4. SelfReviewer Integration

- How to display self-review status in pipeline
- Tab content for self-review results
- Color coding for different decisions
- How to show "before/after" if content was fixed

### 5. Responsive Considerations

- How does layout adapt for:
  - Desktop (1440px+)
  - Tablet (768px-1024px)
  - Mobile (< 768px)

### 6. Accessibility

- Keyboard navigation plan
- ARIA labels structure
- Focus management for tab switching

### 7. Translation Keys

List all new translation keys needed with ru/en values.

### 8. Technical Constraints

Consider:
- Must use existing shadcn/ui components
- Must follow GRAPH_TRANSLATIONS pattern
- Must support ru/en locales
- Must work in light/dark mode
- Must integrate with existing hooks (useGenerationRealtime, etc.)

---

## Reference Information

### Existing Tab Structure (Stage 4/5)

```typescript
// Standard tabs for stages
<Tabs defaultValue="input">
  <TabsList>
    <TabsTrigger value="input">Вход / Input</TabsTrigger>
    <TabsTrigger value="process">Процесс / Process</TabsTrigger>
    <TabsTrigger value="output">Результат / Output</TabsTrigger>
    <TabsTrigger value="activity">Журнал / Activity</TabsTrigger>
  </TabsList>
  ...
</Tabs>
```

### Lesson Inspector Current Props

```typescript
interface LessonInspectorProps {
  data: LessonInspectorData | null;
  isLoading?: boolean;
  error?: Error | null;
  onBack: () => void;
  onClose: () => void;
  onApprove?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onRetryNode?: (node: string) => void;
  isApproving?: boolean;
  isRegenerating?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}
```

### Pipeline Nodes (with SelfReviewer)

```typescript
type Stage6NodeName =
  | 'planner'      // Plans lesson structure
  | 'expander'     // Expands outline with details
  | 'assembler'    // Assembles final content
  | 'smoother'     // Polishes language
  | 'selfReviewer' // NEW: Self-checks before judges
  | 'judge';       // Quality evaluation
```

### SelfReview Result Type

```typescript
interface SelfReviewResult {
  passed: boolean;
  decision: 'PASS' | 'FIXED' | 'FLAG_TO_JUDGE' | 'REGENERATE';
  issues: Array<{
    type: 'language_mix' | 'truncation' | 'logic_error' | 'lo_mismatch' | 'hallucination';
    severity: 'critical' | 'major' | 'minor';
    location: string;
    description: string;
    fixable: boolean;
    suggestedFix?: string;
  }>;
  selfFixApplied: boolean;
  fixedContent?: string;
  tokensUsed: number;
  durationMs: number;
}
```

---

## Success Criteria

Your redesign should:

1. **Improve usability** - Reduce clicks/scrolls to access common features
2. **Maintain consistency** - Follow Stage 4/5 patterns where applicable
3. **Be scalable** - Accommodate SelfReviewer and potential future features
4. **Be accessible** - Meet WCAG 2.1 AA standards
5. **Be localized** - Support Russian and English equally well
6. **Be performant** - Consider lazy loading for heavy components

---

## Output Format

Structure your response as:

1. **Executive Summary** (2-3 paragraphs)
2. **Module Dashboard Redesign** (detailed section)
3. **Lesson Inspector Redesign** (detailed section)
4. **Component Specifications** (TypeScript interfaces)
5. **Translation Keys** (YAML or JSON format)
6. **Implementation Roadmap** (phased approach)

Use ASCII diagrams for layouts where helpful.

---

## Additional Notes

- The platform is built with Next.js 15, React, TypeScript, Tailwind CSS
- UI components use shadcn/ui library
- State management uses React hooks and Zustand for global state
- Real-time updates use Supabase Realtime subscriptions
- Dark mode is fully supported via Tailwind's dark: prefix
