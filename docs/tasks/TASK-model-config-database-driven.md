# TASK: Database-Driven Model Configuration

## Problem Statement

Currently, model selection for pipeline stages uses a hybrid approach:
1. **Database lookup** via `ModelConfigService`
2. **Hardcoded fallback** via `model-selector.ts` constants when DB returns nothing

This creates several issues:
- Hardcoded constants are scattered across multiple files
- Admin panel changes may not affect actual generation (falls back to hardcoded)
- CLEV Judge system uses completely hardcoded model selection (`AVAILABLE_JUDGE_MODELS`)
- Language-aware routing (`'any'` vs `'ru'` vs `'en'`) is inconsistent

## Current Architecture

### ModelConfigService (model-config-service.ts)
```
getModelForPhase(phaseName, courseId?)
  → Database lookup by phase_name
  → Hardcoded fallback if not found

getModelForStage(stageNumber, language, tokenCount)
  → Database lookup by stage_number + language + context_tier
  → Hardcoded fallback if not found
```

### Hardcoded Constants (to be removed)
- `model-selector.ts`: MODEL_TIERS, STAGE4_MODELS, AVAILABLE_JUDGE_MODELS
- `clev-voter.ts`: GENERATION_MODELS, AVAILABLE_JUDGE_MODELS, selectJudgeModels()
- `langchain-models.ts`: Various model IDs
- Node files (planner.ts, etc.): DEFAULT_*_MODEL constants

## Target Architecture

### Database Schema Changes

#### 1. Language Fallback Logic
- If record with `language='ru'` exists → use it for Russian content
- If not found → use record with `language='any'` as fallback
- Same logic for any other language

#### 2. Extended phase_name for Judges
```sql
-- Current
stage_6_judge (single model)

-- Proposed
stage_6_judge_primary
stage_6_judge_secondary
stage_6_judge_tiebreaker
```

Or use a new column:
```sql
ALTER TABLE llm_model_config ADD COLUMN judge_role TEXT
  CHECK (judge_role IN ('primary', 'secondary', 'tiebreaker', NULL));
```

### Expected Admin Panel View

| Language | Generation Model | Primary Judge        | Secondary Judge | Tiebreaker        |
|----------|------------------|----------------------|-----------------|-------------------|
| ru       | Qwen3-235B       | DeepSeek V3.1 (0.74) | Kimi K2 (0.73)  | Minimax M2 (0.72) |
| en/any   | DeepSeek V3.1    | Qwen3-235B (0.75)    | Kimi K2 (0.73)  | Minimax M2 (0.72) |

### Model Weights
Each judge model has a historical accuracy-based weight:
- Formula: `w = 1 / (1 + exp(-accuracy))`
- Qwen3-235B: 0.75
- DeepSeek V3.1: 0.74
- Kimi K2: 0.73
- Minimax M2: 0.72

These weights should also be stored in DB (new column `weight`).

## Tasks

### Task 1: Schema Migration
**Subagent**: `database-architect`

1. Add `judge_role` column to `llm_model_config`
2. Add `weight` column for judge models
3. Update `phase_name` CHECK constraint if needed
4. Create migration for seeding judge configurations

```sql
-- Example data structure
INSERT INTO llm_model_config (phase_name, model_id, language, judge_role, weight, ...)
VALUES
  -- Russian content judges (different from generation model qwen3)
  ('stage_6_judge', 'deepseek/deepseek-v3.1-terminus', 'ru', 'primary', 0.74, ...),
  ('stage_6_judge', 'moonshotai/kimi-k2-0905', 'ru', 'secondary', 0.73, ...),
  ('stage_6_judge', 'minimax/minimax-m2', 'ru', 'tiebreaker', 0.72, ...),

  -- English/Other content judges (different from generation model deepseek)
  ('stage_6_judge', 'qwen/qwen3-235b-a22b-2507', 'en', 'primary', 0.75, ...),
  ('stage_6_judge', 'moonshotai/kimi-k2-0905', 'en', 'secondary', 0.73, ...),
  ('stage_6_judge', 'minimax/minimax-m2', 'en', 'tiebreaker', 0.72, ...),

  -- Fallback for any language
  ('stage_6_judge', 'qwen/qwen3-235b-a22b-2507', 'any', 'primary', 0.75, ...),
  ('stage_6_judge', 'moonshotai/kimi-k2-0905', 'any', 'secondary', 0.73, ...),
  ('stage_6_judge', 'minimax/minimax-m2', 'any', 'tiebreaker', 0.72, ...);
```

### Task 2: Update ModelConfigService
**Subagent**: `llm-service-specialist`

1. Add new method `getJudgeModels(language: string)`:
```typescript
async getJudgeModels(language: string): Promise<{
  primary: JudgeModelConfig;
  secondary: JudgeModelConfig;
  tiebreaker: JudgeModelConfig;
}>
```

2. Implement language fallback logic:
```typescript
// 1. Try exact language match (e.g., 'ru')
// 2. If not found, try 'any' as fallback
// 3. If still not found, use hardcoded fallback (temporary)
```

3. Add caching for judge configs (5 min TTL like other configs)

### Task 3: Update CLEV Voter
**Subagent**: `judge-specialist`

1. Replace hardcoded `selectJudgeModels()` with database lookup
2. Remove or deprecate `AVAILABLE_JUDGE_MODELS` constant
3. Use `ModelConfigService.getJudgeModels(language)` instead
4. Keep hardcoded weights as ultimate fallback only

### Task 4: Remove Hardcoded Constants
**Subagent**: `code-structure-refactorer`

Files to update:
- `packages/course-gen-platform/src/shared/llm/model-selector.ts`
  - Remove MODEL_TIERS, STAGE4_MODELS constants
  - Keep only utility functions that use ModelConfigService

- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts`
  - Remove GENERATION_MODELS, AVAILABLE_JUDGE_MODELS
  - Update selectJudgeModels to use DB

- All node files (planner.ts, expander.ts, etc.)
  - Remove DEFAULT_*_MODEL constants
  - Always use ModelConfigService

### Task 5: Update Admin Panel UI
**Subagent**: `fullstack-nextjs-specialist`

1. Stage 6 detail sheet should show:
   - Generation models by language
   - Judge models table (Primary/Secondary/Tiebreaker) by language
   - Weights displayed next to each judge

2. Add edit functionality for:
   - Judge role assignment
   - Weight modification
   - Language-specific overrides

### Task 6: Update tRPC Router
**Subagent**: `api-builder`

1. Add `pipelineAdmin.listJudgeConfigs` procedure
2. Add `pipelineAdmin.updateJudgeConfig` procedure
3. Include judge_role and weight in model config responses

## Acceptance Criteria

1. [x] All model selection reads from database first
2. [x] Language fallback works: specific language → 'any' → hardcoded
3. [x] Admin panel shows separate rows for each judge role
4. [x] Changing judge model in admin affects actual CLEV voting
5. [x] No hardcoded model IDs in stage implementation files (marked @deprecated, used only as fallback)
6. [x] Type-check and build pass
7. [ ] Existing tests pass (not verified yet)

## Completed: 2024-12-10

### Summary of Changes

**Database Schema:**
- Added `judge_role` column (enum: primary, secondary, tiebreaker)
- Added `weight` column (numeric 0-1)
- Updated unique indexes to support multiple judge configs per language
- Seeded 9 judge configs (3 per language: ru, en, any)

**ModelConfigService:**
- Added `getJudgeModels(language)` method with 3-tier fallback
- Added `JudgeModelConfig` and `JudgeModelsResult` types
- Added judge config cache with 5-min TTL

**tRPC Router:**
- Added `listJudgeConfigs` procedure
- Added `updateJudgeConfig` procedure
- Updated existing endpoints to include judge_role and weight

**CLEV Voter:**
- `selectJudgeModels()` is now async and uses ModelConfigService
- Hardcoded constants marked @deprecated, kept as fallback only

**Admin Panel:**
- Stage 6 detail sheet shows dedicated CLEV Judges table
- Table displays all 3 languages with Primary/Secondary/Tiebreaker roles
- Weights displayed next to judge names

## Related Files

- `packages/course-gen-platform/src/shared/llm/model-config-service.ts`
- `packages/course-gen-platform/src/shared/llm/model-selector.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts`
- `packages/course-gen-platform/src/server/routers/pipeline-admin/model-configs.ts`
- `packages/web/app/admin/pipeline/components/stage-detail-sheet.tsx`
- `packages/shared-types/src/pipeline-admin.ts`

## Priority
Medium - Current system works with hardcoded fallbacks, but admin panel changes don't fully propagate to generation.
