# Code Review: Enrichments i18n Messages

**Date**: 2026-03-04
**Scope**: Pre-commit review of enrichments i18n message files
**Files**: 2 | **Changes**: +18 / -2 (since last enrichment refactor)

## Summary

|              | Critical | High | Medium | Low |
| ------------ | -------- | ---- | ------ | --- |
| Issues       | 0        | 2    | 2      | 1   |
| Improvements | —        | 1    | 2      | 1   |

**Verdict**: NEEDS WORK

Key parity is perfect (551 keys in both EN and RU), JSON is valid, and structure matches exactly. However, there are notable i18n anti-patterns, terminology inconsistencies, and missing ICU plural forms in EN that should be addressed.

## Issues

### High

#### 1. EN uses parenthetical plurals instead of ICU MessageFormat

- **File**: `packages/web/messages/en/enrichments.json:67`
- **Problem**: Three EN strings use `(s)` / `(ies)` pseudo-plural syntax which renders literally in the UI (e.g., "1 activity(ies)", "3 point(s)"). This is not valid ICU MessageFormat and `next-intl` will not process it as a plural.
- **Impact**: Users see ugly raw parenthetical text like "2 activity(ies)" instead of properly pluralized "2 activities". Unprofessional UX in both admin and student-facing views.
- **Affected keys**:
  - `assetDock.enrichmentCount` (line 67): `"{count} activity(ies)"`
  - `viewer.pointsEarned` (line 369): `"{count} point(s)"`
  - `viewer.questionsLabel` (line 365): `"{count} question(s)"`
- **Fix**: Convert to ICU plural syntax:
  ```json
  "enrichmentCount": "{count, plural, one {# activity} other {# activities}}"
  "pointsEarned": "{count, plural, one {# point} other {# points}}"
  "questionsLabel": "{count, plural, one {# question} other {# questions}}"
  ```

#### 2. EN missing ICU plurals where RU correctly has them

- **File**: `packages/web/messages/en/enrichments.json` (multiple lines)
- **Problem**: RU file correctly uses `{count, plural, one {...} few {...} many {...} other {...}}` for 6 strings, but their EN counterparts use plain `{count} items` without ICU plural. While English only needs `one`/`other`, the current approach means "1 questions" or "1 slides" displays incorrectly for count=1.
- **Impact**: Grammatical errors in EN UI when count is 1: "1 questions", "1 slides", "1 points".
- **Affected keys**:
  - `viewer.questionsCount` (line 308): `"{count} questions"` -- shows "1 questions"
  - `viewer.slidesCount` (line 309): `"{count} slides"` -- shows "1 slides"
  - `viewer.pointsLabel` (line 366): `"{count} points"` -- shows "1 points"
  - `draftPreview.slideCount` (line 590): `"{count} slides ready"` -- shows "1 slides ready"
- **Fix**: Add ICU plural for EN:
  ```json
  "questionsCount": "{count, plural, one {# question} other {# questions}}"
  "slidesCount": "{count, plural, one {# slide} other {# slides}}"
  "pointsLabel": "{count, plural, one {# point} other {# points}}"
  "slideCount": "{count, plural, one {# slide ready} other {# slides ready}}"
  ```

### Medium

#### 3. Mixed terminology: "enrichment" vs "activity" in EN

- **File**: `packages/web/messages/en/enrichments.json` (throughout)
- **Problem**: The EN file uses two different terms for the same concept: "activity" (16 occurrences) and "enrichment" (12 occurrences). User-facing UI elements like titles and buttons use "Activity" (e.g., `inspector.title`: "Lesson Activities"), but error messages and viewer actions use "Enrichment" (e.g., `viewer.deleteSuccess`: "Enrichment deleted", `errors.generationFailed`: "Failed to generate enrichment").
- **Impact**: Inconsistent UX -- a user clicks "Delete Activity" but sees the toast "Enrichment deleted". Confusing because the two terms appear to refer to different things.
- **Examples of conflict**:
  - `inspector.deleteConfirmTitle` (line 111): "Delete Activity?" but `viewer.confirmDeleteTitle` (line 456): "Delete enrichment?"
  - `inspector.deleteSuccess` (line 113): "Activity deleted" but `viewer.deleteSuccess` (line 458): "Enrichment deleted"
  - `inspector.notFound` (line 106): "Enrichment Not Found" but `inspector.title` (line 76): "Lesson Activities"
- **Fix**: Choose one term and apply consistently. Given that the UI headers already favor "Activity", convert all remaining "enrichment" references to "activity" in user-facing strings.

#### 4. Mixed terminology in RU: three different words for "enrichment"

- **File**: `packages/web/messages/ru/enrichments.json` (throughout)
- **Problem**: The RU file uses three different Russian translations for the same concept:
  - "активность" (16 occurrences) -- in inspector/assetDock/tabs sections
  - "дополнение" (10 occurrences) -- in errors/viewer/batch sections
  - "обогащение" (2 occurrences) -- in `inspector.notFound` and `inspector.notFoundDescription`
- **Impact**: Even more confusing than EN because a Russian user sees three completely different words for the same entity depending on context. "Обогащение не найдено" (line 106) is especially jarring when the rest of the inspector uses "активность".
- **Fix**: Standardize on "активность" (matching the UI sections) or "дополнение" (matching the concept of supplementary materials). The two "обогащение" instances at `inspector.notFound` (line 106) and `inspector.notFoundDescription` (line 107) are the most urgent to fix since they clash with their surrounding context.

### Low

#### 5. `assetDock.enrichmentCount` uses parenthetical plural in RU too

- **File**: `packages/web/messages/ru/enrichments.json:67`
- **Problem**: `"{count} активность(ей)"` uses the same parenthetical pattern. Unlike EN (which only has 2 plural forms), Russian has 4 plural forms, making this even more broken.
- **Impact**: Displays "5 активность(ей)" instead of "5 активностей". For count=1, shows "1 активность(ей)" instead of "1 активность".
- **Fix**: Convert to ICU plural:
  ```json
  "enrichmentCount": "{count, plural, one {# активность} few {# активности} many {# активностей} other {# активностей}}"
  ```

## Improvements

### High

#### 1. `types` vs `viewer.enrichmentTypes` label inconsistency for NLM types

- **File**: `packages/web/messages/en/enrichments.json:5-6` vs `packages/web/messages/en/enrichments.json:384-385`
- **Current**: `types.nlm_audio` = "Audio Lesson" but `viewer.enrichmentTypes.nlm_audio` = "NLM Audio". Same for `nlm_video`: "Video Lesson" vs "NLM Video". The user-friendly label ("Audio Lesson") is in `types`, but the internal jargon ("NLM Audio") is in `viewer.enrichmentTypes`.
- **Recommended**: Align `viewer.enrichmentTypes.nlm_audio` to "Audio Lesson" and `viewer.enrichmentTypes.nlm_video` to "Video Lesson" to match the `types` section. Same for RU (`viewer.enrichmentTypes.nlm_audio` should be "Аудиоурок" not "NLM-аудио").

### Medium

#### 2. 8 types in `types` have no `typeDescriptions` entry

- **File**: `packages/web/messages/en/enrichments.json:13-19`
- **Current**: The `types` section has 22 entries but `typeDescriptions` only has 14. Missing descriptions for: `podcast`, `mindmap`, `case_study`, `flashcards`, `project`, `discussion`, `reading`, `exercise`.
- **Recommended**: Either add descriptions for these 8 types, or remove them from `types` if they are unused. If they are planned/future types, add placeholder descriptions to prevent runtime issues if a description is ever looked up.

#### 3. 8 types in `types` not present in `viewer.enrichmentTypes`

- **File**: `packages/web/messages/en/enrichments.json:13-19` vs `packages/web/messages/en/enrichments.json:381-396`
- **Current**: `viewer.enrichmentTypes` has 14 entries but `types` has 22. Missing from viewer: `podcast`, `mindmap`, `case_study`, `flashcards`, `project`, `discussion`, `reading`, `exercise`. This creates a DRY concern -- two parallel enums that can drift apart.
- **Recommended**: If these types can appear in the viewer, add them. If not, consider consolidating the two maps or documenting why they differ. Ideally, there should be a single source of truth for enrichment type labels.

### Low

#### 4. `videoPlayer` keys use capitalized/spaced keys (non-standard)

- **File**: `packages/web/messages/en/enrichments.json:594-649`
- **Current**: Keys like `"Play"`, `"Seek Forward"`, `"Enter Fullscreen"`, `"Closed-Captions On"` use title-case with spaces. Every other section uses camelCase (`skipForward`, `enterFullscreen`).
- **Recommended**: This is likely dictated by a third-party video player library (vidstack) that expects these exact key names for its i18n configuration, so this is by design. No action needed, but a brief comment in the codebase near the vidstack integration would help future developers understand why these keys break convention.

## Positive Patterns

1. **Perfect key parity**: 551 keys in both EN and RU with zero mismatches and zero missing keys. This is excellent discipline for a file this large.

2. **RU ICU plurals are thorough**: All 8 plural strings in RU correctly include all four required Russian plural categories (`one`, `few`, `many`, `other`). This is often done incorrectly; here it is done right.

3. **Well-structured nesting**: The JSON is organized into clear semantic sections (`types`, `status`, `actions`, `inspector`, `viewer`, `forms`, `batch`, etc.) with consistent depth. The structure is identical between EN and RU, making maintenance straightforward.

4. **Good coverage of edge cases**: Error messages, empty states, loading states, and confirmation dialogs are all covered for both locales. The telegram notification section and long-generation timer are thoughtful UX touches.

## Escalation

None. These are i18n content files with no security, auth, or schema implications.

## Validation

- Type Check: SKIPPED (per task instructions)
- Build: SKIPPED (per task instructions)
- JSON Validity: PASS (both files parse without errors)
- Key Parity: PASS (551/551 keys match)
- Structural Match: PASS (identical nesting in both files)
