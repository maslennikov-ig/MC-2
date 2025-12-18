# Pipeline Admin Dashboard - Architecture Reference

> **Purpose**: Quick architecture reference for Claude Code when working on Pipeline Admin features. Read this to understand the system structure before making changes.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js 15)                           │
│  /admin/pipeline                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  layout.tsx (superadmin guard)                                   │   │
│  │  ┌───────────────────────────────────────────────────────────┐  │   │
│  │  │  page.tsx (Tabs: Overview | Models | Prompts | Settings)  │  │   │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐         │  │   │
│  │  │  │ pipeline-   │ │ models-     │ │ prompts-    │ ...     │  │   │
│  │  │  │ stats.tsx   │ │ config.tsx  │ │ editor.tsx  │         │  │   │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘         │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                    Server Actions (pipeline-admin.ts)                   │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │ HTTP (Bearer JWT)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BACKEND (course-gen-platform)                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  tRPC Router: pipelineAdmin                                      │   │
│  │  /trpc/pipelineAdmin.{procedure}                                 │   │
│  │  ┌─────────────────────────────────────────────────────────────┐│   │
│  │  │ Procedures: getStagesInfo, listModelConfigs, updatePrompt...││   │
│  │  └─────────────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                    Supabase Admin Client                                │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │ PostgreSQL
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATABASE (Supabase)                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐   │
│  │  model_configs  │ │ prompt_templates│ │ pipeline_global_settings│   │
│  │  (versioned)    │ │ (versioned)     │ │ (key-value)             │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────────────┘   │
│  ┌─────────────────┐                                                    │
│  │ model_config_   │  RLS: All tables require superadmin role           │
│  │ history (audit) │                                                    │
│  └─────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Read Flow (Query)
```
Component → useState/useEffect → Server Action → tRPC Query → Supabase → Response
```

### Write Flow (Mutation)
```
User Action → Form Submit → Server Action → tRPC Mutation → Supabase →
  → Create new version (is_active=true)
  → Deactivate old version (is_active=false)
  → Return updated data
```

### Versioning Flow
```
UPDATE model_config:
1. Find current active version for (phase_name, config_type)
2. Set current.is_active = false
3. INSERT new row with version = current.version + 1, is_active = true
4. INSERT audit record into model_config_history

REVERT to version N:
1. Read version N data
2. Follow UPDATE flow with version N's content
3. New version = max(version) + 1
```

---

## Component Tree

```
PipelineAdminPage (page.tsx)
├── Tabs
│   ├── TabsContent[overview]
│   │   ├── PipelineStats
│   │   │   └── Card × 4 (courses, lessons, documents, jobs)
│   │   └── PipelineOverview
│   │       └── StageCard × 6 (stages 1-6)
│   │           └── ModelEditorDialog (on edit click)
│   │
│   ├── TabsContent[models]
│   │   ├── ModelsConfig
│   │   │   ├── DataTable (model configs)
│   │   │   ├── ModelEditorDialog (on edit)
│   │   │   └── ConfigHistoryDialog (on history)
│   │   └── ModelBrowser
│   │       └── DataTable (OpenRouter models)
│   │
│   ├── TabsContent[prompts]
│   │   └── PromptsEditor
│   │       ├── Accordion × 4 (stages 3-6)
│   │       │   └── PromptCard × N
│   │       │       ├── PromptEditorDialog (on edit)
│   │       │       └── PromptHistoryDialog (on history)
│   │       │           └── TextDiffViewer (on compare)
│   │
│   └── TabsContent[settings]
│       ├── SettingsPanel
│       │   └── Form (RAG budget, quality, retries, timeout, flags)
│       └── ExportImportPanel
│           ├── Export section (download JSON)
│           ├── Import section (upload + validate + apply)
│           └── Backups section (list + restore)
```

---

## Database Schema

### model_configs
```sql
id              UUID PRIMARY KEY
phase_name      TEXT NOT NULL (stage_3..stage_6, summarizer, etc.)
config_type     TEXT NOT NULL (global | course_override)
course_id       UUID NULL (only for course_override)
model_id        TEXT NOT NULL (e.g., "anthropic/claude-3-opus")
fallback_model_id TEXT NULL
temperature     NUMERIC(3,2) DEFAULT 0.7
max_tokens      INTEGER DEFAULT 4096
version         INTEGER NOT NULL DEFAULT 1
is_active       BOOLEAN NOT NULL DEFAULT true
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
created_by      UUID REFERENCES users(id)

UNIQUE(phase_name, config_type, course_id, version)
UNIQUE INDEX ON (phase_name, config_type, course_id) WHERE is_active = true
```

### prompt_templates
```sql
id              UUID PRIMARY KEY
stage           TEXT NOT NULL CHECK (stage IN ('stage_3','stage_4','stage_5','stage_6'))
prompt_key      TEXT NOT NULL (e.g., "stage6_planner")
prompt_name     TEXT NOT NULL
prompt_description TEXT
prompt_template TEXT NOT NULL (the actual prompt)
variables       JSONB DEFAULT '[]' (array of {name, description, required, example})
version         INTEGER NOT NULL DEFAULT 1
is_active       BOOLEAN NOT NULL DEFAULT true
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
created_by      UUID REFERENCES users(id)

UNIQUE(stage, prompt_key, version)
UNIQUE INDEX ON (stage, prompt_key) WHERE is_active = true
```

### pipeline_global_settings
```sql
id              UUID PRIMARY KEY
setting_key     TEXT NOT NULL UNIQUE
setting_value   JSONB NOT NULL (can be number, string, object)
description     TEXT
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
created_by      UUID REFERENCES users(id)
```

### model_config_history (audit)
```sql
id              UUID PRIMARY KEY
model_config_id UUID REFERENCES model_configs(id)
changed_by      UUID REFERENCES users(id)
changes         JSONB NOT NULL (diff of what changed)
change_reason   TEXT
created_at      TIMESTAMPTZ
```

---

## tRPC Procedures Reference

### Models
| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `listModelConfigs` | none | ModelConfig[] | Active only |
| `updateModelConfig` | {id, modelId?, ...} | ModelConfig | Creates new version |
| `getModelConfigHistory` | {phaseName, configType?, courseId?} | HistoryEntry[] | All versions |
| `revertModelConfigToVersion` | {phaseName, targetVersion} | ModelConfig | Creates new version |
| `resetModelConfigToDefault` | {phaseName} | ModelConfig | From hardcoded |

### Prompts
| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `listPromptTemplates` | none | GroupedByStage | Active only |
| `updatePromptTemplate` | {id, promptTemplate?, ...} | PromptTemplate | Creates new version |
| `getPromptHistory` | {stage, promptKey} | HistoryEntry[] | All versions |
| `revertPromptToVersion` | {stage, promptKey, targetVersion} | PromptTemplate | Creates new version |

### Settings
| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `getGlobalSettings` | none | SettingsObject | Merged from DB |
| `updateGlobalSettings` | {ragTokenBudget?, ...} | SettingsObject | Partial update |

### Export/Import
| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `exportConfiguration` | none | ExportData | Full config dump |
| `validateImport` | {exportData} | ValidationResult | Dry run |
| `importConfiguration` | {exportData, options} | ImportResult | With backup option |
| `listBackups` | none | Backup[] | In-memory storage |
| `restoreFromBackup` | {backupId, options} | RestoreResult | Selective restore |

### Utilities
| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `getStagesInfo` | none | StageInfo[] | Static metadata |
| `getPipelineStats` | {periodDays?} | Stats | From course_generations |
| `listOpenRouterModels` | {filters?} | Model[] | Cached 1 hour |
| `refreshOpenRouterModels` | none | Model[] | Force refresh |

---

## File Locations Quick Reference

```
TYPES:
  packages/shared-types/src/pipeline-admin.ts
  packages/shared-types/src/pipeline-admin-schemas.ts

BACKEND:
  packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  packages/course-gen-platform/src/server/app-router.ts (registration)

FRONTEND:
  packages/web/app/admin/pipeline/page.tsx
  packages/web/app/admin/pipeline/layout.tsx
  packages/web/app/admin/pipeline/components/*.tsx (13 files)
  packages/web/app/actions/pipeline-admin.ts

MIGRATIONS:
  packages/course-gen-platform/supabase/migrations/20251203135900_*.sql
  packages/course-gen-platform/supabase/migrations/20251203140000_*.sql
  packages/course-gen-platform/supabase/migrations/20251203140100_*.sql
  packages/course-gen-platform/supabase/migrations/20251203140300_*.sql
  packages/course-gen-platform/supabase/migrations/20251203140500_*.sql

PROMPTS (source of truth for seed):
  packages/course-gen-platform/src/shared/prompts/prompt-registry.ts
```

---

## Access Control Matrix

| Resource | superadmin | admin | user |
|----------|------------|-------|------|
| /admin/pipeline | ✅ | ❌ | ❌ |
| model_configs (RLS) | ✅ | ❌ | ❌ |
| prompt_templates (RLS) | ✅ | ❌ | ❌ |
| pipeline_global_settings (RLS) | ✅ | ❌ | ❌ |
| tRPC pipelineAdmin.* | ✅ | ❌ | ❌ |

---

## Common Tasks

### Add new prompt template
1. Add to `prompt-registry.ts` (hardcoded fallback)
2. Add INSERT to seed migration
3. Run migration or INSERT directly

### Add new global setting
1. Add INSERT to `20251203140300_create_pipeline_global_settings.sql`
2. Update `GlobalSettings` type in `pipeline-admin.ts`
3. Update `globalSettingsSchema` in `pipeline-admin-schemas.ts`
4. Update `SettingsPanel` component form
5. Update `getGlobalSettings` and `updateGlobalSettings` procedures

### Add new model config phase
1. Add to `phase_name` CHECK constraint (new migration)
2. Add default config INSERT (new migration)
3. Update `PIPELINE_PHASES` constant if exists
4. Update `PipelineOverview` component if needed

### Enable database prompts for pipeline
1. Set `useDatabasePrompts: true` in pipeline_global_settings
2. Update stage executors to call prompt service instead of PROMPT_REGISTRY
3. Test each stage with DB prompts

---

## Testing Checklist

- [ ] Can view /admin/pipeline as superadmin
- [ ] Cannot view /admin/pipeline as admin or user (redirect)
- [ ] Overview tab shows stats and stages
- [ ] Models tab shows configs and allows edit
- [ ] Model history shows versions and allows revert
- [ ] Prompts tab shows all 13 prompts grouped by stage
- [ ] Prompt edit updates template and creates version
- [ ] Prompt history shows diff and allows revert
- [ ] Settings panel saves all fields
- [ ] Export downloads valid JSON
- [ ] Import validates and applies config
- [ ] Backup creation and restore works
