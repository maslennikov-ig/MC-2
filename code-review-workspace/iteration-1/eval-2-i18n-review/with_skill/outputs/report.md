# Code Review: Enrichments i18n Messages

**Date**: 2026-03-04
**Scope**: i18n translation files for enrichments feature (EN + RU)
**Files Reviewed**: 2
**Lines Changed**: +677 / -0 (both files, full review)

## Summary

| Category     | Critical | High  | Medium | Low   |
| ------------ | -------- | ----- | ------ | ----- |
| Issues       | 0        | 2     | 3      | 2     |
| Improvements | --       | 1     | 3      | 2     |
| **Total**    | **0**    | **3** | **6**  | **4** |

**Verdict**: NEEDS WORK -- has high issues that affect user-facing correctness

## Issues

### Critical

No critical issues found.

### High

#### 1. EN pluralization uses broken "(s)" / "(ies)" pattern instead of ICU plural format

- **File**: `packages/web/messages/en/enrichments.json:67,365,369`
- **Problem**: Three EN strings use a raw parenthesized plural hack -- `"{count} activity(ies)"`, `"{count} question(s)"`, `"{count} point(s)"` -- instead of proper ICU MessageFormat plurals. This renders literally as "1 activity(ies)" in the UI, which looks unprofessional and broken.
- **Impact**: Users see malformed plurals in the English UI. The RU counterpart for `questionsLabel` and `pointsEarned` correctly uses ICU `{count, plural, ...}`, but EN does not, creating an inconsistency where RU is more correct than EN.
- **Fix**:

```json
// Before
"enrichmentCount": "{count} activity(ies)"
"questionsLabel": "{count} question(s)"
"pointsEarned": "{count} point(s)"

// After
"enrichmentCount": "{count, plural, one {# activity} other {# activities}}"
"questionsLabel": "{count, plural, one {# question} other {# questions}}"
"pointsEarned": "{count, plural, one {# point} other {# points}}"
```

#### 2. EN uses simple `{count}` placeholder where RU uses ICU plural -- format mismatch

- **File**: `packages/web/messages/en/enrichments.json:308-309,338,366,591`
- **Problem**: Six EN strings use a plain `"{count} slides"` / `"{count} questions"` / `"{count} points"` pattern while the corresponding RU strings correctly use `{count, plural, one {...} few {...} many {...} other {...}}`. This means the EN and RU strings use different ICU formatting strategies for the same key. While next-intl can handle both, it creates a maintenance inconsistency where the EN always shows plural form even for count=1 ("1 slides", "1 questions").
- **Impact**: "1 slides" and "1 questions" will display in the English UI. Additionally, the mixed pattern makes future auditing harder.
- **Fix**:

```json
// Before (EN)
"questionsCount": "{count} questions"
"slidesCount": "{count} slides"
"pointsLabel": "{count} points"
"slideCount": "{count} slides ready"

// After (EN)
"questionsCount": "{count, plural, one {# question} other {# questions}}"
"slidesCount": "{count, plural, one {# slide} other {# slides}}"
"pointsLabel": "{count, plural, one {# point} other {# points}}"
"slideCount": "{count, plural, one {# slide ready} other {# slides ready}}"
```

### Medium

#### 3. Mixed terminology: "enrichment" vs "activity" used inconsistently within EN

- **File**: `packages/web/messages/en/enrichments.json` (multiple locations)
- **Problem**: The EN file uses two different terms for the same concept. User-facing labels (assetDock, inspector titles, create/delete confirmations) use "Activity" while error messages, viewer delete/regenerate messages, and the `inspector.noEnrichments` key itself still say "enrichment". This creates a confusing UX where the same object is called different names in different parts of the UI.
- **Impact**: Users may not realize "enrichment" and "activity" refer to the same thing. The inspector says "This lesson has no enrichments yet" but the add button says "Add Activity".
- **Fix**: Pick one term consistently. Since the UI headings already favor "Activity", update the remaining "enrichment" references:

```json
// Before
"noEnrichments": "This lesson has no enrichments yet"
"notFound": "Enrichment Not Found"
"notFoundDescription": "This enrichment may have been deleted or moved."
"generationFailed": "Failed to generate enrichment"

// After
"noEnrichments": "No activities yet"
"notFound": "Activity Not Found"
"notFoundDescription": "This activity may have been deleted or moved."
"generationFailed": "Failed to generate activity"
```

Note: The same inconsistency exists in RU with "обогащение/дополнение" vs "активность".

#### 4. NLM type naming inconsistency between `types` and `viewer.enrichmentTypes`

- **File**: `packages/web/messages/en/enrichments.json:5-6` vs `packages/web/messages/en/enrichments.json:384-385`
- **Problem**: `types.nlm_audio` = "Audio Lesson" but `viewer.enrichmentTypes.nlm_audio` = "NLM Audio". Same for nlm_video: "Video Lesson" vs "NLM Video". Users see different names for the same enrichment type depending on which UI area they are in. The same issue exists in RU ("Аудиоурок" vs "NLM-аудио").
- **Impact**: Confusing UX. "NLM Audio" is a technical internal term that leaks to users.
- **Fix**:

```json
// Before (viewer.enrichmentTypes)
"nlm_audio": "NLM Audio"
"nlm_video": "NLM Video"

// After (viewer.enrichmentTypes)
"nlm_audio": "Audio Lesson"
"nlm_video": "Video Lesson"
```

#### 5. RU `assetDock.enrichmentCount` uses broken "(ей)" pattern instead of ICU plural

- **File**: `packages/web/messages/ru/enrichments.json:67`
- **Problem**: `"{count} активность(ей)"` -- same broken parenthesized plural as EN but in Russian. This literally renders as "1 активность(ей)" or "5 активность(ей)" which is grammatically wrong in Russian.
- **Impact**: Broken Russian grammar in the activity count display.
- **Fix**:

```json
// Before
"enrichmentCount": "{count} активность(ей)"

// After
"enrichmentCount": "{count, plural, one {# активность} few {# активности} many {# активностей} other {# активностей}}"
```

### Low

#### 6. Eight enrichment types in `types` have no corresponding `typeDescriptions` entry

- **File**: `packages/web/messages/en/enrichments.json:13-20`
- **Problem**: `podcast`, `mindmap`, `case_study`, `flashcards`, `project`, `discussion`, `reading`, `exercise` all exist in `types` but have no matching key in `typeDescriptions`. If these types are rendered with tooltip/description lookup, they will silently fall back to the key name or show nothing.
- **Impact**: Low -- these may be placeholder/future types not yet active. But if they are used, descriptions will be missing.

#### 7. Duplicate `cancel` string defined in 5 separate locations

- **File**: `packages/web/messages/en/enrichments.json:55,125,170,150,463`
- **Problem**: The word "Cancel" is defined in `actions.cancel`, `draft.cancel`, `forms.common.cancel`, `batch.cancel`, and `viewer.cancel`. While this is not a bug, it increases maintenance burden. If the label needs to change (e.g., to "Never mind"), all 5 must be updated. Similar duplication exists for "edit", "back", "approve", "regenerate", "download".
- **Impact**: Low -- maintenance overhead only.

## Improvements

### High

#### 1. `videoPlayer` keys use space-separated strings instead of camelCase

- **File**: `packages/web/messages/en/enrichments.json:593-650`
- **Problem**: The `videoPlayer` section uses 15 keys with spaces in their names (e.g., `"Enter Fullscreen"`, `"Seek Forward"`, `"Caption Styles"`). This is inconsistent with every other section in the file which uses camelCase (`addEnrichment`, `slideCount`, etc.). Space-in-key requires bracket notation access (`t["Enter Fullscreen"]`) rather than dot notation.
- **Current**:

```json
"Enter Fullscreen": "Enter Fullscreen",
"Seek Forward": "Seek Forward"
```

- **Recommended**: These likely come from a video player library's expected key format (e.g., Vidstack) and may be required by that library. If so, document this exception with a comment or separate the video player translations into their own namespace. If not library-required, normalize to camelCase:

```json
"enterFullscreen": "Enter Fullscreen",
"seekForward": "Seek Forward"
```

### Medium

#### 2. `types.mindmap` vs `types.nlm_mind_map` inconsistent naming convention

- **File**: `packages/web/messages/en/enrichments.json:14` vs `packages/web/messages/en/enrichments.json:23`
- **Problem**: The non-NLM version uses `mindmap` (one word, no separator) while the NLM version uses `nlm_mind_map` (underscored, two words). The display names also differ: "Mindmap" vs "Mind Map". In RU: "Майндмэп" vs "Карта знаний".
- **Recommended**: Standardize to `mind_map` and "Mind Map" for both, or use a consistent convention.

#### 3. `viewer.nlmAudioVersion` / `viewer.nlmVideoVersion` expose "NLM" to users

- **File**: `packages/web/messages/en/enrichments.json:314-315`
- **Problem**: `"NLM audio version of lesson"` and `"NLM video version of lesson"` expose an internal acronym ("NLM" = NotebookLM) to end users who won't understand it.
- **Recommended**:

```json
// Before
"nlmAudioVersion": "NLM audio version of lesson"
"nlmVideoVersion": "NLM video version of lesson"

// After
"nlmAudioVersion": "Audio version of lesson"
"nlmVideoVersion": "Video version of lesson"
```

#### 4. `forms.presentation` has redundant near-duplicate keys

- **File**: `packages/web/messages/en/enrichments.json:238-243`
- **Problem**: `includeNotes` ("Include Speaker Notes") and `includeSpeakerNotes` ("Include Speaker Notes") have identical values. `slideCount` ("Number of Slides") and `maxSlides` ("Maximum Slides") serve a similar purpose. One of each pair is likely unused dead code.
- **Recommended**: Audit component usage and remove the unused key from each pair.

### Low

#### 5. `viewer.flashcards.cardCount` EN uses only `one/other` plural forms

- **File**: `packages/web/messages/en/enrichments.json:424`
- **Problem**: English only needs `one` and `other` forms, so `{count, plural, one {# card} other {# cards}}` is technically correct. However, for consistency with the RU file which uses `one/few/many/other`, it may be worth adding a comment noting this is intentional.
- **Recommended**: No action needed, this is correct. Noting for completeness.

#### 6. `viewer.resumingGeneration` EN uses only `one/other` while RU uses full plural set

- **File**: `packages/web/messages/en/enrichments.json:468`
- **Problem**: Same pattern as above -- correct for English but worth noting the divergence is intentional.
- **Recommended**: No action needed.

## Validation

- Type Check: SKIPPED (per task instructions)
- Build: SKIPPED (per task instructions)

## Files Reviewed

| File                                        | Lines |
| ------------------------------------------- | ----- |
| `packages/web/messages/en/enrichments.json` | 677   |
| `packages/web/messages/ru/enrichments.json` | 677   |

## Key Metrics

- Total translation keys: 551 (per locale)
- Key parity: 100% (EN and RU have identical key sets)
- Placeholder parity: 100% (all `{variable}` placeholders match)
- ICU plural coverage: RU uses proper plurals everywhere; EN is missing ICU plurals for 7 strings
- Untranslated strings: 0 (no RU values identical to EN, excluding brand names)
- Empty values: 0
- Whitespace issues: 0
