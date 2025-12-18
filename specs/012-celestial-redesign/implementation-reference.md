# Technical Implementation Reference

**Source**: Derived from original `GENERATION-PAGE-REDESIGN-SPEC.md`
**Feature**: Generation Progress Page Redesign (Celestial Mission)
**Related**: [design-tokens.md](./design-tokens.md) for color palette and animations

## Architecture & Constraints

- **Tech Stack**: Next.js 15 (App Router), React 19, Tailwind CSS 4, Framer Motion, Supabase Realtime.
- **State Management**: Must preserve existing `useReducer` and `GenerationRealtimeProvider` logic.
- **Server Actions**: Must use existing `approveStage` and `cancelGeneration` actions.
- **Theme System**: Must support both light and dark modes using `next-themes` and CSS variables.

## Component Architecture

### New Components (`packages/web/components/generation-celestial/`)
- `CelestialHeader.tsx`: Header with rocket + progress. Replaces `ProgressHeader`.
- `CelestialJourney.tsx`: Main vertical timeline. Replaces `TabsContainer`.
- `PlanetNode.tsx`: Individual planet/stage (Pending, Active, Completed, Error, Awaiting).
- `ActiveStageCard.tsx`: Expanded view of active stage with phase details.
- `PhaseProgress.tsx`: Progress within active stage.
- `MissionControlBanner.tsx`: Approval banner. Replaces `StageApprovalBanner`.
- `StageResultsDrawer.tsx`: Slide-out drawer for results.
- `TrajectoryLine.tsx`: Animated connecting line.
- `SpaceBackground.tsx`: Gradient background (dual theme support).
- `utils.ts`: Stage mapping utilities (`getStageFromStatus`, `buildStagesFromStatus`).

### Component Updates
- `GenerationProgressContainerEnhanced.tsx`:
  - Integrate new celestial components.
  - Keep admin section (`TraceViewer`, `GenerationTimeline`) functional.
- `ProgressSkeleton.tsx`: Update to match celestial theme.

## Visual Design Implementation
- **Colors**: See [design-tokens.md](./design-tokens.md) for full palette.
- **Light Mode**: Ethereal sky theme (soft gradients, luminous orbs)
- **Dark Mode**: Deep space theme (dark cosmos, glowing planets)
- **Animations**:
  - Pulse effect for active planet.
  - Staggered entrance for planets.
  - Animated trajectory line (dashed stroke offset).

## Data Mapping
- **Stages**:
  - Stage 2: Document Processing
  - Stage 3: Summarization
  - Stage 4: Analysis
  - Stage 5: Structure Generation
  - Stage 6: Content Generation

---

## Theme System Integration

### Provider Architecture
The project uses `next-themes` with class-based dark mode:
```tsx
// packages/web/components/common/app-theme-provider.tsx
<ThemeProvider
  attribute="class"
  defaultTheme="light"
  enableSystem={false}
  storageKey="theme"
>
```

### Using Theme in Components
```tsx
// Import the hook
import { useThemeSync } from '@/lib/hooks/use-theme-sync';

// In component
const { theme } = useThemeSync();
const isDark = theme === 'dark';
```

### CSS Variable Pattern
Always use CSS variables with Tailwind's `dark:` prefix:
```tsx
// CORRECT - uses semantic tokens
<div className="bg-card text-card-foreground dark:bg-card dark:text-card-foreground">

// CORRECT - explicit light/dark variants
<div className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">

// INCORRECT - hardcoded colors without dark variant
<div className="bg-[#0a0e1a]">  // Won't work in light mode!
```

### SpaceBackground Dual Theme Example
```tsx
// packages/web/components/generation-celestial/SpaceBackground.tsx
export function SpaceBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(
      // Light mode: ethereal sky
      "bg-gradient-to-b from-slate-50 via-blue-50/30 to-purple-50/30",
      // Dark mode: deep space
      "dark:from-[#0a0e1a] dark:via-[#111827] dark:to-[#0a0e1a]",
      "min-h-screen transition-colors duration-300"
    )}>
      {children}
    </div>
  );
}
```

---

## Main Container Integration Reference

### File: `packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`

### Props Interface
```typescript
interface GenerationProgressContainerProps {
  courseId: string;
  slug: string;
  initialProgress: GenerationProgress;
  initialStatus: CourseStatus;
  courseTitle: string;
  onComplete?: (courseId: string) => void;
  onError?: (error: Error) => void;
  showDebugInfo?: boolean;
  autoRedirect?: boolean;
  redirectDelay?: number;
  userRole?: string | null;  // 'admin' | 'superadmin' | null
}
```

### State Structure (DO NOT MODIFY)
```typescript
interface EnhancedProgressState {
  progress: GenerationProgress;
  status: CourseStatus;
  error: Error | null;
  isConnected: boolean;
  activeTab: 'overview' | 'steps' | 'activity';
  activityLog: ActivityLogEntry[];
  retryAttempts: number;
  estimatedTime: number;
  isLongRunning: boolean;
  emailNotificationRequested: boolean;
  stepRetryCount: Map<number, number>;
  toast: ToastState | null;
}
```

### Components to Replace (Lines 702-769)
```typescript
// BEFORE (current imports at top)
import ProgressHeader from './ProgressHeader';
import TabsContainer from './TabsContainer';
import StageApprovalBanner from '@/components/generation/StageApprovalBanner';

// AFTER (new imports)
import { CelestialHeader } from '@/components/generation-celestial/CelestialHeader';
import { CelestialJourney } from '@/components/generation-celestial/CelestialJourney';
import { MissionControlBanner } from '@/components/generation-celestial/MissionControlBanner';
import { SpaceBackground } from '@/components/generation-celestial/SpaceBackground';
import { StageResultsDrawer } from '@/components/generation-celestial/StageResultsDrawer';
```

### Integration Points in JSX

#### 1. Replace Root Container (Line ~658-664)
```tsx
// BEFORE
<motion.div className="min-h-screen bg-gradient-to-br from-gray-50 ...">

// AFTER
<SpaceBackground>
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
```

#### 2. Replace ProgressHeader (Line ~702-707)
```tsx
// BEFORE
<ProgressHeader
  courseTitle={courseTitle}
  status={state.status}
  isConnected={state.isConnected}
/>

// AFTER
<CelestialHeader
  courseTitle={courseTitle}
  overallProgress={state.progress.percentage}
  isConnected={state.isConnected}
  currentStage={state.progress.current_stage}
/>
```

#### 3. Replace StageApprovalBanner (Line ~710-717)
```tsx
// BEFORE
{awaitingStage && (
  <StageApprovalBanner
    courseId={courseId}
    currentStage={awaitingStage}
    onApproved={() => showToast('success', `Stage ${awaitingStage} approved`)}
    onCancelled={() => showToast('info', 'Generation cancelled')}
  />
)}

// AFTER
{awaitingStage && (
  <MissionControlBanner
    courseId={courseId}
    awaitingStage={awaitingStage}
    onApprove={async () => {
      await approveStage(courseId, awaitingStage);
      showToast('success', `Stage ${awaitingStage} approved`);
    }}
    onCancel={async () => {
      await cancelGeneration(courseId);
      showToast('info', 'Generation cancelled');
    }}
    onViewResults={() => setDrawerOpen(true)}
  />
)}
```

#### 4. Replace TabsContainer (Line ~759-769)
```tsx
// BEFORE
<TabsContainer
  progress={state.progress}
  status={state.status}
  error={state.error}
  ...
/>

// AFTER
<CelestialJourney
  stages={buildStagesFromStatus(state.status, state.progress, traces)}
  activeStageId={state.progress.current_stage}
  traces={traces}  // From GenerationRealtimeProvider context
  onStageClick={handleStageClick}
/>
```

### Admin Section (Lines ~821-901) - KEEP AS IS
The admin section with `GenerationRealtimeProvider`, `TraceViewer`, and `GenerationTimeline` should remain functional. Only apply visual styling to match celestial theme.

### Required State Additions
```tsx
// Add new state for drawer
const [isDrawerOpen, setDrawerOpen] = useState(false);
const [selectedStageForDrawer, setSelectedStageForDrawer] = useState<number | null>(null);

// Handler for stage click
const handleStageClick = useCallback((stageId: string) => {
  const stageNum = parseInt(stageId.replace('stage_', ''), 10);
  setSelectedStageForDrawer(stageNum);
  setDrawerOpen(true);
}, []);
```

---

## Existing Infrastructure (DO NOT MODIFY)

### Server Actions
```typescript
// packages/web/app/actions/admin-generation.ts
export async function approveStage(courseId: string, currentStage: number): Promise<void>;
export async function cancelGeneration(courseId: string): Promise<void>;
export async function getStageResults(courseId: string, stage: number): Promise<StageData>;
```

### Realtime Provider
```typescript
// packages/web/components/generation-monitoring/realtime-provider.tsx
export const GenerationRealtimeProvider: React.FC<{
  courseId: string;
  initialStatus?: string;
  children: React.ReactNode;
}>;

export function useGenerationRealtime(): {
  traces: GenerationTrace[];
  isLoading: boolean;
  error: Error | null;
};
```

### Types
```typescript
// packages/web/types/course-generation.ts
export interface GenerationProgress { ... }
export interface GenerationStep { ... }
export type CourseStatus = 'pending' | 'processing_documents' | ... ;
```

---

## Import Patterns Reference

```typescript
// UI Components (shadcn)
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Icons
import { Rocket, CheckCircle, XCircle, ArrowRight, Clock, FileText, Moon, Orbit, Layers, Globe } from 'lucide-react';

// Animations
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

// Theme
import { useThemeSync } from '@/lib/hooks/use-theme-sync';

// Utils
import { cn } from '@/lib/utils';

// Types
import { GenerationProgress, CourseStatus, GenerationStep } from '@/types/course-generation';

// Generation monitoring
import { GenerationRealtimeProvider, useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider';

// Server Actions
import { approveStage, cancelGeneration, getStageResults } from '@/app/actions/admin-generation';
```

---

## File Dependencies

### New Files to Create (in order)
1. `packages/web/components/generation-celestial/utils.ts` - No deps
2. `packages/web/components/generation-celestial/SpaceBackground.tsx` - No deps
3. `packages/web/components/generation-celestial/TrajectoryLine.tsx` - framer-motion
4. `packages/web/components/generation-celestial/PlanetNode.tsx` - utils, framer-motion, lucide
5. `packages/web/components/generation-celestial/PhaseProgress.tsx` - No deps
6. `packages/web/components/generation-celestial/ActiveStageCard.tsx` - PhaseProgress, types
7. `packages/web/components/generation-celestial/CelestialJourney.tsx` - PlanetNode, TrajectoryLine, ActiveStageCard
8. `packages/web/components/generation-celestial/CelestialHeader.tsx` - lucide
9. `packages/web/components/generation-celestial/MissionControlBanner.tsx` - server actions
10. `packages/web/components/generation-celestial/StageResultsDrawer.tsx` - Sheet, StageResultsPreview
11. `packages/web/components/generation-celestial/index.ts` - Barrel exports
