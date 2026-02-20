# Code Review Report: NLM Audio/Video Production Hardening

Date: 2026-02-20
Epic: `mc2-6ye5z`
Closed tasks: `mc2-6ye5z.1`, `mc2-6ye5z.2`, `mc2-6ye5z.3`
Deferred backlog: `mc2-6ye5z.4`..`mc2-6ye5z.9`

## What Was Implemented

### 1) Python NotebookLM bridge (audio/video options + hybrid sources)

Updated files:

- `packages/course-gen-platform/docker/notebooklm-bridge/app/models.py`
- `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`
- `packages/course-gen-platform/docker/notebooklm-bridge/tests/test_api.py`
- `packages/course-gen-platform/docker/notebooklm-bridge/README.md`

Changes:

- Extended request model with optional fields:
  - `sources[]` (`title`, `content`)
  - `audio_format`, `audio_length`
  - `video_format`, `video_style`
- Added strict trimming/validation for new string fields.
- Generator now:
  - Builds source list from `sources` (fallback to script source when omitted)
  - Adds all sources to NotebookLM notebook
  - Waits all sources until ready (parallel wait when API supports it)
  - Maps preset strings to notebooklm-py enums:
    - `AudioFormat`, `AudioLength`, `VideoFormat`, `VideoStyle`
  - Passes `source_ids` + presets to `generate_audio` / `generate_video`
- Response metadata enriched with:
  - `source_ids`, `source_count`, `source_titles`
  - selected preset fields
- Kept fallback policy behavior intact (still controlled by env; prod remains strict when fallback is disabled).

### 2) Stage7 TS wiring for NLM handlers

Updated files:

- `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-audio-handler.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-video-handler.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-notebooklm-bridge-client.test.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-nlm-audio-handler.test.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-nlm-video-handler.test.ts`

Changes:

- Bridge client request contract extended with:
  - `sources`
  - `audioFormat` / `audioLength`
  - `videoFormat` / `videoStyle`
- Added source normalization before HTTP send.
- `nlm_audio` final generation:
  - Source strategy support: `script_only | raw_only | hybrid`
  - Default strategy: `hybrid`
  - Default presets: `audioFormat=deep_dive`, `audioLength=default`
  - Hybrid bundle: draft script + raw lesson content + objectives/metadata block
- `nlm_video` final generation:
  - Same source strategy support/default
  - Default presets: `videoFormat=explainer`, `videoStyle=auto_select`
  - Hybrid bundle: video draft script + raw lesson content + objectives/metadata block
- Added metadata fields in final enrichment output:
  - `source_strategy_used`, `source_count`
  - `audio_format_preset`, `audio_length_preset`
  - `video_format_preset`, `video_style_preset`

### 3) Shared contracts (shared-types)

Updated files:

- `packages/shared-types/src/enrichment-on-demand.ts`
- `packages/shared-types/src/enrichment-settings.ts`
- `packages/shared-types/tests/enrichment-nlm-settings.test.ts`

Changes:

- Added NLM settings schemas/types:
  - `nlm_source_strategy`
  - `nlm_audio_format`, `nlm_audio_length`
  - `nlm_video_format`, `nlm_video_style`
- Added `nlm_audio` and `nlm_video` variants to `enrichmentSettingsSchema` and `getDefaultSettings`.
- Refactored `generateOnDemandInputSchema` to discriminated union by `enrichmentType` to avoid ambiguous settings parsing and preserve NLM-specific fields correctly.

## Verification Performed

### Unit/contract checks run

1. Course platform targeted tests:

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts \
  tests/unit/stages/stage7-notebooklm-bridge-client.test.ts \
  tests/unit/stages/stage7-nlm-audio-handler.test.ts \
  tests/unit/stages/stage7-nlm-video-handler.test.ts
```

Result: 3 files, 9 tests, all passed.

2. Shared-types tests:

```bash
pnpm --filter @megacampus/shared-types test
```

Result: 4 files, 149 tests, all passed.

3. Python bridge tests:

```bash
cd packages/course-gen-platform/docker/notebooklm-bridge
.venv/bin/python -m pytest -q tests/test_api.py
```

Result: 8 tests, all passed.

4. Type checks:

```bash
pnpm --filter @megacampus/shared-types type-check
pnpm --filter @megacampus/course-gen-platform type-check
```

Result: both passed.

5. Formatting check on changed TS/MD files:

```bash
pnpm exec prettier --check <changed files>
```

Result: passed after auto-formatting two new test files.

6. Lint checks:

```bash
pnpm --filter @megacampus/course-gen-platform lint
pnpm --filter @megacampus/shared-types lint
```

Result: passed (warnings only, no new lint errors introduced by this change set).

7. Build checks:

```bash
pnpm --filter @megacampus/shared-types build
pnpm --filter @megacampus/course-gen-platform build
```

Result: both builds passed.

## Documentation Source Used (Context7)

Used Context7 for current notebooklm-py API verification:

- Library: `/teng-lin/notebooklm-py`
- Verified capabilities and enums for:
  - `generate_audio(audio_format, audio_length)`
  - `generate_video(video_format, video_style)`
  - source ingestion methods and `source_ids` behavior
- Reference: `docs/python-api.md` in notebooklm-py repository.

## Notes for Reviewer

- Two-stage UX behavior was not changed (draft phase still separate from final generation).
- Existing enrichments were not modified; only NLM audio/video path was hardened.
- Deferred artifacts (slide deck/report/quiz/flashcards/infographic/data table/mind map) are tracked in Beads and intentionally not implemented in this wave.
