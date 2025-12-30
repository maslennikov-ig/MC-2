# Enrichment Player Components

Interactive player components for displaying enrichment content in the Course Viewer.

## Directory Structure

```
enrichments/
├── QuizPlayer.tsx          # Interactive quiz player component
├── QuizPlayer.example.tsx  # Usage examples and integration patterns
├── index.ts                # Barrel export for all enrichment players
└── README.md               # This file
```

## Available Components

### QuizPlayer

Interactive quiz player with support for multiple question types, score calculation, and answer explanations.

**Features:**
- Multiple choice questions with shuffleable options
- True/false questions
- Short answer questions (text input)
- Question navigation (one at a time)
- Progress tracking with visual indicator
- Difficulty and Bloom's taxonomy level badges
- Score calculation based on points
- Passing score requirement validation
- Detailed results summary with question review
- Answer explanations after submission
- Retry functionality
- Responsive design with Framer Motion animations
- Dark mode support
- Russian UI text

**Props:**
```typescript
interface QuizPlayerProps {
  /** Quiz enrichment content */
  content: QuizEnrichmentContent;
  /** Callback when quiz is completed */
  onComplete?: (score: number, totalPoints: number, passed: boolean) => void;
}
```

**Usage:**
```tsx
import { QuizPlayer } from "@/components/course/viewer/enrichments";

function MyComponent() {
  const quizContent: QuizEnrichmentContent = {
    type: "quiz",
    quiz_title: "JavaScript Basics",
    instructions: "Answer the questions to test your knowledge",
    questions: [
      {
        id: "q1",
        type: "multiple_choice",
        bloom_level: "remember",
        difficulty: "easy",
        question: "What is JavaScript?",
        options: [
          { id: "a", text: "A programming language" },
          { id: "b", text: "A coffee brand" },
        ],
        correct_answer: "a",
        explanation: "JavaScript is a programming language used for web development.",
        points: 1,
      },
    ],
    passing_score: 70,
    shuffle_questions: false,
    shuffle_options: false,
    metadata: {
      total_points: 1,
      estimated_minutes: 5,
      bloom_coverage: { remember: 1, understand: 0, apply: 0, analyze: 0 },
    },
  };

  const handleComplete = (score: number, totalPoints: number, passed: boolean) => {
    console.log("Quiz completed!", { score, totalPoints, passed });
    // Save results to backend
  };

  return <QuizPlayer content={quizContent} onComplete={handleComplete} />;
}
```

See `QuizPlayer.example.tsx` for more comprehensive examples.

## Data Structure

### QuizEnrichmentContent

The quiz content follows the structure defined in `@megacampus/shared-types`:

```typescript
interface QuizEnrichmentContent {
  type: 'quiz';
  quiz_title: string;
  instructions: string;
  questions: QuizQuestion[];
  passing_score: number;        // 0-100 percentage
  time_limit_minutes?: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  metadata: QuizMetadata;
}

interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  bloom_level: 'remember' | 'understand' | 'apply' | 'analyze';
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options?: QuizOption[];       // Required for multiple_choice
  correct_answer: string | boolean;
  explanation: string;
  points: number;
}

interface QuizMetadata {
  total_points: number;
  estimated_minutes: number;
  bloom_coverage: Record<string, number>;
}
```

## Question Types

### Multiple Choice
- Requires `options` array with `id` and `text`
- `correct_answer` is the option `id`
- Options can be shuffled if `shuffle_options: true`

### True/False
- No options needed
- `correct_answer` is a boolean
- Displays "Верно" and "Неверно" buttons

### Short Answer
- No options needed
- `correct_answer` is a string
- Case-insensitive comparison
- Displays text input field

## Styling

The component uses:
- **shadcn/ui components**: Card, Button, Badge, RadioGroup, Input, Progress, Label
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **lucide-react** for icons

All colors and spacing follow the project's design system.

## Accessibility

- Semantic HTML with proper ARIA labels
- Keyboard navigation support
- Focus management
- Screen reader friendly
- Color contrast compliant (WCAG AA)

## Future Enhancements

Planned improvements:
- Timer countdown display for time-limited quizzes
- Bookmark/flag questions for review
- Detailed analytics (time per question, difficulty analysis)
- Export results to PDF
- Question hints/tips
- Multi-attempt tracking
- Partial credit for short answers
- Drag-and-drop question reordering
- Image support in questions and answers

## Integration with Course Viewer

The QuizPlayer is designed to be integrated into the Course Viewer's enrichment system:

1. **Data Source**: Quiz content comes from `lesson_enrichments` table
2. **Type Safety**: Uses shared types from `@megacampus/shared-types`
3. **Progress Tracking**: Completion callback for saving results
4. **Responsive**: Works on mobile, tablet, and desktop
5. **Dark Mode**: Follows system theme

Example integration:
```tsx
// In LessonView or ActivitiesPanel
import { QuizPlayer } from "@/components/course/viewer/enrichments";

// Check if enrichment is a quiz
if (enrichment.enrichment_type === 'quiz' && enrichment.content.type === 'quiz') {
  return (
    <QuizPlayer
      content={enrichment.content}
      onComplete={(score, totalPoints, passed) => {
        // Save to backend or localStorage
        saveQuizProgress({
          enrichmentId: enrichment.id,
          lessonId: enrichment.lesson_id,
          score,
          totalPoints,
          passed,
        });
      }}
    />
  );
}
```

## Testing

Manual testing checklist:
- [ ] Questions render correctly
- [ ] Answer selection works for all question types
- [ ] Navigation between questions works
- [ ] Submit button only enabled when all answered
- [ ] Score calculation is accurate
- [ ] Passing/failing logic works correctly
- [ ] Explanations display after submission
- [ ] Retry resets state properly
- [ ] Responsive on mobile/tablet/desktop
- [ ] Dark mode works correctly
- [ ] Animations are smooth
- [ ] No TypeScript errors

## License

Part of the MegaCampus AI project.
