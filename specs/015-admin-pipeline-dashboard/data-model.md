# Data Model: Admin Pipeline Dashboard

**Phase**: 1 - Design | **Date**: 2025-12-03 | **Spec**: [spec.md](./spec.md)

## Overview

This document defines the database schema and TypeScript types for the Admin Pipeline Dashboard feature.

---

## Database Schema

### 1. Extended Table: `llm_model_config`

Existing table with new versioning columns.

```sql
-- Migration: extend_llm_model_config.sql

-- Add versioning columns
ALTER TABLE llm_model_config ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE llm_model_config ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE llm_model_config ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);

-- Update phase_name constraint for all 12 phases
ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;
ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check
  CHECK (phase_name = ANY (ARRAY[
    'phase_1_classification',
    'phase_2_scope',
    'phase_3_expert',
    'phase_4_synthesis',
    'phase_6_rag_planning',
    'emergency',
    'quality_fallback',
    'stage_3_classification',
    'stage_5_metadata',
    'stage_5_sections',
    'stage_6_judge',
    'stage_6_refinement'
  ]::text[]));

-- Unique constraint for active configs (one active per type+phase+course)
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_model_config_active
  ON llm_model_config(config_type, phase_name, course_id)
  WHERE is_active = true;

-- Index for version history queries
CREATE INDEX IF NOT EXISTS idx_llm_model_config_history
  ON llm_model_config(config_type, phase_name, course_id, version DESC);
```

### 2. New Table: `prompt_templates`

Stores versioned prompt templates with fallback support.

```sql
-- Migration: create_prompt_templates.sql

CREATE TABLE prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  stage text NOT NULL CHECK (stage IN ('stage_3', 'stage_4', 'stage_5', 'stage_6')),
  prompt_key text NOT NULL,
  prompt_name text NOT NULL,
  prompt_description text,

  -- Content
  prompt_template text NOT NULL,
  variables jsonb DEFAULT '[]'::jsonb,

  -- Versioning
  version integer DEFAULT 1,
  is_active boolean DEFAULT true,

  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),

  -- Constraints
  CONSTRAINT prompt_templates_stage_key_version_unique UNIQUE(stage, prompt_key, version)
);

-- Only one active version per stage+key
CREATE UNIQUE INDEX idx_prompt_templates_active
  ON prompt_templates(stage, prompt_key)
  WHERE is_active = true;

-- Index for listing by stage
CREATE INDEX idx_prompt_templates_stage ON prompt_templates(stage);

-- Index for history queries
CREATE INDEX idx_prompt_templates_history
  ON prompt_templates(stage, prompt_key, version DESC);

-- RLS
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage prompt_templates" ON prompt_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_prompt_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_prompt_templates_updated_at();
```

### 3. New Table: `config_backups`

Stores configuration snapshots for export/import and disaster recovery.

```sql
-- Migration: create_config_backups.sql

CREATE TABLE config_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  backup_name text NOT NULL,
  backup_type text NOT NULL CHECK (backup_type IN ('manual', 'auto_pre_import', 'scheduled')),
  description text,

  -- Content
  backup_data jsonb NOT NULL,

  -- Audit
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- Index for listing backups
CREATE INDEX idx_config_backups_created_at ON config_backups(created_at DESC);

-- RLS
ALTER TABLE config_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage config_backups" ON config_backups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Cleanup trigger: keep only last 20 backups (FR-034)
CREATE OR REPLACE FUNCTION cleanup_old_backups()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM config_backups
  WHERE id IN (
    SELECT id
    FROM config_backups
    ORDER BY created_at DESC
    OFFSET 20
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_old_backups
  AFTER INSERT ON config_backups
  FOR EACH STATEMENT EXECUTE FUNCTION cleanup_old_backups();
```

---

## TypeScript Types

### Location: `packages/shared-types/src/pipeline-admin.ts`

```typescript
import { z } from 'zod';

// =============================================================================
// Phase Names (FR-009)
// =============================================================================

export const phaseNameSchema = z.enum([
  'phase_1_classification',
  'phase_2_scope',
  'phase_3_expert',
  'phase_4_synthesis',
  'phase_6_rag_planning',
  'emergency',
  'quality_fallback',
  'stage_3_classification',
  'stage_5_metadata',
  'stage_5_sections',
  'stage_6_judge',
  'stage_6_refinement',
]);

export type PhaseName = z.infer<typeof phaseNameSchema>;

// =============================================================================
// Pipeline Stages
// =============================================================================

export const pipelineStageSchema = z.object({
  number: z.number().min(1).max(6),
  name: z.string(),
  description: z.string(),
  status: z.enum(['active', 'inactive', 'error']),
  linkedModels: z.array(phaseNameSchema),
  linkedPrompts: z.array(z.string()),
  avgExecutionTime: z.number().nullable(), // milliseconds
  avgCost: z.number().nullable(), // USD
});

export type PipelineStage = z.infer<typeof pipelineStageSchema>;

// =============================================================================
// Pipeline Statistics (FR-006)
// =============================================================================

export const pipelineStatsSchema = z.object({
  totalGenerations: z.number(),
  successCount: z.number(),
  failureCount: z.number(),
  totalCost: z.number(), // USD
  avgCompletionTime: z.number(), // milliseconds
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

export type PipelineStats = z.infer<typeof pipelineStatsSchema>;

// =============================================================================
// Model Configuration (FR-007, FR-008)
// =============================================================================

export const modelConfigSchema = z.object({
  id: z.string().uuid(),
  configType: z.string(),
  phaseName: phaseNameSchema,
  courseId: z.string().uuid().nullable(),
  modelId: z.string(),
  fallbackModelId: z.string().nullable(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(128000),
  version: z.number(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;

export const updateModelConfigInputSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().optional(),
  fallbackModelId: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(128000).optional(),
});

export type UpdateModelConfigInput = z.infer<typeof updateModelConfigInputSchema>;

// =============================================================================
// Model Config History
// =============================================================================

export const modelConfigHistoryItemSchema = z.object({
  id: z.string().uuid(),
  version: z.number(),
  modelId: z.string(),
  fallbackModelId: z.string().nullable(),
  temperature: z.number(),
  maxTokens: z.number(),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
  createdByEmail: z.string().nullable(),
});

export type ModelConfigHistoryItem = z.infer<typeof modelConfigHistoryItemSchema>;

// =============================================================================
// Global Settings (FR-026, FR-027)
// =============================================================================

export const globalSettingsSchema = z.object({
  ragTokenBudget: z.number().min(1000).max(100000),
  qualityThreshold: z.number().min(0).max(1),
  retryAttempts: z.number().min(0).max(5),
  timeoutPerPhase: z.number().min(10000).max(600000), // ms
  featureFlags: z.object({
    useDatabasePrompts: z.boolean(),
    enableQualityValidation: z.boolean(),
    enableCostTracking: z.boolean(),
  }),
});

export type GlobalSettings = z.infer<typeof globalSettingsSchema>;

// =============================================================================
// Export/Import (FR-028 - FR-033)
// =============================================================================

export const configExportSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string().datetime(),
  exportedBy: z.string().uuid(),
  platformVersion: z.string(), // e.g., "0.22.2" from package.json
  data: z.object({
    modelConfigs: z.array(modelConfigSchema),
    promptTemplates: z.array(z.any()), // PromptTemplate from prompt-template.ts
    globalSettings: globalSettingsSchema,
  }),
});

export type ConfigExport = z.infer<typeof configExportSchema>;

export const configBackupSchema = z.object({
  id: z.string().uuid(),
  backupName: z.string(),
  backupType: z.enum(['manual', 'auto_pre_import', 'scheduled']),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
  createdByEmail: z.string().nullable(),
});

export type ConfigBackup = z.infer<typeof configBackupSchema>;

export const importPreviewSchema = z.object({
  modelConfigChanges: z.array(z.object({
    phaseName: phaseNameSchema,
    currentModelId: z.string().nullable(),
    newModelId: z.string(),
    changeType: z.enum(['add', 'update', 'unchanged']),
  })),
  promptTemplateChanges: z.array(z.object({
    stage: z.string(),
    promptKey: z.string(),
    changeType: z.enum(['add', 'update', 'unchanged']),
  })),
  settingsChanges: z.array(z.object({
    key: z.string(),
    currentValue: z.unknown(),
    newValue: z.unknown(),
  })),
});

export type ImportPreview = z.infer<typeof importPreviewSchema>;
```

### Location: `packages/shared-types/src/prompt-template.ts`

```typescript
import { z } from 'zod';

// =============================================================================
// Prompt Stages
// =============================================================================

export const promptStageSchema = z.enum(['stage_3', 'stage_4', 'stage_5', 'stage_6']);

export type PromptStage = z.infer<typeof promptStageSchema>;

// =============================================================================
// Prompt Variables
// =============================================================================

export const promptVariableSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean(),
  example: z.string().optional(),
});

export type PromptVariable = z.infer<typeof promptVariableSchema>;

// =============================================================================
// Prompt Template (FR-018)
// =============================================================================

export const promptTemplateSchema = z.object({
  id: z.string().uuid(),
  stage: promptStageSchema,
  promptKey: z.string(),
  promptName: z.string(),
  promptDescription: z.string().nullable(),
  promptTemplate: z.string(),
  variables: z.array(promptVariableSchema),
  version: z.number(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
});

export type PromptTemplate = z.infer<typeof promptTemplateSchema>;

// =============================================================================
// Prompt Template Input Schemas
// =============================================================================

export const updatePromptTemplateInputSchema = z.object({
  id: z.string().uuid(),
  promptTemplate: z.string().min(1).optional(),
  promptName: z.string().min(1).optional(),
  promptDescription: z.string().nullable().optional(),
  variables: z.array(promptVariableSchema).optional(),
});

export type UpdatePromptTemplateInput = z.infer<typeof updatePromptTemplateInputSchema>;

// =============================================================================
// Prompt History
// =============================================================================

export const promptHistoryItemSchema = z.object({
  id: z.string().uuid(),
  version: z.number(),
  promptName: z.string(),
  promptTemplate: z.string(),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
  createdByEmail: z.string().nullable(),
});

export type PromptHistoryItem = z.infer<typeof promptHistoryItemSchema>;

// =============================================================================
// Grouped Prompts (for UI display)
// =============================================================================

export const promptsByStageSchema = z.record(
  promptStageSchema,
  z.array(promptTemplateSchema)
);

export type PromptsByStage = z.infer<typeof promptsByStageSchema>;
```

### Location: `packages/shared-types/src/openrouter-models.ts`

```typescript
import { z } from 'zod';

// =============================================================================
// OpenRouter Model (FR-014, FR-016)
// =============================================================================

export const openRouterModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  contextLength: z.number(),
  architecture: z.object({
    modality: z.string(),
    tokenizer: z.string(),
    instructType: z.string().nullable(),
  }),
  pricing: z.object({
    prompt: z.number(), // USD per token
    completion: z.number(), // USD per token
    image: z.number().optional(),
    request: z.number().optional(),
  }),
  provider: z.string(), // Extracted from id (e.g., "openai" from "openai/gpt-4")
});

export type OpenRouterModel = z.infer<typeof openRouterModelSchema>;

// =============================================================================
// Model List Response
// =============================================================================

export const openRouterModelsResponseSchema = z.object({
  models: z.array(openRouterModelSchema),
  fromCache: z.boolean(),
  cacheAge: z.number().optional(), // milliseconds since cache
  lastFetchedAt: z.string().datetime().optional(),
});

export type OpenRouterModelsResponse = z.infer<typeof openRouterModelsResponseSchema>;

// =============================================================================
// Model Filter (FR-017)
// =============================================================================

export const modelFilterSchema = z.object({
  providers: z.array(z.string()).optional(),
  minContextLength: z.number().optional(),
  maxContextLength: z.number().optional(),
  maxPricePerMillion: z.number().optional(), // USD per 1M tokens
  search: z.string().optional(),
});

export type ModelFilter = z.infer<typeof modelFilterSchema>;
```

---

## Entity Relationships

```
┌─────────────────────┐
│   users (existing)  │
│   - id              │
│   - role            │
└─────────┬───────────┘
          │ created_by
          ▼
┌─────────────────────┐     ┌─────────────────────┐
│  llm_model_config   │     │  prompt_templates   │
│  (extended)         │     │  (new)              │
│  - id               │     │  - id               │
│  - config_type      │     │  - stage            │
│  - phase_name       │     │  - prompt_key       │
│  - model_id         │     │  - prompt_template  │
│  - version          │     │  - version          │
│  - is_active        │     │  - is_active        │
│  - created_by ──────┼─┐   │  - created_by ──────┼──┐
└─────────────────────┘ │   └─────────────────────┘  │
                        │                            │
          ┌─────────────┴────────────────────────────┘
          ▼
┌─────────────────────┐     ┌─────────────────────┐
│  config_backups     │     │  admin_audit_logs   │
│  (new)              │     │  (existing)         │
│  - id               │     │  - action           │
│  - backup_name      │     │  - entity_type      │
│  - backup_type      │     │  - entity_id        │
│  - backup_data      │     │  - changes          │
│  - created_by ──────┼──▶  │  - user_id          │
└─────────────────────┘     └─────────────────────┘
```

---

## Index Strategy

| Table | Index | Purpose |
|-------|-------|---------|
| llm_model_config | idx_llm_model_config_active | Ensure single active config per type/phase |
| llm_model_config | idx_llm_model_config_history | Fast version history queries |
| prompt_templates | idx_prompt_templates_active | Ensure single active prompt per stage/key |
| prompt_templates | idx_prompt_templates_stage | List prompts by stage |
| prompt_templates | idx_prompt_templates_history | Fast version history queries |
| config_backups | idx_config_backups_created_at | List backups in chronological order |

---

## Data Migration Notes

### Seed Data Required

1. **Prompt Templates Seed** (FR-019): Migrate 18 existing prompts from code to database
   - Source: Hardcoded prompts in various stage handlers
   - Target: `prompt_templates` table
   - Strategy: One-time seed migration with fallback to code if DB unavailable

2. **Model Config Versioning**: Existing configs get `version=1`, `is_active=true`

### Fallback Behavior

- If `prompt_templates` lookup fails → Use hardcoded prompt from `prompt-registry.ts`
- If `llm_model_config` lookup fails → Use hardcoded defaults from `langchain-models.ts`
