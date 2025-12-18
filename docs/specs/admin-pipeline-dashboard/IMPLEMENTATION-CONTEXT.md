# Pipeline Admin Dashboard - Implementation Context

> **Purpose**: This document provides complete context for continuing work on the Pipeline Admin Dashboard feature. Use this when starting a new conversation to understand what was built, why, and how.

## Executive Summary

The Pipeline Admin Dashboard (spec 015) is a superadmin-only interface for managing the course generation pipeline configuration. It allows editing LLM model configs, prompt templates, and global settings without code changes.

**Status**: Phases 1-9 COMPLETE (T001-T070), including seed data migration.

**Key URLs**:
- Frontend: `/admin/pipeline` (requires `superadmin` role)
- Backend: tRPC router `pipelineAdmin` at `/trpc/pipelineAdmin.*`

---

## What Was Built

### Database Layer (4 tables)

1. **`model_configs`** - LLM model configurations per pipeline phase
   - Fields: phase_name, config_type (global/course_override), model_id, fallback_model_id, temperature, max_tokens
   - Versioning: version column + is_active flag
   - Migration: `20251203135900_create_model_configs.sql`

2. **`model_config_history`** - Audit log for model config changes
   - Fields: model_config_id, changed_by, changes (JSONB diff), change_reason
   - Migration: `20251203140000_create_model_config_history.sql`

3. **`prompt_templates`** - Versioned prompt templates for stages 3-6
   - Fields: stage, prompt_key, prompt_name, prompt_description, prompt_template, variables (JSONB)
   - 13 prompts seeded from `prompt-registry.ts`
   - Migration: `20251203140100_create_prompt_templates.sql`
   - Seed: `20251203140500_seed_prompt_templates.sql`

4. **`pipeline_global_settings`** - Key-value store for global config
   - Fields: setting_key (unique), setting_value (JSONB), description
   - 5 default settings seeded
   - Migration: `20251203140300_create_pipeline_global_settings.sql`

### Backend Layer (tRPC Router)

**File**: `packages/course-gen-platform/src/server/routers/pipeline-admin.ts`

**Procedures** (all require superadmin role):

| Procedure | Type | Purpose |
|-----------|------|---------|
| `getStagesInfo` | query | Get pipeline stage metadata |
| `getPipelineStats` | query | Get generation statistics |
| `listModelConfigs` | query | List active model configs |
| `updateModelConfig` | mutation | Update config (creates new version) |
| `getModelConfigHistory` | query | Get version history |
| `revertModelConfigToVersion` | mutation | Restore old version |
| `resetModelConfigToDefault` | mutation | Reset to hardcoded default |
| `listOpenRouterModels` | query | List available models (cached) |
| `refreshOpenRouterModels` | mutation | Force cache refresh |
| `listPromptTemplates` | query | List prompts grouped by stage |
| `updatePromptTemplate` | mutation | Update prompt (creates new version) |
| `getPromptHistory` | query | Get prompt version history |
| `revertPromptToVersion` | mutation | Restore old prompt version |
| `getGlobalSettings` | query | Get all global settings |
| `updateGlobalSettings` | mutation | Update settings |
| `exportConfiguration` | query | Export all config as JSON |
| `validateImport` | query | Validate import data |
| `importConfiguration` | mutation | Import config with options |
| `listBackups` | query | List available backups |
| `restoreFromBackup` | mutation | Restore from backup |

### Frontend Layer (Next.js 15 + shadcn/ui)

**Location**: `packages/web/app/admin/pipeline/`

**Pages**:
- `page.tsx` - Main page with 4 tabs (Overview, Models, Prompts, Settings)
- `layout.tsx` - Superadmin-only access guard

**Components** (`components/` folder):

| Component | Purpose |
|-----------|---------|
| `pipeline-stats.tsx` | Statistics cards (courses, lessons, documents, jobs) |
| `pipeline-overview.tsx` | Stage cards with model info and actions |
| `models-config.tsx` | Model configs DataTable with edit/history actions |
| `model-editor-dialog.tsx` | Edit model config form |
| `config-history-dialog.tsx` | View/revert model config versions |
| `model-browser.tsx` | Browse OpenRouter models with filters |
| `prompts-editor.tsx` | Prompts by stage accordion with edit/history |
| `prompt-editor-dialog.tsx` | Edit prompt template with Monaco-like textarea |
| `prompt-history-dialog.tsx` | View/compare/revert prompt versions |
| `text-diff-viewer.tsx` | Side-by-side diff comparison |
| `settings-panel.tsx` | Global settings form |
| `export-import.tsx` | Export/import/backup management |
| `error-boundary.tsx` | Error handling wrapper |

**Server Actions**: `packages/web/app/actions/pipeline-admin.ts`
- Wraps all tRPC procedures with auth headers
- Used by React components via `'use server'`

---

## Architecture Decisions

### Versioning Pattern
- Each config/prompt update creates a NEW row with incremented `version`
- Old versions get `is_active = false`
- History is preserved, never deleted
- Revert = create new version copying old content

### Single Source of Truth
- Prompts: `prompt-registry.ts` → seeded to `prompt_templates` → editable via UI
- Settings: Hardcoded defaults in migration → editable via UI
- Feature flag `useDatabasePrompts` controls whether pipeline reads from DB or hardcode

### Access Control
- All tables have RLS policies requiring `superadmin` role
- Layout.tsx server-side checks role before rendering
- tRPC procedures verify role in middleware

### Caching
- OpenRouter models cached in memory (1 hour TTL)
- Force refresh via `refreshOpenRouterModels` mutation

---

## Key Files Reference

```
packages/course-gen-platform/
├── supabase/migrations/
│   ├── 20251203135900_create_model_configs.sql
│   ├── 20251203140000_create_model_config_history.sql
│   ├── 20251203140100_create_prompt_templates.sql
│   ├── 20251203140300_create_pipeline_global_settings.sql
│   └── 20251203140500_seed_prompt_templates.sql
├── src/server/routers/
│   └── pipeline-admin.ts (tRPC router)
└── src/shared/prompts/
    └── prompt-registry.ts (13 hardcoded prompts)

packages/web/
├── app/admin/pipeline/
│   ├── page.tsx (main page)
│   ├── layout.tsx (auth guard)
│   └── components/ (13 components)
└── app/actions/
    └── pipeline-admin.ts (server actions)

packages/shared-types/src/
├── pipeline-admin.ts (TypeScript types)
└── pipeline-admin-schemas.ts (Zod schemas)
```

---

## Database Seed Data

### prompt_templates (13 prompts)
- **Stage 3**: `stage3_classification_comparative`, `stage3_classification_independent`
- **Stage 4**: `stage4_phase1_classification`, `stage4_phase2_scope`, `stage4_phase3_expert`, `stage4_phase4_synthesis`
- **Stage 5**: `stage5_metadata_generator`, `stage5_sections_generator`
- **Stage 6**: `stage6_planner`, `stage6_expander`, `stage6_assembler`, `stage6_smoother`, `stage6_judge`

### pipeline_global_settings (5 settings)
- `rag_token_budget`: 20000
- `quality_threshold`: 0.85
- `retry_attempts`: 2
- `timeout_per_phase`: 120000ms
- `feature_flags`: {useDatabasePrompts: false, enableQualityValidation: true, enableCostTracking: true}

---

## Known Issues / Future Work

1. **useDatabasePrompts flag**: Currently `false` - pipeline still uses hardcoded prompts. Need to implement DB prompt loading in stage executors.

2. **Model Browser**: Shows all OpenRouter models but "Use this model" button not wired to ModelEditorDialog.

3. **Backup storage**: Backups stored in memory, not persisted. Consider Supabase Storage.

4. **Diff viewer**: Uses react-diff-viewer-continued, but styling could be improved for dark mode.

5. **Cost tracking**: UI exists but backend integration with actual cost data pending.

---

## How to Continue Development

1. **Read this document** to understand context
2. **Read tasks.md** at `specs/015-admin-pipeline-dashboard/tasks.md` for task details
3. **Check architecture doc** at `docs/specs/admin-pipeline-dashboard/ARCHITECTURE.md`
4. **Run the app**: `pnpm dev` → navigate to `/admin/pipeline` (need superadmin role)
5. **Verify DB**: Check Supabase tables have seed data

---

## Version History

- **v0.22.4** (2025-12-03): Initial implementation complete (T001-T070)
  - All 4 tabs functional
  - 13 prompts seeded
  - Export/import working
  - Model browser implemented
