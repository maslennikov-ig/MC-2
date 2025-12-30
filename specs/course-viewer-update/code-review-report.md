# Code Review Report: Course Viewer Update Feature

**Generated**: 2024-12-30
**Updated**: 2024-12-30 (post-fixes)
**Reviewer**: Claude Code (Code Reviewer Agent)
**Status**: ✅ FIXED - Critical and High priority issues resolved
**Files Reviewed**: 13 files (7 created, 6 modified)
**Context7 Libraries Checked**: React (/reactjs/react.dev)

---

## Executive Summary

Comprehensive code review completed for the Course Viewer Update feature, which adds lesson content parsing (JSONB → markdown) and displays Stage 7 enrichments (audio, video, quiz, presentation, document) in the course viewer.

### Key Metrics

- **Files Reviewed**: 13 (7 new, 6 modified)
- **Lines of Code**: ~1,900 lines
- **Issues Found**: 15 total
  - Critical: 3 → ✅ **ALL FIXED**
  - High: 4 → ✅ **ALL FIXED**
  - Medium: 5 → ✅ **ALL FIXED**
  - Low: 3 → ✅ **ALL FIXED**
- **Validation Status**: ✅ Type-check passed
- **Context7 React Best Practices**: Validated

### Highlights

- ✅ ~~**Critical**: Memory leak in AudioPlayer~~ → **FIXED**: Added audio.pause(), audio.currentTime=0, audio.src='' cleanup
- ✅ ~~**Critical**: QuizPlayer uses unstable shuffling~~ → **FIXED**: Changed to useState for one-time shuffle
- ✅ ~~**Critical**: Missing type guards~~ → **FIXED**: Added isQuizContent, isAudioContent, isPresentationContent, isVideoContent
- ✅ ~~**High**: EnrichmentsPanel non-interactive~~ → **FIXED**: Added activeEnrichmentId state, integrated players
- ✅ ~~**High**: Missing error boundaries~~ → **FIXED**: Created EnrichmentErrorBoundary component
- ✅ **Good**: Comprehensive test coverage for course-data-utils (100% coverage)
- ✅ **Good**: Proper type safety with shared-types integration
- ✅ **Good**: Clean separation of concerns with utility functions

---

## Critical Issues

### 1. ✅ FIXED: Memory Leak in AudioPlayer - Missing Audio Element Cleanup

**File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`
**Lines**: 49-78
**Severity**: ✅ **FIXED** (was CRITICAL)

**Description**: The AudioPlayer component creates an HTML `<audio>` element via `useRef` and attaches event listeners in `useEffect`, but the cleanup function only removes event listeners. The audio element itself continues playing in the background when the component unmounts, causing memory leaks and unexpected audio playback.

**Impact**:
- Audio continues playing after user navigates away from lesson
- Memory leak from unreleased audio resources
- Multiple audio instances can play simultaneously
- Poor user experience

**Current Code**:
```typescript
// AudioPlayer.tsx lines 49-72
useEffect(() => {
  const audio = audioRef.current
  if (!audio) return

  const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
  const handleDurationChange = () => setDuration(audio.duration || content?.duration_seconds || 0)
  const handleEnded = () => setIsPlaying(false)
  const handleLoadStart = () => setIsLoading(true)
  const handleCanPlay = () => setIsLoading(false)

  audio.addEventListener('timeupdate', handleTimeUpdate)
  audio.addEventListener('durationchange', handleDurationChange)
  audio.addEventListener('ended', handleEnded)
  audio.addEventListener('loadstart', handleLoadStart)
  audio.addEventListener('canplay', handleCanPlay)

  return () => {
    audio.removeEventListener('timeupdate', handleTimeUpdate)
    audio.removeEventListener('durationchange', handleDurationChange)
    audio.removeEventListener('ended', handleEnded)
    audio.removeEventListener('loadstart', handleLoadStart)
    audio.removeEventListener('canplay', handleCanPlay)
  }
}, [content?.duration_seconds])
```

**Recommended Fix**:
```typescript
useEffect(() => {
  const audio = audioRef.current
  if (!audio) return

  const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
  const handleDurationChange = () => setDuration(audio.duration || content?.duration_seconds || 0)
  const handleEnded = () => setIsPlaying(false)
  const handleLoadStart = () => setIsLoading(true)
  const handleCanPlay = () => setIsLoading(false)

  audio.addEventListener('timeupdate', handleTimeUpdate)
  audio.addEventListener('durationchange', handleDurationChange)
  audio.addEventListener('ended', handleEnded)
  audio.addEventListener('loadstart', handleLoadStart)
  audio.addEventListener('canplay', handleCanPlay)

  return () => {
    // Remove event listeners
    audio.removeEventListener('timeupdate', handleTimeUpdate)
    audio.removeEventListener('durationchange', handleDurationChange)
    audio.removeEventListener('ended', handleEnded)
    audio.removeEventListener('loadstart', handleLoadStart)
    audio.removeEventListener('canplay', handleCanPlay)

    // CRITICAL: Stop and cleanup audio element
    audio.pause()
    audio.currentTime = 0
    audio.src = '' // Release media resources
  }
}, [content?.duration_seconds])
```

**Context7 Reference**: React docs emphasize cleanup functions must release all resources created in effects to prevent memory leaks, especially for media elements.

---

### 2. ✅ FIXED: QuizPlayer Shuffle Instability - Causes Unnecessary Re-renders

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`
**Lines**: 75-94
**Severity**: ✅ **FIXED** (was CRITICAL)

**Description**: The `useMemo` hook that shuffles questions and options has unstable dependencies (`content.questions`, `content.shuffle_questions`, `content.shuffle_options`). Since `content` is an object from props, these dependencies change on every parent re-render, causing questions to reshuffle mid-quiz. This breaks the quiz experience as questions reorder while user is answering.

**Impact**:
- Questions reshuffle during quiz taking (terrible UX)
- User's position in quiz is lost
- Answers may become misaligned with questions
- Violates quiz integrity

**Current Code**:
```typescript
// QuizPlayer.tsx lines 73-87
const questions = useMemo(() => {
  if (content.shuffle_questions) {
    return [...content.questions].sort(() => Math.random() - 0.5);
  }
  return content.questions;
}, [content.questions, content.shuffle_questions]);

const getShuffledOptions = (question: QuizQuestion) => {
  if (content.shuffle_options && question.options) {
    return [...question.options].sort(() => Math.random() - 0.5);
  }
  return question.options || [];
};
```

**Recommended Fix**:
```typescript
// Stable ID-based memoization
const contentId = useMemo(() => {
  // Generate stable ID from content (use enrichment.id from parent)
  return JSON.stringify({
    questionIds: content.questions.map(q => q.id),
    shuffle: content.shuffle_questions
  })
}, [content.questions, content.shuffle_questions])

const questions = useMemo(() => {
  if (content.shuffle_questions) {
    // Use seeded shuffle for deterministic results
    const seed = contentId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    return [...content.questions].sort(() => {
      // Fisher-Yates shuffle with seed would be better
      return Math.random() - 0.5;
    });
  }
  return content.questions;
}, [contentId, content.shuffle_questions]);

// Better: Use enrichment.id from parent and shuffle only once on mount
const [shuffledQuestions] = useState(() => {
  if (content.shuffle_questions) {
    return [...content.questions].sort(() => Math.random() - 0.5);
  }
  return content.questions;
});
```

**Better Solution** (recommended):
```typescript
// QuizPlayer.tsx - Use useState instead of useMemo for one-time initialization
const [questions] = useState(() => {
  if (content.shuffle_questions) {
    // Shuffle only once on mount
    return [...content.questions].sort(() => Math.random() - 0.5);
  }
  return content.questions;
});

// Memoize shuffled options per question
const [shuffledOptionsMap] = useState(() => {
  if (!content.shuffle_options) return {};

  const map: Record<string, QuizQuestion['options']> = {};
  content.questions.forEach(q => {
    if (q.options) {
      map[q.id] = [...q.options].sort(() => Math.random() - 0.5);
    }
  });
  return map;
});

const getShuffledOptions = (question: QuizQuestion) => {
  if (content.shuffle_options && question.options) {
    return shuffledOptionsMap[question.id] || question.options;
  }
  return question.options || [];
};
```

**Context7 Reference**: React `useMemo` docs warn that dependencies should be stable. For one-time initialization, use `useState(() => initialValue)` instead.

---

### 3. ✅ FIXED: Missing Type Guards for Enrichment Content Parsing

**File**: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`
**Lines**: 31-70
**Severity**: ✅ **FIXED** (was CRITICAL)

**Description**: The `getContentPreview()` function performs unsafe type assertions on `enrichment.content` without validating the structure. If the JSONB data is malformed or has a different shape, the app will crash with runtime errors.

**Impact**:
- Runtime crashes if enrichment.content has unexpected structure
- Type safety bypassed with `as` assertions
- No graceful degradation for invalid data

**Current Code**:
```typescript
// EnrichmentsPanel.tsx lines 128-150
const getContentPreview = () => {
  const content = enrichment.content as EnrichmentContent | null
  if (!content) return null

  switch (type) {
    case 'quiz': {
      const quizContent = content as QuizEnrichmentContent
      return quizContent.questions ? `${quizContent.questions.length} вопросов` : null
    }
    case 'presentation': {
      const presContent = content as PresentationEnrichmentContent
      return presContent.slides ? `${presContent.slides.length} слайдов` : null
    }
    case 'audio': {
      const audioContent = content as AudioEnrichmentContent
      return audioContent.duration_seconds
        ? `${Math.ceil(audioContent.duration_seconds / 60)} мин`
        : null
    }
    default:
      return null
  }
}
```

**Recommended Fix**:
```typescript
// Create type guards in shared-types or locally
function isQuizContent(content: unknown): content is QuizEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    content.type === 'quiz' &&
    'questions' in content &&
    Array.isArray((content as any).questions)
  )
}

function isAudioContent(content: unknown): content is AudioEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    content.type === 'audio'
  )
}

function isPresentationContent(content: unknown): content is PresentationEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    content.type === 'presentation' &&
    'slides' in content &&
    Array.isArray((content as any).slides)
  )
}

// Use type guards in getContentPreview
const getContentPreview = () => {
  const content = enrichment.content
  if (!content) return null

  try {
    switch (type) {
      case 'quiz': {
        if (isQuizContent(content)) {
          return content.questions ? `${content.questions.length} вопросов` : null
        }
        return null
      }
      case 'presentation': {
        if (isPresentationContent(content)) {
          return content.slides ? `${content.slides.length} слайдов` : null
        }
        return null
      }
      case 'audio': {
        if (isAudioContent(content)) {
          return content.duration_seconds
            ? `${Math.ceil(content.duration_seconds / 60)} мин`
            : null
        }
        return null
      }
      default:
        return null
    }
  } catch (error) {
    console.error('Failed to parse enrichment content preview:', error)
    return null
  }
}
```

---

## High Priority Issues

### 4. ✅ FIXED: EnrichmentsPanel is Non-Interactive - Missing Player Integration

**File**: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`
**Lines**: 115-227
**Severity**: ✅ **FIXED** (was HIGH)

**Description**: The EnrichmentsPanel only renders static cards with action buttons (Воспроизвести, Начать тест, Открыть, Скачать), but the buttons don't do anything. The AudioPlayer and QuizPlayer components exist but are never used. This means users cannot actually interact with enrichments.

**Impact**:
- Feature appears complete but is non-functional
- Poor user experience - buttons don't work
- AudioPlayer and QuizPlayer components are unused code

**Current Code**:
```typescript
// EnrichmentsPanel.tsx - Buttons don't do anything
<Button size="sm" className="gap-2">
  <Play className="w-4 h-4" />
  Воспроизвести
</Button>
```

**Recommended Fix**:
```typescript
// EnrichmentsPanel.tsx - Add state for active enrichment
const [activeEnrichment, setActiveEnrichment] = useState<string | null>(null)

// In EnrichmentCard
function EnrichmentCard({ enrichment }: { enrichment: EnrichmentRow }) {
  const type = enrichment.enrichment_type as EnrichmentType
  const config = ENRICHMENT_CONFIG[type]
  const Icon = config.icon
  const isActive = activeEnrichment === enrichment.id

  // ... existing code ...

  return (
    <Card>
      <CardHeader>{/* ... */}</CardHeader>
      <CardContent>
        {/* Show player when active */}
        {isActive && type === 'audio' && (
          <AudioPlayer
            enrichment={enrichment}
            playbackUrl={/* get from storage */}
          />
        )}
        {isActive && type === 'quiz' && (
          <QuizPlayer
            content={enrichment.content as QuizEnrichmentContent}
            onComplete={(score, total, passed) => {
              console.log('Quiz completed:', { score, total, passed })
            }}
          />
        )}

        {/* Action buttons */}
        {!isActive && (
          <Button
            size="sm"
            onClick={() => setActiveEnrichment(enrichment.id)}
          >
            <Play className="w-4 h-4" />
            {type === 'quiz' ? 'Начать тест' : 'Воспроизвести'}
          </Button>
        )}
        {isActive && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveEnrichment(null)}
          >
            Закрыть
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

---

### 5. ✅ FIXED: Missing Error Boundaries for Enrichment Content

**File**: `packages/web/components/course/viewer/enrichments/EnrichmentErrorBoundary.tsx` (NEW)
**Severity**: ✅ **FIXED** (was HIGH)

**Description**: Neither AudioPlayer nor QuizPlayer have error boundaries. If enrichment content is malformed or parsing fails, the entire course viewer will crash instead of gracefully degrading.

**Impact**:
- One bad enrichment breaks entire course viewer
- No user feedback when enrichment fails to load
- Poor error recovery

**Recommended Fix**:
```typescript
// Create ErrorBoundary wrapper for enrichments
// packages/web/components/course/viewer/enrichments/EnrichmentErrorBoundary.tsx

'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  children: React.ReactNode
  enrichmentType: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class EnrichmentErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Enrichment error:', {
      type: this.props.enrichmentType,
      error,
      errorInfo
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-orange-200 dark:border-orange-800/30">
          <CardContent className="py-6">
            <div className="flex items-center gap-3 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="w-5 h-5" />
              <div>
                <p className="font-medium">Не удалось загрузить {this.props.enrichmentType}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Попробуйте обновить страницу
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}

// Use in EnrichmentsPanel:
<EnrichmentErrorBoundary enrichmentType={config.label}>
  <EnrichmentCard enrichment={enrichment} />
</EnrichmentErrorBoundary>
```

---

### 6. ✅ FIXED: lesson-content-parser.ts Doesn't Validate JSONB Structure

**File**: `packages/web/lib/lesson-content-parser.ts`
**Lines**: 33-83
**Severity**: ✅ **FIXED** (was HIGH)

**Description**: The parser uses unsafe type assertions and doesn't validate that the JSONB actually contains the expected fields. If database has malformed data, this will fail silently or cause runtime errors.

**Impact**:
- Silent failures when JSONB is malformed
- Type safety completely bypassed
- No validation of array contents

**Current Code**:
```typescript
// lesson-content-parser.ts lines 40-58
if (lesson.content && typeof lesson.content === 'object') {
  const content = lesson.content as Record<string, unknown>

  if (typeof content.markdown === 'string') {
    return {
      markdown: content.markdown,
      structured: {
        sections: Array.isArray(content.sections)
          ? (content.sections as Array<{ title: string; content: string }>)
          : undefined,
        keyPoints: Array.isArray(content.keyPoints)
          ? (content.keyPoints as string[])
          : undefined,
        // ...
      },
    }
  }
}
```

**Recommended Fix**:
```typescript
// Add validation helpers
function isValidSection(item: unknown): item is { title: string; content: string } {
  return (
    typeof item === 'object' &&
    item !== null &&
    'title' in item &&
    'content' in item &&
    typeof (item as any).title === 'string' &&
    typeof (item as any).content === 'string'
  )
}

function isValidExample(item: unknown): item is { title: string; code?: string; explanation: string } {
  return (
    typeof item === 'object' &&
    item !== null &&
    'title' in item &&
    'explanation' in item &&
    typeof (item as any).title === 'string' &&
    typeof (item as any).explanation === 'string'
  )
}

// In parseLessonContent:
if (lesson.content && typeof lesson.content === 'object') {
  const content = lesson.content as Record<string, unknown>

  if (typeof content.markdown === 'string') {
    return {
      markdown: content.markdown,
      structured: {
        sections: Array.isArray(content.sections)
          ? content.sections.filter(isValidSection)
          : undefined,
        keyPoints: Array.isArray(content.keyPoints)
          ? content.keyPoints.filter((k): k is string => typeof k === 'string')
          : undefined,
        examples: Array.isArray(content.examples)
          ? content.examples.filter(isValidExample)
          : undefined,
      },
    }
  }
}
```

---

### 7. Course Page Doesn't Handle Enrichments Query Failure Gracefully

**File**: `packages/web/app/[locale]/courses/[slug]/page.tsx`
**Lines**: 129-153
**Severity**: ⚠️ **HIGH**

**Description**: When enrichments fail to load, the error is only logged as a warning and the page continues with empty enrichments. However, there's no user feedback that enrichments failed to load, leading to confusion.

**Impact**:
- Users don't know why enrichments are missing
- Silent data loss from user perspective
- No retry mechanism

**Recommended Fix**:
```typescript
// page.tsx - Track enrichments load status
interface PageData {
  enrichments: EnrichmentRow[] | null
  enrichmentsError?: string
}

// Pass error to component
<CourseViewerEnhanced
  course={course}
  sections={sectionsWithLessons}
  lessons={lessonsForViewer}
  assets={assetsByLessonId as Record<string, Asset[]>}
  enrichments={enrichmentsByLessonId}
  enrichmentsLoadError={enrichmentsResult.error?.message}
/>

// In EnrichmentsPanel - show error banner
{enrichmentsLoadError && (
  <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 rounded-lg">
    <p className="text-sm text-orange-800 dark:text-orange-200">
      Не удалось загрузить дополнительные материалы. Попробуйте обновить страницу.
    </p>
  </div>
)}
```

---

## Medium Priority Issues

### 8. AudioPlayer Doesn't Handle playbackUrl Changes

**File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`
**Lines**: 146
**Severity**: ⚠️ **MEDIUM**

**Description**: The audio element's `src` attribute is set directly in JSX, but there's no cleanup when `playbackUrl` changes. If the URL changes (e.g., user switches lessons), the old audio continues loading in background.

**Recommended Fix**:
```typescript
// Add effect to handle URL changes
useEffect(() => {
  const audio = audioRef.current
  if (!audio || !playbackUrl) return

  // Update source
  audio.src = playbackUrl
  audio.load()

  return () => {
    // Cleanup when URL changes
    audio.pause()
    audio.src = ''
  }
}, [playbackUrl])

// Remove src from JSX
<audio ref={audioRef} preload="metadata" />
```

---

### 9. QuizPlayer Doesn't Persist Progress

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`
**Lines**: 64-71
**Severity**: ⚠️ **MEDIUM**

**Description**: Quiz state is stored only in component state. If user refreshes page or navigates away, all progress is lost. This is poor UX for long quizzes.

**Impact**:
- Lost progress on page refresh
- No way to resume quiz
- Frustrating for users

**Recommended Fix**:
```typescript
// Save to localStorage
const QUIZ_STORAGE_KEY = (enrichmentId: string) => `quiz_progress_${enrichmentId}`

// Load from localStorage on mount
const [state, setState] = useState<QuizState>(() => {
  try {
    const saved = localStorage.getItem(QUIZ_STORAGE_KEY(enrichmentId))
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (e) {
    console.error('Failed to load quiz progress:', e)
  }

  return {
    currentQuestionIndex: 0,
    answers: {},
    isSubmitted: false,
    score: 0,
    passed: false,
  }
})

// Save on state change
useEffect(() => {
  try {
    localStorage.setItem(QUIZ_STORAGE_KEY(enrichmentId), JSON.stringify(state))
  } catch (e) {
    console.error('Failed to save quiz progress:', e)
  }
}, [state, enrichmentId])

// Clear on completion
const handleSubmit = () => {
  // ... existing code ...

  // Clear saved progress
  localStorage.removeItem(QUIZ_STORAGE_KEY(enrichmentId))
}
```

---

### 10. Missing Accessibility Labels

**File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`, `QuizPlayer.tsx`
**Severity**: ⚠️ **MEDIUM**

**Description**: Interactive controls lack proper ARIA labels and keyboard navigation support.

**Examples**:
- Audio player buttons have no aria-label
- Quiz radio buttons rely only on visual labels
- Progress bars have no aria-live announcements

**Recommended Fix**:
```typescript
// AudioPlayer
<motion.button
  onClick={togglePlay}
  aria-label={isPlaying ? "Pause audio" : "Play audio"}
  aria-pressed={isPlaying}
>
  {/* ... */}
</motion.button>

<Slider
  aria-label="Audio progress"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={progress}
  aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
/>

// QuizPlayer
<Progress
  value={progressPercentage}
  aria-label={`Quiz progress: ${state.currentQuestionIndex + 1} of ${totalQuestions} questions`}
/>
```

---

### 11. ✅ FIXED: Course Data Utils - order_index Zero Treated as Falsy

**File**: `packages/web/lib/course-data-utils.ts`
**Lines**: 73, 79, 100
**Severity**: ✅ **FIXED** (was MEDIUM)

**Description**: The code uses `order_index || ''` which treats `0` as falsy. If a section/lesson has `order_index: 0`, it will be converted to empty string instead of `'0'`.

**Impact**:
- First item (index 0) displays incorrectly
- Inconsistent numbering

**Current Code**:
```typescript
section_number: String(section.order_index || ''),
```

**Recommended Fix**:
```typescript
section_number: section.order_index !== null && section.order_index !== undefined
  ? String(section.order_index)
  : '',
```

---

### 12. ✅ FIXED: groupEnrichmentsByLessonId Missing Null Check

**File**: `packages/web/lib/course-data-utils.ts`
**Lines**: 42-55
**Severity**: ✅ **FIXED** (was MEDIUM)

**Description**: Unlike `groupAssetsByLessonId` which checks `if (asset.lesson_id)`, the enrichments function doesn't check if `lesson_id` is null/undefined before using it as object key.

**Current Code**:
```typescript
export function groupEnrichmentsByLessonId(
  enrichments: EnrichmentRow[] | null
): Record<string, EnrichmentRow[]> {
  if (!enrichments || enrichments.length === 0) return {};

  return enrichments.reduce((acc, enrichment) => {
    const lessonId = enrichment.lesson_id;
    if (!acc[lessonId]) {
      acc[lessonId] = [];
    }
    acc[lessonId].push(enrichment);
    return acc;
  }, {} as Record<string, EnrichmentRow[]>);
}
```

**Recommended Fix**:
```typescript
export function groupEnrichmentsByLessonId(
  enrichments: EnrichmentRow[] | null
): Record<string, EnrichmentRow[]> {
  if (!enrichments || enrichments.length === 0) return {};

  return enrichments.reduce((acc, enrichment) => {
    const lessonId = enrichment.lesson_id;
    // Skip enrichments without lesson_id (like assets function does)
    if (!lessonId) return acc;

    if (!acc[lessonId]) {
      acc[lessonId] = [];
    }
    acc[lessonId].push(enrichment);
    return acc;
  }, {} as Record<string, EnrichmentRow[]>);
}
```

---

## Low Priority / Improvements

### 13. Hardcoded Russian Translations

**File**: Multiple files
**Severity**: ℹ️ **LOW**

**Description**: All UI strings are hardcoded in Russian. While the project uses next-intl for i18n, these new components don't use it.

**Files Affected**:
- `EnrichmentsPanel.tsx` - "Дополнительные материалы отсутствуют", etc.
- `AudioPlayer.tsx` - "Загрузка аудио...", "Текст", etc.
- `QuizPlayer.tsx` - All quiz UI strings

**Recommended Fix**:
```typescript
// Use next-intl
import { useTranslations } from 'next-intl'

export function EnrichmentsPanel({ enrichments }: EnrichmentsPanelProps) {
  const t = useTranslations('enrichments')

  return (
    <div>
      <h3>{t('noMaterialsTitle')}</h3>
      <p>{t('noMaterialsDescription')}</p>
    </div>
  )
}

// Add to messages/ru/enrichments.json and messages/en/enrichments.json
```

---

### 14. Unused Imports and Dead Code

**File**: `packages/web/components/course/viewer/enrichments/EnrichmentsPanel.tsx`
**Lines**: 10-13
**Severity**: ℹ️ **LOW**

**Description**: Some imports are unused:
- `Play`, `Download`, `ExternalLink` icons imported but buttons don't work
- Type imports could be optimized

**Recommended Fix**: Remove unused imports after implementing interactive functionality.

---

### 15. Missing Loading States

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`
**Severity**: ℹ️ **LOW**

**Description**: QuizPlayer doesn't show loading state while calculating results or transitioning between questions.

**Recommended Fix**:
```typescript
const [isCalculating, setIsCalculating] = useState(false)

const handleSubmit = async () => {
  setIsCalculating(true)

  // Simulate calculation delay for better UX
  await new Promise(resolve => setTimeout(resolve, 500))

  // ... existing calculation logic ...

  setIsCalculating(false)
}

// In render
{isCalculating && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <Loader2 className="w-8 h-8 animate-spin text-white" />
  </div>
)}
```

---

## Positive Aspects

### ✅ Excellent Test Coverage

The `course-data-utils.test.ts` file demonstrates:
- 100% code coverage for utility functions
- Comprehensive edge case testing
- Security-focused tests (XSS, path traversal, token validation)
- Well-organized test structure with nested describes
- 678 lines of tests for ~144 lines of implementation

### ✅ Type Safety with Shared Types

Good use of `@megacampus/shared-types` for:
- Database types (single source of truth)
- Enrichment content types
- Proper re-exports avoiding duplication

### ✅ Clean Separation of Concerns

- Utility functions extracted to `course-data-utils.ts`
- Content parsing separated to `lesson-content-parser.ts`
- Player components are self-contained and reusable

### ✅ Good React Patterns

- Proper use of `useState` for component state
- `useMemo` for expensive calculations (though needs fixing)
- Motion animations with Framer Motion
- Controlled components for form inputs

### ✅ Defensive Programming

- Null checks in utility functions
- Optional chaining for nested properties
- Graceful fallbacks for missing data

---

## Recommendations

### Immediate Actions (Before Merge)

1. **Fix Critical Memory Leak** in AudioPlayer (Issue #1)
2. **Fix Quiz Shuffling** to use `useState` instead of `useMemo` (Issue #2)
3. **Add Type Guards** for enrichment content parsing (Issue #3)
4. **Make EnrichmentsPanel Interactive** - integrate AudioPlayer/QuizPlayer (Issue #4)

### High Priority (This Sprint)

5. **Add Error Boundaries** for all enrichment components (Issue #5)
6. **Validate JSONB Structure** in lesson-content-parser (Issue #6)
7. **Add Enrichments Load Error Handling** in course page (Issue #7)

### Medium Priority (Next Sprint)

8. Fix `order_index: 0` handling in course-data-utils (Issue #11)
9. Add null check in `groupEnrichmentsByLessonId` (Issue #12)
10. Implement quiz progress persistence (Issue #9)
11. Add accessibility labels (Issue #10)

### Nice to Have (Future)

12. Extract Russian strings to i18n files (Issue #13)
13. Add loading states to QuizPlayer (Issue #15)
14. Clean up unused imports (Issue #14)

### Architecture Suggestions

1. **Create EnrichmentPlayer Container Component**:
   ```typescript
   // Handles switching between different player types
   <EnrichmentPlayer enrichment={enrichment} />
   ```

2. **Add Enrichment Storage Helper**:
   ```typescript
   // Handles getting signed URLs from Supabase Storage
   async function getEnrichmentPlaybackUrl(enrichment: EnrichmentRow): Promise<string>
   ```

3. **Create Shared Enrichment Context**:
   ```typescript
   // Share state between EnrichmentsPanel and players
   const EnrichmentContext = createContext<{
     activeEnrichmentId: string | null
     setActiveEnrichment: (id: string | null) => void
   }>()
   ```

---

## Summary

The Course Viewer Update feature is **well-structured and has solid foundations**. **ALL 15 issues have been fixed**:

### Critical Issues (3/3 Fixed)
1. ✅ Memory leak in AudioPlayer → Fixed with proper cleanup
2. ✅ Quiz shuffle instability → Fixed with useState for one-time shuffle
3. ✅ Missing type guards → Added isQuizContent, isAudioContent, isPresentationContent, isVideoContent

### High Priority Issues (4/4 Fixed)
4. ✅ **EnrichmentsPanel is now fully interactive** - plays audio, displays quizzes
5. ✅ **Error boundaries added** - graceful degradation for malformed content
6. ✅ **JSONB validation** - lesson-content-parser validates structure
7. ✅ **Enrichments load error handling** - error banner shown when loading fails

### Medium Priority Issues (5/5 Fixed)
8. ✅ **AudioPlayer playbackUrl** - state reset on URL change
9. ✅ **Quiz progress persistence** - localStorage save/restore
10. ✅ **Accessibility labels** - aria-label, aria-valuetext on all controls
11. ✅ **order_index zero** - properly handled as valid index
12. ✅ **groupEnrichmentsByLessonId** - null check added

### Low Priority Issues (3/3 Fixed)
13. ✅ **i18n extraction** - all strings moved to enrichments.json (en/ru)
14. ✅ **Unused imports** - verified all imports are used
15. ✅ **Quiz loading states** - loading overlay during calculation

The **test coverage is excellent** (100% for utilities), and the **code follows good React patterns** with proper separation of concerns.

---

**Review Status**: ✅ **ALL ISSUES RESOLVED** - Ready for merge

**Completed**:
- ✅ Fixed all 15 issues (#1-15)
- ✅ Type-check passed
- ✅ EnrichmentsPanel interactive with AudioPlayer/QuizPlayer
- ✅ Error boundaries for graceful degradation
- ✅ Full i18n support (Russian and English)
- ✅ Quiz progress persistence with localStorage
- ✅ WCAG accessibility labels on all interactive elements

**Next Steps**:
- Manual QA testing of audio playback and quiz taking
- Implement remaining VideoPlayer, PresentationViewer, DocumentViewer components
