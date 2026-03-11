# Code Review: Enrichments i18n Messages

**Files reviewed:**

- `/home/me/code/mc2/packages/web/messages/en/enrichments.json` (677 lines)
- `/home/me/code/mc2/packages/web/messages/ru/enrichments.json` (677 lines)

**Review date:** 2026-03-04
**Branch:** develop
**Scope:** Recent changes including batch UI, inspector groups, discard/draft dialogs, flashcard fullscreen mode, coverBanner forms, audio/video voice options, and ICU plural upgrades.

---

## Summary

Overall the files are in good shape: both are valid JSON, have identical key structures (551 leaf keys, 613 total keys including nested objects), consistent key ordering, and no missing translations. The Russian translations are high-quality with proper ICU `{count, plural, ...}` forms using all four Russian plural categories (`one`, `few`, `many`, `other`).

However, there are several issues worth addressing before committing, ranging from plural format inconsistencies to terminology drift.

---

## Issues Found

### 1. MEDIUM: Inconsistent Pluralization -- EN Uses Fake Plurals Instead of ICU

Several English strings use `(s)` or `(ies)` parenthetical plurals instead of proper ICU `{count, plural, ...}` syntax. The Russian side correctly uses ICU plurals in most of these cases, making the EN side the inconsistent one.

**Affected keys:**

| Key                         | EN Value (broken)       | Should be                                                |
| --------------------------- | ----------------------- | -------------------------------------------------------- |
| `assetDock.enrichmentCount` | `{count} activity(ies)` | `{count, plural, one {# activity} other {# activities}}` |
| `viewer.questionsLabel`     | `{count} question(s)`   | `{count, plural, one {# question} other {# questions}}`  |
| `viewer.pointsEarned`       | `{count} point(s)`      | `{count, plural, one {# point} other {# points}}`        |

The `(s)` pattern renders literally in the UI (e.g., "1 activity(ies)"), which looks broken to users. The RU side already uses correct ICU plural for `assetDock.enrichmentCount`, so this is purely an EN-side issue.

### 2. MEDIUM: EN Missing ICU Plurals Where RU Has Them

Several EN keys use simple `{count} noun` format while their RU counterparts use proper ICU plural. This means the EN side will display "1 questions" or "1 slides" instead of "1 question" or "1 slide".

| Key                       | EN Value                   | RU Value                                       |
| ------------------------- | -------------------------- | ---------------------------------------------- |
| `viewer.questionsCount`   | `{count} questions`        | `{count, plural, one {# ...} few {# ...} ...}` |
| `viewer.slidesCount`      | `{count} slides`           | `{count, plural, one {# ...} few {# ...} ...}` |
| `viewer.pointsLabel`      | `{count} points`           | `{count, plural, one {# ...} few {# ...} ...}` |
| `draftPreview.slideCount` | `{count} slides ready`     | `{count, plural, one {# ...} few {# ...} ...}` |
| `batch.selectedCount`     | `{count} lessons selected` | (not pluralized in RU either)                  |

**Recommendation:** Add ICU plural to EN for all `{count}` strings where the noun changes between singular and plural.

### 3. MEDIUM: Terminology Inconsistency -- "Enrichment" vs "Activity"

The codebase is in transition from the internal term "enrichment" to the user-facing term "activity", but the migration is incomplete. Both terms coexist:

**EN uses "activity" in:**

- `assetDock.*`, `tabs.enrichments`, `inspector.title`, `inspector.addEnrichment`, `inspector.views.root`, `inspector.createSuccess`, `inspector.empty`, `inspector.deleteConfirmTitle`, `inspector.deleteConfirmDescription`, `inspector.deleteSuccess`

**EN uses "enrichment" in:**

- `inspector.noEnrichments`, `inspector.notFound`, `inspector.notFoundDescription`, `batch.confirmDescription`, `errors.*`, `viewer.confirmDeleteTitle`, `viewer.deleteSuccess`, `viewer.deleteFailed`, `viewer.generationComplete`, `viewer.generationFailed`

**RU has three different terms:**

- "активность" (activity) -- used in inspector/assetDock UI
- "дополнение" (supplement) -- used in errors/viewer/batch
- "обогащение" (enrichment, literal) -- used in `inspector.notFound` and `inspector.notFoundDescription`

**Recommendation:** Pick one user-facing term per locale and use it consistently. The `inspector.notFound` / `inspector.notFoundDescription` keys in RU use "обогащение" while everything else around them uses "активность" -- this is the most jarring inconsistency.

### 4. LOW: Duplicate Keys with Identical Values

Some sibling keys have identical values, which may indicate copy-paste issues or missed opportunities to consolidate:

**EN:**

- `types.flashcards` and `types.nlm_flashcards` both = `"Flashcards"`
- `forms.presentation.includeNotes` and `forms.presentation.includeSpeakerNotes` both = `"Include Speaker Notes"`
- `viewer.videoLesson` and `viewer.nlmVideoLesson` both = `"Video lesson"`
- `viewer.audioLesson` and `viewer.nlmAudioLesson` both = `"Audio lesson"`
- `placeholder.video.estimatedTime` and `placeholder.video.comingSoon` both = `"Coming Soon"`
- `images.regenerateSection` and `images.regenerateButton` both = `"Regenerate"`

**RU-specific duplicates:**

- `viewer.questionsCount` and `viewer.questionsLabel` have identical ICU plural strings
- `viewer.pointsLabel` and `viewer.pointsEarned` have identical ICU plural strings
- `videoPlayer.Disabled` and `videoPlayer.Disconnected` both = `"Отключено"` (these should probably differ -- "Disabled" vs "Disconnected")

**Recommendation for `presentation`:** `includeNotes` and `includeSpeakerNotes` are likely two different i18n keys used in different UI locations for the same feature. If only one is used, remove the dead key.

**Recommendation for `videoPlayer`:** `Disabled` and `Disconnected` have different semantic meanings. The RU translation for `Disconnected` should perhaps be "Отсоединено" or "Нет соединения" to differentiate from `Disabled` ("Отключено").

### 5. LOW: Future/Placeholder Types in `types` Not in DB Enum

The `types` section includes 8 keys not present in the database `enrichment_type` enum:

- `podcast`, `mindmap`, `case_study`, `flashcards`, `project`, `discussion`, `reading`, `exercise`

These appear to be planned future types. They have no corresponding `typeDescriptions`, `placeholder`, or `forms` entries.

**Note:** This is not necessarily a bug -- they may be reserved for future use -- but `types.flashcards` duplicates `types.nlm_flashcards` in naming, and `types.mindmap` uses a different casing pattern than `types.nlm_mind_map` (camelCase vs snake_case).

### 6. LOW: Missing `placeholder` Entries for Some DB Enum Types

The `placeholder` section (used for generation cards before content exists) is missing entries for:

- `document`
- `cover`
- `card`
- `banner`

If these types can appear as placeholder cards in the UI, their placeholder text will fall through to a default or throw an error.

### 7. LOW: Key Names Mismatched with Values

Several key names still use the word "enrichment" while their displayed values say "activity":

| Key                         | Value                   |
| --------------------------- | ----------------------- |
| `assetDock.addEnrichment`   | "Add activity"          |
| `assetDock.enrichmentCount` | "{count} activity(ies)" |
| `tabs.enrichments`          | "Activities"            |
| `inspector.addEnrichment`   | "Add Activity"          |

This is not a user-facing issue (users never see key names), but it creates developer confusion. Consider renaming these keys to match their values if a major refactor is planned.

### 8. INFO: Capitalization in `assetDock.addEnrichment`

EN `assetDock.addEnrichment` = `"Add activity"` (lowercase "a") while `inspector.addEnrichment` = `"Add Activity"` (uppercase "A"). If both are used as button labels, they should follow the same capitalization convention.

---

## What Looks Good

1. **Complete key parity** -- All 551 leaf keys exist in both EN and RU with zero gaps.
2. **Consistent key ordering** -- Both files have keys in identical order, making diff reviews easy.
3. **Valid JSON** -- Both files parse without errors.
4. **No empty strings** -- Every key has a non-empty value.
5. **No whitespace issues** -- No leading/trailing whitespace in any values.
6. **No untranslated strings** -- Every EN string has a unique RU translation (no copy-paste of English into the RU file).
7. **Proper Russian plurals** -- The RU file correctly uses ICU `{count, plural, one {...} few {...} many {...} other {...}}` with all four required Russian categories.
8. **Good ICU placeholder consistency** -- All `{variable}` placeholders match between EN and RU.
9. **Clean recent diffs** -- The recent changes (batch UI, groups, discard/draft, flashcard fullscreen, coverBanner forms) are well-structured and properly translated.
10. **No Cyrillic in EN / No Latin in RU** -- No locale contamination detected.
11. **Comprehensive coverage** -- Forms, viewer, batch, images, video player, switcher -- all major feature areas are covered.

---

## Recommended Actions (Priority Order)

1. **Fix fake plurals in EN** (`(s)` and `(ies)` patterns) -- these render as literal text in the UI.
2. **Add ICU plurals to EN** for `questionsCount`, `slidesCount`, `pointsLabel`, `slideCount` -- prevents "1 questions" display.
3. **Standardize terminology** -- pick "activity" or "enrichment" for EN, "активность" or "дополнение" for RU, and apply consistently.
4. **Fix RU `videoPlayer.Disconnected`** -- differentiate from `Disabled`.
5. **Audit `forms.presentation`** for dead keys (`includeNotes` vs `includeSpeakerNotes`).
6. **Consider adding `placeholder` entries** for `document`, `cover`, `card`, `banner` if these types can appear in placeholder UI.
