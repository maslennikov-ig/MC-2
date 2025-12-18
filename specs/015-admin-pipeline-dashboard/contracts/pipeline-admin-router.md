# tRPC Contract: Pipeline Admin Router

**Phase**: 1 - Design | **Date**: 2025-12-03 | **Spec**: [../spec.md](../spec.md)

## Overview

This contract defines the `pipelineAdminRouter` for managing the course generation pipeline configuration. All procedures require superadmin role.

**Location**: `packages/course-gen-platform/src/server/routers/pipeline-admin.ts`

---

## Router Definition

```typescript
import { router, superadminProcedure } from '../trpc';
import { z } from 'zod';
import {
  phaseNameSchema,
  updateModelConfigInputSchema,
  globalSettingsSchema,
  modelFilterSchema,
} from '@megacampus/shared-types';
import {
  promptStageSchema,
  updatePromptTemplateInputSchema,
} from '@megacampus/shared-types/prompt-template';

export const pipelineAdminRouter = router({
  // =========================================================================
  // Pipeline Overview
  // =========================================================================

  getStagesInfo: superadminProcedure
    .query(async ({ ctx }) => { /* ... */ }),

  getPipelineStats: superadminProcedure
    .input(z.object({
      periodDays: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => { /* ... */ }),

  // =========================================================================
  // Model Configuration
  // =========================================================================

  listModelConfigs: superadminProcedure
    .query(async ({ ctx }) => { /* ... */ }),

  updateModelConfig: superadminProcedure
    .input(updateModelConfigInputSchema)
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  getModelConfigHistory: superadminProcedure
    .input(z.object({
      configType: z.string(),
      phaseName: phaseNameSchema,
    }))
    .query(async ({ ctx, input }) => { /* ... */ }),

  revertModelConfigToVersion: superadminProcedure
    .input(z.object({
      configType: z.string(),
      phaseName: phaseNameSchema,
      targetVersion: z.number().min(1),
    }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  resetModelConfigToDefault: superadminProcedure
    .input(z.object({
      configType: z.string(),
      phaseName: phaseNameSchema,
    }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  // =========================================================================
  // OpenRouter Models
  // =========================================================================

  listOpenRouterModels: superadminProcedure
    .input(modelFilterSchema.optional())
    .query(async ({ ctx, input }) => { /* ... */ }),

  refreshOpenRouterModels: superadminProcedure
    .mutation(async ({ ctx }) => { /* ... */ }),

  // =========================================================================
  // Prompt Templates
  // =========================================================================

  listPromptTemplates: superadminProcedure
    .query(async ({ ctx }) => { /* ... */ }),

  getPromptTemplate: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => { /* ... */ }),

  updatePromptTemplate: superadminProcedure
    .input(updatePromptTemplateInputSchema)
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  getPromptHistory: superadminProcedure
    .input(z.object({
      stage: promptStageSchema,
      promptKey: z.string(),
    }))
    .query(async ({ ctx, input }) => { /* ... */ }),

  revertPromptToVersion: superadminProcedure
    .input(z.object({
      stage: promptStageSchema,
      promptKey: z.string(),
      targetVersion: z.number().min(1),
    }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  // =========================================================================
  // Global Settings
  // =========================================================================

  getGlobalSettings: superadminProcedure
    .query(async ({ ctx }) => { /* ... */ }),

  updateGlobalSettings: superadminProcedure
    .input(globalSettingsSchema.partial())
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  // =========================================================================
  // Export/Import
  // =========================================================================

  exportConfiguration: superadminProcedure
    .query(async ({ ctx }) => { /* ... */ }),

  validateImport: superadminProcedure
    .input(z.object({ configJson: z.string() }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  importConfiguration: superadminProcedure
    .input(z.object({
      configJson: z.string(),
      options: z.object({
        importModels: z.boolean().default(true),
        importPrompts: z.boolean().default(true),
        importSettings: z.boolean().default(true),
      }),
    }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  listBackups: superadminProcedure
    .query(async ({ ctx }) => { /* ... */ }),

  restoreFromBackup: superadminProcedure
    .input(z.object({ backupId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),
});
```

---

## Procedure Specifications

### Pipeline Overview

#### `getStagesInfo`

Returns information about all 6 pipeline stages.

**Input**: None

**Output**:
```typescript
{
  stages: PipelineStage[]; // Array of 6 stages
}
```

**Logic**:
1. Return static stage definitions with linked models/prompts
2. Query `generation_trace` for avg execution time and cost per stage
3. Determine stage status based on recent error rate

---

#### `getPipelineStats`

Returns aggregate statistics for the pipeline.

**Input**:
```typescript
{
  periodDays: number; // 1-365, default 30
}
```

**Output**:
```typescript
{
  totalGenerations: number;
  successCount: number;
  failureCount: number;
  totalCost: number;
  avgCompletionTime: number;
  periodStart: string; // ISO datetime
  periodEnd: string;   // ISO datetime
}
```

**Logic**:
1. Query `generation_trace` for the specified period
2. Aggregate counts, costs, and times
3. Calculate success/failure rates

---

### Model Configuration

#### `listModelConfigs`

Returns all active model configurations.

**Input**: None

**Output**:
```typescript
{
  configs: ModelConfig[];
}
```

**Logic**:
1. Query `llm_model_config` where `is_active = true`
2. Include user info for `created_by` via join

---

#### `updateModelConfig`

Updates a model configuration, creating a new version.

**Input**:
```typescript
{
  id: string;
  modelId?: string;
  fallbackModelId?: string | null;
  temperature?: number;
  maxTokens?: number;
}
```

**Output**:
```typescript
{
  config: ModelConfig;
  previousVersion: number;
}
```

**Logic**:
1. Validate model exists in OpenRouter (FR-010)
2. Start transaction
3. Set current version `is_active = false`
4. Insert new row with incremented version, `is_active = true`
5. Log to `admin_audit_logs`
6. Commit transaction

**Errors**:
- `MODEL_NOT_FOUND`: If modelId doesn't exist in OpenRouter
- `CONFIG_NOT_FOUND`: If id doesn't exist

---

#### `getModelConfigHistory`

Returns version history for a specific config.

**Input**:
```typescript
{
  configType: string;
  phaseName: PhaseName;
}
```

**Output**:
```typescript
{
  history: ModelConfigHistoryItem[];
}
```

**Logic**:
1. Query all versions ordered by version DESC
2. Join with users for author info

---

#### `revertModelConfigToVersion`

Reverts a config to a previous version (creates new version).

**Input**:
```typescript
{
  configType: string;
  phaseName: PhaseName;
  targetVersion: number;
}
```

**Output**:
```typescript
{
  config: ModelConfig;
  revertedFrom: number;
}
```

**Logic**:
1. Get target version data
2. Deactivate current version
3. Insert new version with target's data + incremented version number
4. Log to audit

---

#### `resetModelConfigToDefault`

Resets config to hardcoded defaults (creates new version).

**Input**:
```typescript
{
  configType: string;
  phaseName: PhaseName;
}
```

**Output**:
```typescript
{
  config: ModelConfig;
}
```

**Logic**:
1. Get defaults from `langchain-models.ts`
2. Create new version with default values
3. Log to audit

---

### OpenRouter Models

#### `listOpenRouterModels`

Returns cached OpenRouter models with optional filtering.

**Input** (optional):
```typescript
{
  providers?: string[];
  minContextLength?: number;
  maxContextLength?: number;
  maxPricePerMillion?: number;
  search?: string;
}
```

**Output**:
```typescript
{
  models: OpenRouterModel[];
  fromCache: boolean;
  cacheAge?: number;
  lastFetchedAt?: string;
}
```

**Logic**:
1. Call `getOpenRouterModels()` service
2. Apply filters if provided
3. Return with cache metadata

---

#### `refreshOpenRouterModels`

Force refresh of OpenRouter models cache.

**Input**: None

**Output**:
```typescript
{
  models: OpenRouterModel[];
  fetchedAt: string;
}
```

**Logic**:
1. Call `getOpenRouterModels(forceRefresh: true)`
2. Return fresh data

---

### Prompt Templates

#### `listPromptTemplates`

Returns all active prompts grouped by stage.

**Input**: None

**Output**:
```typescript
{
  promptsByStage: PromptsByStage;
}
```

**Logic**:
1. Query `prompt_templates` where `is_active = true`
2. Group by stage
3. If no prompts found, return hardcoded registry keys with empty templates

---

#### `getPromptTemplate`

Returns a single prompt template with full details.

**Input**:
```typescript
{
  id: string;
}
```

**Output**:
```typescript
{
  prompt: PromptTemplate;
}
```

---

#### `updatePromptTemplate`

Updates a prompt, creating a new version.

**Input**:
```typescript
{
  id: string;
  promptTemplate?: string;
  promptName?: string;
  promptDescription?: string | null;
  variables?: PromptVariable[];
}
```

**Output**:
```typescript
{
  prompt: PromptTemplate;
  previousVersion: number;
}
```

**Logic**:
1. Validate XML syntax if `promptTemplate` provided
2. Start transaction
3. Set current version `is_active = false`
4. Insert new version
5. Log to audit
6. Commit

**Errors**:
- `INVALID_XML`: If prompt template has XML syntax errors
- `PROMPT_NOT_FOUND`: If id doesn't exist

---

#### `getPromptHistory`

Returns version history for a prompt.

**Input**:
```typescript
{
  stage: PromptStage;
  promptKey: string;
}
```

**Output**:
```typescript
{
  history: PromptHistoryItem[];
}
```

---

#### `revertPromptToVersion`

Reverts prompt to a previous version.

**Input**:
```typescript
{
  stage: PromptStage;
  promptKey: string;
  targetVersion: number;
}
```

**Output**:
```typescript
{
  prompt: PromptTemplate;
  revertedFrom: number;
}
```

---

### Global Settings

#### `getGlobalSettings`

Returns current global settings.

**Input**: None

**Output**:
```typescript
{
  settings: GlobalSettings;
}
```

**Logic**:
1. Query settings from `llm_model_config` or dedicated storage
2. Merge with defaults for any missing values

---

#### `updateGlobalSettings`

Updates global settings (partial update).

**Input**: Partial<GlobalSettings>

**Output**:
```typescript
{
  settings: GlobalSettings;
}
```

**Logic**:
1. Merge with existing settings
2. Validate all values
3. Save
4. Log to audit

---

### Export/Import

#### `exportConfiguration`

Exports all configurations as JSON.

**Input**: None

**Output**:
```typescript
{
  export: ConfigExport;
  downloadUrl?: string; // Optional signed URL
}
```

**Logic**:
1. Query all active model configs
2. Query all active prompt templates
3. Get current global settings
4. Package with metadata (version, date, author)

---

#### `validateImport`

Validates import JSON and returns preview of changes.

**Input**:
```typescript
{
  configJson: string;
}
```

**Output**:
```typescript
{
  isValid: boolean;
  preview?: ImportPreview;
  errors?: string[];
}
```

**Logic**:
1. Parse JSON
2. Validate schema
3. Compare with current state
4. Return change preview

---

#### `importConfiguration`

Applies imported configuration.

**Input**:
```typescript
{
  configJson: string;
  options: {
    importModels: boolean;
    importPrompts: boolean;
    importSettings: boolean;
  };
}
```

**Output**:
```typescript
{
  success: boolean;
  backupId: string;
  appliedChanges: ImportPreview;
}
```

**Logic**:
1. Create auto backup (FR-031)
2. Validate JSON
3. Start transaction
4. Apply model configs (if enabled)
5. Apply prompt templates (if enabled)
6. Apply settings (if enabled)
7. Commit
8. Log to audit

---

#### `listBackups`

Returns list of configuration backups.

**Input**: None

**Output**:
```typescript
{
  backups: ConfigBackup[];
}
```

**Logic**:
1. Query `config_backups` ordered by `created_at DESC`
2. Join with users for author info
3. Return max 20 (enforced by DB trigger)

---

#### `restoreFromBackup`

Restores configuration from a backup.

**Input**:
```typescript
{
  backupId: string;
}
```

**Output**:
```typescript
{
  success: boolean;
  restoredFrom: string; // backup name
}
```

**Logic**:
1. Create new auto backup before restore
2. Get backup data
3. Apply as import (all options true)
4. Log to audit

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | User not authenticated |
| `FORBIDDEN` | 403 | User is not superadmin |
| `MODEL_NOT_FOUND` | 404 | OpenRouter model doesn't exist |
| `CONFIG_NOT_FOUND` | 404 | Configuration doesn't exist |
| `PROMPT_NOT_FOUND` | 404 | Prompt template doesn't exist |
| `BACKUP_NOT_FOUND` | 404 | Backup doesn't exist |
| `INVALID_XML` | 400 | Prompt template has XML syntax errors |
| `INVALID_IMPORT` | 400 | Import JSON validation failed |
| `VERSION_CONFLICT` | 409 | Concurrent edit detected |

---

## Audit Logging

All mutations log to `admin_audit_logs` with:

```typescript
{
  action: 'update_model_config' | 'revert_model_config' | 'reset_model_config' |
          'update_prompt' | 'revert_prompt' |
          'update_settings' | 'import_config' | 'restore_backup',
  entity_type: 'model_config' | 'prompt_template' | 'global_settings' | 'config_backup',
  entity_id: string,
  changes: {
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  },
  user_id: string,
}
```
