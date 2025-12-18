# Node Details Panel - Responsive Design

## Overview

This document defines responsive breakpoints, layouts, and adaptive behaviors for the Node Details Panel across all device sizes. The design follows a mobile-first approach with progressive enhancement.

---

## Breakpoint System

Following existing Tailwind configuration:

```typescript
const breakpoints = {
  mobile: '0px - 767px',      // xs, sm
  tablet: '768px - 1023px',   // md
  desktop: '1024px - 1439px', // lg
  large: '1440px+',           // xl, 2xl
};
```

### Tailwind Prefixes

```css
/* Default: Mobile (no prefix) */
.class-name { /* 0-767px */ }

/* Tablet */
@media (min-width: 768px) {
  .md:class-name { /* 768px+ */ }
}

/* Desktop */
@media (min-width: 1024px) {
  .lg:class-name { /* 1024px+ */ }
}

/* Large Desktop */
@media (min-width: 1440px) {
  .xl:class-name { /* 1440px+ */ }
}
```

---

## Mobile Layout (0px - 767px)

### Viewport Configuration

```tsx
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
```

### Modal Container

```tsx
<div className={cn(
  // Full screen on mobile
  "fixed inset-0",
  "w-full h-full",
  "rounded-none", // No border radius
  "m-0 p-0"       // No margins/padding
)}>
```

**Dimensions**:
- Width: `100vw` (full viewport)
- Height: `100vh` (full viewport)
- Padding: Removed on container, applied to sections
- Border radius: `0` (sharp corners)

### Header

```tsx
<header className={cn(
  "px-4 py-3",          // Reduced padding
  "min-h-[64px]",       // Smaller header height
  "sticky top-0 z-10"
)}>
  <div className="flex items-center justify-between gap-2">
    {/* Node icon: smaller */}
    <Icon className="w-5 h-5" />

    {/* Title: truncated */}
    <h2 className="text-lg font-semibold truncate flex-1">
      {nodeLabel}
    </h2>

    {/* Status badge: icon only on small screens */}
    <StatusBadge compact />

    {/* Close button */}
    <button className="p-2">
      <X className="w-5 h-5" />
    </button>
  </div>

  {/* Subtitle: below title on mobile */}
  <p className="text-xs text-muted-foreground mt-1">
    {nodeType} · Stage {stageNumber}
  </p>
</header>
```

**Key Changes**:
- Smaller padding: `16px` (4) instead of `24px` (6)
- Smaller icons: `20px` instead of `24px`
- Title truncates with ellipsis if too long
- Subtitle moves below title (stacked)
- Status badge shows icon only (no text label)

### Tab Navigation

```tsx
<div className={cn(
  "flex overflow-x-auto",     // Horizontal scroll
  "border-b border-border",
  "px-4",                     // Match header padding
  "scrollbar-hide"            // Hide scrollbar
)}>
  <button className={cn(
    "flex-shrink-0",          // Don't shrink tabs
    "px-4 py-3",
    "text-sm whitespace-nowrap",
    "min-w-[80px]"            // Minimum width per tab
  )}>
    Input
  </button>
  {/* More tabs... */}
</div>
```

**Behavior**:
- Horizontal scroll if tabs overflow
- No scrollbar (hidden)
- Snap to tab on scroll (CSS scroll-snap)
- Touch-friendly tap targets (min 44px height)

### Content Area

```tsx
<div className={cn(
  "flex-1 overflow-auto",
  "p-4"                       // Mobile padding
)}>
  {/* Single column layout */}
  <div className="space-y-4">
    {/* Input Panel */}
    <JsonViewer data={inputData} />

    {/* Process Metrics */}
    <MetricsGrid {...metrics} />

    {/* Output Panel */}
    <JsonViewer data={outputData} />
  </div>
</div>
```

**Layout**:
- Single column: All panels stack vertically
- Spacing: `16px` (4) between panels
- Full width: Each panel uses 100% width
- No horizontal scrolling

### Footer (Refinement Chat)

```tsx
<footer className={cn(
  "sticky bottom-0 z-10",
  "bg-card border-t border-border",
  "p-4"
)}>
  <RefinementChat compact={true} />
</footer>
```

**Compact Mode**:
- Smaller chat history: `150px` instead of `250px`
- Smaller textarea: `60px` instead of `80px`
- Single column quick actions (stacked)

### Touch Targets

All interactive elements meet minimum size:

```css
/* Minimum touch target: 44x44px */
button, a, [role="button"] {
  min-height: 44px;
  min-width: 44px;
}
```

### Example Mobile Layout

```
┌─────────────────────────┐
│ [Icon] Title       [×]  │ ← Header (64px)
│ Stage 2 · Document      │
├─────────────────────────┤
│ Input  Process  Output  │ ← Tabs (scrollable)
├─────────────────────────┤
│                         │
│  INPUT PANEL            │
│  ┌───────────────────┐  │
│  │ JsonViewer        │  │
│  │                   │  │
│  └───────────────────┘  │
│                         │
│  PROCESS METRICS        │
│  ┌───────────────────┐  │
│  │ Duration: 245ms   │  │
│  │ Tokens: 1,240     │  │
│  └───────────────────┘  │
│                         │
│  OUTPUT PANEL           │
│  ┌───────────────────┐  │
│  │ JsonViewer        │  │
│  │                   │  │
│  └───────────────────┘  │
│                         │
├─────────────────────────┤
│ Refinement Chat         │ ← Footer (auto)
│ [Message input...]      │
└─────────────────────────┘
```

**Scroll Behavior**:
- Header: Sticky (always visible)
- Content: Scrolls vertically
- Footer: Sticky (always visible for AI stages)

---

## Tablet Layout (768px - 1023px)

### Modal Container

```tsx
<div className={cn(
  // Inset modal with rounded corners
  "fixed inset-0 flex items-center justify-center p-6",
  "md:p-8"  // More padding on tablet
)}>
  <div className={cn(
    "w-full h-[90vh] max-w-4xl", // Constrained width
    "rounded-xl",                 // Rounded corners
    "shadow-2xl"
  )}>
```

**Dimensions**:
- Width: `100%` up to `896px` (max-w-4xl)
- Height: `90vh` (leaves space for viewport)
- Padding: `32px` around modal
- Border radius: `12px` (rounded-xl)

### Header

```tsx
<header className={cn(
  "px-6 py-4",              // Standard padding
  "min-h-[72px]"            // Full header height
)}>
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <Icon className="w-6 h-6" />
      <div>
        <h2 className="text-xl font-semibold">
          {nodeLabel}
        </h2>
        <p className="text-sm text-muted-foreground">
          {nodeType} · Stage {stageNumber}
        </p>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <StatusBadge />  {/* Full badge with text */}
      <button className="p-2">
        <X className="w-5 h-5" />
      </button>
    </div>
  </div>
</header>
```

**Key Changes**:
- Horizontal layout (icon + text side-by-side)
- Full status badge with text
- Larger padding and spacing

### Tab Navigation

```tsx
<div className={cn(
  "flex gap-2",               // Horizontal tabs
  "border-b border-border",
  "px-6"
)}>
  <button className={cn(
    "px-4 py-3",
    "text-sm font-medium",
    "rounded-t-md"
  )}>
    Input
  </button>
  {/* More tabs... */}
</div>
```

**Behavior**:
- No scrolling (all tabs visible)
- Hover states enabled
- Active indicator below tab

### Content Area - 2-Column Layout

```tsx
<div className={cn(
  "grid md:grid-cols-2 gap-6",
  "p-6"
)}>
  {/* Left Column: Input + Process */}
  <div className="space-y-6">
    <JsonViewer
      title="Input Data"
      data={inputData}
      maxHeight="400px"
    />

    <MetricsGrid {...metrics} />
  </div>

  {/* Right Column: Output */}
  <div>
    <JsonViewer
      title="Output Data"
      data={outputData}
      maxHeight="600px"
    />
  </div>
</div>
```

**Layout**:
- 2 columns: 50/50 split
- Gap: `24px` (6) between columns
- Vertical spacing: `24px` (6) between stacked items

### Footer

```tsx
<footer className={cn(
  "sticky bottom-0 z-10",
  "border-t border-border",
  "p-6"
)}>
  <RefinementChat />  {/* Standard size */}
</footer>
```

### Example Tablet Layout

```
┌───────────────────────────────────────────────┐
│ [Icon] Title                      [Badge] [×] │ ← Header (72px)
│        Stage 2 · Document                     │
├───────────────────────────────────────────────┤
│ Input    Process    Output    Activity        │ ← Tabs
├───────────────────────────────────────────────┤
│                                               │
│  ┌─────────────────┬─────────────────────┐   │
│  │   INPUT         │      OUTPUT         │   │
│  │                 │                     │   │
│  │  JsonViewer     │    JsonViewer       │   │
│  │                 │                     │   │
│  └─────────────────┘                     │   │
│                                          │   │
│  ┌─────────────────┐                     │   │
│  │   PROCESS       │                     │   │
│  │                 │                     │   │
│  │  MetricsGrid    │                     │   │
│  │                 │                     │   │
│  └─────────────────┴─────────────────────┘   │
│                                               │
├───────────────────────────────────────────────┤
│ Refinement Chat                               │ ← Footer
└───────────────────────────────────────────────┘
```

**Scroll Behavior**:
- Each column scrolls independently if content overflows
- Header and footer remain sticky

---

## Desktop Layout (1024px - 1439px)

### Modal Container

```tsx
<div className={cn(
  "fixed inset-0 flex items-center justify-center p-12"
)}>
  <div className={cn(
    "w-full h-[90vh] max-w-6xl", // Larger max-width
    "rounded-xl shadow-2xl"
  )}>
```

**Dimensions**:
- Width: `100%` up to `1152px` (max-w-6xl)
- Height: `90vh`
- Padding: `48px` around modal

### Content Area - 3-Column Layout

```tsx
<div className={cn(
  "grid lg:grid-cols-3 gap-6",
  "p-6"
)}>
  {/* Column 1: Input */}
  <div>
    <JsonViewer
      title="Input Data"
      data={inputData}
      maxHeight="600px"
    />
  </div>

  {/* Column 2: Process */}
  <div>
    <MetricsGrid {...metrics} />

    {/* Activity log below metrics */}
    <ActivityPanel className="mt-6" />
  </div>

  {/* Column 3: Output */}
  <div>
    <JsonViewer
      title="Output Data"
      data={outputData}
      maxHeight="600px"
    />
  </div>
</div>
```

**Layout**:
- 3 equal columns: 33.33% / 33.33% / 33.33%
- Gap: `24px` (6) between columns
- All panels visible simultaneously

### Example Desktop Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [Icon] Title                                [Badge] [×]     │ ← Header
├─────────────────────────────────────────────────────────────┤
│ Input            Process          Output          Activity  │ ← Tabs
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┬─────────────┬─────────────┐               │
│  │   INPUT     │   PROCESS   │   OUTPUT    │               │
│  │             │             │             │               │
│  │ JsonViewer  │ MetricsGrid │ JsonViewer  │               │
│  │             │             │             │               │
│  │             │ ─────────── │             │               │
│  │             │             │             │               │
│  │             │ ActivityLog │             │               │
│  │             │             │             │               │
│  │             │             │             │               │
│  └─────────────┴─────────────┴─────────────┘               │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Refinement Chat                                             │ ← Footer
└─────────────────────────────────────────────────────────────┘
```

### Hover Effects

Desktop supports rich hover interactions:

```tsx
// Tab hover
<button className={cn(
  "hover:bg-muted/50",
  "hover:text-foreground",
  "transition-colors duration-150"
)}>

// JSON collapsible hover
<div className={cn(
  "hover:bg-secondary/20",
  "cursor-pointer",
  "transition-colors duration-100"
)}>

// Copy button hover
<button className={cn(
  "hover:bg-accent/10",
  "hover:text-accent",
  "transition-all duration-150"
)}>
```

---

## Large Desktop Layout (1440px+)

### Modal Container

```tsx
<div className={cn(
  "fixed inset-0 flex items-center justify-center p-16"
)}>
  <div className={cn(
    "w-full h-[90vh] max-w-7xl", // Even larger
    "rounded-xl shadow-2xl"
  )}>
```

**Dimensions**:
- Width: `100%` up to `1280px` (max-w-7xl) or `1536px` (max-w-screen-2xl)
- Height: `90vh`
- Padding: `64px` around modal

### Content Area

```tsx
<div className={cn(
  "grid xl:grid-cols-3 gap-8",  // Larger gap
  "p-8"                         // Larger padding
)}>
  {/* Same 3-column layout with more breathing room */}
</div>
```

**Layout**:
- 3 columns with more spacing: `32px` (8) gap
- Larger text sizes for readability
- More generous padding throughout

### Typography Scaling

```tsx
// Header title
<h2 className="text-xl lg:text-2xl font-semibold">

// Metric values
<div className="text-2xl lg:text-3xl font-semibold">

// JSON code
<pre className="text-sm lg:text-base">
```

---

## Responsive Component Behaviors

### AttemptSelector

**Mobile**:
```tsx
<div className="flex flex-col gap-2">
  <label className="text-sm">Attempt</label>
  <Select />
</div>
```

**Desktop**:
```tsx
<div className="flex items-center gap-3">
  <label className="text-sm">Attempt:</label>
  <Select />
</div>
```

### ApprovalControls

**Mobile**:
```tsx
<div className="flex flex-col gap-2">
  <Button className="w-full">Approve</Button>
  <Button className="w-full">Reject</Button>
</div>
```

**Desktop**:
```tsx
<div className="flex gap-2 justify-end">
  <Button>Reject</Button>
  <Button>Approve</Button>
</div>
```

### RefinementChat Quick Actions

**Mobile** (1-2 columns):
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
  {quickActions.map(action => (
    <button className="text-left">{action}</button>
  ))}
</div>
```

**Desktop** (3-4 columns):
```tsx
<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
  {quickActions.map(action => (
    <button>{action}</button>
  ))}
</div>
```

---

## Orientation Changes

### Portrait Mode (Mobile/Tablet)

Default layout as described above.

### Landscape Mode (Mobile)

```tsx
// Reduce header/footer height to maximize content
<header className={cn(
  "min-h-[56px]",  // Reduced from 64px
  "py-2"           // Less vertical padding
)}>

<footer className={cn(
  "py-3"           // Reduced padding
)}>
```

**Adjustments**:
- Smaller header/footer
- More horizontal space for content
- Chat history height reduced: `120px` instead of `150px`

---

## Adaptive Font Sizes

Using `clamp()` for fluid typography:

```css
/* Modal title */
.modal-title {
  font-size: clamp(1.125rem, 2vw, 1.5rem); /* 18px - 24px */
}

/* Metric values */
.metric-value {
  font-size: clamp(1.5rem, 3vw, 2.25rem); /* 24px - 36px */
}

/* JSON code */
.json-viewer-content {
  font-size: clamp(0.75rem, 1.5vw, 0.875rem); /* 12px - 14px */
}
```

---

## Container Queries (Future Enhancement)

For component-level responsiveness:

```css
/* When available in Tailwind CSS */
@container (min-width: 600px) {
  .json-viewer {
    grid-template-columns: auto 1fr;
  }
}

@container (min-width: 800px) {
  .metrics-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

---

## Responsive Images/Icons

```tsx
// Icon sizes adapt to screen size
<Icon className={cn(
  "w-5 h-5",        // Mobile
  "md:w-6 md:h-6",  // Tablet+
  "lg:w-7 lg:h-7"   // Desktop+
)} />

// Status badge icon
<div className={cn(
  "w-2 h-2",        // Mobile
  "md:w-2.5 md:h-2.5" // Desktop
)} />
```

---

## Scroll Management

### Prevent Body Scroll

When modal is open:

```typescript
useEffect(() => {
  if (isOpen) {
    // Prevent background scroll
    document.body.style.overflow = 'hidden';

    // Store scroll position
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      // Restore scroll
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }
}, [isOpen]);
```

### Smooth Scrolling

```css
/* Modal body scrolling */
.modal-body {
  scroll-behavior: smooth;
  overscroll-behavior: contain; /* Prevent scroll chaining */
}
```

### Scroll Shadows

Indicate scrollable content:

```tsx
const [showTopShadow, setShowTopShadow] = useState(false);
const [showBottomShadow, setShowBottomShadow] = useState(false);

const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
  setShowTopShadow(scrollTop > 0);
  setShowBottomShadow(scrollTop + clientHeight < scrollHeight - 10);
};

<div
  className={cn(
    "relative",
    showTopShadow && "before:absolute before:top-0 before:inset-x-0 before:h-8 before:bg-gradient-to-b before:from-background before:to-transparent before:z-10",
    showBottomShadow && "after:absolute after:bottom-0 after:inset-x-0 after:h-8 after:bg-gradient-to-t after:from-background after:to-transparent after:z-10"
  )}
  onScroll={handleScroll}
>
```

---

## Accessibility at Different Viewports

### Mobile

- Larger tap targets (min 44x44px)
- Simplified navigation (fewer options visible)
- One-handed reachability (close button in reach)
- Swipe gestures (swipe down to close)

### Tablet

- Hybrid touch/mouse support
- Larger interactive areas
- Hover states optional

### Desktop

- Full keyboard navigation
- Rich hover states
- Tooltips on hover
- Keyboard shortcuts displayed

---

## Testing Checklist

### Mobile (375px, 414px, 390px)

- [ ] Modal fills entire viewport
- [ ] All text readable without zoom
- [ ] Touch targets meet 44px minimum
- [ ] Tabs scroll horizontally if needed
- [ ] Header/footer sticky
- [ ] Content scrolls smoothly
- [ ] Keyboard pushes up footer (iOS)
- [ ] Safe area insets respected (notch)

### Tablet (768px, 820px, 1024px)

- [ ] 2-column layout displays correctly
- [ ] Modal centered with padding
- [ ] All tabs visible without scroll
- [ ] Hover states work (if mouse)
- [ ] Touch gestures work (if touch)
- [ ] Landscape mode optimized

### Desktop (1280px, 1440px, 1920px)

- [ ] 3-column layout displays correctly
- [ ] Maximum width enforced (1280px-1536px)
- [ ] All hover effects functional
- [ ] Keyboard navigation smooth
- [ ] Focus management correct
- [ ] No horizontal scroll

### Edge Cases

- [ ] Very small mobile (320px)
- [ ] Very large desktop (2560px+)
- [ ] Portrait orientation (mobile/tablet)
- [ ] Landscape orientation (mobile/tablet)
- [ ] Browser zoom 50%-200%
- [ ] Browser text size adjustments

---

## Performance Considerations

### Mobile

- Minimize animations (battery/performance)
- Lazy load off-screen content
- Smaller images/icons
- Reduce shadow complexity

### Tablet

- Balance animations and performance
- Progressive loading for large JSON
- Optimize touch event handlers

### Desktop

- Full animations enabled
- High-quality shadows
- Rich hover effects
- Parallax/3D effects (optional)

---

## Responsive Utilities

### Custom Hooks

```typescript
// useMediaQuery hook
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);

    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

// Usage
const isMobile = useMediaQuery('(max-width: 767px)');
const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
const isDesktop = useMediaQuery('(min-width: 1024px)');
```

### Viewport Detection

```typescript
// useViewport hook
function useViewport() {
  const [viewport, setViewport] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');

  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      if (width < 768) setViewport('mobile');
      else if (width < 1024) setViewport('tablet');
      else setViewport('desktop');
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  return viewport;
}
```

### Responsive Render

```typescript
// Conditional rendering based on viewport
const viewport = useViewport();

return (
  <>
    {viewport === 'mobile' && <MobileLayout />}
    {viewport === 'tablet' && <TabletLayout />}
    {viewport === 'desktop' && <DesktopLayout />}
  </>
);
```

---

## Future Enhancements

1. **Container Queries**: Use `@container` for component-level responsiveness
2. **View Transitions API**: Smooth transitions between layouts
3. **Foldable Devices**: Support for dual-screen and foldable devices
4. **Adaptive Icons**: SVG icons that adapt to viewport size
5. **Dynamic Text Scaling**: Adjust based on user preferences
