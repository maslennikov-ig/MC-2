# Fix: Dollar signs interpreted as LaTeX math + missing callout support

## Root Cause

In lesson content, currency amounts like `$1000` and `$50,000` are interpreted as LaTeX inline math delimiters by `remark-math` v6 (default `singleDollarTextMath: true`). Everything between the two `$` signs becomes a single math expression. KaTeX with `strict: 'ignore'` silently renders garbled text:

- Russian text loses all spaces (math mode)
- Latin characters split per-character (each = separate variable)
- Numbers rendered separately

**Secondary issue**: `MarkdownRendererFull` ignores `callouts: true` from `lesson` preset — `[!INFO]` blocks render as plain blockquotes.

## Changes

### 1. Create currency escaping utility (NEW FILE)

**File**: `packages/web/components/markdown/utils/escape-currency.ts`

```typescript
export function escapeCurrencyDollarSigns(content: string): string {
  // $DIGITS (with optional comma/period separators) followed by non-word char
  // Preserves: $$block$$, $x^2$, $\alpha$, $2x + 3$
  return content.replace(/(?<!\$)\$(\d+(?:[,.]\d+)*)(?=[^\d\w]|$)/g, '\\$$1');
}
```

Regex logic:

- `(?<!\$)` — not preceded by `$` (preserves `$$` block math)
- `\$(\d+(?:[,.]\d+)*)` — dollar + digits with optional separators
- `(?=[^\d\w]|$)` — followed by non-word-char or end (so `$2x` in math is safe)

### 2. Apply escaping in MarkdownRendererFull

**File**: `packages/web/components/markdown/MarkdownRendererFull.tsx`

- Import `escapeCurrencyDollarSigns`
- Line ~399: `{config.math ? escapeCurrencyDollarSigns(content) : content}`

### 3. Add callout support to MarkdownRendererFull

**File**: `packages/web/components/markdown/MarkdownRendererFull.tsx`

- Import `Callout` from `./components/Callout` and `CalloutType` from `./types`
- Replace `blockquote` component (lines 370-374) with callout-aware version ported from `MarkdownRenderer.tsx` (lines 186-239):
  - When `config.callouts`, parse `[!NOTE|TIP|WARNING|DANGER|INFO]` pattern
  - Render `<Callout type={type}>` when detected
  - Fallback to plain blockquote otherwise

### 4. Apply same escaping in shared plugins.ts

**File**: `packages/web/components/markdown/plugins.ts`

No change needed — `plugins.ts` is used by the RSC `MarkdownRenderer`, which already handles callouts. The currency escaping is done at the component level (step 2), not plugin level.

### 5. Backend prevention (Stage 6)

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/content-utils.ts`

- Add `escapeCurrencyDollarSigns()` (same regex) to `extractContentMarkdown()` before returning
- This prevents the issue at generation time for new content

### 6. Unit tests

**File**: `packages/web/components/markdown/__tests__/escape-currency.test.ts` (NEW)

Key test cases:

- `$1000` -> `\$1000`
- `$50,000` -> `\$50,000`
- `$x^2$` -> unchanged (math)
- `$\alpha$` -> unchanged (LaTeX)
- `$$x = 2$$` -> unchanged (block math)
- `$2x + 3$` -> unchanged (math starting with digit)
- Mixed: `"Cost $100 to solve $x^2 = 4$"` -> only `$100` escaped

## Files to modify

| File                                                                                      | Action                     |
| ----------------------------------------------------------------------------------------- | -------------------------- |
| `packages/web/components/markdown/utils/escape-currency.ts`                               | CREATE                     |
| `packages/web/components/markdown/MarkdownRendererFull.tsx`                               | EDIT (escaping + callouts) |
| `packages/course-gen-platform/src/stages/stage6-lesson-content/services/content-utils.ts` | EDIT (backend prevention)  |
| `packages/web/components/markdown/__tests__/escape-currency.test.ts`                      | CREATE                     |

## Verification

1. `pnpm type-check` — types OK
2. `pnpm -F web test -- escape-currency` — unit tests pass
3. Manual: Open PVR-1280 lesson 1 on dev server — currency renders normally, math formulas still work
4. Check `[!INFO]` blocks render as styled callouts, not plain blockquotes
