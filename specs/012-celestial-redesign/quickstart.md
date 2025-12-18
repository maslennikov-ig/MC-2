# Quickstart: Celestial Components

How to use the new "Celestial Mission" components.

## Setup

Dependencies are already installed in the project:
- `framer-motion` - animations
- `lucide-react` - icons
- `next-themes` - theme management

## Usage in Page

The `CelestialJourney` is the main container for the visualization.

```tsx
import { CelestialJourney } from '@/components/generation-celestial/CelestialJourney';
import { CelestialHeader } from '@/components/generation-celestial/CelestialHeader';
import { MissionControlBanner } from '@/components/generation-celestial/MissionControlBanner';
import { SpaceBackground } from '@/components/generation-celestial/SpaceBackground';
import { StageResultsDrawer } from '@/components/generation-celestial/StageResultsDrawer';
import { buildStagesFromStatus, isAwaitingApproval } from '@/components/generation-celestial/utils';
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider';

// Inside your container component
const { traces } = useGenerationRealtime();
const [isDrawerOpen, setDrawerOpen] = useState(false);

// Map status/progress to generic stages
const stages = buildStagesFromStatus(status, progress, traces);
const awaitingStage = isAwaitingApproval(status);

return (
  <SpaceBackground>
    <CelestialHeader
      courseTitle={course.title}
      overallProgress={progress.percentage}
      isConnected={true}
      currentStage={progress.current_stage}
    />

    <div className="container mx-auto py-12">
      <CelestialJourney
        stages={stages}
        activeStageId={progress.current_stage}
        traces={traces}
        onStageClick={handleStageClick}
      />
    </div>

    {awaitingStage && (
      <MissionControlBanner
        courseId={course.id}
        awaitingStage={awaitingStage}
        onApprove={handleApprove}
        onCancel={handleCancel}
        onViewResults={() => setDrawerOpen(true)}
      />
    )}

    <StageResultsDrawer
      isOpen={isDrawerOpen}
      onClose={() => setDrawerOpen(false)}
      courseId={course.id}
      stage={awaitingStage || selectedStage}
    />
  </SpaceBackground>
);
```

## Theme Support

All components automatically adapt to the current theme. The `SpaceBackground` component handles the main gradient:

```tsx
// SpaceBackground renders differently based on theme:
// - Dark: Deep space gradient (#0a0e1a → #111827)
// - Light: Ethereal sky gradient (slate-50 → blue-50/purple-50)
```

Use the `useThemeSync` hook if you need theme-aware logic:

```tsx
import { useThemeSync } from '@/lib/hooks/use-theme-sync';

function MyComponent() {
  const { theme } = useThemeSync();
  const isDark = theme === 'dark';

  // Use for conditional rendering when CSS alone isn't sufficient
}
```

## Reduced Motion Support

All animated components automatically check `prefers-reduced-motion`:

```tsx
import { useReducedMotion } from 'framer-motion';

function PlanetNode({ stage }) {
  const prefersReducedMotion = useReducedMotion();

  // Animations are disabled when prefersReducedMotion is true
}
```
