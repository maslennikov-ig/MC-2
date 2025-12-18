# Node Details Panel - Styles & CSS Variables

## Overview

This document defines the complete styling system for the Node Details Panel, including CSS variables, Tailwind classes, theme tokens, and responsive design patterns. All styles follow the existing design system in `globals.css` and extend it for modal-specific needs.

---

## CSS Variables

### Modal-Specific Variables

Add to `packages/web/app/globals.css`:

```css
@layer base {
  :root {
    /* ===== NODE DETAILS MODAL COLORS (LIGHT THEME) ===== */

    /* Background colors */
    --modal-bg-primary: 0 0% 100%;              /* #FFFFFF - Main modal background */
    --modal-bg-secondary: 220 14% 98%;          /* #F9FAFB - Secondary panels */
    --modal-bg-tertiary: 220 13% 97%;           /* #F3F4F6 - Code backgrounds */

    /* Border colors */
    --modal-border: 220 13% 91%;                /* #E5E7EB - Borders */
    --modal-border-subtle: 220 13% 95%;         /* #F3F4F6 - Subtle borders */

    /* Text colors */
    --modal-text-primary: 222 47% 11%;          /* #111827 - Main text */
    --modal-text-secondary: 215 16% 47%;        /* #6B7280 - Secondary text */
    --modal-text-tertiary: 220 9% 46%;          /* #9CA3AF - Tertiary text */

    /* Accent colors */
    --modal-accent: 217 91% 60%;                /* #3B82F6 - Links, active states */
    --modal-accent-hover: 217 91% 50%;          /* Darker blue on hover */

    /* JSON Syntax Highlighting (Light) */
    --json-bg: 220 13% 97%;                     /* #F3F4F6 */
    --json-text: 222 47% 11%;                   /* #111827 */
    --json-keyword: 217 91% 35%;                /* #0451a5 - Object keys */
    --json-string: 142 76% 32%;                 /* #0a8200 - String values */
    --json-number: 173 58% 39%;                 /* #098658 - Numbers */
    --json-boolean: 217 91% 50%;                /* #0000ff - Booleans */
    --json-null: 220 9% 46%;                    /* #808080 - Null values */
    --json-bracket: 217 91% 50%;                /* #0000ff - Brackets */
    --json-line-number: 220 9% 60%;             /* Line numbers */

    /* Status colors (extend existing) */
    --status-pending: 220 13% 91%;              /* Gray */
    --status-running: 217 91% 60%;              /* Blue */
    --status-completed: 160 84% 39%;            /* Green */
    --status-error: 0 84% 60%;                  /* Red */
    --status-awaiting: 43 96% 56%;              /* Yellow */
  }

  .dark {
    /* ===== NODE DETAILS MODAL COLORS (DARK THEME) ===== */

    /* Background colors */
    --modal-bg-primary: 222 47% 11%;            /* #1F2937 - Main modal background */
    --modal-bg-secondary: 220 26% 14%;          /* #111827 - Secondary panels */
    --modal-bg-tertiary: 215 28% 17%;           /* #374151 - Code backgrounds */

    /* Border colors */
    --modal-border: 215 28% 17%;                /* #374151 - Borders */
    --modal-border-subtle: 217 33% 20%;         /* Subtle borders */

    /* Text colors */
    --modal-text-primary: 210 40% 98%;          /* #F9FAFB - Main text */
    --modal-text-secondary: 220 9% 60%;         /* #9CA3AF - Secondary text */
    --modal-text-tertiary: 215 16% 47%;         /* #6B7280 - Tertiary text */

    /* Accent colors */
    --modal-accent: 213 94% 68%;                /* #60A5FA - Links, active states */
    --modal-accent-hover: 217 91% 60%;          /* Lighter blue on hover */

    /* JSON Syntax Highlighting (Dark) */
    --json-bg: 215 28% 17%;                     /* #374151 */
    --json-text: 210 40% 98%;                   /* #F9FAFB */
    --json-keyword: 199 89% 64%;                /* #4fc1ff - Object keys */
    --json-string: 142 52% 63%;                 /* #6cd38a - String values */
    --json-number: 166 44% 60%;                 /* #4ec9b0 - Numbers */
    --json-boolean: 213 94% 68%;                /* #569cd6 - Booleans */
    --json-null: 220 9% 60%;                    /* #9ca3af - Null values */
    --json-bracket: 213 94% 68%;                /* #60a5fa - Brackets */
    --json-line-number: 220 9% 46%;             /* Line numbers */

    /* Status colors (dark mode adjusted) */
    --status-pending: 215 28% 25%;              /* Darker gray */
    --status-running: 213 94% 68%;              /* Light blue */
    --status-completed: 160 84% 45%;            /* Lighter green */
    --status-error: 0 72% 51%;                  /* Lighter red */
    --status-awaiting: 43 96% 60%;              /* Lighter yellow */
  }
}
```

---

## Modal Container Styles

### Base Modal Classes

```css
@layer components {
  /* ===== MODAL OVERLAY ===== */
  .modal-overlay {
    @apply fixed inset-0 z-[1040] bg-black/60;
    backdrop-filter: blur(4px);
    animation: modal-overlay-in 200ms ease-out;
  }

  .modal-overlay[data-state="closed"] {
    animation: modal-overlay-out 150ms ease-in;
  }

  /* ===== MODAL CONTAINER ===== */
  .modal-container {
    @apply fixed inset-0 z-[1055] overflow-hidden;
    @apply flex items-center justify-center p-4;
  }

  .modal-content {
    @apply relative w-full h-[90vh] max-w-[1600px];
    @apply bg-[hsl(var(--modal-bg-primary))];
    @apply border border-[hsl(var(--modal-border))];
    @apply rounded-xl shadow-2xl;
    @apply flex flex-col;
    animation: modal-content-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .modal-content[data-state="closed"] {
    animation: modal-content-out 150ms cubic-bezier(0.4, 0, 1, 1);
  }

  /* Mobile: Full screen */
  @media (max-width: 768px) {
    .modal-content {
      @apply h-full max-w-full rounded-none;
      @apply inset-0 m-0 p-0;
    }
  }

  /* ===== MODAL HEADER ===== */
  .modal-header {
    @apply flex items-center justify-between;
    @apply px-6 py-4 border-b border-[hsl(var(--modal-border))];
    @apply bg-[hsl(var(--modal-bg-primary))];
    @apply sticky top-0 z-10;
    min-height: 72px;
  }

  .modal-header-left {
    @apply flex items-center gap-3;
  }

  .modal-header-text {
    @apply flex flex-col gap-1;
  }

  .modal-title {
    @apply text-xl font-semibold text-[hsl(var(--modal-text-primary))];
    @apply leading-tight;
  }

  .modal-subtitle {
    @apply text-sm text-[hsl(var(--modal-text-secondary))];
  }

  .modal-header-right {
    @apply flex items-center gap-2;
  }

  /* ===== MODAL BODY ===== */
  .modal-body {
    @apply flex-1 overflow-auto;
    @apply p-6;
  }

  /* Custom scrollbar for modal */
  .modal-body::-webkit-scrollbar {
    width: 10px;
  }

  .modal-body::-webkit-scrollbar-track {
    background: hsl(var(--modal-bg-secondary));
    border-radius: 10px;
  }

  .modal-body::-webkit-scrollbar-thumb {
    background: hsl(var(--modal-border));
    border-radius: 10px;
    border: 2px solid hsl(var(--modal-bg-secondary));
  }

  .modal-body::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--modal-accent));
  }

  /* ===== MODAL FOOTER ===== */
  .modal-footer {
    @apply border-t border-[hsl(var(--modal-border))];
    @apply bg-[hsl(var(--modal-bg-secondary))];
    @apply p-6;
    @apply sticky bottom-0 z-10;
  }
}
```

---

## Tab Navigation Styles

```css
@layer components {
  /* ===== TAB NAVIGATION ===== */
  .tab-navigation {
    @apply flex gap-2 mb-6;
    @apply border-b border-[hsl(var(--modal-border))];
  }

  /* Desktop: Horizontal tabs */
  @media (min-width: 768px) {
    .tab-navigation {
      @apply flex-row;
    }
  }

  /* Mobile: Vertical tabs */
  @media (max-width: 767px) {
    .tab-navigation {
      @apply flex-col border-b-0;
    }
  }

  /* ===== TAB BUTTON ===== */
  .tab-button {
    @apply relative px-4 py-3 text-sm font-medium;
    @apply text-[hsl(var(--modal-text-secondary))];
    @apply transition-all duration-150;
    @apply rounded-t-md;
    @apply hover:text-[hsl(var(--modal-text-primary))];
    @apply hover:bg-[hsl(var(--modal-bg-secondary))];
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--modal-accent))];
  }

  .tab-button[data-state="active"] {
    @apply text-[hsl(var(--modal-accent))];
    @apply bg-[hsl(var(--modal-bg-primary))];
    @apply font-semibold;
  }

  /* Active indicator (bottom border) */
  .tab-button[data-state="active"]::after {
    content: '';
    @apply absolute bottom-0 left-0 right-0;
    @apply h-0.5 bg-[hsl(var(--modal-accent))];
  }

  /* Badge on tab (for counts) */
  .tab-badge {
    @apply inline-flex items-center justify-center;
    @apply ml-2 px-2 py-0.5;
    @apply text-xs font-medium;
    @apply bg-[hsl(var(--modal-bg-tertiary))];
    @apply text-[hsl(var(--modal-text-secondary))];
    @apply rounded-full;
  }

  .tab-button[data-state="active"] .tab-badge {
    @apply bg-[hsl(var(--modal-accent)/0.1)];
    @apply text-[hsl(var(--modal-accent))];
  }

  /* ===== TAB CONTENT ===== */
  .tab-content {
    @apply animate-tab-fade-in;
  }

  .tab-content[hidden] {
    @apply hidden;
  }
}
```

---

## JSON Viewer Styles

```css
@layer components {
  /* ===== JSON VIEWER CONTAINER ===== */
  .json-viewer {
    @apply relative rounded-lg overflow-hidden;
    @apply bg-[hsl(var(--json-bg))];
    @apply border border-[hsl(var(--modal-border))];
  }

  /* ===== JSON VIEWER HEADER ===== */
  .json-viewer-header {
    @apply flex items-center justify-between;
    @apply px-4 py-2 border-b border-[hsl(var(--modal-border))];
    @apply bg-[hsl(var(--modal-bg-secondary))];
  }

  .json-viewer-title {
    @apply text-sm font-medium text-[hsl(var(--modal-text-primary))];
  }

  .json-viewer-controls {
    @apply flex items-center gap-2;
  }

  /* ===== JSON VIEWER CONTENT ===== */
  .json-viewer-content {
    @apply p-4 font-mono text-sm;
    @apply text-[hsl(var(--json-text))];
    max-height: 600px;
  }

  /* Line numbers */
  .json-line {
    @apply flex gap-4;
  }

  .json-line-number {
    @apply text-[hsl(var(--json-line-number))];
    @apply select-none text-right;
    min-width: 3ch;
  }

  .json-line-content {
    @apply flex-1;
  }

  /* ===== SYNTAX HIGHLIGHTING ===== */
  .json-key {
    @apply text-[hsl(var(--json-keyword))];
  }

  .json-string {
    @apply text-[hsl(var(--json-string))];
  }

  .json-number {
    @apply text-[hsl(var(--json-number))];
  }

  .json-boolean {
    @apply text-[hsl(var(--json-boolean))];
  }

  .json-null {
    @apply text-[hsl(var(--json-null))];
  }

  .json-bracket {
    @apply text-[hsl(var(--json-bracket))];
  }

  /* ===== COLLAPSIBLE SECTIONS ===== */
  .json-collapsible {
    @apply cursor-pointer select-none;
    @apply hover:bg-[hsl(var(--modal-bg-secondary))];
    @apply rounded px-1 -mx-1;
    @apply transition-colors duration-100;
  }

  .json-collapsible-icon {
    @apply inline-block w-4 h-4 mr-1;
    @apply text-[hsl(var(--modal-text-tertiary))];
    @apply transition-transform duration-150;
  }

  .json-collapsible[data-expanded="true"] .json-collapsible-icon {
    @apply rotate-90;
  }

  .json-collapsed-preview {
    @apply text-[hsl(var(--modal-text-tertiary))];
    @apply italic;
  }

  /* ===== COPY FEEDBACK ===== */
  .json-copy-feedback {
    @apply absolute top-2 right-2;
    @apply px-2 py-1 rounded-md;
    @apply bg-[hsl(var(--modal-accent))];
    @apply text-white text-xs font-medium;
    @apply opacity-0 transition-opacity duration-200;
    @apply pointer-events-none;
  }

  .json-copy-feedback[data-visible="true"] {
    @apply opacity-100;
    animation: copy-fade-out 2s ease-out;
  }
}
```

---

## Metrics Grid Styles

```css
@layer components {
  /* ===== METRICS GRID ===== */
  .metrics-grid {
    @apply grid gap-4;
    @apply p-4 rounded-lg;
    @apply bg-[hsl(var(--modal-bg-secondary))];
    @apply border border-[hsl(var(--modal-border))];
  }

  /* Responsive grid columns */
  @media (min-width: 1024px) {
    .metrics-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (min-width: 768px) and (max-width: 1023px) {
    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 767px) {
    .metrics-grid {
      @apply grid-cols-1;
    }
  }

  /* ===== METRIC CELL ===== */
  .metric-cell {
    @apply flex flex-col gap-1;
    @apply p-3 rounded-md;
    @apply bg-[hsl(var(--modal-bg-primary))];
    @apply border border-[hsl(var(--modal-border-subtle))];
  }

  .metric-label {
    @apply flex items-center gap-2;
    @apply text-xs font-medium uppercase tracking-wide;
    @apply text-[hsl(var(--modal-text-secondary))];
  }

  .metric-label-icon {
    @apply w-4 h-4;
  }

  .metric-value {
    @apply text-2xl font-semibold;
    @apply text-[hsl(var(--modal-text-primary))];
  }

  .metric-subvalue {
    @apply text-xs text-[hsl(var(--modal-text-tertiary))];
  }

  /* Status-specific metric cell */
  .metric-cell[data-type="status"] .metric-value {
    @apply capitalize;
  }

  .metric-cell[data-status="completed"] .metric-value {
    @apply text-[hsl(var(--status-completed))];
  }

  .metric-cell[data-status="error"] .metric-value {
    @apply text-[hsl(var(--status-error))];
  }

  .metric-cell[data-status="running"] .metric-value {
    @apply text-[hsl(var(--status-running))];
  }

  .metric-cell[data-status="pending"] .metric-value {
    @apply text-[hsl(var(--status-pending))];
  }

  .metric-cell[data-status="awaiting"] .metric-value {
    @apply text-[hsl(var(--status-awaiting))];
  }
}
```

---

## Status Badge Styles

```css
@layer components {
  /* ===== STATUS BADGE ===== */
  .status-badge {
    @apply inline-flex items-center gap-1.5;
    @apply px-3 py-1 rounded-full;
    @apply text-xs font-medium uppercase tracking-wide;
    @apply border;
  }

  .status-badge-dot {
    @apply w-2 h-2 rounded-full;
    animation: status-pulse 2s ease-in-out infinite;
  }

  /* Status variants */
  .status-badge[data-status="pending"] {
    @apply bg-[hsl(var(--status-pending)/0.1)];
    @apply text-[hsl(var(--status-pending))];
    @apply border-[hsl(var(--status-pending)/0.3)];
  }

  .status-badge[data-status="running"] {
    @apply bg-[hsl(var(--status-running)/0.1)];
    @apply text-[hsl(var(--status-running))];
    @apply border-[hsl(var(--status-running)/0.3)];
  }

  .status-badge[data-status="completed"] {
    @apply bg-[hsl(var(--status-completed)/0.1)];
    @apply text-[hsl(var(--status-completed))];
    @apply border-[hsl(var(--status-completed)/0.3)];
  }

  .status-badge[data-status="error"] {
    @apply bg-[hsl(var(--status-error)/0.1)];
    @apply text-[hsl(var(--status-error))];
    @apply border-[hsl(var(--status-error)/0.3)];
  }

  .status-badge[data-status="awaiting"] {
    @apply bg-[hsl(var(--status-awaiting)/0.1)];
    @apply text-[hsl(var(--status-awaiting))];
    @apply border-[hsl(var(--status-awaiting)/0.3)];
  }
}
```

---

## Animation Keyframes

```css
@layer utilities {
  /* ===== MODAL ANIMATIONS ===== */
  @keyframes modal-overlay-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes modal-overlay-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

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

  @keyframes modal-content-out {
    from {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
    to {
      opacity: 0;
      transform: scale(0.96) translateY(10px);
    }
  }

  /* ===== TAB ANIMATIONS ===== */
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

  /* ===== STATUS PULSE ANIMATION ===== */
  @keyframes status-pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* ===== COPY FEEDBACK ANIMATION ===== */
  @keyframes copy-fade-out {
    0% {
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
}
```

---

## Tailwind Utility Classes

### Common Patterns

```typescript
// Modal container
const modalContainerClasses = cn(
  "modal-container",
  "animate-in fade-in-0 duration-200"
);

// Modal content
const modalContentClasses = cn(
  "modal-content",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
);

// Tab button
const tabButtonClasses = (isActive: boolean) => cn(
  "tab-button",
  isActive && "data-[state=active]"
);

// Status badge
const statusBadgeClasses = (status: string) => cn(
  "status-badge",
  `data-[status=${status}]`
);

// JSON viewer
const jsonViewerClasses = cn(
  "json-viewer",
  "shadow-sm"
);
```

---

## Responsive Breakpoints

Following existing Tailwind config:

```css
/* Mobile first approach */
/* Default: 0px - 767px (mobile) */

/* Tablet: 768px+ */
@media (min-width: 768px) {
  /* 2-column layouts, larger text */
}

/* Desktop: 1024px+ */
@media (min-width: 1024px) {
  /* 3-column layouts, full features */
}

/* Large desktop: 1440px+ */
@media (min-width: 1440px) {
  /* Max width constraints, optimal spacing */
}
```

### Responsive Classes

```typescript
// Modal content max-width
"max-w-full md:max-w-4xl lg:max-w-6xl xl:max-w-7xl"

// Tab navigation
"flex-col md:flex-row"

// Metrics grid
"grid-cols-1 md:grid-cols-2 lg:grid-cols-3"

// JSON viewer
"text-xs md:text-sm"

// Modal padding
"p-4 md:p-6 lg:p-8"
```

---

## Dark Mode Support

All colors use HSL variables that automatically switch in dark mode:

```css
/* Light mode */
:root {
  --modal-bg-primary: 0 0% 100%;
  --modal-text-primary: 222 47% 11%;
}

/* Dark mode */
.dark {
  --modal-bg-primary: 222 47% 11%;
  --modal-text-primary: 210 40% 98%;
}
```

### Usage

```tsx
// Components automatically support dark mode via CSS variables
<div className="bg-[hsl(var(--modal-bg-primary))] text-[hsl(var(--modal-text-primary))]">
  Content adapts to theme
</div>
```

---

## Accessibility Styles

```css
@layer utilities {
  /* ===== FOCUS STYLES ===== */
  .focus-ring {
    @apply focus-visible:outline-none;
    @apply focus-visible:ring-2 focus-visible:ring-[hsl(var(--modal-accent))];
    @apply focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--modal-bg-primary))];
  }

  /* ===== HIGH CONTRAST MODE ===== */
  @media (prefers-contrast: high) {
    .modal-content {
      @apply border-2;
    }

    .status-badge {
      @apply border-2;
    }

    .json-viewer {
      @apply border-2;
    }
  }

  /* ===== REDUCED MOTION ===== */
  @media (prefers-reduced-motion: reduce) {
    .modal-overlay,
    .modal-content,
    .tab-content,
    .json-collapsible-icon {
      animation: none !important;
      transition: none !important;
    }
  }
}
```

---

## Print Styles

```css
@media print {
  /* Hide modal overlay and controls */
  .modal-overlay,
  .modal-header-right,
  .json-viewer-controls,
  .tab-navigation,
  .modal-footer {
    display: none !important;
  }

  /* Expand all JSON sections */
  .json-viewer-content {
    max-height: none !important;
  }

  /* Remove backgrounds for printing */
  .modal-content,
  .json-viewer,
  .metrics-grid {
    background: white !important;
    border: 1px solid black !important;
  }

  /* Black text for printing */
  * {
    color: black !important;
  }
}
```

---

## Z-Index Layering

Following existing z-index system in `tailwind.config.ts`:

```css
/* Modal z-index values */
.modal-overlay {
  z-index: 1040; /* modal-backdrop */
}

.modal-container {
  z-index: 1055; /* modal */
}

.modal-header,
.modal-footer {
  z-index: 10; /* Sticky within modal */
}

/* Dropdowns/popovers within modal */
.json-viewer-dropdown {
  z-index: 1070; /* popover */
}

/* Tooltips within modal */
.modal-tooltip {
  z-index: 1080; /* tooltip */
}
```

---

## Performance Optimizations

### GPU Acceleration

```css
/* Force GPU acceleration for animations */
.modal-content,
.tab-content,
.json-collapsible-icon {
  will-change: transform, opacity;
}

/* Remove will-change after animation */
.modal-content[data-state="open"],
.tab-content[data-visible="true"] {
  will-change: auto;
}
```

### Virtualization Classes

```css
/* For virtualized JSON lists */
.json-virtual-list {
  @apply relative overflow-auto;
  contain: strict;
}

.json-virtual-item {
  @apply absolute left-0 right-0;
  contain: layout style paint;
}
```

---

## Example Component Usage

### Complete Modal Example

```tsx
<div className="modal-overlay" data-state={isOpen ? 'open' : 'closed'}>
  <div className="modal-container">
    <div className="modal-content" data-state={isOpen ? 'open' : 'closed'}>
      {/* Header */}
      <header className="modal-header">
        <div className="modal-header-left">
          <FileIcon className="w-6 h-6 text-modal-accent" />
          <div className="modal-header-text">
            <h2 className="modal-title">Document Processing</h2>
            <p className="modal-subtitle">Stage 2 · Document Node</p>
          </div>
        </div>
        <div className="modal-header-right">
          <div className="status-badge" data-status="completed">
            <div className="status-badge-dot" />
            <span>Completed</span>
          </div>
          <button className="close-button focus-ring">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="modal-body">
        {/* Tab Navigation */}
        <div className="tab-navigation" role="tablist">
          <button className="tab-button" data-state="active">
            Input
            <span className="tab-badge">2</span>
          </button>
          <button className="tab-button">Process</button>
          <button className="tab-button">Output</button>
          <button className="tab-button">Activity</button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {/* JSON Viewer */}
          <div className="json-viewer">
            <div className="json-viewer-header">
              <h3 className="json-viewer-title">Input Data</h3>
              <div className="json-viewer-controls">
                <button className="focus-ring"><Copy /></button>
              </div>
            </div>
            <div className="json-viewer-content">
              {/* Syntax-highlighted JSON */}
            </div>
          </div>
        </div>
      </div>

      {/* Footer (AI stages only) */}
      <footer className="modal-footer">
        <RefinementChat {...props} />
      </footer>
    </div>
  </div>
</div>
```

---

## Migration Notes

### From Sheet to Modal

**Before** (NodeDetailsDrawer):
```tsx
<SheetContent className="w-[400px] sm:w-[600px]">
  {/* Content */}
</SheetContent>
```

**After** (NodeDetailsModal):
```tsx
<div className="modal-content">
  {/* Content with full responsive system */}
</div>
```

### CSS Class Mapping

| Old (Sheet) | New (Modal) |
|------------|-------------|
| `sheet-content` | `modal-content` |
| `sheet-header` | `modal-header` |
| `sheet-title` | `modal-title` |
| `sheet-description` | `modal-subtitle` |
| N/A | `modal-footer` (new) |

---

## Testing Checklist

- [ ] Light theme renders correctly
- [ ] Dark theme renders correctly
- [ ] Responsive layouts work (mobile, tablet, desktop)
- [ ] Animations play smoothly (60fps)
- [ ] Focus styles visible for all interactive elements
- [ ] High contrast mode supported
- [ ] Reduced motion respected
- [ ] Print styles work correctly
- [ ] Z-index layering correct (no overlapping issues)
- [ ] Scrollbars styled consistently
