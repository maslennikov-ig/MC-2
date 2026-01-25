# Fix: Hover panel disappears when dropdown opens

## Problem

When user hovers over course card, a panel with action buttons appears at the bottom. When clicking the visibility dropdown (Private/Organization/Public), the dropdown opens **below** the card via Portal. Moving the mouse to select an option triggers `onMouseLeave` on the card, causing the hover panel to hide and the dropdown to close.

**Root Cause**: `onMouseLeave` on card sets `isHovered=false`, hiding the panel while dropdown is open outside card bounds.

## Solution

Track dropdown open state and keep hover panel visible while dropdown is open.

## Changes

### File: `packages/web/app/[locale]/courses/_components/course-card.tsx`

**1. Add state for dropdown** (around line 180, near other useState):

```typescript
const [isVisibilityDropdownOpen, setIsVisibilityDropdownOpen] = useState(false);
```

**2. Modify hover panel condition** (line 633):

```diff
- {isHovered && (
+ {(isHovered || isVisibilityDropdownOpen) && (
```

**3. Add onOpenChange to DropdownMenu** (line 799):

```diff
- <DropdownMenu>
+ <DropdownMenu onOpenChange={setIsVisibilityDropdownOpen}>
```

## Verification

1. Run type-check: `pnpm type-check`
2. Run build: `pnpm build`
3. Manual test:
   - Hover over course card → panel appears
   - Click visibility button → dropdown opens
   - Move mouse to dropdown options → panel stays visible
   - Select option → dropdown closes, panel hides on mouse leave
   - Click outside dropdown → dropdown closes, panel behaves normally
