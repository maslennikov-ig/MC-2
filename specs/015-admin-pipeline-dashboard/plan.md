# Implementation Plan: Admin Pipeline Dashboard

**Branch**: `015-admin-pipeline-dashboard` | **Date**: 2025-12-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-admin-pipeline-dashboard/spec.md`

## Summary

Admin dashboard for superadmins to manage the 6-stage course generation pipeline. Provides:
- Visual pipeline overview with statistics (from `generation_trace`)
- Model configuration management with versioning (extending `llm_model_config`)
- Prompt template editor with versioning (new `prompt_templates` table)
- OpenRouter model browser with caching
- Configuration export/import with backup (new `config_backups` table)

## Technical Context

**Language/Version**: TypeScript 5.3+ (Strict Mode)
**Primary Dependencies**: Next.js 15, tRPC 10.x, Supabase, shadcn/ui, Immer (state management)
**Storage**: PostgreSQL (Supabase) - existing `llm_model_config`, new `prompt_templates`, `config_backups`
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web (Next.js App Router, Server Components)
**Project Type**: Monorepo (pnpm workspaces)
**Performance Goals**: <2s page load, <500ms cache retrieval
**Constraints**: Superadmin-only access, audit logging required, fallback to hardcoded values
**Scale/Scope**: Single superadmin user at a time, ~12 model configs, ~18 prompts

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Context-First Architecture | ✅ PASS | Full codebase analysis completed - existing admin router, procedures, langchain-models reviewed |
| II. Single Source of Truth | ✅ PASS | Types in `packages/shared-types`, re-export pattern followed |
| III. Strict Type Safety | ✅ PASS | TypeScript strict, Zod validation for all inputs |
| IV. Atomic Evolution | ✅ PASS | Tasks broken into small commits, `/push patch` after each |
| V. Quality Gates & Security | ✅ PASS | RLS policies required, superadminProcedure enforced, audit logging |
| VI. Library-First Development | ✅ PASS | shadcn/ui components, existing tRPC patterns, CodeMirror for editor |
| VII. Task Tracking & Artifacts | ✅ PASS | TodoWrite, tasks.md, artifact links |

## Project Structure

### Documentation (this feature)

```text
specs/015-admin-pipeline-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (tRPC router specs)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/web/app/admin/pipeline/
├── page.tsx                          # Main page with tabs
├── layout.tsx                        # Superadmin guard layout
├── components/
│   ├── pipeline-overview.tsx         # Pipeline stages visualization
│   ├── pipeline-stats.tsx            # Statistics cards
│   ├── models-config.tsx             # Models tab content
│   ├── model-editor-dialog.tsx       # Model edit modal
│   ├── model-selector.tsx            # OpenRouter model picker
│   ├── prompts-editor.tsx            # Prompts tab content
│   ├── prompt-editor-dialog.tsx      # Prompt edit modal with CodeMirror
│   ├── settings-panel.tsx            # Global settings tab
│   └── export-import.tsx             # Export/import functionality

packages/course-gen-platform/src/
├── server/routers/
│   └── pipeline-admin.ts             # New tRPC router for pipeline admin
├── services/
│   ├── openrouter-models.ts          # OpenRouter API service with caching
│   └── prompt-loader.ts              # Prompt loading with DB fallback
└── shared/prompts/
    └── prompt-registry.ts            # Hardcoded prompt fallbacks registry

packages/shared-types/src/
├── pipeline-admin.ts                 # Types for pipeline admin
├── prompt-template.ts                # Prompt template types
└── openrouter-models.ts              # OpenRouter model types

packages/course-gen-platform/supabase/migrations/
├── YYYYMMDDHHMMSS_create_prompt_templates.sql
├── YYYYMMDDHHMMSS_extend_llm_model_config.sql
└── YYYYMMDDHHMMSS_create_config_backups.sql
```

**Structure Decision**: Monorepo with packages/web (Next.js frontend) and packages/course-gen-platform (tRPC backend). New files integrate with existing admin infrastructure.

## Complexity Tracking

No constitution violations requiring justification.

## Component Architecture

### Frontend Components

```
PipelinePage (page.tsx)
├── Tabs (shadcn/ui)
│   ├── OverviewTab
│   │   ├── PipelineStats (4 stat cards)
│   │   └── PipelineOverview (6 stage cards in flow)
│   ├── ModelsTab
│   │   ├── ModelsConfigTable
│   │   ├── ModelEditorDialog
│   │   └── ModelSelector (with OpenRouter data)
│   ├── PromptsTab
│   │   ├── PromptsList (grouped by stage)
│   │   └── PromptEditorDialog (CodeMirror + variables panel)
│   └── SettingsTab
│       ├── GlobalSettingsForm
│       ├── FeatureFlagsPanel
│       └── ExportImportPanel
```

### Backend Services

```
pipelineAdminRouter (tRPC)
├── Pipeline Overview
│   ├── getStagesInfo
│   └── getPipelineStats
├── Model Configuration
│   ├── listModelConfigs
│   ├── updateModelConfig (creates version)
│   ├── getModelConfigHistory
│   ├── revertModelConfigToVersion
│   └── resetModelConfigToDefault
├── OpenRouter Models
│   ├── listOpenRouterModels (cached)
│   └── refreshOpenRouterModels
├── Prompt Templates
│   ├── listPromptTemplates
│   ├── getPromptTemplate
│   ├── updatePromptTemplate (creates version)
│   ├── getPromptHistory
│   └── revertPromptToVersion
├── Global Settings
│   ├── getGlobalSettings
│   └── updateGlobalSettings
└── Export/Import
    ├── exportConfiguration
    ├── validateImport
    ├── importConfiguration
    ├── listBackups
    └── restoreFromBackup
```

## Database Schema Changes

### 1. Extend `llm_model_config` (existing table)

```sql
-- Add versioning columns
ALTER TABLE llm_model_config ADD COLUMN version integer DEFAULT 1;
ALTER TABLE llm_model_config ADD COLUMN is_active boolean DEFAULT true;
ALTER TABLE llm_model_config ADD COLUMN created_by uuid REFERENCES users(id);

-- Extend phase_name constraint for new phases
ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;
ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check
  CHECK (phase_name = ANY (ARRAY[
    'phase_1_classification', 'phase_2_scope', 'phase_3_expert',
    'phase_4_synthesis', 'phase_6_rag_planning', 'emergency', 'quality_fallback',
    'stage_3_classification', 'stage_5_metadata', 'stage_5_sections',
    'stage_6_judge', 'stage_6_refinement'
  ]::text[]));

-- Unique constraint for active configs
CREATE UNIQUE INDEX idx_llm_model_config_active
  ON llm_model_config(config_type, phase_name, course_id)
  WHERE is_active = true;
```

### 2. Create `prompt_templates` (new table)

```sql
CREATE TABLE prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL CHECK (stage IN ('stage_3', 'stage_4', 'stage_5', 'stage_6')),
  prompt_key text NOT NULL,
  prompt_name text NOT NULL,
  prompt_description text,
  prompt_template text NOT NULL,
  variables jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),
  UNIQUE(stage, prompt_key, version)
);

-- RLS
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins can manage prompt_templates" ON prompt_templates
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));
```

### 3. Create `config_backups` (new table)

```sql
CREATE TABLE config_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_name text NOT NULL,
  backup_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),
  description text,
  backup_type text CHECK (backup_type IN ('manual', 'auto_pre_import', 'scheduled'))
);

-- RLS
ALTER TABLE config_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins can manage config_backups" ON config_backups
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

-- Cleanup trigger: keep only last 20 backups
CREATE OR REPLACE FUNCTION cleanup_old_backups() RETURNS trigger AS $$
BEGIN
  DELETE FROM config_backups WHERE id IN (
    SELECT id FROM config_backups ORDER BY created_at DESC OFFSET 20
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_old_backups
  AFTER INSERT ON config_backups
  FOR EACH STATEMENT EXECUTE FUNCTION cleanup_old_backups();
```

## Key Integration Points

### Existing Infrastructure to Use

1. **Admin Layout** (`packages/web/app/admin/layout.tsx`): Extend for superadmin check
2. **Admin Router** (`packages/course-gen-platform/src/server/routers/admin.ts`): Reference for patterns
3. **superadminProcedure** (`packages/course-gen-platform/src/server/procedures.ts`): Use for all endpoints
4. **langchain-models.ts**: Reference for hardcoded fallbacks, extend `PhaseName` type
5. **generation_trace table**: Source for pipeline statistics
6. **admin_audit_logs table**: Target for change logging

### External Dependencies

1. **OpenRouter API** (`GET https://openrouter.ai/api/v1/models`): Model listing
2. **In-memory cache**: Model list caching with 1-hour TTL (no Redis needed)
3. **CodeMirror 6**: Prompt editor with XML highlighting

## Library-First Development (Constitution VI)

**Principle**: Use existing libraries over custom implementations. See [research.md](./research.md) for details.

### New Dependencies to Add

| Library | Purpose | Rationale |
|---------|---------|-----------|
| `@uiw/react-codemirror` | Prompt editor | Best React wrapper for CodeMirror 6 |
| `@codemirror/lang-xml` | XML syntax highlighting | Pure XML mode, no HTML autocomplete noise |
| `fast-xml-parser` | XML validation | Pure JS, 8M+ downloads, TypeScript support |
| `json-diff-kit` | JSON config diff viewer | TypeScript-native, LCS algorithm |
| `react-diff-viewer-continued` | Prompt text diff viewer | GitHub-style side-by-side diff, dark theme |

### Existing Libraries to Reuse

| Library | Usage |
|---------|-------|
| **shadcn/ui components** | Tabs, Card, Dialog, Form, Table, Select, Slider, Badge, Toast, AlertDialog |
| **TanStack Table** | Data tables (via shadcn/ui DataTable) - already integrated |
| **react-hook-form + zod** | Form handling with validation |
| **Immer** | State management for complex updates |

### Components NOT to Build from Scratch

- Data tables → Use `shadcn/ui DataTable` with TanStack Table
- Form validation → Use `react-hook-form` + `zod`
- Dialogs/Modals → Use `shadcn/ui Dialog`
- Notifications → Use `shadcn/ui Toast`
- Code editor → Use `@uiw/react-codemirror`

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| OpenRouter API unavailable | Cache models for 1 hour, show cached data with warning |
| Invalid prompt breaks generation | Fallback to hardcoded prompts, validate XML syntax |
| Version history grows unbounded | Unlimited versions as per clarification (minimal storage impact) |
| Concurrent edits conflict | Optimistic locking with version check on save |
| Import corrupts config | Auto-backup before import, validation preview, rollback capability |

## Research Completed (Phase 0) ✅

See [research.md](./research.md) for full details.

| Topic | Decision |
|-------|----------|
| CodeMirror 6 integration | `@uiw/react-codemirror` with `@codemirror/lang-xml` |
| OpenRouter API schema | Documented, caching strategy defined |
| Versioned config tables | Version column + is_active flag pattern |
| XML validation | `fast-xml-parser` (server) + `DOMParser` (client) |
| Admin UI components | shadcn/ui DataTable (TanStack Table) |
| Version diff viewer | `json-diff-kit` |
| Prompt preview | Simple `{{var}}` replacement (no library needed) |
