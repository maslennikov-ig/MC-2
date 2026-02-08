# Plan: Expand optimizePackageImports in next.config.ts

**Beads**: mc2-tiue
**Date**: 2026-02-08

## Context

`next.config.ts` has `experimental.optimizePackageImports` with only 3 entries:

```typescript
optimizePackageImports: ['lucide-react', 'date-fns', '@radix-ui/react-icons'],
```

The project uses 22+ @radix-ui packages and framer-motion, none of which are optimized. This causes Next.js to include full package bundles instead of tree-shaking unused exports.

## Change

**File**: `packages/web/next.config.ts` (line ~230)

Replace `optimizePackageImports` array with expanded list:

```typescript
optimizePackageImports: [
  // Icons & utilities
  'lucide-react',
  'date-fns',
  // Radix UI primitives
  '@radix-ui/react-accordion',
  '@radix-ui/react-alert-dialog',
  '@radix-ui/react-avatar',
  '@radix-ui/react-checkbox',
  '@radix-ui/react-collapsible',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-hover-card',
  '@radix-ui/react-icons',
  '@radix-ui/react-label',
  '@radix-ui/react-popover',
  '@radix-ui/react-progress',
  '@radix-ui/react-radio-group',
  '@radix-ui/react-scroll-area',
  '@radix-ui/react-select',
  '@radix-ui/react-separator',
  '@radix-ui/react-slider',
  '@radix-ui/react-slot',
  '@radix-ui/react-switch',
  '@radix-ui/react-tabs',
  '@radix-ui/react-toggle',
  '@radix-ui/react-toggle-group',
  '@radix-ui/react-tooltip',
  // Animations
  'framer-motion',
],
```

## Verification

1. `pnpm --filter web build` — build succeeds, no errors
2. `pnpm --filter web dev` — pages load, Radix components render correctly
3. Compare bundle size before/after with `ANALYZE=true pnpm --filter web build` (if bundle-analyzer configured)
