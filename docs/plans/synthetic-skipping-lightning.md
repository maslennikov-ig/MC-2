# Plan: Fix restart-stage 405 error and hydration warnings

## Problem Summary

1. **405 Method Not Allowed** when clicking "Restart" button on failed stage
2. **React hydration errors** in RestartConfirmDialog (`<div>` inside `<p>`)
3. **Course stuck** at Stage 4 with status "failed"

## Root Cause Analysis

### Issue 1: 405 Error

- **API route**: `/api/courses/[orgSlug]/[courseSlug]/restart-stage/route.ts`
- **Hook call**: `/api/courses/${courseSlug}/restart-stage` (missing `orgSlug`)
- **Location**: `packages/web/components/generation-graph/hooks/useRestartStage.ts:69`

### Issue 2: Hydration Errors

- `DialogDescription` (Radix UI) renders `<p>` element
- Inside it: `<div>` (warning box) and `<p>` (description text)
- HTML spec: `<p>` cannot contain block elements
- **Location**: `packages/web/components/generation-graph/controls/RestartConfirmDialog.tsx:59-67`

## Implementation Plan

### Step 1: Fix useRestartStage hook

**File**: `packages/web/components/generation-graph/hooks/useRestartStage.ts`

Changes:

- Add `orgSlug` parameter to hook signature
- Update fetch URL to include `orgSlug`

```typescript
// Before
export function useRestartStage(courseSlug: string): UseRestartStageReturn {
  // ...
  const response = await fetch(`/api/courses/${courseSlug}/restart-stage`, {

// After
export function useRestartStage(orgSlug: string, courseSlug: string): UseRestartStageReturn {
  // ...
  const response = await fetch(`/api/courses/${orgSlug}/${courseSlug}/restart-stage`, {
```

### Step 2: Update RestartConfirmDialog

**File**: `packages/web/components/generation-graph/controls/RestartConfirmDialog.tsx`

Changes:

- Add `orgSlug` prop
- Pass `orgSlug` to `useRestartStage`

### Step 3: Update ApprovalControls

**File**: `packages/web/components/generation-graph/controls/ApprovalControls.tsx`

Changes:

- Add `orgSlug` prop to interface (line 14)
- Pass `orgSlug` to `useRestartStage` (line 52)

```typescript
// Before
interface ApprovalControlsProps {
  courseId: string;
  courseSlug: string;
  // ...
}
const { restartStage, isRestarting } = useRestartStage(courseSlug);

// After
interface ApprovalControlsProps {
  courseId: string;
  orgSlug: string;
  courseSlug: string;
  // ...
}
const { restartStage, isRestarting } = useRestartStage(orgSlug, courseSlug);
```

### Step 4: Update GenerationProgressContainerEnhanced

**File**: `packages/web/app/[locale]/courses/[orgSlug]/[courseSlug]/generating/GenerationProgressContainerEnhanced.tsx`

Changes:

- Pass `orgSlug` to `useRestartStage` (line 150)

### Step 5: Fix hydration error in RestartConfirmDialog

**File**: `packages/web/components/generation-graph/controls/RestartConfirmDialog.tsx`

Changes:

- Replace `DialogDescription` children with semantic HTML that doesn't violate nesting rules
- Use `<div>` wrapper instead of direct children, or use `asChild` pattern

```tsx
// Before (line 59-67)
<DialogDescription className="pt-2">
  <div className="mb-3 ...">...</div>
  <p className="text-slate-600">...</p>
</DialogDescription>

// After - Option A: Use div wrapper with aria-describedby
<DialogDescription asChild>
  <div className="pt-2 text-sm text-muted-foreground">
    <div className="mb-3 ...">...</div>
    <p className="text-slate-600">...</p>
  </div>
</DialogDescription>
```

### Step 6: Update StageNode

**File**: `packages/web/components/generation-graph/nodes/StageNode.tsx`

Changes:

- Add `orgSlug` extraction from `useParams` (line 29)
- Pass `orgSlug` to `RestartConfirmDialog` (line 228)

### Step 7: Update NodeDetailsDrawer

**File**: `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`

Note: Already has `orgSlug` from params (line 173)

Changes:

- Pass `orgSlug` to `ApprovalControls` (line 917)
- Pass `orgSlug` to `RestartConfirmDialog` (line 1140)

## Files to Modify

1. `packages/web/components/generation-graph/hooks/useRestartStage.ts`
2. `packages/web/components/generation-graph/controls/RestartConfirmDialog.tsx`
3. `packages/web/components/generation-graph/controls/ApprovalControls.tsx`
4. `packages/web/app/[locale]/courses/[orgSlug]/[courseSlug]/generating/GenerationProgressContainerEnhanced.tsx`
5. `packages/web/components/generation-graph/nodes/StageNode.tsx`
6. `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`

## Verification

1. Run type-check: `pnpm type-check`
2. Run build: `pnpm build`
3. Manual test:
   - Navigate to generating page for the stuck course
   - Open browser console (no hydration warnings)
   - Click "Restart" button on failed stage
   - Verify POST request goes to correct URL with orgSlug
   - Verify stage restarts successfully
