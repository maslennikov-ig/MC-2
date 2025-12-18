# Node Details Panel - Design Documentation

## Overview

Complete design documentation for refactoring the Node Details Panel from a narrow Sheet component to a full-screen modal with improved readability, dark theme support, and professional JSON visualization.

This refactoring addresses critical usability issues:
- Semi-transparent background making text hard to read
- No dark theme support
- 400-600px width too narrow for complex data structures
- Plain JSON.stringify without syntax highlighting or interactivity

---

## Documentation Files

### 1. [components.md](./components.md)
**Component Structure & Architecture**

Defines the complete component hierarchy, props interfaces, and implementation patterns:
- Root modal component with overlay and container
- Header with node metadata and status
- Tab navigation system (Input, Process, Output, Activity)
- JsonViewer with syntax highlighting and collapsible sections
- MetricsGrid for process metrics display
- RefinementChat integration (AI stages 3, 4, 5, 6)
- Responsive layouts (3-column desktop, 2-column tablet, vertical mobile)

**Key Components**:
- `NodeDetailsModal` - Root component
- `JsonViewer` - NEW syntax-highlighted JSON viewer
- `MetricsGrid` - Process metrics display
- `TabNavigation` - Tab switcher
- `RefinementChat` - EXISTING AI chat (always expanded for AI stages)

---

### 2. [styles.md](./styles.md)
**CSS Variables, Tailwind Classes & Theme System**

Complete styling system with light and dark theme support:
- CSS variables for modal-specific colors
- JSON syntax highlighting colors (6 distinct types)
- Status badge variants (pending, running, completed, error, awaiting)
- Tailwind utility classes for common patterns
- Z-index layering system
- Custom scrollbar styling
- Print styles for documentation

**Theme Colors**:

**Light Theme**:
- Background: `#FFFFFF`, `#F9FAFB`, `#F3F4F6`
- Text: `#111827`, `#6B7280`, `#9CA3AF`
- Accent: `#3B82F6`
- JSON Keywords: `#0451a5` (blue)
- JSON Strings: `#0a8200` (green)
- JSON Numbers: `#098658` (teal)

**Dark Theme**:
- Background: `#1F2937`, `#111827`, `#374151`
- Text: `#F9FAFB`, `#9CA3AF`, `#6B7280`
- Accent: `#60A5FA`
- JSON Keywords: `#4fc1ff` (light blue)
- JSON Strings: `#6cd38a` (green)
- JSON Numbers: `#4ec9b0` (teal)

---

### 3. [responsive.md](./responsive.md)
**Breakpoints, Layouts & Adaptive Behaviors**

Responsive design patterns across all device sizes:
- Mobile (0-767px): Full-screen vertical layout
- Tablet (768-1023px): Inset modal with 2-column layout
- Desktop (1024-1439px): 3-column layout with all panels visible
- Large (1440px+): Enhanced spacing and typography

**Breakpoints**:
```typescript
mobile: '0px - 767px',      // xs, sm
tablet: '768px - 1023px',   // md
desktop: '1024px - 1439px', // lg
large: '1440px+',           // xl, 2xl
```

**Layout Adaptations**:
- Header: Stacked on mobile, horizontal on desktop
- Tabs: Horizontal scroll on mobile, full width on desktop
- Content: Single column → 2 columns → 3 columns
- Footer: Compact on mobile, full features on desktop

---

### 4. [animations.md](./animations.md)
**Motion Design, Transitions & Micro-Interactions**

All animations and motion patterns:
- Modal open/close (200ms/150ms with fade + scale)
- Tab switching (100ms fade + slide)
- JSON collapsible sections (150ms rotate + 200ms expand)
- Status badge pulse (2s loop for running states)
- Hover effects (150ms lift + shadow)
- Copy feedback (300ms scale + 2s toast)
- Staggered entrances (50ms delay between items)

**Animation Principles**:
1. **Fast**: 100-300ms for most interactions
2. **Smooth**: Cubic-bezier easing for natural motion
3. **Purposeful**: Every animation serves a function
4. **Performant**: GPU-accelerated (transform, opacity only)
5. **Accessible**: Respects `prefers-reduced-motion`

**Timing Reference**:
| Action | Duration | Easing |
|--------|----------|--------|
| Modal Open | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Modal Close | 150ms | `ease-in` |
| Tab Switch | 100ms | `ease-out` |
| Hover | 150ms | `ease-out` |
| Collapsible | 200ms | `ease-in-out` |

---

## Design System Integration

### Existing Patterns (Maintained)

Following established patterns from `packages/web/app/globals.css`:

**Typography**:
- Font family: `Inter` (sans), `JetBrains Mono` (mono)
- Scale: 12px (xs) → 60px (6xl)
- Line heights: 1.5-1.7 for body, 1.1-1.3 for headings

**Spacing**:
- Base unit: 4px (0.25rem)
- Scale: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px...

**Colors**:
- Primary: Purple-600 (`#7c3aed`)
- Status: Success (green), Warning (amber), Error (red), Info (blue)
- Neutrals: Gray scale with 11 shades (50-950)

**Border Radius**:
- Small: 0.25rem (4px)
- Default: 0.75rem (12px)
- Large: 1rem (16px)
- X-Large: 1.5rem (24px)

### New Patterns (Introduced)

**Modal-Specific Variables**:
- `--modal-bg-primary/secondary/tertiary`
- `--modal-text-primary/secondary/tertiary`
- `--modal-border/border-subtle`
- `--modal-accent/accent-hover`

**JSON Syntax Highlighting**:
- 6 distinct color types (keyword, string, number, boolean, null, bracket)
- Light and dark theme variants
- Line numbers with subtle gray

**Status Colors**:
- 5 status types with variants (background, foreground, border)
- Animated pulse dots for active states
- WCAG AA contrast ratios

---

## Implementation Strategy

### Phase 1: Core Components (Week 1)
1. Create `JsonViewer` component with syntax highlighting
2. Build `NodeDetailsModal` shell (overlay + container)
3. Implement `ModalHeader` with node metadata
4. Set up `TabNavigation` system

### Phase 2: Content Panels (Week 1-2)
1. Refactor `InputPanel` to use `JsonViewer`
2. Enhance `ProcessPanel` with `MetricsGrid`
3. Refactor `OutputPanel` to use `JsonViewer`
4. Integrate existing `ActivityPanel`

### Phase 3: Polish & Responsive (Week 2)
1. Implement responsive layouts (mobile, tablet, desktop)
2. Add animations (Framer Motion variants)
3. Test dark theme support
4. Optimize performance (lazy loading, virtualization)

### Phase 4: Integration & Testing (Week 2-3)
1. Replace `NodeDetailsDrawer` with `NodeDetailsModal`
2. Integrate with existing `useNodeSelection` hook
3. Test keyboard navigation and accessibility
4. Cross-browser testing (Chrome, Firefox, Safari, Edge)

---

## Accessibility Checklist

### WCAG 2.1 AA Compliance

- [ ] Color contrast ratios ≥ 4.5:1 for text
- [ ] Color contrast ratios ≥ 3:1 for UI components
- [ ] All interactive elements have visible focus states
- [ ] Keyboard navigation fully supported (Tab, Arrow keys, Escape)
- [ ] ARIA attributes for modal, tabs, and panels
- [ ] Focus trap within modal when open
- [ ] Screen reader announcements for status changes
- [ ] No information conveyed by color alone
- [ ] Touch targets ≥ 44x44px on mobile
- [ ] Reduced motion support (prefers-reduced-motion)

### Keyboard Shortcuts

- **Escape**: Close modal
- **Tab**: Navigate between interactive elements
- **Arrow Keys**: Navigate tabs (when tab has focus)
- **Enter/Space**: Activate buttons
- **Ctrl+F**: Focus search in JsonViewer (future)
- **Ctrl+C**: Copy JSON (when JsonViewer focused, future)

---

## Performance Targets

### Metrics

- **Modal Open**: <200ms to fully rendered
- **Tab Switch**: <100ms content swap
- **JSON Render**: <500ms for 1000+ line JSON
- **Animations**: 60fps on all interactions
- **Bundle Size**: +30KB max (including Framer Motion)

### Optimization Strategies

1. **Code Splitting**: Lazy load `JsonViewer` (not needed on initial load)
2. **Virtualization**: Use react-window for large JSON arrays (1000+ items)
3. **Memoization**: Memoize syntax highlighting results
4. **Debouncing**: Debounce search input (300ms)
5. **GPU Acceleration**: Use `transform` and `opacity` for animations
6. **Conditional Rendering**: Only render active tab content

---

## Browser Support

### Minimum Versions

- Chrome/Edge: 88+
- Firefox: 78+
- Safari: 14+
- Mobile Safari: 14+

### Feature Detection

- Framer Motion (animations)
- CSS Grid (layouts)
- CSS Custom Properties (theming)
- `backdrop-filter` (overlay blur, graceful degradation)
- `prefers-reduced-motion` (accessibility)

### Polyfills (if needed)

- None required for target browsers
- Autoprefixer handles vendor prefixes
- Tailwind CSS provides cross-browser consistency

---

## Testing Strategy

### Unit Tests (Vitest + React Testing Library)

1. **NodeDetailsModal**:
   - Opens when `selectedNodeId` is set
   - Closes on Escape key
   - Closes on overlay click
   - Focus trap works correctly

2. **JsonViewer**:
   - Renders JSON with correct syntax highlighting
   - Collapsible sections toggle correctly
   - Copy button copies to clipboard
   - Handles invalid JSON gracefully

3. **TabNavigation**:
   - Switches tabs on click
   - Arrow keys navigate tabs
   - Active tab has correct ARIA attributes

### Integration Tests (Playwright)

1. Full modal flow:
   - Double-click node → modal opens → view tabs → refine via chat → close
2. Responsive layouts:
   - Test mobile (375px), tablet (768px), desktop (1440px)
3. Keyboard navigation:
   - Tab through all elements → escape closes modal
4. Dark theme:
   - Toggle theme → verify colors update correctly

### Visual Regression Tests (Playwright Screenshots)

1. Light theme screenshots at all breakpoints
2. Dark theme screenshots at all breakpoints
3. Component state variations (hover, focus, disabled)
4. Status badge colors (pending, running, completed, error, awaiting)

---

## Migration Path

### From Sheet to Modal

**Before** (NodeDetailsDrawer):
```tsx
<Sheet open={!!selectedNodeId} onOpenChange={(open) => !open && deselectNode()}>
  <SheetContent className="w-[400px] sm:w-[600px]">
    {/* Content */}
  </SheetContent>
</Sheet>
```

**After** (NodeDetailsModal):
```tsx
<NodeDetailsModal
  selectedNodeId={selectedNodeId}
  onClose={deselectNode}
  courseId={courseInfo.id}
/>
```

### Breaking Changes

1. **Component name**: `NodeDetailsDrawer` → `NodeDetailsModal`
2. **Props**: Same interface (backward compatible)
3. **Styling**: New CSS classes (modal-* instead of sheet-*)
4. **Layout**: Full-screen modal instead of side drawer

### Migration Steps

1. Create new `NodeDetailsModal` component (parallel to existing drawer)
2. Update parent component to use modal (feature flag for A/B testing)
3. Test thoroughly with both components available
4. Remove old `NodeDetailsDrawer` after validation
5. Clean up unused Sheet component styles

---

## Dependencies

### Required Packages

```json
{
  "dependencies": {
    "framer-motion": "^11.0.0",     // Animations
    "@radix-ui/react-dialog": "^1.0.5", // Modal primitives
    "@xyflow/react": "^12.0.0",      // Existing (React Flow)
    "lucide-react": "^0.300.0"       // Icons
  }
}
```

### Optional Enhancements

```json
{
  "devDependencies": {
    "react-window": "^1.8.10",       // Virtualization for large JSON
    "prismjs": "^1.29.0"             // Alternative syntax highlighting
  }
}
```

---

## File Structure

```
packages/web/components/generation-graph/panels/
├── NodeDetailsModal.tsx              # Root modal component
├── NodeDetailsModal.test.tsx         # Unit tests
├── ModalHeader.tsx                   # Header with title, status, close
├── TabNavigation.tsx                 # Tab switcher
├── TabContent.tsx                    # Tab panel container
├── JsonViewer.tsx                    # NEW: Syntax-highlighted JSON viewer
├── JsonViewer.test.tsx               # JsonViewer tests
├── MetricsGrid.tsx                   # Process metrics display
├── InputPanel.tsx                    # Input tab (uses JsonViewer)
├── ProcessPanel.tsx                  # Process tab (uses MetricsGrid)
├── OutputPanel.tsx                   # Output tab (uses JsonViewer)
├── ActivityPanel.tsx                 # Activity tab (existing)
├── RefinementChat.tsx                # EXISTING: AI chat interface
├── QuickActions.tsx                  # EXISTING: Quick action buttons
└── AttemptSelector.tsx               # EXISTING: Attempt switcher
```

---

## Design Rationale

### Why Full-Screen Modal?

1. **More Space**: Complex JSON structures need horizontal space
2. **Better Focus**: Full-screen reduces distractions
3. **Consistent Pattern**: Matches n8n's node details UX (familiar to users)
4. **Dark Theme**: Easier to implement with full control over background
5. **Responsive**: Easier to adapt to mobile (already full-screen)

### Why 3-Column Desktop Layout?

1. **Efficiency**: View input, process, and output simultaneously
2. **Comparison**: Compare input vs output side-by-side
3. **Context**: Keep metrics visible while viewing data
4. **Professional**: Matches IDE and data tool conventions

### Why Syntax-Highlighted JSON?

1. **Readability**: Colors help parse nested structures
2. **Professionalism**: Plain stringify feels unfinished
3. **Usability**: Collapsible sections reduce cognitive load
4. **Accessibility**: Line numbers aid navigation and debugging

### Why Always-Expanded Chat (AI Stages)?

1. **Discoverability**: Users see refinement option immediately
2. **Efficiency**: No extra click to open/close
3. **Context**: Chat history visible alongside output
4. **Consistency**: Footer always visible (no jumping layout)

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Diff View**: Compare attempts side-by-side with highlighted changes
2. **Export**: Download JSON as file (formatted or minified)
3. **Search**: Ctrl+F to search within JSON (filter by key/value)
4. **Graph View**: Visualize nested JSON as interactive tree
5. **Schema Validation**: Show schema violations inline
6. **Custom Themes**: User-selected syntax highlighting themes
7. **Real-time Updates**: WebSocket connection for live node updates
8. **History**: Timeline view of all attempts with quick navigation
9. **Annotations**: Add notes/comments to specific JSON paths
10. **Performance Profiling**: Detailed breakdown of execution time

---

## Questions & Decisions

### Resolved

- **Q**: Use Radix Dialog or custom modal?
  - **A**: Use Radix for accessibility, customize styling
- **Q**: Framer Motion or CSS animations?
  - **A**: Framer Motion for complex orchestrations, CSS for simple transitions
- **Q**: Virtualize JSON or render all?
  - **A**: Render all initially, add virtualization if performance issues
- **Q**: Always show footer or conditional?
  - **A**: Always show for AI stages (3,4,5,6), hide for others

### Open Questions

- **Q**: Should we support multiple modals stacked?
  - **A**: Not in MVP, revisit if user requests node comparison
- **Q**: Add fullscreen toggle for JsonViewer?
  - **A**: Consider if users report needing more space
- **Q**: Support custom JSON formatters?
  - **A**: Phase 2 feature based on user feedback

---

## Resources

### Design References

- **n8n Node Details**: https://n8n.io (workflow automation tool)
- **Postman Response Viewer**: JSON viewer with syntax highlighting
- **VS Code**: JSON formatting and collapsible sections
- **Chrome DevTools**: Network panel response viewer

### Technical References

- **Radix UI Dialog**: https://www.radix-ui.com/docs/primitives/components/dialog
- **Framer Motion**: https://www.framer.com/motion/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **WCAG 2.1**: https://www.w3.org/WAI/WCAG21/quickref/

---

## Changelog

### v1.0.0 (Initial Design)
- Complete component architecture
- Light and dark theme color systems
- Responsive layouts (mobile, tablet, desktop)
- Animation specifications
- Accessibility requirements
- Performance optimization strategies

---

## Contributors

Design documentation created following the project's UI/UX Design Specialist agent patterns and existing design system in `packages/web/app/globals.css`.

---

## License

Internal documentation for MegaCampusAI project.
