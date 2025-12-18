# Design Tokens: Celestial Mission Theme

**Feature**: Generation Progress Page Redesign
**Created**: 2025-11-27

This document defines the visual design tokens for the Celestial Mission theme, supporting both light and dark modes.

## Theme Philosophy

| Mode | Concept | Atmosphere |
|------|---------|------------|
| **Dark** | Deep Space | Dark cosmos with glowing planets, star-like accents |
| **Light** | Ethereal Sky | Soft cloud-like gradient with luminous orbs |

## CSS Variables (Add to globals.css)

### Dark Mode (Space Theme)

```css
.dark {
  /* Celestial backgrounds */
  --celestial-bg-primary: 222 47% 8%;      /* #0a0e1a - deep space */
  --celestial-bg-secondary: 222 47% 11%;   /* #111827 - slightly lighter */
  --celestial-bg-card: 217 33% 12%;        /* rgba(17, 24, 39, 0.8) */

  /* Trajectory line */
  --celestial-trajectory: 220 13% 26%;     /* #374151 */
  --celestial-trajectory-glow: 262 83% 58% / 0.3; /* Purple glow */

  /* Star field accent */
  --celestial-star: 0 0% 100% / 0.1;       /* White dots */
}
```

### Light Mode (Ethereal Theme)

```css
:root {
  /* Celestial backgrounds */
  --celestial-bg-primary: 220 20% 97%;     /* #f8fafc - soft white */
  --celestial-bg-secondary: 220 14% 96%;   /* #f1f5f9 - cloud gray */
  --celestial-bg-card: 0 0% 100%;          /* white */

  /* Trajectory line */
  --celestial-trajectory: 220 13% 85%;     /* #d1d5db - soft gray */
  --celestial-trajectory-glow: 262 83% 58% / 0.2; /* Lighter purple glow */

  /* Ambient accent */
  --celestial-star: 262 83% 58% / 0.05;    /* Faint purple dots */
}
```

## Stage Colors (Both Themes)

Stage colors remain consistent across themes for recognition, with adjusted opacity/glow for contrast.

| Stage | Name | Base Color (HSL) | Hex | Lucide Icon |
|-------|------|------------------|-----|-------------|
| 2 | Document Processing | `43 96% 56%` | `#f59e0b` | `FileText` |
| 3 | Summarization | `215 16% 65%` | `#94a3b8` | `Moon` |
| 4 | Analysis | `262 83% 58%` | `#8b5cf6` | `Orbit` |
| 5 | Structure Generation | `187 85% 43%` | `#06b6d4` | `Layers` |
| 6 | Content Generation | `160 84% 39%` | `#10b981` | `Globe` |

### CSS Variables for Stages

```css
:root, .dark {
  /* Stage base colors (same in both themes) */
  --stage-2-color: 43 96% 56%;     /* Amber */
  --stage-3-color: 215 16% 65%;    /* Silver */
  --stage-4-color: 262 83% 58%;    /* Purple */
  --stage-5-color: 187 85% 43%;    /* Cyan */
  --stage-6-color: 160 84% 39%;    /* Green */
}
```

## Status Colors

| Status | Light Mode | Dark Mode | Use Case |
|--------|------------|-----------|----------|
| **Pending** | `220 9% 70%` | `220 9% 40%` | Dimmed, not started |
| **Active** | `262 83% 58%` | `262 83% 58%` | Purple pulse |
| **Completed** | `160 84% 39%` | `160 84% 39%` | Green glow |
| **Error** | `0 84% 60%` | `0 84% 60%` | Red alert |
| **Awaiting** | `43 96% 56%` | `43 96% 56%` | Amber attention |

### CSS Variables for Status

```css
:root {
  --status-pending: 220 9% 70%;
  --status-pending-bg: 220 14% 96%;
}

.dark {
  --status-pending: 220 9% 40%;
  --status-pending-bg: 217 33% 17%;
}

:root, .dark {
  --status-active: 262 83% 58%;
  --status-completed: 160 84% 39%;
  --status-error: 0 84% 60%;
  --status-awaiting: 43 96% 56%;
}
```

## Glow Effects

### Dark Mode Glows

```css
.dark {
  --glow-active: 0 0 20px hsl(262 83% 58% / 0.4);
  --glow-completed: 0 0 15px hsl(160 84% 39% / 0.3);
  --glow-awaiting: 0 0 15px hsl(43 96% 56% / 0.4);
  --glow-error: 0 0 15px hsl(0 84% 60% / 0.4);
}
```

### Light Mode Glows (Softer)

```css
:root {
  --glow-active: 0 0 12px hsl(262 83% 58% / 0.25);
  --glow-completed: 0 0 10px hsl(160 84% 39% / 0.2);
  --glow-awaiting: 0 0 10px hsl(43 96% 56% / 0.25);
  --glow-error: 0 0 10px hsl(0 84% 60% / 0.25);
}
```

## Background Gradients

### SpaceBackground Component

```tsx
// Dark mode: Deep space gradient
const darkGradient = `
  radial-gradient(ellipse at top, hsl(262 83% 58% / 0.1), transparent 50%),
  radial-gradient(ellipse at bottom, hsl(187 85% 43% / 0.05), transparent 50%),
  linear-gradient(to bottom, hsl(222 47% 8%), hsl(222 47% 11%))
`;

// Light mode: Ethereal sky gradient
const lightGradient = `
  radial-gradient(ellipse at top, hsl(262 83% 58% / 0.05), transparent 50%),
  radial-gradient(ellipse at bottom, hsl(187 85% 43% / 0.03), transparent 50%),
  linear-gradient(to bottom, hsl(220 20% 97%), hsl(220 14% 96%))
`;
```

## Animation Variants (Framer Motion)

### Planet Entrance (Staggered)

```typescript
export const planetVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => ({
    scale: 1,
    opacity: 1,
    transition: {
      delay: i * 0.15,
      type: 'spring',
      stiffness: 200,
      damping: 20
    }
  })
};
```

### Active Planet Pulse

```typescript
export const pulseVariants = {
  pulse: {
    scale: [1, 1.05, 1],
    boxShadow: [
      '0 0 0 0 hsl(var(--status-active) / 0.4)',
      '0 0 0 20px hsl(var(--status-active) / 0)',
      '0 0 0 0 hsl(var(--status-active) / 0)'
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut'
    }
  }
};
```

### Trajectory Line Animation

```typescript
export const trajectoryVariants = {
  animate: {
    strokeDashoffset: [0, -20],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear'
    }
  }
};
```

### Stage Completion Burst

```typescript
export const completionVariants = {
  initial: { scale: 1, filter: 'brightness(1)' },
  complete: {
    scale: [1, 1.3, 1],
    filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1)'],
    transition: { duration: 0.5 }
  }
};
```

### Reduced Motion Support

```typescript
export const getMotionProps = (prefersReducedMotion: boolean) => {
  if (prefersReducedMotion) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      transition: { duration: 0 }
    };
  }
  return planetVariants;
};

// Usage with hook
import { useReducedMotion } from 'framer-motion';

function PlanetNode() {
  const prefersReducedMotion = useReducedMotion();
  // Apply reduced motion variants when needed
}
```

## Typography

Use existing design system tokens:

```tsx
// Headers
<h1 className="text-2xl font-semibold text-foreground">Mission Progress</h1>

// Stage names
<span className="text-sm font-medium text-foreground">Document Processing</span>

// Metrics
<span className="text-xs text-muted-foreground">1.2k tokens</span>

// Status badges
<Badge className="text-xs font-medium">Active</Badge>
```

## Component Color Mapping

### PlanetNode States

```tsx
const planetStateClasses = {
  pending: 'border-muted bg-muted/20 text-muted-foreground',
  active: 'border-[hsl(var(--status-active))] bg-[hsl(var(--status-active)/0.1)] text-[hsl(var(--status-active))]',
  completed: 'border-[hsl(var(--status-completed))] bg-[hsl(var(--status-completed)/0.1)] text-[hsl(var(--status-completed))]',
  error: 'border-destructive bg-destructive/10 text-destructive',
  awaiting: 'border-[hsl(var(--status-awaiting))] bg-[hsl(var(--status-awaiting)/0.1)] text-[hsl(var(--status-awaiting))]'
};
```

### MissionControlBanner

```tsx
// Light mode: soft amber background
// Dark mode: amber with dark overlay
const bannerClasses = cn(
  'fixed bottom-0 left-0 right-0 p-4 border-t z-40',
  'bg-amber-50/90 border-amber-200',
  'dark:bg-amber-900/30 dark:border-amber-800',
  'backdrop-blur-sm'
);
```

## Accessibility Requirements

### Contrast Ratios (WCAG AA)

| Element | Light Mode | Dark Mode | Min Ratio |
|---------|------------|-----------|-----------|
| Stage name on bg | #111827 on #f8fafc | #f8fafc on #0a0e1a | 4.5:1 |
| Active status | #8b5cf6 on white | #8b5cf6 on #111827 | 4.5:1 |
| Error text | #ef4444 on white | #ef4444 on #111827 | 4.5:1 |

### Focus States

```css
/* Use existing ring token */
.planet-node:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

### Screen Reader Labels

```tsx
<div
  role="progressbar"
  aria-valuenow={73}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label="Stage 4 Analysis progress: 73%"
>
```

## Testing States Checklist

Verify these states render correctly in both themes:

1. **pending** - All planets gray/dimmed
2. **processing_documents** - Stage 2 active (purple pulse)
3. **stage_2_awaiting_approval** - Stage 2 amber glow + Mission Control banner
4. **analyzing_task** - Stage 4 active
5. **stage_4_awaiting_approval** - Stages 2-4 complete/awaiting
6. **generating_content** - Stage 6 active
7. **completed** - All planets green
8. **failed** - Error state (red) on failed stage
