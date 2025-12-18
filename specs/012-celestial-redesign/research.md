# Research: Generation Progress Page Redesign

**Date**: 2025-11-27
**Status**: Complete

## Visual Effects & Animations

- **Decision**: Use `framer-motion` for all complex animations (planet pulse, trajectory line, drawer slide-in).
- **Rationale**: It's already included in the project (`packages/web/package.json`), provides a declarative API for complex physics-based animations (springs), and handles `AnimatePresence` for component unmounting (crucial for the results drawer).
- **Alternatives considered**:
  - *CSS Keyframes*: Good for simple rotations, but harder to coordinate complex sequences (staggered planet entry) and exit animations.
  - *React Spring*: Another good option, but Framer Motion is the project standard.

## Iconography

- **Decision**: Use `lucide-react` icons as specified in the design.
- **Rationale**: Standard icon library for the project.
- **Verified**: `Orbit` icon exists in lucide-react@0.542.0 (current project version).
- **Mappings**:
  - Stage 2 (Document Processing): `FileText`
  - Stage 3 (Summarization): `Moon`
  - Stage 4 (Analysis): `Orbit`
  - Stage 5 (Structure): `Layers`
  - Stage 6 (Content): `Globe`
  - Rocket: `Rocket`

## State Management

- **Decision**: Enhance the existing `useReducer` in `GenerationProgressContainerEnhanced.tsx`.
- **Rationale**: The current reducer already handles the complex state logic for the generation process. We only need to map the existing state to the new "Celestial" visual states (Pending, Active, Completed, Awaiting). Rewriting entirely would be risky and unnecessary.
- **Alternatives considered**:
  - *Zustand*: Good for global state, but this state is highly localized to the generation page and dependent on a specific `courseId`.
  - *React Context*: `GenerationRealtimeProvider` already uses Context for traces; sticking to Reducer for local UI state keeps it predictable.

## Component Architecture

- **Decision**: Create a dedicated `components/generation-celestial/` directory.
- **Rationale**: Allows for a clean "namespace" for the new design, avoiding conflicts with existing components and making it easy to eventually remove the old components (`ProgressHeader`, `TabsContainer`) once the redesign is fully adopted.

## Theme System

- **Decision**: Support both light and dark themes using existing `next-themes` infrastructure.
- **Rationale**: The project already has a mature theme system with CSS variables. The celestial design should adapt to both themes for user preference.

### Dark Mode (Default for Celestial)
- Deep space gradient background (`#0a0e1a` → `#111827`)
- Glowing planets with bright accent colors
- Star-field decorations with white/purple accents

### Light Mode (Ethereal Alternative)
- Soft sky gradient (`#f8fafc` → `#f1f5f9` with subtle purple/blue tints)
- Luminous orbs instead of glowing planets
- Softer shadows and reduced glow effects

### Implementation Pattern
```tsx
// Use Tailwind's dark: prefix consistently
<div className={cn(
  // Light mode styles
  "bg-slate-50 text-gray-900 border-gray-200",
  // Dark mode styles
  "dark:bg-[#0a0e1a] dark:text-gray-100 dark:border-gray-800"
)}>
```

### Theme Hook Usage
```tsx
import { useThemeSync } from '@/lib/hooks/use-theme-sync';

const { theme } = useThemeSync();
// Use for conditional rendering when CSS alone isn't sufficient
```

## Accessibility

- **Decision**: Use `useReducedMotion` from Framer Motion for animation controls.
- **Rationale**: Users with vestibular disorders or motion sensitivity should have a smooth experience.
- **Implementation**: All animated components check `prefers-reduced-motion` and provide static alternatives.

```tsx
import { useReducedMotion } from 'framer-motion';

function PlanetNode() {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <StaticPlanet />;
  }
  return <AnimatedPlanet />;
}
```

## Browser Support

- **Decision**: Target modern evergreen browsers only.
- **Rationale**: Next.js 15 and React 19 already require modern browser features. The project uses CSS custom properties, CSS Grid, and modern JavaScript.

### Supported Browsers

| Browser | Minimum Version | Notes |
|---------|-----------------|-------|
| Chrome | 90+ | Primary development browser |
| Firefox | 90+ | Full support |
| Safari | 15+ | Required for CSS backdrop-filter |
| Edge | 90+ | Chromium-based |

### Required Features
- CSS Custom Properties (variables)
- CSS Grid and Flexbox
- CSS backdrop-filter (for glass effects)
- ES2020+ JavaScript
- Supabase Realtime (WebSocket support)

### Not Supported
- Internet Explorer (any version)
- Safari < 15 (missing backdrop-filter)
- Opera Mini (limited CSS support)
