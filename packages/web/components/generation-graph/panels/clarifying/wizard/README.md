# Wizard Components for Stage 4 Clarifying Questions

This directory contains reusable UI components for implementing a Wizard-style interface for clarifying questions.

## Components

### WizardProgress

Displays progress information for the wizard:

- Current question number and total
- Overall progress bar
- Priority-based counters (critical, important, nice_to_have) with colored dots

**Props:**

```typescript
interface WizardProgressProps {
  currentIndex: number
  totalQuestions: number
  answeredCount: number
  priorityCounts: {
    critical: { total: number; answered: number }
    important: { total: number; answered: number }
    nice_to_have: { total: number; answered: number }
  }
}
```

**Design:**

- Minimalist slate color scheme
- Priority dots: 🔴 red (critical), 🟡 amber (important), ⚪ slate (nice_to_have)
- shadcn Progress component with 2px height
- Tabular numbers for consistent counter alignment

---

### WizardSidebar

Left sidebar showing all questions with navigation:

- Hidden on mobile (visible from md breakpoint)
- 200px fixed width
- Question list with status indicators
- Click to jump to any question

**Props:**

```typescript
interface WizardSidebarProps {
  questions: Array<{
    id: string
    text: string
    priority: QuestionPriority
    isAnswered: boolean
  }>
  currentIndex: number
  onSelect: (index: number) => void
}
```

**Design:**

- Each question shows: status icon (✓ or priority dot) + number + truncated text
- Current question highlighted with purple background
- Hover states for better UX
- Auto-truncates long question text to 20 characters

---

### WizardNavigation

Bottom navigation controls:

- Previous/Next buttons with chevron icons
- Mobile-only dots indicator (hidden on desktop)
- "Continue Generation" button when ready (all critical questions answered)
- Loading state for processing

**Props:**

```typescript
interface WizardNavigationProps {
  currentIndex: number
  totalQuestions: number
  questionsStatus: Array<{
    isAnswered: boolean
    priority?: 'critical' | 'important' | 'nice_to_have'
  }>
  onPrev: () => void
  onNext: () => void
  canContinue: boolean // all critical questions answered
  onContinue: () => void
  isProcessing: boolean
}
```

**Design:**

- Touch-friendly buttons (min-height 44px)
- Responsive: full navigation on mobile, simplified on desktop
- Dots indicator on mobile shows: purple (current), emerald (answered), slate (unanswered)
- Continue button prominently displayed when ready

---

## Usage Example

```tsx
import { WizardProgress, WizardSidebar, WizardNavigation } from './wizard'

export function ClarifyingWizard({ questions }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)

  // Calculate priority counts
  const priorityCounts = useMemo(() => {
    // ... logic to count questions by priority
  }, [questions])

  const canContinue = questions.filter((q) => q.priority === 'critical').every((q) => q.isAnswered)

  return (
    <div className="flex gap-4">
      <WizardSidebar questions={questions} currentIndex={currentIndex} onSelect={setCurrentIndex} />

      <div className="flex-1">
        <WizardProgress
          currentIndex={currentIndex}
          totalQuestions={questions.length}
          answeredCount={questions.filter((q) => q.isAnswered).length}
          priorityCounts={priorityCounts}
        />

        {/* Question content here */}

        <WizardNavigation
          currentIndex={currentIndex}
          totalQuestions={questions.length}
          questionsStatus={questions}
          onPrev={() => setCurrentIndex((i) => i - 1)}
          onNext={() => setCurrentIndex((i) => i + 1)}
          canContinue={canContinue}
          onContinue={handleContinue}
          isProcessing={isProcessing}
        />
      </div>
    </div>
  )
}
```

## Design Principles

### Colors

- **Slate**: Primary text and backgrounds (600/400 dark mode)
- **Purple**: Accents and current state (500/100 light, 400/900 dark)
- **Emerald**: Completed/success states (500/400)
- **Red**: Critical priority (500/400)
- **Amber**: Important priority (400/300)

### Accessibility

- Minimum 44px touch targets on mobile
- Semantic button elements
- Clear focus states
- Color + icon indicators (not color-only)

### Responsive Behavior

- **Mobile**: Sidebar hidden, dots indicator visible
- **Desktop**: Sidebar visible, richer navigation

### No Framer Motion

These components don't include Framer Motion animations by design. Animations should be added at the parent level where question transitions happen.

## Reference Implementation

See `/packages/web/components/mocks/clarifying/MockVariant3Wizard.tsx` for the original integrated implementation that inspired these components.
