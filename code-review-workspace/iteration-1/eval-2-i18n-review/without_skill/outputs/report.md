# Code Review: Enrichments i18n Messages

**Files reviewed:**

- `/home/me/code/mc2/packages/web/messages/en/enrichments.json` (677 lines, 19,530 chars)
- `/home/me/code/mc2/packages/web/messages/ru/enrichments.json` (677 lines, 20,876 chars)

**Scope:** 551 translation keys across 30 consuming components in `packages/web/`

---

## Summary

Overall, these files are in good shape. Both JSON files are valid, key counts match perfectly (551 keys each), there are no formatting issues (no trailing whitespace, no empty strings, no double spaces), and nesting depth is consistent at 3 levels. The Russian translations are thorough and use proper ICU plural forms where needed.

However, there are several issues worth addressing, ranging from bugs that will produce incorrect UI text to inconsistencies that may confuse users or future developers.

---

## Critical Issues

### 1. EN uses parenthetical pseudo-plurals instead of ICU MessageFormat

**Severity:** Bug -- will display literal parenthetical text like "activity(ies)" to the user.

Three keys in EN use a non-standard `(ies)`/`(s)` pseudo-plural pattern that next-intl will NOT process as plurals. These will render literally as-is:

| Key                         | EN value (broken)       | RU value (correct ICU)             |
| --------------------------- | ----------------------- | ---------------------------------- |
| `assetDock.enrichmentCount` | `{count} activity(ies)` | `{count} активность(ей)`           |
| `viewer.questionsLabel`     | `{count} question(s)`   | ICU plural with one/few/many/other |
| `viewer.pointsEarned`       | `{count} point(s)`      | ICU plural with one/few/many/other |

**Note:** The RU `assetDock.enrichmentCount` has the same problem -- `{count} активность(ей)` is also pseudo-plural, not ICU.

**Fix:** Convert to proper ICU MessageFormat:

```json
"enrichmentCount": "{count, plural, one {# activity} other {# activities}}"
```

### 2. EN missing ICU plurals where RU correctly uses them

**Severity:** Bug (minor in English, but inconsistent behavior between locales).

Six keys use a simple `{count} noun` pattern in EN, while RU correctly uses ICU `{count, plural, ...}`:

| Key                       | EN (non-ICU)           | RU (ICU)                                     |
| ------------------------- | ---------------------- | -------------------------------------------- |
| `viewer.questionsCount`   | `{count} questions`    | `{count, plural, one {# ...} few {...} ...}` |
| `viewer.slidesCount`      | `{count} slides`       | ICU plural                                   |
| `viewer.questionsLabel`   | `{count} question(s)`  | ICU plural                                   |
| `viewer.pointsLabel`      | `{count} points`       | ICU plural                                   |
| `viewer.pointsEarned`     | `{count} point(s)`     | ICU plural                                   |
| `draftPreview.slideCount` | `{count} slides ready` | ICU plural                                   |

In English this matters less than in Russian (since English only has singular/plural), but "1 questions" or "1 slides" will render incorrectly. Using ICU `{count, plural, one {# question} other {# questions}}` fixes this.

---

## Medium Issues

### 3. Inconsistent RU terminology for "enrichment"

**Severity:** Medium -- confusing UX. Three different Russian words are used for the same concept ("enrichment"):

| Russian term                           | Where used                                            | Count  |
| -------------------------------------- | ----------------------------------------------------- | ------ |
| **"активность"** (activity)            | `assetDock.*`, `inspector.*` (admin panel)            | 8 keys |
| **"дополнение"** (supplement)          | `errors.*`, `viewer.*` (student-facing)               | 7 keys |
| **"обогащение"** (enrichment, literal) | `inspector.notFound`, `inspector.notFoundDescription` | 2 keys |

The split between "активность" (admin) and "дополнение" (viewer) may be intentional context-dependent terminology, but `inspector.notFound` using "обогащение" while the rest of inspector uses "активность" is clearly inconsistent.

**Recommendation:**

- Pick one term for the inspector context (likely "активность" since the rest of inspector uses it).
- Document the intentional admin vs. viewer terminology split if it is deliberate.

### 4. `types` vs `viewer.enrichmentTypes` naming discrepancy for NLM types

**Severity:** Medium -- user-visible inconsistency.

| Type key         | `types.*`      | `viewer.enrichmentTypes.*` |
| ---------------- | -------------- | -------------------------- |
| `nlm_audio` (EN) | "Audio Lesson" | "NLM Audio"                |
| `nlm_video` (EN) | "Video Lesson" | "NLM Video"                |
| `nlm_audio` (RU) | "Аудиоурок"    | "NLM-аудио"                |
| `nlm_video` (RU) | "Видеоурок"    | "NLM-видео"                |

The `viewer.enrichmentTypes` versions expose the internal "NLM" abbreviation to end users, which is meaningless to them. The `types.*` versions ("Audio Lesson" / "Video Lesson") are more user-friendly.

### 5. Eight types defined in `types` have no `typeDescriptions` entries

These types exist in `types` but have no description:

- `podcast`, `mindmap`, `case_study`, `flashcards`, `project`, `discussion`, `reading`, `exercise`

They also have no `placeholder.*` or `viewer.enrichmentTypes.*` entries. If these are planned-but-not-yet-implemented types, consider either:

- Adding `typeDescriptions` for completeness, or
- Moving them to a separate `plannedTypes` section to distinguish them from active types.

---

## Low Issues

### 6. Duplicate values that could indicate copy-paste or consolidation opportunity

**EN duplicates:**

- `types.flashcards` and `types.nlm_flashcards` both = "Flashcards"
- `forms.presentation.includeNotes` and `forms.presentation.includeSpeakerNotes` both = "Include Speaker Notes" (likely one is unused)
- `viewer.videoLesson` and `viewer.nlmVideoLesson` both = "Video lesson" (loses the NLM distinction)
- `viewer.audioLesson` and `viewer.nlmAudioLesson` both = "Audio lesson"

**RU duplicates of note:**

- `videoPlayer.Disabled` and `videoPlayer.Disconnected` both = "Отключено" -- these have distinct meanings ("disabled" vs "disconnected") and should use different translations. Suggestion: "Disconnected" = "Отсоединено" or "Нет подключения".

### 7. videoPlayer keys use PascalCase with spaces

The `videoPlayer` section uses keys like `"Seek Forward"`, `"Enter Fullscreen"`, `"Closed-Captions On"`. This is clearly an intentional mapping for the vidstack media player library and is **not a bug**, but worth noting for awareness. These keys follow vidstack's label API, not the project's camelCase convention.

### 8. Minor EN plural inconsistency in `viewer.flashcards.cardCount`

This key correctly uses ICU plural format:

```json
"cardCount": "{count, plural, one {# card} other {# cards}}"
```

But similar keys like `viewer.questionsCount` do NOT use ICU format. The ICU approach in `cardCount` is correct -- the others should follow the same pattern.

---

## Structural Observations (Informational)

### Key count and organization

- **551 keys** total in each locale file -- this is a large i18n namespace.
- **Top-level sections:** `types`, `typeDescriptions`, `status`, `actions`, `assetDock`, `tabs`, `inspector`, `discard`, `draft`, `twoStage`, `batch`, `errors`, `forms`, `comingSoon`, `generationLog`, `viewer`, `placeholder`, `images`, `telegram`, `generate`, `generating`, `longGeneration`, `options`, `cancel`, `retry`, `draftReady`, `draftPreview`, `videoPlayer`, `switcher`
- The `viewer` section alone is ~170 keys -- it might benefit from being split into a separate namespace if it continues growing.

### Key naming conventions

- **camelCase:** 258 keys (project convention)
- **snake_case:** 29 keys (all are enrichment type identifiers like `nlm_audio`, `draft_ready` -- these mirror database enum values, which is correct)
- **PascalCase/spaces:** 56 keys (all in `videoPlayer` section -- vidstack library mapping)

### Placeholder variables

All `{variable}` placeholders match perfectly between EN and RU across all 551 keys. No missing or extra variables.

---

## Recommendations (Priority Order)

1. **Fix EN pseudo-plurals** -- Convert `activity(ies)`, `question(s)`, `point(s)` to proper ICU MessageFormat. Also fix RU `активность(ей)`.
2. **Add ICU plurals to EN** for `questionsCount`, `slidesCount`, `pointsLabel`, `draftPreview.slideCount`.
3. **Unify RU terminology** -- Replace `inspector.notFound`/`notFoundDescription` "обогащение" with "активность" to match the rest of the inspector section.
4. **Align `viewer.enrichmentTypes` names** -- Replace "NLM Audio"/"NLM Video" with "Audio Lesson"/"Video Lesson" to match `types.*` and hide internal jargon from users.
5. **Differentiate RU `videoPlayer.Disabled` vs `videoPlayer.Disconnected`** translations.
6. **Decide on the 8 "planned" types** -- add descriptions or separate them from active types.
7. **Review `forms.presentation` duplicates** -- `includeNotes` vs `includeSpeakerNotes` appear to serve the same purpose.

---

## Verdict

**Mostly good.** The files are well-structured, complete, and maintain perfect key parity between locales. The Russian translations are natural and high-quality with proper ICU plural forms. The main actionable findings are: (1) fix the broken pseudo-plural strings in EN that will render incorrectly in the UI, (2) standardize the Russian terminology for "enrichment" across sections, and (3) align NLM type display names across sections to avoid exposing internal jargon.
