# Clarifying Questions Panel - Implementation Guide

## Overview

The Clarifying Questions feature provides an interactive UI for collecting user input during course generation. It appears as a branch node in the Generation Graph after Stage 4 (Analysis & Structure).

## Architecture

### Components

#### 1. **ClarifyingNode** (`nodes/ClarifyingNode.tsx`)

- Visual node in the Generation Graph
- Shows progress (answered/total questions)
- Pulse animation when active
- Green checkmark when all answered
- Double-click opens ClarifyingPanel

**Props:**

```typescript
interface ClarifyingNodeData {
  status: 'pending' | 'active' | 'completed'
  questionsCount: number
  answeredCount: number
  criticalAnswered: number
  criticalTotal: number
}
```

**Visual States:**

- **Pending**: Gray border, inactive icon
- **Active**: Purple ring, pulse animation
- **Completed**: Green border, checkmark icon

#### 2. **ClarifyingPanel** (`panels/clarifying/ClarifyingPanel.tsx`)

- Main panel component shown when node is selected
- Displays questions with priority badges
- Progress tracking with breakdown by priority
- Auto-scroll to next unanswered question
- Confetti celebration on 100% completion

**Features:**

- Progress bar with percentage
- Critical questions counter (required for "Continue" button)
- "Accept all recommendations" quick action
- Sticky "Continue" button (disabled until all critical questions answered)

#### 3. **QuestionCard** (`panels/clarifying/QuestionCard.tsx`)

- Individual question with answer selection UI
- Three answer modes:
  1. **Suggested**: Click to select from AI recommendations
  2. **Modified**: Click suggestion, edit before saving
  3. **Custom**: Write answer from scratch

**Priority Levels:**

- **Critical** (red): Required to proceed
- **Important** (amber): Strongly recommended
- **Nice to Have** (gray/dashed): Optional, can skip

### Integration Points

#### Graph Integration

**1. Register Node Type** (already done in `GraphView.tsx`):

```typescript
import ClarifyingNode from './nodes/ClarifyingNode'

const nodeTypes: NodeTypes = {
  // ... existing types
  clarifying: ClarifyingNode,
}
```

**2. Add Node to Graph** (in `useGraphData.ts` or graph construction logic):

```typescript
const clarifyingNode: AppNode = {
  id: 'clarifying',
  type: 'clarifying',
  position: { x: 400, y: 500 }, // Below Stage 4
  data: {
    status: determineStatus(courseStatus, questionsData),
    questionsCount: totalQuestions,
    answeredCount: answeredQuestions,
    criticalAnswered: criticalAnswered,
    criticalTotal: criticalTotal,
  },
}
```

**3. Add Edges**:

```typescript
// Stage 4 → Clarifying
const stage4ToClarifying: AppEdge = {
  id: 'stage_4-clarifying',
  source: 'stage_4',
  target: 'clarifying',
  type: 'animated',
  animated: courseStatus === 'stage_4_clarifying',
}

// Clarifying → Stage 5
const clarifyingToStage5: AppEdge = {
  id: 'clarifying-stage_5',
  source: 'clarifying',
  target: 'stage_5',
  type: 'animated',
  animated: courseStatus === 'stage_5_active',
}
```

#### Panel Integration

**In `NodeDetailsDrawer.tsx`**:

```typescript
import { ClarifyingPanel } from './clarifying'

const renderContent = () => {
  switch (node.type) {
    case 'clarifying':
      return <ClarifyingPanel courseId={courseId} onComplete={deselectNode} />
    // ... other cases
  }
}
```

### Backend Integration

#### FSM Status

Add new status to course FSM:

- `stage_4_clarifying` - Active clarifying questions state
- Transitions:
  - `stage_4_complete` → `stage_4_clarifying` (when questions needed)
  - `stage_4_clarifying` → `stage_5_active` (after approval)

#### tRPC Router

The panel expects these endpoints (currently using mock data):

```typescript
// packages/course-gen-platform/src/server/routers/clarifying.ts

export const clarifyingRouter = router({
  // Fetch questions for a course
  getQuestions: publicProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async ({ input }) => {
      // Return Question[]
    }),

  // Submit answer to a question
  submitAnswer: publicProcedure
    .input(
      z.object({
        courseId: z.string(),
        questionId: z.string(),
        answer: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Save to database
    }),

  // Skip optional question
  skipQuestion: publicProcedure
    .input(
      z.object({
        courseId: z.string(),
        questionId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Mark as skipped
    }),

  // Approve and continue to Stage 5
  approveAndProceed: publicProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ input }) => {
      // Update course.status = 'stage_5_active'
      // Return success
    }),

  // Optional: Get progress
  getProgress: publicProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async ({ input }) => {
      // Return { answered, total, criticalAnswered, criticalTotal }
    }),
})
```

#### Database Schema

Suggested tables:

```sql
-- Questions generated for a course
CREATE TABLE clarifying_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'important', 'nice_to_have')),
  suggested_answers JSONB NOT NULL, -- Array of {text, rationale}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, question_text)
);

-- User answers
CREATE TABLE clarifying_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES clarifying_questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  answer_source TEXT NOT NULL CHECK (answer_source IN ('suggested', 'modified', 'custom')),
  is_skipped BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Replacing Mock Data

**In `ClarifyingPanel.tsx`**, replace these functions:

```typescript
// BEFORE (mock):
function useGetQuestions(courseId: string) {
  const [data, setData] = useState<Question[]>([])
  // ... mock implementation
}

// AFTER (real tRPC):
import { trpc } from '@/lib/trpc/react'

function useGetQuestions(courseId: string) {
  return trpc.clarifying.getQuestions.useQuery({ courseId })
}

// Same pattern for useSubmitAnswer, useSkipQuestion, useApproveAndProceed
```

## Features

### Progress Tracking

- Visual progress bar
- Answered/total counter
- Critical questions counter (separate)
- Color-coded priority badges

### Answer Modes

1. **Suggested**: Click to instantly select
2. **Modified**: Edit suggestion before submitting
3. **Custom**: Write answer from scratch

### UX Enhancements

- ✅ Auto-scroll to next unanswered question
- ✅ Green pulse animation on answer submit
- ✅ Confetti on 100% completion
- ✅ "Accept all recommendations" quick action
- ✅ Sticky "Continue" button (disabled until critical questions answered)
- ✅ Skip button for nice_to_have questions only

### Accessibility

- Keyboard navigation
- Screen reader labels
- Focus management
- Loading states

## Styling Patterns

### Priority Colors

**Critical (Red)**:

- Border: `border-l-red-500`
- Background: `bg-red-50 dark:bg-red-950/20`
- Badge: `bg-red-100 text-red-700`

**Important (Amber)**:

- Border: `border-l-amber-500`
- Background: `bg-amber-50 dark:bg-amber-950/20`
- Badge: `bg-amber-100 text-amber-700`

**Nice to Have (Gray)**:

- Border: `border-l-slate-300 border-dashed`
- Background: `bg-slate-50 dark:bg-slate-900/20`
- Badge: `bg-slate-100 text-slate-600`

### Animations

**Node Pulse** (active state):

```css
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
```

**Answer Submit** (green flash):

```typescript
<motion.div
  initial={{ opacity: 0, height: 0 }}
  animate={{ opacity: 1, height: 'auto' }}
  className="bg-emerald-50"
/>
```

## Testing

### Manual Testing Checklist

- [ ] Node appears in graph after Stage 4
- [ ] Double-click node opens panel
- [ ] Progress bar updates on answer
- [ ] Critical counter shows correct values
- [ ] "Continue" disabled until all critical answered
- [ ] Skip works for nice_to_have only
- [ ] Auto-scroll to next question
- [ ] Confetti on 100% completion
- [ ] Dark mode colors correct
- [ ] Mobile responsive

### Unit Tests

Create tests for:

- `QuestionCard` answer modes
- `ClarifyingPanel` progress calculation
- Priority badge rendering
- Validation (all critical answered before continue)

## Future Enhancements

1. **AI Suggestions**: Generate questions dynamically based on analysis
2. **Conditional Questions**: Show follow-up questions based on previous answers
3. **History**: View/edit previous answers
4. **Templates**: Pre-filled questions for common course types
5. **Analytics**: Track which questions users skip most often

## Dependencies

- `framer-motion` - Animations
- `canvas-confetti` - Celebration effect
- `lucide-react` - Icons
- `@radix-ui` - UI primitives (via shadcn/ui)

## Files Created

```
packages/web/components/generation-graph/
├── nodes/
│   └── ClarifyingNode.tsx          # Graph node component
└── panels/
    └── clarifying/
        ├── ClarifyingPanel.tsx     # Main panel
        ├── QuestionCard.tsx        # Individual question
        ├── index.ts                # Exports
        └── README.md               # This file
```

## Support

For questions or issues, refer to:

- Project documentation in `docs/`
- Beads issues tagged with `clarifying-questions`
- Frontend patterns in other panels (AdminPanel, NodeDetailsDrawer)
