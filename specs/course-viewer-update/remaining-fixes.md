# Course Viewer Update - Remaining Code Review Fixes

**Created:** 2025-12-30
**Status:** In Progress
**Based on:** [code-review-report.md](./code-review-report.md)

---

## Summary

Remaining issues from code review to be fixed:

| # | Priority | Issue | Executor |
|---|----------|-------|----------|
| 7 | HIGH | Enrichments load error handling | fullstack-nextjs-specialist |
| 8 | MEDIUM | AudioPlayer playbackUrl cleanup | MAIN (trivial) |
| 9 | MEDIUM | Quiz progress persistence | fullstack-nextjs-specialist |
| 10 | MEDIUM | Accessibility labels | fullstack-nextjs-specialist |
| 13 | LOW | i18n extraction | fullstack-nextjs-specialist |
| 14 | LOW | Unused imports cleanup | MAIN (trivial) |
| 15 | LOW | Quiz loading states | Combined with #9 |

---

## Task 7: Enrichments Load Error Handling (HIGH)

**Executor:** fullstack-nextjs-specialist
**Files:**
- `packages/web/app/[locale]/courses/[slug]/page.tsx`
- `packages/web/components/course/viewer/types/index.ts`
- `packages/web/components/course/course-viewer-enhanced.tsx`
- `packages/web/components/course/viewer/components/LessonView.tsx`
- `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

**Requirements:**
1. Track enrichments load error in page.tsx
2. Add `enrichmentsLoadError?: string` to CourseViewerProps
3. Thread error through CourseViewerEnhanced -> LessonView -> EnrichmentsPanel
4. Show error banner in EnrichmentsPanel when error exists

**Implementation:**

```typescript
// page.tsx - track error
let enrichmentsError: string | undefined;
if (enrichmentsResult.error) {
  enrichmentsError = enrichmentsResult.error.message;
}

// Pass to component
<CourseViewerEnhanced
  ...
  enrichmentsLoadError={enrichmentsError}
/>

// EnrichmentsPanel - show banner
{enrichmentsLoadError && (
  <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 rounded-lg">
    <p className="text-sm text-orange-800 dark:text-orange-200">
      {t('viewer.enrichmentsLoadError')}
    </p>
  </div>
)}
```

---

## Task 8: AudioPlayer playbackUrl Cleanup (MEDIUM)

**Executor:** MAIN (trivial)
**Files:**
- `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`

**Requirements:**
- Already partially fixed with playbackUrl effect (lines 81-92)
- Just need to ensure state reset is complete

**Current State:** Already acceptable, minor improvements only.

---

## Task 9 + 15: Quiz Persistence + Loading States (MEDIUM)

**Executor:** fullstack-nextjs-specialist
**Files:**
- `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`

**Requirements:**

### Quiz Persistence (#9):
1. Add `enrichmentId` prop to QuizPlayer
2. Create localStorage key: `quiz_progress_{enrichmentId}`
3. Load saved state on mount
4. Save state on every change
5. Clear on quiz completion

### Loading States (#15):
1. Add `isCalculating` state
2. Show loading overlay during score calculation
3. Add brief delay for UX (300ms)

**Implementation:**

```typescript
interface QuizPlayerProps {
  content: QuizEnrichmentContent;
  enrichmentId: string; // NEW - for localStorage key
  onComplete?: (score: number, totalPoints: number, passed: boolean) => void;
}

// Storage key helper
const QUIZ_STORAGE_KEY = (id: string) => `quiz_progress_${id}`;

// Load from localStorage on mount
const [state, setState] = useState<QuizState>(() => {
  if (typeof window === 'undefined') return defaultState;

  try {
    const saved = localStorage.getItem(QUIZ_STORAGE_KEY(enrichmentId));
    if (saved) {
      const parsed = JSON.parse(saved);
      // Don't restore submitted state
      if (!parsed.isSubmitted) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load quiz progress:', e);
  }
  return defaultState;
});

// Save on state change
useEffect(() => {
  if (typeof window === 'undefined') return;
  if (state.isSubmitted) {
    localStorage.removeItem(QUIZ_STORAGE_KEY(enrichmentId));
    return;
  }

  try {
    localStorage.setItem(QUIZ_STORAGE_KEY(enrichmentId), JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save quiz progress:', e);
  }
}, [state, enrichmentId]);

// Loading state
const [isCalculating, setIsCalculating] = useState(false);

const handleSubmit = async () => {
  setIsCalculating(true);

  // Brief delay for UX
  await new Promise(resolve => setTimeout(resolve, 300));

  // ... calculation logic ...

  setIsCalculating(false);
};
```

**Update EnrichmentsPanel** to pass enrichmentId:
```typescript
<QuizPlayer
  content={enrichment.content}
  enrichmentId={enrichment.id}
  onComplete={(score, total, passed) => {
    console.log('Quiz completed:', { score, total, passed });
  }}
/>
```

---

## Task 10: Accessibility Labels (MEDIUM)

**Executor:** fullstack-nextjs-specialist
**Files:**
- `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`
- `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`

**Requirements:**

### AudioPlayer:
```typescript
<motion.button
  onClick={togglePlay}
  aria-label={isPlaying ? "Pause audio" : "Play audio"}
  aria-pressed={isPlaying}
>

<Slider
  aria-label="Audio progress"
  aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
/>

<Slider
  aria-label="Volume"
  aria-valuetext={`${Math.round(volume * 100)}%`}
/>

<Button aria-label="Skip back 10 seconds">
<Button aria-label="Skip forward 10 seconds">
<Button aria-label={isMuted ? "Unmute" : "Mute"}>
<Button aria-label={`Playback speed: ${playbackRate}x`}>
```

### QuizPlayer:
```typescript
<Progress
  aria-label="Quiz progress"
  aria-valuetext={`Question ${state.currentQuestionIndex + 1} of ${totalQuestions}`}
/>

<RadioGroup
  aria-label={`Question: ${currentQuestion.question}`}
>

<Button aria-label="Previous question">
<Button aria-label="Next question">
<Button aria-label="Submit quiz">
```

---

## Task 13: i18n Extraction (LOW)

**Executor:** fullstack-nextjs-specialist
**Files:**
- `packages/web/messages/ru/enrichments.json`
- `packages/web/messages/en/enrichments.json`
- `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`
- `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`
- `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`

**Requirements:**
1. Add new keys to enrichments.json (both ru and en)
2. Use `useTranslations('enrichments')` in components
3. Replace hardcoded strings

**New Keys:**

```json
// enrichments.json - add "viewer" section
{
  "viewer": {
    "noMaterials": "No additional materials",
    "noMaterialsDescription": "No media content for this lesson yet",
    "enrichmentsLoadError": "Failed to load additional materials. Try refreshing the page.",
    "videoLesson": "Video lesson",
    "audioLesson": "Audio version of lesson",
    "presentation": "Lesson presentation",
    "additionalMaterials": "Additional materials",
    "checkKnowledge": "Test your knowledge",
    "play": "Play",
    "close": "Close",
    "startQuiz": "Start quiz",
    "open": "Open",
    "download": "Download",
    "loadingAudio": "Loading audio...",
    "transcript": "Transcript",
    "quizPassed": "Quiz passed!",
    "quizFailed": "Quiz not passed",
    "yourResult": "Your result",
    "points": "points",
    "passingScore": "Passing score",
    "questionsReview": "Questions review",
    "yourAnswer": "Your answer",
    "correctAnswer": "Correct answer",
    "explanation": "Explanation",
    "tryAgain": "Try again",
    "question": "Question",
    "of": "of",
    "allAnswered": "All questions answered",
    "answered": "Answered",
    "back": "Back",
    "next": "Next",
    "finishQuiz": "Finish quiz",
    "progress": "Progress",
    "required": "Required to pass",
    "difficulty": {
      "easy": "Easy",
      "medium": "Medium",
      "hard": "Hard"
    },
    "bloom": {
      "remember": "Remember",
      "understand": "Understand",
      "apply": "Apply",
      "analyze": "Analyze"
    },
    "true": "True",
    "false": "False",
    "enterAnswer": "Enter your answer...",
    "shortAnswerHint": "Enter a brief answer to the question"
  }
}
```

---

## Task 14: Unused Imports Cleanup (LOW)

**Executor:** MAIN (trivial)
**Files:**
- `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

**Requirements:**
- Review imports after other fixes
- Remove any unused imports
- Run ESLint to verify

---

## Execution Plan

### Phase 1: Parallel Tasks
Launch in parallel:
1. **Task 7**: Enrichments error handling (fullstack-nextjs-specialist)
2. **Task 9+15**: Quiz persistence + loading (fullstack-nextjs-specialist)
3. **Task 10**: Accessibility labels (fullstack-nextjs-specialist)

### Phase 2: Sequential Tasks (after Phase 1)
4. **Task 13**: i18n extraction (fullstack-nextjs-specialist) - needs final strings
5. **Task 8**: AudioPlayer cleanup (MAIN - trivial)
6. **Task 14**: Unused imports (MAIN - trivial)

### Phase 3: Verification
7. Run type-check
8. Update code-review-report.md
9. Update tasks.md

---

## Context for Agents

### File Structure
```
packages/web/
├── app/[locale]/courses/[slug]/page.tsx  # Course page
├── components/course/
│   ├── course-viewer-enhanced.tsx        # Main viewer
│   └── viewer/
│       ├── types/index.ts                # Props types
│       ├── components/
│       │   ├── LessonView.tsx            # Lesson view with tabs
│       │   └── EnrichmentsPanel.tsx      # Enrichments panel
│       └── enrichments/
│           ├── AudioPlayer.tsx           # Audio player
│           ├── QuizPlayer.tsx            # Quiz player
│           └── index.ts                  # Exports
└── messages/
    ├── en/enrichments.json               # English i18n
    └── ru/enrichments.json               # Russian i18n
```

### Existing Patterns
- i18n: Use `useTranslations('enrichments')` from 'next-intl'
- Props threading: CourseViewerEnhanced -> LessonView -> EnrichmentsPanel
- Error banners: Orange background, border, text
- localStorage: Check `typeof window !== 'undefined'` for SSR safety

### Type References
- EnrichmentRow: `Database['public']['Tables']['lesson_enrichments']['Row']`
- QuizEnrichmentContent: `@megacampus/shared-types`
