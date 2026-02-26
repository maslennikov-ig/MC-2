# Plan: Expose All NLM Audio/Video Formats in UI + Documentation

## Context

The NotebookLM bridge integration supports rich format/style options for audio and video generation, but the frontend UI only exposes a fraction of them:

- **Audio**: 4 formats exist (`deep_dive`, `brief`, `critique`, `debate`), but UI shows only 2 (`deep_dive`, `debate`)
- **Audio length**: Auto-calculated from lesson duration (correct, NOT user-selectable) — no changes needed
- **Video format**: 2 options (`explainer`, `brief`) — UI shows nothing (returns null)
- **Video style**: 10 options (from `auto_select` to `paper_craft`) — UI shows nothing

Additionally, the user requests internal documentation for NLM generation in `.claude/docs/`.

## Changes

### 1. Add missing audio formats to UI

**Files:**

- `packages/web/components/course/viewer/components/EnrichmentCardOptions.tsx` (lines 67-127)
- `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx` (line 161, 274-277, 392-397)

**What:**

- Expand `NlmAudioOptionsProps.nlmAudioFormat` type from `'deep_dive' | 'debate'` to `'deep_dive' | 'brief' | 'critique' | 'debate'`
- Add `<SelectItem>` entries for `brief` and `critique` in `EnrichmentCardOptions`
- Update `useState` default and type in `UnifiedEnrichmentCard`

### 2. Add video format + style selection to UI

**Files:**

- `packages/web/components/course/viewer/components/EnrichmentCardOptions.tsx`
  - Add `NlmVideoOptionsProps` interface with `nlmVideoFormat` and `nlmVideoStyle`
  - Render Select dropdowns for video format (2 options) and video style (10 options)
  - Remove `return null` for `nlm_video` type
- `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx`
  - Add `useState` for `nlmVideoFormat` (default `'explainer'`) and `nlmVideoStyle` (default `'auto_select'`)
  - Pass `nlm_video_format` and `nlm_video_style` in `getTypeSpecificSettings()` for `nlm_video` case
  - Wire props in `getEnrichmentOptionsProps()` for `nlm_video` case

### 3. i18n translations (EN + RU)

**Files:**

- `packages/web/messages/en/enrichments.json`
- `packages/web/messages/ru/enrichments.json`

**New keys under `forms`:**

```json
"nlmAudio": {
  "title": "...",
  "format": "...",
  "formatDeepDive": "Deep explanation",        / "Глубокое объяснение"
  "formatBrief": "Brief overview",             / "Краткий обзор"
  "formatCritique": "Critical analysis",       / "Критический разбор"
  "formatDebate": "Two-host debate"            / "Диалог двух ведущих (дебаты)"
},
"nlmVideo": {
  "title": "NLM Video Settings",              / "Настройки NLM-видео"
  "format": "Video Format",                   / "Формат видео"
  "formatExplainer": "Explainer",             / "Объяснение"
  "formatBrief": "Brief overview",            / "Краткий обзор"
  "style": "Visual Style",                    / "Визуальный стиль"
  "styleAutoSelect": "Automatic",             / "Автоматически"
  "styleCustom": "Custom",                    / "Пользовательский"
  "styleClassic": "Classic",                  / "Классический"
  "styleWhiteboard": "Whiteboard",            / "Доска"
  "styleKawaii": "Kawaii (cute)",             / "Кавай (милый)"
  "styleAnime": "Anime",                     / "Аниме"
  "styleWatercolor": "Watercolor",           / "Акварель"
  "styleRetroPrint": "Retro print",          / "Ретро-печать"
  "styleHeritage": "Heritage",               / "Наследие (классика)"
  "stylePaperCraft": "Paper craft"           / "Бумажное ремесло"
}
```

### 4. Create NLM documentation

**File:** `.claude/docs/nlm-generation-guide.md` (new)

Concise English reference covering:

- Architecture: Bridge service (FastAPI) → `notebooklm-py` → NotebookLM
- Audio: 4 formats, 3 lengths (auto), source strategies
- Video: 2 formats, 10 styles
- Duration: auto-calculated from `lesson.duration_minutes`, clamped to [4, 7] min
- Key files reference
- Bridge API endpoints

## Files to Modify

| File                                                                         | Change                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/web/components/course/viewer/components/EnrichmentCardOptions.tsx` | Add `brief`/`critique` audio options, add video format + style selectors |
| `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx` | Add state/props for all new options, wire settings                       |
| `packages/web/messages/en/enrichments.json`                                  | Add i18n keys for new formats/styles                                     |
| `packages/web/messages/ru/enrichments.json`                                  | Add i18n keys for new formats/styles                                     |
| `.claude/docs/nlm-generation-guide.md`                                       | New: NLM reference documentation                                         |

## What NOT to Change

- **Audio length** — stays automatic (resolveNlmDurationGuidance + inferAudioLengthFromTarget)
- **Backend handlers** — already support all formats
- **Bridge service** — already passes all formats to `notebooklm-py`
- **shared-types schemas** — already define all enums

## Verification

1. `pnpm type-check` — no type errors
2. `pnpm build` — builds successfully
3. Visual check: open lesson enrichment panel, verify:
   - NLM Audio shows 4 format options (deep_dive, brief, critique, debate)
   - NLM Video shows format selector (2 options) and style selector (10 options)
4. Language switch: verify all labels render in both EN and RU
5. Generate NLM audio with `brief` format — confirm `nlm_audio_format: 'brief'` in settings payload
6. Generate NLM video with `anime` style — confirm `nlm_video_style: 'anime'` in settings payload
