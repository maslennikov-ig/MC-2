# Code Review: Wave 2 Content Quality Fixes

**Date**: 2026-04-03
**Reviewer**: Senior Code Reviewer (automated)
**Scope**: v0.31.33..HEAD (4 commits: `bdb6680a`, `86b85e21`, `9f100a03`, `9303f714`)
**Plan**: `docs/plans/groovy-humming-octopus.md` (Wave 2 section)
**Branch**: `develop`

---

## Executive Summary

Wave 2 addresses 3 new quality bugs (W2-1, W2-2, W2-3) plus a critical CI/CD blocker (`passwordSchema` export). The implementation is generally solid, with well-tested table repair logic and consistent callout normalization across backend and frontend. One bug was found (dead code in section-count validation), one edge case gap in frontend callout normalization, and several minor observations.

**Verdict**: Approve with 1 important fix required.

---

## 1. Plan Alignment

### Implemented (in scope)

| Plan Item                                   | Status          | Notes                                           |
| ------------------------------------------- | --------------- | ----------------------------------------------- |
| W2-1: `[!PRO TIP]` callout regex (backend)  | Done            | `structural-checks.ts` regex + normalization    |
| W2-1: `[!PRO TIP]` callout regex (frontend) | Done            | `callout-parser.tsx` regex + normalization      |
| W2-2: Broken markdown table rows            | Done            | `normalize-markdown-tables.ts` with 4 new tests |
| W2-3: Section count = 0 validation          | Done (with bug) | See Critical finding below                      |
| CI blocker: `passwordSchema` export         | Done            | `validation-schemas.ts` static export           |
| Bundle size threshold bump                  | Done            | `analyze-processor-bundle.ts` 2.0 -> 2.5 MB     |

### Not implemented (deferred per plan)

| Plan Item                         | Status   | Notes                     |
| --------------------------------- | -------- | ------------------------- |
| W2-4: Audience-aware prompts (P2) | Deferred | Correct per plan priority |
| W2-5: Rendering verification      | Deferred | Correct per plan priority |

### Deviation from plan

The `duplication-checks.ts` change mentioned in the review request (removing "lesson digest" from `isDigestSection` regex) was part of v0.31.33, not this wave. No changes to that file exist in the review window. This is not a problem -- just a scope clarification.

---

## 2. Findings

### CRITICAL -- `sectionCount === 0` check is dead code

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/orchestrator.ts:243`
**Plan item**: W2-3

The orchestrator checks `densityResult.sectionCount === 0`, but `checkContentDensity()` in `basic-checks.ts:272` clamps the value with `Math.max(1, sections.length)`:

```typescript
// basic-checks.ts:272
const sectionCount = Math.max(1, sections.length);
```

This means `densityResult.sectionCount` can **never** be 0. The zero-section guard is unreachable dead code. Content with no `##` headers will report `sectionCount = 1` and pass this check silently.

**Impact**: The exact scenario W2-3 was designed to catch (lesson 3.3 with all content in intro, 0 sections) will NOT be caught by this filter.

**Fix options**:

- (A) Change `basic-checks.ts:272` from `Math.max(1, sections.length)` to `sections.length` (raw count). Then adjust the density calculation to avoid division by zero: `totalWords / Math.max(1, sectionCount)`. The returned `sectionCount` will then be 0 for sectionless content.
- (B) In the orchestrator, compute the section count independently: `const actualSectionCount = (content.match(/^#{2}\s+/gm) || []).length`. Check that value instead of relying on `densityResult.sectionCount`.

Option (A) is cleaner because it fixes the root cause and keeps the logic centralized.

---

### IMPORTANT -- Frontend callout normalization misses double-space variant

**File**: `packages/web/components/markdown/utils/callout-parser.tsx:69-71`

The regex `PRO\s*TIP` matches `PRO  TIP` (double space), but the normalization at line 71 compares against exact strings:

```typescript
const type = (rawType === 'pro tip' || rawType === 'protip' ? 'tip' : rawType) as CalloutType;
```

When the input is `> [!PRO  TIP]`, the captured group becomes `PRO  TIP`, and after `.toLowerCase()` it is `pro  tip`. This does NOT match `'pro tip'` (single space) or `'protip'`, so it falls through as `'pro  tip'` and gets cast as `CalloutType` -- which is invalid (the type is `'note' | 'tip' | 'warning' | 'danger' | 'info'`).

The backend in `structural-checks.ts:317` handles this correctly with `.replace(/\s+/g, ' ')` before comparing. The frontend is missing this whitespace normalization.

**Fix**: Add whitespace normalization before comparison:

```typescript
const rawType = match[1].toLowerCase().replace(/\s+/g, ' ');
const type = (rawType === 'pro tip' || rawType === 'protip' ? 'tip' : rawType) as CalloutType;
```

**Practical risk**: Low. LLMs almost never generate `PRO  TIP` with double space. But the inconsistency between backend and frontend normalization is a code quality concern, and the `as CalloutType` cast on an invalid value is technically unsound.

---

### SUGGESTION -- `passwordSchema` hardcodes Russian messages

**File**: `packages/web/app/[locale]/profile/validation-schemas.ts:49-63`

The static `passwordSchema` hardcodes Russian strings as fallback messages. The comment says "for components without i18n" which is accurate -- `AccountSettingsSection.tsx` imports it directly. This works for a Russian-only deployment but introduces a maintenance concern: if the app adds English support for the profile page, this schema will need updating or replacement.

This is fine for the current fix (unblocking CI), but consider adding a TODO comment to remind future developers.

---

### SUGGESTION -- Bundle size threshold bump lacks justification in code

**File**: `packages/course-gen-platform/scripts/analyze-processor-bundle.ts`

The `MAX_BUNDLE_SIZE_MB` was bumped from 2.0 to 2.5 without an inline comment explaining why. The commit message says `chore(stage6): bump bundle size threshold from 2.0 to 2.5 MB` which is descriptive but does not explain the cause. Adding a comment like `// Bumped 2026-04: new structural filters added ~0.4 MB` would help future maintainers.

---

### SUGGESTION -- Missing edge case test for table repair

**File**: `packages/web/components/markdown/__tests__/normalize-markdown-tables.test.ts`

The 4 new tests cover the primary patterns well (Pattern A, Pattern B, empty-line gap, valid table preservation). Two additional edge cases would improve confidence:

1. A broken row that spans 3+ lines (currently only 2-line merges are tested)
2. A table where the broken row is the LAST row (no next line to merge with)

These are not blocking, but would improve regression coverage.

---

### OBSERVATION -- `emptySections` filter name not in FILTER_WEIGHTS

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/orchestrator.ts:245`

The zero-section check pushes a failure with `filter: 'emptySections'`, but this filter name does not appear in `FILTER_WEIGHTS` and does not go through `accumulateFilterResult()`. It is pushed directly to `acc.failures` as a raw failure object. This is intentionally different from other filters -- it acts as a hard gate rather than a weighted score contributor. This design is correct for a critical structural check, but the asymmetry with other filters could cause confusion. A brief comment explaining why this bypasses the weight system would be helpful.

---

## 3. Code Quality Assessment

### Positive observations

1. **Backend/frontend parity**: The `PRO TIP` callout fix was applied consistently to both `structural-checks.ts` (backend judge) and `callout-parser.tsx` (frontend renderer). The normalization logic (`PRO TIP` -> `TIP`) is present in both locations.

2. **Well-structured table repair**: The `repairBrokenRows()` function in `normalize-markdown-tables.ts` is cleanly separated into detection (`looksLikeBrokenRow`, `hasUnmatchedQuotes`) and repair logic. The two-pattern approach (A: merge, B: replace) is well-documented with clear comments.

3. **Test quality**: The 4 new table tests cover distinct scenarios with descriptive names. The idempotency check in the existing test (`normalizeMalformedMarkdownTables(normalized)` == `normalized`) is a particularly good practice.

4. **Conservative repair strategy**: The table repair only merges when the result produces exactly `expectedColumns` cells. If the merge does not produce a valid row, the original lines pass through unchanged. This minimizes the risk of data loss.

5. **CI blocker fix is minimal**: The `passwordSchema` static export is the simplest possible fix -- it reuses the existing `createPasswordSchema` factory with hardcoded fallback messages. No unnecessary refactoring.

### Type safety

- Both `web` and `course-gen-platform` pass `tsc --noEmit` cleanly.
- The `as CalloutType` cast in `callout-parser.tsx:71` is technically unsafe for the double-space edge case (see IMPORTANT finding above), but otherwise correct.

### Test coverage

- Table repair: 4 new tests, all passing (7/7 total in the test file).
- Callout normalization: No new tests added. The existing tests in the callout-parser test file (if any) should cover the basic `PRO TIP` case, but no explicit test for the normalization mapping was observed in this diff.
- Section count validation: No tests. Given the dead code bug, tests would have caught this immediately.

---

## 4. Stray Files

The following files appear in the diff but are not related to Wave 2 quality fixes:

| File                                        | Issue                                             |
| ------------------------------------------- | ------------------------------------------------- |
| `.playwright-mcp/page-*.yml` (2 files)      | MCP artifacts, should be gitignored               |
| `lesson-2.2-full.png`, `lesson-2.2-ru.png`  | Screenshots in repo root, should not be committed |
| `docs/plans/groovy-humming-octopus.md`      | Plan file, acceptable                             |
| `docs/plans/serene-booping-sunbeam.md`      | Plan file (progress report), acceptable           |
| `docs/reports/PROGRESS-REPORT-MAR-2026.md`  | Separate deliverable, acceptable                  |
| `docs/reports/PROGRESS-REPORT-MAR-2026.pdf` | PDF binary in repo, consider .gitignore           |

**Recommendation**: Add `*.png` (root level) and `.playwright-mcp/` to `.gitignore`. Remove stray screenshots from the repository root.

---

## 5. Summary of Required Actions

| Priority   | Finding                                                                                    | Action                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| CRITICAL   | `sectionCount` is clamped to `Math.max(1, ...)`, making the zero-section check unreachable | Fix `basic-checks.ts` to return raw section count; adjust density division to avoid `/0` |
| IMPORTANT  | Frontend `callout-parser.tsx` does not normalize whitespace before comparing `pro  tip`    | Add `.replace(/\s+/g, ' ')` to line 69, matching the backend pattern                     |
| SUGGESTION | Add whitespace normalization comment or TODO for `passwordSchema` i18n hardcoding          | Low priority                                                                             |
| SUGGESTION | Add inline comment for bundle size threshold justification                                 | Low priority                                                                             |
| SUGGESTION | Add edge case tests for multi-line broken rows and last-row broken rows                    | Low priority                                                                             |
| SUGGESTION | Clean up stray `.png` files and `.playwright-mcp/` artifacts                               | Housekeeping                                                                             |

---

**Review complete. 1 critical, 1 important, 4 suggestions.**
