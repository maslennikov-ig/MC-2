# MicroStepper Component

A compact 3-dot pipeline status indicator for Stage 6 lesson generation UI.

## Overview

The MicroStepper displays a horizontal row of 3 dots, each representing one node in the Stage 6 pipeline:

1. **Generator** - Generates full lesson content (intro + sections + summary)
2. **SelfReviewer** - Pre-judge validation (Fail-Fast architecture)
3. **Judge** - Evaluates quality using CLEV voting and targeted refinement

## Features

- **5 Status States**: pending, active, completed, error, loop
- **Visual Animations**: Pulse effect for active nodes, rotating icon for loop state
- **Dark Mode**: Full support with proper color contrast
- **Tooltips**: Hover to see node name and status in Russian
- **Responsive Sizes**: 'sm' (8px) for table cells, 'md' (12px) for larger displays
- **Accessibility**: Proper ARIA labels and semantic markup

## Usage

```tsx
import { MicroStepper } from '@/components/generation-graph/components/MicroStepper';
import { MicroStepperState } from '@megacampus/shared-types';

// Example: Lesson with generator actively processing
const state: MicroStepperState = {
  nodes: [
    { node: 'generator', status: 'active' },
    { node: 'selfReviewer', status: 'pending' },
    { node: 'judge', status: 'pending' },
  ]
};

<MicroStepper
  state={state}
  size="sm"
  showTooltip
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `state` | `MicroStepperState` | Required | Pipeline state with 3 nodes and their statuses |
| `size` | `'sm' \| 'md'` | `'sm'` | Dot size: 'sm' (8px) for tables, 'md' (12px) for larger displays |
| `showTooltip` | `boolean` | `true` | Whether to show tooltips on hover |
| `className` | `string` | `undefined` | Additional CSS classes |

## Status Colors

| Status | Color | Description |
|--------|-------|-------------|
| `pending` | Gray (slate-300/600) | Not started yet |
| `active` | Blue (blue-500) with pulse | Currently processing |
| `completed` | Green (emerald-500) | Successfully finished |
| `error` | Red (red-500) | Failed with error |
| `loop` | Orange (orange-500) with rotating icon | In refinement loop (judge node) |

## Animation Details

### Active Status
- **Pulse Animation**: Scale from 1 -> 1.2 -> 1, opacity from 1 -> 0.7 -> 1
- **Duration**: 1.5s infinite loop
- **Easing**: easeInOut

### Loop Status
- **Rotating Icon**: RotateCw icon (from lucide-react)
- **Rotation**: 360 deg continuous rotation
- **Duration**: 2s infinite loop
- **Easing**: linear

## Examples

See `MicroStepper.example.tsx` for comprehensive examples including:
- All 5 status states
- Both size variants (sm, md)
- Usage in table context (Module Dashboard)
- Dark mode variants

## Integration Points

### Module Dashboard (Lesson Matrix Table)
```tsx
<table>
  <tbody>
    <tr>
      <td>Lesson 1</td>
      <td>
        <MicroStepper state={lesson.pipelineState} size="sm" />
      </td>
    </tr>
  </tbody>
</table>
```

### Standalone Display
```tsx
<div className="flex items-center gap-2">
  <MicroStepper state={state} size="md" />
  <span>Pipeline Progress</span>
</div>
```

## Dependencies

- **React**: 19.x (uses 'use client' directive)
- **Framer Motion**: 12.x (for animations)
- **lucide-react**: For RotateCw icon
- **@radix-ui/react-tooltip**: Tooltip component (via shadcn/ui)
- **@megacampus/shared-types**: Type definitions

## Accessibility

- Uses semantic `role="status"` attribute
- ARIA label: "Status pipeline"
- Tooltips provide additional context for screen readers
- Color is not the only indicator (icons for loop state)
- Keyboard accessible via tooltip focus

## Type Safety

All types are imported from `@megacampus/shared-types`:
- `Stage6NodeName`: 'generator' | 'selfReviewer' | 'judge'
- `Stage6NodeStatus`: 'pending' | 'active' | 'completed' | 'error' | 'loop'
- `MicroStepperState`: Interface with nodes array
- `STAGE6_NODE_LABELS`: Russian labels constant

## Dark Mode

Full dark mode support using Tailwind's `dark:` prefix:
- Pending dots: slate-300 -> slate-600
- All other statuses use same colors in both modes (sufficient contrast)
- Tooltip background automatically adapts via shadcn/ui theme

## Performance

- **Lightweight**: Only animates active/loop nodes
- **GPU Accelerated**: Uses transform properties for animations
- **Efficient Re-renders**: Uses React keys properly
- **Lazy Animation**: Framer Motion only runs when status requires it

## Related Components

- **VerticalPipelineStepper**: Larger vertical version for Lesson Inspector
- **ModuleDashboard**: Parent component that displays lesson matrix

## Future Enhancements

- [ ] Configurable animation speeds
- [ ] Custom color themes
- [ ] Click handlers for navigation to Lesson Inspector
