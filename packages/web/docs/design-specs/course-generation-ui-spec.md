# Technical Specification: Course Generation Progress UI

## Executive Summary
- **Purpose**: A comprehensive redesign of the course generation progress interface to provide users with a visually engaging, informative, and responsive experience while waiting for their courses to be generated.
- **User Story**: As a user, I want to see detailed progress information about my course generation so that I understand what's happening and feel confident the system is working properly.
- **Priority**: High
- **Estimated Complexity**: 3-4 days implementation
- **URL Pattern**: `/courses/generating/[slug]` (NOT [id] - we use slugs for all course URLs)

## Requirements

### Functional Requirements
1. **Real-time Progress Tracking**
   - Display current step with visual indicators
   - Show percentage completion
   - Update progress in real-time via WebSocket/polling
   - Acceptance: Progress updates within 3 seconds of backend changes

2. **Multi-View Interface**
   - Overview tab showing high-level progress
   - Detailed steps tab showing granular progress
   - Activity log tab for technical details
   - Acceptance: All tabs functional with smooth transitions

3. **Time Estimation**
   - Display estimated time remaining
   - Show elapsed time per step
   - Update estimates based on actual progress
   - Acceptance: Time estimates within 20% accuracy

4. **Error Handling**
   - Clear error state display
   - Retry functionality for failed steps
   - Detailed error messages with suggestions
   - Acceptance: All errors caught and displayed gracefully

5. **Success Celebration**
   - Animated success state
   - Auto-redirect to completed course
   - Confetti or similar celebration animation
   - Acceptance: Smooth transition to course page after 2-3 seconds

### Non-Functional Requirements
- **Performance**: Initial load < 500ms, updates < 100ms render time
- **Accessibility**: WCAG 2.1 AA compliance, full keyboard navigation
- **Browser Support**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Responsive Design**: Mobile-first, breakpoints at 640px, 768px, 1024px, 1280px

## Component Architecture

### Component Hierarchy
```
CourseGenerationPage/
├── GenerationProgressContainer/
│   ├── ProgressHeader/
│   │   ├── CourseTitle
│   │   ├── StatusBadge (using shadcn Badge)
│   │   └── ConnectionIndicator
│   ├── TabsContainer (using shadcn Tabs)/
│   │   ├── OverviewTab/
│   │   │   ├── MainProgressCard (using shadcn Card)
│   │   │   ├── StatsGrid
│   │   │   └── QuickActions
│   │   ├── StepsTab/
│   │   │   ├── StepTimeline
│   │   │   └── StepDetails
│   │   └── ActivityTab/
│   │       └── ActivityLog
│   ├── ProgressFooter/
│   │   ├── EstimatedTime
│   │   └── ActionButtons (using shadcn Button)
│   └── StateOverlays/
│       ├── ErrorOverlay (using shadcn Alert)
│       └── SuccessOverlay
└── SupportingContent/
    ├── WhileYouWaitCard (using shadcn Card)
    └── HelpfulTipsCard
```

### Selected shadcn/ui Components
| Component | Purpose | Customizations | Rationale |
|-----------|---------|----------------|-----------|
| Card | Container for sections | Custom gradient borders, glass morphism effect | Provides consistent structure with elevation |
| Progress | Main progress indicator | Custom height (12px), animated gradient fill | Clear visual progress representation |
| Tabs | View switching | Custom animations, icon prefixes | Organizes complex information cleanly |
| Badge | Status indicators | Custom colors per status, pulse animation | Quick status recognition |
| Alert | Error/info messages | Custom icons, expandable details | Clear communication of issues |
| Skeleton | Loading states | Custom shimmer animation | Smooth loading experience |
| Tooltip | Additional information | Custom delay (500ms), rich content | Non-intrusive help text |
| Separator | Visual divisions | Gradient color in dark mode | Clean section separation |
| Button | User actions | Loading states, custom ripple effect | Clear call-to-action |

### Icon Selections (Hugeicons)
| Icon Name | Variant | Size | Usage Context | Color Strategy |
|-----------|---------|------|---------------|----------------|
| rocket | outline | 20px | Initialization step | text-blue-500 |
| ai-brain-01 | outline | 20px | AI processing step | text-purple-500 |
| document-validation | outline | 20px | Document processing | text-green-500 |
| structure-check | outline | 20px | Structure generation | text-yellow-500 |
| sparkles | solid | 20px | Content creation | text-pink-500 |
| checkmark-circle-02 | solid | 24px | Completion | text-green-600 |
| loading-03 | outline | 16px | Processing animation | animate-spin |
| alert-circle | solid | 20px | Error states | text-red-500 |
| information-circle | outline | 16px | Info tooltips | text-blue-400 |
| timer-01 | outline | 16px | Time tracking | text-gray-500 |
| hourglass | outline | 20px | Estimated time | text-orange-500 |
| refresh-circle-01 | outline | 16px | Retry action | text-gray-600 |

## Technical Implementation

### Props Interface
```typescript
interface GenerationProgressProps {
  // Required props (Hybrid ID/Slug Pattern)
  courseId: string;  // UUID for DB operations (indexed, faster)
  slug: string;      // For URL navigation only
  initialProgress: GenerationProgress;
  initialStatus: CourseStatus;

  // Optional props
  onComplete?: (slug: string) => void;
  onError?: (error: Error) => void;
  showDebugInfo?: boolean;
  autoRedirect?: boolean;
  redirectDelay?: number; // ms
}

interface GenerationProgress {
  current_step: number;
  total_steps: number;
  percentage: number;
  message: string;
  steps: GenerationStep[];
  has_documents: boolean;
  lessons_total: number;
  lessons_completed: number;
  estimated_completion?: Date;
  started_at: Date;
}

interface GenerationStep {
  id: number;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  error_message?: string;
  retry_count?: number;
  substeps?: SubStep[];
}
```

### State Management
```typescript
// Local state with useReducer for complex state logic
const [state, dispatch] = useReducer(progressReducer, initialState);

interface ProgressState {
  progress: GenerationProgress;
  status: CourseStatus;
  error: Error | null;
  isConnected: boolean;
  activeTab: 'overview' | 'steps' | 'activity';
  activityLog: ActivityEntry[];
  retryAttempts: number;
  estimatedTime: number; // seconds
}

// Actions
type ProgressAction =
  | { type: 'UPDATE_PROGRESS'; payload: GenerationProgress }
  | { type: 'SET_STATUS'; payload: CourseStatus }
  | { type: 'SET_ERROR'; payload: Error }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'ADD_ACTIVITY'; payload: ActivityEntry }
  | { type: 'RETRY_STEP'; payload: number }
  | { type: 'UPDATE_ESTIMATE'; payload: number };

// Real-time subscription with Supabase (uses courseId for performance)
useEffect(() => {
  const channel = supabase
    .channel(`course-progress-${courseId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'courses',
      filter: `id=eq.${courseId}`  // Use ID for indexed lookup
    }, handleProgressUpdate)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [slug]);
```

### Event Handlers
```typescript
const handleRetry = async () => {
  dispatch({ type: 'SET_ERROR', payload: null });
  try {
    const response = await fetch(`/api/courses/${slug}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: state.progress.current_step })
    });

    if (!response.ok) throw new Error('Retry failed');

    toast.success('Retrying step...');
  } catch (error) {
    dispatch({ type: 'SET_ERROR', payload: error });
    toast.error('Failed to retry. Please try again.');
  }
};

const handleCancel = async () => {
  if (!confirm('Are you sure you want to cancel course generation?')) return;

  try {
    await fetch(`/api/courses/${slug}/cancel`, { method: 'POST' });
    router.push('/courses');
  } catch (error) {
    toast.error('Failed to cancel generation');
  }
};

const handleTabChange = (tab: string) => {
  dispatch({ type: 'CHANGE_TAB', payload: tab });
  // Track analytics
  trackEvent('generation_tab_viewed', { tab, slug });
};
```

## Styling Approach

### Theme Integration
```typescript
// Color tokens for light/dark themes
const themeColors = {
  light: {
    background: 'bg-gray-50',
    cardBg: 'bg-white',
    progressBg: 'bg-gray-200',
    progressFill: 'bg-gradient-to-r from-blue-500 to-purple-500',
    text: {
      primary: 'text-gray-900',
      secondary: 'text-gray-600',
      muted: 'text-gray-400'
    },
    border: 'border-gray-200',
    statusColors: {
      pending: 'bg-gray-100 text-gray-700',
      processing: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700'
    }
  },
  dark: {
    background: 'bg-gray-900',
    cardBg: 'bg-gray-800',
    progressBg: 'bg-gray-700',
    progressFill: 'bg-gradient-to-r from-blue-400 to-purple-400',
    text: {
      primary: 'text-gray-100',
      secondary: 'text-gray-300',
      muted: 'text-gray-500'
    },
    border: 'border-gray-700',
    statusColors: {
      pending: 'bg-gray-800 text-gray-300',
      processing: 'bg-blue-900/50 text-blue-300',
      completed: 'bg-green-900/50 text-green-300',
      failed: 'bg-red-900/50 text-red-300'
    }
  }
};
```

### Custom Styles
```css
/* Glass morphism effect for cards */
.glass-card {
  @apply backdrop-blur-lg bg-white/70 dark:bg-gray-800/70;
  @apply border border-white/20 dark:border-gray-700/30;
  @apply shadow-xl;
}

/* Animated gradient progress bar */
.progress-gradient {
  background: linear-gradient(90deg,
    #3b82f6 0%,
    #8b5cf6 50%,
    #ec4899 100%);
  background-size: 200% 100%;
  animation: gradient-shift 3s ease infinite;
}

@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* Step timeline connector */
.timeline-connector {
  @apply absolute left-5 top-10 w-0.5 h-full;
  background: linear-gradient(180deg,
    transparent 0%,
    theme('colors.gray.300') 50%,
    transparent 100%);
}

/* Pulse animation for active step */
.pulse-ring {
  @apply absolute inset-0 rounded-full;
  animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse-ring {
  0%, 100% {
    opacity: 0;
    transform: scale(1);
  }
  50% {
    opacity: 0.3;
    transform: scale(1.5);
  }
}
```

### Responsive Behavior
- **Mobile (< 640px)**:
  - Single column layout
  - Tabs stack vertically with icons only
  - Simplified progress card
  - Bottom sheet for actions

- **Tablet (640-1024px)**:
  - Two column grid for stats
  - Horizontal tabs with icons and labels
  - Side-by-side action buttons

- **Desktop (> 1024px)**:
  - Three column layout with sidebar
  - Full timeline view
  - Expanded activity log
  - Floating action buttons

## Accessibility Considerations

### ARIA Implementation
```tsx
<div
  role="progressbar"
  aria-valuenow={progress.percentage}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label={`Course generation ${progress.percentage}% complete`}
>
  {/* Progress content */}
</div>

<div role="status" aria-live="polite" aria-atomic="true">
  {progress.message}
</div>

<button
  aria-label="Retry failed step"
  aria-describedby="retry-description"
  disabled={!canRetry}
>
  <RefreshIcon aria-hidden="true" />
  Retry
</button>
```

### Testing Requirements
- Keyboard navigation through all interactive elements
- Screen reader announces progress updates
- Color contrast ratio ≥ 4.5:1 for normal text
- Focus indicators visible and clear
- Error messages associated with form controls

## Performance Optimization

### Loading Strategy
```typescript
// Lazy load heavy components
const ActivityLog = lazy(() => import('./ActivityLog'));
const SuccessAnimation = lazy(() => import('./SuccessAnimation'));

// Skeleton loading for initial render
if (!progress) {
  return <ProgressSkeleton />;
}

// Virtual scrolling for activity log
<VirtualList
  height={400}
  itemCount={activityLog.length}
  itemSize={60}
  renderItem={({ index, style }) => (
    <ActivityItem key={index} style={style} item={activityLog[index]} />
  )}
/>
```

### Optimization Techniques
```typescript
// Memoize expensive calculations
const estimatedCompletion = useMemo(() => {
  const avgStepTime = calculateAverageStepTime(progress.steps);
  const remainingSteps = progress.total_steps - progress.current_step;
  return new Date(Date.now() + (avgStepTime * remainingSteps));
}, [progress.steps, progress.current_step, progress.total_steps]);

// Debounce progress updates
const debouncedProgressUpdate = useDebouncedCallback(
  (newProgress) => {
    dispatch({ type: 'UPDATE_PROGRESS', payload: newProgress });
  },
  100
);

// Use React.memo for pure components
const StepItem = React.memo(({ step, isActive }) => {
  // Component implementation
}, (prevProps, nextProps) => {
  return prevProps.step.id === nextProps.step.id &&
         prevProps.isActive === nextProps.isActive;
});
```

## Edge Cases and Error Handling

### Edge Cases
1. **Connection Loss**
   - Automatic reconnection with exponential backoff
   - Fallback to polling if WebSocket fails
   - Display connection status indicator

2. **Long-Running Generation**
   - Show "Still working..." message after 5 minutes
   - Offer to receive email notification
   - Allow user to leave and return

3. **Concurrent Updates**
   - Handle race conditions with version tracking
   - Optimistic UI updates with rollback

4. **Browser Refresh**
   - Persist state to sessionStorage
   - Resume from last known state

### Error Boundaries
```typescript
class GenerationErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('Generation UI Error', { error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            {this.state.error?.message || 'An unexpected error occurred'}
          </AlertDescription>
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </Alert>
      );
    }

    return this.props.children;
  }
}
```

## Implementation Status

### 🎉 IMPLEMENTATION COMPLETE - ALL PHASES ACCEPTED

**Completed by**: design-implementer agent
**Review status**: All 4 phases reviewed and accepted
**Production ready**: Yes

## Implementation Checklist

### Pre-Implementation
- [x] Review with design team
- [x] Confirm API contracts
- [x] Set up test data
- [x] Configure WebSocket connection
- [x] Prepare icon assets

### During Implementation

#### Phase 1: Core Structure ✅ COMPLETED & ACCEPTED
- [x] Install required dependencies
  ```bash
  pnpm add framer-motion canvas-confetti hugeicons-react
  ```
- [x] Create component structure
- [x] Implement core functionality
  - [x] Real-time updates with Supabase
  - [x] Fallback polling mechanism
  - [x] Connection status tracking
  - [x] State management with useReducer

#### Phase 2: Tab Navigation ✅ COMPLETED & ACCEPTED
- [x] Tab navigation (Overview, Steps, Activity)
- [x] StatsGrid component
- [x] StepTimeline with visual progress
- [x] ActivityLog with virtual scrolling
- [x] Progress calculation
- [x] Responsive tab layouts

#### Phase 3: Styling & Animations ✅ COMPLETED & ACCEPTED
- [x] Add styling and animations
  - [x] Light theme
  - [x] Dark theme
  - [x] Responsive layouts
  - [x] Micro-interactions
- [x] Glass morphism effects
- [x] Gradient animations
- [x] Pulse effects for active steps
- [x] Skeleton loading states
- [x] Success celebration with confetti

#### Phase 4: Error Handling & Edge Cases ✅ COMPLETED & ACCEPTED
- [x] Error handling
  - [x] Retry mechanism for failed steps (max 3 attempts)
  - [x] Error boundaries with GenerationErrorBoundary component
  - [x] Fallback UI for critical errors
  - [x] Session recovery after disconnect
- [x] Edge cases
  - [x] Long-running generation (>5 min) with "Still working..." message
  - [x] Browser refresh state persistence via sessionStorage
  - [x] Concurrent updates handling
  - [x] Email notification option for long processes

### Testing & Documentation ⏳ PENDING
- [ ] Write unit tests
  - [ ] Component rendering
  - [ ] State management
  - [ ] Event handlers
  - [ ] Error scenarios
- [ ] Add Storybook stories
  - [ ] Default state
  - [ ] Loading state
  - [ ] Error state
  - [ ] Success state
  - [ ] All progress stages

### Post-Implementation
- [ ] Cross-browser testing
  - [ ] Chrome
  - [ ] Firefox
  - [ ] Safari
  - [ ] Edge
- [ ] Accessibility audit
  - [ ] Keyboard navigation
  - [ ] Screen reader testing
  - [ ] Color contrast check
- [ ] Performance profiling
  - [ ] Initial load time
  - [ ] Update render time
  - [ ] Memory usage
- [ ] Documentation update
- [ ] Analytics implementation

## Dependencies

### NPM Packages
```json
{
  "@radix-ui/react-progress": "^1.0.3",
  "@radix-ui/react-tabs": "^1.0.4",
  "@radix-ui/react-tooltip": "^1.0.7",
  "@radix-ui/react-alert-dialog": "^1.0.5",
  "framer-motion": "^11.0.0",
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.1.0",
  "tailwind-merge": "^2.2.0",
  "@tanstack/react-virtual": "^3.0.0",
  "use-debounce": "^10.0.0"
}
```

### Internal Dependencies
- `/lib/supabase/client` - Supabase client for real-time updates
- `/lib/logger` - Logging utility
- `/components/ui/*` - shadcn/ui components
- `/hooks/useWebSocket` - WebSocket connection hook
- `/hooks/useProgress` - Progress tracking hook
- `/types/course-generation` - TypeScript types

## Migration Notes

**IMPORTANT**: Use slug-based routing, NOT id-based:
- URL pattern: `/courses/generating/[slug]`
- Database queries: `WHERE slug = $1`
- All course references use slug for consistency

Current implementation to preserve:
- WebSocket connection logic with fallback to polling
- Exponential backoff for reconnection
- Progress calculation algorithm
- Course completion redirect logic

Breaking changes:
- New prop interface (requires parent component update)
- Changed event handler signatures
- New dependency on Framer Motion

Migration strategy:
1. Create new component alongside existing
2. Implement feature flag for gradual rollout
3. Monitor performance metrics
4. Remove old component after 2 weeks

## Future Enhancements

Potential improvements not in initial scope:
1. **AI-Powered Estimates**: Use ML to predict completion time based on historical data
2. **Collaborative Progress**: Show when multiple users are viewing the same generation
3. **Advanced Analytics**: Track user engagement with different tabs/features
4. **Customizable Themes**: Allow users to choose progress visualization style
5. **Export Progress Report**: Generate PDF report of generation process
6. **Voice Notifications**: Audio alerts for completion/errors
7. **Progress Comparison**: Compare current generation with previous ones
8. **Advanced Retry Logic**: Selective retry of specific substeps

## References

- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Hugeicons Documentation](https://hugeicons.com)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Framer Motion Documentation](https://www.framer.com/motion/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)