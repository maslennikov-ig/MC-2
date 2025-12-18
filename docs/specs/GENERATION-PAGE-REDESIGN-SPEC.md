# Generation Progress Page Redesign: "Celestial Mission" Concept

> **For Implementing Agent**: This spec contains ALL information needed to implement the redesign. You start with clean context - read this document completely before starting implementation.

---

## Table of Contents
1. [Project Structure](#project-structure)
2. [Tech Stack & Dependencies](#tech-stack--dependencies)
3. [Current Page Architecture](#current-page-architecture)
4. [Data Model & Types](#data-model--types)
5. [Stage Approval Flow (Critical)](#stage-approval-flow-critical)
6. [Design Specification](#design-specification)
7. [Component Architecture](#component-architecture)
8. [Implementation Steps](#implementation-steps)
9. [Code Examples from Current Implementation](#code-examples-from-current-implementation)
10. [Acceptance Criteria](#acceptance-criteria)

---

## Project Structure

This is a **monorepo** using pnpm workspaces:

```
/home/me/code/megacampus2/
├── packages/
│   ├── web/                          # Next.js 15 frontend (THIS IS WHERE YOU WORK)
│   │   ├── app/                      # App Router pages
│   │   │   └── courses/
│   │   │       └── generating/
│   │   │           └── [slug]/       # ← TARGET PAGE
│   │   ├── components/               # Shared components
│   │   │   ├── ui/                   # shadcn/ui components
│   │   │   ├── generation/           # Stage approval components
│   │   │   └── generation-monitoring/# Admin monitoring components
│   │   ├── lib/                      # Utilities, Supabase clients
│   │   ├── types/                    # TypeScript types
│   │   └── app/actions/              # Server Actions
│   │
│   ├── course-gen-platform/          # Backend (BullMQ workers) - DO NOT MODIFY
│   └── shared-types/                 # Shared TypeScript types
│
└── docs/specs/                       # This spec file
```

### Key Paths for This Task

```
packages/web/app/courses/generating/[slug]/
├── page.tsx                                # Server component (DO NOT MODIFY)
├── GenerationProgressContainerEnhanced.tsx # Main client component (MAJOR REFACTOR)
├── ProgressHeader.tsx                      # REPLACE with CelestialHeader
├── TabsContainer.tsx                       # REPLACE with CelestialJourney
├── MainProgressCard.tsx                    # REMOVE (replaced by planets)
├── StatsGrid.tsx                           # KEEP but restyle
├── StepTimeline.tsx                        # REMOVE (replaced by planets)
├── ActivityLog.tsx                         # KEEP, move to drawer
└── ProgressSkeleton.tsx                    # UPDATE design

packages/web/components/generation/
├── StageApprovalBanner.tsx                 # RESTYLE as MissionControlBanner
└── StageResultsPreview.tsx                 # KEEP, integrate into drawer

packages/web/components/generation-monitoring/
├── generation-timeline.tsx                 # KEEP for admin section
├── trace-viewer.tsx                        # KEEP for admin section
└── realtime-provider.tsx                   # KEEP (data layer, DO NOT MODIFY)

packages/web/app/actions/
└── admin-generation.ts                     # Server actions for approval (DO NOT MODIFY)

packages/web/types/
└── course-generation.ts                    # Types (reference only)
```

---

## Tech Stack & Dependencies

### Core Technologies
- **Next.js 15** (App Router)
- **React 19**
- **TypeScript 5.x** (strict mode)
- **Tailwind CSS 4**
- **Framer Motion** - animations
- **shadcn/ui** - UI components (in `components/ui/`)
- **Supabase** - database & realtime subscriptions
- **Lucide React** - icons

### Import Patterns

```typescript
// UI Components (shadcn)
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Icons
import { Rocket, CheckCircle, XCircle, ArrowRight, Clock } from 'lucide-react';

// Animations
import { motion, AnimatePresence } from 'framer-motion';

// Supabase
import { useSupabase } from '@/lib/supabase/browser-client';
import { createClient } from '@/lib/supabase/client';

// Utils
import { cn } from '@/lib/utils';

// Types
import { GenerationProgress, CourseStatus, GenerationStep } from '@/types/course-generation';

// Generation monitoring (for admin section)
import { GenerationRealtimeProvider, useGenerationRealtime, GenerationTrace } from '@/components/generation-monitoring/realtime-provider';
import { GenerationTimeline } from '@/components/generation-monitoring/generation-timeline';
import { TraceViewer } from '@/components/generation-monitoring/trace-viewer';

// Server Actions
import { approveStage, cancelGeneration, getStageResults } from '@/app/actions/admin-generation';
```

---

## Current Page Architecture

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         page.tsx (Server)                           │
│  - Fetches course from Supabase                                     │
│  - Parses generation_progress JSONB                                 │
│  - Passes initialProgress, initialStatus to client                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│              GenerationProgressContainerEnhanced.tsx                │
│  - useReducer for state management                                  │
│  - Supabase Realtime subscription for course updates                │
│  - Polling fallback if Realtime fails                               │
│  - Renders: ProgressHeader, TabsContainer, StageApprovalBanner      │
│  - For admins: GenerationRealtimeProvider + TraceViewer             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌────────────┐   ┌──────────────┐
            │TabsContainer│  │StageApproval│  │Admin Section │
            │ (Overview, │   │   Banner    │  │(TraceViewer, │
            │  Steps,    │   │ (if awaiting│  │ Timeline)    │
            │  Activity) │   │  approval)  │  │              │
            └───────────┘   └────────────┘   └──────────────┘
```

### Data Sources

1. **courses table** (via Realtime subscription):
   - `generation_status` - current status string
   - `generation_progress` - JSONB with progress details

2. **generation_trace table** (via Realtime in admin section):
   - Real-time trace entries for LLM calls
   - Fetched by `GenerationRealtimeProvider`

---

## Data Model & Types

### GenerationProgress (from courses.generation_progress JSONB)

```typescript
// File: packages/web/types/course-generation.ts

export interface GenerationProgress {
  steps: GenerationStep[];      // Legacy step-based tracking (may be empty)
  message: string;              // Current status message for display
  percentage: number;           // 0-100 overall progress
  current_step: number;         // Legacy step number
  total_steps: number;          // Usually 6
  has_documents: boolean;       // Whether course has uploaded files
  lessons_completed: number;    // For stage 6
  lessons_total: number;        // For stage 6
  current_stage?: string | null; // "stage_2", "stage_4", etc.
  document_size?: number | null;
  started_at: Date;
  estimated_completion?: Date;
}

export interface GenerationStep {
  id: number;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  optional?: boolean;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number;
  error_message?: string | null;
  retry_count?: number;
}
```

### GenerationTrace (from generation_trace table)

```typescript
// File: packages/web/components/generation-monitoring/realtime-provider.tsx

export type GenerationTrace = {
  id: string;
  course_id: string;
  lesson_id?: string;
  stage: 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';
  phase: string;           // "phase_1_classifier", "phase_2_scope", etc.
  step_name: string;       // Specific operation name
  input_data: any;
  output_data: any;
  error_data?: any;
  model_used?: string;     // "claude-sonnet-4-5-20250514"
  prompt_text?: string;    // Full LLM prompt
  completion_text?: string;// Full LLM response
  tokens_used?: number;
  cost_usd?: number;
  temperature?: number;
  duration_ms?: number;
  retry_attempt?: number;
  was_cached?: boolean;
  quality_score?: number;
  created_at: string;
};
```

### CourseStatus / GenerationStatus

```typescript
// The status field from courses.generation_status
type GenerationStatus =
  | 'pending'
  | 'initializing'
  | 'processing_documents'      // Stage 2 active
  | 'analyzing_task'            // Stage 4 active
  | 'generating_structure'      // Stage 5 active
  | 'generating_content'        // Stage 6 active
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'stage_2_awaiting_approval' // Paused after Stage 2
  | 'stage_3_awaiting_approval' // Paused after Stage 3
  | 'stage_4_awaiting_approval' // Paused after Stage 4
  | 'stage_5_awaiting_approval';// Paused after Stage 5
```

### Stage Mapping Utility (CREATE THIS)

```typescript
// Create this in packages/web/components/generation-celestial/utils.ts

export interface StageInfo {
  id: string;          // "stage_2", "stage_3", etc.
  number: number;      // 2, 3, 4, 5, 6
  name: string;        // Human-readable name
  status: 'pending' | 'active' | 'completed' | 'error' | 'awaiting';
  progress?: number;   // 0-100 for active stage
  startedAt?: Date;
  completedAt?: Date;
}

export const STAGE_CONFIG = {
  stage_2: { number: 2, name: 'Document Processing', icon: 'FileText' },
  stage_3: { number: 3, name: 'Summarization', icon: 'Moon' },
  stage_4: { number: 4, name: 'Analysis', icon: 'Orbit' },
  stage_5: { number: 5, name: 'Structure Generation', icon: 'Layers' },
  stage_6: { number: 6, name: 'Content Generation', icon: 'Globe' },
} as const;

export function getStageFromStatus(status: string): number | null {
  if (status.includes('stage_2') || status === 'processing_documents') return 2;
  if (status.includes('stage_3')) return 3;
  if (status.includes('stage_4') || status === 'analyzing_task') return 4;
  if (status.includes('stage_5') || status === 'generating_structure') return 5;
  if (status.includes('stage_6') || status === 'generating_content') return 6;
  if (status === 'completed') return 6; // All done
  return null;
}

export function isAwaitingApproval(status: string): number | null {
  const match = status.match(/stage_(\d+)_awaiting_approval/);
  return match ? parseInt(match[1], 10) : null;
}

export function buildStagesFromStatus(
  status: string,
  progress: GenerationProgress,
  traces: GenerationTrace[]
): StageInfo[] {
  const currentStage = getStageFromStatus(status);
  const awaitingStage = isAwaitingApproval(status);

  return Object.entries(STAGE_CONFIG).map(([id, config]) => {
    let stageStatus: StageInfo['status'] = 'pending';

    if (awaitingStage === config.number) {
      stageStatus = 'awaiting';
    } else if (currentStage && config.number < currentStage) {
      stageStatus = 'completed';
    } else if (currentStage === config.number) {
      stageStatus = 'active';
    } else if (status === 'completed') {
      stageStatus = 'completed';
    } else if (status === 'failed') {
      // Check if this stage failed
      const hasError = traces.some(t => t.stage === id && t.error_data);
      if (hasError) stageStatus = 'error';
    }

    return {
      id,
      number: config.number,
      name: config.name,
      status: stageStatus,
      progress: stageStatus === 'active' ? progress.percentage : undefined,
    };
  });
}
```

---

## Stage Approval Flow (Critical)

### How It Works

1. When a stage completes, backend sets `generation_status` to `stage_X_awaiting_approval`
2. Frontend detects this status and shows `StageApprovalBanner`
3. User clicks "Continue to Next Stage" or "Cancel"
4. Server action `approveStage()` or `cancelGeneration()` is called
5. Backend updates status and continues/stops generation

### Current StageApprovalBanner Component

```typescript
// File: packages/web/components/generation/StageApprovalBanner.tsx
// This is the CURRENT implementation - you will RESTYLE this as MissionControlBanner

'use client';

import { useState } from 'react';
import { approveStage, cancelGeneration } from '@/app/actions/admin-generation';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, ArrowRight } from 'lucide-react';

interface StageApprovalBannerProps {
  courseId: string;
  currentStage: number; // e.g. 2 for stage_2_awaiting_approval
  onApproved?: () => void;
  onCancelled?: () => void;
}

export default function StageApprovalBanner({
  courseId,
  currentStage,
  onApproved,
  onCancelled
}: StageApprovalBannerProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await approveStage(courseId, currentStage);
      if (onApproved) onApproved();
    } catch (error) {
      console.error('Failed to approve stage:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel the generation?')) return;
    setIsProcessing(true);
    try {
      await cancelGeneration(courseId);
      if (onCancelled) onCancelled();
    } catch (error) {
      console.error('Failed to cancel generation:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStageName = (stage: number) => {
    switch (stage) {
      case 2: return 'Document Processing';
      case 3: return 'Summarization';
      case 4: return 'Analysis';
      case 5: return 'Structure Generation';
      default: return `Stage ${stage}`;
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t z-40">
      <div className="container mx-auto max-w-6xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded-full">
            <CheckCircle className="w-6 h-6 text-yellow-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{getStageName(currentStage)} Complete</h3>
            <p className="text-sm text-muted-foreground">
              Review results and approve to continue.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
            <XCircle className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleApprove} disabled={isProcessing} className="bg-green-600">
            {isProcessing ? 'Processing...' : (
              <>Continue to Next Stage <ArrowRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### Server Actions for Approval

```typescript
// File: packages/web/app/actions/admin-generation.ts
// DO NOT MODIFY - just use these functions

export async function approveStage(courseId: string, currentStage: number): Promise<void>;
export async function cancelGeneration(courseId: string): Promise<void>;
export async function getStageResults(courseId: string, stage: number): Promise<StageData>;
```

### StageResultsPreview Component

```typescript
// File: packages/web/components/generation/StageResultsPreview.tsx
// This shows stage results - integrate into StageResultsDrawer

interface StageResultsPreviewProps {
  courseId: string;
  stage: number;
}

// Shows different content based on stage:
// Stage 2: Total documents, classified count, priorities
// Stage 3: Total documents, summarized count, token savings
// Stage 4: Analysis summary text
// Stage 5: Modules count, lessons count
```

---

## Design Specification

### Visual Concept: "Celestial Mission"

The generation process is visualized as a space mission traveling through planets:

```
┌─────────────────────────────────────────────────────┐
│  🚀 [Course Title]              Mission Progress 73%│
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │                                              │   │
│  │      ◉ Stage 2: Document Processing    ✓   │   │  ← Completed (green glow)
│  │      │                                       │   │
│  │      │ ─ ─ trajectory line ─ ─              │   │
│  │      │                                       │   │
│  │      ◉ Stage 3: Summarization          ✓   │   │  ← Completed
│  │      │                                       │   │
│  │      │                                       │   │
│  │      ◉ Stage 4: Analysis          ⟳ 73%   │   │  ← Active (purple pulse)
│  │      │   ┌────────────────────────────┐    │   │
│  │      │   │ 🌐 Phase: Expert Analysis │    │   │
│  │      │   │ ████████████░░░░░░ 73%    │    │   │
│  │      │   │ 🤖 Claude 4.5 • 1.2k tok  │    │   │
│  │      │   │ ⏱️ 12.3s • 💰 $0.003      │    │   │
│  │      │   └────────────────────────────┘    │   │
│  │      │                                       │   │
│  │      ○ Stage 5: Structure                   │   │  ← Pending (dimmed)
│  │      │                                       │   │
│  │      ○ Stage 6: Content                     │   │
│  │                                              │   │
│  └─────────────────────────────────────────────┘   │
│                                                      │
└─────────────────────────────────────────────────────┘

# When awaiting approval, show Mission Control banner:

┌─────────────────────────────────────────────────────┐
│ 📡 MISSION CONTROL                                  │
│ Stage 4 Analysis Complete — Awaiting Go/No-Go       │
│                                                      │
│ [👁 View Results]  [❌ Cancel]  [✅ Approve & Continue]│
└─────────────────────────────────────────────────────┘
```

### Stage-to-Planet Mapping

| Stage | Name | Visual | Color | Icon (Lucide) |
|-------|------|--------|-------|---------------|
| Stage 2 | Document Processing | Small star | Amber (#f59e0b) | FileText |
| Stage 3 | Summarization | Moon | Silver (#94a3b8) | Moon |
| Stage 4 | Analysis | Ringed planet | Purple (#8b5cf6) | Orbit |
| Stage 5 | Structure Generation | Gas giant | Cyan (#06b6d4) | Layers |
| Stage 6 | Content Generation | Earth | Green (#10b981) | Globe |

### Color Palette

```css
/* Dark space background */
--space-bg: #0a0e1a;
--space-bg-lighter: #111827;
--space-card: rgba(17, 24, 39, 0.8);

/* Stage status colors */
--status-pending: #4b5563;      /* Gray - dimmed */
--status-active: #8b5cf6;       /* Purple - pulsing */
--status-completed: #10b981;    /* Green - glowing */
--status-error: #ef4444;        /* Red */
--status-awaiting: #f59e0b;     /* Amber */

/* Accents */
--trajectory-line: #374151;
--glow-active: rgba(139, 92, 246, 0.4);
--glow-complete: rgba(16, 185, 129, 0.3);
```

---

## Component Architecture

### New Components to Create

```
packages/web/components/generation-celestial/
├── index.ts                    # Barrel exports
├── utils.ts                    # Stage mapping utilities
├── CelestialHeader.tsx         # Header with rocket + progress
├── CelestialJourney.tsx        # Main vertical timeline
├── PlanetNode.tsx              # Individual planet/stage
├── ActiveStageCard.tsx         # Expanded view of active stage
├── PhaseProgress.tsx           # Phase progress within stage
├── MissionControlBanner.tsx    # Approval banner (replaces StageApprovalBanner)
├── StageResultsDrawer.tsx      # Drawer with stage results
├── TrajectoryLine.tsx          # Animated connecting line
└── SpaceBackground.tsx         # Gradient background
```

### Component Props

```typescript
// CelestialHeader.tsx
interface CelestialHeaderProps {
  courseTitle: string;
  overallProgress: number;       // 0-100
  isConnected: boolean;          // Realtime connection status
  currentStage: string | null;   // "stage_4" etc.
}

// CelestialJourney.tsx
interface CelestialJourneyProps {
  stages: StageInfo[];
  activeStageId: string | null;
  traces: GenerationTrace[];     // For showing phase details
  onStageClick: (stageId: string) => void;
}

// PlanetNode.tsx
interface PlanetNodeProps {
  stage: StageInfo;
  isExpanded: boolean;
  traces: GenerationTrace[];     // Filtered to this stage
  onClick: () => void;
}

// MissionControlBanner.tsx
interface MissionControlBannerProps {
  courseId: string;
  awaitingStage: number;         // 2, 3, 4, or 5
  onApprove: () => Promise<void>;
  onCancel: () => Promise<void>;
  onViewResults: () => void;
}

// StageResultsDrawer.tsx
interface StageResultsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  stage: number;
}
```

---

## Implementation Steps

### Phase 1: Foundation (Start Here)
1. Create `packages/web/components/generation-celestial/` folder
2. Create `utils.ts` with stage mapping functions
3. Create `SpaceBackground.tsx` - gradient background component
4. Create `TrajectoryLine.tsx` - animated dashed line

### Phase 2: Core Components
5. Create `PlanetNode.tsx` with all 5 states (pending, active, completed, error, awaiting)
6. Create `CelestialJourney.tsx` - vertical timeline with planets
7. Create `ActiveStageCard.tsx` - expanded view with phase details
8. Create `PhaseProgress.tsx` - progress within active stage

### Phase 3: Header & Controls
9. Create `CelestialHeader.tsx` - minimal header with rocket icon
10. Create `MissionControlBanner.tsx` - approval banner with space theme
11. Create `StageResultsDrawer.tsx` - slide-out drawer for results

### Phase 4: Integration
12. Refactor `GenerationProgressContainerEnhanced.tsx`:
    - Replace `ProgressHeader` with `CelestialHeader`
    - Replace `TabsContainer` with `CelestialJourney`
    - Replace `StageApprovalBanner` with `MissionControlBanner`
    - Keep admin section (TraceViewer, GenerationTimeline)
13. Update `ProgressSkeleton.tsx` to match new design

### Phase 5: Polish
14. Add all Framer Motion animations
15. Test all status transitions
16. Verify mobile responsiveness
17. Test approval flow end-to-end

---

## Animations (Framer Motion)

```typescript
// Planet appearance with stagger
const planetVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => ({
    scale: 1,
    opacity: 1,
    transition: { delay: i * 0.15, type: 'spring', stiffness: 200 }
  })
};

// Active planet pulse
const pulseVariants = {
  pulse: {
    scale: [1, 1.05, 1],
    boxShadow: [
      '0 0 0 0 rgba(139, 92, 246, 0.4)',
      '0 0 0 20px rgba(139, 92, 246, 0)',
      '0 0 0 0 rgba(139, 92, 246, 0)'
    ],
    transition: { duration: 2, repeat: Infinity }
  }
};

// Trajectory line animation
const trajectoryVariants = {
  animate: {
    strokeDashoffset: [0, -20],
    transition: { duration: 1, repeat: Infinity, ease: 'linear' }
  }
};

// Stage completion burst
const completionVariants = {
  initial: { scale: 1 },
  complete: {
    scale: [1, 1.3, 1],
    filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1)'],
    transition: { duration: 0.5 }
  }
};
```

---

## Acceptance Criteria

### Visual Requirements
- [ ] Dark space theme with gradient background (#0a0e1a to #111827)
- [ ] 5 planet nodes vertically aligned with animated trajectory line
- [ ] Each planet has correct icon and color based on stage
- [ ] Active planet has purple pulsing glow animation
- [ ] Completed planets have green glow + checkmark
- [ ] Pending planets are dimmed gray with outline only
- [ ] Awaiting approval planets have amber glow

### Functionality Requirements
- [ ] Clicking planet expands/collapses ActiveStageCard
- [ ] ActiveStageCard shows current phase, progress, LLM metrics
- [ ] Real-time updates from GenerationTrace work correctly
- [ ] MissionControlBanner appears when `stage_X_awaiting_approval`
- [ ] "Approve & Continue" button calls `approveStage()` action
- [ ] "Cancel" button calls `cancelGeneration()` action
- [ ] "View Results" opens StageResultsDrawer
- [ ] Drawer shows correct data for each stage (2, 3, 4, 5)

### Data Requirements
- [ ] Correctly maps `generation_status` to planet states
- [ ] Shows phase progress from GenerationTrace entries
- [ ] Displays LLM metrics: model, tokens, cost, duration
- [ ] Handles all status transitions without breaking
- [ ] Handles error states gracefully

### UX Requirements
- [ ] Smooth animations (no jank, respects prefers-reduced-motion)
- [ ] Works on mobile (responsive layout)
- [ ] Keyboard accessible (focus states, ARIA labels)
- [ ] Loading/skeleton states for async data
- [ ] Connection status indicator (realtime connected/disconnected)

### Admin Section
- [ ] TraceViewer remains functional with new design
- [ ] GenerationTimeline remains functional
- [ ] Admin section collapsible (already exists)
- [ ] Cleaner visual integration with celestial theme

---

## Testing Checklist

Test the page with courses in these states:

1. **pending** - No stages started, all planets pending
2. **processing_documents** - Stage 2 active, rest pending
3. **stage_2_awaiting_approval** - Stage 2 complete (awaiting), show Mission Control
4. **analyzing_task** - Stage 4 active
5. **stage_4_awaiting_approval** - Stages 2-4 complete, Stage 4 awaiting
6. **generating_content** - Stage 6 active, Stages 2-5 complete
7. **completed** - All planets green, success state
8. **failed** - Error state on one planet

---

## Reference: Current Main Container Structure

```typescript
// Key parts of GenerationProgressContainerEnhanced.tsx to preserve:

// 1. State management with useReducer - KEEP
const [state, dispatch] = useReducer(enhancedProgressReducer, null, getInitialState);

// 2. Supabase client initialization - KEEP
useEffect(() => {
  if (typeof window !== 'undefined') {
    setSupabase(createClient());
  }
}, []);

// 3. Realtime subscription - KEEP
useEffect(() => {
  // Subscribe to courses table changes
  const channel = supabase
    .channel(`course-progress-${courseId}`)
    .on('postgres_changes', { ... }, handleProgressUpdate)
    .subscribe();
}, [courseId, supabase]);

// 4. Polling fallback - KEEP
const startPolling = useCallback(() => { ... }, []);

// 5. Progress update handler - KEEP (modify to update stages)
const handleProgressUpdate = useCallback((course) => {
  // Update progress state
  // Dispatch actions
}, []);

// 6. Awaiting stage detection - KEEP
const getAwaitingStage = (status: string): number | null => {
  const match = status.match(/stage_(\d+)_awaiting_approval/);
  return match ? parseInt(match[1], 10) : null;
};

// 7. Admin section with GenerationRealtimeProvider - KEEP
{(userRole === 'admin' || userRole === 'superadmin') && (
  <GenerationRealtimeProvider courseId={courseId}>
    <TraceViewer />
    <GenerationTimeline />
  </GenerationRealtimeProvider>
)}
```

---

## Final Notes

1. **DO NOT** break the Realtime subscription logic
2. **DO NOT** modify server actions in `admin-generation.ts`
3. **DO NOT** modify `realtime-provider.tsx`
4. **KEEP** the admin section functional
5. **TEST** with real courses in various states before declaring done
6. Run `pnpm tsc --noEmit` to verify no type errors
7. Run `pnpm build` in web package to verify build succeeds
