# Node Details Panel - Animations & Motion Design

## Overview

This document defines all animations and motion design for the Node Details Panel. Animations enhance user experience through visual feedback, smooth transitions, and delightful micro-interactions while maintaining performance and accessibility.

---

## Animation Principles

### Design Philosophy

1. **Purposeful**: Every animation serves a functional purpose
2. **Fast**: Animations feel instant (100-300ms for most interactions)
3. **Smooth**: Use easing functions for natural motion (cubic-bezier)
4. **Subtle**: Avoid distracting users from content
5. **Performant**: GPU-accelerated transforms and opacity changes
6. **Accessible**: Respect `prefers-reduced-motion` system preference

### Performance Guidelines

**Prefer animating**:
- `transform` (translate, scale, rotate)
- `opacity`

**Avoid animating**:
- `width`, `height` (causes layout recalculation)
- `margin`, `padding` (causes layout recalculation)
- `color` (acceptable but less performant)

---

## Modal Open/Close Animations

### Modal Overlay (Backdrop)

**Fade In** (200ms):
```typescript
const overlayVariants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
};
```

**Implementation (Framer Motion)**:
```tsx
<motion.div
  className="modal-overlay"
  variants={overlayVariants}
  initial="hidden"
  animate="visible"
  exit="hidden"
>
  {/* Overlay content */}
</motion.div>
```

**CSS Alternative**:
```css
@keyframes modal-overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-overlay {
  animation: modal-overlay-in 200ms ease-out;
}

.modal-overlay[data-state="closed"] {
  animation: modal-overlay-out 150ms ease-in;
}

@keyframes modal-overlay-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
```

---

### Modal Content

**Fade + Scale + Slide In** (200ms):
```typescript
const contentVariants = {
  hidden: {
    opacity: 0,
    scale: 0.96,
    y: 10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.16, 1, 0.3, 1], // Custom easing for smooth entry
    },
  },
};
```

**Implementation**:
```tsx
<motion.div
  className="modal-content"
  variants={contentVariants}
  initial="hidden"
  animate="visible"
  exit="hidden"
>
  {/* Modal content */}
</motion.div>
```

**CSS Alternative**:
```css
@keyframes modal-content-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-content {
  animation: modal-content-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

**Exit Animation** (150ms - faster for responsiveness):
```typescript
exit: {
  opacity: 0,
  scale: 0.96,
  y: 10,
  transition: {
    duration: 0.15,
    ease: 'easeIn',
  },
}
```

---

## Tab Switching Animations

### Tab Content Transition

**Fade + Slide** (100ms):
```typescript
const tabContentVariants = {
  hidden: {
    opacity: 0,
    x: -10, // Slide from left
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.1,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    x: 10, // Slide to right
    transition: {
      duration: 0.1,
      ease: 'easeIn',
    },
  },
};
```

**Implementation**:
```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    variants={tabContentVariants}
    initial="hidden"
    animate="visible"
    exit="exit"
  >
    {tabContent}
  </motion.div>
</AnimatePresence>
```

**CSS Alternative**:
```css
@keyframes tab-fade-in {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.tab-content {
  animation: tab-fade-in 100ms ease-out;
}
```

---

### Tab Button Active Indicator

**Slide + Expand** (150ms):
```typescript
const activeIndicatorVariants = {
  inactive: {
    scaleX: 0,
    opacity: 0,
  },
  active: {
    scaleX: 1,
    opacity: 1,
    transition: {
      duration: 0.15,
      ease: 'easeOut',
    },
  },
};
```

**Implementation**:
```tsx
<button className="tab-button">
  Tab Name
  <motion.div
    className="active-indicator"
    variants={activeIndicatorVariants}
    initial="inactive"
    animate={isActive ? 'active' : 'inactive'}
  />
</button>
```

**CSS Alternative** (Using `::after` pseudo-element):
```css
.tab-button::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: hsl(var(--modal-accent));
  transform: scaleX(0);
  transition: transform 150ms ease-out;
}

.tab-button[data-state="active"]::after {
  transform: scaleX(1);
}
```

---

## JSON Viewer Animations

### Collapsible Section Expand/Collapse

**Rotate Icon** (150ms):
```typescript
const chevronVariants = {
  collapsed: {
    rotate: 0,
  },
  expanded: {
    rotate: 90,
    transition: {
      duration: 0.15,
      ease: 'easeOut',
    },
  },
};
```

**Implementation**:
```tsx
<motion.div
  variants={chevronVariants}
  animate={isExpanded ? 'expanded' : 'collapsed'}
>
  <ChevronRight className="w-4 h-4" />
</motion.div>
```

**Height Animation** (200ms):
```typescript
const contentVariants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.2, ease: 'easeInOut' },
      opacity: { duration: 0.1, ease: 'easeIn' },
    },
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: {
      height: { duration: 0.2, ease: 'easeInOut' },
      opacity: { duration: 0.15, ease: 'easeOut', delay: 0.05 },
    },
  },
};
```

**Implementation**:
```tsx
<motion.div
  variants={contentVariants}
  initial={isExpanded ? 'expanded' : 'collapsed'}
  animate={isExpanded ? 'expanded' : 'collapsed'}
  style={{ overflow: 'hidden' }}
>
  {/* Nested JSON content */}
</motion.div>
```

**CSS Alternative** (Using `details` element):
```css
details summary {
  cursor: pointer;
}

details summary::before {
  content: '▶';
  display: inline-block;
  transition: transform 150ms ease-out;
}

details[open] summary::before {
  transform: rotate(90deg);
}

details > div {
  animation: expand 200ms ease-out;
}

@keyframes expand {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

### Copy to Clipboard Feedback

**Button Scale + Feedback** (300ms total):
```typescript
const copyButtonVariants = {
  idle: {
    scale: 1,
  },
  pressed: {
    scale: 0.95,
    transition: {
      duration: 0.1,
      ease: 'easeOut',
    },
  },
  success: {
    scale: 1,
    transition: {
      duration: 0.2,
      ease: [0.34, 1.56, 0.64, 1], // Bounce easing
    },
  },
};
```

**Implementation**:
```tsx
const [copyState, setCopyState] = useState<'idle' | 'pressed' | 'success'>('idle');

const handleCopy = async () => {
  setCopyState('pressed');
  await navigator.clipboard.writeText(jsonString);

  setTimeout(() => setCopyState('success'), 100);
  setTimeout(() => setCopyState('idle'), 2000);
};

<motion.button
  variants={copyButtonVariants}
  animate={copyState}
  onClick={handleCopy}
>
  {copyState === 'success' ? <Check /> : <Copy />}
</motion.button>
```

**Feedback Toast** (appears for 2s):
```typescript
const feedbackVariants = {
  hidden: {
    opacity: 0,
    y: -10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
};
```

```tsx
<AnimatePresence>
  {copyState === 'success' && (
    <motion.div
      className="json-copy-feedback"
      variants={feedbackVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
    >
      Copied!
    </motion.div>
  )}
</AnimatePresence>
```

---

## Status Badge Animations

### Pulse Animation (for running/pending states)

**Continuous Pulse** (2s loop):
```typescript
const statusDotVariants = {
  running: {
    scale: [1, 1.2, 1],
    opacity: [1, 0.5, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
  completed: {
    scale: 1,
    opacity: 1,
  },
};
```

**Implementation**:
```tsx
<motion.div
  className="status-badge-dot"
  variants={statusDotVariants}
  animate={status === 'running' ? 'running' : 'completed'}
/>
```

**CSS Alternative**:
```css
@keyframes status-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
}

.status-badge-dot[data-status="running"] {
  animation: status-pulse 2s ease-in-out infinite;
}
```

---

## Hover Micro-Interactions

### Button Hover (Desktop)

**Lift + Shadow** (150ms):
```typescript
const buttonVariants = {
  rest: {
    scale: 1,
    y: 0,
  },
  hover: {
    scale: 1.02,
    y: -1,
    transition: {
      duration: 0.15,
      ease: 'easeOut',
    },
  },
  pressed: {
    scale: 0.98,
    y: 0,
    transition: {
      duration: 0.1,
      ease: 'easeIn',
    },
  },
};
```

**Implementation**:
```tsx
<motion.button
  variants={buttonVariants}
  initial="rest"
  whileHover="hover"
  whileTap="pressed"
>
  Button Text
</motion.button>
```

**CSS Alternative**:
```css
.btn-interactive {
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-interactive:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn-interactive:active:not(:disabled) {
  transform: scale(0.98);
}
```

---

### Card Hover (Desktop)

**Subtle Lift** (200ms):
```css
.metric-cell,
.json-viewer {
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.metric-cell:hover,
.json-viewer:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
}

.dark .metric-cell:hover,
.dark .json-viewer:hover {
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}
```

---

## Loading States

### Skeleton Shimmer

**Shimmer Animation** (2s loop):
```typescript
const shimmerVariants = {
  initial: {
    backgroundPosition: '-200% 0',
  },
  animate: {
    backgroundPosition: '200% 0',
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};
```

**Implementation**:
```tsx
<motion.div
  className="skeleton"
  variants={shimmerVariants}
  initial="initial"
  animate="animate"
  style={{
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
    backgroundSize: '200% 100%',
  }}
/>
```

**CSS Alternative**:
```css
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.2) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}

.dark .skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0) 100%
  );
}
```

---

### Spinner (for processing states)

**Rotate Animation** (800ms loop):
```typescript
const spinnerVariants = {
  animate: {
    rotate: 360,
    transition: {
      duration: 0.8,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};
```

**Implementation**:
```tsx
<motion.div
  variants={spinnerVariants}
  animate="animate"
>
  <Loader2 className="w-5 h-5" />
</motion.div>
```

**CSS Alternative**:
```css
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinner {
  animation: spin 800ms linear infinite;
}
```

---

## Staggered Animations

### Metrics Grid Entrance

**Stagger Children** (50ms delay between items):
```typescript
const gridContainerVariants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const gridItemVariants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
};
```

**Implementation**:
```tsx
<motion.div
  className="metrics-grid"
  variants={gridContainerVariants}
  initial="hidden"
  animate="visible"
>
  {metrics.map((metric, i) => (
    <motion.div
      key={i}
      className="metric-cell"
      variants={gridItemVariants}
    >
      {/* Metric content */}
    </motion.div>
  ))}
</motion.div>
```

---

### JSON Lines Entrance

**Stagger Lines** (10ms delay for smooth scroll):
```typescript
const jsonContainerVariants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.01,
      delayChildren: 0.1,
    },
  },
};

const jsonLineVariants = {
  hidden: {
    opacity: 0,
    x: -5,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.15,
      ease: 'easeOut',
    },
  },
};
```

---

## Scroll-Based Animations

### Scroll Indicator Fade

**Auto-hide after scroll** (300ms):
```typescript
const [showScrollIndicator, setShowScrollIndicator] = useState(true);

useEffect(() => {
  const handleScroll = () => {
    if (window.scrollY > 50) {
      setShowScrollIndicator(false);
    } else {
      setShowScrollIndicator(true);
    }
  };

  window.addEventListener('scroll', handleScroll);
  return () => window.removeEventListener('scroll', handleScroll);
}, []);

<motion.div
  animate={{ opacity: showScrollIndicator ? 1 : 0 }}
  transition={{ duration: 0.3 }}
>
  <ChevronDown className="scroll-indicator" />
</motion.div>
```

---

### Scroll Shadow Appearance

**Gradient Fade In/Out** (200ms):
```css
.modal-body::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  background: linear-gradient(to bottom, hsl(var(--modal-bg-primary)), transparent);
  opacity: 0;
  transition: opacity 200ms ease-out;
  pointer-events: none;
  z-index: 10;
}

.modal-body[data-scrolled="true"]::before {
  opacity: 1;
}
```

---

## Focus Animations

### Focus Ring Expansion

**Outline + Scale** (150ms):
```css
*:focus-visible {
  outline: 2px solid hsl(var(--modal-accent));
  outline-offset: 2px;
  transition: outline-offset 150ms ease-out;
}

*:focus-visible:active {
  outline-offset: 0;
}
```

**Ring Glow** (for important CTAs):
```css
.btn-primary:focus-visible {
  box-shadow:
    0 0 0 4px hsla(var(--modal-accent), 0.2),
    0 0 0 2px hsl(var(--modal-accent));
  transition: box-shadow 150ms ease-out;
}
```

---

## Gesture Animations (Mobile)

### Swipe to Close Modal

**Drag + Threshold** (300ms snap back):
```typescript
const [dragY, setDragY] = useState(0);

<motion.div
  drag="y"
  dragConstraints={{ top: 0, bottom: 300 }}
  dragElastic={0.2}
  onDragEnd={(e, info) => {
    if (info.offset.y > 150) {
      // Close modal
      onClose();
    } else {
      // Snap back
      setDragY(0);
    }
  }}
  animate={{ y: dragY }}
  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
>
  {/* Modal content */}
</motion.div>
```

---

### Pull-to-Refresh Indicator

**Stretch + Release** (200ms):
```typescript
const [pullDistance, setPullDistance] = useState(0);

<motion.div
  style={{
    transform: `translateY(${Math.min(pullDistance, 80)}px)`,
  }}
  transition={{ type: 'spring', damping: 20, stiffness: 300 }}
>
  {/* Content */}
</motion.div>
```

---

## Orchestrated Sequences

### Modal Open Sequence

**Header → Tabs → Content** (staggered entrance):
```typescript
const modalSequenceVariants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

<motion.div variants={modalSequenceVariants} initial="hidden" animate="visible">
  <motion.header variants={itemVariants}>Header</motion.header>
  <motion.nav variants={itemVariants}>Tabs</motion.nav>
  <motion.div variants={itemVariants}>Content</motion.div>
</motion.div>
```

---

## Performance Optimization

### GPU Acceleration

```css
.modal-content,
.tab-content,
.json-collapsible-icon,
.status-badge-dot {
  will-change: transform, opacity;
}

/* Remove after animation completes */
.modal-content[data-animated="true"] {
  will-change: auto;
}
```

### Debounce Animations

```typescript
// Debounce rapid state changes
const debouncedAnimate = useMemo(
  () => debounce((value) => setAnimateValue(value), 50),
  []
);
```

### Conditional Rendering

```typescript
// Only animate on desktop (better performance)
const shouldAnimate = useMediaQuery('(min-width: 1024px)');

<motion.div
  animate={shouldAnimate ? animationVariants : undefined}
>
```

---

## Reduced Motion Support

### System Preference Detection

```typescript
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

const variants = prefersReducedMotion
  ? {
      // Instant transitions
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { duration: 0.01 } },
    }
  : {
      // Full animations
      hidden: { opacity: 0, scale: 0.96, y: 10 },
      visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { duration: 0.2 },
      },
    };
```

### CSS Alternative

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Animation Timing Reference

| Action | Duration | Easing | Purpose |
|--------|----------|--------|---------|
| Modal Open | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Smooth entrance |
| Modal Close | 150ms | `ease-in` | Quick exit |
| Tab Switch | 100ms | `ease-out` | Instant feedback |
| Hover | 150ms | `ease-out` | Responsive feel |
| Button Press | 100ms | `ease-in` | Tactile feedback |
| Collapsible | 200ms | `ease-in-out` | Natural expand/collapse |
| Status Pulse | 2000ms | `ease-in-out` (loop) | Attention draw |
| Shimmer | 2000ms | `linear` (loop) | Loading indicator |
| Spinner | 800ms | `linear` (loop) | Processing state |

---

## Framer Motion Configuration

### AnimatePresence Setup

```tsx
import { AnimatePresence } from 'framer-motion';

<AnimatePresence mode="wait">
  {isOpen && (
    <motion.div
      key="modal"
      variants={modalVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
    >
      {/* Modal content */}
    </motion.div>
  )}
</AnimatePresence>
```

### Layout Animations

```tsx
// Automatic layout animations
<motion.div layout>
  {/* Content that changes size */}
</motion.div>

// With transition config
<motion.div
  layout
  transition={{
    layout: { duration: 0.2, ease: 'easeOut' },
  }}
>
```

---

## Testing Animations

### Performance Metrics

```javascript
// Monitor frame rate
let lastTime = performance.now();
let frames = 0;

function measureFPS() {
  frames++;
  const currentTime = performance.now();

  if (currentTime >= lastTime + 1000) {
    const fps = Math.round((frames * 1000) / (currentTime - lastTime));
    console.log(`FPS: ${fps}`);

    frames = 0;
    lastTime = currentTime;
  }

  requestAnimationFrame(measureFPS);
}

measureFPS();
```

### Animation Checklist

- [ ] Modal opens smoothly (200ms)
- [ ] Modal closes quickly (150ms)
- [ ] Tabs switch instantly (<100ms)
- [ ] Hover effects feel responsive (150ms)
- [ ] Collapsible sections expand naturally (200ms)
- [ ] Status badges pulse smoothly (2s loop)
- [ ] Copy feedback appears and dismisses (2s total)
- [ ] Staggered animations don't feel jarring (50ms stagger)
- [ ] Reduced motion disables all animations
- [ ] Animations maintain 60fps on target devices

---

## Browser Compatibility

### Framer Motion Support

- Chrome/Edge: 88+
- Firefox: 78+
- Safari: 14+
- Mobile Safari: 14+

### CSS Animations Support

- All modern browsers (100% support for `@keyframes`)
- IE11: Supported (if needed)
- Prefixes not required (autoprefixer handles)

---

## Example Complete Implementation

```tsx
import { motion, AnimatePresence } from 'framer-motion';

export const NodeDetailsModal = ({ isOpen, onClose }) => {
  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.2 } },
  };

  const contentVariants = {
    hidden: { opacity: 0, scale: 0.96, y: 10 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
    },
  };

  const sequenceVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2, ease: 'easeOut' },
    },
  };

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          <motion.div
            className="modal-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
          />

          <motion.div
            className="modal-content"
            variants={contentVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <motion.div
              variants={sequenceVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.header variants={itemVariants}>
                {/* Header content */}
              </motion.header>

              <motion.nav variants={itemVariants}>
                {/* Tab navigation */}
              </motion.nav>

              <motion.div variants={itemVariants}>
                {/* Tab content */}
              </motion.div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
```

---

## Future Enhancements

1. **View Transitions API**: Native browser transitions (Chrome 111+)
2. **Spring Physics**: More natural motion with configurable spring physics
3. **Gesture Recognition**: Advanced swipe/pinch gestures
4. **Parallax Effects**: Depth and layering on scroll (desktop only)
5. **Morphing Transitions**: Smooth shape transitions between states
6. **3D Transforms**: Perspective and rotation effects (optional, desktop)
