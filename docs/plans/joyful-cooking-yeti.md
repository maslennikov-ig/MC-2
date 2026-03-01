# Plan: Refactoring Enrichment Multi-Generation System

## Context

The enrichment inspector panel in the generation graph (Stage 7) is outdated. It was built early with only 5 enrichment types (quiz, video, audio, presentation, cover), while the system now supports **14 types**. All UI strings are hardcoded as `locale === 'ru' ? ... : ...` instead of using `useTranslations()`. There is no UI for **batch creating enrichments** across multiple lessons, even though the backend `createBatch` tRPC procedure already exists. This plan modernizes the entire enrichment creation experience.

## Key Problems

1. **CreateView** supports only 5 of 14 types; all strings hardcoded (no i18n)
2. **EnrichmentAddGrid** shows 4 types, EmptyState shows 3, NodeToolbar shows 4
3. **`SUPPORTED_CREATE_TYPES`** blocks most types with "coming soon" placeholder
4. **No batch UI** -- `createBatch` tRPC exists but has no frontend
5. **Native HTML checkbox** used instead of shadcn/ui `Checkbox`

## Existing Infrastructure (ready to use, no changes needed)

- **Backend**: `enrichment.createBatch`, `generateBatchCovers`, `generateBatchCards`, `getGenerationStatus`, `getSummaryByCourse`
- **Schemas**: `enrichment-on-demand.ts` has Zod schemas for 11 on-demand types with all settings
- **Translations**: `enrichments.json` (ru+en) already has `forms.*` keys for all types, `batch.*` keys, `types.*`, `typeDescriptions.*`
- **Config**: `enrichment-config.ts` has icons, colors, order for all 14 types
- **Queue**: BullMQ with 5 concurrent workers, Supabase Realtime subscriptions

---

## Phase 1: Schema-Driven CreateView Refactoring

### 1.1 Create form config registry

**New file**: `packages/web/components/generation-graph/panels/stage7/forms/enrichment-form-config.ts`

Define a `FormFieldConfig[]` per enrichment type, mapping each field to:

- Field name (maps to settings key)
- Field type: `'select'` | `'slider'` | `'checkbox'`
- i18n label key under `enrichments.forms.*`
- Options/min/max/step/default values

Source defaults from Zod schemas in `enrichment-on-demand.ts`:

| Type                | Fields                                                              |
| ------------------- | ------------------------------------------------------------------- |
| quiz                | questionCount (slider 5-15), difficulty (select easy/medium/hard)   |
| audio               | voice (select default/male/female), speed (select slow/normal/fast) |
| nlm_audio           | nlm_audio_format (select deep_dive/brief/critique/debate)           |
| nlm_video           | nlm_video_format (select), nlm_video_style (select 10 options)      |
| presentation        | slideCount (slider 5-10), theme (select light/dark/colorful)        |
| cover, banner, card | style (select 5 options), colorScheme (select 4 options)            |
| nlm_study_guide     | detailLevel (select brief/standard/comprehensive)                   |
| nlm_flashcards      | cardCount (slider 5-50), difficulty (select)                        |
| nlm_mind_map        | depth (select shallow/standard/deep)                                |
| nlm_infographic     | orientation (select portrait/landscape), detailLevel (select)       |
| video               | voice (select 6 voices), speed (slider 0.5-2.0)                     |
| document            | (no settings -- description-only)                                   |

### 1.2 Create DynamicEnrichmentForm component

**New file**: `packages/web/components/generation-graph/panels/stage7/forms/DynamicEnrichmentForm.tsx`

- Takes `type`, renders fields from form config registry
- Uses `useTranslations('enrichments')` for ALL labels
- Renders each field with shadcn/ui (`Select`, `Slider`, `Checkbox` from `@/components/ui`)
- For types with no settings (document): show `t('typeDescriptions.${type}')` + Create button
- Manages form state with `useState`, calls `onDirtyChange` on changes
- Cancel/Create buttons use `t('forms.common.*')`

### 1.3 Rewrite CreateView

**File**: `packages/web/components/generation-graph/panels/stage7/views/CreateView.tsx`

- Delete all 5 inline form components (QuizCreateForm, VideoCreateForm, etc.)
- Expand `CreateViewProps.type` to accept all `CreateEnrichmentType` values
- Render `<DynamicEnrichmentForm>` for all types
- Keep existing error handling, submission logic, discard dialog
- Replace all `locale === 'ru'` with `useTranslations('enrichments')`

### 1.4 Update enrichment-inspector-store types

**File**: `packages/web/components/generation-graph/stores/enrichment-inspector-store.ts`

- Add NLM types to `CreateEnrichmentType`: `nlm_audio`, `nlm_video`, `nlm_study_guide`, `nlm_flashcards`, `nlm_mind_map`, `nlm_infographic`
- Remove legacy aliases: `podcast`, `mindmap`, `case_study`, `flashcards`, `project`, `discussion`, `reading`, `exercise`
- Add `'batch'` to `InspectorView`: `'root' | 'create' | 'detail' | 'batch'`
- Add `openBatch(type)` action

### 1.5 Update EnrichmentInspectorPanel

**File**: `packages/web/components/generation-graph/panels/stage7/EnrichmentInspectorPanel.tsx`

- Delete `SUPPORTED_CREATE_TYPES`, `mapToCreateViewType()`, `UnsupportedCreateTypePlaceholder`
- In `renderView()` case `'create'`: render `<CreateViewLazy>` for ALL types
- Add case `'batch'`: render `<BatchCreateViewLazy>` (Phase 3)
- Update header title for batch view

### 1.6 Update enrichment-actions server action

**File**: `packages/web/app/actions/enrichment-actions.ts`

- Expand `enrichmentType` enum to include all on-demand types

---

## Phase 2: Update All Type Grids and Toolbars

### 2.1 Update EnrichmentAddGrid in RootView

**File**: `packages/web/components/generation-graph/panels/stage7/views/RootView.tsx`

- Expand from 4 types to show all user-createable types (exclude `card` -- auto-generated)
- Use `ENRICHMENT_TYPE_CONFIG` from `enrichment-config.ts` for icons/colors
- Group into sections: Images (cover, banner) | Interactive (quiz, presentation) | Audio/Video (audio, nlm_audio, nlm_video) | AI Content (nlm_study_guide, nlm_flashcards, nlm_mind_map, nlm_infographic)
- Add "Batch Generate" button at the bottom that calls `openBatch()`

### 2.2 Update EmptyState discovery cards

**Same file**: Show 6 primary types: cover, quiz, nlm_audio, presentation, nlm_study_guide, nlm_flashcards

### 2.3 Update EnrichmentNodeToolbar

**File**: `packages/web/components/generation-graph/components/EnrichmentNodeToolbar.tsx`

- Replace hardcoded `TOOLBAR_BUTTONS` with config-driven from `ENRICHMENT_TYPE_CONFIG`
- Show top 5 types: cover, quiz, presentation, nlm_audio, nlm_study_guide
- "+" button defaults to opening a popover with all types (not just quiz)
- Replace all `locale === 'ru'` with `useTranslations('enrichments')`

### 2.4 Update EnrichmentAddPopover

**File**: `packages/web/components/generation-graph/panels/stage7/components/EnrichmentAddPopover.tsx`

- Replace hardcoded options with all createable types from config
- Replace `locale === 'ru'` with `useTranslations()`

### 2.5 Update EmptyStateCards

**File**: `packages/web/components/generation-graph/panels/stage7/views/EmptyStateCards.tsx`

- Replace hardcoded cards with config-driven types
- Remove legacy alias mappings
- Replace `locale === 'ru'` with `useTranslations()`

---

## Phase 3: Batch Enrichment Creation UI

### 3.1 Create batch enrichment store

**New file**: `packages/web/components/generation-graph/stores/batch-enrichment-store.ts`

Zustand + Immer store:

```
State: selectedLessonIds (Set), enrichmentType, settings, status (idle|confirming|submitting|tracking|completed|error), totalCount, completedCount, failedCount, enrichmentIds[], error
Actions: setEnrichmentType, setSettings, toggleLesson, selectAll, clearSelection, startBatch, confirmBatch, cancelBatch, updateProgress, setCompleted, setError, reset
```

### 3.2 Create BatchCreateView

**New file**: `packages/web/components/generation-graph/panels/stage7/views/BatchCreateView.tsx`

Multi-step wizard inside inspector panel:

**Step 1 -- Type & Settings**:

- Type selector (grid of enrichment types like EnrichmentAddGrid)
- `DynamicEnrichmentForm` for selected type
- "Next" button

**Step 2 -- Lesson Selection**:

- Fetch lessons via `StaticGraphContext.courseInfo`
- Scrollable list grouped by section/module
- `Checkbox` per lesson, "Select All"/"Deselect All"
- Dim lessons that already have this enrichment type (label: `t('batch.alreadyExists')`)
- Count: `t('batch.selectedCount', { count })`
- "Start Generation" button

**Step 3 -- Confirmation**:

- Dialog: `t('batch.confirmDescription', { count, type: t('types.X') })`
- On confirm: call `trpc.enrichment.createBatch.mutate({ lessonIds, enrichmentType, settings })`
- Lesson UUIDs resolved from Supabase query in Step 2

**Step 4 -- Progress**:

- `BatchProgressPanel` (see 3.4)

### 3.3 Create useBatchProgress hook

**New file**: `packages/web/components/generation-graph/hooks/useBatchProgress.ts`

- Polls `trpc.enrichment.getGenerationStatus` every 3s for each enrichment ID
- Subscribes to Supabase Realtime `lesson_enrichments` filtered by `course_id`
- Returns: `statuses (Map)`, `completedCount`, `failedCount`, `isComplete`, `progress`
- Stops polling when all terminal

### 3.4 Create BatchProgressPanel component

**New file**: `packages/web/components/generation-graph/panels/stage7/components/BatchProgressPanel.tsx`

- `<Progress>` bar (shadcn/ui) for overall
- Summary: `t('batch.inProgress', { completed, total })`
- Scrollable list: lesson name + status icon + per-enrichment progress
- "Done" button when complete

### 3.5 Add missing batch translation keys

**Files**: `packages/web/messages/{ru,en}/enrichments.json`

Add to `batch.*`:

```json
"selectLessons": "Select Lessons" / "Выберите уроки",
"selectAll": "Select All" / "Выбрать все",
"deselectAll": "Deselect All" / "Снять выделение",
"selectedCount": "{count} lessons selected" / "{count} уроков выбрано",
"alreadyExists": "Already exists" / "Уже создано",
"next": "Next" / "Далее",
"back": "Back" / "Назад",
"startGeneration": "Start Generation" / "Начать генерацию",
"cancel": "Cancel" / "Отмена",
"completed": "Batch generation complete" / "Массовая генерация завершена",
"failed": "{count} failed" / "{count} с ошибкой",
"settings": "Settings" / "Настройки",
"lessonSelection": "Lesson Selection" / "Выбор уроков",
"progress": "Progress" / "Прогресс",
"selectType": "Select type" / "Выберите тип"
```

---

## Phase 4: i18n Cleanup

Audit all modified files -- replace every `locale === 'ru'` with `useTranslations()`:

| File                         | Pattern Count (est.)  |
| ---------------------------- | --------------------- |
| CreateView.tsx               | ~20 (Phase 1 handles) |
| EnrichmentNodeToolbar.tsx    | ~8                    |
| RootView.tsx (delete toasts) | ~4                    |
| EnrichmentAddPopover.tsx     | ~5                    |
| EmptyStateCards.tsx          | ~6                    |
| DetailView.tsx               | audit needed          |

---

## Files Summary

### New files (6):

1. `.../panels/stage7/forms/enrichment-form-config.ts`
2. `.../panels/stage7/forms/DynamicEnrichmentForm.tsx`
3. `.../panels/stage7/views/BatchCreateView.tsx`
4. `.../stores/batch-enrichment-store.ts`
5. `.../hooks/useBatchProgress.ts`
6. `.../panels/stage7/components/BatchProgressPanel.tsx`

### Modified files (10):

1. `.../stores/enrichment-inspector-store.ts` -- types + batch view
2. `.../panels/stage7/views/CreateView.tsx` -- full rewrite
3. `.../panels/stage7/EnrichmentInspectorPanel.tsx` -- remove filters, add batch
4. `.../panels/stage7/views/RootView.tsx` -- expand grid + batch button
5. `.../components/EnrichmentNodeToolbar.tsx` -- expand types, i18n
6. `.../panels/stage7/components/EnrichmentAddPopover.tsx` -- expand types, i18n
7. `.../panels/stage7/views/EmptyStateCards.tsx` -- expand types, i18n
8. `.../app/actions/enrichment-actions.ts` -- expand type enum
9. `packages/web/messages/en/enrichments.json` -- batch keys
10. `packages/web/messages/ru/enrichments.json` -- batch keys

### Reference files (read-only):

- `packages/shared-types/src/enrichment-on-demand.ts` -- Zod schemas for settings
- `packages/web/lib/generation-graph/enrichment-config.ts` -- icons, colors, order
- `packages/course-gen-platform/src/server/routers/enrichment/router.ts` -- tRPC procedures

---

## Verification

After each phase:

- `pnpm --filter @megacampus/shared-types build`
- `pnpm --filter web type-check`
- `pnpm --filter web build`

Final checks:

- [ ] All 14 enrichment types render a form or description in CreateView
- [ ] Zero `locale === 'ru'` patterns in stage7 files
- [ ] Batch generation: select type, configure, select lessons, confirm, track progress
- [ ] Both ru and en locales render correctly (no missing keys)
- [ ] Supabase Realtime updates batch progress in near-real-time
